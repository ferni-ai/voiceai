/**
 * What an earlier call was about, from its summary, when a turn is about it.
 *
 * Recall read extracted facts and the summaries' open threads, never the
 * summaries' key points. On Seth's real calls (memory benchmark, 2026-10-11)
 * the facts held what a question needed for 9 of 29 questions, and facts and
 * summaries together for 20: the summary often keeps what the line-by-line
 * extractor lost ("talked through switching his Vanguard account to a Roth").
 *
 * When the call starts, the last few summaries' key points become short dated
 * snippets. A turn that shares its rarer words with a snippet, or (with
 * SEMANTIC_RECALL) means the same thing, gets it as "From our call on Jan 9:
 * ...", within its own small budget and once a call. Nothing on the turn
 * path waits.
 *
 * Forgetting fails closed, as episode quotes do (episodes.ts): a summary
 * marked forgottenAt is left out, and so is the WHOLE summary when any of
 * its text (key points, threads, topics) is about a forgotten topic, by the
 * same matcher episode quotes use (isForgottenPassage), not one sentence
 * at a time. A topic forgotten during the call drops its summaries from the
 * next turn on. If the forgotten topics can't be read, are malformed, or
 * take longer than FORGOTTEN_WAIT_MS, nothing from summaries is offered.
 *
 * RECALL_SUMMARIES=on turns it on.
 *
 * @module memory/recall/call-summaries
 */
import { createLogger } from '../../utils/safe-logger.js';
import { forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { isForgottenPassage } from './episodes.js';
import { contentWords, type RecallStore } from './session-recall.js';
import {
  createSemanticIndex,
  estimateTokens,
  withinTokens,
  type RetrievalEmbedder,
  type SemanticIndex,
} from './semantic-recall.js';

const log = createLogger({ module: 'recall-summaries' });

export function summaryRecallEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECALL_SUMMARIES === 'on';
}

export interface SummarySnippet {
  id: string;
  /** When the call took place (ISO). */
  at: string;
  text: string;
  /** All the words of the summary it came from, checked whole against forgotten topics. */
  whole: string;
}

/** Past this, the forgotten topics count as unreadable and nothing is offered. */
export const FORGOTTEN_WAIT_MS = 5000;

/** Snippet words per turn, in tokens: about two key points. */
export const SUMMARY_TOKENS_PER_TURN = 70;
const MAX_PER_TURN = 2;
/** A key point this long is a paragraph, not a snippet. */
const MAX_SNIPPET_CHARS = 240;
/** A word in no more than this share of the snippets is distinctive enough to match alone. */
const RARE_SHARE = 0.15;
const MIN_RARE_LETTERS = 4;

function isoOf(v: unknown): string | undefined {
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** Every string in a summary's fields, one level of arrays deep. */
function summaryText(s: Record<string, unknown>): string {
  return Object.values(s)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === 'string')
    .join(' \n ');
}

/**
 * Key points of the summaries (newest first), dated. A summary marked
 * forgotten, or with any text about a forgotten topic, gives none.
 */
export function summarySnippets(
  summaries: ReadonlyArray<Record<string, unknown>>,
  forgotten: readonly string[]
): SummarySnippet[] {
  const out: SummarySnippet[] = [];
  const seen = new Set<string>();
  for (const [i, s] of summaries.entries()) {
    if (s.forgottenAt !== undefined && s.forgottenAt !== null) continue;
    const at = isoOf(s.timestamp);
    const whole = summaryText(s);
    if (!at || isForgottenPassage(whole, forgotten)) continue;
    const points = Array.isArray(s.keyPoints) ? s.keyPoints : [];
    for (const [j, p] of points.entries()) {
      if (typeof p !== 'string') continue;
      const text = p.trim().slice(0, MAX_SNIPPET_CHARS);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `summary:${i}:${j}`, at, text, whole });
    }
  }
  return out;
}

