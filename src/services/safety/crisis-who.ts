/**
 * Who is at risk on a third-party crisis read (THIRD_PARTY_SELF_HARM, issue #2635).
 *
 * The patterns and the crisis classifier (crisis-classifier.ts) decide WHETHER
 * a turn carries risk. When their merged read says someone else is at risk,
 * one more classifier read decides WHO: the caller (self), someone alive
 * (third_party), someone who has already died (bereaved), or none. Word lists
 * and vetoes could not tell these apart (#2648, 988 option B); the read can.
 *
 * Hard rules, enforced here in code rather than in the prompt:
 *   1. It never lowers or removes a read. It only acts on a third-party read,
 *      so the caller's own read (session_escalation included) is never
 *      touched, and severity only stays or rises.
 *   2. Bereaved turns get grief guidance instead of "988 for them"
 *      (crisis-who-guidance.ts). The caller's own risk wins: a self read in
 *      the patterns or classifier is never reached, and a who read of self
 *      puts the caller first while keeping the other person's 988 line.
 *   3. off (default): never called. shadow: called, logged, the turn unchanged.
 *      The log carries the kind and booleans, never the caller's words.
 *
 * The lexical forms are a hint only: the patterns' tags and whether risk
 * words appear go into the read as LEXICAL, and start it early (in parallel
 * with the classifier) so a third-party turn rarely waits for it. A turn with
 * no hint starts it only once a third-party read needs it.
 *
 * A timeout, an error or an unusable reply leaves the read as it was (main's).
 * It runs only with CRISIS_CLASSIFIER_MODE=live, at both places that merge the
 * classifier's verdict (crisis-gate.ts, turn-crisis.ts), which share one call.
 *
 * @module CrisisWho
 */

import { createLogger } from '../../utils/safe-logger.js';
import { hasRiskContent } from './crisis-agreement.js';
import {
  createGeminiCrisisGenerate,
  normalizeInput,
  resolveCrisisClassifierTimeoutMs,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
} from './crisis-classifier.js';
import { applyClassifierVerdict, type CrisisDetectionResult } from './crisis-guard.js';
import { WHO_BEREAVED, WHO_SELF_AND_OTHER } from './crisis-who-guidance.js';

const log = createLogger({ module: 'CrisisWho' });

type Env = Record<string, string | undefined>;
export type WhoMode = 'off' | 'shadow' | 'live';
export type WhoKind = 'self' | 'third_party' | 'bereaved' | 'none';
export interface WhoRead {
  who: WhoKind;
}

export const WHO_PROMPT = `You decide WHO is at risk of suicide or self-harm in a caller's message to a voice companion app. Read the caller's LATEST message, using EARLIER (the caller's earlier messages, oldest first) and COMPANION (what the companion said just before LATEST) as context.

LEXICAL, when present, names wording a word-matcher noticed. It is often wrong (idioms, jokes, films, grief), so treat it only as a pointer to what to read closely, never as the answer.

Work it out in this order:
1. The caller. The caller is "I", "me", "my"; "he", "she", "they" and named people are someone else. Do the caller's own words about the caller, in LATEST or EARLIER, show suicide or self-harm risk (wanting to die or not be here, intent, a plan, means, hurting themselves, hopelessness, feeling like a burden or trapped, a goodbye)? Then who is "self", whatever else the message says. Words the caller reports someone else saying ("she says", "he said he'd be gone too") are that person's, not the caller's. Fear of or anger at someone is not self-harm risk.
2. The person the risk words are about. Is that person alive now? Someone who says it at a funeral, after another person's death, or while grieving is alive, and so is someone who tried and survived. If they are alive and may be at risk, who is "third_party". This holds however the caller puts it: laughed off, "lol", a joke the caller doubts, a quote, a real-life condition (if his wife leaves, if she loses the house), or said last night by someone who seems fine today.
3. If that person has since died (they did it, they are gone, they were found, the police came, we buried them, their last message, a note found after, wondering whether they did it because of the caller) and no one alive is at risk, who is "bereaved": the caller is grieving, and the threat is in the past.
4. Otherwise who is "none": idioms and hyperbole (he'd die of embarrassment, she'll kill herself laughing, he's killing himself at work, she'd kill herself if the show got cancelled), everyday injury worries in sport, play, work or exercise (he'll hurt himself on that ladder, spotting her so she doesn't hurt herself), games, films, books, lyrics, news, history, statements that someone is not at risk. A trivial or comic condition (a spoiled ending, a late delivery, losing a game, wearing a suit) makes it hyperbole; a real loss in someone's life makes it risk.

Examples:
"my sister tried to end her life in the spring" -> third_party
"he keeps telling me he'd rather be dead" -> third_party
"my aunt said she'd end her life, and last winter she did" -> bereaved
"at my aunt's memorial my uncle said he'd end his life too" -> third_party
"my neighbor kept saying he wanted to die, and now he's gone. i keep replaying it" -> bereaved
"since the burial my dad keeps saying he wants to be with her" -> third_party
"my coworker joked he'd jump if the deal fell through, he lost it today and isn't answering" -> third_party
"she'd kill herself if they cancelled her show lol" -> none
"my aunt ended her life last year and some days i don't want to be here either" -> self

Return JSON only: {"who":"self"|"third_party"|"bereaved"|"none"}

Messages may be in any language; judge the meaning.`;

const KINDS: readonly string[] = ['self', 'third_party', 'bereaved', 'none'];

