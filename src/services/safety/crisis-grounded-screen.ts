/**
 * The direct screening question a grounded release asks
 * (crisis-grounded-release.ts), and the caller's answer to it.
 *
 * Round 3 of #2354 released 40 of 40 new risky lines built only from allowed
 * words with both reads fooled ("After dinner I'll try again."), so word rules
 * cannot prove a release safe. Every release asks SCREEN_QUESTION (Seth,
 * 2026-10-22: "Ask directly, gently"). Code appends it as the reply's last
 * sentence (crisis-gate.ts), so the reply model can neither skip nor reword
 * it. The caller's next turn takes the crisis path with 988 unless it is a
 * clear no to that question as Ferni actually said it, in full and last (an
 * interrupted reply keeps only what played). If Ferni's line before the
 * answer was something else (the caller went quiet and Ferni filled the
 * silence), the question is asked once more; after that, anything but a
 * clear no takes the crisis path. The caller's next substantive turn after
 * the answer is watched (#2511): a no taken back or a yes after the gentle
 * offer takes the crisis path too, judged by one model read (watchScreen).
 *
 * @module CrisisGroundedScreen
 */

import { ReadableStream, TransformStream } from 'node:stream/web';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import { noteCrisisRisk } from './crisis-call-risk.js';
import {
  applyClassifierVerdict,
  buildCrisisGuidance,
  detectCrisis,
  type CrisisDetectionResult,
} from './crisis-guard.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';
import { EVENTS, alwaysHold, wordsOf } from './crisis-release-words.js';
import { WATCH_RANK, readScreenFollowup, type WatchResult } from './crisis-screen-followup.js';

const log = createLogger({ module: 'CrisisGroundedScreen' });

/** Lower case, letters, digits and apostrophes only, single spaces. */
const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

/**
 * The screening question every release carries, asked the way clinicians
 * screen: directly, about suicide and self-harm by name. Asking does not raise
 * risk; a false alarm costs one caring question.
 */
export const SCREEN_QUESTION =
  "Can I ask you something, and it's okay either way: have you been having thoughts of hurting yourself, or of ending your life?";

/** What the screen makes of a caller turn; 'watch' waits for watchScreen's read. */
export type ScreenOutcome = 'none' | 'reask' | 'watch' | 'positive';
const RANK: Record<ScreenOutcome, number> = { none: 0, reask: 1, watch: 1, positive: 2 };

/**
 * How long after the answer the next substantive caller turn is watched. Backchannels ("Okay.",
 * "mm") are read but never use the window up; only this bound does (#2516 round 2).
 */
const WATCH_MS = 90_000;

/**
 * Per call, after a live release: the released turn, Ferni's line before it,
 * whether the question was asked again, and the last turn judged. In memory,
 * for SCREEN_TTL_MS.
 */
const SCREEN_TTL_MS = 6 * 60 * 60 * 1000;
const SCREEN_MAX = 512;
interface Judged {
  turn: string;
  companion: string;
  outcome: ScreenOutcome;
  /** A watched turn after the answer (#2511): its reads, by the words each path saw. */
  reads?: Map<string, Promise<WatchResult>>;
}
const screens = new Map<
  string,
  {
    at: number;
    asked: string;
    before: string;
    reasked: boolean;
    /** The caller's answer, and until when the next substantive turn is watched (0: closed). */
    answer?: string;
    watchUntil: number;
    last?: Judged;
  }
>();

/**
 * A clear no is one of a closed set of phrases, never a bag of words: "No, I
 * meant it", "No, I'm not okay" and "Nope, kind of" are not clear. Then a
 * no, then only fixed reassurances or the caller's own event. A question
 * mark, an ellipsis or a hesitation ("um", "uh") is not clear either.
 */
const NO_FILLER = '(?:oh|ha|haha|hah|lol|god|gosh|whoa|wow|hey|man|dude) ';
const NO_CORE =
  '(?:no(?: no)*|nope|nah|never|no way|hell no|god no|of course not|absolutely not|definitely not|not at all|not even close)';
