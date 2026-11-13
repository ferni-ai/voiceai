/**
 * CRISIS_SCRIPT_IMMINENT_READ (off | shadow | on, off by default): a voice turn the patterns
 * answer with the caller's 988 script still asks the live classifier, and an imminent read about
 * the caller makes the script 911-first.
 *
 * The patterns can replace a reply with the 988 script on a line that names no moment: a whole
 * supply plus intent reads explicit, not imminent. The classifier never read that turn
 * (crisis-classifier.ts skips a turn the patterns blocked), so an imminent read could not add
 * 911. The owner's rule stays (2026-11-11): a pattern only nominates; 911 comes from the
 * classifier's imminent read.
 *
 * Nothing waits. The script's first sentence goes to the voice at once, and only the rest waits
 * for the read: at most 3 s, and never past the time the first sentence takes to say less the
 * time the voice takes to start the rest, so a crisis line never gets dead air. This read gets
 * its own deadline (the hold, then the time the rest takes to say), not the gate's.
 *   - An imminent read in time: the rest becomes the imminent script's rest.
 *   - One landing after that, while the rest is still being said: one 911 line at the end.
 *   - Anything else (none, a crisis read, a timeout, an error, a later read): the script exactly
 *     as it was. A read after the script is said is the next turn's (call risk notes it).
 * Shadow asks and logs counts only, with the script unchanged. Logs carry outcomes, never words.
 *
 * @module agents/personas/crisis-script-imminent
 */

import { ReadableStream } from 'node:stream/web';
import { flagModeOf, type Env } from '../../config/env-flag.js';
import {
  getCrisisResponse,
  LATE_911_LINE,
  names911,
  namesCrisisLine,
  resolveCrisisClassifierTimeoutMs,
  startCrisisClassifier,
  type CrisisClassifierInput,
  type StartCrisisClassifierOptions,
} from '../../services/safety/index.js';
import { findSentenceEnd } from '../../speech/tts-gateway/chunk-boundary.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisDetectionResult } from '../safety/crisis-guard.js';

const log = createLogger({ module: 'CrisisScriptImminent' });

/**
 * Fewest milliseconds a word takes to say, below every live voice's measured pace (the fastest
 * took 210 ms a word on the 988 script's first sentence), and more than the voice takes to start
 * a piece sent mid-reply (342 ms at the slowest measured; only a call's first piece starts cold).
 * A hold ends this much before the first sentence could end, and never past HOLD_CAP_MS; a late
 * line is added only this long before the rest could end.
 */
const FAST_MS_PER_WORD = 200;
const VOICE_START_MS = 600;
const HOLD_CAP_MS = 3000;

/** What a scripted turn's read found, and the imminent script when it is to be said. */
export interface ScriptRead {
  read: 'imminent' | 'crisis' | 'none' | 'failed';
  /** Imminent, about the caller: what makes the script 911-first. */
  imminent: boolean;
  script: string | null;
}

const scriptReadMode = (env: Env): 'off' | 'shadow' | 'on' =>
  flagModeOf('CRISIS_SCRIPT_IMMINENT_READ', env);

/**
 * Whether a scripted turn asks the classifier: the flag on or shadow, and the caller's own 988
 * script (not already imminent, not about someone else, not Spanish).
 */
function scriptAsks(
  decision: { action: string },
  detection: CrisisDetectionResult,
  env: Env
): boolean {
  if (decision.action !== 'replace' || scriptReadMode(env) === 'off') return false;
  if (detection.subject === 'third_party' || detection.language === 'es') return false;
  const { severity, subject, language } = detection;
  // The same env the patterns' script was written with (detectCrisis passes the gate's env).
  return detection.suggestedResponse === getCrisisResponse(severity, subject, language, false, env);
}

/**
 * A scripted turn's read by the live classifier, asked beside the gate's own (which a scripted
 * turn never reads); the imminent script comes with it only when the flag is on.
 */
