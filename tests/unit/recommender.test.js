import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  recommend,
  sortProjects,
} from '../../server/services/recommender.js';

const req = (id) => ({ id, isRequired: true });
const opt = (id) => ({ id, isRequired: false });

let nextId = 1;
/** Builds a project with sensible defaults; ids increase unless given explicitly. */
function project(overrides = {}) {
  const id = overrides.id ?? nextId++;
  return {
    id,
    difficulty: 'easy',
    estimatedTime: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    materials: [],
    ...overrides,
  };
}

const ids = (items) => items.map((item) => item.id);

describe('recommend: match rules', () => {
  it('returns a full match when every required material is selected and there are no optional ones', () => {
    const p = project({ id: 1, materials: [req(1), req(2)] });
    const [result] = recommend([p], [1, 2]);
    expect(result.matchType).toBe('full');
    expect(result.missingMaterials).toEqual([]);
  });

  it('returns a full match when all required and all optional materials are selected', () => {
    const p = project({ id: 1, materials: [req(1), opt(2), opt(3)] });
    const [result] = recommend([p], [1, 2, 3]);
    expect(result.matchType).toBe('full');
    expect(result.missingMaterials).toEqual([]);
  });

  it('returns a partial match when exactly one optional material is missing', () => {
    const p = project({ id: 1, materials: [req(1), opt(2), opt(3)] });
    const [result] = recommend([p], [1, 2]);
    expect(result.matchType).toBe('partial');
    expect(result.missingMaterials).toEqual([opt(3)]);
  });

  it('excludes a project when two optional materials are missing', () => {
    const p = project({ id: 1, materials: [req(1), opt(2), opt(3)] });
    expect(recommend([p], [1])).toEqual([]);
  });

  it('excludes a project when three or more optional materials are missing', () => {
    const p = project({ id: 1, materials: [req(1), opt(2), opt(3), opt(4)] });
    expect(recommend([p], [1])).toEqual([]);
  });

  it('excludes a project when a required material is missing even if no optional is missing', () => {
    const p = project({ id: 1, materials: [req(1), req(2), opt(3)] });
    expect(recommend([p], [1, 3])).toEqual([]);
  });

  it('excludes a project when only one material is missing but it is required', () => {
    const p = project({ id: 1, materials: [req(1), opt(2)] });
    expect(recommend([p], [2])).toEqual([]);
  });

  it('returns nothing for an empty selection when every project has a required material', () => {
    const projects = [project({ materials: [req(1)] }), project({ materials: [req(2), opt(3)] })];
    expect(recommend(projects, [])).toEqual([]);
  });

  it('treats a project without materials as a full match, even for an empty selection', () => {
    const p = project({ id: 1, materials: [] });
    const [result] = recommend([p], []);
    expect(result.matchType).toBe('full');
  });

  it('ignores selected material ids that no project uses', () => {
    const p = project({ id: 1, materials: [req(1)] });
    const [result] = recommend([p], [1, 999, 1000]);
    expect(result.matchType).toBe('full');
  });

  it('accepts any iterable of selected ids (e.g. a Set)', () => {
    const p = project({ id: 1, materials: [req(1), opt(2)] });
    expect(recommend([p], new Set([1, 2]))[0].matchType).toBe('full');
  });

  it('returns an empty array for an empty project list', () => {
    expect(recommend([], [1, 2, 3])).toEqual([]);
  });
});

describe('recommend: output shape and immutability', () => {
  it('keeps extra project fields and adds matchType and missingMaterials', () => {
    const material = { id: 5, isRequired: false, name: 'Paint', category: 'other' };
    const p = project({ id: 7, title: 'Planter', materials: [req(1), material] });
    const [result] = recommend([p], [1]);
    expect(result).toMatchObject({ id: 7, title: 'Planter', matchType: 'partial' });
    expect(result.missingMaterials).toEqual([material]);
  });

  it('does not mutate the input projects or the selected ids', () => {
    const projects = [
      project({ id: 2, difficulty: 'hard', materials: [req(1)] }),
      project({ id: 1, difficulty: 'easy', materials: [req(1), opt(2)] }),
    ];
    const snapshot = structuredClone(projects);
    const selected = [1];
    recommend(projects, selected, { sort: 'difficulty_desc' });
    expect(projects).toEqual(snapshot);
    expect(selected).toEqual([1]);
    expect(projects[0]).not.toHaveProperty('matchType');
  });

  it('returns new objects rather than the input project objects', () => {
    const p = project({ id: 1, materials: [req(1)] });
    const [result] = recommend([p], [1]);
    expect(result).not.toBe(p);
  });
});

