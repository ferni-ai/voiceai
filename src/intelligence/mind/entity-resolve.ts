/**
 * Entity resolution for the between-calls mind (design 2026-10-25, section 1):
 * the people a caller mentions, spread over many stores, become one entity each.
 *
 * Prod (memory audit 2026-10-25): 977 dynamic_entities docs for 300 names; 360 of
 * them were the extractor's words for the caller or for Ferni; "mom" and "mother"
 * were separate people; "Who" was stored as a person; people sat in 6 stores.
 *
 * Rules, in order:
 * 1. normalizeName (case, accents, "my", possessive "'s").
 * 2. Relation words map to one key: mom = mother = mum → "mother".
 * 3. The caller's tokens (user, speaker, caller, I, me) fold into `self`.
 * 4. Ferni, teammates named alone, Ferni's role labels and meta words ("Who") drop.
 * 5. Possible speech-to-text variants (same first sound, close spelling) are
 *    PROPOSALS, never merges. So is a relation word with more than one candidate.
 * 6. Never merge or propose two names heard in the same call, or two stated relations
 *    that differ.
 *
 * Pure and deterministic: no I/O, no clock unless `now` is passed, and the same
 * records in any order give the same entities, ids and proposals. No caller: MIND_BUILD
 * (off) will gate the job that calls it.
 *
 * @module intelligence/mind/entity-resolve
 */
import { createHash } from 'node:crypto';
import { FERNI_HEARD_AS, TEAM_FIRST_NAMES } from '../../utils/teammate-talk.js';
import type { EntityKind, MergeLogEntry, MergeProposal, WorldEntity } from './types.js';

/** One name as some store holds it. */
export interface RawEntityRecord {
  readonly name: string;
  readonly store: string;
  readonly sessionId?: string;
  /** The stated relation in the store's words ("sister of speaker"). */
  readonly relation?: string;
  readonly factId?: string;
  readonly kind?: Exclude<EntityKind, 'self'>;
  /** ISO time it was said. */
  readonly at?: string;
}

export type DropReason = 'meta' | 'persona' | 'role-label' | 'empty';

export interface ResolveResult {
  readonly entities: WorldEntity[];
  readonly proposals: MergeProposal[];
  readonly dropped: Array<{ name: string; store: string; reason: DropReason }>;
  readonly stats: {
    raw: number;
    canonical: number;
    selfFolded: number;
    dropped: number;
    proposals: number;
  };
}

export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:my|our|the|his|her|their)\s+/, '');
}

const LEXICON: Record<string, string> = {};
for (const [key, words] of Object.entries({
  mother: 'mom mother mum mama mommy momma mamma ma mam',
  father: 'dad father papa daddy pa pop pops',
  sister: 'sister sis',
  brother: 'brother bro',
  wife: 'wife',
  husband: 'husband hubby',
  partner: 'partner spouse boyfriend girlfriend fiance fiancee',
  son: 'son',
  daughter: 'daughter',
  grandmother: 'grandmother grandma granny nana gran lola abuela',
  grandfather: 'grandfather grandpa granddad grandad lolo abuelo',
  aunt: 'aunt auntie aunty',
  uncle: 'uncle',
  cousin: 'cousin cuz',
  friend: 'friend bestie buddy pal',
  boss: 'boss manager supervisor',
})) {
  for (const word of words.split(' ')) LEXICON[word] = key;
}
/** A qualifier makes a different person: a stepmom is not mom, an ex-wife is not the wife. */
const QUALIFIER = /^(step|ex|god|great)(?=[a-z])/;

/** The relation key in a phrase ("my older sister", "mother-in-law", "stepmom"), or null. */
export function relationKey(text: string): string | null {
  const words = normalizeName(text).split(' ');
  const inLaw = /\bin law\b/.test(words.join(' '));
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    let prefix = ['step', 'ex', 'god', 'great'].includes(words[i - 1] ?? '')
      ? `${words[i - 1]}-`
      : '';
    const glued = QUALIFIER.exec(word);
    if (!LEXICON[word] && glued) {
      prefix = `${glued[1]}-`;
      word = word.slice(glued[1].length);
    }
    const key =
      LEXICON[word] ?? (word === 'best' && words[i + 1] === 'friend' ? 'friend' : undefined);
    if (key) return `${prefix}${key}${inLaw ? '-in-law' : ''}`;
  }
  return null;
}

/** Words around a relation word that don't make it a name: "user's mother", "best friend". */
const NOT_THE_NAME = new Set('best in law step ex god great user speaker caller'.split(' '));

