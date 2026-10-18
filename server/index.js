import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { config } from './config.js';
import { initDatabase, isDatabaseEmpty, openDatabase } from './db/connection.js';

if (config.dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = openDatabase(config.dbPath);
if (isDatabaseEmpty(db)) {
  initDatabase(db);
  console.log(`Initialised database from schema.sql + seed.sql: ${config.dbPath}`);
}

const app = createApp({ db, uploadDir: config.uploadDir, rateLimit: config.rateLimit });

const server = app.listen(config.port, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    db.close();
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${config.port} (API docs: /api/docs)`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Do not hang on keep-alive connections.
  server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