export function scriptRead(
  said: CrisisClassifierInput,
  detection: CrisisDetectionResult,
  decision: { action: string },
  at: StartCrisisClassifierOptions
): Promise<ScriptRead> | undefined {
  const env = at.env ?? process.env;
  if (!scriptAsks(decision, detection, env)) return undefined;
  // Its own deadline: as long as a read can still change what is said, never less than the gate's.
  const window = timesOf(detection.suggestedResponse ?? '');
  const waitMs = Math.max(resolveCrisisClassifierTimeoutMs(env), window.holdMs + window.lateMs);
  const readEnv = { ...env, CRISIS_CLASSIFIER_TIMEOUT_MS: String(waitMs) };
  // Not one of the turn's reads (no scope): the turn's other readers never wait out this deadline.
  const options = { ...at, scope: undefined, env: readEnv, readBlocked: true };
  const run = startCrisisClassifier(said, options);
  if (run?.mode !== 'live') return undefined;
  return run.verdict.then(
    (verdict): ScriptRead => {
      const read = verdict?.risk ?? 'failed';
      const imminent = read === 'imminent' && verdict?.subject === 'self';
      const { severity, language } = detection;
      const script = getCrisisResponse(severity, 'self', language, true);
      return { read, imminent, script: imminent && scriptReadMode(env) === 'on' ? script : null };
    },
    (): ScriptRead => ({ read: 'failed', imminent: false, script: null })
  );
}

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const sayMs = (text: string): number => words(text) * FAST_MS_PER_WORD - VOICE_START_MS;

/** The script's first sentence (with the space after it), cut where the voice cuts a sentence. */
function openerOf(text: string): string | null {
  const end = findSentenceEnd(text);
  return end !== null && end < text.length ? text.slice(0, end) : null;
}

/** The imminent script after its opening sentence, unless that sentence names a line to call. */
function imminentRest(imminent: string): string {
  const opener = openerOf(imminent);
  return opener && !namesCrisisLine(opener) ? imminent.slice(opener.length) : imminent;
}

/**
 * A script cut where the read can change it: the hold before the rest, and how long after that a
 * late line can still be added (none when the rest already says 911, so 911 is said once).
 */
function timesOf(script: string): {
  opener: string | null;
  rest: string;
  holdMs: number;
  lateMs: number;
} {
  const opener = openerOf(script);
  const rest = opener ? script.slice(opener.length) : '';
  const holdMs = opener ? Math.min(HOLD_CAP_MS, sayMs(opener)) : 0;
  return { opener, rest, holdMs, lateMs: opener && !names911(rest) ? sayMs(rest) : 0 };
}

/** The read, or undefined when `ms` runs out first. */
async function within<T>(read: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const out = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), Math.max(0, ms));
  });
  return Promise.race([read, out]).finally(() => clearTimeout(timer));
}

const whole = (text: string): ReadableStream<string> =>
  new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

/**
 * The scripted reply. `script` is the turn's 988 script as said (crisisScriptFor); `finish`
 * makes the imminent script the same way. No read: the script in one piece, as before.
 */
export function scriptReply(
  script: string,
  read: Promise<ScriptRead> | undefined,
  finish: (text: string) => string,
  env: Env = process.env
): ReadableStream<string> {
  const { opener, rest, holdMs, lateMs } = timesOf(script);
  if (!read || !opener) return whole(script);
  const startedAt = Date.now();
  const note = (outcome: string, found?: ScriptRead): void =>
    log.info(
      { mode: scriptReadMode(env), read: found?.read ?? 'pending', outcome, holdMs },
      'CRISIS_SCRIPT_READ'
    );
  if (scriptReadMode(env) !== 'on') {
    // Shadow: the script as it is; the log says what the read would have changed.
    void read.then((found) => {
      const late = Date.now() - startedAt;
      const would = !found.imminent
        ? 'kept'
        : late <= holdMs
          ? 'would_swap'
          : late <= holdMs + lateMs
            ? 'would_add'
            : 'next_turn';
      note(would, found);
    });
    return whole(script);
  }
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(opener);
      const found = await within(read, holdMs);
      if (found?.script) {
        controller.enqueue(imminentRest(finish(found.script)));
        note('swapped', found);
        return controller.close();
      }
      controller.enqueue(rest);
      const late = found || lateMs <= 0 ? undefined : await within(read, lateMs);
      if (late?.script) controller.enqueue(` ${LATE_911_LINE}`);
      note(late?.script ? 'added' : found ? 'kept' : 'late', found ?? late);
      controller.close();
    },
  });
}
