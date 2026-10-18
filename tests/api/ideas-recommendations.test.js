import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, expectErrorShape } from '../helpers/testApp.js';

let ctx;
beforeAll(() => {
  ctx = createTestApp();
});
afterAll(() => ctx.cleanup());

const recommend = (query) => request(ctx.app).get(`/api/ideas?${query}`);
const ids = (res) => res.body.items.map((item) => item.id);
/** [id, matchType, missing material ids] for compact assertions. */
const matches = (res) =>
  res.body.items.map((item) => [item.id, item.matchType, item.missingMaterials.map((m) => m.id)]);

const ALL_MATERIALS = Array.from({ length: 30 }, (_, i) => i + 1).join(',');

// Scenarios S1..S10 from server/db/SEED_NOTES.md.
describe('GET /api/ideas?materials= (seed scenarios)', () => {
  it.each([
    [
      'S1 bottle + twine + soil + wire',
      '1,20,27,15',
      [
        [2, 'full', []],
        [1, 'partial', [22]],
      ],
    ],
    ['S2 only a glass jar', '8', []],
    ['S3 glass jar + paint', '8,22', [[17, 'partial', [20]]]],
    [
      'S4 jar + paint + twine + soil',
      '8,22,20,27',
      [
        [8, 'full', []],
        [17, 'full', []],
      ],
    ],
    [
      'S5 cardboard + glue + paint',
      '4,21,22',
      [
        [18, 'full', []],
        [21, 'partial', [2]],
        [22, 'partial', [13]],
      ],
    ],
    ['S6 tin can + paint + ribbon', '14,22,23', [[15, 'partial', [24]]]],
    ['S7 only newspaper', '6', [[19, 'full', []]]],
    ['S8 material no idea uses', '10', []],
    [
      'S9 jar + lamp kit + paint',
      '8,29,22',
      [
        [12, 'full', []],
        [17, 'partial', [20]],
      ],
    ],
  ])('%s', async (_name, materials, expected) => {
    const res = await recommend(`materials=${materials}`);
    expect(res.status).toBe(200);
    expect(matches(res)).toEqual(expected);
    expect(res.body.total).toBe(expected.length);
  });

  it('S10 all materials: every idea is a full match ordered by difficulty then id', async () => {
    const res = await recommend(`materials=${ALL_MATERIALS}`);
    expect(res.body.total).toBe(25);
    expect(ids(res)).toEqual([
      1, 2, 3, 4, 8, 15, 17, 19, 20, 5, 6, 9, 11, 16, 18, 21, 23, 25, 7, 10, 12, 13, 14, 22, 24,
    ]);
    expect(res.body.items.every((item) => item.matchType === 'full')).toBe(true);
  });

  it('returns an empty list with total 0 when nothing matches', async () => {
    const res = await recommend('materials=10');
    expect(res.body).toEqual({ items: [], total: 0 });
  });
});

describe('GET /api/ideas?materials=: rules and response shape', () => {
  it('adds matchType and missingMaterials (id, name, category) to every item', async () => {
    const res = await recommend('materials=1,20,27,15&lang=en');
    const partial = res.body.items.find((item) => item.id === 1);
    expect(partial.matchType).toBe('partial');
    expect(partial.missingMaterials).toEqual([
      { id: 22, name: 'Acrylic paint', category: 'other' },
    ]);
    const full = res.body.items.find((item) => item.id === 2);
    expect(full.missingMaterials).toEqual([]);
    expect(full).not.toHaveProperty('materials');
  });

  it('localizes missing material names', async () => {
    const res = await recommend('materials=8,22&lang=uk');
    expect(res.body.items[0].missingMaterials[0].name).toBe('Джутовий шпагат');
  });

  it('excludes an idea when exactly one material is missing but it is required', async () => {
    // Idea 19 needs only newspaper (6); idea 2 needs 1 and 20 (both required).
    const res = await recommend('materials=1');
    expect(ids(res)).not.toContain(2);
  });

  it('excludes an idea when two optional materials are missing (idea 17 with jar only)', async () => {
    expect(ids(await recommend('materials=8'))).not.toContain(17);
  });

  it('ignores unknown material ids', async () => {
    const res = await recommend('materials=6,999,1000');
    expect(res.status).toBe(200);
    expect(matches(res)).toEqual([[19, 'full', []]]);
  });

  it('deduplicates repeated ids inside the list', async () => {
    const res = await recommend('materials=6,6,6');
    expect(ids(res)).toEqual([19]);
  });

  it('places full matches before partial ones even when the partial one is easier', async () => {
    // S9: 12 (hard, full) precedes 17 (easy, partial).
    expect(ids(await recommend('materials=8,29,22'))).toEqual([12, 17]);
  });

  it('applies sort inside each match group', async () => {
    // S5 with hardest first: full 18 (medium); partial 22 (hard) before 21 (medium).
    const res = await recommend('materials=4,21,22&sort=difficulty_desc');
    expect(ids(res)).toEqual([18, 22, 21]);
  });

  it('applies sort=time_asc inside each match group', async () => {
    const res = await recommend(`materials=${ALL_MATERIALS}&sort=time_asc`);
    expect(ids(res)).toEqual([
      19, 4, 15, 2, 17, 20, 23, 1, 8, 3, 11, 6, 18, 25, 9, 16, 5, 12, 21, 7, 24, 10, 22, 13, 14,
    ]);
  });

  it('combines recommendations with the difficulty filter', async () => {
    const res = await recommend('materials=4,21,22&difficulty=hard');
    expect(matches(res)).toEqual([[22, 'partial', [13]]]);
  });

  it('combines recommendations with the category filter', async () => {
    const res = await recommend(`materials=${ALL_MATERIALS}&category=accessories`);
    expect(ids(res)).toEqual([23, 25, 24]);
  });

  it('combines recommendations with the search query', async () => {
    const res = await recommend('materials=8,22,20,27&q=terrarium');
    expect(ids(res)).toEqual([8]);
  });
});

describe('GET /api/ideas?materials=: parameter validation', () => {
  it('treats an empty materials value as catalog mode', async () => {
    const res = await recommend('materials=');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.items[0]).not.toHaveProperty('matchType');
  });

  it('accepts spaces around ids', async () => {
    const res = await recommend(`materials=${encodeURIComponent(' 6 , 999 ')}`);
    expect(ids(res)).toEqual([19]);
  });

  it.each(['1,,2', '1,', ',1', '0', '-1', 'abc', '1.5', '1;2'])(
    'rejects materials=%j with 400',
    async (value) => {
      const res = await recommend(`materials=${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
      expectErrorShape(res.body, 'VALIDATION_ERROR');
      expect(res.body.error.details.map((d) => d.field)).toEqual(['materials']);
    },
  );

  it('rejects a repeated materials parameter with 400', async () => {
    const res = await recommend('materials=1&materials=2');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('materials');
  });
});
