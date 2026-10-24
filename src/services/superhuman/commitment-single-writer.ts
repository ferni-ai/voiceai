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

/** `source` on a row the caller asked for through a tool ("remind me to send Jen the deck"). */
export const REQUESTED_SOURCE = 'user-request';

/**
 * What a tool adds to the row it writes. Flag off: nothing, so the row is as on
 * main. Flag on: a tag, so the readers that hide the regex-era rows still show
 * what the caller asked for by name, even when the after-call judge missed it.
 * Decided per person, as the readers decide (singleWriterFor), not from the
 * mid-call env: if the cohort read at call start timed out, the env says off
 * while the readers say on, and an untagged row would be hidden.
 */
export async function requestedFieldsFor(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  store?: CohortStore
): Promise<{ source?: typeof REQUESTED_SOURCE }> {
  return (await singleWriterFor(userId, env, store)) ? { source: REQUESTED_SOURCE } : {};
}

/** A stored row the after-call judge wrote. */
export function isJudgedRow(d: Record<string, unknown>): boolean {
  return d.source === JUDGED_SOURCE;
}

/** A row readers show with the flag on: the judge's, or one the caller asked a tool for. */
export function isSingleWriterRow(d: Record<string, unknown>): boolean {
  return isJudgedRow(d) || d.source === REQUESTED_SOURCE;
}

/** All a row says about whom and what: a resolved statement may not name the person. */
export function judgedRowText(d: Record<string, unknown>): string {
  return [d.statement, d.summary, d.quote, d.person, d.personInvolved]
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

export type ForgetListLoader = (userId: string) => Promise<string[] | null>;

/**
 * Which stored rows this person may be shown. Flag off: all (as before).
 * Flag on: only judged rows and rows a tool wrote at their request, and none
 * about a topic they asked Ferni to forget, person field included; none at all
 * when that list can't be read.
 */
export async function shownRows(
  userId: string,
  judgedOnly: boolean,
  forgotten: ForgetListLoader = forgottenTopicsOrNull
): Promise<(d: Record<string, unknown>) => boolean> {
  if (!judgedOnly) return () => true;
  const topics = await forgotten(userId);
  if (topics === null) return () => false;
  return (d) => isSingleWriterRow(d) && !isForgotten(judgedRowText(d), topics);
}
