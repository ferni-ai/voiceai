/**
 * What Ferni did, person by person, read from the server's own records (GROUNDED_CLAIMS).
 *
 * #3037/#3056 verify: evidence read from the conversation could be forged or missed. A tag in
 * the prompt was absent from the unified "while they were away" note, never reached the chat on
 * a live report, and keyed "Rita Smith" apart from "Rita". So nothing here is read from what
 * anyone said or from a result's wording:
 * - the call records (bogle_users/{uid}/on_behalf_calls), read through call-result-capture.ts's
 *   own reader, the store every call result is written to and the openers and callStatus read:
 *   each with the contact's name, the relation the request used ("my mom") and the outcome status.
 *   Only status 'completed' is a call that got through; anything else is one that didn't;
 * - a call or text tool that ran on this call: the contact its arguments named, or the one person
 *   the caller's request named. There is no text record store, so a text is only ever backed here.
 * People are keyed the way memory keys them (memory/domain), over every name token and the relation,
 * so "Rita", "Rita Smith", "José", "Dr. Patel" and "your aunt" all meet the record they fit. A claim
 * that names no one is about the people the caller's last words named; with none named, its kind of
 * record must exist for exactly one person. Anything else fails closed: the claim is rewritten.
 *
 * @module agents/personas/claim-evidence
 */
import { personKey, relationOf } from '../../memory/domain/index.js';
import type { StoredCallResult } from '../../services/outreach/call-result-capture.js';
import { sameWord, topicWords } from '../multi-agent/caller-words.js';
import { callActions, kindsOfTool } from './action-claims.js';
import type { ClaimKind } from './honest-line.js';
import { spokenOf, type Item } from './spoken-words.js';

type Kind = 'call' | 'send';
type Seen = Item & { output?: unknown; callId?: string; args?: string };
/** One call or text Ferni made: who it was for, and how it went. */
interface Done {
  kind: Kind;
  keys: Set<string>;
  /** A stored call: whether they answered. Undefined: placed on this call, no result yet. */
  through?: boolean;
  /** What the stored result says they said, if anything. */
  report: string;
}

export interface ClaimEvidence {
  /** A call or text claim here has no tool of its kind in this reply, no yes pending, and no record for whom it names. */
  unbacked(sentence: string, kind: ClaimKind, calling: ReadonlySet<ClaimKind>): boolean;
  /** A story of a call here has a record that went that way for whom it names, and its quotes are in the record. */
  told(sentence: string): boolean;
}

const RECORDS_MS = 30 * 86_400_000;
/** How long the reply waits for the records; past it there are none, and claims fail closed. */
const READ_MS = 1200;

/** This user's recent call results from the store, or [] (not a member, slow, or unreadable). */
export async function callRecordsFor(userId: string | undefined): Promise<StoredCallResult[]> {
  if (!userId) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<StoredCallResult[]>((resolve) => {
    timer = setTimeout(() => resolve([]), READ_MS);
  });
  const read = import('../../services/outreach/call-result-capture.js')
    .then(({ getRecentCallResults }) => getRecentCallResults(userId, 20))
    .catch((): StoredCallResult[] => []);
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
}

