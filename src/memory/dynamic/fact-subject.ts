/**
 * Who a fact is about, so a correction replaces only a fact about the same person
 * (replace-remembered.ts). Fails closed: a subject is read only when the words prove
 * it, and anything else is unclear, which writes nothing. Shared words alone are not
 * enough: "my sister lives in Boston" shares every word with "Sam | lives in = Boston"
 * when Sam is the brother, and "rose to manager" is not about Rose.
 *
 * Built on the one person key (domain/person-key.ts). A request is read from its
 * first word:
 * - the caller: "I", "me", "my <thing>", "user", "the user's ...". Only when no other
 *   person or relation is named anywhere in it;
 * - a relation: "Mom ...", "my sister ...", "user's son ...", with a capitalised name right
 *   after it ("my sister Dana") as its name;
 * - a name: a possessive at the start ("Dana's ..."), or a name on file with its
 *   relation beside it ("Dana, my sister, ...");
 * - anything else ("works as", "Has two kids", "dana lives", "mi hermana", "she", "their
 *   dog") is unclear. Lowercase words are never names.
 * After the first word, a relation owned by someone ("my", "our", "'s") or a name (a
 * capitalised name on file, or a capitalised possessive) is another person: a second
 * one makes the request unclear. A capitalised word that is neither ("Denver") is not
 * a person.
 *
 * @module memory/dynamic/fact-subject
 */
import { normalizeName, relationOf } from '../domain/person-key.js';
import { contentWords } from '../recall/session-recall.js';

export type FactSubject =
  /** `thing`: what of theirs it is about ("my job" → "job"), when the request says. */
  | { kind: 'owner'; thing?: string }
  /** `claimed`: relations any source gave this name; they can rule a match out, never in. */
  | { kind: 'person'; relation?: string; name?: string; claimed?: ReadonlySet<string> }
  | { kind: 'unclear' };

const UNCLEAR: FactSubject = { kind: 'unclear' };
const SELF = new Set(['i', "i'm", "i've", "i'd", "i'll", 'me', 'myself', 'mine', 'user', 'caller']);
const WITH_ME = new Set(['i', 'me', 'we', 'us', 'myself']);
const OWN = new Set(['my', 'our', 'user', 'caller']); // "my sister", "user's son"
const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

