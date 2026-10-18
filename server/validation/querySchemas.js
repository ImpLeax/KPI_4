import { z } from 'zod';

export const LANGS = ['uk', 'en'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const IDEA_CATEGORIES = ['decor', 'storage', 'garden', 'toys', 'accessories', 'household'];
export const SORTS = ['difficulty_asc', 'difficulty_desc', 'time_asc', 'newest'];
export const Q_MAX_LENGTH = 100;

const ID_PATTERN = /^[1-9]\d{0,15}$/;

/** Treats an empty query value (`?category=`) the same as an absent one. */
const optionalQuery = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const langSchema = z.enum(LANGS);

/** `?lang=uk|en`, default `uk`. */
export const langQuerySchema = z.object({
  lang: optionalQuery(langSchema).transform((lang) => lang ?? 'uk'),
});

/** Path parameter `:id` — a positive integer. */
export const ideaIdParamSchema = z.object({
  id: z
    .string()
    .regex(ID_PATTERN, 'Must be a positive integer')
    .transform(Number)
    .refine(Number.isSafeInteger, 'Must be a positive integer'),
});

/** Comma-separated list of positive integer ids, e.g. "1,4,7" -> [1, 4, 7] (deduplicated, order kept). */
const idListSchema = z
  .string()
  .max(1000)
  .transform((value, ctx) => {
    const parts = value.split(',').map((part) => part.trim());
    if (!parts.every((part) => ID_PATTERN.test(part))) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be a comma-separated list of positive integer ids',
      });
      return z.NEVER;
    }
    return [...new Set(parts.map(Number))];
  });

/** Comma-separated list of difficulty levels, e.g. "easy,medium" (deduplicated). */
const difficultyListSchema = z
  .string()
  .max(100)
  .transform((value, ctx) => {
    const parts = value.split(',').map((part) => part.trim());
    if (!parts.every((part) => DIFFICULTIES.includes(part))) {
      ctx.addIssue({
        code: 'custom',
        message: `Must be a comma-separated list of: ${DIFFICULTIES.join(', ')}`,
      });
      return z.NEVER;
    }
    return [...new Set(parts)];
  });

/**
 * GET /api/ideas query. Empty values are treated as absent.
 * Output: `{ lang, sort, materials?: number[], difficulty?: string[], category?: string, q?: string }`.
 */
export const ideasQuerySchema = z.object({
  lang: optionalQuery(langSchema).transform((lang) => lang ?? 'uk'),
  materials: optionalQuery(idListSchema),
  difficulty: optionalQuery(difficultyListSchema),
  category: optionalQuery(z.enum(IDEA_CATEGORIES)),
  q: optionalQuery(z.string().trim().max(Q_MAX_LENGTH)).transform((q) => (q ? q : undefined)),
  sort: optionalQuery(z.enum(SORTS)).transform((sort) => sort ?? 'difficulty_asc'),
});
