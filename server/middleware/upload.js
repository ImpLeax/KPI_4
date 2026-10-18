import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { payloadTooLargeError, unsupportedMediaTypeError, validationError } from '../errors.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const UPLOADS_URL_PREFIX = '/uploads/';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STORED_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * Detects the image type from the file signature ("magic bytes").
 * @param {Buffer} buffer
 * @returns {'jpg'|'png'|'webp'|null} file extension for a supported type, otherwise null
 */
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
    fields: 20,
    parts: 21,
    fieldNameSize: 100,
    fieldSize: 256 * 1024,
    fieldNestingDepth: 0,
  },
});

function translateMulterError(err) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return payloadTooLargeError('Photo must not exceed 5 MB', [
        { field: 'photo', message: 'File is larger than 5 MB' },
      ]);
    }
    const field = err.field ?? (err.code === 'LIMIT_FILE_COUNT' ? 'photo' : '');
    return validationError('Invalid multipart form data', [{ field, message: err.message }]);
  }
  // busboy parse errors (malformed body, missing boundary, aborted upload, ...)
  return validationError('Malformed multipart form data');
}

/**
 * Parses a multipart/form-data body with an optional single file field `photo` (kept in memory).
 * Rejects other content types with 415, an oversized photo with 413 and malformed bodies with 400.
 */
export function parseIdeaForm(req, res, next) {
  if (!req.is('multipart/form-data')) {
    next(unsupportedMediaTypeError('Request body must be multipart/form-data'));
    return;
  }
  multerInstance.single('photo')(req, res, (err) =>
    next(err ? translateMulterError(err) : undefined),
  );
}

/**
 * Checks the declared MIME type and the file signature of an uploaded photo.
 * @returns {'jpg'|'png'|'webp'} extension to store the file with
 * @throws 415 UNSUPPORTED_MEDIA_TYPE when the photo is not JPEG/PNG/WebP
 */
export function assertSupportedPhoto(file) {
  const extension = ALLOWED_MIME_TYPES.has(file.mimetype) ? detectImageType(file.buffer) : null;
  if (!extension) {
    throw unsupportedMediaTypeError('Photo must be a JPEG, PNG or WebP image', [
      { field: 'photo', message: 'Unsupported file type' },
    ]);
  }
  return extension;
}

/**
 * Writes the photo under a random UUID name.
 * @returns {Promise<string>} public URL, e.g. '/uploads/<uuid>.png'
 */
export async function storePhoto(uploadDir, buffer, extension) {
  const filename = `${randomUUID()}.${extension}`;
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), buffer, { flag: 'wx' });
  return UPLOADS_URL_PREFIX + filename;
}

/**
 * Removes a previously stored photo. Only URLs of the form '/uploads/<uuid>.<ext>' are
 * considered (seed photos and anything else are left alone). Never throws.
 */
export async function removeStoredPhoto(uploadDir, photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith(UPLOADS_URL_PREFIX)) return;
  const filename = photoUrl.slice(UPLOADS_URL_PREFIX.length);
  if (!STORED_NAME_PATTERN.test(filename)) return;
  try {
    await fs.rm(path.join(uploadDir, filename), { force: true });
  } catch (err) {
    console.error(`Failed to remove uploaded photo ${filename}:`, err);
  }
}
