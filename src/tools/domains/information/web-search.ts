/**
 * searchWeb's backend with WEB_SEARCH=on: one Vertex Gemini request grounded
 * in Google Search (its own request: Vertex won't mix grounding with function
 * calls), returned as a few sentences of quoted web data.
 *
 * Search used to come from Gemini Live's built-in googleSearch. Live is gone,
 * and the searchWeb left behind read DuckDuckGo Instant Answers, which carry
 * no news; on a prod call two personas said they had no way to pull it up.
 *
 * Web text is untrusted. The answer goes through the coach-media webData
 * filter (any fragment that orders, addresses someone, names a tool or holds a
 * link is dropped) and reaches the model as one JSON data field under the
 * guard line. A source is named only from the hostname its link resolves to,
 * never from the page's title, which the page writes.
 *
 * Grounding is billed per Google query the model makes ($14 per 1,000 past the
 * 5,000 free each month), so every search spends from two shared counts first:
 * the caller's hour and everyone's day. Either spent, or the count out of
 * reach, and the tool says it can't look that up rather than searching.
 *
 * @module tools/domains/information/web-search
 */

import { flagOn } from '../../../config/env-flag.js';
import { isUnverifiedUserId } from '../../../services/identity/unverified-user-id.js';
import {
  verifiedAllowanceKey,
  verifiedCallerAllowanceOn,
} from '../../../services/identity/verified-caller.js';
import {
  groundedSearch,
  resolveSourceUrl,
  type GroundedAnswer,
} from '../../../services/coach-media/grounded-search.js';
import {
  WEB_DATA_GUARD,
  WEB_DATA_NOTE,
  hostOf,
  isInstructionLike,
  webData,
} from '../../../services/coach-media/result-text.js';
import { rateLimiter } from '../../../services/platform/rate-limiter.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { executeWithProgressiveFeedback } from '../../execution/index.js';

/** A caller waits on this in silence after the lead-in, so it gives up early. */
export const WEB_SEARCH_TIMEOUT_MS = 6000;
/** Naming sources may add this much at most; past it the answer goes without names. */
export const SOURCE_RESOLVE_MS = 1000;
export const MAX_SPOKEN_SENTENCES = 3;
export const MAX_ANSWER_CHARS = 500;
export const MAX_SOURCE_NAMES = 2;

export const PERSON_KEY = 'web-search:person';
export const DAY_KEY = 'web-search:day';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_MAX_PER_PERSON_HOUR = 20;
const DEFAULT_MAX_ANON_PER_HOUR = 10;
/** Every unverified caller together: one bucket, so a fresh id can't reset it. */
export const ANONYMOUS = 'anonymous';
// 150 a day is at most 4,650 a month: inside the 5,000 free Grounding Queries, so a capped month costs nothing.
const DEFAULT_MAX_PER_DAY = 150;
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

const NO_GUESS = "don't guess at anything live like a score, a price or today's news.";
export const NOT_FOUND = `The search found nothing useful. Tell them you couldn't find that just now, and ${NO_GUESS}`;
export const CAPPED = `Searching is paused for now. Tell them warmly you can't look that up right now, and ${NO_GUESS}`;
export const NEEDS_DETAIL = 'Ask them for the specific detail first, then search with it.';
const RELAY =
  'Tell them the answer in a sentence or two in your own words; name a source only if it helps, and never read a link.';

const PROMPT = (query: string, today: string): string =>
  `Today is ${today}. Answer from current web sources: ${query}\n` +
  'In at most 3 short sentences of plain speech, give the answer itself, newest facts first. ' +
  'No lists, links, markdown or source names. Say plainly when sources disagree or nothing recent turned up.';

/** Well-known hosts by the name a person would say. */
const BRANDS: Record<string, string> = {
  'apnews.com': 'AP News',
  'reuters.com': 'Reuters',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'npr.org': 'NPR',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'wsj.com': 'The Wall Street Journal',
  'theguardian.com': 'The Guardian',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'cnn.com': 'CNN',
  'foxnews.com': 'Fox News',
  'nbcnews.com': 'NBC News',
  'cbsnews.com': 'CBS News',
  'abcnews.go.com': 'ABC News',
  'usatoday.com': 'USA Today',
  'politico.com': 'Politico',
  'axios.com': 'Axios',
  'espn.com': 'ESPN',
  'nfl.com': 'the NFL',
  'nba.com': 'the NBA',
  'mlb.com': 'MLB',
  'weather.com': 'The Weather Channel',
  'weather.gov': 'the National Weather Service',
  'wikipedia.org': 'Wikipedia',
  'theverge.com': 'The Verge',
  'techcrunch.com': 'TechCrunch',
};

