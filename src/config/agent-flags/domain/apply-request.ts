/**
 * What a POST /apply request to the dev switchboard may ask for
 * (docs/plans/2026-11-16-dev-flag-switchboard.md, "2. Server"): only switchable per-file
 * flags (agentFlags()), each set to one of its modes or reset to its default. Every other
 * agent secret is outside agentFlags() and so refused, with no denylist.
 *
 * @module config/agent-flags/domain/apply-request
 */
import { agentFlags, type SwitchableFlag } from './switchable.js';

/** A word some flag reader acts on: one of a switchable flag's modes. */
type FlagValue = SwitchableFlag['modes'][number];

interface ApplyRequest {
  set: Record<string, FlagValue>;
  reset: string[];
}

export type ApplyValidation = { ok: true; request: ApplyRequest } | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SWITCHABLE: ReadonlyMap<string, SwitchableFlag> = new Map(
  agentFlags()
    .filter((f) => f.switchable)
    .map((f) => [f.name, f])
);

function switchableFlag(name: string): SwitchableFlag | undefined {
  return SWITCHABLE.get(name);
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