const EVENT = `(?:the |my |our )?(?:${[...EVENTS].join('|')})`;
const NO_TAIL = `(?:no|nope|not at all|i'?m (?:good|fine|okay|ok)|all good|totally fine|i promise|promise|(?:but )?thank(?:s| you) for asking|just ${EVENT}|(?:i )?(?:just )?(?:meant|talking about|excited about) ${EVENT})`;
const CLEAR_NO = new RegExp(`^(?:${NO_FILLER})*${NO_CORE}(?: ${NO_TAIL})*$`);

function clearNo(answer: string): boolean {
  if (/^\W*oh,? no\W*$/i.test(answer)) return false; // dismay, not an answer
  if (/[?¿]|\.\.|…/.test(answer)) return false;
  const words = wordsOf(answer);
  if (!words || words.length === 0 || alwaysHold(answer)) return false;
  const scored = detectCrisis(answer);
  if (scored.severity > 0 || scored.indicators.length > 0) return false;
  return CLEAR_NO.test(words.join(' '));
}

/**
 * Words that force guidance on a watched turn (#2511), escalate-only: a miss defers to
 * watchScreen's read, never passes alone. Risk words; owning the no ("I kind of lied before",
 * "I said no but…"); "actually, yes", or a bare yes after a pause word ("Okay, yes."); a no
 * that trails off ("not really no… I mean…").
 */
const UNSURE = "(?:i don'?t know|i do not know|idk|dunno|not sure|i'?m not sure|hard to say)";
const ESCALATES = new RegExp(
  [
    "(?:^| )(?:i (?:\\w+ ){0,2}lied|that (?:was|is) a lie|i wasn'?t (?:\\w+ )?(?:honest|truthful)|i take (?:that|it) back|i said no (?:but|because)|i shouldn'?t have said no|(?:that|what i said)(?: before)? (?:wasn'?t|isn'?t|was not|is not) (?:\\w+ )?true|change my answer|i didn'?t want to (?:say|tell|admit))\\b",
    '(?:^| )actually (?:yes|yeah|yep|yup)\\b',
    // A bare yes after a pause word, nothing else: "Okay, yes.", "Fine, yes.", "Wait. Yes."
    '^(?:(?:ok|okay|fine|alright|all right|wait|hold on|well|um|uh) )+(?:yes|yeah|yep|yup)$',
    `^(?:${NO_FILLER}|um |uh |well )*(?:no|nope|nah|not really)(?: no| nope| really)*(?: (?:i mean|but|although|except|well|kind of|sort of|maybe|${UNSURE}))+$`,
  ].join('|')
);

function escalates(latest: string): boolean {
  // The crisis patterns, not the release's hold list: "I'll text him myself" is no risk here.
  const found = detectCrisis(latest);
  if (found.severity > 0 || found.indicators.length > 0) return true;
  return ESCALATES.test(loose(latest));
}

/** Acknowledgement only: watched, but the window stays open for the next turn. */
const BACKCHANNEL =
  /^(?:(?:ok|okay|alright|all right|mm+|mhm|mm hmm|mm hm|uh huh|hmm+|right|sure|got it|cool|yeah|yep|yes|yup|ah|oh|i see|thanks|thank you|sounds good|nice|great)(?: |$))+$/;

/**
 * Ferni's line ends with SCREEN_QUESTION, in full: not a paraphrase, not "you
 * okay?" (where a bare no means not okay), nothing asked after it, and not
 * cut off by an interruption.
 */
export function askedScreen(companion: string | undefined): boolean {
  return loose(stripSSML(String(companion ?? ''))).endsWith(loose(SCREEN_QUESTION));
}

export function noteScreenAsked(
  call: string,
  released: { latest: string; companion?: string },
  now = Date.now()
): void {
  for (const [id, s] of screens) if (now - s.at > SCREEN_TTL_MS) screens.delete(id);
  if (screens.size >= SCREEN_MAX) {
    const oldest = screens.keys().next().value;
    if (oldest !== undefined) screens.delete(oldest);
  }
  const before = loose(stripSSML(String(released.companion ?? '')));
  screens.set(call, {
    at: now,
    asked: loose(released.latest),
    before,
    reasked: false,
    watchUntil: 0,
  });
}