const SKIP = new Set('my your our the his her their dr mr mrs ms miss prof'.split(' '));
/** Every key a name or relation can be met by: each name token, and the relation it names. */
function keysOf(...phrases: ReadonlyArray<string | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const phrase of phrases) {
    const relation = phrase ? relationOf(phrase) : undefined;
    if (relation) keys.add(`rel:${relation}`);
    for (const token of phrase?.split(/[^\p{L}\p{M}'’-]+/u) ?? []) {
      const word = relationOf(token);
      if (word) keys.add(`rel:${word}`);
      else if (token && !SKIP.has(token.toLowerCase())) keys.add(personKey(token));
    }
  }
  return keys;
}

const NAME = "\\p{Lu}[\\p{L}\\p{M}'’-]*(?:\\s+\\p{Lu}[\\p{L}\\p{M}'’-]*)*";
const WHO = `(?:(?:your|my)\\s+\\p{Ll}+|(?:(?:Dr|Mr|Mrs|Ms)\\.?\\s+)?${NAME})`;
const OBJECT = new RegExp(
  `\\b(?:called|calling|rang|rung|ringing|phoned|phoning|dialed|dialing|reached|reaching|texted|texting|messaged|messaging|emailed|emailing|talked to|spoken? (?:to|with)|got through to|got (?:a ?hold|ahold) of|heard back from|sent (?:it |that |this )?to|give|giving)\\s+(${WHO})`,
  'gu'
);
const AND = new RegExp(`(?:,|\\band)\\s+(${WHO})`, 'gu');
const SUBJECT = new RegExp(
  `(?:^|[^\\p{L}])(${WHO})(?:'s| is| was| says| said| sounded| told| mentioned| sends)\\b`,
  'gu'
);
/** Capitalised words that are not a person here. */
const NOT_A_NAME =
  /^(?:I|Ferni|It|That|This|There|The|She|He|They|We|You|Yes|Yeah|Yep|No|Hey|Hi|Okay|So|Well|Oh|Good|Great|Sure|Now|Then|Call|Text|Can|Could|Would|Did|Have|Has|Please|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;

/** The people one sentence names as the ones called, texted or heard from. */
function personsIn(sentence: string): Array<Set<string>> {
  const text = sentence.replace(/[‘’]/g, "'");
  const out: Array<Set<string>> = [];
  // "called Rita and Tom": the people joined to an object are objects too.
  const joined = OBJECT.test(text) ? [AND] : [];
  OBJECT.lastIndex = 0;
  for (const re of [OBJECT, SUBJECT, ...joined])
    for (const m of text.matchAll(re)) if (!NOT_A_NAME.test(m[1])) out.push(keysOf(m[1]));
  return out.filter((keys) => keys.size > 0);
}

/** The people the caller's words name: "my mom", "Rita Smith" (a sentence's first word aside). */
function namedBy(words: string): Array<Set<string>> {
  const out = [...words.matchAll(/\b(?:my|your)\s+(\p{Ll}+)/gu)]
    .map((m) => keysOf(m[1]))
    .filter((keys) => [...keys].some((k) => k.startsWith('rel:')));
  for (const m of words.matchAll(new RegExp(`(?<![.!?]\\s*|^\\s*)(${NAME})`, 'gu')))
    if (!NOT_A_NAME.test(m[1])) out.push(keysOf(m[1]));
  return out;
}

const STATUS_OK = 'completed';
/** A sentence telling a call that didn't go through. */
const TELLS_FAILURE =
  /\b(?:no ?one|nobody) (?:picked up|answered)\b|\brang out\b|\bvoicemail\b|\bline was busy\b|\bdidn't (?:pick up|answer|connect|go through)\b|\bI tried\b/i;
/** The call itself (its status backs it) and the words that frame a quote: never an invented detail. */
const CALL_WORDS = new Set(
  'call called calling picked pick answered answer reached rang ring phone talked spoke chatted earlier today yesterday ago she he they her him them his say said says tell told mention mentioned ask asked one'.split(
    ' '
  )
);
/** Words someone said or felt on the call: these must be in the record's report. */
const QUOTES = /\b(?:said|says|told|mentioned|asked|wants?|misses|sends?|sounded|seemed|loved)\b/i;

const argsOf = (raw: string | undefined): string[] => {
  try {
    const args = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return ['contact', 'contactQuery', 'contactName', 'to', 'recipient', 'name']
      .map((k) => args[k])
      .filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
};

/** What Ferni did, from `records` (callRecordsFor) and the tools that ran on this call. */
export function claimEvidence(
  chatCtx: { items: readonly unknown[] },
  records: readonly StoredCallResult[]
): ClaimEvidence {
  const now = Date.now();
  const done: Done[] = records
    .filter((r) => now - Date.parse(r.capturedAt) <= RECORDS_MS)
    .map((r) => ({
      kind: 'call',
      keys: keysOf(r.request.contactName, r.request.contactQuery, r.request.contactRelationship),
      through: r.outcome.status === STATUS_OK,
      report: [r.outcome.message, r.outcome.transcriptSummary, r.outcome.outcome].join(' '),
    }));
  const items = chatCtx.items as readonly Seen[];
  const named = new Map<string, string[]>(); // a tool call's id → the contact its arguments named
  let request: Array<Set<string>> = [];
  let lastWords = '';
  for (const item of items) {
    if (item.type === 'message' && item.role === 'user' && spokenOf(item))
      [lastWords, request] = [spokenOf(item), namedBy(spokenOf(item))];
    if (item.type === 'function_call') named.set(item.callId ?? '', argsOf(item.args));
    if (item.type !== 'function_call_output' || !callActions({ items: [item] }).done.size) continue;
    const contact = named.get(item.callId ?? '') ?? [];
    // Whom the tool's arguments named, and the one person the request named ("Text my sister" + "Jo").
    const keys = new Set([...keysOf(...contact), ...(request.length === 1 ? request[0] : [])]);
    for (const kind of kindsOfTool(item.name ?? ''))
      if (kind === 'call' || kind === 'send') done.push({ kind, keys, report: '' });
  }
  const { awaiting } = callActions(chatCtx);
  const meets = (who: Set<string>, d: Done) => [...who].some((k) => d.keys.has(k));
  /** The records `ok` keeps for whom this sentence is about, or null when they don't cover them. */
  const covering = (sentence: string, ok: (d: Done) => boolean): Done[] | null => {
    const good = done.filter(ok);
    const who = personsIn(sentence);
    const targets = who.length ? who : namedBy(lastWords);
    if (targets.length === 0) {
      // Nobody named anywhere: only when every such record is the same one person.
      const one = good.length > 0 && good.every((d) => meets(good[0].keys, d) || d.keys.size === 0);
      return one ? good : null;
    }
    const hits = targets.map((t) => good.filter((d) => meets(t, d)));
    return hits.every((h) => h.length > 0) ? hits.flat() : null;
  };
  /** Each word a quote is about is one the record's report has. */
  const inReport = (sentence: string, hits: Done[]): boolean => {
    if (!QUOTES.test(sentence)) return true;
    const report = topicWords(hits.map((d) => d.report).join(' '));
    const names = new Set(hits.flatMap((d) => [...d.keys]));
    return topicWords(sentence)
      .filter((w) => !names.has(personKey(w)) && !CALL_WORDS.has(w.replace(/'\w+$/, '')))
      .every((w) => report.some((r) => sameWord(w, r)));
  };
  return {
    unbacked(sentence, kind, calling) {
      if (kind !== 'call' && kind !== 'send') return false;
      if (calling.has(kind) || awaiting.has(kind)) return false;
      // Any call of theirs backs "I called her"; how it went is a story (told).
      return covering(sentence, (d) => d.kind === kind) === null;
    },
    told(sentence) {
      if (TELLS_FAILURE.test(sentence))
        return covering(sentence, (d) => d.through === false) !== null;
      const hits = covering(sentence, (d) => d.through === true);
      return hits !== null && inReport(sentence, hits);
    },
  };
}
