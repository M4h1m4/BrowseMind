import { Request, Response, NextFunction } from 'express'

interface HttpError extends Error {
  status?: number
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? 500
  console.error(`[api] unhandled error on ${req.method} ${req.path}:`, err.message)
  res.status(status).json({ error: err.message ?? 'Internal server error' })
}