const lower = (w: string): string => w.toLowerCase().replace(/’/g, "'");
const bare = (w: string): string => lower(w).replace(/'s?$/, '');
const possessive = (w: string): boolean => /['’]s?$/u.test(w) && !/^i'/i.test(w);
const capitalised = (w: string): boolean => /^\p{Lu}/u.test(w);

/** The relation the words at `i` start (three, two or one of them), and how many it took. */
function relationAt(words: readonly string[], i: number): { rel: string; len: number } | null {
  for (const len of [3, 2, 1]) {
    if (i + len > words.length) continue;
    const rel = relationOf(words.slice(i, i + len).join(' '));
    if (rel) return { rel, len };
  }
  return null;
}

/** "my sister" or "sister" at `i`: its relation, and the index after it. */
function appositive(words: readonly string[], i: number): { rel: string; end: number } | null {
  const owned = OWN.has(bare(words[i] ?? '')) ? relationAt(words, i + 1) : null;
  if (owned) return { rel: owned.rel, end: i + 1 + owned.len };
  const bareRel = relationAt(words, i);
  return bareRel ? { rel: bareRel.rel, end: i + bareRel.len } : null;
}

/** A person after the first word: an owned relation, or a capitalised known or possessive name. */
function otherPerson(
  words: readonly string[],
  i: number,
  known: ReadonlySet<string>
): string | null {
  const prev = words[i - 1];
  const owned = prev !== undefined && (OWN.has(bare(prev)) || possessive(prev));
  const relation = relationAt(words, i);
  if (relation && owned) return `rel:${relation.rel}`;
  const w = words[i];
  if (capitalised(w) && (known.has(normalizeName(bare(w))) || possessive(w))) {
    return normalizeName(bare(w));
  }
  return null;
}

/** Who `text` is about. `known`: the caller's people already on file, normalised. */
export function subjectOfText(text: string, known: ReadonlySet<string>): FactSubject {
  const words = text.match(WORD) ?? [];
  // "The user has ...": the article is not the subject
  const i = lower(words[0] ?? '') === 'the' && OWN.has(bare(words[1] ?? '')) ? 1 : 0;
  const first = words[i];
  if (!first) return UNCLEAR;
  let subject: FactSubject;
  let next = i + 1;
  const head = bare(first); // "user's" → "user", "My" → "my"
  const leading = relationAt(words, i); // "Mom ...", "my sister ..." (person-key drops "my")
  const owned = OWN.has(head) ? relationAt(words, i + 1) : null; // "user's son ..."
  const r = leading ?? owned;
  if (r) {
    subject = { kind: 'person', relation: r.rel };
    next = leading ? i + r.len : i + 1 + r.len;
  } else if (SELF.has(lower(first)) || OWN.has(head)) {
    // "my job ...", "user's favorite color ...": what of theirs it is about
    const thing = (head === 'my' || head === 'our' || possessive(first)) && words[i + 1];
    // "my ex", "my bf", "my 妹妹": a thing no word of which can be checked is not proven theirs
    if (thing && contentWords(thing).size === 0) return UNCLEAR;
    subject = { kind: 'owner', ...(thing && { thing: bare(thing) }) };
  } else if (capitalised(first) && possessive(first)) {
    subject = { kind: 'person', name: normalizeName(head) }; // "Dana's birthday ..."
  } else if (capitalised(first) && known.has(normalizeName(head)) && appositive(words, i + 1)) {
    // "Dana, my sister, ...": a name on file, its relation right beside it
    const a = appositive(words, i + 1)!;
    subject = { kind: 'person', name: normalizeName(head), relation: a.rel };
    next = a.end;
  } else {
    return UNCLEAR; // "works as", "Has two kids", "dana lives", "mi hermana", "she"
  }
  // A capitalised name right after the relation is its name: "my sister Dana"
  if (subject.kind === 'person' && !subject.name && words[next] && capitalised(words[next])) {
    if (!relationAt(words, next)) {
      subject = { ...subject, name: normalizeName(bare(words[next])) };
      next++;
    }
  }
  const own = subject.kind === 'person' ? subject.name : undefined;
  for (let j = next; j < words.length; j++) {
    // "my sister Dana and I ...": the caller and someone
    if (subject.kind === 'person' && WITH_ME.has(lower(words[j]))) return UNCLEAR;
    const other = otherPerson(words, j, known);
    if (other && other !== own) return UNCLEAR; // the caller and someone, or two people
  }
  return subject;
}

/**
 * Who a stored fact is about, as memory-control shows it: 'you' is the caller, unless the
 * fact is one they asked Ferni to remember, whose own words name its subject; a relation
 * entity ("Mom") is that relation; any other is that name, with the relation the caller
 * themself gave it (`relations`), if any.
 */
export function subjectOfFact(
  fact: { subject: string; detail: string },
  relations: Relations,
  known: ReadonlySet<string>
): FactSubject {
  if (fact.subject === 'you') {
    const asked = /^asked to remember:\s*/i.exec(fact.detail);
    return asked ? subjectOfText(fact.detail.slice(asked[0].length), known) : { kind: 'owner' };
  }
  const relation = relationOf(fact.subject);
  if (relation) return { kind: 'person', relation };
  const name = normalizeName(fact.subject);
  // Two people by one name (a sister Dana and a brother Dana): a fact naming only "Dana" is either
  if (relations.conflicted.has(name)) return UNCLEAR;
  const given = relations.given.get(name);
  const claimed = relations.claimed.get(name);
  return { kind: 'person', name, ...(given && { relation: given }), ...(claimed && { claimed }) };
}

/**
 * The same person: both the caller, or people who agree on every key both have and
 * share at least one. "my brother Dana" is not the sister Dana; "my sister" is not Sam
 * unless the caller said Sam is their sister. Unclear is never the same.
 */
export function sameSubject(a: FactSubject, b: FactSubject): boolean {
  if (a.kind === 'unclear' || b.kind === 'unclear') return false;
  if (a.kind === 'owner' || b.kind === 'owner') return a.kind === b.kind;
  // An extracted "Dana is my sister" can't prove a match, but it rules out "my coworker Dana"
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    if (x.relation && y.claimed && !y.claimed.has(x.relation)) return false;
  }
  let shared = 0;
  for (const key of ['relation', 'name'] as const) {
    if (a[key] === undefined || b[key] === undefined) continue;
    if (a[key] !== b[key]) return false;
    shared++;
  }
  return shared > 0;
}

/** Sources where the caller themself said it: Ferni asked to remember, or the app. */
const OWNER_SAID = new Set(['caller_asserted', 'user-correction']);

export interface Relations {
  /** Proven: as the caller themself gave it. */
  given: ReadonlyMap<string, string>;
  /** Any source, the caller's included: only ever a reason to refuse. */
  claimed: ReadonlyMap<string, ReadonlySet<string>>;
  /** Names given two relations: more than one person may have that name. */
  conflicted: ReadonlySet<string>;
}

/**
 * Each name's relation. Proven only as the caller themself gave it: a relation fact they
 * wrote in the app, or a fact they asked Ferni to remember that names both ("my sister
 * Dana"). Extracted facts are only claims: nothing yet says who on a call said them
 * (memory v2 R1), and an errand callee's words must never decide whose fact is replaced.
 */
export function relationsFrom(
  stored: ReadonlyArray<Record<string, unknown>>,
  known: ReadonlySet<string>
): Relations {
  const given = new Map<string, string>();
  const claimed = new Map<string, Set<string>>();
  const conflict = new Set<string>();
  for (const d of stored) {
    if (typeof d.forgottenAt === 'string') continue;
    const key = String(d.key ?? '');
    let name = '';
    let relation: string | undefined;
    if (/^relation(?:ship)?$/i.test(key)) {
      name = normalizeName(String(d.entityName ?? ''));
      relation = relationOf(String(d.value ?? ''));
    } else if (key === 'asked_to_remember') {
      const s = subjectOfText(String(d.value ?? ''), known);
      if (s.kind === 'person' && s.name) [name, relation] = [s.name, s.relation];
    }
    if (!name || !relation) continue;
    claimed.set(name, (claimed.get(name) ?? new Set()).add(relation));
    if (!OWNER_SAID.has(String(d.source))) continue;
    if (given.has(name) && given.get(name) !== relation) conflict.add(name);
    given.set(name, relation);
  }
  for (const [name, rels] of claimed) if (rels.size > 1) conflict.add(name);
  for (const name of conflict) given.delete(name); // said two ways: no relation is proven
  return { given, claimed, conflicted: conflict };
}
