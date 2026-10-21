/**
 * One person's own value of a cohort flag, for code that can't read cohorts
 * itself: it serves many people at once (the UI server), runs after a call
 * (when process.env may already hold the next caller's flags), and sits below
 * services/platform/cohort-flags.ts in the layers.
 *
 * Each process's composition root wires the lookup once: the UI server with
 * flagForUser (api/scheduled-jobs/index.ts), the agent with envForCaller
 * (agents/gce/job-executor.ts). Unwired, nobody has a value of their own and
 * the env decides, as before.
 *
 * @module config/person-flag
 */
import { flagOn, type Env } from './env-flag.js';
import type { FlagName } from './flag-manifest.js';

/** The person's own 'on' or 'off', or undefined when they have none. */
export type PersonFlagLookup = (
  userId: string,
  flag: FlagName
) => Promise<'on' | 'off' | undefined>;

let lookup: PersonFlagLookup = async () => undefined;

/** Called once per process by its composition root. */
export function usePersonFlagLookup(fn: PersonFlagLookup): void {
  lookup = fn;
}

/**
 * Whether `flag` is on for this person: their own value (cohorts, then their
 * override, which beats the env) when they have one, else the env's. A
 * failed lookup counts as no value. Never throws.
 */
export async function personFlagOn(
  userId: string | undefined,
  flag: FlagName,
  env: Env = process.env
): Promise<boolean> {
  const own = userId ? await lookup(userId, flag).catch(() => undefined) : undefined;
  return own === undefined ? flagOn(flag, env) : own === 'on';
}
