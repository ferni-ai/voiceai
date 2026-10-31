/**
 * The demo limit as the token route uses it: peek, reserve and release one
 * demo for an IP.
 *
 * The counts live in memory in ./demo-rate-limit.ts, per UI server instance.
 * These are async so the route does not change if the counts move to a
 * shared store.
 *
 * @module servers/token/demo-rate-limit-shared
 */

import type { RateLimitResult } from '../shared/types.js';
import {
  DEMO_CONFIG,
  checkDemoAllowed,
  recordDemoSession,
  releaseDemoSession as releaseInMemory,
} from './demo-rate-limit.js';

/** Whether this IP may start a demo now. */
export function peekDemoAllowance(ip: string): Promise<RateLimitResult> {
  return Promise.resolve(checkDemoAllowed(ip));
}

/** Use one of this IP's demos if allowed. */
export function reserveDemoSession(ip: string): Promise<RateLimitResult> {
  const result = checkDemoAllowed(ip, DEMO_CONFIG);
  if (!result.allowed) return Promise.resolve(result);
  recordDemoSession(ip);
  return Promise.resolve({
    allowed: true,
    sessionsRemaining: (result.sessionsRemaining ?? 1) - 1,
  });
}

/** Give back a demo reserved by reserveDemoSession that never started. */
export function releaseDemoSession(ip: string): Promise<void> {
  releaseInMemory(ip);
  return Promise.resolve();
}
