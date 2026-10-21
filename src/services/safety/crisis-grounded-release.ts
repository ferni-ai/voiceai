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
 * of the call each say whether any caller line could be about danger (and
 * quote the words if so), and what everyday matter the flagged line is about.
 * The turn gets the soft check (SOFT_CRISIS_CHECK: Ferni stays in the
 * conversation, checks in once if anything suggests it, and gives 988 on any
 * mention of self-harm) instead of the script only when every one of these holds:
 *   - the classifier alone read the turn imminent: the patterns found nothing;
 *   - nothing on the call found risk before this turn, other than turns a
 *     grounded release explained (crisis-call-risk.ts), and fewer than
 *     MAX_RELEASES_PER_CALL were released;
 *   - Ferni's line did not raise safety, and the caller is not agreeing with it;
 *   - the caller said something before this turn, no earlier caller line
 *     matches a pattern, the line is at most MAX_WORDS words, and it names no
 *     care arrangement, farewell message, exit or means (NEVER_RELEASED);
 *   - both reads quote no danger words, decide "everyday", and name the
 *     everyday matter;
 *   - the flagged line names something the caller said earlier itself: a
 *     content word in common with an earlier caller line (never Ferni's) that
 *     is not a time word, a vague word or a name anywhere in the call
 *     (anchorWords, namesIn). The code checks this, so it holds even when
 *     both reads are wrong (crisis-gate-grounded-release.test.ts). A replay with held-out lines released "I've decided. It's tonight." and
 *     "Make sure David knows it wasn't his fault." after dinner plans with
 *     every model tried, with or without thinking; this rule stops both.
 * Anything else, any error, timeout or unparsed reply, keeps the script. A
 * line with no conversation before it can never be released: there is
 * nothing to ground it in.
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
export const MAX_RELEASES_PER_CALL = 3;
const MAX_WORDS = 30;
const MIN_QUOTE_WORDS = 2;
const MAX_EARLIER = 8;
const MAX_LINE_CHARS = 400;

/**
 * Lines that keep the script whatever the reads say. Replays (2026-10-21) had
 * both models call these everyday after an errand: arranging care for kids or
 * a pet, a message of sorry, love or goodbye passed on, and named means. A
 * list may only keep the script here, never take it away.
 */
const NEVER_RELEASED = new RegExp(
  [
    '\\b(?:tak(?:e|es|ing)|took|watch(?:es|ing)?|keep(?:s|ing)?|kept|feed(?:s|ing)?|fed|ha(?:ve|s|ving)|mind(?:s|ing)?|look(?:s|ing)? after|car(?:e|es|ing) for|pick(?:s|ing)? up|walk(?:s|ing)?)\\b.{0,40}\\b(?:dogs?|cats?|pets?|puppy|kitten|kids?|children|son|daughter|baby|babies|fish|bird|horse)\\b',
    "\\b(?:dogs?|cats?|pets?|puppy|kitten|kids?|children|son|daughter|baby)\\b.{0,40}\\b(?:for a while|for good|from now on|after i'm|when i'm gone|if anything happens)",
    '\\b(?:sorry|forgive|fault|blame|proud of|remember me|love (?:her|him|them|you)|i love|miss (?:her|him|them|you)|goodbye|good bye|farewell|thank(?:s| you) for everything|adios)\\b',
    '\\b(?:pills?|meds|medication|medicine|prescriptions?|tablets?|insulin|bottle|overdose|od|(?:shot|hand)?guns?|firearm|ammo|bullets?|rifle|pistol|rope|cord|noose|knife|knives|razors?|blades?|stab(?:s|bing)?|bridge|tracks|roof|ledge|railing|charcoal|bleach|antifreeze|poison|carbon monoxide|exhaust|engine running)\\b',
    // A plan, a date or a method in plain words (red team, 2026-10-21).
    "\\b(?:do it|go(?:ing)? through with it|set the date|picked (?:a|the) (?:day|date)|the day i've picked|in front of (?:it|a|the)|lie down (?:in|on|until)|walk(?:s|ing)? (?:into|out into)|swallow(?:s|ing)?|cutting|funeral|on earth|finds me|won't need|another night|my last (?:week|month|year|day)|final (?:week|month|year)|being around|takes me out|high floor|breathing)\\b",
    // Slang for self-harm (red team, 2026-10-21).
    '\\b(?:unalive|kms|k m s|kys|self harm|cut(?:ting)? myself)\\b',
    // Not being around, finality, and veiled exits (lead's verifier, 2026-10-21).
    "\\b(?:miss me|won't be (?:anywhere|around|here|alive)|not be (?:anywhere|around|here|alive)|after tonight|last (?:supper|meal|time|day|night)|final (?:one|time|day|night|meal)|check(?:ing)? out|permanently|for good|forever|never (?:wake|come back|see)|end (?:it|things|my life)|ending (?:it|things|my life)|done with (?:it all|everything|everyone|life))\\b",
    // Means with no weapon word: a height, water, traffic, a car driven into or off something.
    '\\b(?:jump(?:s|ed|ing)?|top floor|rooftop|overpass|cliff|drown(?:s|ed|ing)?|hang(?:s|ed|ing)? myself|traffic|shoot(?:ing)?|gas)\\b|\\b(?:driv(?:e|es|ing)|drove|crash(?:es|ing)?|steer(?:s|ing)?)\\b.{0,30}\\b(?:into|off)\\b',
    '\\b(?:will|my|a) letters?\\b|\\bwill\\b.{0,20}\\b(?:things|stuff|house|car|money)\\b|\\b(?:giv(?:e|es|ing)|gave|given) (?:away|you|them|her|him)\\b',
  ].join('|')
);

export const GROUNDED_RELEASE_PROMPT = `An automated safety screen flagged the caller's LAST line in this voice call as possible suicide, self-harm or danger. Nothing else in the call was flagged. Screens like this misfire on everyday words such as "tonight", "bye", "go", "ready", "done", "take", "permission" or "last", when the conversation shows what they are about.

The input is the call, oldest first. "caller" lines are the caller's words; the "ferni" line is the AI companion's reply just before the last line.

Answer three things:
1. "danger": read EVERY caller line, not only the last. Copy any caller words that, in this call, could be about the caller or anyone else dying, being hurt or in danger, a plan or a time to do it, means (pills, "taking something", a weapon, a height, a car, the tracks), a final goodbye or thanks, giving away belongings, pets or children, asking someone to look after them, not being around, or feeling hopeless, trapped or a burden. A short last line ("ok", "yeah", "I'm waiting", "go ahead", "bye") belongs to whatever came before it: if anything earlier was dark, copy that. Empty only if no caller line has any of this. If in doubt, copy it.
2. "about": if the LAST line is plainly about an everyday matter already named earlier in the call (a dinner, a trip, a call, a reminder, a game, a chore), copy 3 to 12 words, exactly as written, from the ONE earlier line that names that matter. Empty if the line is not plainly about something named earlier.
3. "decision": "everyday" only if "danger" is empty and "about" is filled; otherwise "flag".

A missed crisis is far worse than a false alarm. Return JSON only: {"danger":"...","about":"...","decision":"everyday"|"flag"}`;

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
    if (NEVER_RELEASED.test(loose(latest))) return false;
    // The anchor must come from the caller's own earlier words, so a first turn is never read.
    if (earlier.length === 0) return false;
    return !earlier.some((line) => {
      const scored = detectCrisis(line);
      return scored.severity > 0 || scored.indicators.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * Words that cannot anchor a line to an everyday matter: function words, time
 * words ("tonight" is what the classifier misreads), and vague ones.
 */
const NOT_ANCHORS = new Set(
  (
    'about after again also always another anything anyone anymore around back been before being ' +
    'better could didn doesn done down each else even ever every everyone everything ferni fine ' +
    'from going gone gonna good have having here into just know last later least like little long ' +
    'make many maybe more most much need never next nothing okay only other over really ready ' +
    'right said same should since some someone something soon still sure take than thank thanks ' +
    'that their them then there these they thing things think this those time today tomorrow ' +
    'tonight told until very wait want well were what when where which while will with without ' +
    'would yeah your yours'
  ).split(' ')
);

/** Each sentence's words, raw, with their position in the sentence. */
function* sentenceWords(line: string): Generator<{ raw: string; word: string; first: boolean }> {
  for (const sentence of String(line ?? '').split(/[.!?]+/)) {
    const raws = sentence.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < raws.length; i++) {
      yield { raw: raws[i], word: loose(raws[i]).replace(/'.*$/, ''), first: i === 0 };
    }
  }
}

/**
 * Names in the call: words capitalized after a sentence's first word in any
 * line. A name written once ("dinner with David") is a name everywhere, so a
 * lower-cased "david" in another line cannot anchor either.
 */
export function namesIn(lines: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const line of lines) {
    for (const { raw, word, first } of sentenceWords(line)) {
      if (!first && /^[A-Z]/.test(raw) && word) names.add(word);
    }
  }
  return names;
}

/**
 * Content words of the caller's line that can anchor it: four letters or more,
 * not in NOT_ANCHORS, and not a name (capitalized after the first word of a
 * sentence here, or anywhere in `names`): "Make sure David knows" must not
 * anchor to "invite David".
 */
export function anchorWords(line: string, names: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const { raw, word, first } of sentenceWords(line)) {
    if (word.length < 4 || NOT_ANCHORS.has(word) || names.has(word)) continue;
    if (!first && /^[A-Z]/.test(raw)) continue;
    out.add(word);
  }
  return out;
}

/**
 * One read's verdict: everyday only with no danger quoted, the matter named,
 * and the flagged line itself naming something the caller said earlier (an
 * anchor word in common, checked here, not taken from the model). Only the
 * caller's own lines count, never Ferni's: Ferni asking "how was work?" must
 * not anchor "I'm checking out of work". "It's tonight" after dinner plans
 * names nothing; "Dinner is tonight" names the dinner. A read's quote is often
 * the flagged line itself, so it is not matched. `names` are the call's names.
 */
export function parseGroundedRead(
  reply: string,
  callerLines: readonly string[],
  latest: string,
  names: ReadonlySet<string> = namesIn([...callerLines, latest])
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
    const anchors = anchorWords(latest, names);
    const named = callerLines.some((line) => {
      const said = new Set(
        loose(line)
          .split(' ')
          .map((w) => w.replace(/'.*$/, ''))
      );
      return [...anchors].some((w) => said.has(w));
    });
    return named ? 'everyday' : 'not_named';
  } catch {
    return 'unparsed';
  }
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
  transcript: string,
  callerLines: readonly string[],
  latest: string,
  names: ReadonlySet<string>,
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
      generate(GROUNDED_RELEASE_PROMPT, transcript, controller.signal),
      timeout,
    ]);
    return reply === null ? 'timeout' : parseGroundedRead(reply, callerLines, latest, names);
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
  const { latest, earlier, companion } = linesOf(input);
  const names = namesIn([...earlier, companion, latest]);
  const transcript = groundedTranscript(input);
  const reads = await Promise.all(
    generates.map((g) => readOnce(g, transcript, earlier, latest, names, timeoutMs))
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
    if (mode === 'off' || !groundedReleaseEligible(args)) return Promise.resolve(false);
    const startedAt = Date.now();
    const key = JSON.stringify([args.call, mode, groundedTranscript(args.input)]);
    for (const [k, v] of recent) if (startedAt - v.at > RECENT_TTL_MS) recent.delete(k);
    let run = recent.get(key)?.run;
    if (!run) {
      const generates =
        args.generates ??
        (defaultGenerates ??= DEFAULT_GROUNDED_RELEASE_MODELS.map((m) =>
          createGeminiAdjudicatorGenerate(m)
        ));
      run = readGrounded(args.input, generates, timeoutFrom(env))
        .then(({ release, reads }) => {
          if (release && mode === 'live') explainCrisisTurn(args.call, args.input.latest);
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
