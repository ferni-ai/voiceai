import { describe, expect, it } from 'vitest';
import {
  editDistance,
  firstSound,
  normalizeName,
  phoneticKey,
  relationKey,
  resolveEntities,
  type RawEntityRecord,
} from '../entity-resolve.js';

// The shape of the memory audit (2026-10-25) with invented names: the extractor's words
// for the caller and for Ferni, a meta "Who", teammates, mom/mother/mum across stores, a
// store duplicate, a speech-to-text pair, and same-name people told apart.
const r = (name: string, store: string, extra: Partial<RawEntityRecord> = {}): RawEntityRecord => ({
  name,
  store,
  ...extra,
});
const FIXTURE: RawEntityRecord[] = [
  // the caller (6)
  r('User', 'dynamic_entities', { sessionId: 's1' }),
  r('speaker', 'dynamic_entities', { sessionId: 's1' }),
  r('the user', 'shared_memories'),
  r('Caller', 'relationship_nodes'),
  r('me', 'dynamic_entities', { sessionId: 's2' }),
  r('I', 'dynamic_entities', { sessionId: 's3' }),
  // Ferni's role in the extractor's words (3)
  r('Assistant', 'dynamic_entities', { sessionId: 's1' }),
  r("User's interlocutor", 'dynamic_entities', { sessionId: 's1' }),
  r('listener', 'dynamic_entities', { sessionId: 's2' }),
  // meta and junk (3)
  r('Who', 'shared_memories'),
  r('someone', 'dynamic_entities', { sessionId: 's4' }),
  r('9', 'dynamic_entities', { sessionId: 's4' }),
  // Ferni and a teammate alone (3), and a caller's own friend who shares a teammate's name (1)
  r('Ferni', 'dynamic_entities', { sessionId: 's1' }),
  r('Fernie', 'relationship_network'),
  r('Maya', 'dynamic_entities', { sessionId: 's2' }),
  r('Jordan', 'user_contacts', { relation: 'friend', sessionId: 's5' }),
  // one mother, four ways (4), and a stepmother who is someone else (1)
  r('Mom', 'dynamic_entities', { sessionId: 's1', factId: 'f1', at: '2026-10-01T10:00:00Z' }),
  r('mother', 'dynamic_entities', { sessionId: 's2', factId: 'f2', at: '2026-10-10T10:00:00Z' }),
  r('my mum', 'relationship_network', { sessionId: 's3' }),
  r('Rosalind', 'familyMembers', {
    relation: 'mother of user',
    factId: 'f3',
    at: '2026-05-01T10:00:00Z',
  }),
  r('stepmom', 'dynamic_entities', { sessionId: 's9' }),
  // one person in three stores (3)
  r('Teodoro', 'dynamic_entities', { sessionId: 's2', factId: 'f4' }),
  r('Teodoro', 'promoted_entities'),
  r('teodoro', 'relationship_network'),
  // a possible speech-to-text pair from different calls (2): a proposal, not a merge
  r('Keelan', 'dynamic_entities', { sessionId: 's4' }),
  r('Kealan', 'dynamic_entities', { sessionId: 's6' }),
  // the same pair shape heard in ONE call (2): two people
  r('Dorian', 'dynamic_entities', { sessionId: 's7' }),
  r('Dorien', 'dynamic_entities', { sessionId: 's7' }),
  // same first name, two people, one call (2)
  r('Priya', 'dynamic_entities', { sessionId: 's8', relation: 'cousin' }),
  r('Priya', 'dynamic_entities', { sessionId: 's8', relation: 'boss' }),
  // same name, different stated relations across calls (2), and once with none (1)
  r('Nico', 'dynamic_entities', { sessionId: 's2', relation: 'brother' }),
  r('Nico', 'relationship_network', { sessionId: 's9', relation: 'friend' }),
  r('Nico', 'dynamic_entities', { sessionId: 's10' }),
];

const named = (res: ReturnType<typeof resolveEntities>, name: string) =>
  res.entities.filter((e) => e.canonicalName.toLowerCase() === name.toLowerCase());

