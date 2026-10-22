/**
 * Grounded release (CRISIS_GROUNDED_RELEASE = off | shadow | live, off by default).
 *
 * Prod, 2026-10-14 to 10-20: all 15 crisis-script replacements came from the
 * classifier alone, with no pattern match. On the 10-20 "David dinner" call the
 * overdose script replaced Ferni's reply to "Tomorrow's a little bit late.
 * Dinner is tonight." and to "Do I have your permission?" (about going to that
 * dinner). The classifier reads one turn with little context, and words like
 * "tonight", "go" and "permission" read as a plan. The adjudicator
 * (crisis-adjudicator.ts) never sees an imminent read, and its open question
 * ("is this a false alarm?") softened real crises on replay, so it stays in
 * shadow.
 *
 * This asks a narrower question with evidence. Two independent model reads
 * of the call, with different prompts (an everyday-or-danger read, and a
 * C-SSRS-structured read of ideation, method, intent, plan and timeframe),
 * must both find nothing. The turn then gets GROUNDED_LIGHT_TOUCH instead of
 * the script: Ferni answers in its own voice and asks one direct screening
 * question (SCREEN_QUESTION). On the caller's next turn, anything but a clear
 * no takes the crisis path with 988 (screenPositive). Round 3 released 40 of
 * 40 new risky lines built only from allowed words with both reads fooled
 * ("After dinner I'll try again."): word rules cannot prove a release safe,
 * so the direct question is the safety net (Seth, 2026-10-22: "Ask directly,
 * gently"). Only when every one of these holds:
 *   - the classifier alone read the turn imminent: the patterns found nothing;
 *   - nothing on the call found risk before this turn, and no turn on this
 *     call was released before (MAX_RELEASES_PER_CALL = 1);
 *   - Ferni's line did not raise safety, and the caller is not agreeing with it;
 *   - the caller said something before this turn, no earlier caller line
 *     matches a pattern, and the line is at most MAX_WORDS words;
 *   - no held word anywhere in the call, de-leeted (crisis-release-words.ts
 *     ALWAYS_HOLD), and EVERY word of the line is everyday or an everyday
 *     event (EVERYDAY, EVENTS: an allowlist with no exemptions), plain letters;
 *   - an event in the line (dinner, the game) is one the caller already named,
 *     and the first read's "about" names that same event (eventTopics);
 *   - both reads find no danger and call the line everyday.
 * The code's own rules hold even when both reads are wrong
 * (crisis-gate-grounded-release.test.ts drives the lead's 71 risky lines with
 * both reads fooled). Round 1's deny list released 27 of 71 new risky lines;
 * round 2's allowlist exempted any word the caller said earlier, and 39 of 88
 * rode in on those words; hence no exemptions at all.
 * Anything else, any error, timeout or unparsed reply, keeps the script.
 *
 * shadow: decides and logs off the escalation path; the script is unchanged.
 * Privacy: logs carry decisions and reasons, never the transcript.
 *
 * @module CrisisGroundedRelease
 */

import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';
import { endorses } from './crisis-agreement.js';
import { createGeminiAdjudicatorGenerate } from './crisis-adjudicator.js';
import {
  explainCrisisTurn,
  explainedCrisisTurns,
  unexplainedCrisisRisk,
} from './crisis-call-risk.js';
import type { CrisisGenerateFn, CrisisVerdict } from './crisis-classifier.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';
import { allEveryday, alwaysHold, eventTopics, wordsOf } from './crisis-release-words.js';
import { SCREEN_QUESTION, noteScreenAsked, resetGroundedScreen } from './crisis-grounded-screen.js';

const log = createLogger({ module: 'CrisisGroundedRelease' });

export type GroundedReleaseMode = 'off' | 'shadow' | 'live';
export type ReadWhy =
  | 'everyday'
  | 'flag'
  | 'danger_quoted'
  | 'quote_missing'
  | 'not_named'
  | 'unparsed'
  | 'timeout'
  | 'error';

export interface GroundedInput {
  latest: string;
  /** The caller's earlier words this call, oldest first. */
  earlier?: readonly string[];
  /** Ferni's line the caller's words answer. */
  companion?: string;
}

/** Two different models, for independent reads. */
export const DEFAULT_GROUNDED_RELEASE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
/** The reply is already held for the classifier; past this the script stands. */
export const DEFAULT_GROUNDED_RELEASE_TIMEOUT_MS = 1500;
/** One release per call: a later imminent read on the same call keeps the script. */
export const MAX_RELEASES_PER_CALL = 1;
const MAX_WORDS = 30;
const MIN_QUOTE_WORDS = 2;
const MAX_EARLIER = 8;
const MAX_LINE_CHARS = 400;