describe('recommend: ordering', () => {
  it('places every full match before every partial match regardless of difficulty', () => {
    const projects = [
      project({ id: 1, difficulty: 'easy', materials: [req(1), opt(9)] }), // partial
      project({ id: 2, difficulty: 'hard', materials: [req(1)] }), // full
      project({ id: 3, difficulty: 'medium', materials: [req(1), opt(8)] }), // partial
      project({ id: 4, difficulty: 'medium', materials: [req(1)] }), // full
    ];
    const result = recommend(projects, [1]);
    expect(result.map((r) => [r.id, r.matchType])).toEqual([
      [4, 'full'],
      [2, 'full'],
      [1, 'partial'],
      [3, 'partial'],
    ]);
  });

  it('uses difficulty_asc by default', () => {
    expect(DEFAULT_SORT).toBe('difficulty_asc');
    const projects = [
      project({ id: 1, difficulty: 'hard', materials: [req(1)] }),
      project({ id: 2, difficulty: 'easy', materials: [req(1)] }),
      project({ id: 3, difficulty: 'medium', materials: [req(1)] }),
    ];
    expect(ids(recommend(projects, [1]))).toEqual([2, 3, 1]);
  });

  it('breaks ties by id ascending within the same match type and sort key', () => {
    const projects = [
      project({ id: 9, materials: [req(1)] }),
      project({ id: 3, materials: [req(1)] }),
      project({ id: 5, materials: [req(1)] }),
    ];
    expect(ids(recommend(projects, [1]))).toEqual([3, 5, 9]);
  });

  it('applies the sort option inside each match group', () => {
    const projects = [
      project({ id: 1, estimatedTime: 90, materials: [req(1)] }),
      project({ id: 2, estimatedTime: 10, materials: [req(1)] }),
      project({ id: 3, estimatedTime: 5, materials: [req(1), opt(2)] }),
      project({ id: 4, estimatedTime: 60, materials: [req(1), opt(2)] }),
    ];
    expect(ids(recommend(projects, [1], { sort: 'time_asc' }))).toEqual([2, 1, 3, 4]);
  });

  it('throws a RangeError for an unknown sort option', () => {
    expect(() => recommend([], [], { sort: 'random' })).toThrow(RangeError);
  });
});

describe('sortProjects', () => {
  const projects = [
    project({
      id: 1,
      difficulty: 'medium',
      estimatedTime: 60,
      createdAt: '2026-03-01T00:00:00.000Z',
    }),
    project({
      id: 2,
      difficulty: 'easy',
      estimatedTime: 60,
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    project({
      id: 3,
      difficulty: 'hard',
      estimatedTime: 10,
      createdAt: '2026-03-01T00:00:00.000Z',
    }),
    project({
      id: 4,
      difficulty: 'easy',
      estimatedTime: 1440,
      createdAt: '2026-02-01T00:00:00.000Z',
    }),
  ];

  it('exposes exactly the four documented sort options', () => {
    expect(SORT_OPTIONS).toEqual(['difficulty_asc', 'difficulty_desc', 'time_asc', 'newest']);
  });

  it('sorts by difficulty ascending with id tie-break', () => {
    expect(ids(sortProjects(projects, 'difficulty_asc'))).toEqual([2, 4, 1, 3]);
  });

  it('sorts by difficulty descending with id ascending tie-break', () => {
    expect(ids(sortProjects(projects, 'difficulty_desc'))).toEqual([3, 1, 2, 4]);
  });

  it('sorts by estimated time ascending with id tie-break', () => {
    expect(ids(sortProjects(projects, 'time_asc'))).toEqual([3, 1, 2, 4]);
  });

  it('sorts by createdAt descending for newest with id ascending tie-break', () => {
    expect(ids(sortProjects(projects, 'newest'))).toEqual([1, 3, 4, 2]);
  });

  it('defaults to difficulty_asc', () => {
    expect(ids(sortProjects(projects))).toEqual([2, 4, 1, 3]);
  });

  it('returns a new array and leaves the input order unchanged', () => {
    const before = ids(projects);
    const sorted = sortProjects(projects, 'time_asc');
    expect(sorted).not.toBe(projects);
    expect(ids(projects)).toEqual(before);
    expect(sorted[0]).toBe(projects[2]);
  });

  it('throws a RangeError for an unknown sort option', () => {
    expect(() => sortProjects(projects, 'name_asc')).toThrow(RangeError);
  });
});
