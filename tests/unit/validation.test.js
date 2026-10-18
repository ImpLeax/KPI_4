import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FORM_LIMITS,
  ideaFormSchema,
  ideaIdParamSchema,
  ideasQuerySchema,
  langQuerySchema,
  materialsSchema,
  parseOrThrow,
  stepsSchema,
  toErrorDetails,
  toolsSchema,
} from '../../server/validation/index.js';

const validForm = (overrides = {}) => ({
  lang: 'uk',
  title: 'Bottle planter',
  description: 'Short description',
  category: 'garden',
  difficulty: 'easy',
  estimatedTime: '30',
  materials: JSON.stringify([{ materialId: 1, isRequired: true, quantity: '2 pcs' }]),
  tools: JSON.stringify([1]),
  steps: JSON.stringify(['Cut the bottle']),
  ...overrides,
});

/** Field paths of the issues produced by parsing `data` with `schema`. */
function errorFields(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return [];
  return toErrorDetails(result.error).map((detail) => detail.field);
}

const material = (materialId, isRequired = true, quantity) => ({
  materialId,
  isRequired,
  ...(quantity === undefined ? {} : { quantity }),
});

describe('FORM_LIMITS', () => {
  it('matches the limits documented in openapi.yaml', () => {
    expect(FORM_LIMITS).toMatchObject({
      titleMin: 3,
      titleMax: 120,
      descriptionMax: 1000,
      estimatedTimeMin: 1,
      estimatedTimeMax: 1440,
      materialsMin: 1,
      materialsMax: 20,
      quantityMax: 50,
      toolsMax: 15,
      stepsMin: 1,
      stepsMax: 30,
      stepMin: 3,
      stepMax: 1000,
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FORM_LIMITS)).toBe(true);
  });
});

