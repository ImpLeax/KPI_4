import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  expectErrorShape,
  pngPhoto,
  validIdeaFields,
  withForm,
} from '../helpers/testApp.js';

let ctx;
beforeAll(() => {
  ctx = createTestApp();
});
afterAll(() => ctx.cleanup());

describe('error responses', () => {
  it('returns 404 NOT_FOUND JSON for an unknown API route', async () => {
    const res = await request(ctx.app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for an unsupported method on a known route', async () => {
    const res = await request(ctx.app).patch('/api/ideas/1');
    expect(res.status).toBe(404);
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a malformed percent-encoded path', async () => {
    const res = await request(ctx.app).get('/api/ideas/%E0%A4%A');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });

  it('includes field-level details for invalid query parameters', async () => {
    const res = await request(ctx.app).get('/api/ideas?sort=x&difficulty=y&lang=z');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    for (const detail of res.body.error.details) {
      expect(Object.keys(detail).sort()).toEqual(['field', 'message']);
    }
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual([
      'difficulty',
      'lang',
      'sort',
    ]);
  });

  it('omits details when there are none', async () => {
    const res = await request(ctx.app).get('/api/ideas/9999');
    expect(res.body.error).not.toHaveProperty('details');
  });

  it('returns 400 for a malformed multipart body', async () => {
    const res = await request(ctx.app)
      .post('/api/ideas')
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nContent-Disposition: form-data; name="title"\r\n\r\nunterminated');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });

  it('returns 415 for a body that is not multipart', async () => {
    const res = await request(ctx.app)
      .post('/api/ideas')
      .set('Content-Type', 'text/plain')
      .send('title=hello');
    expect(res.status).toBe(415);
    expectErrorShape(res.body, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('does not leak stack traces or internals', async () => {
    const res = await request(ctx.app).get('/api/ideas?materials=1,,2');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/at \w+ \(|node_modules|\.js:\d+/);
  });

  it('returns 404 NOT_FOUND JSON for a missing uploaded file', async () => {
    const res = await request(ctx.app).get('/uploads/00000000-0000-0000-0000-000000000000.png');
    expect(res.status).toBe(404);
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it('does not serve dotfiles from /uploads', async () => {
    const res = await request(ctx.app).get('/uploads/.env');
    expect(res.status).toBe(404);
  });

  it('returns plain-text 404 for an unknown static page', async () => {
    const res = await request(ctx.app).get('/no-such-page.html');
    expect(res.status).toBe(404);
  });

  it('does not expose the X-Powered-By header', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('write rate limiting', () => {
  let limited;
  beforeAll(() => {
    limited = createTestApp({ rateLimit: { windowMs: 60_000, limit: 2 } });
  });
  afterAll(() => limited.cleanup());

  it('returns 429 RATE_LIMITED after the write limit is exhausted, but keeps reads working', async () => {
    const first = await request(limited.app).delete('/api/ideas/9999');
    const second = await withForm(
      request(limited.app).post('/api/ideas'),
      validIdeaFields(),
      pngPhoto(),
    );
    expect(first.status).toBe(404);
    expect(second.status).toBe(201);

    const third = await request(limited.app).delete('/api/ideas/1');
    expect(third.status).toBe(429);
    expectErrorShape(third.body, 'RATE_LIMITED');
    // The rejected delete must not have happened.
    expect((await request(limited.app).get('/api/ideas/1')).status).toBe(200);

    for (let i = 0; i < 5; i += 1) {
      expect((await request(limited.app).get('/api/ideas')).status).toBe(200);
    }
  });

  it('does not rate limit writes when the option is off (default)', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await request(ctx.app).delete('/api/ideas/9999')).status).toBe(404);
    }
  });
});
