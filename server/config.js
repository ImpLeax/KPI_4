import path from 'node:path';

/** Absolute path of the project root (the directory that contains package.json). */
export const projectRoot = path.resolve(import.meta.dirname, '..');

const DEFAULT_RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function resolveFromRoot(value) {
  return path.resolve(projectRoot, value);
}

function parsePort(value) {
  if (value === undefined || value === '') return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

/**
 * RATE_LIMIT controls write rate limiting (POST/PUT/DELETE, per client IP, per 15 minutes):
 * - unset            -> 100 requests per window
 * - "0" | "off" | "false" -> disabled
 * - positive integer -> that many requests per window
 */
function parseRateLimit(value) {
  if (value === undefined || value === '') {
    return { windowMs: RATE_LIMIT_WINDOW_MS, limit: DEFAULT_RATE_LIMIT };
  }
  const normalized = value.trim().toLowerCase();
  if (['0', 'off', 'false'].includes(normalized)) return false;
  const limit = Number(normalized);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid RATE_LIMIT value: ${value}`);
  }
  return { windowMs: RATE_LIMIT_WINDOW_MS, limit };
}

function parseDbPath(value) {
  const dbPath = value || 'data/upcycling.db';
  return dbPath === ':memory:' ? dbPath : resolveFromRoot(dbPath);
}

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT),
    dbPath: parseDbPath(env.DB_PATH),
    uploadDir: resolveFromRoot(env.UPLOAD_DIR || 'uploads'),
    publicDir: resolveFromRoot('public'),
    rateLimit: parseRateLimit(env.RATE_LIMIT),
  };
}

export const config = loadConfig();
