/**
 * The proactive engine's commitment follow-up, checked before it reaches the call.
 *
 * Owner calls 10-10 to 10-17: the engine (proactive-engine.ts) put a scripted
 * "how's that going?" into turn 1 of 25 of about 44 calls. Its cooldown never
 * matched (the id was built from Date.now()), its memory of asking lived in one
 * pod's RAM, it took the newest active commitment whatever it was, and it asked
 * how a call went that Ferni had never placed. Now a commitment follow-up:
 * - never comes on a crisis-guided turn or when the caller sounds heavy;
 * - is about the caller's own commitment (toOpenCommitment, commitmentSentences);
 * - waits until the time it names has passed ("interview Thursday": not before then);
 * - for a promise to call or text someone, waits until that call completed (call-status.ts);
 * - is asked at most once in 48 h per commitment, across calls and instances, in
 *   bogle_users/{uid}/commitment_checkins (the PROACTIVE_COOLDOWN store);
 * - counts as asked only once it is injected (noteFollowUpInjected).
 * A store that can't be read, or a slow read, means no ask. Each call start logs
 * one FOLLOWUP_DECISION line with a hash of the topic, never its words.
 *
 * @module agents/voice-agent/commitment-follow-up-gate
 */

import { loadUserCommitments } from '../../services/superhuman/commitment-keeper.js';
import { toOpenCommitment } from '../../services/superhuman/commitment-follow-up.js';
import {
  lastAsked,
  recordCheckIns,
} from '../../services/superhuman/commitment-checkin-cooldown.js';
import {
  callStatusOf,
  firestoreCallRecords,
  personToCall,
  type CallRecords,
} from '../../services/outreach/call-status.js';
import { wasInsightSurfaced } from '../../intelligence/index.js';
import { commitmentKey, isAskableCommitment } from '../../utils/commitment-filters.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CommitmentFollowUpGate' });

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The same commitment is never asked about again within this. */
export const FOLLOW_UP_SPACING_MS = 48 * HOUR_MS;
/** At or above this distress the caller sounds heavy: no follow-up (DESIGN G7). */
export const HEAVY_DISTRESS = 0.6;
/** At most this many candidates are read from the ask record. */
const MAX_CANDIDATES = 5;
/** The reads must not hold up the first reply. */
const GATE_TIMEOUT_MS = 400;
const ID_PREFIX = 'commitment_';

export interface SurfacedInsight {
  id: string;
  message: string;
  followUp?: string;
  category: string;
}

type Gated = 'crisis' | 'heavy-mood' | 'low-quality' | 'future-event' | 'call-not-completed';
type Unasked = 'asked-recently' | 'store-unreadable' | 'timeout';
export type FollowUpReason = 'picked' | 'none' | 'other-insight' | Gated | Unasked;

interface Decision {
  reason: FollowUpReason;
  topicHash: string | null;
  insight?: SurfacedInsight;
}

export interface FollowUpGateDeps {
  /** The user's active commitments, newest first (stored documents). */
  commitments(userId: string): Promise<Array<Record<string, unknown>>>;
  /** When each key was last asked; throws when the record can't be read. */
  lastAsked(userId: string, keys: string[]): Promise<Map<string, number>>;
  callRecords: CallRecords;
}