describe('resolveEntities on the audit-shaped fixture', () => {
  const res = resolveEntities(FIXTURE, { now: '2026-10-25T00:00:00Z' });

  it('collapses 33 raw records into 14 entities, 9 dropped, 6 folded into self', () => {
    expect(FIXTURE).toHaveLength(33);
    expect(res.stats).toEqual({ raw: 33, canonical: 14, selfFolded: 6, dropped: 9, proposals: 3 });
  });

  it('folds every caller token into one self entity', () => {
    const selves = res.entities.filter((e) => e.kind === 'self');
    expect(selves).toHaveLength(1);
    expect(selves[0].id).toBe('self');
    expect(selves[0].mergeLog.map((m) => m.from).sort()).toEqual([
      'caller',
      'i',
      'me',
      'speaker',
      'user',
    ]);
    expect(selves[0].mergeLog.find((m) => m.from === 'user')?.records).toBe(2);
  });

  it("drops Who, Ferni, a teammate named alone and Ferni's role labels; keeps the caller's friend Jordan", () => {
    const reasons = Object.fromEntries(res.dropped.map((d) => [d.name, d.reason]));
    expect(reasons).toEqual({
      Who: 'meta',
      someone: 'meta',
      '9': 'empty',
      Ferni: 'persona',
      Fernie: 'persona',
      Maya: 'persona',
      Assistant: 'role-label',
      "User's interlocutor": 'role-label',
      listener: 'role-label',
    });
    expect(res.entities.some((e) => /^(who|ferni|maya|assistant)$/i.test(e.canonicalName))).toBe(
      false
    );
    expect(named(res, 'Jordan')).toHaveLength(1);
    expect(named(res, 'Jordan')[0].relation?.key).toBe('friend');
  });

  it('makes mom, mother and mum one entity: the named mother, with relation-word aliases', () => {
    const mothers = res.entities.filter((e) => e.relation?.key === 'mother');
    expect(mothers).toHaveLength(1);
    const [m] = mothers;
    expect(m.canonicalName).toBe('Rosalind');
    expect(m.aliases).toEqual([
      { norm: 'mom', kind: 'relation-word', firstFactId: 'f1' },
      { norm: 'mother', kind: 'relation-word', firstFactId: 'f2' },
      { norm: 'mum', kind: 'relation-word', firstFactId: null },
    ]);
    expect(m.relation).toEqual({ text: 'mother of user', key: 'mother', factId: 'f3' });
    // within 90 days of `now`: the two October mentions, not May's; plus the undated mum
    expect(m.mentions90d).toBe(2);
    expect(m.lastMentionedAt).toBe('2026-10-10T10:00:00Z');
    // a stepmother is someone else
    expect(res.entities.find((e) => e.relation?.key === 'step-mother')?.id).not.toBe(m.id);
  });

  it('folds one name held by three stores into one entity with a store-dup log', () => {
    const [t] = named(res, 'Teodoro');
    expect(named(res, 'Teodoro')).toHaveLength(1);
    expect(t.mergeLog).toEqual([
      {
        rule: 'store-dup',
        from: 'teodoro',
        records: 3,
        stores: ['dynamic_entities', 'promoted_entities', 'relationship_network'],
        factIds: ['f4'],
        by: 'code',
      },
    ]);
  });

  it('turns a speech-to-text pair from different calls into a proposal, never a merge', () => {
    const [keelan] = named(res, 'Keelan');
    const [kealan] = named(res, 'Kealan');
    expect(keelan.id).not.toBe(kealan.id);
    expect(res.proposals).toContainEqual({
      a: [keelan.id, kealan.id].sort()[0],
      b: [keelan.id, kealan.id].sort()[1],
      reason: 'stt-variant',
      evidence: 'same first sound and phonetic key, edit distance 1',
    });
  });

  it('never merges or proposes two names heard in the same call', () => {
    const ids = [...named(res, 'Dorian'), ...named(res, 'Dorien')].map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(res.proposals.some((p) => ids.includes(p.a) || ids.includes(p.b))).toBe(false);
  });

  it('keeps two people with the same first name in one call apart by their relations', () => {
    expect(
      named(res, 'Priya')
        .map((e) => e.relation?.key)
        .sort()
    ).toEqual(['boss', 'cousin']);
  });

  it('keeps different stated relations apart; the unstated mention becomes a proposal to each', () => {
    const nicos = named(res, 'Nico');
    expect(nicos.map((e) => e.relation?.key ?? null).sort()).toEqual(['brother', 'friend', null]);
    const loose = nicos.find((e) => !e.relation)?.id;
    const ambiguous = res.proposals.filter((p) => p.reason === 'relation-ambiguous');
    expect(loose).toBeDefined();
    expect(ambiguous).toHaveLength(2);
    expect(ambiguous.every((p) => p.a === loose || p.b === loose)).toBe(true);
  });

  it('is deterministic: any input order gives the same entities, ids and proposals', () => {
    const reversed = resolveEntities([...FIXTURE].reverse(), { now: '2026-10-25T00:00:00Z' });
    const interleaved = resolveEntities(
      FIXTURE.filter((_, i) => i % 2).concat(FIXTURE.filter((_, i) => !(i % 2))),
      { now: '2026-10-25T00:00:00Z' }
    );
    expect(reversed).toEqual(res);
    expect(interleaved).toEqual(res);
  });
});

