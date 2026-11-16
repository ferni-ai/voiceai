/**
 * Which agent flags the dev switchboard may flip, and what an apply request may
 * ask for (docs/plans/2026-11-16-dev-flag-switchboard.md, "Which flags").
 *
 * The list is the per-file flags (src/config/flags/<NAME>.ts), read from the
 * generated barrel, so a new flag file shows up without an edit here. Only a
 * flag whose default is on, off or shadow can be switched; the numeric config
 * flags are listed read-only. Every other agent secret (API keys, tokens, the
 * older manifest entries such as ALLOW_PRODUCTION_DATA) is outside the list and
 * is refused by validateApply, so no denylist is needed.
 *
 * A flag's modes are the words its reader acts on, so the page never shows or
 * sends a value the agent would read as something else: flagModeOf flags take
 * off, shadow and on; flags read straight from env take their reader's own
 * words (VALUE_OVERRIDES); every other switchable flag takes off and on.
 *
 * @module config/agent-flags/domain/switchable
 */
import { flagModeOf, flagOn } from '../../env-flag.js';
import { FLAG_MANIFEST, type FlagName } from '../../flag-manifest.js';
import type { FlagSpec } from '../../flag-spec.js';
import * as FLAG_FILES from '../../flags/index.generated.js';

/** Every word some flag reader acts on ('reports' and 'defer' have one reader each). */
export type FlagValue = 'on' | 'off' | 'shadow' | 'live' | 'defer' | 'reports';

export interface SwitchableFlag {
  readonly name: string;
  readonly kind: FlagSpec['kind'];
  readonly owner: FlagSpec['owner'];
  readonly default: string;
  readonly switchable: boolean;
  readonly modes: readonly FlagValue[];
}

/**
 * Per-file flags read with flagModeOf, so shadow means something to the agent.
 * The test fails when a new flagModeOf('NAME' read appears for a flag not
 * listed here.
 */
export const SHADOW_CAPABLE: ReadonlySet<string> = new Set([
  'CRISIS_EVENT_RECORD',
  'CRISIS_SCRIPT_IMMINENT_READ',
  'SMS_CRISIS_SCREEN',
  'SOUND_CONDUCTOR',
]);

const ON_OFF: readonly FlagValue[] = Object.freeze(['off', 'on']);
const WITH_SHADOW: readonly FlagValue[] = Object.freeze(['off', 'shadow', 'on']);
const SHADOW_LIVE: readonly FlagValue[] = Object.freeze(['off', 'shadow', 'live']);
const OFF_SHADOW: readonly FlagValue[] = Object.freeze(['off', 'shadow']);
const NONE: readonly FlagValue[] = Object.freeze([]);

/**
 * Per-file flags whose reader parses the env value itself rather than through
 * flagOn or flagModeOf, mapped to the exact words that reader acts on (its
 * default included). Any other value falls back to the default in every one of
 * these readers, which is what resolvedValue reports. The test fails when a
 * new direct env read appears for a switchable flag not listed here.
 */
export const VALUE_OVERRIDES: Readonly<Record<string, readonly FlagValue[]>> = Object.freeze({
  ATTUNE_LEDGER: ON_OFF, // turn-attunement.ts, === 'on'
  BARGE_IN_SOFT_PAUSE: ON_OFF, // barge-in-soft-pause.ts, !== 'on'
  CALL_TELEMETRY: Object.freeze<FlagValue[]>(['off', 'on', 'reports']), // call-telemetry-store.ts
  CRISIS_CLASSIFIER_ONLY_CHECKIN: SHADOW_LIVE, // crisis-classifier-only(-live).ts
  CRISIS_CLASSIFIER_SECOND_READ: WITH_SHADOW, // crisis-classifier-v3.ts
  CRISIS_CONFIRMED_CALL_RISK: WITH_SHADOW, // crisis-confirmed-risk.ts
  CRISIS_GRADED_RESPONSE: OFF_SHADOW, // crisis-graded-shadow.ts; live runs as shadow
  CRISIS_IMMINENT_NEEDS_AGREEMENT: ON_OFF, // crisis-imminent-agreement.ts
  CRISIS_MEANS_IN_HAND: SHADOW_LIVE, // crisis-means-in-hand.ts, default shadow
  CRISIS_READ_JOINED_TURN: ON_OFF, // crisis-read-joined-turn.ts, === 'on'
  EARLY_WARNING_STT_FORMS: WITH_SHADOW, // phrase-match.ts, resolveShadowMode
  EARLY_WARNING_WORD_BOUNDARY: ON_OFF, // phrase-match.ts
  PATTERN_MIRROR_ONCE: ON_OFF, // commitment-follow-up-gate.ts, === 'on'
  PREEMPT_STABLE_CONTEXT: Object.freeze<FlagValue[]>(['off', 'on', 'defer']), // preempt-stable-context.ts
  SAFETY_WHOLE_WORD_SITES: WITH_SHADOW, // safety-whole-word.ts, resolveShadowMode
  SELF_VOICE_GATE: OFF_SHADOW, // self-voice-gate/session-gate.ts
  SESSION_OWN_VOICE: ON_OFF, // spoken-voice.ts, === 'on'
  THIRD_PARTY_SELF_HARM: SHADOW_LIVE, // crisis-who.ts
});

