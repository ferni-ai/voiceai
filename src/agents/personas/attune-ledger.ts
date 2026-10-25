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
 *   - an explicit positive (good news, a teaser, "I'm good") wins on its turn
 *     and clears every earlier cue; a positive word over a complaint ("oh
 *     great, another Monday") is sarcasm: mixed, never upbeat;
 *   - an explicit self-report ("I'm exhausted", "didn't sleep much", "rough
 *     week") is strong and enters low on its own; weak cues (a keyword like
 *     "long day", a short answer, a flat voice) need two independent ones;
 *     staying low takes one live cue, and a long engaged turn clears weak ones;
 *   - shortness alone is never a cue: a short answer only reinforces a live
 *     content cue, and only as a drop against the caller's own baseline (the
 *     stored per-caller median, else this call's median after three turns);
 *   - the voice is an arousal and conflict signal only, with no valence weight
 *     until it is calibrated on human audio: it can confirm low words, and when
 *     it disagrees with the words the read is "mixed" (ask, don't assume). It
 *     never makes "low" on its own.
 * Crisis is not read here: attunementNote stands down under crisis guidance.
 *
 * @module agents/personas/attune-ledger
 */

/** text: an explicit self-report (strong); keyword, length, prosody: weak. */
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
/** Below this baseline a caller is habitually terse: a short answer is no drop. */
const TALKER = 8;

const STATE =
  '(?:tired|exhausted|wiped(?: out)?|beat|fried|drained|worn (?:out|down)|knackered|sleepy|overwhelmed|down|low|flat|blah|heavy|miserable|awful|terrible|crappy|stressed(?: out)?|burn(?:ed|t) out)(?! (?:for|to|with|on|here|there|the)\\b)';
// Strong: the caller says how they are ("I'm exhausted", "feeling really down"),
// a bare state as its own sentence ("Wiped.", "Just tired I think."), or a hard
// event about themselves (lost sleep, a rough week, things going wrong, piled on).
const STRONG = new RegExp(
  `\\b(?:i'?m|i am|i feel|i'?ve been|feeling|feel)(?: (?:so|really|just|totally|pretty|very|completely|kind of|kinda|honestly))* ${STATE}\\b` +
    `|(?:^|[.!?…]\\s*)(?:(?:mm|yeah|just|so|totally|honestly|kind of|kinda|pretty|really),? )*(?:tired|exhausted|wiped(?: out)?|beat|fried|drained|knackered|burn(?:ed|t) out)\\b` +
    "|\\b(?:(?:didn'?t|haven'?t|barely|hardly) slept?|didn'?t (?:get )?(?:much )?sleep|no sleep|can'?t sleep|up all night|(?:was|been) up (?:like )?\\w+ times" +
    "|(?:rough|hard|bad|terrible|awful|brutal) (?:day|week|night|month|couple of days)|it'?s been rough" +
    "|everything'?s? (?:is )?going wrong|nothing'?s? (?:is )?(?:working out|going right)|keeps? piling|piling (?:\\w+ )?on me" +
    '|(?:nothing|not much) left in the tank|running on empty|not (?:doing|feeling) (?:so |too |that )?(?:great|good|well))\\b',
  'gi'
);
// Weak: an event or keyword ("long day", "swamped") or a bare state word mid-sentence.
const WEAK = new RegExp(
  "\\b(?:long (?:day|week|shift|night)|double shift|swamped|slammed|just a lot|(?:don'?t|do not) (?:even )?know where to start|killing me" +
    '|tired|exhausted|wiped|drained|worn out|knackered|sleepy|overwhelmed|stressed|burn(?:ed|t) out)\\b',
  'gi'
);
/** A short turn that trails off ("yeah… I don't know", "Mm. I guess."). */
const RESIGNED =
  /\b(?:i (?:don'?t|do not) know|dunno|whatever|meh|i guess|(?:not much|nothing) to say)\b/i;
const UP_WORDS =
  /\b(?:good news|great news|best news|excited|exciting|thrilled|stoked|can'?t wait|looking forward|went (?:really |so |super )?(?:well|great|amazing|awesome)|(?:really|so|super) (?:well|great|good|happy)|amazing|fantastic|wonderful|nailed it|crushed it|killed it|yay|woo+(?:hoo+)?|hooray|i'?m (?:good|doing good|great|doing great|doing (?:really )?well|so happy|happy|pumped)|feel(?:ing)? (?:great|amazing|fantastic))\b/gi;
/** A bid: they are about to tell news. "Guess how Monday went" asks for a guess, not condolence. */
const TEASER =
  /\b(?:guess (?:what|how|who|where)|you'?ll never (?:believe|guess)|wait (?:till|until) you hear|so get this|i have news|you won'?t believe)\b/i;
/** Sarcasm: a positive interjection over a complaint ("yay, more meetings", "love that for me"). */
const SARCASM = /\b(?:love that for me|just what i needed|thrilled,? truly)\b/i;
const INTERJECTION =
  /\b(?:great|fantastic|perfect|wonderful|awesome|lovely|yay|super|terrific|brilliant)\b/i;
const COMPLAINT =
  /\b(?:again|another (?:monday|meeting|bill|one)|more (?:meetings|work|emails|bills|traffic|of this)|broke(?:n)? down|crashed|cancel+ed)\b/i;
const OPENER = /^(?:ok(?:ay)?|so|well|alright|anyway|right)\b[\s,.…-]*(?:so\b)?[\s,.…-]*$/i;
const GREETING = /^(?:hi|hey|hello|yo|morning|evening|hiya)\b|\bit'?s me\b/i;
/** "I'm Jess, by the way": an introduction, not a short answer. */
const SELF_ID = /\b(?:[Ii]'?m|[Tt]his is|[Mm]y name is) [A-Z]\w*/;

/** Clause boundaries: affect is read inside the clause it appears in. */
const BOUNDARY = /[.!?;:,—]|\b(?:but|and|though)\b/gi;
const NEGATED =
  /\b(?:not|never|no|hardly|barely|without|\w+n['’]t|dont|didnt|isnt|wasnt|aint|too \w+ to(?: be)?)(?:\s+\w+){0,3}\s*$/i;
const ABOUT_SOMEONE_ELSE =
  /\b(?:you|you'?re|your|ferni|fern|he|she|they|he'?s|she'?s|they'?re|him|her|them)\b|\bmy (?:\w+ ){1,2}(?:is|was|seems|sounds|looks|has been|'s)\b/i;
const HYPOTHETICAL = /\b(?:if|would|i'?d|might|could|imagine|pretend)\b/i;
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

/** The caller's own usual words per turn: stored across calls, else this call's after 3 turns. */
export function baselineWords(prior: string[], stored?: number): number | undefined {
  if (stored !== undefined && stored > 0) return stored;
  return prior.length >= 3 ? median(prior.map(words)) : undefined;
}

interface TurnRead {
  /** Content cues: what they said about themselves. */
  low: Cue[];
  /** An explicit positive or a teaser about the caller: wins this turn. */
  up?: string;
  /** A positive word over a complaint: mixed, never upbeat. */
  sarcastic: boolean;
  /** A drop against their own baseline: reinforces a live content cue, never alone. */
  short: boolean;
  /** A long turn with nothing low in it: weak cues stop counting. */
  engaged: boolean;
}

/** The strongest low words in this turn that are about the caller. */
function lowWords(text: string): { hit?: RegExpMatchArray; source?: CueSource; why?: string } {
  const strong = firstOwn(text, STRONG);
  if (strong) return { hit: strong, source: 'text', why: strong[0].trim() };
  const weak = firstOwn(text, WEAK);
  if (weak) return { hit: weak, source: 'keyword', why: weak[0] };
  if (words(text) <= 6 && RESIGNED.test(text)) return { source: 'keyword', why: 'trails off' };
  return {};
}

/** An explicit positive or teaser; after any low words ("long day, but it went really well"). */
function upbeatNow(text: string, low?: RegExpMatchArray): string | undefined {
  const hits = [firstOwn(text, UP_WORDS), TEASER.exec(text) ?? undefined];
  return hits.find((m) => m && (!low || (m.index ?? 0) > (low.index ?? 0)))?.[0];
}

/** A short answer that drops against the caller's own baseline; not a greeting, intro or bid. */
function dropsShort(text: string, baseline: number | undefined): boolean {
  const n = words(text);
  if (baseline === undefined || baseline < TALKER || n > 5 || n > baseline / 2) return false;
  // A question, an opener, or a remark about Ferni ("you sound tired") is engagement, not low.
  const aboutOther = [...text.matchAll(WEAK)].length > 0;
  const bid = OPENER.test(text.trim()) || text.includes('?') || aboutOther;
  return !bid && !(GREETING.test(text.trim()) && n <= 3) && !SELF_ID.test(text);
}

/** What one caller turn says about their energy. */
export function readTurn(text: string, turn: number, baseline: number | undefined): TurnRead {
  const own = lowWords(text);
  const sarcastic = SARCASM.test(text) || (INTERJECTION.test(text) && COMPLAINT.test(text));
  const up = sarcastic ? undefined : upbeatNow(text, own.hit);
  const none = { low: [], sarcastic, short: false, engaged: false };
  if (up) return { ...none, up };
  if (sarcastic) return none;
  const low: Cue[] =
    own.source && own.why
      ? [
          {
            valence: -1,
            arousal: -0.5,
            source: own.source,
            turn,
            expires: turn + TTL[own.source],
            why: own.why,
          },
        ]
      : [];
  const engaged = low.length === 0 && words(text) >= Math.max(8, 0.75 * (baseline ?? 0));
  return { ...none, low, short: dropsShort(text, baseline), engaged };
}

/** Independent low evidence: one per turn (two for an explicit self-report), plus the voice. */
function independent(cues: Cue[]): number {
  const keys = cues.flatMap((c) =>
    c.source === 'prosody' ? ['prosody'] : c.source === 'text' ? [c.turn, `${c.turn}!`] : [c.turn]
  );
  return new Set(keys).size;
}

function confidentArousal(voice: LedgerVoice | undefined): number | undefined {
  return voice && (voice.confidence ?? 0) >= 0.5 ? (voice.arousal ?? 0) : undefined;
}

export interface LedgerRead {
  state: LedgerState;
  /** The live cues behind the read, for the log ("low because of X at turn 3"). */
  cues: Cue[];
}

/** One turn into the ledger: the cues live after it. */
function step(cues: Cue[], read: TurnRead, t: number, baseline: number | undefined): Cue[] {
  if (read.up) return [];
  let next = read.engaged ? cues.filter((c) => c.source === 'text') : cues;
  next = [...next, ...read.low].filter((c) => c.expires >= t);
  if (read.short && next.some((c) => c.source === 'text' || c.source === 'keyword')) {
    const why = `short, usually ${baseline} words`;
    next = [
      ...next,
      { valence: -0.3, arousal: -0.5, source: 'length', turn: t, expires: t + TTL.length, why },
    ];
  }
  return next;
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
  let read: TurnRead = { low: [], sarcastic: false, short: false, engaged: false };
  turns.forEach((text, t) => {
    const baseline = baselineWords(turns.slice(0, t), storedBaseline);
    read = readTurn(text, t, baseline);
    cues = step(cues, read, t, baseline);
    low = low ? cues.length > 0 : independent(cues) >= 2;
  });
  const now = turns.length - 1;
  const arousal = confidentArousal(voice);
  if (read.sarcastic && !low) return { state: 'mixed', cues };
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