/**
 * The screen's verdict on a caller turn after a release:
 * - positive: anything but a clear no to the question as Ferni said it, or
 *   any answer once the question was asked again; the crisis path with 988;
 * - reask: Ferni's line was something else (the caller went quiet), the first
 *   time; the reply asks the question again;
 * - none: no screen open, a clear no, the released turn itself, or a turn
 *   after the screen closed.
 * Both paths of a turn share Ferni's line: the second gets the first's
 * verdict, or a stronger one if its words differ. Positive on anything
 * unexpected.
 */
export function screenAnswer(
  call: string | undefined,
  input: {
    latest: string;
    companion?: string;
    /** All of Ferni's lines since the caller last spoke, when known (a tool follow-up comes last). */
    ferni?: readonly string[];
  },
  now = Date.now()
): ScreenOutcome {
  try {
    const screen = call ? screens.get(call) : undefined;
    if (!screen || now - screen.at > SCREEN_TTL_MS) return 'none';
    const turn = loose(String(input.latest ?? ''));
    // Keyed on Ferni's last recorded line: the gate passes its lines without acknowledgements,
    // as the reply recorder (the pipeline's lastAgentResponse) keeps them.
    const keyLine = input.ferni?.length ? input.ferni[input.ferni.length - 1] : input.companion;
    const companion = loose(stripSSML(String(keyLine ?? '')));
    // Asked if a line of Ferni's reply ended with the question in full and nothing Ferni said
    // after it asked anything else: a tool's follow-up may come last (the SDK speaks it after).
    const lines = input.ferni?.length ? input.ferni : [input.companion ?? ''];
    const at = lines.map((line) => askedScreen(line)).lastIndexOf(true);
    const asked = at >= 0 && lines.slice(at + 1).every((line) => !line.includes('?'));
    // The released turn itself, on its other path, even with drifted words: never an answer.
    // A line that answers the question is screened, even one repeating the released words.
    const releasedTurn = turn === screen.asked || (companion !== '' && companion === screen.before);
    if (!turn || (releasedTurn && !asked)) return 'none';
    const judge = (reasked: boolean, watch = false): ScreenOutcome => {
      if (watch) return escalates(input.latest) ? 'positive' : 'watch';
      if (asked) return clearNo(input.latest) ? 'none' : 'positive';
      return reasked ? 'positive' : 'reask';
    };
    const last = screen.last;
    // The same words after the screen closed: the turn already judged, on whichever path.
    // The same words keep a verdict never weaker on the other path, whatever line it saw. A
    // repeated "No." to Ferni's next question is a new turn, though: it gets the read (#2516).
    const sameTurn = last?.companion === companion || last?.outcome !== 'none';
    if (last && last.turn === turn && last.outcome !== 'reask' && sameTurn) return last.outcome;
    // The same turn's other path shares Ferni's line before it: one shared record, never weaker
    // than the first path's verdict, and a stronger one replaces it. Words alone never make a
    // turn the same one: a caller may repeat "No." after a re-ask.
    if (last && companion !== '' && companion === last.companion) {
      const again = judge(screen.reasked && last.outcome !== 'reask', Boolean(last.reads));
      if (RANK[again] <= RANK[last.outcome]) return last.outcome;
      if (again === 'reask') screen.reasked = true;
      if (!last.reads) screen.answer = input.latest;
      screen.last = { ...last, outcome: again };
      log.info({ outcome: again, asked, path: 'second' }, 'CRISIS_GROUNDED_SCREEN');
      return again;
    }
    // The caller's next substantive turn after the answer is watched (#2511): words that
    // escalate, else watchScreen's read. Backchannels keep the window open, up to WATCH_MS.
    if (last && last.outcome !== 'reask') {
      if (now > screen.watchUntil) return 'none';
      // A backchannel, or the answer's own words again (a repeated "No.", or the answer turn's
      // other path under a different line), is read but never uses the window up.
      if (!BACKCHANNEL.test(turn) && turn !== loose(screen.answer ?? '')) screen.watchUntil = 0;
      const outcome = judge(false, true);
      screen.last = { turn, companion, outcome, reads: new Map() };
      log.info({ outcome, asked, watch: true }, 'CRISIS_GROUNDED_SCREEN');
      return outcome;
    }
    // A turn while the screen is open: nothing judged yet, or a re-ask.
    const outcome = judge(screen.reasked);
    if (outcome === 'reask') screen.reasked = true;
    else [screen.answer, screen.watchUntil] = [input.latest, now + WATCH_MS];
    screen.last = { turn, companion, outcome };
    log.info({ outcome, asked }, 'CRISIS_GROUNDED_SCREEN');
    return outcome;
  } catch {
    return 'positive';
  }
}