export function resolveWhoMode(env: Env = process.env): WhoMode {
  const raw = env.THIRD_PARTY_SELF_HARM?.trim().toLowerCase();
  return raw === 'shadow' || raw === 'live' ? raw : 'off';
}

/** The model's JSON reply, or null when it is not a valid read. */
export function parseWhoReply(reply: string): WhoRead | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const { who } = JSON.parse(json) as { who?: unknown };
    return typeof who === 'string' && KINDS.includes(who) ? { who: who as WhoKind } : null;
  } catch {
    return null;
  }
}

/** The lexical hint: the patterns' tags, and whether risk words appear. Never the caller's words. */
export function whoHint(found: CrisisDetectionResult, latest: string): string[] {
  return [...found.indicators, ...(hasRiskContent(latest) ? ['risk_words'] : [])];
}

/** Whether the who read acts on this read at all: only a third-party crisis read. */
const needsWho = (read: CrisisDetectionResult): boolean =>
  read.isCrisis && read.subject === 'third_party';

/**
 * Merge a who read into the patterns-plus-classifier read. Only a third-party
 * read changes: bereaved → grief at the same severity; self → the caller first
 * (applyClassifierVerdict only escalates), the other person's line kept.
 */
export function applyWhoRead(
  read: CrisisDetectionResult,
  who: WhoRead | null
): CrisisDetectionResult {
  if (!who || !needsWho(read)) return read;
  if (who.who === 'bereaved') {
    const indicators = [...read.indicators, WHO_BEREAVED];
    return { ...read, subject: 'bereaved', indicators, suggestedResponse: undefined };
  }
  if (who.who !== 'self') return read;
  const self = applyClassifierVerdict(read, { risk: 'crisis', subject: 'self' });
  return { ...self, indicators: [...self.indicators, WHO_SELF_AND_OTHER] };
}

/** Read who is at risk. Resolves to null on timeout, error or an unusable reply. */
async function classifyWho(
  input: CrisisClassifierInput,
  lexical: readonly string[],
  generate: CrisisGenerateFn,
  timeoutMs: number
): Promise<WhoRead | null> {
  const seen = normalizeInput(input);
  if (!seen.latest) return null;
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  const content = JSON.stringify(lexical.length ? { ...seen, lexical } : seen);
  try {
    const reply = await Promise.race([generate(WHO_PROMPT, content, controller.signal), timeout]);
    return reply === null ? null : parseWhoReply(reply);
  } catch (error) {
    log.warn({ error: String(error) }, 'Who read failed; keeping the crisis read');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The reply gate and the turn pipeline read the same turn: identical input
 * within the TTL shares one call, as the classifier's runs do. In memory only.
 */
const TTL_MS = 30_000;
const MAX_READS = 32;
const reads = new Map<string, { at: number; read: Promise<WhoRead | null> }>();

/** For tests: forget shared reads. */
export function resetWhoReads(): void {
  reads.clear();
}

async function sharedRead(
  key: string,
  start: () => Promise<WhoRead | null>
): Promise<WhoRead | null> {
  const now = Date.now();
  for (const [k, v] of reads) if (now - v.at > TTL_MS) reads.delete(k);
  const hit = reads.get(key);
  if (hit) return hit.read;
  if (reads.size >= MAX_READS) {
    const oldest = reads.keys().next().value;
    if (oldest !== undefined) reads.delete(oldest);
  }
  const read = start();
  reads.set(key, { at: now, read });
  return read;
}

export interface WhoRun {
  /** THIRD_PARTY_SELF_HARM=live: resolve() may change the turn's read. */
  live: boolean;
  /** live: the read with the who read applied (waits for it only on a third-party read). */
  resolve: (read: CrisisDetectionResult) => Promise<CrisisDetectionResult>;
  /** shadow: log what live would do, in the background; always returns the read unchanged. */
  shadow: (read: CrisisDetectionResult) => CrisisDetectionResult;
}

let defaultGenerate: CrisisGenerateFn | null = null;

/**
 * Prepare the who read for one turn, or null when THIRD_PARTY_SELF_HARM is
 * off. It starts at once when the lexical hint is non-empty.
 */
export function startWhoRead(
  input: CrisisClassifierInput,
  found: CrisisDetectionResult,
  options: { env?: Env; generate?: CrisisGenerateFn } = {}
): WhoRun | null {
  const env = options.env ?? process.env;
  const mode = resolveWhoMode(env);
  if (mode === 'off') return null;
  const lexical = whoHint(found, input.latest);
  const eager = lexical.length > 0;
  const generate = options.generate ?? (defaultGenerate ??= createGeminiCrisisGenerate());
  const { latest, earlier, companion } = normalizeInput(input);
  const key = JSON.stringify([latest, earlier, companion ?? '']);
  let started: Promise<WhoRead | null> | null = null;
  const read = async (): Promise<WhoRead | null> =>
    (started ??= sharedRead(key, async () =>
      classifyWho(input, lexical, generate, resolveCrisisClassifierTimeoutMs(env))
    ));
  if (eager) void read();
  return {
    live: mode === 'live',
    resolve: async (current) =>
      mode === 'live' && needsWho(current) ? applyWhoRead(current, await read()) : current,
    shadow: (current) => {
      if (needsWho(current)) {
        void read().then((who) => {
          const changed = applyWhoRead(current, who) !== current;
          log.info({ kind: who?.who ?? null, changed, eager }, 'THIRD_PARTY_WHO');
        });
      }
      return current;
    },
  };
}