export const liveFollowUpGateDeps: FollowUpGateDeps = {
  commitments: async (userId) =>
    (await loadUserCommitments(userId)).map((c) => ({ ...c }) as Record<string, unknown>),
  lastAsked: async (userId, keys) => {
    if (!getFirestoreDb()) throw new Error('ask record unavailable');
    return lastAsked(userId, keys);
  },
  callRecords: firestoreCallRecords,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WHEN =
  /\b(today|tonight|tomorrow|this weekend|next week|(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i;

/**
 * When the thing a commitment names is over, so it may be asked about; 0 when it
 * names no time. Rounded late on purpose (the caller's time zone is unknown): a
 * named day is over at 06:00 UTC the next morning, late evening across the US.
 */
export function eventOverAt(createdAt: number, words: string, targetDate?: number): number {
  const m = WHEN.exec(words);
  let named = 0;
  if (m) {
    const w = m[1].toLowerCase();
    const dow = new Date(createdAt).getUTCDay();
    const days =
      w === 'today' || w === 'tonight'
        ? 0
        : w === 'tomorrow'
          ? 1
          : w === 'this weekend'
            ? (7 - dow) % 7
            : w === 'next week'
              ? 7 + ((7 - dow) % 7)
              : ((WEEKDAYS.indexOf(m[2].toLowerCase()) - dow + 7) % 7 || 7) +
                (w.startsWith('next') ? 7 : 0);
    named = Math.floor(createdAt / DAY_MS) * DAY_MS + (days + 1) * DAY_MS + 6 * HOUR_MS;
  }
  return Math.max(named, targetDate ?? 0);
}

/** The person a promise to call or text names ("text my sister" is "sister"), or null. */
const personToReach = (s: string): string | null =>
  personToCall(s.replace(/\b(text|message)\b/gi, 'call'));

const hashOf = (key: string): string => key.slice(0, 12);

/** The commitment to follow up on now, or why there is none. */
export async function pickCommitmentFollowUp(
  userId: string,
  now: number,
  deps: FollowUpGateDeps = liveFollowUpGateDeps
): Promise<Decision> {
  const docs = await deps.commitments(userId);
  const owned = docs.flatMap((d) => {
    const open = toOpenCommitment(String(d.id ?? ''), d);
    const text = String(d.summary || d.statement || '').trim();
    if (!open || !isAskableCommitment(open.statement) || !isAskableCommitment(text)) return [];
    return [{ open, text, key: commitmentKey(userId, text) }];
  });
  if (owned.length === 0) return { reason: docs.length ? 'low-quality' : 'none', topicHash: null };

  const past = owned.filter(
    (c) => eventOverAt(c.open.createdAt, `${c.open.statement} ${c.text}`, c.open.targetDate) <= now
  );
  if (past.length === 0) return { reason: 'future-event', topicHash: hashOf(owned[0].key) };

  const candidates = past.slice(0, MAX_CANDIDATES);
  const people = candidates.map((c) => personToReach(c.open.statement) ?? personToReach(c.text));
  let records: Awaited<ReturnType<CallRecords['load']>> | null = null;
  if (people.some(Boolean)) {
    records = await deps.callRecords.load(userId, new Date(now - 7 * DAY_MS)).catch((error) => {
      log.warn({ userId, error: String(error) }, 'Call status not read: no call follow-up');
      return null;
    });
  }
  const settled = candidates.filter((_, i) => {
    const person = people[i];
    return (
      !person || (records !== null && callStatusOf(person, records, now)?.state === 'completed')
    );
  });
  if (settled.length === 0) return { reason: 'call-not-completed', topicHash: hashOf(past[0].key) };

  let asked: Map<string, number>;
  try {
    asked = await deps.lastAsked(
      userId,
      settled.map((c) => c.key)
    );
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Ask record not read: no follow-up');
    return { reason: 'store-unreadable', topicHash: hashOf(settled[0].key) };
  }
  const pick = settled.find((c) => now - (asked.get(c.key) ?? 0) >= FOLLOW_UP_SPACING_MS);
  if (!pick) return { reason: 'asked-recently', topicHash: hashOf(settled[0].key) };

  return {
    reason: 'picked',
    topicHash: hashOf(pick.key),
    insight: {
      id: `${ID_PREFIX}${pick.key}`,
      category: 'commitment_reminder',
      message: `Earlier they said "${pick.open.statement}". If it fits, ask how it went or how it's going, once, in your own words.`,
      followUp: 'No pressure: just checking in on something that mattered to them.',
    },
  };
}

/**
 * ARC_INSIGHT_ONCE: an emotional-arc insight reaches the prompt once, not on every
 * third turn. Arcs are picked from getActiveArcs with no surfaced check, so the same
 * arc came back at turn 6, 12, 18... for a whole call (13 times in one, #2283).
 */
export function arcInsightOnceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARC_INSIGHT_ONCE === 'on';
}

function arcAlreadyRaised(userId: string, insight: SurfacedInsight): boolean {
  return (
    insight.category === 'emotional_trajectory' &&
    arcInsightOnceEnabled() &&
    wasInsightSurfaced(userId, insight.id)
  );
}

function logDecision(
  input: { userId: string; sessionId?: string },
  d: Pick<Decision, 'reason' | 'topicHash'>
): void {
  log.info(
    {
      source: 'proactive-engine',
      picked: d.reason === 'picked',
      reason: d.reason,
      topicHash: d.topicHash,
      userId: input.userId,
      sessionId: input.sessionId,
    },
    'FOLLOWUP_DECISION'
  );
}

/**
 * The proactive insight to inject on this turn, or null. Turn 1 (call start) and
 * every third turn after, as before; a commitment follow-up must pass the gate.
 * Logs one FOLLOWUP_DECISION per call start.
 */
export async function surfaceProactiveInsight(
  input: {
    userId: string;
    sessionId?: string;
    turnNumber: number;
    insight?: SurfacedInsight;
    /** This turn's crisis read: a crisis, a soft check or an override all count. */
    crisis?: { isCrisis?: boolean; softCheck?: boolean; shouldOverrideLLM?: boolean };
    distressLevel?: number;
    now?: number;
  },
  deps: FollowUpGateDeps = liveFollowUpGateDeps
): Promise<SurfacedInsight | null> {
  const { insight, turnNumber } = input;
  const start = turnNumber === 1;
  const pause = turnNumber > 1 && turnNumber % 3 === 0;
  const due = !!insight && (start || (pause && insight.category !== 'late_night_support'));
  if (!insight || !due || insight.category !== 'commitment_reminder') {
    if (start) logDecision(input, { reason: insight ? 'other-insight' : 'none', topicHash: null });
    if (due && arcAlreadyRaised(input.userId, insight)) return null;
    return due ? (insight ?? null) : null;
  }

  let decision: Decision;
  const { crisis } = input;
  if (crisis?.isCrisis || crisis?.softCheck || crisis?.shouldOverrideLLM) {
    decision = { reason: 'crisis', topicHash: null };
  } else if ((input.distressLevel ?? 0) >= HEAVY_DISTRESS) {
    decision = { reason: 'heavy-mood', topicHash: null };
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Decision>((resolve) => {
      timer = setTimeout(() => resolve({ reason: 'timeout', topicHash: null }), GATE_TIMEOUT_MS);
    });
    decision = await Promise.race([
      pickCommitmentFollowUp(input.userId, input.now ?? Date.now(), deps),
      timeout,
    ])
      .catch((error: unknown): Decision => {
        log.warn({ userId: input.userId, error: String(error) }, 'Follow-up gate failed');
        return { reason: 'store-unreadable', topicHash: null };
      })
      .finally(() => clearTimeout(timer));
  }
  if (start) logDecision(input, decision);
  return decision.insight ?? null;
}

/** The system note that carries a proactive insight into the prompt. */
export function promptFor(insight: SurfacedInsight): string {
  const followUp = insight.followUp ? `\nFollow-up: ${insight.followUp}` : '';
  return `[PROACTIVE INSIGHT - Consider sharing naturally]\n${insight.message}${followUp}`;
}

/**
 * Records a commitment follow-up as asked, once its insight is in the prompt.
 * Other insights are left alone. Never throws.
 */
export async function noteFollowUpInjected(
  userId: string,
  insightId: string,
  now: number = Date.now()
): Promise<void> {
  if (!insightId.startsWith(ID_PREFIX)) return;
  await recordCheckIns(userId, [insightId.slice(ID_PREFIX.length)], now).catch((error: unknown) =>
    log.warn({ userId, error: String(error) }, 'Follow-up ask not recorded')
  );
}
