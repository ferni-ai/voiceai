/**
 * The research synthesis tools must not present a meta-analysis they never ran.
 * No study counts, participant totals, effect sizes or evidence scores reach a
 * caller, and base rates quote a figure only where a sourced one exists. The
 * citations that were kept must still be present and correctly described.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../superhuman-tools/firestore-persistence.js', () => ({
  getUserIdFromContext: () => 'u1',
}));

import { researchSynthesisTools } from '../superhuman-tools/research-synthesis.js';

const ctx = { ctx: { userData: { userId: 'u1' } } } as never;

// Language that implies a computed meta-analysis
const META =
  /studies found|combined studies|\d[\d,]*\s+studies|participants|effect size|meta-analysis|evidence score|\/100/i;

// Concrete figures the old hand-written database printed
const OLD_FIGURES = [
  '2,500',
  '8,000',
  '15,000',
  '25-40%',
  '20-40%',
  '40% more productive',
  '66 days on average',
  'Only 9%',
  '95% of diets',
  '40% of new habits',
  'ACTUAL BASE RATE',
];

const CLAIMS = [
  'it takes 66 days to form a habit',
  'sleep deprivation hurts decision making',
  'setting specific goals improves results',
  'cold showers boost immunity',
];

async function run(name: keyof typeof researchSynthesisTools, args: object): Promise<string> {
  const tool = researchSynthesisTools[name] as unknown as {
    execute: (a: never, c: never) => Promise<unknown>;
  };
  return String(await tool.execute(args as never, ctx));
}

function expectNoInventedStats(text: string): void {
  expect(text).not.toMatch(META);
  for (const figure of OLD_FIGURES) expect(text).not.toContain(figure);
}

describe('research synthesis: no invented study statistics', () => {
  it.each(CLAIMS)('scoreEvidenceQuality has no meta-analysis numbers for "%s"', async (claim) => {
    expectNoInventedStats(await run('scoreEvidenceQuality', { claim }));
  });

  it.each(CLAIMS)('synthesizeResearch has no study counts for "%s"', async (topic) => {
    expectNoInventedStats(await run('synthesizeResearch', { topic, depth: 'comprehensive' }));
  });

  it.each([...CLAIMS, 'it takes 21 days to build a habit', 'multitasking makes me efficient'])(
    'verifyClaim has no invented numbers for "%s"',
    async (claim) => {
      const text = await run('verifyClaim', { claim });
      expectNoInventedStats(text);
      expect(text).not.toMatch(/VERDICT: (PARTIALLY |WEAKLY )?SUPPORTED/);
    }
  );

  it('says the notes are not a live literature search', async () => {
    const text = await run('scoreEvidenceQuality', { claim: CLAIMS[1] });
    expect(text).toContain('not a live search of the literature');
  });

  it('keeps the Lally et al. (2010) habit citation, described correctly', async () => {
    for (const text of [
      await run('scoreEvidenceQuality', { claim: CLAIMS[0] }),
      await run('verifyClaim', { claim: 'it takes 21 days to build a habit' }),
    ]) {
      expect(text).toContain('Lally et al., 2010');
      expect(text).toContain('96 people');
      expect(text).toMatch(/median of about 66 days/);
      expect(text).toContain('18 to 254 days');
    }
  });

  it('keeps the sleep citations that are real', async () => {
    const text = await run('scoreEvidenceQuality', { claim: CLAIMS[1] });
    expect(text).toContain('Harrison & Horne, 2000');
    expect(text).toContain('Dawson & Reid, 1997');
  });
});

describe('getBaseRate: figures only where sourced', () => {
  it.each(['startup success', 'new year resolution', 'diet success', 'habit stick'])(
    '%s quotes no unsourced percentage and does not calibrate against one',
    async (scenario) => {
      const text = await run('getBaseRate', { scenario, userEstimate: 50 });
      expectNoInventedStats(text);
      expect(text.replaceAll('50%', '')).not.toMatch(/\d+(\.\d+)?%/);
      expect(text).toContain("I don't have a reliable figure");
    }
  );

  it('active investing cites SPIVA for its figure', async () => {
    const text = await run('getBaseRate', {
      scenario: 'active investor beats market',
      userEstimate: 50,
    });
    expect(text).toContain('SPIVA');
    expect(text).toContain('about 10%');
    expect(text).not.toMatch(/\b(40|20|8)% success/);
  });

  it('side business no longer gets an invented rate', async () => {
    const text = await run('getBaseRate', { scenario: 'side business success' });
    expect(text).not.toMatch(/\d+%/);
    expect(text).toContain("I don't have a base rate");
  });
});

describe('findCounterArguments: no invented failure share', () => {
  it('does not claim 90% failed', async () => {
    const text = await run('findCounterArguments', {
      belief: 'I can pick winning stocks',
      domain: 'finance',
    });
    expect(text).not.toMatch(/\d+%/);
  });
});