/** Words a direct reader maps to another of its words instead of the default. */
const READER_ALIASES: ReadonlyMap<string, ReadonlyMap<string, FlagValue>> = new Map([
  ['CRISIS_GRADED_RESPONSE', new Map<string, FlagValue>([['live', 'shadow']])],
]);

const SWITCHABLE_DEFAULTS: ReadonlySet<string> = new Set<FlagValue>(['on', 'off', 'shadow']);

function modesOf(name: string, switchable: boolean): readonly FlagValue[] {
  if (!switchable) return NONE;
  if (Object.hasOwn(VALUE_OVERRIDES, name)) return VALUE_OVERRIDES[name] ?? NONE;
  return SHADOW_CAPABLE.has(name) ? WITH_SHADOW : ON_OFF;
}

function describeFlag(name: string, spec: FlagSpec): SwitchableFlag {
  const switchable = SWITCHABLE_DEFAULTS.has(spec.default);
  return Object.freeze({
    name,
    kind: spec.kind,
    owner: spec.owner,
    default: spec.default,
    switchable,
    modes: modesOf(name, switchable),
  });
}

const FLAG_SPECS: Readonly<Record<string, FlagSpec>> = FLAG_FILES;

const AGENT_FLAGS: readonly SwitchableFlag[] = Object.freeze(
  Object.entries(FLAG_SPECS)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, spec]) => describeFlag(name, spec))
);

const BY_NAME: ReadonlyMap<string, SwitchableFlag> = new Map(AGENT_FLAGS.map((f) => [f.name, f]));

/** Every per-file flag, sorted by name; computed once and frozen. */
export function agentFlags(): readonly SwitchableFlag[] {
  return AGENT_FLAGS;
}

interface ApplyRequest {
  set: Record<string, FlagValue>;
  reset: string[];
}

export type ApplyValidation = { ok: true; request: ApplyRequest } | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function switchableFlag(name: string): SwitchableFlag | undefined {
  const flag = BY_NAME.get(name);
  return flag?.switchable ? flag : undefined;
}

function checkSet(raw: unknown, errors: string[]): Record<string, FlagValue> {
  const set: Record<string, FlagValue> = {};
  if (raw === undefined) return set;
  if (!isRecord(raw)) {
    errors.push('set must be an object of flag name to one of its modes');
    return set;
  }
  for (const [name, value] of Object.entries(raw)) {
    const flag = switchableFlag(name);
    const mode = flag?.modes.find((m) => m === value);
    if (!flag) {
      errors.push(`${name} is not a switchable agent flag`);
    } else if (!mode) {
      errors.push(`${name} cannot be set to ${String(value)} (allowed: ${flag.modes.join(', ')})`);
    } else {
      set[name] = mode;
    }
  }
  return set;
}

function checkReset(raw: unknown, errors: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('reset must be a list of flag names');
    return [];
  }
  const reset: string[] = [];
  for (const name of raw as unknown[]) {
    if (typeof name !== 'string') {
      errors.push('reset must be a list of flag names');
    } else if (!switchableFlag(name)) {
      errors.push(`${name} is not a switchable agent flag`);
    } else if (reset.includes(name)) {
      errors.push(`${name} is listed twice in reset`);
    } else {
      reset.push(name);
    }
  }
  return reset;
}

/**
 * Checks a POST /apply body. Every name must be a switchable per-file flag and
 * every value one of that flag's modes; a name may not be both set and reset;
 * the request must change something. Nothing else in the body is allowed.
 */
export function validateApply(body: unknown): ApplyValidation {
  if (!isRecord(body)) return { ok: false, errors: ['body must be an object with set and reset'] };
  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (key !== 'set' && key !== 'reset') errors.push(`unexpected field ${key}`);
  }
  const set = checkSet(body.set, errors);
  const reset = checkReset(body.reset, errors);
  for (const name of reset) {
    if (Object.hasOwn(set, name)) errors.push(`${name} is in both set and reset`);
  }
  if (errors.length === 0 && Object.keys(set).length === 0 && reset.length === 0) {
    errors.push('nothing to change: set and reset are both empty');
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, request: { set, reset } };
}

const isFlagName = (name: string): name is FlagName => Object.hasOwn(FLAG_MANIFEST, name);

/** A directly read flag's value: one of its reader's words, an alias of one, or the default. */
function readerWord(flag: SwitchableFlag, raw: string | undefined): string {
  const word = raw?.trim().toLowerCase() ?? '';
  return (
    flag.modes.find((m) => m === word) ?? READER_ALIASES.get(flag.name)?.get(word) ?? flag.default
  );
}

/**
 * The value the agent runs with for a per-file flag whose env value is raw, as
 * its reader resolves it: a directly read flag gets its reader's word (or the
 * default for any word it ignores), a flagModeOf flag what flagModeOf returns,
 * any other switchable flag what flagOn returns, and a numeric config flag the
 * raw value or its default. A name that is not a per-file flag gets raw as is.
 */
export function resolvedValue(name: string, raw: string | undefined): string {
  const flag = BY_NAME.get(name);
  if (!flag || !isFlagName(name)) return raw?.trim() ?? '';
  const env = { [name]: raw };
  if (!flag.switchable) return raw?.trim() || flag.default;
  if (Object.hasOwn(VALUE_OVERRIDES, name)) return readerWord(flag, raw);
  if (SHADOW_CAPABLE.has(name)) return flagModeOf(name, env);
  return flagOn(name, env) ? 'on' : 'off';
}