export const GROUNDED_RELEASE_PROMPT = `An automated safety screen flagged the caller's LAST line in this voice call as possible suicide, self-harm or danger. Nothing else in the call was flagged. Screens like this misfire on everyday words such as "tonight", "bye", "go", "ready", "done", "take", "permission" or "last", when the conversation shows what they are about.

The input is the call, oldest first. "caller" lines are the caller's words; the "ferni" line is the AI companion's reply just before the last line.

Answer three things:
1. "danger": read EVERY caller line, not only the last. Copy any caller words that, in this call, could be about the caller or anyone else dying, being hurt or in danger, a plan or a time to do it, means (pills, "taking something", a weapon, a height, a car, the tracks), a final goodbye or thanks, giving away belongings, pets or children, asking someone to look after them, not being around, or feeling hopeless, trapped or a burden. A short last line ("ok", "yeah", "I'm waiting", "go ahead", "bye") belongs to whatever came before it: if anything earlier was dark, copy that. Empty only if no caller line has any of this. If in doubt, copy it.
2. "about": if the LAST line is plainly about an everyday matter already named earlier in the call (a dinner, a trip, a call, a reminder, a game, a chore), copy 3 to 12 words, exactly as written, from the ONE earlier line that names that matter. Empty if the line is not plainly about something named earlier.
3. "decision": "everyday" only if "danger" is empty and "about" is filled; otherwise "flag".

A missed crisis is far worse than a false alarm. Return JSON only: {"danger":"...","about":"...","decision":"everyday"|"flag"}`;

/**
 * The second read asks a different question, so the two are not fooled the
 * same way: the C-SSRS screen's items, each "none" or the caller's words.
 */
export const GROUNDED_RELEASE_CSSRS_PROMPT = `You screen a voice call for suicide and self-harm risk using the Columbia (C-SSRS) items. The input is the call, oldest first; "caller" lines are the caller's words, the "ferni" line is the AI companion's.

For EVERY caller line, in any language, slang, misspelling or joke, fill each item with the caller's own words that show it, or "none":
- "wish_dead": wishing to be dead, not wake up, disappear, not be around, being a burden;
- "ideation": thoughts of killing or hurting themselves, or someone else being at risk;
- "method": any means or way (pills, a weapon, a height, water, a car, a rope, cutting, "taking something");
- "intent": meaning to act, a decision, "doing it", "going through with it";
- "plan_time": a plan, a time or a place, or getting ready (letters, goodbyes, giving things away);
then "everyday": true only if every item is "none" and the last caller line is plainly ordinary talk about something already said in the call.

If unsure about any item, fill it. Return JSON only: {"wish_dead":"...","ideation":"...","method":"...","intent":"...","plan_time":"...","everyday":true|false}`;

const CSSRS_ITEMS = ['wish_dead', 'ideation', 'method', 'intent', 'plan_time'] as const;

/** A C-SSRS read: everyday only when every item is "none" and the line names an earlier event. */
export function parseCssrsRead(
  reply: string,
  callerLines: readonly string[],
  latest: string
): ReadWhy {
  const json = typeof reply === 'string' ? reply.match(/\{[\s\S]*\}/)?.[0] : undefined;
  if (!json) return 'unparsed';
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const item of CSSRS_ITEMS) {
      const value = parsed[item];
      if (typeof value !== 'string') return 'unparsed';
      if (value.trim() && value.trim().toLowerCase() !== 'none') return 'danger_quoted';
    }
    if (parsed.everyday !== true) return parsed.everyday === false ? 'flag' : 'unparsed';
    return eventTopics(latest, callerLines).size > 0 ? 'everyday' : 'not_named';
  } catch {
    return 'unparsed';
  }
}

/** Each read's prompt and parser, by position: two different questions. */
const READERS = [
  { prompt: GROUNDED_RELEASE_PROMPT, parse: parseGroundedRead },
  { prompt: GROUNDED_RELEASE_CSSRS_PROMPT, parse: parseCssrsRead },
] as const;

/** Room for the C-SSRS read's six fields: a cut-off reply fails to parse and holds. */
const GROUNDED_READ_MAX_TOKENS = 256;

/**
 * What a released turn gets in place of the script: Ferni's normal answer and
 * the direct question, once (MAX_RELEASES_PER_CALL). No hint that the words
 * were probably everyday, which would bias how the question is asked.
 */
