/**
 * What Ferni's turn is while an action waits for a yes (consent-window.ts). Ferni paraphrases: a
 * word matcher knew 5 of 20 logged read-backs and missed a second question in the turn (#2962
 * round 6). So the consent judge's model classifies each turn once, as it ends: it has until the
 * owner has heard it and answered (READBACK_CEILING_MS at most), and the decision waits only
 * READBACK_GRACE_MS more. Vetoes run first and only take a read-back away; a timeout, an error or
 * no answer by then is another question.
 * @module tools/domains/communication/outreach/consent-readback
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { geminiAsk, once, onceDone, replyWithin, WHAT } from './consent-judge.js';
import type { ConsentAsk } from './consent-judge.js';
import { FERNI, KIN, LATER, OTHERS, pronounOf, words } from './consent-words.js';

const log = getLogger();
const KINDS = ['readback', 'other_question', 'no_question'] as const;
export type FerniTurn = (typeof KINDS)[number];
/** The stored action. `target`: words naming whom it reaches; only digits' last four reach the model. */
export interface ActionFacts {
  channel: 'call' | 'text' | 'other';
  person: string;
  target: string[];
  digits: string;
  owner: string[];
  /** The gate's own ask-once line (consent-loop.ts): always a read-back. */
  askOnce: string;
}

// Another time, line or number is never this action now.
const ELSEWHERE = new Set([
  ...LATER,
  ...words('wait until till morning afternoon evening noon minute minutes hour hours'),
  ...words('work cell cellphone mobile office line landline'),
  ...words('ten eleven twelve thirteen fourteen fifteen twenty thirty forty fifty'),
]);
const OTHER_NUMBER = /\b(other|another|different|new|second|home|backup) (phone )?number\b/;
/** Words of each channel; a question in a read-back must have one, or only seek a go-ahead. */
export const CHANNEL_WORDS = {
  call: /\b(call|calling|dial|dialing|ring|phone|go ahead)\b/,
  text: /\b(text|texting|message|send|go ahead)\b/,
  other: /\b(send|email|post|go ahead)\b/,
};
const OTHER_CHANNEL = {
  call: /\b(texts?|texting|message|email|voicemail|facetime|whatsapp|video|zoom|skype)\b/,
  text: /\b(call|calling|dial|ring|phone)\b/,
  other: /$^/,
};
const TAG = /^(sounds? good|okay|ok|all right|alright|is that okay|is that ok)( to you)?$/;
const HE = new Set(words('he hes him his himself'));
const SHE = new Set(words('she shes her hers herself'));
const DIGIT = 'zero one two three four five six seven eight nine'.split(' ');

/** Each run of digits said, as numerals or words ("eight zero one, eight nine eight" → 801898).
 * A lone "one" or "oh" is a word ("the one ending…", "Oh, got it"). */
export function digitRuns(text: string): string[] {
  const runs: string[][] = [[]];
  for (const t of text.toLowerCase().match(/[a-z]+|\d+/g) ?? []) {
    const d = /^\d+$/.test(t)
      ? t
      : t === 'oh'
        ? '0'
        : DIGIT.indexOf(t) >= 0
          ? `${DIGIT.indexOf(t)}`
          : undefined;
    if (d !== undefined) runs[runs.length - 1].push(t === 'one' || t === 'oh' ? `${t}:${d}` : d);
    else runs.push([]);
  }
  return runs
    .filter((r) => r.length > 1 || (r.length === 1 && !r[0].includes(':')))
    .map((r) => r.map((d) => d.replace(/^\w+:/, '')).join(''));
}

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/);
const questions = (text: string): string[] =>
  sentences(text).flatMap((s) => (s.trim().endsWith('?') ? [words(s).join(' ')] : []));
/** "mom", "your mom's" ("moms") when the action reaches Dad. */
const someoneElse = (w: string, target: string[]): boolean =>
  [w, w.replace(/s$/, '')].some((x) => OTHERS.has(x)) &&
  !target.some((t) => w === t || w === `${t}s`);
