/**
 * One person's follow-up state that isn't about any one follow-up, in one
 * document (bogle_users/{uid}/follow_through_meta/state) so a call start reads
 * it in a single get: appetite for being asked, this week's asks, suppressed
 * topics and the next call's planned ask (follow-up brain design §2.2, §5).
 *
 * The shape and its parser: a missing or damaged document reads as the
 * defaults, each bad field on its own. Dormant: the arbiter (design PR 3)
 * is its first reader and brings the Firestore adapter.
 *
 * @module services/follow-through/follow-through-meta-store
 */

import { ASK_TYPES, type AskType } from './follow-up.js';

/** Beta posterior on "a follow-up ask was welcome". Prior Beta(2,1), mean 0.67. */
export interface Appetite {
  readonly alpha: number;
  readonly beta: number;
  readonly updatedAt: string | null;
}

/** The ask planned for the next call, computed after this one. */
export interface FollowUpPlan {
  readonly threadId: string;
  readonly askType: AskType;
  readonly line: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly computedAt: string;
  readonly why: string;
}

export interface FollowUpMeta {
  readonly appetite: Appetite;
  /** When Ferni started a follow-up in the last 7 days (UTC ISO), oldest first. */
  readonly asksLast7d: readonly string[];
  readonly suppressedTopics: ReadonlyArray<{ readonly topicKey: string; readonly until: string }>;
  readonly plan: FollowUpPlan | null;
  /** The stored copy's version, for compare-and-set; null when never saved. */
  readonly updatedAt: string | null;
}

export const DEFAULT_META: FollowUpMeta = {
  appetite: { alpha: 2, beta: 1, updatedAt: null },
  asksLast7d: [],
  suppressedTopics: [],
  plan: null,
  updatedAt: null,
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isTime = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x));
const positive = (x: unknown, fallback: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : fallback;

function planOf(x: unknown): FollowUpPlan | null {
  if (!isRecord(x)) return null;
  const { threadId, askType, line, validFrom, validUntil, computedAt, why } = x;
  if (typeof threadId !== 'string' || typeof line !== 'string' || typeof why !== 'string')
    return null;
  if (!ASK_TYPES.includes(askType as AskType)) return null;
  if (!isTime(validFrom) || !isTime(validUntil) || !isTime(computedAt)) return null;
  return { threadId, askType: askType as AskType, line, validFrom, validUntil, computedAt, why };
}

/** The stored document as state. Each bad field falls back to its default on its own. */
export function toFollowUpMeta(data: unknown): FollowUpMeta {
  if (!isRecord(data)) return DEFAULT_META;
  const a = isRecord(data.appetite) ? data.appetite : {};
  const suppressed = Array.isArray(data.suppressedTopics) ? data.suppressedTopics : [];
  return {
    appetite: {
      alpha: positive(a.alpha, DEFAULT_META.appetite.alpha),
      beta: positive(a.beta, DEFAULT_META.appetite.beta),
      updatedAt: isTime(a.updatedAt) ? a.updatedAt : null,
    },
    asksLast7d: Array.isArray(data.asksLast7d) ? data.asksLast7d.filter(isTime).sort() : [],
    suppressedTopics: suppressed.flatMap((s) =>
      isRecord(s) && typeof s.topicKey === 'string' && s.topicKey && isTime(s.until)
        ? [{ topicKey: s.topicKey, until: s.until }]
        : []
    ),
    plan: planOf(data.plan),
    updatedAt: isTime(data.updatedAt) ? data.updatedAt : null,
  };
}
