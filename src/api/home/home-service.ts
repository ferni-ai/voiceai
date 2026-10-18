/**
 * What GET /api/home answers for one person: the Home line and an optional note.
 *
 * Read-only. The greeting's follow-up is the one the call opener would pick
 * (services/follow-through/opener-pick.ts), shown only if it is a light topic;
 * the opener marks it surfaced when Ferni actually asks, never this. The note is
 * the person's latest unraised, grounded pondered item (intelligence/pondering),
 * never the generic "thinking about you" fallback, and light topics only.
 *
 * Each half fails alone: an unreadable store gives the plain greeting or no
 * note, never an error, and nothing logged carries a person's words.
 *
 * @module api/home/home-service
 */
import type { Firestore } from 'firebase-admin/firestore';
import { followThroughOpenerEnabled } from '../../agents/multi-agent/follow-through-opener.js';
import { ponderedNoteId } from '../../intelligence/pondering/note-id.js';
import type { OpenerAsk } from '../../intelligence/pondering/pondering-opener.js';
import { loadOpenerPick } from '../../services/follow-through/opener-pick.js';
import type { FollowUpStore } from '../../services/follow-through/ports.js';
import { createLogger } from '../../utils/safe-logger.js';
import { FIRST_VISIT_TEXT, timeOfDayGreeting, type HomeGreeting } from './home-greeting.js';
import { isLightTopic } from './light-topic.js';

const log = createLogger({ module: 'HomeAPI' });

export interface HomeNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface HomeResponse {
  greeting: HomeGreeting;
  note?: HomeNote;
}

export interface HomeDeps {
  /** The verified caller. Never read from the request body or query. */
  userId: string;
  now: Date;
  /** The app's IANA zone, for the time of day. */
  zone?: string;
  env?: Record<string, string | undefined>;
  /** Null when no store is configured. */
  store: FollowUpStore | null;
  forgotten?: (userId: string) => Promise<string[] | null>;
  /** The caller's pondered pick for the opener, or undefined. */
  pondered: (userId: string) => Promise<OpenerAsk | undefined>;
  /** False only when the caller has never had a call. Errors count as "has". */
  hasHistory: (userId: string) => Promise<boolean>;
}

async function followUpGreeting(deps: HomeDeps): Promise<HomeGreeting | null> {
  if (!followThroughOpenerEnabled(deps.env ?? process.env) || !deps.store) return null;
  try {
    const read = await loadOpenerPick({
      userId: deps.userId,
      store: deps.store,
      forgotten: deps.forgotten,
      now: deps.now,
    });
    if (read.status !== 'ok' || !read.picked) return null;
    // The opener's pick or nothing: a heavy pick is not swapped for a lighter one.
    if (!isLightTopic(read.picked.text)) return null;
    return { kind: 'followUp', text: read.picked.text, topicId: read.picked.id };
  } catch (error) {
    log.warn({ error: String(error) }, 'Home follow-up not read');
    return null;
  }
}

async function homeNote(deps: HomeDeps): Promise<HomeNote | undefined> {
  try {
    const ask = await deps.pondered(deps.userId);
    // No pass time, no note: a made-up createdAt would claim a freshness we can't vouch for.
    if (!ask?.generatedAt || !isLightTopic(ask.text)) return undefined;
    return { id: ponderedNoteId(ask.item), text: ask.text, createdAt: ask.generatedAt };
  } catch (error) {
    log.warn({ error: String(error) }, 'Home note not read');
    return undefined;
  }
}

export async function buildHome(deps: HomeDeps): Promise<HomeResponse> {
  const [followUp, note] = await Promise.all([followUpGreeting(deps), homeNote(deps)]);
  if (followUp) return note ? { greeting: followUp, note } : { greeting: followUp };
  const first = await deps.hasHistory(deps.userId).then(
    (has) => !has,
    () => false
  );
  const greeting: HomeGreeting = first
    ? { kind: 'firstVisit', text: FIRST_VISIT_TEXT }
    : timeOfDayGreeting(deps.zone, deps.now);
  return note ? { greeting, note } : { greeting };
}

/** True when the caller has any call summary. */
export async function hasCallHistory(db: Firestore, userId: string): Promise<boolean> {
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversation_summaries')
    .limit(1)
    .get();
  return !snap.empty;
}
