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
 * over lines ("call my brother", "his name is Pete", "it's 435 555 0188")
 * stays together, and embeds them once when the call starts. A turn that
 * means the same thing as a passage gets it quoted, within its own small
 * budget. Nothing on the turn path waits for any of it.
 *
 * Needs SEMANTIC_RECALL; RECALL_EPISODES=on turns it on.
 *
 * @module memory/recall/episodes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { isForgottenPassage } from '../domain/forgotten.js';
// The shared passage matcher, re-exported for its existing importers.
export { isForgottenPassage };
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
export const CALLS_READ = 8;
/** A call this short is a test or a hang-up. */
export const MIN_TURNS = 4;

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
    'What they said on earlier calls, in their own words (as of then; it may have changed since; speech-to-text may have garbled them, so if a quote is unclear, ask rather than assert):',
    ...episodes.map((e) => `- (${ago(e.at, now)}) "${e.text}"`),
  ].join('\n');
}

/** No store given: no earlier calls (the live hook passes storage/episode-store.ts). */
const noCalls: EpisodeStore = { calls: async () => [] };

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
  /** Topics the caller asked to forget (forget.ts), or null if unreadable: then nothing is quoted. */
  forgotten?: () => Promise<string[] | null>;
}): EpisodeRecall {
  const byId = new Map<string, Episode>();
  const quoted = new Set<string>();
  let index: SemanticIndex | undefined;
  let tokensLeft = EPISODE_TOKENS_PER_TURN;
  const ready = Promise.all([
    (deps.store ?? noCalls).calls(deps.userId, deps.before),
    (deps.forgotten ?? (() => forgottenTopicsOrNull(deps.userId)))(),
  ])
    .then(async ([calls, forgotten]) => {
      if (forgotten === null) {
        log.warn('Forgotten topics unreadable: quoting nothing this call');
        return;
      }
      // Stored transcripts still hold what they asked to forget; quotes never do.
      const episodes = episodesOf(calls).filter((e) => !isForgottenPassage(e.text, forgotten));
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
      // A topic forgotten during this call counts at once.
      const forgottenNow = forgottenInProcess(deps.userId);
      const fresh = [...index.matches().keys()]
        .filter((id) => !quoted.has(id))
        .flatMap((id) => byId.get(id) ?? [])
        .filter((e) => !isForgottenPassage(e.text, forgottenNow));
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
