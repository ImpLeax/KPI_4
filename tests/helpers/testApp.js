// Shared helpers for API tests: in-memory app factory, temp upload dir, multipart form helpers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { initDatabase, openDatabase } from '../../server/db/connection.js';
import { tinyJpeg, tinyPng } from './images.js';

export { pngOfSize, tinyJpeg, tinyPng } from './images.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Creates the app on a fresh in-memory database (schema + seed) and a unique temp upload dir.
 * Call `cleanup()` in `afterAll`/`afterEach` to close the DB and remove the upload dir.
 */
export function createTestApp(options = {}) {
  const db = openDatabase(':memory:');
  initDatabase(db);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upcycling-test-uploads-'));
  const app = createApp({ db, uploadDir, ...options });
  return {
    app,
    db,
    uploadDir,
    /** Names of files currently stored in the upload dir. */
    uploadedFiles: () => (fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []),
    cleanup() {
      db.close();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

/** Valid POST/PUT text fields (strings, as they arrive in multipart/form-data). */
export function validIdeaFields(overrides = {}) {
  return {
    lang: 'en',
    title: 'Test bottle lantern',
    description: 'A lantern made from a plastic bottle.',
    category: 'decor',
    difficulty: 'easy',
    estimatedTime: '25',
    materials: JSON.stringify([
      { materialId: 1, isRequired: true, quantity: '1 pc' },
      { materialId: 22, isRequired: false },
    ]),
    tools: JSON.stringify([1, 3]),
    steps: JSON.stringify(['Cut the bottle in half', 'Paint the outside']),
    ...overrides,
  };
}

/**
 * Adds multipart fields (and an optional photo) to a supertest request.
 * @param {import('supertest').Test} request
 * @param {Record<string, string>} fields
 * @param {{ buffer: Buffer, filename?: string, contentType?: string } | null} [photo]
 */
export function withForm(request, fields, photo = null) {
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) request.field(name, value);
  }
  if (photo) {
    request.attach('photo', photo.buffer, {
      filename: photo.filename ?? 'photo.png',
      contentType: photo.contentType ?? 'image/png',
    });
  }
  return request;
}

export const pngPhoto = () => ({
  buffer: tinyPng(),
  filename: 'photo.png',
  contentType: 'image/png',
});
export const jpegPhoto = () => ({
  buffer: tinyJpeg(),
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
});

/** Asserts the uniform error envelope `{ error: { code, message, details? } }`. */
export function expectErrorShape(body, code) {
  if (!body || typeof body.error !== 'object') {
    throw new Error(`Expected an error envelope, got ${JSON.stringify(body)}`);
  }
  const { error } = body;
  if (error.code !== code) {
    throw new Error(`Expected error code ${code}, got ${error.code}: ${JSON.stringify(body)}`);
  }
  if (typeof error.message !== 'string' || error.message === '') {
    throw new Error(`Error message must be a non-empty string: ${JSON.stringify(body)}`);
  }
  if (error.details !== undefined && !Array.isArray(error.details)) {
    throw new Error(`Error details must be an array: ${JSON.stringify(body)}`);
  }
  const allowedKeys = ['code', 'message', 'details'];
  const extra = Object.keys(error).filter((key) => !allowedKeys.includes(key));
  if (extra.length) throw new Error(`Unexpected error keys ${extra}: ${JSON.stringify(body)}`);
}

/** Field names of `error.details`. */
export const detailFields = (body) => (body.error.details ?? []).map((detail) => detail.field);
