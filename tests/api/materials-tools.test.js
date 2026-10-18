import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, expectErrorShape } from '../helpers/testApp.js';

let ctx;
beforeAll(() => {
  ctx = createTestApp();
});
afterAll(() => ctx.cleanup());

const CATEGORY_ORDER = ['glass', 'metal', 'other', 'paper', 'plastic', 'textile'];

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/docs', () => {
  it('serves the Swagger UI page', async () => {
    const res = await request(ctx.app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
  });
});

describe('GET /api/materials', () => {
  it('returns all 30 seed materials with id, name and category', async () => {
    const res = await request(ctx.app).get('/api/materials');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(res.body).toHaveLength(30);
    for (const material of res.body) {
      expect(Object.keys(material).sort()).toEqual(['category', 'id', 'name']);
      expect(typeof material.id).toBe('number');
      expect(typeof material.name).toBe('string');
    }
    expect(new Set(res.body.map((m) => m.id)).size).toBe(30);
  });

  it('defaults to Ukrainian names', async () => {
    const res = await request(ctx.app).get('/api/materials');
    expect(res.body.find((m) => m.id === 8).name).toBe('Скляна банка');
  });

  it('returns English names for lang=en', async () => {
    const res = await request(ctx.app).get('/api/materials?lang=en');
    expect(res.status).toBe(200);
    expect(res.body.find((m) => m.id === 8)).toEqual({
      id: 8,
      name: 'Glass jar',
      category: 'glass',
    });
  });

  it('treats an empty lang as the default language', async () => {
    const res = await request(ctx.app).get('/api/materials?lang=');
    expect(res.status).toBe(200);
    expect(res.body.find((m) => m.id === 6).name).toBe('Газета');
  });

  it.each(['uk', 'en'])('is ordered by category, then by name (lang=%s)', async (lang) => {
    const res = await request(ctx.app).get(`/api/materials?lang=${lang}`);
    const categories = res.body.map((m) => m.category);
    const categoryRanks = categories.map((c) => CATEGORY_ORDER.indexOf(c));
    expect(categoryRanks).toEqual([...categoryRanks].sort((a, b) => a - b));

    const collator = new Intl.Collator(lang);
    for (const category of CATEGORY_ORDER) {
      const names = res.body.filter((m) => m.category === category).map((m) => m.name);
      expect(names).toEqual([...names].sort(collator.compare));
    }
  });

  it('rejects an unsupported lang with 400', async () => {
    const res = await request(ctx.app).get('/api/materials?lang=de');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('lang');
  });
});

describe('GET /api/tools', () => {
  it('returns all 12 seed tools with id and name', async () => {
    const res = await request(ctx.app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    for (const tool of res.body) {
      expect(Object.keys(tool).sort()).toEqual(['id', 'name']);
    }
  });

  it.each([
    ['uk', 'Ножиці'],
    ['en', 'Scissors'],
  ])('localizes names (lang=%s)', async (lang, scissors) => {
    const res = await request(ctx.app).get(`/api/tools?lang=${lang}`);
    expect(res.body.find((tool) => tool.id === 1).name).toBe(scissors);
  });

  it.each(['uk', 'en'])('is ordered by name (lang=%s)', async (lang) => {
    const res = await request(ctx.app).get(`/api/tools?lang=${lang}`);
    const names = res.body.map((tool) => tool.name);
    expect(names).toEqual([...names].sort(new Intl.Collator(lang).compare));
  });

  it('rejects an unsupported lang with 400', async () => {
    const res = await request(ctx.app).get('/api/tools?lang=EN');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });
});
