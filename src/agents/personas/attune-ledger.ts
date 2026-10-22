/**
 * ATTUNE_LEDGER=on: the caller's energy (low, upbeat, or mixed) from an
 * evidence ledger instead of a sticky label.
 *
 * Prod canary 2026-10-21 (ATTUNE=on): 32 turns in 8 calls read upbeat callers
 * as "low". One weak cue set the label and nothing expired it: a "long day"
 * held for four turns, "you sound tired" (about Ferni) counted as the caller's
 * mood, and short teasers ("guess how Monday went") read as low energy. #2380
 * patched each case; this replaces the design (research report moves 4, 7, 8):
 *   - every cue has a source, a turn and an expiry, so the read can say why;
 *   - only cues about the caller count: not Ferni ("are you tired?"), not a
 *     third party ("my mom sounds exhausted"), not negated, not hypothetical;
 *   - an explicit positive (good news, a teaser, "I'm great") wins on its turn
 *     and clears every earlier cue;
 *   - entering low takes two independent cues (two turns, or words plus a flat
 *     voice); staying low takes one live cue, and a long engaged turn clears
 *     the weak ones (keywords, short answers);
 *   - a short answer is a cue only for a caller who normally talks: the stored
 *     per-caller median when there is one, else this call's own median after
 *     three turns, else a population prior;
 *   - the voice is an arousal and conflict signal only, with no valence weight
 *     until it is calibrated on human audio: it can confirm low words, and when
 *     it disagrees with the words the read is "mixed" (ask, don't assume). It
 *     never makes "low" on its own.
 * Crisis is not read here: attunementNote stands down under crisis guidance.
 *
 * @module agents/personas/attune-ledger
 */

export type CueSource = 'text' | 'keyword' | 'length' | 'prosody';

export interface Cue {
  /** -1 (low) .. +1 (upbeat). Prosody always 0: no valence weight until calibrated. */
  valence: number;
  /** -1 (flat) .. +1 (lively). */
  arousal: number;
  source: CueSource;
  /** Caller turn index, 0-based. */
  turn: number;
  /** Last turn index at which the cue still counts. */
  expires: number;
  /** The words (or reading) behind it. */
  why: string;
}

export type LedgerState = 'low' | 'excited' | 'mixed' | undefined;

export interface LedgerVoice {
  arousal?: number;
  confidence?: number;
}

/** Turns each source keeps counting after its own (explicit words last longest). */
const TTL: Record<CueSource, number> = { text: 3, keyword: 2, length: 2, prosody: 0 };
/** A typical caller's median words per turn, until this caller has a baseline. */
const PRIOR_BASELINE = 12;
/** Below this baseline a caller is habitually terse: short answers say nothing. */
const TALKER = 8;

const LOW_WORDS =
  /\b(?:tired|wiped|exhausted|(?:i'?m|so|totally|just|feel(?:ing)?) (?:beat|fried)|drained|worn (?:out|down)|knackered|sleepy|long day|rough(?! draft| idea| sketch| estimate)|(?:hard|bad) (?:day|week|night)|just a lot|swamped|slammed|overwhelm\w*|(?:don'?t|do not) (?:even )?know where to start|can'?t sleep|(?:didn'?t|haven'?t|barely) slept?(?: much)?|didn'?t sleep|no sleep|double shift|(?:nothing|not much) left in the tank|running on empty|feel(?:s|ing)? (?:heavy|low|down|flat|blah)|not (?:doing |feeling )?(?:so |too |that )?(?:great|good|well))\b/gi;
const UP_WORDS =
  /\b(?:good news|great news|best news|excited|exciting|thrilled|stoked|can'?t wait|looking forward|went (?:really |so |super )?(?:well|great|amazing|awesome)|(?:really|so|super) (?:well|great|good|happy)|amazing|fantastic|wonderful|nailed it|crushed it|killed it|yay|woo+(?:hoo+)?|hooray|i'?m (?:great|doing great|doing (?:really )?well|so happy|happy|pumped)|feel(?:ing)? (?:great|amazing|fantastic))\b/gi;
