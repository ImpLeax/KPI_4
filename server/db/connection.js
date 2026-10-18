import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA_PATH = path.join(import.meta.dirname, 'schema.sql');
const SEED_PATH = path.join(import.meta.dirname, 'seed.sql');

/**
 * Opens a SQLite database. Use ':memory:' for an in-memory database (tests).
 * Foreign keys are always enabled; file databases use WAL journaling.
 */
export function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:' && dbPath !== '') {
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/** True when the application tables have not been created yet. */
export function isDatabaseEmpty(db) {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'craft_projects'")
    .get();
  return row === undefined;
}

/**
 * (Re)creates all tables from schema.sql and loads seed.sql.
 * A missing or empty seed.sql is tolerated (the database is then left empty).
 */
export function initDatabase(db) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const seed = fs.existsSync(SEED_PATH) ? fs.readFileSync(SEED_PATH, 'utf8') : '';
  if (seed.trim() !== '') {
    db.exec(seed);
  }
  // schema.sql toggles the pragma itself; make sure it stays on afterwards.
  db.pragma('foreign_keys = ON');
}