describe('the hard no-merge rules on their own', () => {
  it('never proposes a heard variant whose stated relation differs', () => {
    const pair = [
      r('Marisol', 'a', { sessionId: 'x1', relation: 'sister' }),
      r('Marisel', 'b', { sessionId: 'x2', relation: 'friend' }),
    ];
    expect(resolveEntities(pair).proposals).toEqual([]);
    // the same pair with no relations is a proposal: the relation is what blocks it
    const bare = pair.map(({ relation: _r, ...rest }) => rest);
    expect(resolveEntities(bare).proposals.map((p) => p.reason)).toEqual(['stt-variant']);
  });
});

describe('relation words with no named holder', () => {
  it('make one "mother" entity carrying mom and mum as aliases', () => {
    const res = resolveEntities([r('Mom', 'a'), r('mother', 'b'), r('My Mum', 'c')]);
    expect(res.entities).toHaveLength(1);
    expect(res.entities[0].canonicalName).toBe('mother');
    expect(res.entities[0].aliases.map((a) => a.norm)).toEqual(['mom', 'mum']);
  });

  it('a plural relation word with a named holder stays apart as a proposal (two sisters is normal)', () => {
    const res = resolveEntities([
      r('my sister', 'a'),
      r('Ines', 'b', { relation: 'older sister' }),
    ]);
    expect(res.entities).toHaveLength(2);
    expect(res.proposals.map((p) => p.reason)).toEqual(['relation-ambiguous']);
  });
});

describe('the pieces', () => {
  it('normalizeName drops case, accents, "my" and possessives', () => {
    expect(normalizeName("  My Mum's ")).toBe('mum');
    expect(normalizeName('José-Luis')).toBe('jose luis');
  });

  it('relationKey maps the lexicon to one key and keeps qualifiers apart', () => {
    expect(['mom', 'mother', 'mum', 'mama'].map(relationKey)).toEqual(Array(4).fill('mother'));
    expect(['grandma', 'lola', 'abuela', 'my grandmother'].map(relationKey)).toEqual(
      Array(4).fill('grandmother')
    );
    expect(relationKey('sister of speaker')).toBe('sister');
    expect(relationKey('best friend')).toBe('friend');
    expect(relationKey('stepmom')).toBe('step-mother');
    expect(relationKey('ex wife')).toBe('ex-wife');
    expect(relationKey('mother-in-law')).toBe('mother-in-law');
    expect(relationKey('neighbor')).toBeNull();
  });

  it('phoneticKey matches heard variants by first sound, and not different names', () => {
    expect(firstSound('catherine')).toBe(firstSound('katherine'));
    expect(phoneticKey('catherine')).toBe(phoneticKey('katherine'));
    expect(phoneticKey('philippa')).toBe(phoneticKey('filippa'));
    expect(phoneticKey('aaron')).toBe(phoneticKey('erin'));
    expect(phoneticKey('shalom')).not.toBe(phoneticKey('shawn'));
    expect(editDistance('keelan', 'kealan')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
  });
});
