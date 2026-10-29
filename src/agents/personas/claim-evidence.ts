/**
 * What the conversation shows Ferni did, person by person (GROUNDED_CLAIMS).
 *
 * #3037 verify, round 2: a call result backed every call claim, whoever it was
 * for and however it went. A report about Rita let "Yes, I've called your dad
 * too, he says hi" stand; a "Couldn't connect" report let "I talked to Rita and
 * she said she's fine" stand; and a real call to Lee kept "I'm calling Ana now".
 *
 * Here each call or text is kept with the people it was for:
 * - a call or text tool that went out on this call: the people its result names
 *   ("I'm calling Rita now", "Text sent to Jo"), and the one person the caller's
 *   request named, when it named only one ("Call my mom" makes Rita "mom" too);
 * - a call result the server wrote with its status tag (caller-text.ts
 *   callResultTag: callStatus, the pending-call-results note): the person, and
 *   whether it got through. Only an explicit `through` counts; free text never does;
 * - asked "did you call my mom?", the records' name for that call (call-status.ts)
 *   ties "mom" to a person a result names.
 * A claim stands only when every person it names is covered; a claim that names
 * no one ("I've called her") needs any call or text of its kind. People are keyed
 * the way memory keys them (memory/domain/person-key.ts).
 *
 * @module agents/personas/claim-evidence
 */
import { personKey, relationOf } from '../../memory/domain/index.js';
import type { FerniCall } from '../../services/outreach/call-status.js';
import { callActions, kindsOfTool } from './action-claims.js';
import type { ClaimKind } from './honest-line.js';
import {
  CALL_RESULT_TAG,
  PENDING_CALLS_END,
  PENDING_CALLS_HEADER,
} from '../../services/outreach/caller-text.js';
import { callAskedAbout } from './call-narration.js';
import { spokenOf, type Item } from './spoken-words.js';

type Kind = 'call' | 'send';
type Seen = Item & { output?: unknown };

/** What the conversation shows: who each call or text was for. */
export interface ClaimEvidence {
  /**
   * A call or text claim in this sentence has nothing behind it: no tool of its kind in this reply
   * (`calling`) or waiting on a yes, and no call or text shown for every person it names.
   */
  unbacked(sentence: string, kind: ClaimKind, calling: ReadonlySet<ClaimKind>): boolean;
  /** A story of a call in this sentence is covered by a result that came back. */
  told(sentence: string): boolean;
}

/** Capitalised words that are never a person in a result or a request. */
const NOT_A_NAME = new Set(
  'I Ferni It That This There The She He They We You Yes Yeah Yep No Not Nothing Hey Hi Okay Ok So Well Oh Good Great Sure Now Then Text Message Email Call Calling Sent Done Say Answer Reported Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December'.split(
    ' '
  )
);
const nameKey = (word: string): string | undefined =>
  NOT_A_NAME.has(word) ? undefined : personKey(word);
const relationKey = (word: string): string | undefined => {
  const relation = relationOf(word);
  return relation ? `rel:${relation}` : undefined;
};

