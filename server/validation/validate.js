import { validationError } from '../errors.js';

/** Formats a zod issue path, e.g. ['materials', 1, 'materialId'] -> 'materials[1].materialId'. */
export function formatPath(path) {
  return path.reduce((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc === '' ? String(key) : `${acc}.${String(key)}`;
  }, '');
}

/** Converts a ZodError into the API `details` array: `[{ field, message }]`. */
export function toErrorDetails(zodError) {
  return zodError.issues.map((issue) => ({
    field: formatPath(issue.path),
    message: issue.message,
  }));
}

/**
 * Parses `data` with `schema`; on failure throws a 400 VALIDATION_ERROR AppError.
 * @returns the parsed (and transformed) data
 */
export function parseOrThrow(schema, data, message = 'Invalid input') {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError(message, toErrorDetails(result.error));
  }
  return result.data;
}
