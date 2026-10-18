/** An error that maps directly to an API error response `{ error: { code, message, details? } }`. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationError = (message, details) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const notFoundError = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);

export const payloadTooLargeError = (message, details) =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message, details);

export const unsupportedMediaTypeError = (message, details) =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message, details);

export const rateLimitedError = () =>
  new AppError(429, 'RATE_LIMITED', 'Too many write requests, please try again later');
