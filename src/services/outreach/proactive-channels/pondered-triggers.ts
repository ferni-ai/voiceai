/**
 * Grounded check-ins for the proactive run: the nightly pondering pass's
 * follow-ups (bogle_users/{uid}/predictive_intelligence/pondering), each
 * backed by the caller's own words from that call and timed and capped by
 * grounded-checkin.ts. They go out as a note in the app, never a text: they
 * are not time-sensitive enough to interrupt someone.
 *
 * The caller's words come from the call the item cites: its summary names the
 * session, and the conversations that started during that session hold the
 * turns. Reads only.
 *
 * Nothing goes out within CRISIS_QUIET_DAYS of a crisis-level signal (the
 * shared rule in human-transfer/crisis-signals.ts), whatever the pass wrote.
 *
 * Off unless OUTREACH_PONDERED_NOTES is on: for everyone (the server's env),
 * or for one person through their cohort flags (COHORT_FLAGS=on, read from
 * Firestore per user, never from this process's env). It is its own switch,
 * not the OUTREACH_GROUNDED_CHECKINS kill switch, which is on by default.
 *
 * @module services/outreach/proactive-channels/pondered-triggers
 */

import { createHash } from 'node:crypto';
import { flagOn } from '../../../config/env-flag.js';
import { cohortFlagsEnabled, resolveCallerFlags } from '../../platform/cohort-flags.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { CRISIS_QUIET_DAYS, hadCrisisWithin } from '../../human-transfer/crisis-signals.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import {
  dueNow,
  planCheckIns,
  type CheckInItem,
  type PlannedCheckIn,
  type SourceCall,
} from '../grounded-checkin.js';
import { recentOutreach } from './outreach-log.js';
import type { ProactiveTrigger } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A conversation may open a little before the session id's clock. */
const CALL_SLACK_MS = 2 * 60 * 1000;
const MAX_TURNS = 400;
export const SOURCE_PREFIX = 'grounded:';

type DocRef = FirebaseFirestore.DocumentReference;

function toMs(value: unknown): number | undefined {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  if (raw === undefined || raw === null) return undefined;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isNaN(t) ? undefined : t;
}

export function itemId(basis: string, text: string): string {
  return createHash('sha1').update(`${basis}|${text}`).digest('hex').slice(0, 16);
}

/** The pondering doc's follow-ups, as check-in items. */
export function followUpsOf(doc: unknown): CheckInItem[] {
  const list = (doc as { followUps?: unknown } | undefined)?.followUps;
  if (!Array.isArray(list)) return [];
  return list.flatMap((f: { text?: unknown; basis?: unknown; when?: unknown }) =>
    typeof f?.text === 'string' && typeof f.basis === 'string'
      ? [
          {
            id: itemId(f.basis, f.text),
            text: f.text,
            basis: f.basis,
            ...(typeof f.when === 'string' && { when: f.when }),
          },
        ]
      : []
  );
}

/** The call behind each summary: its day (their time), when it ended, and the caller's lines. */
export async function loadSourceCalls(
  user: DocRef,
  summaryIds: readonly string[],
  timezone: string
): Promise<Map<string, SourceCall>> {
  const calls = new Map<string, SourceCall>();
  for (const id of new Set(summaryIds)) {
    // Sequential on purpose: a handful of calls, paced reads.
    // eslint-disable-next-line no-await-in-loop
    const summary = (await user.collection('summaries').doc(id).get()).data();
    const start = Number(/-(\d{13})$/.exec(String(summary?.sessionId ?? ''))?.[1]);
    const endedAt = toMs(summary?.timestamp);
    if (!start || endedAt === undefined) continue;
    // eslint-disable-next-line no-await-in-loop
    const convs = await user
      .collection('conversations')
      .orderBy('__name__')
      .startAt(`conv_${start - CALL_SLACK_MS}`)
      .endAt(`conv_${endedAt}`)
      .get();
    const userLines: string[] = [];
    for (const conv of convs.docs) {
      // eslint-disable-next-line no-await-in-loop
      const turns = await conv.ref.collection('turns').limit(MAX_TURNS).get();
      for (const t of turns.docs) {
        const { role, content } = t.data() as { role?: unknown; content?: unknown };
        if (role === 'user' && typeof content === 'string') userLines.push(content);
      }
    }
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(endedAt);
    calls.set(id, { date, endedAt, userLines });
  }
  return calls;
}

export function firstName(user: Record<string, unknown>): string | undefined {
  const raw = [user.preferredName, user.name].find((n): n is string => typeof n === 'string');
  const first = raw?.trim().split(/\s+/)[0];
  if (!first || !/^[\p{L}'-]{2,20}$/u.test(first)) return undefined;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function toTrigger(p: PlannedCheckIn): ProactiveTrigger {
  const quote = p.quote.length > 80 ? `${p.quote.slice(0, 77)}...` : p.quote;
  return {
    sourceId: `${SOURCE_PREFIX}${p.id}`,
    kind: 'follow_up',
    weight: 'light',
    timely: false,
    text: p.message,
    finalText: true, // planned and checked by grounded-checkin.ts: no model rewrite
    reason: `you said "${quote}" on ${p.callDate}`,
    expiresAt: new Date(p.sendAt.getTime() + DAY_MS),
  };
}

export const PONDERED_NOTES_FLAG = 'OUTREACH_PONDERED_NOTES';

/**
 * On for everyone (the server's env, which a person's own 'off' can't undo),
 * else for this person if their cohort flags turn it on. Those are read from
 * Firestore and need COHORT_FLAGS=on on the server running this (the API
 * server's scheduled jobs), not only on the voice agent.
 */
export async function ponderedNotesOn(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  resolveFlags: (userId: string) => Promise<Record<string, string>> = resolveCallerFlags
): Promise<boolean> {
  if (flagOn(PONDERED_NOTES_FLAG, env)) return true;
  if (!cohortFlagsEnabled(env)) return false;
  return (await resolveFlags(userId))[PONDERED_NOTES_FLAG] === 'on';
}

/** The grounded check-ins due now for this user, or none without the flag or a time zone. */
export async function ponderedTriggers(
  userId: string,
  user: Record<string, unknown>,
  now: Date,
  timezone: string | undefined
): Promise<ProactiveTrigger[]> {
  if (!timezone || !(await ponderedNotesOn(userId))) return [];
  const db = getFirestoreDb();
  if (!db) return [];
  if (await hadCrisisWithin(db, userId, CRISIS_QUIET_DAYS, now)) return [];
  const ref = db.collection('bogle_users').doc(userId);
  const pondering = await ref.collection('predictive_intelligence').doc('pondering').get();
  const log = (await recentOutreach(userId, new Date(now.getTime() - 7 * DAY_MS))).filter(
    (e) => e.sourceId.startsWith(SOURCE_PREFIX) && e.outcome !== 'failed'
  );
  const done = new Set(log.map((e) => e.sourceId));
  const items = followUpsOf(pondering.data()).filter((i) => !done.has(SOURCE_PREFIX + i.id));
  if (items.length === 0) return [];
  const { planned } = planCheckIns(items, {
    now,
    timezone,
    name: firstName(user),
    lastTalkedAt: lastTalkedAt(user),
    calls: await loadSourceCalls(
      ref,
      items.map((i) => i.basis),
      timezone
    ),
    sent: log.map((e) => new Date(e.at)),
  });
  return dueNow(planned, now).map(toTrigger);
}