export const GROUNDED_LIGHT_TOUCH = `[SAFETY - DIRECT CHECK]
A safety screen flagged the caller's last words.
1. Answer what they said the way you normally would, in your own voice, briefly
2. Then, in this same reply, ask this exact question, gently and warmly: "${SCREEN_QUESTION}" You must ask it. Do not change it to "are you okay", do not skip it, and add no lecture and no hotline
3. If they answer anything other than a clear no, or say anything about hurting themselves, not wanting to be here, or anyone being in danger, take it seriously and offer the 988 Suicide & Crisis Lifeline: they can call or text 988`;

export function resolveGroundedReleaseMode(
  env: Record<string, string | undefined> = process.env
): GroundedReleaseMode {
  const raw = env.CRISIS_GROUNDED_RELEASE?.trim().toLowerCase();
  return raw === 'live' || raw === 'shadow' ? raw : 'off';
}

/** Lower case, letters and digits only, single spaces. */
const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

/** The lines a read may quote and the latest line, trimmed. */
function linesOf(input: GroundedInput): { latest: string; earlier: string[]; companion: string } {
  const latest = String(input.latest ?? '').trim();
  const earlier = (input.earlier ?? [])
    .map((line) => String(line ?? '').trim())
    .filter((line) => line && line !== latest)
    .slice(-MAX_EARLIER)
    .map((line) => line.slice(-MAX_LINE_CHARS));
  const companion = stripSSML(String(input.companion ?? ''))
    .trim()
    .slice(-MAX_LINE_CHARS);
  return { latest, earlier, companion };
}

/** Whether this turn may be read at all. Synchronous; false on anything unexpected. */
export function groundedReleaseEligible(args: {
  detection: CrisisDetectionResult;
  verdict: CrisisVerdict | null;
  input: GroundedInput;
  /** unexplainedCrisisRisk for this call, taken before this turn's reads start. */
  priorRisk: boolean;
  call: string | undefined;
}): boolean {
  try {
    const { detection, verdict, input, priorRisk, call } = args;
    if (!call || priorRisk !== false) return false;
    // Crisis reads have the agreement gate and the adjudicator; this is for imminent ones.
    if (verdict?.risk !== 'imminent') return false;
    if (detection.severity !== 0 || detection.indicators.length > 0) return false;
    if (explainedCrisisTurns(call) >= MAX_RELEASES_PER_CALL) return false;
    const { latest, earlier, companion } = linesOf(input);
    if (!latest || loose(latest).split(' ').length > MAX_WORDS || endorses(latest)) return false;
    if (companion && SAFETY_TALK.test(loose(companion))) return false;
    // The event must come from the caller's own earlier words, so a first turn is never read.
    if (earlier.length === 0) return false;
    // Held anywhere in the call (crisis-release-words.ts), or a pattern hit on any earlier line.
    if ([latest, ...earlier].some(alwaysHold)) return false;
    const patternEarlier = earlier.some((line) => {
      const scored = detectCrisis(line);
      return scored.severity > 0 || scored.indicators.length > 0;
    });
    if (patternEarlier) return false;
    // The allowlist, no exemptions, and an everyday event the caller already named.
    return allEveryday(latest) && eventTopics(latest, earlier).size > 0;
  } catch {
    return false;
  }
}

/**
 * One read's verdict: everyday only with no danger quoted, the matter named,
 * and that matter one of the line's own everyday events the caller already
 * named (eventTopics: checked here, not taken from the model). Only the
 * caller's own lines count, never Ferni's: Ferni asking "how was work?" must
 * not make "I'm checking out of work" an event. "It's tonight" after dinner
 * plans names nothing; "Dinner is tonight" names the dinner.
 */
export function parseGroundedRead(
  reply: string,
  callerLines: readonly string[],
  latest: string
): ReadWhy {
  const json = typeof reply === 'string' ? reply.match(/\{[\s\S]*\}/)?.[0] : undefined;
  if (!json) return 'unparsed';
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const { danger, about, decision } = parsed;
    if (typeof danger !== 'string' || typeof about !== 'string') return 'unparsed';
    if (decision !== 'everyday' && decision !== 'flag') return 'unparsed';
    if (danger.trim()) return 'danger_quoted';
    if (decision === 'flag') return 'flag';
    if (loose(about).split(' ').filter(Boolean).length < MIN_QUOTE_WORDS) return 'quote_missing';
    return namesTopic(about, latest, callerLines) ? 'everyday' : 'not_named';
  } catch {
    return 'unparsed';
  }
}

/**
 * The read named the event the line is about: a word of its `about` is one of
 * the line's event topics (crisis-release-words.ts eventTopics).
 */
