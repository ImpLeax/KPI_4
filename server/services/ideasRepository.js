import { recommend, sortProjects } from './recommender.js';

const OTHER_LANG = { uk: 'en', en: 'uk' };
const COLLATORS = { uk: new Intl.Collator('uk'), en: new Intl.Collator('en') };

/**
 * Column names cannot be bound as parameters, so localized columns are built only from
 * this whitelist. Throws for anything other than 'uk' | 'en'.
 */
function assertLang(lang) {
  if (!Object.hasOwn(OTHER_LANG, lang)) {
    throw new Error(`Unsupported language: ${lang}`);
  }
  return lang;
}

/** `COALESCE(<column>_<lang>, <column>_<other>)` for a whitelisted language. */
function localized(column, lang) {
  assertLang(lang);
  return `COALESCE(${column}_${lang}, ${column}_${OTHER_LANG[lang]})`;
}

const byName = (lang) => (a, b) => COLLATORS[lang].compare(a.name, b.name) || a.id - b.id;

function toIdeaSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    estimatedTime: row.estimated_time,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
  };
}

const toMaterial = ({ id, name, category }) => ({ id, name, category });

/**
 * Data access for ideas (craft projects), materials and tools.
 * All responses are already localized to the requested `lang` with fallback to the other language.
 * @param {import('better-sqlite3').Database} db
 */