export function webSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('WEB_SEARCH', env);
}

function positiveIntEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim() ?? '';
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return value > 0 ? value : fallback;
}

/** Searches one caller may run in an hour. */
export function maxSearchesPerPersonHour(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'SEARCH_MAX_PER_PERSON_HOUR', DEFAULT_MAX_PER_PERSON_HOUR);
}

/** Searches all anonymous callers together may run in an hour. */
export function maxAnonSearchesPerHour(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'SEARCH_MAX_ANON_PER_HOUR', DEFAULT_MAX_ANON_PER_HOUR);
}

/** Google queries everyone together may spend in a day (the billed unit). */
export function maxSearchQueriesPerDay(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'SEARCH_MAX_PER_DAY', DEFAULT_MAX_PER_DAY);
}

/** A link, stopping before a closing bracket or the sentence's own punctuation. */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)\]]*[^\s)\].,;:!?]/gi;

/**
 * Plain sentences for TTS: no links, markdown, code, citation marks, braces,
 * dashes or ellipses, at most `maxSentences` of them.
 */
export function speakable(text: string, maxSentences = MAX_SPOKEN_SENTENCES): string {
  const plain = text
    .replace(/```[\s\S]*?(?:```|$)|`[^`]*`/g, ' ')
    // JSON args and call shapes go whole, so the sentences around them survive.
    .replace(/\{[^{}]*\{[^{}]*\}[^{}]*\}|\{[^{}]*\}/g, ' ')
    .replace(/\b[A-Za-z_]\w*\([^()]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(URL_RE, '')
    .replace(/\(\s*\)|\[\d+(?:,\s*\d+)*\]/g, '')
    .replace(/^\s*(?:[-•*]|\d+\.)\s+/gm, '')
    .replace(/[*_#>|~{}[\]<]/g, '')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*(?:\.{2,}|…)/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
  if (!plain) return '';
  return (
    plain
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
      // A lone word ("See.") is what is left of a sentence that was only a link.
      .filter((sentence) => /\s/.test(sentence))
      .slice(0, maxSentences)
      .join(' ')
  );
}

/** The answer as speakable, filtered web data: empty when nothing safe is left. */
export function safeAnswer(raw: string): string {
  const filtered = webData(speakable(raw, MAX_SPOKEN_SENTENCES + 2), MAX_ANSWER_CHARS).text;
  return speakable(filtered);
}

/**
 * What to call a source, from its link's hostname only: a known brand, else the
 * registrable domain ("localpaper.com"). Null for the grounding redirect, a
 * hostname that isn't plain DNS, or one whose words read as an order.
 */
export function sourceNameFromUrl(url: string): string | null {
  const host = hostOf(url).toLowerCase();
  if (!host || host === REDIRECT_HOST || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  const labels = host.split('.');
  // Keep a short second level with its country code: bbc.co.uk, abc.net.au.
  const keep =
    labels.length > 2 &&
    labels[labels.length - 1].length === 2 &&
    labels[labels.length - 2].length <= 3
      ? 3
      : 2;
  const domain = labels.slice(-keep).join('.');
  const brand = BRANDS[host] ?? BRANDS[domain];
  if (brand) return brand;
  if (domain.length > 40 || isInstructionLike(domain.replace(/[.-]/g, ' '))) return null;
  return domain;
}

/** Up to two distinct source names, resolving grounding redirects within SOURCE_RESOLVE_MS. */
export async function sourceNames(found: GroundedAnswer): Promise<string[]> {
  const urls = await Promise.all(
    found.sources.map(async (s) => {
      if (hostOf(s.url) !== REDIRECT_HOST) return s.url;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SOURCE_RESOLVE_MS);
      });
      const resolved = await Promise.race([resolveSourceUrl(s.url), late]);
      clearTimeout(timer);
      return resolved;
    })
  );
  const names: string[] = [];
  for (const url of urls) {
    const name = url ? sourceNameFromUrl(url) : null;
    if (name && !names.includes(name)) names.push(name);
    if (names.length === MAX_SOURCE_NAMES) break;
  }
  return names;
}

/** The tool result, in the house shape: guard line, one JSON data field, what to do. */
export function formatSearchResult(answer: string, sources: string[]): string {
  const data = { note: WEB_DATA_NOTE, result: answer, sources };
  return [WEB_DATA_GUARD, `web_data: ${JSON.stringify(data)}`, RELAY].join('\n');
}

/**
 * Takes one query from the day, then one search from the caller's hour: a day that is
 * spent or unreachable must not use up the caller's hour. The day's remaining
 * queries, or null when either is spent or unreachable.
 */
async function reserveSearch(principal: string): Promise<number | null> {
  const log = getLogger();
  const day = await rateLimiter.checkShared(DAY_KEY, maxSearchQueriesPerDay(), DAY_MS);
  if (!day?.allowed) {
    log.warn({ reachable: Boolean(day) }, 'web search refused: daily queries spent');
    return null;
  }
  const person = await rateLimiter.checkShared(
    `${PERSON_KEY}:${principal}`,
    principal === ANONYMOUS ? maxAnonSearchesPerHour() : maxSearchesPerPersonHour(),
    HOUR_MS
  );
  if (!person?.allowed) {
    log.warn({ reachable: Boolean(person) }, 'web search refused: caller hour spent');
    return null;
  }
  return day.remaining;
}

/** The model may make several Google queries for one prompt; each is billed. */
async function chargeExtraQueries(queries: number, dayRemaining: number): Promise<void> {
  const extra = Math.min(queries - 1, dayRemaining);
  if (extra <= 0) return;
  const charged = await rateLimiter.checkShared(DAY_KEY, maxSearchQueriesPerDay(), DAY_MS, extra);
  if (!charged) getLogger().warn({ extra }, 'web search: extra queries not counted');
}

/** One search for `principal` ('user:<id>'): quoted web data or a message saying why not. */
export async function runWebSearch(query: string, principal: string): Promise<string> {
  const log = getLogger();
  const trimmed = query.trim();
  if (!trimmed || /\[.*\]/.test(trimmed)) return NEEDS_DETAIL;
  const dayRemaining = await reserveSearch(principal);
  if (dayRemaining === null) return CAPPED;

  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const result = await executeWithProgressiveFeedback(
    'searchWeb',
    async () => {
      const found = await groundedSearch(PROMPT(trimmed, today), {
        timeoutMs: WEB_SEARCH_TIMEOUT_MS,
        resolveSources: false,
      });
      // Thrown so the circuit breaker counts it as a failure.
      if (!found) throw new Error('grounded search returned nothing');
      return found;
    },
    undefined,
    // Never a cached answer: it would be another query's, maybe another caller's.
    { hardTimeout: WEB_SEARCH_TIMEOUT_MS, fallbackStrategy: 'apologize' }
  );
  if (!result.success || !result.data) {
    log.warn({ error: result.error, latency: result.latency }, 'web search: no answer');
    return NOT_FOUND;
  }
  const found = result.data;
  await chargeExtraQueries(found.webSearchQueries?.length ?? 1, dayRemaining);
  const answer = safeAnswer(found.answer);
  if (!answer) {
    log.info({ chars: found.answer.length }, 'web search: nothing safe to say');
    return NOT_FOUND;
  }
  const sources = await sourceNames(found);
  log.info(
    { groundedMs: result.latency, totalMs: Date.now() - started, sources: sources.length },
    'web search answered'
  );
  return formatSearchResult(answer, sources);
}

/**
 * Who a search is charged to: a verified account gets its own hour, and every
 * unverified id (anon:, device:, phone:, none) shares ANONYMOUS's smaller one.
 * Those ids are minted per session or supplied by the caller, so keying on one
 * would hand a fresh hour to anyone who changes it.
 */
export function searchPrincipal(opts: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const userData = (opts as { ctx?: { userData?: { userId?: string } } } | undefined)?.ctx
    ?.userData;
  // VERIFIED_CALLER_ALLOWANCE=on: the server's verified-caller signal decides (an allowlist)
  if (verifiedCallerAllowanceOn(env)) {
    return verifiedAllowanceKey(userData, isUnverifiedUserId) ?? ANONYMOUS;
  }
  const userId = userData?.userId;
  return userId && !isUnverifiedUserId(userId) ? `user:${userId}` : ANONYMOUS;
}
