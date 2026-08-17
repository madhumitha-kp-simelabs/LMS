import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { assertTopicAccess } from '../courses/courses.service.js';
import { extractText, uploadDocument } from '../../lib/document.js';
import { parseQuestions } from './question-parser.js';
import { questionSchema, updateQuizSchema } from './quizzes.schema.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('trainer', 'admin'));

/** A question is single-answer or multi-answer purely by how many options are correct. */
function deriveType(options) {
  return options.filter((o) => o.isCorrect).length > 1 ? 'mcq_multi' : 'mcq_single';
}

async function assertQuizAccess(user, quizId) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new AppError(404, 'Quiz not found');
  await assertTopicAccess(user, quiz.topicId);
  return quiz;
}

/**
 * Editing a question after candidates have answered it would silently rewrite
 * history — their stored answers point at option rows this would delete, and
 * their scores were computed against the old wording.
 */
async function assertNotAnswered(questionId) {
  const answered = await prisma.answer.count({ where: { questionId } });
  if (answered > 0) {
    throw new AppError(
      409,
      'Candidates have already answered this question, so it can no longer be changed. Delete the attempts first, or add a new question instead.',
    );
  }
}

const questionShape = {
  include: { options: { orderBy: { position: 'asc' } } },
};

/** Fetch the topic's quiz, creating an empty one on first use. */
router.post(
  '/topics/:topicId',
  handle(async (req, res) => {
    const topic = await assertTopicAccess(req.user, req.params.topicId);

    const existing = await prisma.quiz.findUnique({ where: { topicId: topic.id } });
    if (existing) return res.json({ quiz: existing });

    const quiz = await prisma.quiz.create({
      data: { topicId: topic.id, title: `${topic.title} — Quiz` },
    });
    res.status(201).json({ quiz });
  }),
);

router.get(
  '/:quizId',
  handle(async (req, res) => {
    await assertQuizAccess(req.user, req.params.quizId);

    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.quizId },
      include: {
        questions: { orderBy: { position: 'asc' }, ...questionShape },
        _count: { select: { attempts: true } },
      },
    });
    res.json({ quiz });
  }),
);

router.patch(
  '/:quizId',
  handle(async (req, res) => {
    await assertQuizAccess(req.user, req.params.quizId);
    const input = updateQuizSchema.parse(req.body);

    if (input.isPublished) {
      const questions = await prisma.question.count({ where: { quizId: req.params.quizId } });
      if (questions === 0) {
        throw new AppError(422, 'Add at least one question before publishing this quiz');
      }
    }

    const quiz = await prisma.quiz.update({ where: { id: req.params.quizId }, data: input });
    res.json({ quiz });
  }),
);

router.post(
  '/:quizId/questions',
  handle(async (req, res) => {
    await assertQuizAccess(req.user, req.params.quizId);
    const input = questionSchema.parse(req.body);

    const last = await prisma.question.findFirst({
      where: { quizId: req.params.quizId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const question = await prisma.question.create({
      data: {
        quizId: req.params.quizId,
        prompt: input.prompt,
        marks: input.marks,
        type: deriveType(input.options),
        position: (last?.position ?? 0) + 1,
        options: {
          create: input.options.map((o, index) => ({
            label: o.label,
            isCorrect: o.isCorrect,
            position: index + 1,
          })),
        },
      },
      ...questionShape,
    });

    res.status(201).json({ question });
  }),
);

router.patch(
  '/questions/:questionId',
  handle(async (req, res) => {
    const existing = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!existing) throw new AppError(404, 'Question not found');

    await assertQuizAccess(req.user, existing.quizId);
    await assertNotAnswered(existing.id);

    const input = questionSchema.parse(req.body);

    // Options are replaced wholesale rather than diffed — simpler, and safe
    // because nothing can reference them yet (assertNotAnswered above).
    const question = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: existing.id } });
      return tx.question.update({
        where: { id: existing.id },
        data: {
          prompt: input.prompt,
          marks: input.marks,
          type: deriveType(input.options),
          options: {
            create: input.options.map((o, index) => ({
              label: o.label,
              isCorrect: o.isCorrect,
              position: index + 1,
            })),
          },
        },
        ...questionShape,
      });
    });

    res.json({ question });
  }),
);

/**
 * Reads a PDF/Word document and returns the questions it contains — WITHOUT
 * saving anything. The trainer reviews the parse and then posts back the ones
 * they want via /questions/bulk, so a bad parse never silently becomes content.
 */
router.post(
  '/:quizId/import',
  (req, res, next) =>
    uploadDocument(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'Document is larger than the 10 MB limit'));
      }
      next(err);
    }),
  handle(async (req, res) => {
    await assertQuizAccess(req.user, req.params.quizId);
    if (!req.file) throw new AppError(400, 'No document was uploaded');

    let text;
    try {
      text = await extractText(req.file);
    } catch (err) {
      // Specific diagnoses (password-protected, etc.) come through as they are.
      if (err instanceof AppError) throw err;
      console.error('Document extraction failed:', err);
      throw new AppError(422, 'That file could not be read. It may be corrupt or an unsupported format.');
    }

    // A scanned PDF is images, not text — worth saying so explicitly rather
    // than reporting "0 questions found".
    if (text.trim().length === 0) {
      throw new AppError(
        422,
        'No text was found. If this is a scanned PDF, it contains images rather than text and cannot be read.',
      );
    }

    const questions = parseQuestions(text);

    res.json({
      questions,
      summary: {
        found: questions.length,
        importable: questions.filter((q) => q.issues.length === 0).length,
        sourceFilename: req.file.originalname,
      },
    });
  }),
);

/** Creates several reviewed questions at once, appended after the existing ones. */
router.post(
  '/:quizId/questions/bulk',
  handle(async (req, res) => {
    await assertQuizAccess(req.user, req.params.quizId);

    const input = z
      .object({ questions: z.array(questionSchema).min(1, 'Select at least one question') })
      .parse(req.body);

    const last = await prisma.question.findFirst({
      where: { quizId: req.params.quizId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let position = last?.position ?? 0;

    const created = await prisma.$transaction(
      input.questions.map((question) => {
        position += 1;
        return prisma.question.create({
          data: {
            quizId: req.params.quizId,
            prompt: question.prompt,
            marks: question.marks,
            type: deriveType(question.options),
            position,
            options: {
              create: question.options.map((o, index) => ({
                label: o.label,
                isCorrect: o.isCorrect,
                position: index + 1,
              })),
            },
          },
          ...questionShape,
        });
      }),
    );

    res.status(201).json({ created: created.length, questions: created });
  }),
);

router.delete(
  '/questions/:questionId',
  handle(async (req, res) => {
    const existing = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!existing) throw new AppError(404, 'Question not found');

    await assertQuizAccess(req.user, existing.quizId);
    await assertNotAnswered(existing.id);

    await prisma.question.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

export default router;