/** The topics, or null when unreadable, malformed or slow: then nothing is offered. */
async function topicsOrNull(read: () => Promise<string[] | null>): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), FORGOTTEN_WAIT_MS);
  });
  try {
    const topics = await Promise.race([read(), late]);
    return Array.isArray(topics) && topics.every((t) => typeof t === 'string') ? topics : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Snippets that share words with the turn: two or more, or one that is rare
 * among the snippets ("Roth", not "work"). Best first.
 */
export function wordMatches(snippets: readonly SummarySnippet[], turn: string): string[] {
  const said = contentWords(turn);
  if (said.size === 0) return [];
  const words = snippets.map((s) => contentWords(s.text));
  const df = new Map<string, number>();
  for (const ws of words) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const rare = (w: string) =>
    w.length >= MIN_RARE_LETTERS && (df.get(w) ?? 0) <= Math.max(1, snippets.length * RARE_SHARE);
  return snippets
    .map((s, i) => {
      const shared = [...(words[i] ?? [])].filter((w) => said.has(w));
      const score = shared.reduce((sum, w) => sum + 1 / (df.get(w) ?? 1), 0);
      const ok = shared.length >= 2 || shared.some(rare);
      return { id: s.id, score: ok ? score : 0 };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.id);
}

/** "Jan 9", the way a friend would name the call. */
function callDay(at: string): string {
  return new Date(at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatSummarySnippets(picked: readonly SummarySnippet[]): string | null {
  if (picked.length === 0) return null;
  return [
    'From earlier calls (as of then; it may have changed since):',
    ...picked.map((s) => `- From our call on ${callDay(s.at)}: ${s.text}`),
  ].join('\n');
}

export interface SummaryRecall {
  ready: Promise<void>;
  observe: (text: string) => void;
  /** Snippets this turn is about, not yet offered this call, within the turn's budget, as a note. */
  take: (turn: string) => string | null;
  newTurn: () => void;
}

export function createSummaryRecall(deps: {
  userId: string;
  store: Pick<RecallStore, 'summaries'>;
  /** With SEMANTIC_RECALL: snippets also match by meaning. */
  embed?: RetrievalEmbedder;
  /** Topics the caller asked to forget, or null if unreadable: then nothing is offered. */
  forgotten?: () => Promise<string[] | null>;
}): SummaryRecall {
  const byId = new Map<string, SummarySnippet>();
  let snippets: SummarySnippet[] = [];
  let index: SemanticIndex | undefined;
  const offered = new Set<string>();
  let tokensLeft = SUMMARY_TOKENS_PER_TURN;
  const ready = Promise.all([
    deps.store.summaries(deps.userId),
    topicsOrNull(deps.forgotten ?? (async () => forgottenTopicsOrNull(deps.userId))),
  ])
    .then(async ([summaries, forgotten]) => {
      if (forgotten === null) {
        log.warn('Forgotten topics unreadable: offering no summaries this call');
        return;
      }
      snippets = summarySnippets(summaries, forgotten);
      for (const s of snippets) byId.set(s.id, s);
      if (deps.embed && snippets.length > 0) {
        index = createSemanticIndex(
          snippets.map((s) => ({ id: s.id, text: s.text })),
          deps.embed
        );
        await index.ready;
      }
      log.info({ snippets: snippets.length }, 'Summary snippets ready');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Summaries not loaded'));
  return {
    ready,
    observe: (text) => index?.observe(text),
    take(turn) {
      if (snippets.length === 0) return null;
      const ids = [
        ...new Set([...(index?.matches().keys() ?? []), ...wordMatches(snippets, turn)]),
      ];
      // A topic forgotten during this call drops its whole summary at once.
      const forgottenNow = forgottenInProcess(deps.userId);
      const fresh = ids
        .filter((id) => !offered.has(id))
        .flatMap((id) => byId.get(id) ?? [])
        .filter((s) => !isForgottenPassage(s.whole, forgottenNow))
        .slice(0, MAX_PER_TURN);
      const picked = withinTokens(fresh, (s) => s.text, tokensLeft);
      for (const s of picked) offered.add(s.id);
      tokensLeft -= estimateTokens(picked.map((s) => s.text));
      return formatSummarySnippets(picked);
    },
    newTurn: () => {
      tokensLeft = SUMMARY_TOKENS_PER_TURN;
      index?.newTurn();
    },
  };
}