/**
 * A 'watch' turn's verdict (crisis-screen-followup.ts): one model read of the question, the
 * answer, Ferni's lines since and this turn. Both paths of the turn share it: each gets the
 * strongest of the reads started so far, a path whose words drifted adding its own.
 */
export function watchScreen(
  call: string | undefined,
  input: { latest: string; ferni: readonly string[] },
  generate?: CrisisGenerateFn,
  env: Record<string, string | undefined> = process.env
): Promise<WatchResult> {
  const screen = call ? screens.get(call) : undefined;
  const reads = screen?.last?.reads;
  if (!screen || !reads) return Promise.resolve('crisis'); // never expected: fail closed
  const key = loose(String(input.latest ?? ''));
  if (!reads.has(key)) {
    const read = readScreenFollowup(
      {
        question: SCREEN_QUESTION,
        answer: screen.answer ?? '',
        ferni: input.ferni.map((line) => stripSSML(String(line ?? '')).trim()),
        latest: input.latest,
      },
      generate,
      env
    );
    reads.set(key, read);
  }
  // The strongest of the turn's reads, including any the other path adds while these settle,
  // so the order the two paths run in never weakens the verdict.
  const strongest = (seen: number): Promise<WatchResult> =>
    Promise.all([...reads.values()]).then((all) =>
      reads.size > seen
        ? strongest(reads.size)
        : all.reduce((a, b) => (WATCH_RANK[b] > WATCH_RANK[a] ? b : a), 'pass' as WatchResult)
    );
  return strongest(reads.size);
}

/** watchScreen's read for a 'watch' turn, null for any other. */
export function watchFor(
  screen: ScreenOutcome,
  call: string | undefined,
  input: { latest: string; ferni: readonly string[] },
  options: { groundedReads?: readonly CrisisGenerateFn[]; env?: Record<string, string | undefined> }
): Promise<WatchResult> | null {
  if (screen !== 'watch') return null;
  return watchScreen(call, input, options.groundedReads?.[0], options.env ?? process.env);
}

/**
 * The reply gate's escalation with a watched turn's read folded in, held like the classifier's:
 * 'crisis' is crisis guidance with 988 unless the classifier replaces the reply; 'gentle' is
 * the gentle offer unless the classifier escalated. Risk on the call either way. Never rejects.
 */
export function withWatched<D extends { action: string }>(
  escalation: Promise<D | null> | null,
  watched: Promise<WatchResult> | null,
  found: CrisisDetectionResult,
  call: string | undefined
): Promise<D | { action: 'guide'; guidance: string } | null> | null {
  if (!watched) return escalation;
  const classifier = (escalation ?? Promise.resolve(null)).catch(() => null);
  return Promise.all([classifier, watched]).then(([stronger, read]) => {
    if (read !== 'pass') noteCrisisRisk(call);
    if (read === 'crisis' && stronger?.action !== 'replace') {
      return { action: 'guide', guidance: buildCrisisGuidance(withScreenPositive(found)) };
    }
    if (read === 'gentle') return stronger ?? { action: 'guide', guidance: SCREEN_GENTLE_OFFER };
    return stronger;
  });
}

/**
 * An unclear answer ("I don't know", a laugh, a hesitant no) gets this in
 * Ferni's reply (Seth, 2026-10-22): a gentle 988 offer inside the
 * conversation, Ferni staying itself. A yes, or risk content, gets crisis
 * guidance; the replacement script stays for a plan or intent the classifier
 * reads. The classifier can only make it stronger, never gentler.
 */
