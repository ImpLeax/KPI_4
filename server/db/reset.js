// Deletes the database at config.dbPath (if any) and re-creates it from schema.sql + seed.sql.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { initDatabase, openDatabase } from './connection.js';

function resetDatabase(dbPath) {
  if (dbPath === ':memory:') {
    throw new Error('DB_PATH=:memory: cannot be reset; nothing is stored on disk');
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  const db = openDatabase(dbPath);
  try {
    initDatabase(db);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM craft_projects').get();
    console.log(`Database reset: ${dbPath} (${count} ideas)`);
  } finally {
    db.close();
  }
}

resetDatabase(config.dbPath);
