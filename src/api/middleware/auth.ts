/**
 * Express-style auth middleware for CEO routes.
 * CEO index already runs optionalAuthAsync and sets req.user; this middleware
 * ensures req.user is present before the route handler runs.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that requires req.user (set by CEO index after optionalAuthAsync).
 * Returns 401 if not authenticated.
 */
export function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!(req as Request & { user?: { uid: string } }).user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