/** The name itself is only a relation word ("mom", "my mum", "stepdad"), not a name. */
function relationWordKey(norm: string): string | null {
  const key = relationKey(norm);
  if (!key) return null;
  const words = norm.split(' ').filter((w) => !NOT_THE_NAME.has(w));
  return words.length === 1 ? key : null;
}

/** One mother, one father, one partner: a relation word attaches to the one named holder. */
const SINGULAR = new Set(['mother', 'father', 'wife', 'husband', 'partner']);
/** Wife, husband and partner are the same slot. */
const relGroup = (key: string): string => (key === 'wife' || key === 'husband' ? 'partner' : key);

const SELF = new Set('user speaker caller i me myself'.split(' '));
/** Ferni's role in the extractor's words: these are Ferni, never the caller (entity-hygiene.ts). */
const ROLE = new Set('assistant interlocutor listener ai bot'.split(' '));
const META = new Set(
  'who whom whose what someone somebody something anyone anybody everyone everybody nobody whoever they them he him she her it we us you person people guy unknown unnamed unspecified null none n a'.split(
    ' '
  )
);
const PERSONA_FULL = new Set([
  'maya santos',
  'peter john',
  'jordan taylor',
  'alex chen',
  'nayan patel',
]);
const FERNI = new Set<string>(['ferni', ...FERNI_HEARD_AS]);
const TEAM = new Set<string>(TEAM_FIRST_NAMES);

function dropReason(norm: string, relKey: string | null): DropReason | 'self' | null {
  if (!norm || /^[\d ]+$/.test(norm)) return 'empty';
  if (SELF.has(norm)) return 'self';
  if (ROLE.has(norm) || /\binterlocutor\b|\bconversation(?:al)? partner\b/.test(norm))
    return 'role-label';
  if (META.has(norm) || norm.split(' ').every((w) => META.has(w))) return 'meta';
  if (norm.split(' ').some((w) => FERNI.has(w))) return 'persona';
  // A teammate's name alone is Ferni's team, unless the caller relates to them ("my friend Jordan").
  if ((TEAM.has(norm) || PERSONA_FULL.has(norm)) && !relKey) return 'persona';
  return null;
}

/** The first sound class, so Shaun and Shawn, Catherine and Katherine, Aaron and Erin match. */
export function firstSound(norm: string): string {
  const w = norm.split(' ')[0] ?? '';
  const rules: Array<[RegExp, string]> = [
    [/^[aeiouy]/, 'A'],
    [/^(?:sh|sch|ps|s|z|x|c[eiy])/, 'S'],
    [/^ch[rl]/, 'K'],
    [/^ch/, 'C'],
    [/^(?:kh|k|q|c)/, 'K'],
    [/^(?:ph|f)/, 'F'],
    [/^(?:kn|gn|pn|n)/, 'N'],
    [/^(?:wr|r)/, 'R'],
    [/^wh?/, 'W'],
    [/^(?:j|g[eiy])/, 'J'],
    [/^th/, 'T'],
  ];
  for (const [re, cls] of rules) if (re.test(w)) return cls;
  return (w[0] ?? '').toUpperCase();
}

const DIGIT: Record<string, string> = {};
for (const [d, letters] of Object.entries({
  1: 'bfpv',
  2: 'cgjkqsxz',
  3: 'dt',
  4: 'l',
  5: 'mn',
  6: 'r',
})) {
  for (const l of letters) DIGIT[l] = d;
}
/** In-house phonetic key (Soundex body after the first-sound class), per word. No dependency. */
export function phoneticKey(norm: string): string {
  return norm
    .split(' ')
    .map((word) => {
      let code = '';
      let prev = DIGIT[word[0]] ?? '';
      for (const ch of word.slice(1)) {
        if (ch === 'h' || ch === 'w') continue;
        const d = DIGIT[ch] ?? '';
        if (d && d !== prev) code += d;
        prev = d;
      }
      return firstSound(word) + code.padEnd(3, '0').slice(0, 3);
    })
    .join(' ');
}

/** Optimal-string-alignment edit distance. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

interface Rec extends RawEntityRecord {
  readonly norm: string;
  readonly relKey: string | null;
}

interface Group {
  key: string;
  /** The name, or the relation key for a relation word with no named holder. */
  norm: string;
  named: boolean;
  relKey: string | null;
  recs: Rec[];
}

/** Why two groups may never be one person, or null. Hard rules: never merged, never proposed. */
export function noMergeReason(
  a: Pick<Group, 'norm' | 'named' | 'relKey' | 'recs'>,
  b: Pick<Group, 'norm' | 'named' | 'relKey' | 'recs'>
): 'same-call' | 'different-relation' | null {
  if (a.relKey !== null && b.relKey !== null && relGroup(a.relKey) !== relGroup(b.relKey)) {
    return 'different-relation';
  }
  if (a.named && b.named && a.norm !== b.norm) {
    const calls = new Set(uniq(a.recs.map((r) => r.sessionId)));
    if (b.recs.some((r) => r.sessionId !== undefined && calls.has(r.sessionId))) return 'same-call';
  }
  return null;
}