/** A capitalised name, not opening a sentence, that isn't the person, the owner or Ferni. */
// Capitalised with a lower-case letter: "Priya", "FaceTime"; not "OK".
const NAME = /^[A-Z](?=[A-Za-z]*[a-z])[A-Za-z]+$/;
// A name opening a sentence as its subject ("Priya is with him."), unless it's a common word.
const SUBJECT = /^([A-Za-z]+)(?:['’]s)? (is|was|has|had|can|could|will|would|says|said|just|and)\b/;
const NOT_NAMES = new Set(
  words(
    'it its that this there here what who he she they we you i everything nothing someone everyone'
  )
);
function namesSomeoneElse(text: string, facts: ActionFacts): boolean {
  const known = new Set([...facts.target, ...facts.owner, ...FERNI, ...NOT_NAMES]);
  const other = (w: string): boolean => NAME.test(w) && !known.has(w.toLowerCase());
  return sentences(text).some((s) => {
    const [first = '', ...rest] = s
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/^[^A-Za-z]+|(['’]s)?[^A-Za-z]*$/g, ''));
    const subject = SUBJECT.exec(s.trim().replace(/^[^A-Za-z]+/, ''))?.[1];
    return rest.some(other) || (subject === first && other(first));
  });
}

/** Never a read-back, whatever the model says: another time, line, number, person or channel, a
 * pronoun that doesn't fit, or a question that isn't about going ahead. */
export function vetoed(text: string, facts: ActionFacts): boolean {
  const said = words(text);
  const line = said.join(' ');
  const pronoun = pronounOf(facts.target);
  const wrong = pronoun ? { him: SHE, her: HE }[pronoun] : new Set<string>();
  const odd = (w: string): boolean =>
    ELSEWHERE.has(w) || wrong.has(w) || someoneElse(w, facts.target);
  return (
    said.some(odd) ||
    /\bhold off\b/.test(line) ||
    OTHER_NUMBER.test(line) ||
    OTHER_CHANNEL[facts.channel].test(line) ||
    digitRuns(text).some((r) => r.length < 4 || !facts.digits.endsWith(r)) ||
    namesSomeoneElse(text, facts) ||
    questions(text).some((q) => !CHANNEL_WORDS[facts.channel].test(q) && !TAG.test(q))
  );
}

const READBACK_PROMPT = `Ferni, a voice assistant, has an action ready for its owner and needs the owner's go-ahead. Classify what Ferni ASKS in his latest turn. Return JSON only: {"kind":"readback"|"other_question"|"no_question"}
readback: every question in the turn asks whether to go ahead with THIS action, to this person, now. Paraphrases count ("Should I go ahead and make that call now?", "Ready for me to call him?", "Do you want me to try dialing him again?", "Should I go ahead with that?", "...if you'd like me to go ahead?", a read-back followed by "Sound good?"). Statements around the question don't change it: sympathy, "I haven't dialed yet", the number, or the errand, even when the errand mentions other people or asks the person to do something ("to say hi and ask her to call you back").
other_question: Ferni asks anything else, anywhere in the turn, even beside a read-back: waiting or another time ("Should I wait until six?"), another number or line, another person, a text instead of a call (or the reverse), a choice ("or would you rather...?"), a pronoun that doesn't fit the person's name, how someone is, or any other question.
no_question: the turn asks nothing (an answer or a statement, e.g. "It ends in 4417.").
When unsure, answer other_question.`;

const SCHEMA = {
  type: 'object',
  properties: { kind: { type: 'string', enum: KINDS } },
  required: ['kind'],
};
/** From the end of Ferni's turn: the owner still has to hear it and answer (~1.5-3 s). */
const READBACK_CEILING_MS = 4000;
/** How long deciding the owner's answer may wait for an unfinished classification. */
export const READBACK_GRACE_MS = 300;
let ask: ConsentAsk = geminiAsk(SCHEMA);
let waitMs = READBACK_CEILING_MS;
/** Tests and replays: another classifier (undefined restores the model) and its ceiling. */
export function setReadBackAsk(
  next: ConsentAsk | undefined,
  ceilingMs = READBACK_CEILING_MS
): void {
  [ask, waitMs] = [next ?? geminiAsk(SCHEMA), ceilingMs];
}

/** The person, their relation and the number's last four; any number in his words is masked. */
export function readBackUserText(facts: ActionFacts, text: string): string {
  const relation = facts.target.find((w) => KIN.has(w));
  const who = `${JSON.stringify(facts.person)}${relation ? ` (the owner's ${relation})` : ''}`;
  const four = facts.digits.length >= 4 ? `, number ending ${facts.digits.slice(-4)}` : '';
  const masked = text
    .replace(/\d[\d\s().-]*\d|\d/g, '[number]')
    .replace(
      /\b((zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){4,}/gi,
      '[number] '
    );
  return `Ready: ${WHAT[facts.channel]} to ${who}${four}, now.\nFerni's turn: ${JSON.stringify(masked)}`;
}

async function classify(facts: ActionFacts, text: string): Promise<FerniTurn> {
  const started = Date.now();
  try {
    const reply = await replyWithin(ask, READBACK_PROMPT, readBackUserText(facts, text), waitMs);
    const said = (JSON.parse(reply?.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { kind?: unknown }).kind;
    const kind = KINDS.find((k) => k === said) ?? 'other_question';
    log.info({ kind, timedOut: reply === null, latencyMs: Date.now() - started }, 'CALL_READBACK');
    return kind;
  } catch (error) {
    log.warn({ error: String(error), latencyMs: Date.now() - started }, 'CALL_READBACK');
    return 'other_question';
  }
}

/** Decided without the model: a vetoed turn, or one with no question in it. */
function decided(facts: ActionFacts, text: string): FerniTurn | undefined {
  if (words(text).join(' ') === words(facts.askOnce).join(' ')) return 'readback';
  return vetoed(text, facts) ? 'other_question' : text.includes('?') ? undefined : 'no_question';
}

/** Starts (or joins) the classification of Ferni's turn for this action. With `graceMs` (when
 * an answer is being decided), waits at most that long more; otherwise until it is known. */
export async function ferniTurnOf(
  action: object,
  facts: ActionFacts,
  text: string,
  on: boolean,
  graceMs?: number
): Promise<void> {
  if (decided(facts, text) || !on) return;
  const run = once(action, `readback:${text}`, async () => classify(facts, text));
  if (graceMs === undefined) {
    await run;
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, graceMs);
  });
  await Promise.race([run, grace]).finally(() => clearTimeout(timer));
}
/** What the turn is now: the model's answer once it has one; until then another question. */
export const ferniTurnNow = (action: object, facts: ActionFacts, text: string): FerniTurn =>
  decided(facts, text) ?? onceDone<FerniTurn>(action, `readback:${text}`) ?? 'other_question';
