/**
 * COMMITMENT_SINGLE_WRITER, the readers' side: whether it is on, and which
 * stored commitments it lets through (judged-commitments.ts writes them).
 *
 * Off by default. Cohorts may set it. Read after the call through
 * envForCaller (world-model/extraction/register.ts), mid-call from
 * process.env as the caller's flags applied it, and per person on servers
 * that act for many (singleWriterFor).
 *
 * @module services/superhuman/commitment-single-writer
 */

import { flagOn } from '../../config/env-flag.js';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import { flagForUser, type CohortStore } from '../platform/cohort-flags.js';

/** `source` on the rows the after-call judge writes; the only rows readers show under the flag. */
export const JUDGED_SOURCE = 'after-call-llm';

export function isCommitmentSingleWriterOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('COMMITMENT_SINGLE_WRITER', env);
}

/** This person's own value through their cohorts and override, else the agent's. Never throws. */
export async function singleWriterFor(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  store?: CohortStore
): Promise<boolean> {
  const own = await flagForUser(userId, 'COMMITMENT_SINGLE_WRITER', { env, store });
  return own === undefined ? isCommitmentSingleWriterOn(env) : own === 'on';
}

/** A stored row the after-call judge wrote. */
export function isJudgedRow(d: Record<string, unknown>): boolean {
  return d.source === JUDGED_SOURCE;
}

/** All a row says about whom and what: a resolved statement may not name the person. */
export function forgetText(d: Record<string, unknown>): string {
  return [d.statement, d.summary, d.quote, d.person, d.personInvolved]
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

export type ForgottenLoader = (userId: string) => Promise<string[] | null>;

/**
 * Which stored rows this person may be shown. Flag off: all (as before).
 * Flag on: only judged rows, and none about a topic they asked Ferni to
 * forget, person field included; none at all when that list can't be read.
 */
export async function shownRows(
  userId: string,
  judgedOnly: boolean,
  forgotten: ForgottenLoader = forgottenTopicsOrNull
): Promise<(d: Record<string, unknown>) => boolean> {
  if (!judgedOnly) return () => true;
  const topics = await forgotten(userId);
  if (topics === null) return () => false;
  return (d) => isJudgedRow(d) && !isForgotten(forgetText(d), topics);
}
