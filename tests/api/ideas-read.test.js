import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, expectErrorShape } from '../helpers/testApp.js';

let ctx;
beforeAll(() => {
  ctx = createTestApp();
});
afterAll(() => ctx.cleanup());

const ids = (res) => res.body.items.map((item) => item.id);
const get = (url) => request(ctx.app).get(url);

// Expected orders from server/db/SEED_NOTES.md.
const NEWEST_ORDER = [
  14, 10, 22, 7, 24, 18, 12, 21, 5, 16, 9, 25, 3, 13, 20, 6, 23, 11, 1, 17, 19, 4, 8, 2, 15,
];
const TIME_ASC_ORDER = [
  19, 4, 15, 2, 17, 20, 23, 1, 8, 3, 11, 6, 18, 25, 9, 16, 5, 12, 21, 7, 24, 10, 22, 13, 14,
];
const EASY = [1, 2, 3, 4, 8, 15, 17, 19, 20];
const MEDIUM = [5, 6, 9, 11, 16, 18, 21, 23, 25];
const HARD = [7, 10, 12, 13, 14, 22, 24];

describe('GET /api/ideas (catalog mode)', () => {
  it('returns all 25 seed ideas with total', async () => {
    const res = await get('/api/ideas');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.items).toHaveLength(25);
  });

  it('returns summaries with the documented fields and no recommendation fields', async () => {
    const res = await get('/api/ideas');
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'category',
          'createdAt',
          'description',
          'difficulty',
          'estimatedTime',
          'id',
          'photoUrl',
          'title',
        ].sort(),
      );
    }
    expect(res.body.items.find((item) => item.id === 19)).toEqual({
      id: 19,
      title: 'Кораблики з газети',
      description: expect.stringContaining('паперовий кораблик'),
      category: 'toys',
      difficulty: 'easy',
      estimatedTime: 10,
      photoUrl: '/images/seed/newspaper-boats.jpg',
      createdAt: '2026-08-31T16:20:00.000Z',
    });
  });

  it('sorts by difficulty ascending, then id, by default', async () => {
    const res = await get('/api/ideas');
    expect(ids(res)).toEqual([...EASY, ...MEDIUM, ...HARD]);
  });

  it('sorts by difficulty descending, then id ascending', async () => {
    const res = await get('/api/ideas?sort=difficulty_desc');
    expect(ids(res)).toEqual([...HARD, ...MEDIUM, ...EASY]);
  });

  it('sorts by creation date for sort=newest', async () => {
    expect(ids(await get('/api/ideas?sort=newest'))).toEqual(NEWEST_ORDER);
  });

  it('sorts by time with id tie-break for sort=time_asc', async () => {
    expect(ids(await get('/api/ideas?sort=time_asc'))).toEqual(TIME_ASC_ORDER);
  });

  it('localizes titles with lang=en', async () => {
    const res = await get('/api/ideas?lang=en');
    expect(res.body.items.find((item) => item.id === 19).title).toBe('Newspaper origami boats');
  });

  it('rejects an unknown sort option with 400', async () => {
    const res = await get('/api/ideas?sort=random');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toEqual(['sort']);
  });
});