describe('ideaFormSchema', () => {
  it('accepts a valid form and converts the JSON fields', () => {
    const result = ideaFormSchema.parse(validForm());
    expect(result).toEqual({
      lang: 'uk',
      title: 'Bottle planter',
      description: 'Short description',
      category: 'garden',
      difficulty: 'easy',
      estimatedTime: 30,
      materials: [{ materialId: 1, isRequired: true, quantity: '2 pcs' }],
      tools: [1],
      steps: ['Cut the bottle'],
    });
  });

  describe('title (3..120 after trim)', () => {
    it.each([
      [2, false],
      [3, true],
      [120, true],
      [121, false],
    ])('length %i -> valid: %s', (length, valid) => {
      const result = ideaFormSchema.safeParse(validForm({ title: 'a'.repeat(length) }));
      expect(result.success).toBe(valid);
      if (!valid)
        expect(errorFields(ideaFormSchema, validForm({ title: 'a'.repeat(length) }))).toEqual([
          'title',
        ]);
    });

    it('trims surrounding whitespace before checking the length', () => {
      expect(ideaFormSchema.safeParse(validForm({ title: '   ab   ' })).success).toBe(false);
      expect(ideaFormSchema.parse(validForm({ title: '  abc  ' })).title).toBe('abc');
    });

    it('reports a missing title as "Field is required"', () => {
      const form = validForm();
      delete form.title;
      const details = toErrorDetails(ideaFormSchema.safeParse(form).error);
      expect(details).toEqual([{ field: 'title', message: 'Field is required' }]);
    });
  });

  describe('estimatedTime (integer 1..1440)', () => {
    it.each([
      ['0', false],
      ['1', true],
      ['1440', true],
      ['1441', false],
      ['-5', false],
      ['12.5', false],
      ['abc', false],
      ['', false],
    ])('%j -> valid: %s', (value, valid) => {
      expect(ideaFormSchema.safeParse(validForm({ estimatedTime: value })).success).toBe(valid);
    });

    it('converts the string value to a number', () => {
      expect(ideaFormSchema.parse(validForm({ estimatedTime: ' 1440 ' })).estimatedTime).toBe(1440);
    });
  });

  describe('description (optional, up to 1000)', () => {
    it('accepts exactly 1000 characters and rejects 1001', () => {
      expect(ideaFormSchema.safeParse(validForm({ description: 'd'.repeat(1000) })).success).toBe(
        true,
      );
      expect(errorFields(ideaFormSchema, validForm({ description: 'd'.repeat(1001) }))).toEqual([
        'description',
      ]);
    });

    it('turns a missing, empty or blank description into null', () => {
      const form = validForm();
      delete form.description;
      expect(ideaFormSchema.parse(form).description).toBeNull();
      expect(ideaFormSchema.parse(validForm({ description: '' })).description).toBeNull();
      expect(ideaFormSchema.parse(validForm({ description: '   ' })).description).toBeNull();
    });
  });

  describe('enums', () => {
    it.each(['decor', 'storage', 'garden', 'toys', 'accessories', 'household'])(
      'accepts category %s',
      (category) => {
        expect(ideaFormSchema.safeParse(validForm({ category })).success).toBe(true);
      },
    );

    it.each(['easy', 'medium', 'hard'])('accepts difficulty %s', (difficulty) => {
      expect(ideaFormSchema.safeParse(validForm({ difficulty })).success).toBe(true);
    });

    it('rejects unknown lang, category and difficulty with "Expected ..." messages', () => {
      const result = ideaFormSchema.safeParse(
        validForm({ lang: 'de', category: 'kitchen', difficulty: 'extreme' }),
      );
      const details = toErrorDetails(result.error);
      expect(details.map((d) => d.field).sort()).toEqual(['category', 'difficulty', 'lang']);
      for (const detail of details) expect(detail.message).toMatch(/^Expected /);
    });
  });

  describe('JSON fields', () => {
    it('rejects materials that are not valid JSON', () => {
      const details = toErrorDetails(
        ideaFormSchema.safeParse(validForm({ materials: '[{materialId:1' })).error,
      );
      expect(details).toEqual([{ field: 'materials', message: 'Must be a valid JSON string' }]);
    });

    it('treats a missing or empty tools field as an empty list', () => {
      const form = validForm();
      delete form.tools;
      expect(ideaFormSchema.parse(form).tools).toEqual([]);
      expect(ideaFormSchema.parse(validForm({ tools: '' })).tools).toEqual([]);
    });

    it('reports nested material errors with an indexed path', () => {
      const materials = JSON.stringify([material(1), { materialId: 'x', isRequired: true }]);
      expect(errorFields(ideaFormSchema, validForm({ materials }))).toEqual([
        'materials[1].materialId',
      ]);
    });

    it('reports every invalid field at once', () => {
      const fields = errorFields(ideaFormSchema, {
        lang: 'uk',
        title: 'ab',
        category: 'garden',
        difficulty: 'easy',
        estimatedTime: '0',
        materials: '[]',
        steps: '[]',
      });
      expect(fields.sort()).toEqual(['estimatedTime', 'materials', 'steps', 'title']);
    });

    it('reports all required fields as missing for an empty body', () => {
      const fields = errorFields(ideaFormSchema, {});
      expect(fields.sort()).toEqual(
        ['category', 'difficulty', 'estimatedTime', 'lang', 'materials', 'steps', 'title'].sort(),
      );
    });
  });
});

