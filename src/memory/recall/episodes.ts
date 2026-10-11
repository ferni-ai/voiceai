/**
 * The caller's own words from earlier calls, found by meaning when a turn is
 * about them.
 *
 * Recall read only extracted facts, and extraction drops a lot of real
 * speech: on Seth's real calls the needed detail reached the recall note for
 * 21 to 31% of questions (memory benchmark, 2026-10-11). A friend
 * paraphrases; Ferni can quote. The live pipeline already stores every turn
 * (bogle_users/{uid}/conversations/{id}/turns); this reads the caller's lines
 * from their last few calls, in short overlapping passages so a fact spread
 * over lines ("call my brother", "his name is Pete", "it's 435 339 7687")
 * stays together, and embeds them once when the call starts. A turn that
 * means the same thing as a passage gets it quoted, within its own small
 * budget. Nothing on the turn path waits for any of it.
 *
 * Needs SEMANTIC_RECALL; RECALL_EPISODES=on turns it on.
 *
 * @module memory/recall/episodes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  createSemanticIndex,
  estimateTokens,
  withinTokens,
  type RetrievalEmbedder,
  type SemanticIndex,
} from './semantic-recall.js';

const log = createLogger({ module: 'recall-episodes' });

export function recallEpisodesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECALL_EPISODES === 'on';
}

export interface EpisodeCall {
  id: string;
  /** When the call started (ISO). */
  at: string;
  /** The caller's own lines, in order. */
  lines: string[];
}

export interface Episode {
  id: string;
  at: string;
  text: string;
}

export interface EpisodeStore {
  /** The caller's most recent calls that started before `before`, newest first. */
  calls: (userId: string, before: Date) => Promise<EpisodeCall[]>;
}

/** Lines per passage, and how far each passage moves on (so passages overlap by one line). */
const WINDOW = 3;
const STRIDE = 2;
const MAX_EPISODES = 240;
/** Quoted words per turn, in tokens: about two short passages. */
export const EPISODE_TOKENS_PER_TURN = 80;
const CALLS_READ = 8;
/** A call this short is a test or a hang-up. */
const MIN_TURNS = 4;

/** Short overlapping passages of each call's lines, newest call first. */
export function episodesOf(calls: readonly EpisodeCall[]): Episode[] {
  const out: Episode[] = [];
  for (const call of calls) {
    const lines = call.lines.map((l) => l.trim()).filter((l) => l.split(/\s+/).length >= 2);
    for (let i = 0; i < lines.length && out.length < MAX_EPISODES; i += STRIDE) {
      out.push({
        id: `said:${call.id}:${i}`,
        at: call.at,
        text: lines.slice(i, i + WINDOW).join(' '),
      });
      if (i + WINDOW >= lines.length) break;
    }
  }
  return out;
}

function ago(at: string, now: number): string {
  const days = Math.floor((now - Date.parse(at)) / 86_400_000);
  if (!Number.isFinite(days) || days < 1) return 'earlier today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function formatEpisodes(episodes: readonly Episode[], now: number): string | null {
  if (episodes.length === 0) return null;
  return [
    'What they said on earlier calls, in their own words (as of then; it may have changed since):',
    ...episodes.map((e) => `- (${ago(e.at, now)}) "${e.text}"`),
  ].join('\n');
}

export interface EpisodeRecall {
  ready: Promise<void>;
  observe: (text: string) => void;
  /** Passages this turn is about that haven't been quoted yet in the call, as a note. */
  take: () => string | null;
  newTurn: () => void;
}

export function createEpisodeRecall(deps: {
  userId: string;
  /** When this call started: its own lines are not "earlier". */
  before: Date;
  store?: EpisodeStore;
  embed?: RetrievalEmbedder;
  now?: () => number;
}): EpisodeRecall {
  const byId = new Map<string, Episode>();
  const quoted = new Set<string>();
  let index: SemanticIndex | undefined;
  let tokensLeft = EPISODE_TOKENS_PER_TURN;
  const ready = (deps.store ?? firestoreEpisodeStore)
    .calls(deps.userId, deps.before)
    .then(async (calls) => {
      const episodes = episodesOf(calls);
      for (const e of episodes) byId.set(e.id, e);
      index = createSemanticIndex(
        episodes.map((e) => ({ id: e.id, text: e.text })),
        deps.embed
      );
      await index.ready;
      log.info({ calls: calls.length, episodes: episodes.length }, 'Episode index ready');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Episodes not loaded'));
  return {
    ready,
    observe: (text) => index?.observe(text),
    take: () => {
      if (!index) return null;
      const fresh = [...index.matches().keys()]
        .filter((id) => !quoted.has(id))
        .flatMap((id) => byId.get(id) ?? []);
      const picked = withinTokens(fresh, (e) => e.text, tokensLeft);
      for (const e of picked) quoted.add(e.id);
      tokensLeft -= estimateTokens(picked.map((e) => e.text));
      return formatEpisodes(picked, (deps.now ?? Date.now)());
    },
    newTurn: () => {
      tokensLeft = EPISODE_TOKENS_PER_TURN;
      index?.newTurn();
    },
  };
}

function millis(v: unknown): number {
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return Date.parse(String(v));
}

/** bogle_users/{uid}/conversations by startedAt, and each call's turns. */
export const firestoreEpisodeStore: EpisodeStore = {
  async calls(userId, before) {
    const db = getFirestoreDb();
    if (!db) return [];
    const convs = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .where('startedAt', '<', before)
      .orderBy('startedAt', 'desc')
      .limit(CALLS_READ * 2)
      .get();
    const recent = convs.docs
      .filter((d) => {
        const n = d.data().turnCount;
        return typeof n !== 'number' || n >= MIN_TURNS;
      })
      .slice(0, CALLS_READ);
    return Promise.all(
      recent.map(async (d) => {
        const turns = (await d.ref.collection('turns').get()).docs
          .map((t) => t.data())
          .filter((t) => t.role === 'user' && typeof t.content === 'string')
          .map((t) => ({ at: millis(t.timestamp), text: String(t.content) }))
          .sort((a, b) => a.at - b.at);
        return {
          id: d.id,
          at: new Date(millis(d.data().startedAt)).toISOString(),
          lines: turns.map((t) => t.text),
        };
      })
    );
  },
};
