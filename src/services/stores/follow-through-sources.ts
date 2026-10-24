/**
 * What the existing stores say Ferni should follow through on, for the
 * follow-through importer (services/follow-through/import-follow-ups.ts):
 *
 * - pending reminders (bogle_users/{uid}/reminders, status 'pending');
 * - open commitments (bogle_users/{uid}/commitments), parsed by the same
 *   rules the call check-in uses, so sign-offs like "I need to go" stay out;
 * - follow-up items from the last calls' summaries, only from summaries
 *   checked against the caller's own lines (callerProvenance) and without the
 *   items the assistant raised or the caller disputed: the same rule the
 *   recall threads use (memory/recall/session-recall.ts).
 *
 * - with BOOKENDS on (SourceOptions.bookends), the caller's timed one-time
 *   dates from the world facts store (follow-through/bookend-source.ts).
 *
 * Anything about a topic the caller asked Ferni to forget is left out. When
 * that list can't be read, the commitments and call threads (raw words) are
 * left out too: erring toward silence is the right side of a privacy request.
 * Reminders are the caller's own explicit asks and are kept either way.
 *
 * @module services/stores/follow-through-sources
 */

import type { Firestore } from '@google-cloud/firestore';
import {
  bookendSourceItems,
  type BookendDateFact,
  type FollowUpSources,
  type SourceItem,
} from '../follow-through/index.js';
import {
  createFirestoreWorldFactStore,
  type WorldFactStore,
} from '../../intelligence/world-model/temporal/store.js';
import { firestoreCommitmentStore, toOpenCommitment } from '../superhuman/commitment-follow-up.js';
import { judgedRowText, singleWriterFor } from '../superhuman/commitment-single-writer.js';
import { readCallSummaries } from '../../memory/storage/call-summaries.js';
import { forgottenTopicsOrNull } from '../../memory/recall/forget.js';
import { CALLER_PROVENANCE, isForgotten, undisputed } from '../../memory/recall/session-recall.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'follow-through-sources' });

/** How many recent summaries' follow-up items to bring in, and how many reminders. */
const SUMMARIES = 3;
const REMINDERS = 50;

const iso = (ms: number | undefined): string | null =>
  ms !== undefined && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

async function pendingReminders(db: Firestore, userId: string): Promise<SourceItem[]> {
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('reminders')
    .where('status', '==', 'pending')
    .limit(REMINDERS)
    .get();
  return snap.docs.flatMap((d) => {
    const r = d.data();
    const text = typeof r.message === 'string' ? r.message.trim() : '';
    const due =
      typeof r.scheduledFor === 'string' && !Number.isNaN(Date.parse(r.scheduledFor))
        ? r.scheduledFor
        : null;
    if (!text || !due) return [];
    return [
      {
        kind: 'reminder' as const,
        text,
        dueAt: new Date(due).toISOString(),
        repeat: null,
        source: { store: 'reminders', ref: d.id },
        ...(isValidTimeZone(r.timezone) ? { zone: r.timezone } : {}),
      },
    ];
  });
}

async function openCommitments(
  userId: string,
  forgotten: readonly string[]
): Promise<SourceItem[]> {
  const docs = await firestoreCommitmentStore.active(userId);
  const judgedOnly = await singleWriterFor(userId);
  return docs.flatMap((d) => {
    const c = toOpenCommitment(d.id, d.data, { judgedOnly });
    // A judged row's resolved statement may not name the person: check its person too.
    if (!c || isForgotten(judgedOnly ? judgedRowText(d.data) : c.statement, forgotten)) return [];
    // A money or credential item is raised only on a call, never in a follow-through text.
    if (c.sensitive) return [];
    return [
      {
        kind: 'commitment' as const,
        text: c.statement,
        dueAt: iso(c.targetDate ?? c.followUpAfter),
        repeat: null,
        source: { store: 'commitments', ref: c.id },
      },
    ];
  });
}

async function lastCallThreads(
  db: Firestore,
  userId: string,
  forgotten: readonly string[]
): Promise<SourceItem[]> {
  const { docs } = await readCallSummaries(db, userId, { limit: SUMMARIES });
  return docs.flatMap((d) => {
    const data = d.data();
    // A thread is theirs only if the summary checked it against their own lines;
    // a legacy summary with no check is treated as unchecked and left out
    if (data.callerProvenance !== CALLER_PROVENANCE) return [];
    const items: unknown[] = Array.isArray(data.followUpItems) ? data.followUpItems : [];
    // Minus what Ferni raised or they disputed; the ref keeps the stored index, so ids stay put
    const theirs = undisputed(data).followUpItems;
    const kept = new Set(Array.isArray(theirs) ? theirs : []);
    return items.flatMap((item, i) => {
      const text = String(item).trim();
      if (!text || !kept.has(item) || isForgotten(text, forgotten)) return [];
      return [
        {
          kind: 'thread' as const,
          text,
          dueAt: null,
          repeat: null,
          source: { store: 'summaries', ref: `${d.id}:${i}` },
        },
      ];
    });
  });
}

async function timedDates(
  facts: WorldFactStore,
  userId: string,
  forgotten: readonly string[],
  opts: { zone: string; now: Date; heavy: (text: string) => boolean }
): Promise<SourceItem[]> {
  const open = (await facts.listOpen(userId)) as BookendDateFact[];
  const kept = open.filter((f) => !isForgotten(`${f.subject} ${f.value}`, forgotten));
  return bookendSourceItems(kept, opts);
}

export interface FollowUpSourceDeps {
  /** The world facts store (dates that matter live there); Firestore by default. */
  facts?: WorldFactStore;
  /** True when the words are heavy (!isLightTopic). Unknown reads heavy: the private side. */
  heavy?: (text: string) => boolean;
}

export function createFollowUpSources(
  db: Firestore,
  deps: FollowUpSourceDeps = {}
): FollowUpSources {
  return {
    async itemsFor(userId, now, opts) {
      const forgotten = await forgottenTopicsOrNull(userId);
      const reads: Array<Promise<SourceItem[]>> = [pendingReminders(db, userId)];
      if (forgotten !== null)
        reads.push(openCommitments(userId, forgotten), lastCallThreads(db, userId, forgotten));
      else log.warn({ userId }, 'Forgotten topics unreadable: importing reminders only');
      if (forgotten !== null && opts?.bookends) {
        const facts = deps.facts ?? createFirestoreWorldFactStore(() => db);
        const heavy = deps.heavy ?? (() => true);
        reads.push(timedDates(facts, userId, forgotten, { ...opts.bookends, now, heavy }));
      }
      const settled = await Promise.allSettled(reads);
      return settled.flatMap((r) => {
        if (r.status === 'fulfilled') return r.value;
        log.warn({ error: String(r.reason), userId }, 'A follow-up source could not be read');
        return [];
      });
    },
  };
}
