/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validates a request body and hands Zod errors straight to the error
 * middleware, which turns them into a 422 with per-field messages.
 */
export function parse(schema, body) {
  return schema.parse(body);
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, message, extra);
export const unauthorized = (message = "Not authenticated") => new HttpError(401, message);
export const forbidden = (message) => new HttpError(403, message);
export const conflict = (message, extra) => new HttpError(409, message, extra);
export const notFound = (message = "Not found") => new HttpError(404, message);