/** Plain code-unit order: the same on every machine, unlike localeCompare. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const idOf = (key: string): string =>
  `ent_${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
const sortKey = (r: RawEntityRecord): string =>
  [r.name, r.store, r.sessionId, r.relation, r.factId, r.kind, r.at]
    .map((v) => v ?? '')
    .join('\u0001');
const uniq = (xs: Array<string | undefined>): string[] =>
  [...new Set(xs.filter((x): x is string => !!x))].sort();

interface Sorted {
  self: Rec[];
  named: Map<string, Rec[]>;
  relWords: Map<string, Rec[]>;
  dropped: ResolveResult['dropped'];
}

/** Self, dropped, a relation word ("mom"), or a name. */
function classify(records: readonly RawEntityRecord[]): Sorted {
  const out: Sorted = { self: [], named: new Map(), relWords: new Map(), dropped: [] };
  const recs = [...records].sort((a, b) => cmp(sortKey(a), sortKey(b)));
  for (const raw of recs) {
    const norm = normalizeName(raw.name);
    const relKey = raw.relation !== undefined ? relationKey(raw.relation) : null;
    const why = dropReason(norm, relKey);
    if (why === 'self') out.self.push({ ...raw, norm, relKey });
    else if (why !== null) out.dropped.push({ name: raw.name, store: raw.store, reason: why });
    else {
      const rw = relationWordKey(norm);
      const [into, k] = rw !== null ? [out.relWords, rw] : [out.named, norm];
      into.set(k, [...(into.get(k) ?? []), { ...raw, norm, relKey: rw ?? relKey }]);
    }
  }
  return out;
}

/** Same name: one group per stated relation; unstated joins the only one, else stays apart. */
function groupNames(named: Map<string, Rec[]>, proposals: MergeProposal[]): Group[] {
  const groups: Group[] = [];
  for (const [norm, list] of named) {
    const byRel = new Map<string, Rec[]>();
    for (const r of list) {
      if (r.relKey === null) continue;
      const slot = relGroup(r.relKey);
      byRel.set(slot, [...(byRel.get(slot) ?? []), r]);
    }
    const bare = list.filter((r) => r.relKey === null);
    const keyed: Group[] = [...byRel].map(([slot, rs]) => ({
      key: `name:${norm}|${slot}`,
      norm,
      named: true,
      relKey: rs[0].relKey,
      recs: rs,
    }));
    if (keyed.length === 1) keyed[0].recs.push(...bare);
    else if (bare.length > 0) {
      const key = `name:${norm}|${keyed.length > 0 ? '?' : ''}`;
      const loose: Group = { key, norm, named: true, relKey: null, recs: bare };
      for (const k of keyed) {
        proposals.push(proposal(loose, k, 'relation-ambiguous', 'same name, several relations'));
      }
      groups.push(loose);
    }
    groups.push(...keyed);
  }
  return groups;
}

/** A relation word joins the one named holder of a singular relation, else stands alone. */
function placeRelationWords(
  relWords: Map<string, Rec[]>,
  named: Group[],
  proposals: MergeProposal[]
): Group[] {
  const alone: Group[] = [];
  for (const [key, list] of relWords) {
    const holders = named.filter((g) => g.relKey !== null && relGroup(g.relKey) === relGroup(key));
    if (SINGULAR.has(key) && holders.length === 1) {
      holders[0].recs.push(...list);
      continue;
    }
    const group: Group = { key: `rel:${key}`, norm: key, named: false, relKey: key, recs: list };
    for (const h of holders) {
      const why = `relation word, ${holders.length} named holders`;
      proposals.push(proposal(group, h, 'relation-ambiguous', why));
    }
    alone.push(group);
  }
  return alone;
}

/** Possible speech-to-text variants: proposals only, and never past a hard rule. */
function sttProposals(people: Group[]): MergeProposal[] {
  const out: MergeProposal[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const [a, b] = [people[i], people[j]];
      if (a.norm === b.norm || noMergeReason(a, b) !== null) continue;
      const dist = editDistance(a.norm, b.norm);
      const close = dist <= 2 && Math.abs(a.norm.length - b.norm.length) <= 2;
      if (close && phoneticKey(a.norm) === phoneticKey(b.norm)) {
        const why = `same first sound and phonetic key, edit distance ${dist}`;
        out.push(proposal(a, b, 'stt-variant', why));
      }
    }
  }
  return out;
}