describe('GET /api/ideas: difficulty filter', () => {
  it.each([
    ['easy', EASY],
    ['medium', MEDIUM],
    ['hard', HARD],
  ])('difficulty=%s returns only those ideas', async (difficulty, expected) => {
    const res = await get(`/api/ideas?difficulty=${difficulty}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expected);
    expect(res.body.items.every((item) => item.difficulty === difficulty)).toBe(true);
  });

  it('combines several levels with OR', async () => {
    const res = await get('/api/ideas?difficulty=easy,hard');
    expect(res.body.total).toBe(EASY.length + HARD.length);
    expect(ids(res)).toEqual([...EASY, ...HARD]);
  });

  it('returns the whole catalog when all three levels are selected', async () => {
    expect((await get('/api/ideas?difficulty=easy,medium,hard')).body.total).toBe(25);
  });

  it('treats an empty difficulty as no filter', async () => {
    expect((await get('/api/ideas?difficulty=')).body.total).toBe(25);
  });

  it('rejects an unknown difficulty level with 400', async () => {
    const res = await get('/api/ideas?difficulty=easy,expert');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('difficulty');
  });
});

describe('GET /api/ideas: category and search filters', () => {
  it.each([
    ['garden', 5],
    ['decor', 5],
    ['household', 4],
    ['storage', 4],
    ['toys', 4],
    ['accessories', 3],
  ])('category=%s returns %i ideas', async (category, count) => {
    const res = await get(`/api/ideas?category=${category}`);
    expect(res.body.total).toBe(count);
    expect(res.body.items.every((item) => item.category === category)).toBe(true);
  });

  it('rejects an unknown category with 400', async () => {
    const res = await get('/api/ideas?category=kitchen');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });

  it('searches titles case-insensitively in Ukrainian', async () => {
    const res = await get(`/api/ideas?q=${encodeURIComponent('КОРАБЛИКИ')}`);
    expect(ids(res)).toEqual([19]);
  });

  it('searches English titles even when lang=uk', async () => {
    const res = await get('/api/ideas?q=ORIGAMI');
    expect(ids(res)).toEqual([19]);
    expect(res.body.items[0].title).toBe('Кораблики з газети');
  });

  it('matches substrings in several titles', async () => {
    const res = await get('/api/ideas?q=cork&lang=en');
    expect(ids(res)).toEqual([9, 11]);
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await get('/api/ideas?q=submarine');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it('accepts a 100-character query and rejects a 101-character one', async () => {
    expect((await get(`/api/ideas?q=${'x'.repeat(100)}`)).status).toBe(200);
    const res = await get(`/api/ideas?q=${'x'.repeat(101)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('q');
  });

  it('combines difficulty, category and search with AND', async () => {
    const res = await get('/api/ideas?category=storage&difficulty=easy&q=jar&lang=en');
    expect(ids(res)).toEqual([17]);
  });
});

describe('GET /api/ideas/:id (master class)', () => {
  it('returns the full idea with numbered steps, materials and tools', async () => {
    const res = await get('/api/ideas/19?lang=en');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 19,
      title: 'Newspaper origami boats',
      category: 'toys',
      difficulty: 'easy',
      estimatedTime: 10,
      photoUrl: '/images/seed/newspaper-boats.jpg',
      createdAt: '2026-08-31T16:20:00.000Z',
      updatedAt: expect.any(String),
      materials: [{ id: 6, name: 'Newspaper', category: 'paper', isRequired: true, quantity: '1' }],
      tools: [{ id: 1, name: 'Scissors' }],
    });
    expect(res.body.steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5]);
    expect(res.body.steps[0].text).toBe('Cut a rectangle of about 20×30 cm from a newspaper page.');
  });

  it('returns Ukrainian texts by default', async () => {
    const res = await get('/api/ideas/19');
    expect(res.body.title).toBe('Кораблики з газети');
    expect(res.body.steps[0].text).toMatch(/^Виріжте з газетного аркуша/);
    expect(res.body.tools).toEqual([{ id: 1, name: 'Ножиці' }]);
  });

  it('lists required materials before optional ones', async () => {
    const res = await get('/api/ideas/15?lang=en');
    const flags = res.body.materials.map((m) => m.isRequired);
    expect(flags).toEqual([true, false, false, false]);
    expect(res.body.materials[0].id).toBe(14);
  });

  it('returns quantity null when it is not set', async () => {
    const res = await get('/api/ideas/10');
    expect(res.body.materials.find((m) => m.id === 21).quantity).toBeNull();
  });

  it('returns steps in ascending order for every seed idea', async () => {
    for (const id of [7, 13, 14]) {
      const res = await get(`/api/ideas/${id}`);
      expect(res.body.steps.map((s) => s.number)).toEqual(
        Array.from({ length: 7 }, (_, i) => i + 1),
      );
    }
  });

  it('returns 404 NOT_FOUND for a missing idea', async () => {
    const res = await get('/api/ideas/9999');
    expect(res.status).toBe(404);
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it.each(['abc', '0', '-1', '1.5', '01'])('returns 400 for an invalid id %j', async (id) => {
    const res = await get(`/api/ideas/${id}`);
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });

  it('rejects an unsupported lang with 400', async () => {
    const res = await get('/api/ideas/1?lang=pl');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });
});

describe('language fallback', () => {
  let local;
  beforeAll(() => {
    local = createTestApp();
    local.db.exec(`
      UPDATE craft_projects SET title_uk = NULL, description_uk = NULL WHERE id = 19;
      UPDATE craft_project_steps SET text_uk = NULL WHERE project_id = 19 AND step_number = 1;
      UPDATE craft_projects SET title_en = NULL WHERE id = 2;
    `);
  });
  afterAll(() => local.cleanup());

  it('falls back to English when the Ukrainian text is missing', async () => {
    const res = await request(local.app).get('/api/ideas/19?lang=uk');
    expect(res.body.title).toBe('Newspaper origami boats');
    expect(res.body.description).toMatch(/^The classic paper boat/);
    expect(res.body.steps[0].text).toMatch(/^Cut a rectangle/);
    expect(res.body.steps[1].text).toMatch(/^Складіть його навпіл/);
  });

  it('falls back to Ukrainian when the English text is missing', async () => {
    const res = await request(local.app).get('/api/ideas?lang=en&category=garden');
    const idea = res.body.items.find((item) => item.id === 2);
    const uk = await request(local.app).get('/api/ideas/2?lang=uk');
    expect(idea.title).toBe(uk.body.title);
    expect(idea.title).not.toBe('');
  });
});
