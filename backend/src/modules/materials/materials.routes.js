import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { deleteFile, materialTypeFor, openFile, uploadMaterial } from '../../lib/storage.js';
import { assertTopicWrite } from '../courses/courses.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Multer's callback style wrapped so its errors reach the error middleware. */
function receiveFile(req, res, next) {
  uploadMaterial(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'File is larger than the 50 MB limit'));
    }
    next(err);
  });
}

router.post(
  '/topics/:topicId/materials',
  requireAuth,
  requireRole('trainer', 'admin'),
  receiveFile,
  handle(async (req, res) => {
    // Uploading material is the job of whoever is on duty for the topic.
    await assertTopicWrite(req.user, req.params.topicId);
    if (!req.file) throw new AppError(400, 'No file was uploaded');

    const last = await prisma.material.findFirst({
      where: { topicId: req.params.topicId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const material = await prisma.material.create({
      data: {
        topicId: req.params.topicId,
        type: materialTypeFor(req.file.mimetype),
        title: req.body.title?.trim() || req.file.originalname,
        fileUrl: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: BigInt(req.file.size),
        position: (last?.position ?? 0) + 1,
      },
    });

    res.status(201).json({ material });
  }),
);

/**
 * Streams the file. This is the access-control point for content: a candidate
 * may only download material for a topic that has been allotted to them.
 */
router.get(
  '/materials/:materialId/file',
  requireAuth,
  handle(async (req, res) => {
    const material = await prisma.material.findUnique({
      where: { id: req.params.materialId },
      include: { topic: { include: { course: true } } },
    });
    if (!material) throw new AppError(404, 'Material not found');

    if (req.user.role === 'candidate') {
      const allotted = await prisma.topicAssignment.findUnique({
        where: { userId_topicId: { userId: req.user.id, topicId: material.topicId } },
      });
      if (!allotted) throw new AppError(403, 'That material has not been shared with you');
    } else if (req.user.role === 'trainer' && material.topic.course.ownerId !== req.user.id) {
      throw new AppError(403, 'That material belongs to another trainer’s course');
    }

    const filename = material.originalFilename ?? 'download';
    res.setHeader('Content-Type', material.mimeType ?? 'application/octet-stream');
    // `inline` lets the browser render PDFs in a tab; PPTX will download anyway
    // because no browser can display it.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

    const stream = await openFile(material.fileUrl);
    stream.pipe(res);
  }),
);

router.delete(
  '/materials/:materialId',
  requireAuth,
  requireRole('trainer', 'admin'),
  handle(async (req, res) => {
    const material = await prisma.material.findUnique({ where: { id: req.params.materialId } });
    if (!material) throw new AppError(404, 'Material not found');

    await assertTopicWrite(req.user, material.topicId);
    await prisma.material.delete({ where: { id: material.id } });
    if (material.fileUrl) await deleteFile(material.fileUrl);

    res.status(204).end();
  }),
);

export default router;