/** A bid: they are about to tell news. "Guess how Monday went" asks for a guess, not condolence. */
const TEASER =
  /\b(?:guess (?:what|how|who|where)|you'?ll never (?:believe|guess)|wait (?:till|until) you hear|so get this|i have news|you won'?t believe)\b/i;
/** A soft opener ("ok so", "so...", "anyway"): not low, however short. */
const OPENER = /^(?:ok(?:ay)?|so|well|alright|anyway|right)\b[\s,.…-]*(?:so\b)?[\s,.…-]*$/i;
const GREETING = /^(?:hi|hey|hello|yo|morning|evening|hiya)\b|\bit'?s me\b/i;
/** "I'm Jess, by the way": an introduction, not a short answer. */
const SELF_ID = /\b(?:[Ii]'?m|[Tt]his is|[Mm]y name is) [A-Z]\w*/;
/** A short turn that trails off in resignation ("yeah… I don't know"). */
const RESIGNED = /\b(?:i (?:don'?t|do not) know|dunno|whatever|meh)\b/i;
const EXPLICIT_FRAME =
  /\b(?:i'?m|i am|i feel|feeling|i'?ve been|i was|it'?s been|been|today was|today'?s been|my day (?:was|has been)|had an?)(?:\s+\w+){0,3}\s*$/i;

/** Clause boundaries: affect is read inside the clause it appears in. */
const BOUNDARY = /[.!?;:,—]|\b(?:but|and|though)\b/gi;
const NEGATED =
  /\b(?:not|never|no|hardly|barely|without|\w+n['’]t|dont|didnt|isnt|wasnt|aint|too \w+ to(?: be)?)(?:\s+\w+){0,3}\s*$/i;
const ABOUT_SOMEONE_ELSE =
  /\b(?:you|you'?re|your|ferni|fern|he|she|they|he'?s|she'?s|they'?re|him|her|them)\b|\bmy (?:\w+ ){1,2}(?:is|was|seems|sounds|looks|has been|'s)\b/i;
const HYPOTHETICAL = /\b(?:if|would|might|could|imagine|pretend)\b/i;
const SELF = /\b(?:i|i'?m|i'?ve|me|myself)\b/i;

const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The clause before a match, from the last boundary. */
function clauseBefore(text: string, at: number): string {
  const head = text.slice(0, at);
  let start = 0;
  for (const b of head.matchAll(BOUNDARY)) start = (b.index ?? 0) + b[0].length;
  return head.slice(start);
}

/** Affect about the caller: not negated, not hypothetical, not about Ferni or anyone else. */
function aboutCaller(text: string, at: number): boolean {
  const before = clauseBefore(text, at);
  if (NEGATED.test(before) || HYPOTHETICAL.test(before)) return false;
  return !(ABOUT_SOMEONE_ELSE.test(before) && !SELF.test(before));
}

function firstOwn(text: string, re: RegExp): RegExpMatchArray | undefined {
  for (const m of text.matchAll(re)) if (aboutCaller(text, m.index ?? 0)) return m;
  return undefined;
}

/** The caller's usual words per turn: stored across calls, else this call's own, else a prior. */
export function baselineWords(prior: string[], stored?: number): number {
  if (stored !== undefined && stored > 0) return stored;
  return prior.length >= 3 ? median(prior.map(words)) : PRIOR_BASELINE;
}

interface TurnRead {
  low: Cue[];
  /** An explicit positive or a teaser about the caller: wins this turn. */
  up?: string;
  /** A long turn with nothing low in it: weak low cues stop counting. */
  engaged: boolean;
}

/** The low words in this turn that are about the caller, and whether the turn trails off. */
function lowWords(text: string): { hit?: RegExpMatchArray; source?: CueSource; why?: string } {
  const hit = firstOwn(text, LOW_WORDS);
  if (hit) {
    const explicit = EXPLICIT_FRAME.test(clauseBefore(text, hit.index ?? 0));
    return { hit, source: explicit ? 'text' : 'keyword', why: hit[0] };
  }
  if (words(text) <= 6 && RESIGNED.test(text)) return { source: 'keyword', why: 'trails off' };
  return {};
}

/** An explicit positive or teaser; after any low words ("long day, but it went really well"). */
function upbeatNow(text: string, low?: RegExpMatchArray): string | undefined {
  const hits = [firstOwn(text, UP_WORDS), TEASER.exec(text) ?? undefined];
  return hits.find((m) => m && (!low || (m.index ?? 0) > (low.index ?? 0)))?.[0];
}

/** A short answer from a caller who normally talks; not a greeting, introduction or bid. */
function shortAnswer(text: string, baseline: number): boolean {
  const n = words(text);
  if (baseline < TALKER || n > 5) return false;
  // A question, an opener, or a remark about Ferni ("you sound tired") is engagement, not low.
  const aboutOther = [...text.matchAll(LOW_WORDS)].length > 0;
  const bid = OPENER.test(text.trim()) || text.includes('?') || aboutOther;
  return !bid && !(GREETING.test(text.trim()) && n <= 3) && !SELF_ID.test(text);
}

/** What one caller turn says about their energy. */
export function readTurn(text: string, turn: number, baseline: number): TurnRead {
  const cue = (source: CueSource, why: string): Cue => ({
    valence: source === 'length' ? -0.3 : -1,
    arousal: -0.5,
    source,
    turn,
    expires: turn + TTL[source],
    why,
  });
  const own = lowWords(text);
  const up = upbeatNow(text, own.hit);
  if (up) return { low: [], up, engaged: false };
  if (own.source && own.why) return { low: [cue(own.source, own.why)], engaged: false };
  if (shortAnswer(text, baseline))
    return { low: [cue('length', `${words(text)} words, usually ${baseline}`)], engaged: false };
  return { low: [], engaged: words(text) >= Math.max(8, 0.75 * baseline) };
}

/** Independent low evidence: one per turn, plus the voice as a separate witness. */
function independent(cues: Cue[]): number {
  return new Set(cues.map((c) => (c.source === 'prosody' ? 'prosody' : c.turn))).size;
}

function confidentArousal(voice: LedgerVoice | undefined): number | undefined {
  return voice && (voice.confidence ?? 0) >= 0.5 ? (voice.arousal ?? 0) : undefined;
}

export interface LedgerRead {
  state: LedgerState;
  /** The live cues behind the read, for the log ("low because of X at turn 3"). */
  cues: Cue[];
}

/**
 * The caller's energy now, from all their turns. `voice` is the latest turn's
 * reading; `storedBaseline` the caller's median words per turn from past calls.
 */
export function ledgerRead(
  turns: string[],
  voice?: LedgerVoice,
  storedBaseline?: number
): LedgerRead {
  let cues: Cue[] = [];
  let low = false;
  let read: TurnRead = { low: [], engaged: false };
  turns.forEach((text, t) => {
    read = readTurn(text, t, baselineWords(turns.slice(0, t), storedBaseline));
    if (read.up) {
      cues = [];
      low = false;
      return;
    }
    if (read.engaged) cues = cues.filter((c) => c.source === 'text');
    cues = [...cues, ...read.low].filter((c) => c.expires >= t);
    low = low ? cues.length > 0 : independent(cues) >= 2;
  });
  const now = turns.length - 1;
  const arousal = confidentArousal(voice);
  if (arousal !== undefined && arousal >= 0.45 && cues.length > 0) return { state: 'mixed', cues };
  if (read.up)
    return { state: arousal !== undefined && arousal <= -0.35 ? 'mixed' : 'excited', cues };
  if (arousal !== undefined && arousal <= -0.35 && cues.length > 0) {
    const flat: Cue = {
      valence: 0,
      arousal,
      source: 'prosody',
      turn: now,
      expires: now,
      why: 'flat voice',
    };
    cues = [...cues, flat];
    low = low || independent(cues) >= 2;
  }
  return { state: low ? 'low' : undefined, cues };
}