describe('materialsSchema (1..20, unique, at least one required)', () => {
  const many = (count) => Array.from({ length: count }, (_, i) => material(i + 1));

  it.each([
    [0, false],
    [1, true],
    [20, true],
    [21, false],
  ])('%i materials -> valid: %s', (count, valid) => {
    expect(materialsSchema.safeParse(many(count)).success).toBe(valid);
  });

  it('rejects a list where no material is required', () => {
    const result = materialsSchema.safeParse([material(1, false), material(2, false)]);
    expect(result.success).toBe(false);
    expect(toErrorDetails(result.error)[0].message).toBe('At least one material must be required');
  });

  it('accepts a list with one required and several optional materials', () => {
    expect(
      materialsSchema.safeParse([material(1), material(2, false), material(3, false)]).success,
    ).toBe(true);
  });

  it('rejects a duplicate materialId and points at the duplicate entry', () => {
    const details = toErrorDetails(
      materialsSchema.safeParse([material(1), material(2), material(1, false)]).error,
    );
    expect(details).toEqual([{ field: '[2].materialId', message: 'Duplicate materialId' }]);
  });

  it.each([0, -1, 1.5, '1'])('rejects materialId %j', (materialId) => {
    expect(materialsSchema.safeParse([{ materialId, isRequired: true }]).success).toBe(false);
  });

  it('requires isRequired to be a boolean', () => {
    expect(materialsSchema.safeParse([{ materialId: 1, isRequired: 'true' }]).success).toBe(false);
    expect(materialsSchema.safeParse([{ materialId: 1 }]).success).toBe(false);
  });

  it('accepts a 50-character quantity and rejects 51', () => {
    expect(materialsSchema.safeParse([material(1, true, 'q'.repeat(50))]).success).toBe(true);
    expect(materialsSchema.safeParse([material(1, true, 'q'.repeat(51))]).success).toBe(false);
  });

  it('normalises a missing, null, empty or blank quantity to null', () => {
    const parsed = materialsSchema.parse([
      material(1),
      material(2, false, null),
      material(3, false, ''),
      material(4, false, '   '),
      material(5, false, ' 2 pcs '),
    ]);
    expect(parsed.map((m) => m.quantity)).toEqual([null, null, null, null, '2 pcs']);
  });
});

describe('toolsSchema (0..15 unique ids)', () => {
  const many = (count) => Array.from({ length: count }, (_, i) => i + 1);

  it.each([
    [0, true],
    [1, true],
    [15, true],
    [16, false],
  ])('%i tools -> valid: %s', (count, valid) => {
    expect(toolsSchema.safeParse(many(count)).success).toBe(valid);
  });

  it('rejects duplicate tool ids and points at the duplicate', () => {
    const details = toErrorDetails(toolsSchema.safeParse([1, 2, 1]).error);
    expect(details).toEqual([{ field: '[2]', message: 'Duplicate tool id' }]);
  });

  it.each([0, -3, 2.5, '1', null])('rejects tool id %j', (toolId) => {
    expect(toolsSchema.safeParse([toolId]).success).toBe(false);
  });
});

describe('stepsSchema (1..30 steps, each 3..1000 chars)', () => {
  const many = (count) => Array.from({ length: count }, (_, i) => `Step number ${i + 1}`);

  it.each([
    [0, false],
    [1, true],
    [30, true],
    [31, false],
  ])('%i steps -> valid: %s', (count, valid) => {
    expect(stepsSchema.safeParse(many(count)).success).toBe(valid);
  });

  it.each([
    [2, false],
    [3, true],
    [1000, true],
    [1001, false],
  ])('step text of length %i -> valid: %s', (length, valid) => {
    expect(stepsSchema.safeParse(['s'.repeat(length)]).success).toBe(valid);
  });

  it('trims step texts and checks the trimmed length', () => {
    expect(stepsSchema.parse(['  abc  '])).toEqual(['abc']);
    expect(stepsSchema.safeParse(['  ab  ']).success).toBe(false);
  });

  it('reports the index of an invalid step', () => {
    const details = toErrorDetails(stepsSchema.safeParse(['Valid step', 'no']).error);
    expect(details.map((d) => d.field)).toEqual(['[1]']);
  });
});

