import { ZodError } from "zod";
import { HttpError } from "./asyncHandler.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "Validation failed",
      fields: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }

  // Unique violation (23505) -> friendly duplicate account message.
  if (err?.code === "23505") {
    return res.status(409).json({ error: "That value is already taken" });
  }

  // Carry the route so an unexpected failure can be traced without a stack.
  console.error("[error]", req.method, req.originalUrl, err);
  return res
    .status(err?.status ?? err?.statusCode ?? 500)
    .json({ error: "Something went wrong on our side" });
}
