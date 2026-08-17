import multer from 'multer';
import mammoth from 'mammoth';
import { AppError } from '../middleware/error.js';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC = 'application/msword';

/**
 * Question documents are parsed and discarded, never stored — only the
 * extracted questions are persisted. Memory storage keeps them off disk.
 */
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === DOC) {
      return cb(
        new AppError(
          415,
          'Legacy .doc files can’t be read. Save it as .docx or export it as a PDF and try again.',
        ),
      );
    }
    if (file.mimetype !== PDF && file.mimetype !== DOCX) {
      return cb(new AppError(415, 'Upload a PDF or a Word (.docx) file'));
    }
    cb(null, true);
  },
}).single('file');

/** Extracts plain text. Layout is discarded — the parser works line by line. */
export async function extractText(file) {
  if (file.mimetype === DOCX) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }

  // pdf-parse v2 exposes a PDFParse class and has no default export. Imported
  // lazily so pdfjs only loads when a PDF is actually uploaded.
  const { PDFParse, PasswordException } = await import('pdf-parse');

  const parser = new PDFParse({ data: file.buffer });
  try {
    const { text } = await parser.getText();
    return text;
  } catch (err) {
    if (err instanceof PasswordException) {
      throw new AppError(422, 'That PDF is password-protected. Remove the password and try again.');
    }
    throw err;
  } finally {
    // Releases the pdfjs worker; without this the process keeps handles open.
    await parser.destroy();
  }
}
