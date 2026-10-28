/**
 * The call's launch context (CALL_LAUNCH_CONTEXT), handed from the job
 * metadata to the hello: a call started from a Bookend's pep talk opens short
 * and warm, and a practice run opens with Alex offering to play the other
 * person. The metadata copy is checked again (types/call-launch.ts) before it
 * counts, and only fixed words reach the direction: never text from the caller.
 *
 * Written by setupCallTypeContexts (voice-agent-entry/metadata-parser.ts) at
 * session start; read once by directedGreeting (multi-agent/greeting-direction.ts).
 *
 * @module agents/shared/call-launch-hint
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { callLaunchOf, type CallLaunch } from '../../types/call-launch.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'call-launch-hint' });

/** Calls whose hello has not run yet; the oldest goes first past this. */
const MAX_PENDING = 500;
const pending = new Map<string, CallLaunch>();

/** Records the session's launch for its hello. Undefined when off, absent or not allowed. */
export function rememberCallLaunch(
  sessionId: string,
  value: unknown,
  env: Env = process.env
): CallLaunch | undefined {
  if (value === undefined || !flagOn('CALL_LAUNCH_CONTEXT', env)) return undefined;
  const launch = callLaunchOf(value);
  if (!launch) {
    log.warn({ sessionId }, 'Call launch in the metadata is not an allowed form, ignored');
    return undefined;
  }
  if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value as string);
  pending.set(sessionId, launch);
  log.info({ sessionId, kind: launch.kind }, 'Call launch hint recorded for the hello');
  return launch;
}

/** The session's launch, once: the hello takes it. */
export function takeCallLaunch(sessionId: string): CallLaunch | undefined {
  const launch = pending.get(sessionId);
  pending.delete(sessionId);
  return launch;
}

/** Added to the hello for a Bookend's pep talk. */
export const PEP_TALK_DIRECTION =
  ' They tapped for a quick pep talk before something they have coming up. Keep it short and warm: say hello, tell them in a few plain words that they have got this, and wish them luck. Do not ask for the details or start a long talk.';

/** Added to the hello for a practice run; `partner` is a PRACTICE_PARTNERS word. */
export function practiceDirection(partner: string): string {
  const who = partner === 'someone' ? 'someone in their life' : `their ${partner}`;
  return ` They called to practice a hard conversation with ${who}. You host it: say hello, offer to play that person while they are themselves, and ask how that person talks and what they want to walk out of there with ("Let's practice. I'll play them, and you be you. How do they talk, and what do you want to walk out with?"). One or two short sentences.`;
}

/** The hello's launch direction; empty for no launch or a note (nothing to say about it yet). */
export function launchDirection(launch: CallLaunch | undefined): string {
  if (launch?.kind === 'bookend') return PEP_TALK_DIRECTION;
  if (launch?.kind === 'practice') return practiceDirection(launch.ref);
  return '';
}