/** Raw records from many stores → canonical entities, merge proposals and what was dropped. */
export function resolveEntities(
  records: readonly RawEntityRecord[],
  opts: { now?: string } = {}
): ResolveResult {
  const { self, named, relWords, dropped } = classify(records);
  const proposals: MergeProposal[] = [];
  const names = groupNames(named, proposals);
  const groups = [...names, ...placeRelationWords(relWords, names, proposals)];
  proposals.push(...sttProposals(names));

  const entities = groups.map((g) => toEntity(g, opts.now));
  if (self.length > 0) entities.push(selfEntity(self, opts.now));
  entities.sort((a, b) => cmp(a.id, b.id));
  proposals.sort((x, y) => cmp(x.a, y.a) || cmp(x.b, y.b));
  return {
    entities,
    proposals,
    dropped,
    stats: {
      raw: records.length,
      canonical: entities.length,
      selfFolded: self.length,
      dropped: dropped.length,
      proposals: proposals.length,
    },
  };
}

function proposal(
  a: Group,
  b: Group,
  reason: MergeProposal['reason'],
  evidence: string
): MergeProposal {
  const [x, y] = [idOf(a.key), idOf(b.key)].sort();
  return { a: x, b: y, reason, evidence };
}

/** One entry per folded name; a name seen once in one store folded nothing. */
function logEntries(
  recs: Rec[],
  rule: (from: string, rs: Rec[]) => MergeLogEntry['rule']
): MergeLogEntry[] {
  const by = new Map<string, Rec[]>();
  for (const r of recs) by.set(r.norm, [...(by.get(r.norm) ?? []), r]);
  return [...by]
    .map(([from, rs]) => ({
      rule: rule(from, rs),
      from,
      records: rs.length,
      stores: uniq(rs.map((r) => r.store)),
      factIds: uniq(rs.map((r) => r.factId)),
      by: 'code' as const,
    }))
    .filter((e) => e.records > 1 || e.rule !== 'same-name');
}

function mentions(recs: Rec[], now?: string): Pick<WorldEntity, 'mentions90d' | 'lastMentionedAt'> {
  const times = recs
    .map((r) => r.at)
    .filter((t): t is string => !!t)
    .sort();
  const floor = now ? Date.parse(now) - 90 * 86_400_000 : -Infinity;
  return {
    mentions90d: now ? times.filter((t) => Date.parse(t) >= floor).length : recs.length,
    lastMentionedAt: times.at(-1) ?? null,
  };
}

const blank = {
  mergedInto: null,
  sensitive: false,
  forgottenAt: null,
  salience: 0,
  current: [],
} as const;

function toEntity(g: Group, now?: string): WorldEntity {
  const counts = new Map<string, number>();
  for (const r of g.recs.filter((x) => x.norm === g.norm))
    counts.set(r.name.trim(), (counts.get(r.name.trim()) ?? 0) + 1);
  const canonicalName = g.named
    ? [...counts].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0]
    : g.norm;
  const kinds = g.recs.map((r) => r.kind ?? 'person');
  const kind = (['person', 'place', 'org', 'pet'] as const).reduce((best, k) =>
    kinds.filter((x) => x === k).length > kinds.filter((x) => x === best).length ? k : best
  );
  const relRec = g.recs.find(
    (r): r is Rec & { relKey: string } => r.relKey !== null && (!g.named || r.norm === g.norm)
  );
  const aliasNorms = uniq(g.recs.map((r) => r.norm)).filter((n) => n !== g.norm);
  return {
    id: idOf(g.key),
    kind,
    canonicalName,
    aliases: aliasNorms.map((norm) => ({
      norm,
      kind: 'relation-word' as const,
      firstFactId: uniq(g.recs.filter((r) => r.norm === norm).map((r) => r.factId))[0] ?? null,
    })),
    relation: relRec
      ? {
          text: (relRec.relation ?? relRec.name).trim(),
          key: relRec.relKey,
          factId: relRec.factId ?? null,
        }
      : null,
    mergeLog: logEntries(g.recs, (from, rs) =>
      !g.named || from !== g.norm
        ? 'relation-word'
        : uniq(rs.map((r) => r.store)).length > 1
          ? 'store-dup'
          : 'same-name'
    ),
    ...mentions(g.recs, now),
    ...blank,
  };
}

function selfEntity(recs: Rec[], now?: string): WorldEntity {
  return {
    id: 'self',
    kind: 'self',
    canonicalName: 'self',
    aliases: [],
    relation: null,
    mergeLog: logEntries(recs, () => 'self-token'),
    ...mentions(recs, now),
    ...blank,
  };
}
