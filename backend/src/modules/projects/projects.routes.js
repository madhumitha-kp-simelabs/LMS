import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { openFile } from '../../lib/storage.js';
import {
  allotProjectSchema,
  createProjectSchema,
  evaluationSchema,
  updateProjectSchema,
} from './projects.schema.js';
import * as projects from './projects.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Setting course work and handing it out are both staff territory: the lead
// does both on the course they run. The admin router keeps its own copies of
// the allotment routes, which reach across every course. Candidates see their
// own copies on /api/learn.
router.use(requireAuth);

/** Staff-only from here down; the file route below opts back out. */
const staffOnly = requireRole('trainer', 'lead', 'admin');

/**
 * Every project in the organisation. Must be declared before /:projectId, or
 * Express reads "all" as a project id.
 */
router.get(
  '/all',
  staffOnly,
  handle(async (req, res) => {
    res.json({ projects: await projects.listEverything(req.user) });
  }),
);

/**
 * Every project on a course, with who holds each one — and who else it could be
 * given to, so the lead's screen can hand one out without a second request.
 */
router.get(
  '/courses/:courseId',
  staffOnly,
  handle(async (req, res) => {
    const [list, candidates] = await Promise.all([
      projects.listForCourse(req.user, req.params.courseId),
      projects.allottableFor(req.user, req.params.courseId),
    ]);
    res.json({ projects: list, candidates });
  }),
);

/**
 * Hands a project to candidates on this course. The lead may do this for their
 * own course's enrolled candidates; an admin may do it anywhere, from the admin
 * router. The service decides which of those the caller is.
 */
router.post(
  '/:projectId/allotments',
  staffOnly,
  handle(async (req, res) => {
    const { candidateIds } = allotProjectSchema.parse(req.body);
    res.status(201).json(await projects.allot(req.user, req.params.projectId, candidateIds));
  }),
);

/** Takes it back off one candidate, losing whatever they handed in with it. */
router.delete(
  '/:projectId/allotments/:userId',
  staffOnly,
  handle(async (req, res) => {
    await projects.withdraw(req.user, req.params.projectId, req.params.userId);
    res.status(204).end();
  }),
);

/**
 * Everything handed in on the course, newest queue first — the lead's review
 * list. Readable by the whole team, as the progress screens are.
 */
router.get(
  '/courses/:courseId/submissions',
  staffOnly,
  handle(async (req, res) => {
    res.json({ submissions: await projects.listSubmissions(req.user, req.params.courseId) });
  }),
);

router.post(
  '/courses/:courseId',
  staffOnly,
  handle(async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    res.status(201).json({ project: await projects.createProject(req.user, req.params.courseId, input) });
  }),
);

router.patch(
  '/:projectId',
  staffOnly,
  handle(async (req, res) => {
    const input = updateProjectSchema.parse(req.body);
    res.json({ project: await projects.updateProject(req.user, req.params.projectId, input) });
  }),
);

/**
 * The file one candidate handed in. Open to anyone on the course — the team can
 * see the work as they can see the progress — and to the candidate themselves,
 * which is why the check lives in the service rather than on the router.
 */
router.get(
  '/:projectId/work/:userId/file',
  handle(async (req, res) => {
    const allotment = await projects.fileFor(req.user, req.params.projectId, req.params.userId);

    const filename = allotment.originalFilename ?? 'download';
    res.setHeader('Content-Type', allotment.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

    const stream = await openFile(allotment.fileUrl);
    stream.pipe(res);
  }),
);

/**
 * The lead's mark on one candidate's work. PUT rather than PATCH: a mark is
 * replaced whole, and sending half of one should not leave the other half of a
 * previous judgement standing beside it.
 */
router.put(
  '/:projectId/work/:userId/evaluation',
  staffOnly,
  handle(async (req, res) => {
    const input = evaluationSchema.parse(req.body);
    const allotment = await projects.evaluate(
      req.user,
      req.params.projectId,
      req.params.userId,
      input,
    );
    res.json({
      evaluation: {
        score: allotment.score,
        feedback: allotment.feedback,
        evaluatedAt: allotment.evaluatedAt,
        evaluatedBy: allotment.evaluator,
      },
    });
  }),
);

/** Taking the mark back off, leaving the work unreviewed. */
router.delete(
  '/:projectId/work/:userId/evaluation',
  staffOnly,
  handle(async (req, res) => {
    await projects.clearEvaluation(req.user, req.params.projectId, req.params.userId);
    res.status(204).end();
  }),
);

/** What deleting would take with it, for the screen to warn about first. */
router.get(
  '/:projectId/impact',
  staffOnly,
  handle(async (req, res) => {
    res.json(await projects.deletionImpact(req.user, req.params.projectId));
  }),
);

/**
 * Deleting a project takes every candidate's copy with it — their links, notes
 * and uploaded files. Returns how many went, so the screen can say so rather
 * than reporting a bare success.
 */
router.delete(
  '/:projectId',
  staffOnly,
  handle(async (req, res) => {
    res.json(await projects.deleteProject(req.user, req.params.projectId));
  }),
);

export default router;
