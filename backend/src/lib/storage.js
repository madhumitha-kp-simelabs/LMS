import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { AppError } from '../middleware/error.js';

/**
 * Local-disk file storage.
 *
 * Deliberately narrow so it can be swapped for Supabase Storage or S3 by
 * reimplementing this one module. Local disk is fine for development but does
 * NOT survive a deploy on Render/Railway — their filesystems are ephemeral.
 */

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// mime type -> [MaterialType, extension]
const ACCEPTED = new Map([
  ['application/pdf', ['pdf', '.pdf']],
  ['application/vnd.ms-powerpoint', ['slides', '.ppt']],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ['slides', '.pptx'],
  ],
]);

export function materialTypeFor(mimeType) {
  return ACCEPTED.get(mimeType)?.[0] ?? null;
}

/**
 * What a candidate may hand in for a project. Wider than course material,
 * because the work itself varies: a written charter, a zipped build, a
 * screenshot of a running app.
 */
const SUBMISSION_ACCEPTED = new Map([
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.ms-powerpoint', '.ppt'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/zip', '.zip'],
  ['application/x-zip-compressed', '.zip'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['text/plain', '.txt'],
]);

/** Both uploaders write to the same place; only the accepted types differ. */
function diskStorage(extensionFor) {
  return multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await mkdir(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      } catch (err) {
        cb(err);
      }
    },
    // Never reuse the uploaded filename: it is attacker-controlled and could
    // contain path separators. The original is kept in the database instead.
    filename: (req, file, cb) => cb(null, `${randomUUID()}${extensionFor(file.mimetype) ?? ''}`),
  });
}

export const uploadMaterial = multer({
  storage: diskStorage((mime) => ACCEPTED.get(mime)?.[1]),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ACCEPTED.has(file.mimetype)) {
      return cb(new AppError(415, 'Only PDF, PPT and PPTX files are accepted'));
    }
    cb(null, true);
  },
}).single('file');

export const uploadSubmission = multer({
  storage: diskStorage((mime) => SUBMISSION_ACCEPTED.get(mime)),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!SUBMISSION_ACCEPTED.has(file.mimetype)) {
      return cb(
        new AppError(
          415,
          'Accepted: PDF, Word, PowerPoint, Excel, ZIP, PNG, JPG or plain text. For anything else, hand in a link instead.',
        ),
      );
    }
    cb(null, true);
  },
}).single('file');

/** Resolves a stored key to an absolute path, refusing anything outside the upload dir. */
function resolveKey(key) {
  const full = path.resolve(UPLOAD_DIR, key);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) {
    throw new AppError(400, 'Invalid file reference');
  }
  return full;
}

export async function openFile(key) {
  const full = resolveKey(key);
  try {
    await stat(full);
  } catch {
    throw new AppError(404, 'File is missing from storage');
  }
  return createReadStream(full);
}

export async function deleteFile(key) {
  try {
    await unlink(resolveKey(key));
  } catch (err) {
    // A file that has already gone is fine — the database row is what matters,
    // and the caller has removed that. Anything else means the row is gone but
    // the bytes are still on disk, so say so rather than leaking in silence.
    if (err.code !== 'ENOENT') {
      console.warn(`Could not delete upload ${key}: ${err.code ?? err.message}`);
    }
  }
}
