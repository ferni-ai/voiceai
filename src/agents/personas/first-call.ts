/**
 * A known account's first call, and whether its goodbye is grounded
 * (FIRST_CALL_GOODBYE_GROUNDED, first-call-goodbye.ts). Its own module so the
 * first-call note (first-call-rapport.ts) and the happy-exit note
 * (happy-exits.ts) read the same thing without importing each other.
 *
 * @module agents/personas/first-call
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

/** A known account on its first conversation. */
export function isFirstCall(userData: unknown): boolean {
  const u = userData as { isReturningUser?: unknown; userId?: unknown } | undefined;
  return u?.isReturningUser === false && isMemberIdentity(u.userId as string | undefined);
}

export function firstCallRapportEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CALL_RAPPORT', env);
}

export function firstCallGoodbyeGroundedEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CALL_GOODBYE_GROUNDED', env);
}

/** This call's goodbye gets the grounded first-call note (first-call-rapport.ts goodbyeNote). */
export function groundedFirstGoodbyeOn(userData: unknown, env: Env = process.env): boolean {
  return (
    isFirstCall(userData) && firstCallRapportEnabled(env) && firstCallGoodbyeGroundedEnabled(env)
  );
}