export const SCREEN_GENTLE_OFFER = `[SAFETY - GENTLE OFFER]
You asked whether they were thinking about hurting themselves, and they didn't give a clear no.
1. Stay yourself: warm and unhurried, and keep the conversation going; no alarm and no lecture
2. Once, gently, say you're really glad they're talking with you, and that if things ever get heavy they can call or text 988, any time
3. Don't push for details. If they say more, listen, stay with them, and take it seriously`;

/**
 * Unclear, not a yes: not knowing, a laugh, a question back, hesitation, a
 * hesitant no ("No?", "Um, no.", "No... I'm fine."). A closed set: anything
 * else that is not a clear no ("yeah", "kind of", "maybe", "No, I meant it")
 * is a yes, or a no taken back.
 */
const UNCLEAR_FILLER = '(?:(?:oh|um|uh|hmm|ha|haha|lol|well) )*';
const UNCLEAR = new RegExp(
  // "uh huh" and "mm hmm" are yeses; "I guess" is unclear only after a no.
  `^(?!.*\\b(?:uh huh|mm hmm|mm hm|mhm)\\b)${UNCLEAR_FILLER}(?:` +
    "(?:i (?:don'?t|do not) know|idk|dunno|not sure|i'?m not sure|hard to say|haha|ha|lol|hmm+|um+|uh+|what|huh|sorry|wait what)(?: (?:really|why|what do you mean))*" +
    "|(?:no|nope|nah|not really)(?: (?:i'?m (?:fine|good|okay|ok)|i guess|really))*" +
    ')$'
);

/**
 * The answer is ideation, not merely unclear: risk content of its own (a
 * pattern hit or a held word), or any answer outside the closed unclear set.
 * Ideation gets crisis guidance in Ferni's own reply; unclear gets the gentle offer.
 */
export function screenIdeation(found: CrisisDetectionResult, answer: string): boolean {
  if (found.severity > 0 || found.indicators.length > 0 || alwaysHold(answer)) return true;
  return !UNCLEAR.test((wordsOf(answer) ?? []).join(' ')); // NFKC: "…" reads as "..."
}

/** A positive screen as a crisis reading: guidance with 988, never the replacement script. */
export function withScreenPositive(detection: CrisisDetectionResult): CrisisDetectionResult {
  const merged = applyClassifierVerdict(detection, { risk: 'crisis', subject: 'self' });
  return merged.indicators.includes('grounded_screen_positive')
    ? merged
    : { ...merged, indicators: [...merged.indicators, 'grounded_screen_positive'] };
}

/** A stream chunk's text: a string, or a chat chunk's delta content. */
const chunkText = (chunk: unknown): string => {
  if (typeof chunk === 'string') return chunk;
  const content = (chunk as { delta?: { content?: unknown } } | null)?.delta?.content;
  return typeof content === 'string' ? content : '';
};

/**
 * A reply stream with SCREEN_QUESTION as its last sentence, whatever the model
 * wrote; not added twice when the model already ended on it.
 */
export function withScreenQuestion<T>(reply: ReadableStream<T>): ReadableStream<T | string> {
  let said = '';
  return reply.pipeThrough(
    new TransformStream<T, T | string>({
      transform(chunk, controller) {
        said += chunkText(chunk);
        controller.enqueue(chunk);
      },
      flush(controller) {
        // Skipped only when the model's own text ends with the exact canonical question.
        if (!said.trimEnd().endsWith(SCREEN_QUESTION)) controller.enqueue(` ${SCREEN_QUESTION}`);
      },
    })
  );
}

/** The reply with the question last, or the question alone when the model gave nothing. */
export function screenReply<T>(reply: ReadableStream<T> | null): ReadableStream<T | string> {
  if (reply) return withScreenQuestion(reply);
  return new ReadableStream<T | string>({
    start(controller) {
      controller.enqueue(SCREEN_QUESTION);
      controller.close();
    },
  });
}

/** For tests. */
export function resetGroundedScreen(): void {
  screens.clear();
}
