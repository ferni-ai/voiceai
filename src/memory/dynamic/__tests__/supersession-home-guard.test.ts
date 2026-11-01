/**
 * Where they live is never replaced by where they are right now (right-moment memory §5.3).
 * FACT_SUPERSESSION is one model call over same-subject candidates, so "User | current
 * location = the airport" could retire "User | home = Maplewood". A guard in code keeps
 * `home` and `current location` apart, both ways, whatever the model replies; a newer
 * value of the same key still replaces the older one. Fictional rows only.
 */
import { describe, expect, it } from 'vitest';
import {
  supersedeNewFacts,
  type StoredFact,
  type SupersessionStore,
} from '../fact-supersession.js';

const fact = (id: string, key: string, value: string, day: string): StoredFact => ({
  id,
  entityName: 'User',
  key,
  value,
  extractedAt: `${day}T18:00:00.000Z`,
});
const HOME = fact('home-1', 'home', 'Maplewood', '2026-10-01');

/** Runs supersession with a model that names every (older, newer) pair it is shown. */
async function marked(newer: StoredFact[], older: StoredFact[]) {
  const marks: Array<{ id: string; by: string }> = [];
  const store: SupersessionStore = {
    facts: async () => [...newer, ...older],
    markSuperseded: async (_u, m) => void marks.push(...m),
    cursor: async () => '2026-10-15T00:00:00.000Z',
    setCursor: async () => undefined,
  };
  const prompts: string[] = [];
  const llm = async (prompt: string) => {
    prompts.push(prompt);
    const o = prompt.split('\n').filter((l) => /^O\d+\./.test(l)).length;
    const pairs = newer.flatMap((_, n) =>
      Array.from({ length: o }, (_, i) => ({ older: `O${i + 1}`, newer: `N${n + 1}` }))
    );
    return JSON.stringify(pairs);
  };
  await supersedeNewFacts('riley-test-1', { store, llm, since: new Date('2026-10-15') });
  return { marks, prompts };
}

describe('supersession keeps home apart from current location', () => {
  it('the airport never replaces home, even when the model names it', async () => {
    const now = fact('now-1', 'current location', 'the airport', '2026-10-30');
    const { marks, prompts } = await marked([now], [HOME]);
    expect(marks).toEqual([]);
    expect(prompts.join('\n')).not.toContain('Maplewood');
  });

  it('a newer home replaces the older home', async () => {
    const moved = fact('home-2', 'home', 'Riverton', '2026-10-30');
    expect((await marked([moved], [HOME])).marks).toEqual([{ id: 'home-1', by: 'home-2' }]);
  });

  it('a newer home never replaces where they were right now', async () => {
    const was = fact('now-0', 'current location', 'the airport', '2026-10-01');
    const moved = fact('home-2', 'home', 'Riverton', '2026-10-30');
    expect((await marked([moved], [was])).marks).toEqual([]);
  });

  it('a newer current location replaces the older one', async () => {
    const was = fact('now-0', 'current location', 'the airport', '2026-10-01');
    const now = fact('now-1', 'current location', 'at work', '2026-10-30');
    expect((await marked([now], [was])).marks).toEqual([{ id: 'now-0', by: 'now-1' }]);
  });

  it('whole keys, any case, spaces or underscores', async () => {
    const now = fact('now-1', 'Current_Location', 'the airport', '2026-10-30');
    const home = { ...HOME, key: ' HOME ' };
    expect((await marked([now], [home])).marks).toEqual([]);
    const homeTown = fact('ht-1', 'home town', 'Maplewood', '2026-10-01');
    expect((await marked([now], [homeTown])).marks).toEqual([{ id: 'ht-1', by: 'now-1' }]);
  });

  it('in one batch, home still goes to the newer home, never to the current location', async () => {
    const moved = fact('home-2', 'home', 'Riverton', '2026-10-30');
    const now = fact('now-1', 'current location', 'the airport', '2026-10-30');
    expect((await marked([moved, now], [HOME])).marks).toEqual([{ id: 'home-1', by: 'home-2' }]);
  });

  it('an unrelated key is unaffected', async () => {
    const tired = fact('mood-0', 'mood', 'tired', '2026-10-01');
    const now = fact('now-1', 'current location', 'the airport', '2026-10-30');
    expect((await marked([now], [tired])).marks).toEqual([{ id: 'mood-0', by: 'now-1' }]);
  });
});
