/**
 * Who a fact is about, so a correction replaces only a fact about the same person
 * (replace-remembered.ts). Shared words alone are not enough: "my sister lives in
 * Boston" shares every word with "Sam | lives in = Boston" when Sam is the brother.
 *
 * Built on the one person key (domain/person-key.ts): a relation is "rel:<relation>"
 * ("Mom's" → rel:mother), a name is its normalised form. Read from the start of the
 * text, the way a fact names its subject first:
 * - "my", "our", "the", "a" are skipped;
 * - a relation word decides ("my son's allergy" → rel:son), with a name right after it
 *   ("my sister Dana") as a second key; one relation owning another ("my sister's
 *   husband") is unclear;
 * - a name decides: a capitalised word, a possessive ("dana's"), or a name already on
 *   file for this caller;
 * - "I", "me", "user": the caller;
 * - "he", "she", "they", "her"... with no relation after them: unclear;
 * - any other word first ("works as a nurse"): the caller, since nothing else is named.
 *
 * @module memory/dynamic/fact-subject
 */
import { normalizeName, personKey, relationOf } from '../domain/person-key.js';

export type FactSubject =
  { kind: 'owner' } | { kind: 'person'; keys: ReadonlySet<string> } | { kind: 'unclear' };

const OWNER: FactSubject = { kind: 'owner' };
const UNCLEAR: FactSubject = { kind: 'unclear' };
const SKIP = new Set(['my', 'our', 'the', 'a', 'an']);
const SELF = new Set(['i', 'me', 'myself', 'user', 'caller', 'speaker', 'you']);
const OTHER = new Set(['he', 'she', 'him', 'his', 'her', 'hers', 'they', 'them', 'their', 'theirs']); // prettier-ignore
const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

const bare = (w: string): string => w.toLowerCase().replace(/[’']s?$/u, '');
const possessive = (w: string): boolean => /[’']s?$/u.test(w);

/** The relation the words at `i` start (three, two or one of them), and how many it took. */
function relationAt(words: readonly string[], i: number): { rel: string; len: number } | null {
  for (const len of [3, 2, 1]) {
    if (i + len > words.length) continue;
    const rel = relationOf(words.slice(i, i + len).join(' '));
    if (rel) return { rel, len };
  }
  return null;
}

/** Who `text` is about. `knownNames`: the caller's people already on file, normalised. */
export function subjectOfText(text: string, knownNames: ReadonlySet<string>): FactSubject {
  const words = text.match(WORD) ?? [];
  const isName = (w: string): boolean =>
    /^\p{Lu}/u.test(w) || possessive(w) || knownNames.has(normalizeName(bare(w)));
  for (let i = 0; i < words.length; i++) {
    const w = bare(words[i]);
    if (SKIP.has(w)) continue;
    const relation = relationAt(words, i);
    if (relation) {
      const end = i + relation.len - 1;
      const next = words[end + 1];
      // "my sister's husband": whose fact it is turns on reading the chain right
      if (possessive(words[end]) && next && relationAt(words, end + 1)) return UNCLEAR;
      const keys = new Set([`rel:${relation.rel}`]);
      if (next && /^\p{Lu}/u.test(next) && !relationAt(words, end + 1)) {
        keys.add(normalizeName(bare(next)));
      }
      return { kind: 'person', keys };
    }
    if (SELF.has(w)) return OWNER;
    if (OTHER.has(w)) {
      if (words[i + 1] && relationAt(words, i + 1)) continue; // "her sister": the relation decides
      return UNCLEAR;
    }
    if (isName(words[i])) return { kind: 'person', keys: new Set([normalizeName(bare(words[i]))]) };
    return OWNER; // "works as a nurse": nobody else is named
  }
  return OWNER;
}

/**
 * Who a stored fact is about, as memory-control shows it: 'you' is the caller, unless the
 * fact is one they asked Ferni to remember, whose own words name its subject; any other
 * subject is that person, under each relation the caller's facts give them.
 */
export function subjectOfFact(
  fact: { subject: string; detail: string },
  relationsOf: ReadonlyMap<string, ReadonlySet<string>>,
  knownNames: ReadonlySet<string>
): FactSubject {
  if (fact.subject === 'you') {
    const asked = /^asked to remember:\s*/i.exec(fact.detail);
    return asked ? subjectOfText(fact.detail.slice(asked[0].length), knownNames) : OWNER;
  }
  const key = personKey(fact.subject);
  return { kind: 'person', keys: new Set([key, ...(relationsOf.get(key) ?? [])]) };
}

/** Same person: both the caller, or one key in common. Unclear is never the same. */
export function sameSubject(a: FactSubject, b: FactSubject): boolean {
  if (a.kind === 'owner' || b.kind === 'owner') return a.kind === b.kind;
  if (a.kind === 'unclear' || b.kind === 'unclear') return false;
  return [...a.keys].some((k) => b.keys.has(k));
}

/** Each person's relations, from the caller's "relation: brother" facts ("Sam" → rel:brother). */
export function relationsFrom(
  facts: ReadonlyArray<{ subject: string; detail: string }>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of facts) {
    const m = /^relation(?:ship)?:\s*(.+)$/i.exec(f.detail);
    const rel = m && f.subject !== 'you' ? relationOf(m[1]) : undefined;
    if (!rel) continue;
    const key = personKey(f.subject);
    out.set(key, (out.get(key) ?? new Set()).add(`rel:${rel}`));
  }
  return out;
}