export function createIdeasRepository(db) {
  // Unicode-aware lower() for case-insensitive search (SQLite's lower()/LIKE fold ASCII only).
  db.function('unicode_lower', { deterministic: true }, (value) =>
    value === null ? null : String(value).toLowerCase(),
  );

  const statementCache = new Map();
  /** Prepares a statement once per distinct SQL text. */
  const prepare = (sql) => {
    let statement = statementCache.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statementCache.set(sql, statement);
    }
    return statement;
  };

  function listMaterials(lang) {
    const rows = prepare(
      `SELECT id, ${localized('name', lang)} AS name, category FROM materials`,
    ).all();
    const compareName = byName(lang);
    return rows.sort(
      (a, b) =>
        (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) || compareName(a, b),
    );
  }

  function listTools(lang) {
    const rows = prepare(`SELECT id, ${localized('name', lang)} AS name FROM tools`).all();
    return rows.sort(byName(lang));
  }

  function projectMaterials(projectId, lang) {
    const rows = prepare(
      `SELECT m.id, ${localized('m.name', lang)} AS name, m.category, cpm.is_required, cpm.quantity
         FROM craft_project_materials cpm
         JOIN materials m ON m.id = cpm.material_id
        WHERE cpm.project_id = ?`,
    ).all(projectId);
    const compareName = byName(lang);
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        isRequired: row.is_required === 1,
        quantity: row.quantity,
      }))
      .sort((a, b) => Number(b.isRequired) - Number(a.isRequired) || compareName(a, b));
  }

  /** All project materials grouped by project id: Map<projectId, [{ id, name, category, isRequired }]>. */
  function materialsByProject(lang) {
    const rows = prepare(
      `SELECT cpm.project_id, m.id, ${localized('m.name', lang)} AS name, m.category, cpm.is_required
         FROM craft_project_materials cpm
         JOIN materials m ON m.id = cpm.material_id`,
    ).all();
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.project_id)) grouped.set(row.project_id, []);
      grouped.get(row.project_id).push({
        id: row.id,
        name: row.name,
        category: row.category,
        isRequired: row.is_required === 1,
      });
    }
    const compareName = byName(lang);
    for (const list of grouped.values()) list.sort(compareName);
    return grouped;
  }

  /**
   * Catalog (no `materials`) or recommendations (with `materials`).
   * @param {{ lang: 'uk'|'en', sort: string, materials?: number[], difficulty?: string[], category?: string, q?: string }} filters
   * @returns {{ items: object[], total: number }}
   */
  function listIdeas({ lang, sort, materials, difficulty, category, q }) {
    const where = [];
    const params = [];
    if (difficulty?.length) {
      where.push(`difficulty IN (${difficulty.map(() => '?').join(', ')})`);
      params.push(...difficulty);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (q) {
      const needle = q.toLowerCase();
      where.push(
        '(instr(unicode_lower(title_uk), ?) > 0 OR instr(unicode_lower(title_en), ?) > 0)',
      );
      params.push(needle, needle);
    }

    const sql = `SELECT id, ${localized('title', lang)} AS title, ${localized('description', lang)} AS description,
                        category, difficulty, estimated_time, photo_url, created_at
                   FROM craft_projects
                  ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const ideas = prepare(sql)
      .all(...params)
      .map(toIdeaSummary);

    let items;
    if (materials) {
      const grouped = materialsByProject(lang);
      const candidates = ideas.map((idea) => ({ ...idea, materials: grouped.get(idea.id) ?? [] }));
      items = recommend(candidates, materials, { sort }).map(
        ({ materials: _materials, ...idea }) => ({
          ...idea,
          missingMaterials: idea.missingMaterials.map(toMaterial),
        }),
      );
    } else {
      items = sortProjects(ideas, sort);
    }
    return { items, total: items.length };
  }

  /** Full idea (master class) or `null` when it does not exist. */
  function getIdea(id, lang) {
    const row = prepare(
      `SELECT id, ${localized('title', lang)} AS title, ${localized('description', lang)} AS description,
              category, difficulty, estimated_time, photo_url, created_at, updated_at
         FROM craft_projects WHERE id = ?`,
    ).get(id);
    if (!row) return null;

    const tools = prepare(
      `SELECT t.id, ${localized('t.name', lang)} AS name
         FROM craft_project_tools cpt JOIN tools t ON t.id = cpt.tool_id
        WHERE cpt.project_id = ?`,
    )
      .all(id)
      .sort(byName(lang));

    const steps = prepare(
      `SELECT step_number AS number, ${localized('text', lang)} AS text
         FROM craft_project_steps WHERE project_id = ? ORDER BY step_number`,
    ).all(id);

    return {
      ...toIdeaSummary(row),
      updatedAt: row.updated_at,
      materials: projectMaterials(id, lang),
      tools,
      steps,
    };
  }

  /** `undefined` when the idea does not exist, otherwise its photo_url (may be null). */
  function getPhotoUrl(id) {
    const row = prepare('SELECT photo_url FROM craft_projects WHERE id = ?').get(id);
    return row ? row.photo_url : undefined;
  }

  function ideaExists(id) {
    return getPhotoUrl(id) !== undefined;
  }

  const unknownIds = (table) => (ids) => {
    const statement = prepare(`SELECT 1 FROM ${table} WHERE id = ?`);
    return ids.filter((id) => statement.get(id) === undefined);
  };
  /** Returns the ids that do not exist in `materials`. */
  const findUnknownMaterialIds = unknownIds('materials');
  /** Returns the ids that do not exist in `tools`. */
  const findUnknownToolIds = unknownIds('tools');

  function insertChildren(id, form) {
    const lang = assertLang(form.lang);
    const insertMaterial = prepare(
      `INSERT INTO craft_project_materials (project_id, material_id, quantity, is_required)
       VALUES (?, ?, ?, ?)`,
    );
    for (const material of form.materials) {
      insertMaterial.run(id, material.materialId, material.quantity, material.isRequired ? 1 : 0);
    }
    const insertTool = prepare(
      'INSERT INTO craft_project_tools (project_id, tool_id) VALUES (?, ?)',
    );
    for (const toolId of form.tools) {
      insertTool.run(id, toolId);
    }
    const insertStep = prepare(
      `INSERT INTO craft_project_steps (project_id, step_number, text_${lang}) VALUES (?, ?, ?)`,
    );
    form.steps.forEach((text, index) => insertStep.run(id, index + 1, text));
  }

  /**
   * Creates an idea; text goes into the columns of `form.lang`.
   * @param {object} form output of ideaFormSchema
   * @param {string} photoUrl
   * @returns {number} new idea id
   */
  const createIdea = db.transaction((form, photoUrl) => {
    const lang = assertLang(form.lang);
    const { lastInsertRowid } = prepare(
      `INSERT INTO craft_projects (title_${lang}, description_${lang}, category, difficulty, estimated_time, photo_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      form.title,
      form.description,
      form.category,
      form.difficulty,
      form.estimatedTime,
      photoUrl,
    );
    const id = Number(lastInsertRowid);
    insertChildren(id, form);
    return id;
  });

  /**
   * Replaces all fields of an idea. Text is written in `form.lang` and the other language's text is
   * cleared. When `photoUrl` is undefined the current photo is kept.
   * @returns {boolean} false when the idea does not exist
   */
  const updateIdea = db.transaction((id, form, photoUrl) => {
    const lang = assertLang(form.lang);
    const other = OTHER_LANG[lang];
    const { changes } = prepare(
      `UPDATE craft_projects
          SET title_${lang} = ?, title_${other} = NULL,
              description_${lang} = ?, description_${other} = NULL,
              category = ?, difficulty = ?, estimated_time = ?,
              photo_url = CASE WHEN ? THEN ? ELSE photo_url END,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`,
    ).run(
      form.title,
      form.description,
      form.category,
      form.difficulty,
      form.estimatedTime,
      photoUrl === undefined ? 0 : 1,
      photoUrl ?? null,
      id,
    );
    if (changes === 0) return false;

    for (const table of ['craft_project_materials', 'craft_project_tools', 'craft_project_steps']) {
      prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(id);
    }
    insertChildren(id, form);
    return true;
  });

  /**
   * Deletes an idea (child rows cascade).
   * @returns {{ deleted: boolean, photoUrl: string|null }}
   */
  const deleteIdea = db.transaction((id) => {
    const photoUrl = getPhotoUrl(id);
    if (photoUrl === undefined) return { deleted: false, photoUrl: null };
    prepare('DELETE FROM craft_projects WHERE id = ?').run(id);
    return { deleted: true, photoUrl };
  });

  return {
    listMaterials,
    listTools,
    listIdeas,
    getIdea,
    getPhotoUrl,
    ideaExists,
    findUnknownMaterialIds,
    findUnknownToolIds,
    createIdea,
    updateIdea,
    deleteIdea,
  };
}