function namesTopic(about: string, latest: string, callerLines: readonly string[]): boolean {
  const topics = eventTopics(latest, callerLines);
  return (wordsOf(about) ?? loose(about).split(' ')).some((w) => topics.has(w.replace(/'s$/, '')));
}

/** The call as both reads see it: earlier caller lines, Ferni's last line, the flagged one. */
export function groundedTranscript(input: GroundedInput): string {
  const { latest, earlier, companion } = linesOf(input);
  return JSON.stringify([
    ...earlier.map((text) => ({ speaker: 'caller', text })),
    ...(companion ? [{ speaker: 'ferni', text: companion }] : []),
    { speaker: 'caller', text: latest },
  ]);
}

/** One read with a timeout. Never rejects. */
async function readOnce(
  generate: CrisisGenerateFn,
  reader: (typeof READERS)[number],
  transcript: string,
  callerLines: readonly string[],
  latest: string,
  timeoutMs: number
): Promise<ReadWhy> {
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const reply = await Promise.race([
      generate(reader.prompt, transcript, controller.signal),
      timeout,
    ]);
    return reply === null ? 'timeout' : reader.parse(reply, callerLines, latest);
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** Every read, in parallel. Released only when all of them say everyday. */
export async function readGrounded(
  input: GroundedInput,
  generates: readonly CrisisGenerateFn[],
  timeoutMs = DEFAULT_GROUNDED_RELEASE_TIMEOUT_MS
): Promise<{ release: boolean; reads: ReadWhy[] }> {
  const { latest, earlier } = linesOf(input);
  const transcript = groundedTranscript(input);
  const reads = await Promise.all(
    generates.map((g, i) =>
      readOnce(g, READERS[i % READERS.length], transcript, earlier, latest, timeoutMs)
    )
  );
  return { release: reads.length > 0 && reads.every((r) => r === 'everyday'), reads };
}

let defaultGenerates: CrisisGenerateFn[] | null = null;

/** The gate and the turn pipeline share one run per turn. In memory only. */
const RECENT_TTL_MS = 30_000;
const RECENT_MAX = 32;
const recent = new Map<string, { at: number; run: Promise<boolean> }>();

/** For tests. */
export function resetGroundedRelease(): void {
  recent.clear();
  resetGroundedScreen();
}

/**
 * True when this turn gets the soft check instead of the classifier's
 * escalation. Shadow logs the decision off the escalation path and returns
 * false at once. Never rejects; false on anything unexpected.
 */
export function groundedRelease(
  args: Parameters<typeof groundedReleaseEligible>[0] & {
    env?: Record<string, string | undefined>;
    generates?: readonly CrisisGenerateFn[];
    source: 'gate' | 'pipeline';
  }
): Promise<boolean> {
  try {
    const env = args.env ?? process.env;
    const mode = resolveGroundedReleaseMode(env);
    if (mode === 'off') return Promise.resolve(false);
    const startedAt = Date.now();
    const key = JSON.stringify([args.call, mode, groundedTranscript(args.input)]);
    for (const [k, v] of recent) if (startedAt - v.at > RECENT_TTL_MS) recent.delete(k);
    // The turn's other path shares the run it started, before eligibility is asked again:
    // once this turn is released, the one-release cap must not make the two paths disagree.
    let run = recent.get(key)?.run;
    if (!run && !groundedReleaseEligible(args)) return Promise.resolve(false);
    if (!run) {
      const generates =
        args.generates ??
        (defaultGenerates ??= DEFAULT_GROUNDED_RELEASE_MODELS.map((m) =>
          createGeminiAdjudicatorGenerate(m, GROUNDED_READ_MAX_TOKENS)
        ));
      run = readGrounded(args.input, generates, timeoutFrom(env))
        .then(({ release, reads }) => {
          if (release && mode === 'live') {
            explainCrisisTurn(args.call, args.input.latest);
            if (args.call) noteScreenAsked(args.call, args.input);
          }
          const stats = { mode, source: args.source, release, reads };
          log.info({ ...stats, latencyMs: Date.now() - startedAt }, 'CRISIS_GROUNDED_RELEASE');
          return release && mode === 'live';
        })
        .catch(() => false);
      if (recent.size >= RECENT_MAX) {
        const oldest = recent.keys().next().value;
        if (oldest !== undefined) recent.delete(oldest);
      }
      recent.set(key, { at: startedAt, run });
    }
    return mode === 'live' ? run : Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Taken at the start of a turn, before its own reads: risk no release explained. */
export function groundedPriorRisk(call: string | undefined, latest: string): boolean {
  try {
    return !call || unexplainedCrisisRisk(call, latest);
  } catch {
    return true;
  }
}

function timeoutFrom(env: Record<string, string | undefined>): number {
  const ms = Number(env.CRISIS_GROUNDED_RELEASE_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_GROUNDED_RELEASE_TIMEOUT_MS;
}
