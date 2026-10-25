/**
 * /token's `from` parameter (CALL_LAUNCH_CONTEXT): where the call was started
 * from, as a checked CallLaunch for the room metadata (types/call-launch.ts).
 *
 * Off, `from` is ignored and the room metadata is exactly as before. On, only
 * the allow-listed forms count; anything else is a normal call, with no error.
 * A `bookend:` ref must name a live follow-up of the verified caller: it is
 * looked up only in their own follow-ups, so a forged or foreign id gives a
 * normal call and never says whether that follow-up exists.
 *
 * @module servers/api/routes/call-launch-param
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import type { FollowUpStore } from '../../../services/follow-through/ports.js';
import { parseCallLaunch, type CallLaunch } from '../../../types/call-launch.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'CallLaunchParam' });

/** Alex hosts every practice run (ENGAGEMENT-SPEC D8). */
export const PRACTICE_HOST_PERSONA_ID = 'alex-chen';

type LiveFollowUps = Pick<FollowUpStore, 'live'>;

export interface CallLaunchDeps {
  env?: Env;
  /** The caller's follow-ups; null where there is no store (local dev). */
  followUps?: () => Promise<LiveFollowUps | null>;
}

export function callLaunchEnabled(env: Env = process.env): boolean {
  return flagOn('CALL_LAUNCH_CONTEXT', env);
}

async function firestoreFollowUps(): Promise<LiveFollowUps | null> {
  const { firestoreFollowUpStore } =
    await import('../../../services/stores/follow-through-store.js');
  return firestoreFollowUpStore();
}

async function ownsFollowUp(uid: string, id: string, deps: CallLaunchDeps): Promise<boolean> {
  try {
    const store = await (deps.followUps ?? firestoreFollowUps)();
    if (!store) return false;
    return (await store.live(uid)).some((f) => f.id === id);
  } catch (error) {
    log.warn({ error: String(error) }, 'Bookend launch not checked, a normal call');
    return false;
  }
}

/** The checked launch for the room metadata, or undefined (flag off, not allowed, not theirs). */
export async function callLaunchFor(
  from: string | null,
  uid: string,
  deps: CallLaunchDeps = {}
): Promise<CallLaunch | undefined> {
  if (!from || !callLaunchEnabled(deps.env)) return undefined;
  const launch = parseCallLaunch(from);
  if (!launch) {
    log.info({ fromChars: from.length }, 'Call launch ignored: not an allowed form');
    return undefined;
  }
  if (launch.kind === 'bookend' && !(await ownsFollowUp(uid, launch.ref, deps))) {
    log.info('Bookend launch ignored: not a live follow-up of the caller');
    return undefined;
  }
  log.info({ kind: launch.kind }, 'Call launch context set');
  return launch;
}

/** The persona to ask for: Alex for a practice run, else what the caller asked for. */
export function launchPersona(launch: CallLaunch | undefined, requested: string): string {
  return launch?.kind === 'practice' ? PRACTICE_HOST_PERSONA_ID : requested;
}