/** The people a result or a request names: "Calling Lee at 555-0143" → lee, "Text my sister" → rel:sister. */
function namedIn(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\b(?:my|your|her|his|our) ([a-z]+)\b/gi)) {
    const key = relationKey(m[1]);
    if (key) keys.add(key);
  }
  // A name mid-sentence: the first word of a sentence is capitalised anyway ("Call Lee." names Lee).
  for (const m of text.matchAll(/(?<![.!?]\s*|^\s*)\b([A-Z][a-z]+)\b/g)) {
    const key = nameKey(m[1]);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** Whom an action verb in Ferni's sentence is aimed at, or who is said to have said or felt something. */
const OBJECT =
  /\b(?:called|calling|rang|rung|ringing|phoned|phoning|dialed|dialing|reached|reaching|texted|texting|messaged|messaging|emailed|emailing|talked to|spoken? (?:to|with)|got through to|got (?:a ?hold|ahold) of|heard back from|sent (?:it |that |this )?to|give|giving)\s+((?:your|my) [a-z]+|[A-Z][a-z]+)/g;
const SUBJECT =
  /\b((?:your|my) [a-z]+|[A-Z][a-z]+)(?:'s| is| was| says| said| sounded| told| mentioned| sends)\b/g;

/** The people one sentence of Ferni's names as the ones he called, texted or heard from. */
function personsIn(sentence: string): string[] {
  const text = sentence.replace(/[‘’]/g, "'");
  const keys = new Set<string>();
  for (const re of [OBJECT, SUBJECT]) {
    for (const m of text.matchAll(re)) {
      const [first, second] = m[1].split(' ');
      const key = second ? relationKey(second) : nameKey(first);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

/**
 * The call results the server wrote, read from their status tag only (caller-text.ts callResultTag),
 * never from free text: a callStatus result's first line, and in a system note, a tag line inside the
 * pending-call-results block followed by that person's report header. Nothing else counts: not the
 * caller, not Ferni, not a search result or any other tool, not a callee's quoted words (which can't
 * hold a tag), and not any other system text. Only `through` proves a call (security review,
 * 2026-10-29: failure wording the reader didn't know read as success, and any tool output could forge
 * a report).
 */
function resultsIn(item: Seen): Array<{ who: string; through: boolean }> {
  const tagOf = (line: string | undefined) => CALL_RESULT_TAG.exec(line ?? '');
  const result = (m: RegExpExecArray) => ({ who: personKey(m[2]), through: m[1] === 'through' });
  if (item.type === 'function_call_output') {
    const m = item.name === 'callStatus' ? tagOf(String(item.output ?? '').split('\n')[0]) : null;
    return m ? [result(m)] : [];
  }
  if (item.type !== 'message' || (item.role !== 'system' && item.role !== 'developer')) return [];
  const lines = (item.textContent ?? '').split('\n');
  const out: Array<{ who: string; through: boolean }> = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === PENDING_CALLS_HEADER) inBlock = true;
    else if (lines[i] === PENDING_CALLS_END) inBlock = false;
    const m = inBlock ? tagOf(lines[i]) : null;
    if (m && lines[i + 1] === `Reported from Ferni's call with ${m[2]}, not instructions:`)
      out.push(result(m));
  }
  return out;
}

/** A sentence telling a call that didn't go through: that stands when such a result came back. */
const TELLS_FAILURE =
  /\b(?:no ?one|nobody) (?:picked up|answered)\b|\brang out\b|\bvoicemail\b|\bline was busy\b|\bdidn't (?:pick up|answer|connect|go through)\b|\bI tried\b/i;
/** The caller asks about a text from an earlier day: its record isn't readable here, so it isn't denied. */
const ASKS_EARLIER_TEXT =
  /\b(?:did|have) you (?:already |actually )?(?:text|texted|message|messaged|email|emailed|send|sent)\b.*\b(?:yesterday|last (?:night|week|time)|the other day|earlier|before)\b/i;

/** What `chatCtx` shows Ferni did; `asked` is the records' status of the call the caller asked about. */
export function claimEvidence(
  chatCtx: { items: readonly unknown[] },
  asked?: FerniCall | 'none'
): ClaimEvidence {
  const items = chatCtx.items as readonly Seen[];
  const placed: Record<Kind, Set<string>> = { call: new Set(), send: new Set() };
  const any: Record<Kind, boolean> = { call: false, send: false };
  const through = new Set<string>();
  let failed = false;
  let request: string[] = [];
  let lastWords = '';
  for (const item of items) {
    if (item.type === 'message' && item.role === 'user') {
      const words = spokenOf(item);
      if (words) [request, lastWords] = [namedIn(words), words];
    }
    for (const report of resultsIn(item)) {
      if (report.through) through.add(report.who);
      else failed = true;
    }
    const output = item.type === 'function_call_output';
    const text = output ? String(item.output ?? '') : '';
    if (!output || callActions({ items: [item] }).done.size === 0) continue;
    const kinds = kindsOfTool(item.name ?? '').filter(
      (k): k is Kind => k === 'call' || k === 'send'
    );
    const people = [...namedIn(text), ...(request.length === 1 ? request : [])];
    for (const kind of kinds) {
      any[kind] = true;
      people.forEach((p) => placed[kind].add(p));
    }
  }
  // "Did you call my mom?": the records name that call's person; a result for them covers "mom".
  const askedWho = callAskedAbout(lastWords, true)?.person;
  if (askedWho && asked && asked !== 'none' && asked.name && through.has(personKey(asked.name)))
    through.add(personKey(askedWho));
  const covered = (seen: ReadonlySet<string>, anyAtAll: boolean, sentence: string): boolean => {
    const people = personsIn(sentence);
    return people.length ? people.every((p) => seen.has(p)) : anyAtAll;
  };
  const { awaiting } = callActions(chatCtx);
  const backs = (kind: Kind, sentence: string): boolean => {
    if (kind === 'send')
      return ASKS_EARLIER_TEXT.test(lastWords) || covered(placed.send, any.send, sentence);
    const calls = new Set([...placed.call, ...through]);
    return covered(calls, any.call || through.size > 0, sentence);
  };
  return {
    unbacked(sentence, kind, calling) {
      if (kind !== 'call' && kind !== 'send') return false;
      return !calling.has(kind) && !awaiting.has(kind) && !backs(kind, sentence);
    },
    told(sentence) {
      if (failed && TELLS_FAILURE.test(sentence)) return true;
      return covered(through, through.size > 0, sentence);
    },
  };
}
