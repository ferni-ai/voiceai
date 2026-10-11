import { afterEach, describe, expect, it } from 'vitest';
import {
  endRevivedIntelligence,
  REVIVED_CATEGORY,
  revivedInjection,
  revivedIntelligenceConfig,
  startRevivedIntelligence,
  withRevivedIntelligence,
  type RevivedStore,
} from '../revived-intelligence.js';

const ON = { REVIVED_INTELLIGENCE: 'on' };
const NOW = new Date('2026-10-10T18:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// Shaped like a real prod summary (bogle_users/{id}/summaries, 2026-10-10).
const LAST_CALL = {
  sessionId: 'session-prev',
  timestamp: daysAgo(2),
  emotionalArc: 'Started lighthearted and ended abruptly after a mix-up about tea blocks.',
  questionsRemaining: ['How the move to Denver is going'],
  keyPoints: ['Seth trains martial arts'],
};
const OLDER = {
  sessionId: 'session-older',
  timestamp: daysAgo(30),
  keyPoints: ['Match sparring has been limited for the user', 'Knee is still sore'],
};

describe('revivedIntelligenceConfig', () => {
  it('is off by default; allow-list and budget come from env, budget capped at 400 tokens', () => {
    expect(revivedIntelligenceConfig({}).on).toBe(false);
    const c = revivedIntelligenceConfig({
      ...ON,
      REVIVED_BUILDERS: 'last-call, bogus',
      REVIVED_TOKEN_BUDGET: '9999',
    });
    expect(c.on).toBe(true);
    expect([...c.builders]).toEqual(['last-call']);
    expect(c.budgetChars).toBe(1600);
    expect([...revivedIntelligenceConfig(ON).builders]).toEqual([
      'last-call',
      'recent-calls',
      'session-gap',
    ]);
    expect(revivedIntelligenceConfig(ON).budgetChars).toBe(600);
  });
});

const store = (summaries = [LAST_CALL, OLDER]): RevivedStore => ({
  summaries: async () => summaries,
});
let n = 0;
const sid = () => `s-${++n}`;

describe('startRevivedIntelligence / revivedInjection', () => {
  afterEach(() => endRevivedIntelligence(`s-${n}`));

  it('loads once at call start and serves the block from memory', async () => {
    const id = sid();
    let reads = 0;
    const counting: RevivedStore = { summaries: async () => (reads++, [LAST_CALL, OLDER]) };
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      userName: 'Seth',
      store: counting,
      now: () => NOW,
      env: ON,
    });
    await startRevivedIntelligence({ sessionId: id, userId: 'u', store: counting, env: ON });
    const block = revivedInjection(id, 1, Infinity, ON);
    expect(reads).toBe(1);
    expect(block?.category).toBe(REVIVED_CATEGORY);
    expect(block?.content).toContain('How your last call (2 days ago) felt');
    expect(block?.content).toContain('Earlier calls: 4 weeks ago');
  });

  it('reads nothing when the flag is off', async () => {
    const id = sid();
    let reads = 0;
    const counting: RevivedStore = { summaries: async () => (reads++, [LAST_CALL]) };
    await startRevivedIntelligence({ sessionId: id, userId: 'u', store: counting, env: {} });
    expect(reads).toBe(0);
    expect(revivedInjection(id, 1, Infinity, {})).toBeNull();
  });

  it('a store that never answers costs the turn nothing', async () => {
    const id = sid();
    const stuck: RevivedStore = {
      summaries: () =>
        new Promise(() => {
          // never settles
        }),
    };
    void startRevivedIntelligence({ sessionId: id, userId: 'u', store: stuck, env: ON });
    const t0 = performance.now();
    const out = withRevivedIntelligence(
      [{ category: 'x', content: 'turn', priority: 50 }],
      { sessionId: id, turn: 1 },
      ON
    );
    expect(performance.now() - t0).toBeLessThan(20);
    expect(out.map((i) => i.content)).toEqual(['turn']);
  });

  it('keeps to the token budget, highest priority first, dropping whole lines', async () => {
    const id = sid();
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      userName: 'Seth',
      lastContact: daysAgo(30),
      store: store(),
      now: () => NOW,
      env: ON,
    });
    const full = revivedInjection(id, 1, Infinity, ON)!.content;
    expect(full.length).toBeLessThanOrEqual(600);
    const tight = { ...ON, REVIVED_TOKEN_BUDGET: '80' }; // 320 chars
    const block = revivedInjection(id, 1, Infinity, tight)!;
    expect(block.content.length).toBeLessThanOrEqual(320);
    expect(block.content).toContain('How your last call'); // priority 76 kept
    expect(block.content).not.toContain('Earlier calls'); // priority 70 dropped
    expect(block.content.endsWith('…')).toBe(false);
  });

  it('lines stop after their turn window: the gap note after 3 turns, the rest after 10', async () => {
    const id = sid();
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      lastContact: daysAgo(30),
      store: store(),
      now: () => NOW,
      env: ON,
    });
    expect(revivedInjection(id, 2, Infinity, ON)!.content).toContain("It's been");
    expect(revivedInjection(id, 3, Infinity, ON)!.content).not.toContain("It's been");
    expect(revivedInjection(id, 10, Infinity, ON)).toBeNull();
  });
});

describe('withRevivedIntelligence', () => {
  const turn = [
    { category: 'honesty', content: 'H'.repeat(100), priority: 99 },
    { category: 'pacing', content: 'P'.repeat(100), priority: 40 },
  ];

  it('places the block by priority and leaves the other injections as they were', async () => {
    const id = sid();
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      store: store(),
      now: () => NOW,
      env: ON,
    });
    const out = withRevivedIntelligence(turn, { sessionId: id, turn: 1 }, ON);
    expect(out.map((i) => i.category)).toEqual(['honesty', REVIVED_CATEGORY, 'pacing']);
    expect(out[0]).toBe(turn[0]);
    expect(out[2]).toBe(turn[1]);
    expect(withRevivedIntelligence(turn, { sessionId: id, turn: 1 }, {})).toBe(turn);
  });

  it('never adds to a crisis turn', async () => {
    const id = sid();
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      store: store(),
      now: () => NOW,
      env: ON,
    });
    const crisis = [{ category: 'safety', content: 'CRISIS', priority: 99 }, ...turn];
    expect(withRevivedIntelligence(crisis, { sessionId: id, turn: 1 }, ON)).toBe(crisis);
    expect(withRevivedIntelligence(turn, { sessionId: id, turn: 1, crisis: true }, ON)).toBe(turn);
  });

  it('fits in the room the note has left, and adds nothing when there is none', async () => {
    const id = sid();
    await startRevivedIntelligence({
      sessionId: id,
      userId: 'u',
      store: store(),
      now: () => NOW,
      env: ON,
    });
    const out = withRevivedIntelligence(turn, { sessionId: id, turn: 1, maxChars: 400 }, ON);
    const before = out
      .slice(0, 2)
      .map((i) => i.content)
      .join('\n\n');
    expect(before.length).toBeLessThanOrEqual(400);
    expect(withRevivedIntelligence(turn, { sessionId: id, turn: 1, maxChars: 150 }, ON)).toBe(turn);
  });
});
