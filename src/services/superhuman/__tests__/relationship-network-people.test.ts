/**
 * Only people go into the relationship network (prod 2026-11-16, audit item 3).
 *
 * The Your World graph drew "uh", "check", "call", "me" and "her" as people, and offered
 * "Reconnect with: him". The name patterns are case-insensitive for their trigger words
 * ("talked to", "and", "call"), so their "[A-Z][a-z]+" capture matched any lowercase word.
 * Names are fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => [] as Array<{ name: string; type: string }>);

vi.mock('../firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: (o: unknown) => o,
  recordDegradation: () => {},
}));
vi.mock('../../data-layer/hooks/superhuman-hooks.js', () => ({
  onRelationshipNetworkChange: async (
    _u: string,
    _id: string,
    d: { person: string; relationship: string }
  ) => {
    saved.push({ name: d.person, type: d.relationship });
  },
}));

const { extractNames, extractPerson, recordMention, loadNetwork } =
  await import('../relationship-network.js');

const namesIn = (said: string): string[] => extractNames(said).map((r) => r.name);

describe('extraction: non-people are never names', () => {
  it.each([
    ['I talked to uh my sister about it', 'uh'],
    ['I need to finish this and check the oven', 'check'],
    ['I have to go and call the bank', 'call'],
    ['tell him I said hi', 'him'],
    ['I saw her at the store', 'her'],
    ['she texted me and called me', 'me'],
  ])('%s: no "%s"', (said, junk) => {
    expect(namesIn(said)).not.toContain(junk);
    expect(extractPerson(said)?.name).not.toBe(junk);
  });

  it.each([
    ['I talked to Bria yesterday', 'Bria'],
    ['I saw Mel at the market', 'Mel'],
    ['I had lunch with Checkers today', 'Checkers'],
    ['Call Bria tomorrow', 'Bria'],
  ])('%s: keeps "%s"', (said, name) => {
    expect(namesIn(said)).toContain(name);
  });

  it('a lowercase word is not a name, even one on no list ("work", "dinner")', () => {
    expect(namesIn('I met with work friends and dinner ran late')).toEqual([]);
  });

  it('keeps "my mom" as a family relation, not an acquaintance', () => {
    const [mom] = extractNames('I talked to my mom last night');
    expect(mom).toMatchObject({ name: 'my mom', type: 'family' });
  });
});

describe('recordMention: the write guard every writer funnels through', () => {
  beforeEach(() => {
    saved.length = 0;
  });

  it.each(['uh', 'check', 'call', 'him', 'her', 'me'])('never stores "%s"', async (name) => {
    const stored = await recordMention('u-guard', { name, type: 'acquaintance', context: '' });
    expect(stored).toBeNull();
    expect(saved).toEqual([]);
  });

  it('stores Bria, Mel and my mom, and "Mom" is the same person as "my mom"', async () => {
    for (const name of ['Bria', 'Mel', 'my mom']) {
      await recordMention('u-keep', { name, type: 'acquaintance', context: '' });
    }
    const mom = await recordMention('u-keep', { name: 'Mom', type: 'family', context: '' });
    const network = await loadNetwork('u-keep');
    expect(network.map((p) => p.name)).toEqual(['Bria', 'Mel', 'my mom']);
    expect(mom).toMatchObject({ name: 'my mom', mentionCount: 2, type: 'family' });
  });
});
