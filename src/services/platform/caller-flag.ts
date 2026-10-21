/**
 * One flag as this caller's call had it (envForCaller), for work that runs after
 * the call: the agent's config/person-flag.ts lookup (agents/person-flag-register.ts).
 *
 * @module services/platform/caller-flag
 */
import { flagOn } from '../../config/env-flag.js';
import type { FlagName } from '../../config/flag-manifest.js';
import { envForCaller, type CohortStore } from './cohort-flags.js';

export async function callerFlag(
  userId: string,
  flag: FlagName,
  opts: { store?: CohortStore; env?: NodeJS.ProcessEnv } = {}
): Promise<'on' | 'off'> {
  return flagOn(flag, await envForCaller(userId, opts)) ? 'on' : 'off';
}