describe('ideasQuerySchema', () => {
  it('applies defaults when the query is empty', () => {
    expect(ideasQuerySchema.parse({})).toEqual({ lang: 'uk', sort: 'difficulty_asc' });
  });

  it('treats empty values as absent (catalog mode for materials=)', () => {
    const parsed = ideasQuerySchema.parse({
      materials: '',
      difficulty: '',
      category: '',
      q: '',
      sort: '',
      lang: '',
    });
    expect(parsed).toEqual({ lang: 'uk', sort: 'difficulty_asc' });
    expect(parsed.materials).toBeUndefined();
  });

  it('parses, trims and deduplicates the materials list keeping order', () => {
    expect(ideasQuerySchema.parse({ materials: '4, 1,4 ,7' }).materials).toEqual([4, 1, 7]);
  });

  it.each(['1,,2', '0', '-1', 'a', '1.5', '1,', '01'])('rejects materials=%j', (materials) => {
    expect(errorFields(ideasQuerySchema, { materials })).toEqual(['materials']);
  });

  it('parses and deduplicates difficulty levels', () => {
    expect(ideasQuerySchema.parse({ difficulty: 'easy,hard,easy' }).difficulty).toEqual([
      'easy',
      'hard',
    ]);
  });

  it('rejects an unknown difficulty level', () => {
    expect(errorFields(ideasQuerySchema, { difficulty: 'easy,expert' })).toEqual(['difficulty']);
  });

  it('rejects unknown category, sort and lang values', () => {
    const fields = errorFields(ideasQuerySchema, { category: 'food', sort: 'name', lang: 'de' });
    expect(fields.sort()).toEqual(['category', 'lang', 'sort']);
  });

  it('accepts a 100-character search query and rejects 101', () => {
    expect(ideasQuerySchema.safeParse({ q: 'q'.repeat(100) }).success).toBe(true);
    expect(errorFields(ideasQuerySchema, { q: 'q'.repeat(101) })).toEqual(['q']);
  });

  it('treats a blank search query as absent', () => {
    expect(ideasQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('rejects a repeated query parameter (array value)', () => {
    expect(ideasQuerySchema.safeParse({ materials: ['1', '2'] }).success).toBe(false);
  });
});

describe('langQuerySchema', () => {
  it.each([
    [{}, 'uk'],
    [{ lang: '' }, 'uk'],
    [{ lang: 'uk' }, 'uk'],
    [{ lang: 'en' }, 'en'],
  ])('%j -> %s', (query, lang) => {
    expect(langQuerySchema.parse(query).lang).toBe(lang);
  });

  it.each(['EN', 'de', 'ua'])('rejects lang=%s', (lang) => {
    expect(langQuerySchema.safeParse({ lang }).success).toBe(false);
  });
});

describe('ideaIdParamSchema', () => {
  it.each([
    ['1', 1],
    ['25', 25],
    ['9007199254740991', 9007199254740991],
  ])('accepts %j', (id, expected) => {
    expect(ideaIdParamSchema.parse({ id }).id).toBe(expected);
  });

  it.each(['0', '-1', 'abc', '1.5', '01', '', '9007199254740993', '1e3'])('rejects %j', (id) => {
    expect(ideaIdParamSchema.safeParse({ id }).success).toBe(false);
  });
});

describe('toErrorDetails and parseOrThrow', () => {
  it('formats nested paths as dotted/indexed field names', () => {
    const schema = z.object({ materials: z.array(z.object({ materialId: z.number() })) });
    const result = schema.safeParse({ materials: [{ materialId: 1 }, { materialId: 'x' }] });
    expect(toErrorDetails(result.error)).toEqual([
      { field: 'materials[1].materialId', message: expect.any(String) },
    ]);
  });

  it('returns parsed data on success', () => {
    expect(parseOrThrow(langQuerySchema, { lang: 'en' })).toEqual({ lang: 'en' });
  });

  it('throws a 400 VALIDATION_ERROR with details on failure', () => {
    let thrown;
    try {
      parseOrThrow(langQuerySchema, { lang: 'xx' }, 'Invalid query parameters');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid query parameters',
      details: [{ field: 'lang', message: expect.any(String) }],
    });
  });
});
