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
import { flagForUser, READ_TIMEOUT_MS, type CohortStore } from '../platform/cohort-flags.js';

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
 * What a tool adds to the row it writes. Flag off for both the call and the
 * person: nothing, so the row is as on main. Otherwise a tag, so the readers
 * that hide the regex-era rows still show what the caller asked for by name.
 * Either side counts: the call-start cohort read may have timed out (the env
 * says off, the person's readers on), and the next call's check-in reads the
 * env. A tag is harmless where the readers are off. The person's read waits
 * at most READ_TIMEOUT_MS, as at call start; past that the env decides.
 */
export async function requestedFieldsFor(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  opts: { store?: CohortStore; timeoutMs?: number } = {}
): Promise<{ source?: typeof REQUESTED_SOURCE }> {
  const on = isCommitmentSingleWriterOn(env) || (await personOnWithin(userId, env, opts));
  return on ? { source: REQUESTED_SOURCE } : {};
}

/** The person's own value is on, read within the timeout; false when slower. */
async function personOnWithin(
  userId: string,
  env: Record<string, string | undefined>,
  opts: { store?: CohortStore; timeoutMs?: number }
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), opts.timeoutMs ?? READ_TIMEOUT_MS);
  });
  try {
    const read = flagForUser(userId, 'COMMITMENT_SINGLE_WRITER', { env, store: opts.store });
    return (await Promise.race([read, late])) === 'on';
  } finally {
    clearTimeout(timer);
  }
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
