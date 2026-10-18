import { z } from 'zod';
import { DIFFICULTIES, IDEA_CATEGORIES, LANGS } from './querySchemas.js';

export const FORM_LIMITS = Object.freeze({
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

const L = FORM_LIMITS;

/**
 * Error map for type/enum mismatches: 'Field is required' for a missing value, 'Expected ...' for a
 * wrong one. Other issues (min/max, ...) fall through to zod's default messages.
 */
const requiredMessage = (expected) => (issue) => {
  if (issue.code !== 'invalid_type' && issue.code !== 'invalid_value') return undefined;
  return issue.input === undefined ? 'Field is required' : `Expected ${expected}`;
};

/** A multipart text field holding a JSON document that is then validated by `schema`. */
const jsonField = (schema) =>
  z
    .string({ error: requiredMessage('a JSON string') })
    .transform((value, ctx) => {
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Must be a valid JSON string' });
        return z.NEVER;
      }
    })
    .pipe(schema);

const positiveId = z.number().int().positive();

export const materialEntrySchema = z.object({
  materialId: positiveId,
  isRequired: z.boolean(),
  quantity: z
    .string()
    .trim()
    .max(L.quantityMax)
    .nullable()
    .optional()
    .transform((quantity) => (quantity ? quantity : null)),
});

/** Parsed `materials` array: 1..20 entries, unique materialId, at least one required. */
export const materialsSchema = z
  .array(materialEntrySchema)
  .min(L.materialsMin)
  .max(L.materialsMax)
  .superRefine((materials, ctx) => {
    const seen = new Set();
    materials.forEach((material, index) => {
      if (seen.has(material.materialId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate materialId',
          path: [index, 'materialId'],
        });
      }
      seen.add(material.materialId);
    });
    if (materials.length > 0 && !materials.some((material) => material.isRequired)) {
      ctx.addIssue({ code: 'custom', message: 'At least one material must be required' });
    }
  });

/** Parsed `tools` array: 0..15 unique tool ids. */
export const toolsSchema = z
  .array(positiveId)
  .max(L.toolsMax)
  .superRefine((tools, ctx) => {
    tools.forEach((toolId, index) => {
      if (tools.indexOf(toolId) !== index) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate tool id', path: [index] });
      }
    });
  });

/** Parsed `steps` array: 1..30 step texts, each 3..1000 characters after trimming. */
export const stepsSchema = z
  .array(z.string().trim().min(L.stepMin).max(L.stepMax))
  .min(L.stepsMin)
  .max(L.stepsMax);

/**
 * Body of POST/PUT /api/ideas (multipart/form-data text fields; all values arrive as strings).
 * Output: `{ lang, title, description: string|null, category, difficulty, estimatedTime: number,
 *            materials: [{ materialId, isRequired, quantity: string|null }], tools: number[], steps: string[] }`.
 * The photo is validated separately (see middleware/upload.js).
 */
export const ideaFormSchema = z.object({
  lang: z.enum(LANGS, { error: requiredMessage(`one of: ${LANGS.join(', ')}`) }),
  title: z
    .string({ error: requiredMessage('a string') })
    .trim()
    .min(L.titleMin)
    .max(L.titleMax),
  description: z
    .string({ error: requiredMessage('a string') })
    .trim()
    .max(L.descriptionMax)
    .optional()
    .transform((description) => (description ? description : null)),
  category: z.enum(IDEA_CATEGORIES, {
    error: requiredMessage(`one of: ${IDEA_CATEGORIES.join(', ')}`),
  }),
  difficulty: z.enum(DIFFICULTIES, {
    error: requiredMessage(`one of: ${DIFFICULTIES.join(', ')}`),
  }),
  estimatedTime: z.preprocess(
    (value) => (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value) ? Number(value) : value),
    z
      .number({ error: requiredMessage('an integer') })
      .int()
      .min(L.estimatedTimeMin)
      .max(L.estimatedTimeMax),
  ),
  materials: jsonField(materialsSchema),
  tools: z.preprocess(
    (value) => (value === undefined || value === '' ? '[]' : value),
    jsonField(toolsSchema),
  ),
  steps: jsonField(stepsSchema),
});
