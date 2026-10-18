import { AppError, notFoundError } from '../errors.js';

// Statuses raised by Express itself or serve-static -> [status sent, code, message].
// 403 (e.g. a dotfile under /uploads) is reported as 404 so the contract's error codes suffice.
const FRAMEWORK_ERRORS = {
  400: [400, 'VALIDATION_ERROR', 'Malformed request'],
  403: [404, 'NOT_FOUND', 'Resource not found'],
  404: [404, 'NOT_FOUND', 'Resource not found'],
  413: [413, 'PAYLOAD_TOO_LARGE', 'Request is too large'],
  415: [415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type'],
};

/** Terminal handler for unknown /api/* routes. */
export function apiNotFound(req, _res, next) {
  next(notFoundError(`Route ${req.method} ${req.baseUrl}${req.path} not found`));
}

/**
 * Single error handler: every error becomes `{ error: { code, message, details? } }`.
 * Unexpected errors are logged and reported as 500 INTERNAL_ERROR without internals.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Too late for a JSON body; let Express close the connection.
    next(err);
    return;
  }

  let status;
  let body;

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message };
    if (err.details?.length) body.details = err.details;
  } else {
    // Errors raised by Express/its middleware (e.g. malformed URL, missing static file) carry a status.
    const known = FRAMEWORK_ERRORS[err?.status ?? err?.statusCode];
    if (known) {
      let code, message;
      [status, code, message] = known;
      body = { code, message };
    } else {
      console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
      status = 500;
      body = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
    }
  }

  res.status(status).json({ error: body });
}
