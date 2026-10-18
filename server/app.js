import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { rateLimit as createRateLimiter } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { rateLimitedError } from './errors.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { createIdeasRouter } from './routes/ideas.js';
import { createMaterialsRouter } from './routes/materials.js';
import { createToolsRouter } from './routes/tools.js';
import { createIdeasRepository } from './services/ideasRepository.js';

const OPENAPI_PATH = path.join(import.meta.dirname, 'docs', 'openapi.yaml');
const DEFAULT_PUBLIC_DIR = path.resolve(import.meta.dirname, '..', 'public');
const DEFAULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 100 };
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const BASE_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  // The app is served over plain HTTP (localhost / LAN); upgrading would break asset loading.
  upgradeInsecureRequests: null,
};

// Swagger UI (swagger-ui-express) injects inline <style> blocks and inline style attributes.
const DOCS_CSP_DIRECTIVES = {
  ...BASE_CSP_DIRECTIVES,
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
};

function loadOpenApiSpec() {
  const spec = YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  // "Try it out" must call the origin the docs were loaded from, whatever host/port that is.
  spec.servers = [{ url: '/' }];
  return spec;
}

function writeRateLimiter(options) {
  const { windowMs, limit } = { ...DEFAULT_RATE_LIMIT, ...(options === true ? {} : options) };
  return createRateLimiter({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => !WRITE_METHODS.has(req.method),
    handler: (_req, _res, next) => next(rateLimitedError()),
  });
}

/**
 * Builds the Express application. No side effects: does not listen and does not open a database.
 *
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db initialised database (schema + data)
 * @param {string} options.uploadDir directory for uploaded photos (created on first upload), served at /uploads
 * @param {false | true | { windowMs?: number, limit?: number }} [options.rateLimit=false]
 *   write (POST/PUT/DELETE) rate limiting per client IP; disabled by default so tests are deterministic
 * @param {string} [options.publicDir] static frontend directory (defaults to <project>/public)
 */
export function createApp({ db, uploadDir, rateLimit = false, publicDir = DEFAULT_PUBLIC_DIR }) {
  if (!db) throw new TypeError('createApp: "db" is required');
  if (!uploadDir) throw new TypeError('createApp: "uploadDir" is required');

  const repository = createIdeasRepository(db);
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: BASE_CSP_DIRECTIVES },
      // Browsers ignore COOP on plain-HTTP non-localhost origins and log a console error;
      // the app opens no popups, so the header adds nothing when shared over LAN/IP.
      crossOriginOpenerPolicy: false,
    }),
  );

  const spec = loadOpenApiSpec();
  const swaggerOptions = {
    customSiteTitle: 'Upcycling Ideas API',
    swaggerOptions: { validatorUrl: null },
  };
  app.use(
    '/api/docs',
    helmet.contentSecurityPolicy({ useDefaults: true, directives: DOCS_CSP_DIRECTIVES }),
    swaggerUi.serveFiles(spec, swaggerOptions),
    swaggerUi.setup(spec, swaggerOptions),
  );

  if (rateLimit) {
    app.use('/api', writeRateLimiter(rateLimit));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/materials', createMaterialsRouter({ repository }));
  app.use('/api/tools', createToolsRouter({ repository }));
  app.use('/api/ideas', createIdeasRouter({ repository, uploadDir }));
  app.use('/api', apiNotFound);

  app.use(
    '/uploads',
    express.static(uploadDir, { index: false, dotfiles: 'deny', fallthrough: false }),
  );
  app.use(express.static(publicDir));
  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  app.use(errorHandler);
  return app;
}
