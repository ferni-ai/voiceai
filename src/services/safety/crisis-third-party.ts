/**
 * Third-party self-harm (#2635), THIRD_PARTY_SELF_HARM = off | shadow | live, off by default.
 *
 * "he keeps saying he'll hurt himself", "kill himself" and "end their life" scored 0 at every
 * crisis site, so a caller worried that someone is about to hurt themselves got no guidance.
 * THIRD_PARTY_SELF_HARM_PATTERNS (crisis-patterns.ts) name those forms. In live, detectCrisis
 * reads them beside THIRD_PARTY_PATTERNS: a hit is third-party risk (severity 0.75, never the
 * caller's own 988 script, never a replaced reply), so the reply model gets the third-party
 * guidance (buildCrisisGuidance): take the worry seriously, call or text 988 on their behalf,
 * 911 if they are in immediate danger, and ask how the caller is holding up. It only raises:
 * the caller's own words still decide when they are about the caller.
 *
 * In live, a turn read as third party also keeps the caller's own words for later turns' session
 * check (keepsOwnSession), so the read never lowers a session. Off and shadow read exactly as main. Shadow logs, once per turn from the turn pipeline
 * (turn-crisis.ts), when the live read of that turn would differ; no caller words are logged.
 *
 * @module CrisisThirdParty
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { JOKE_MARKERS } from './crisis-modifiers.js';
import {
  THIRD_PARTY_PATTERNS,
  THIRD_PARTY_SELF_HARM_FRAMED,
  THIRD_PARTY_SELF_HARM_PATTERNS,
  THIRD_PARTY_SELF_HARM_VETOES,
  THIRD_PARTY_WORRY_FRAME,
} from './crisis-patterns.js';

const log = createLogger({ module: 'CrisisThirdParty' });

type Env = Record<string, string | undefined>;
export type ThirdPartySelfHarmMode = 'off' | 'shadow' | 'live';

/** live or shadow, or off for anything else. */
export function resolveThirdPartySelfHarm(env: Env = process.env): ThirdPartySelfHarmMode {
  const mode = env.THIRD_PARTY_SELF_HARM?.trim().toLowerCase();
  return mode === 'live' || mode === 'shadow' ? mode : 'off';
}

/** Set only while shadow takes the live read of a turn. */
let forced: ThirdPartySelfHarmMode | undefined;

const live = (): boolean => (forced ?? resolveThirdPartySelfHarm()) === 'live';

/**
 * The #2635 forms alone, whatever the flag says: a form that says it on its own, or a modal with
 * a worry frame, and no veto anywhere in the message (a death, fiction, a warning, a joke).
 */
export function thirdPartySelfHarm(text: string): boolean {
  const said =
    THIRD_PARTY_SELF_HARM_PATTERNS.some((p) => p.test(text)) ||
    (THIRD_PARTY_SELF_HARM_FRAMED.test(text) && THIRD_PARTY_WORRY_FRAME.test(text));
  return (
    said && !JOKE_MARKERS.test(text) && !THIRD_PARTY_SELF_HARM_VETOES.some((p) => p.test(text))
  );
}

/** Someone the caller knows is at risk, in normalized text. The #2635 forms count only in live. */
export function thirdPartyRisk(text: string): boolean {
  if (THIRD_PARTY_PATTERNS.some((p) => p.test(text))) return true;
  return live() && thirdPartySelfHarm(text);
}

/**
 * Live only: a turn read as a worry about someone else still counts the caller's own words in a
 * later turn's session check, so the third-party read adds to the session and never zeroes it.
 */
export function keepsOwnSession(): boolean {
  return live();
}

type Reading = Pick<CrisisDetectionResult, 'isCrisis' | 'subject' | 'severity'>;
const reading = (c: CrisisDetectionResult): Reading => ({
  isCrisis: c.isCrisis,
  subject: c.subject,
  severity: c.severity,
});

/**
 * Shadow only: take this turn's live read with `read` and log when it differs from `used`.
 * Changes no detection and no reply; any error is swallowed.
 */
export function shadowThirdPartySelfHarm(
  used: CrisisDetectionResult,
  read: () => CrisisDetectionResult
): void {
  if (resolveThirdPartySelfHarm() !== 'shadow') return;
  try {
    forced = 'live';
    const live = read();
    if (live.isCrisis === used.isCrisis && live.subject === used.subject) return;
    log.info({ was: reading(used), live: reading(live) }, 'THIRD_PARTY_SELF_HARM_SHADOW');
  } catch {
    // shadow never affects the turn
  } finally {
    forced = undefined;
  }
}
