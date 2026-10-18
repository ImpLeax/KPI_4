// Pure recommendation logic: no database access, no I/O, inputs are never mutated.

const DIFFICULTY_RANK = { easy: 1, medium: 2, hard: 3 };
const MATCH_RANK = { full: 0, partial: 1 };

export const SORT_OPTIONS = ['difficulty_asc', 'difficulty_desc', 'time_asc', 'newest'];
export const DEFAULT_SORT = 'difficulty_asc';

const byId = (a, b) => a.id - b.id;

/** Comparators for the `sort` option; every one ends with the id (ascending) tie-break. */
const COMPARATORS = {
  difficulty_asc: (a, b) =>
    DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || byId(a, b),
  difficulty_desc: (a, b) =>
    DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty] || byId(a, b),
  time_asc: (a, b) => a.estimatedTime - b.estimatedTime || byId(a, b),
  // ISO-8601 UTC timestamps compare correctly as strings.
  newest: (a, b) =>
    (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) || byId(a, b),
};

function getComparator(sort = DEFAULT_SORT) {
  const comparator = COMPARATORS[sort];
  if (!comparator) {
    throw new RangeError(`Unknown sort option: ${sort}`);
  }
  return comparator;
}

/**
 * Sorts projects by `sort`, then by id ascending. Returns a new array.
 *
 * @param {Array<{ id: number, difficulty: 'easy'|'medium'|'hard', estimatedTime: number, createdAt: string }>} projects
 * @param {'difficulty_asc'|'difficulty_desc'|'time_asc'|'newest'} [sort='difficulty_asc']
 * @returns {Array} new array with the same project objects
 * @throws {RangeError} on an unknown sort option
 */
export function sortProjects(projects, sort = DEFAULT_SORT) {
  return [...projects].sort(getComparator(sort));
}

/**
 * Matches projects against the materials the user has and orders the result.
 *
 * Rules (see server/docs/openapi.yaml, GET /api/ideas):
 * - a project missing any required material is excluded;
 * - 0 optional materials missing -> `matchType: 'full'`, `missingMaterials: []`;
 * - exactly 1 optional material missing -> `matchType: 'partial'`, `missingMaterials: [that material]`;
 * - 2 or more optional materials missing -> excluded;
 * - order: all `full` before all `partial`, then by `sort`, then by id ascending.
 *   `newest` means `createdAt` descending.
 *
 * A project without any materials is a full match. Unknown selected ids are simply ignored.
 *
 * @param {Array<{
 *   id: number,
 *   difficulty: 'easy'|'medium'|'hard',
 *   estimatedTime: number,          // minutes
 *   createdAt: string,              // ISO-8601 UTC, e.g. '2026-01-31T10:00:00.000Z'
 *   materials: Array<{ id: number, isRequired: boolean }>  // extra fields (name, category...) are kept
 * }>} projects candidate projects (any extra fields are preserved in the output)
 * @param {Iterable<number>} selectedMaterialIds ids of the materials the user has
 * @param {{ sort?: 'difficulty_asc'|'difficulty_desc'|'time_asc'|'newest' }} [options]
 * @returns {Array<object>} shallow copies of the matching projects with two extra fields:
 *   `matchType: 'full'|'partial'` and `missingMaterials` (the missing entries of `project.materials`, as given)
 * @throws {RangeError} on an unknown sort option
 */
export function recommend(projects, selectedMaterialIds, { sort = DEFAULT_SORT } = {}) {
  const comparator = getComparator(sort);
  const selected = new Set(selectedMaterialIds);
  const matches = [];

  for (const project of projects) {
    const missing = project.materials.filter((material) => !selected.has(material.id));
    if (missing.some((material) => material.isRequired)) continue;
    if (missing.length >= 2) continue;

    matches.push({
      ...project,
      matchType: missing.length === 0 ? 'full' : 'partial',
      missingMaterials: missing,
    });
  }

  return matches.sort(
    (a, b) => MATCH_RANK[a.matchType] - MATCH_RANK[b.matchType] || comparator(a, b),
  );
}
