/**
 * The latency knobs each TURN_RECEIPT carries, read when the receipt is built:
 * COHORT_FLAGS sets flags per caller at call start (applyCallerFlags writes
 * process.env), so the boot-time EFFECTIVE_SETTINGS line can't say which A/B arm a
 * turn was in. Values as effective-settings.ts resolves them (a non-flag word shows
 * as `<set>`, so no secret), plus the build commit. Add a knob to RECEIPT_FLAGS; the
 * compiler refuses a name the manifest doesn't list.
 *
 * @module agents/shared/turn-receipt-flags
 */
import { buildCommit, flagValue, type Env } from '../../config/effective-settings.js';
import type { FlagName } from '../../config/flag-manifest.js';

/** Not manifest flags, so not here: TOOL_RETRIEVAL (tools.retrieval), CASCADE_TURN_EAGER (below). */
export const RECEIPT_FLAGS = [
  'ACTION_CLAIM_STREAM',
  'ACTION_CLAIM_GUARD',
  'FIRST_CLAUSE_FLUSH',
  'PREEMPT_STABLE_CONTEXT',
  'PREEMPTIVE_TTS',
  'CACHE_WARM_PRIMARY',
  'HANDOFF_CACHE_WARM',
  'CASCADE_CACHE_WARM',
  'TTS_SOCKET_WARM',
  'SLOW_TURN_SOUND',
  'TOOL_ACK_WIDE',
  'TOOL_ACK_CLIP',
  'TOOL_CORE_STATIC',
  'TURN_DETECTOR',
  'ENDPOINT_FAST_FINISHED',
  'PAUSE_HOLD',
  'OPENER_GATE',
  'OPENER_GATE_EARLY',
  'BACKCHANNEL_TIMING',
  'TURN_LENGTH',
  'TURN_OPENING_SOUND',
  'UNFINISHED_TURN_HOLD',
  'SPEECH_DIRECTOR',
  'BARGE_IN_FAST_STOP',
  'BARGE_IN_SOFT_PAUSE',
  'SOUND_CONDUCTOR',
  'QUICK_SHORTCUTS_REAL_ONLY',
] as const satisfies readonly FlagName[];

/** Numeric knobs read straight from env: shown only as a plain number. */
export const RECEIPT_NUMBERS = ['CASCADE_TURN_EAGER'] as const;
const NUMBER = /^\d{1,6}(?:\.\d{1,6})?$/;

export function receiptFlags(env: Env = process.env): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const name of RECEIPT_FLAGS) flags[name] = flagValue(name, env);
  for (const name of RECEIPT_NUMBERS) {
    const raw = env[name]?.trim();
    flags[name] = !raw ? 'unset' : NUMBER.test(raw) ? raw : '<set>';
  }
  return flags;
}

/** The fields a receipt adds: the knobs and the build. */
export function receiptBuild(env: Env = process.env): {
  flags: Record<string, string>;
  commit: string;
} {
  return { flags: receiptFlags(env), commit: buildCommit(env) };
}
