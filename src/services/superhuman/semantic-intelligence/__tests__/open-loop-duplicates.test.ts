/**
 * One open loop per wording, read to the end of its clause.
 *
 * 2026-11-16 audit: Story So Far's Open Loops listed "I need to find places to stop",
 * "I'm going to split it up" and "I'll follow up with you to see" twice each, cut
 * mid-thought. Every user turn ran loop detection twice (turn handler and turn
 * learning), and createOpenLoop saved each pass under a new random id. This runs the
 * real createOpenLoop, processUserTextForLoops and the Story read (fetchOpenLoops) over
 * a fake store holding the shapes the real one persists.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const stored: Doc[] = [];
const sets: Doc[] = [];

vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => {
          const query = {
            where: () => query,
            orderBy: () => query,
            limit: () => query,
            get: async () => ({ docs: stored.map((d) => ({ data: () => d })) }),
            doc: (id: string) => ({
              set: async (d: Doc) => void sets.push({ id, ...d }),
              update: async () => undefined,
            }),
          };
          return query;
        },
      }),
    }),
  }),
  cleanForFirestore: <T>(v: T) => v,
}));
vi.mock('../../../data-layer/hooks/coaching-hooks.js', () => ({
  onCoachingInsightChange: vi.fn(),
}));
vi.mock('../insight-broker.js', () => ({ createInsight: vi.fn(async () => undefined) }));

const loops = await import('../open-loops.js');
const { fetchOpenLoops } = await import('../../../../api/your-story-sections.js');
const { wholeClause, oneLoopPerWording } = await import('../open-loop-text.js');
const CALL_TEXT = "I'll call her tomorrow about the lease";

const USER = 'user-loops-1';
const SAID = 'I need to find places to stop for gas on the drive tomorrow. Anyway, how are you?';
const DAY = 24 * 60 * 60 * 1000;
const ts = (ms: number) => ({ toDate: () => new Date(ms) });

const savedOpen = () => sets.filter((s) => s.status === 'open');
const saved = (content: string) => savedOpen().filter((s) => s.content === content);

beforeEach(() => {
  stored.length = 0;
  sets.length = 0;
  loops.clearLoopCache();
});

describe('createOpenLoop: one loop per wording', () => {
  it('a turn processed twice at once saves its loop once', async () => {
    // What every turn did: turn-handler.ts and processTurnLearning both ran detection
    await Promise.all([
      loops.processUserTextForLoops(USER, SAID, {}),
      loops.processUserTextForLoops(USER, SAID, {}),
    ]);

    expect(saved('I need to find places to stop for gas')).toHaveLength(1);
    expect(await loops.getAllOpenLoops(USER)).toHaveLength(1);
  });

  it('the same words in a later turn are the same loop, not a second one', async () => {
    const first = await loops.createOpenLoop(USER, {
      type: 'commitment',
      content: 'I need to find places to stop',
      context: SAID,
    });
    const again = await loops.createOpenLoop(USER, {
      type: 'commitment',
      content: 'i need to find places to STOP.',
      context: SAID,
    });

    expect(again.id).toBe(first.id);
    expect(savedOpen()).toHaveLength(1);
  });

  it('a loop that was resolved opens again when it is said again', async () => {
    const first = await loops.createOpenLoop(USER, {
      type: 'intention',
      content: "I'm going to split it up",
      context: "I'm going to split it up",
    });
    await loops.resolveLoop(USER, first.id, 'done');
    const again = await loops.createOpenLoop(USER, {
      type: 'intention',
      content: "I'm going to split it up",
      context: "I'm going to split it up",
    });

    expect(again.id).not.toBe(first.id);
    expect(again.status).toBe('open');
  });

  const CALL = "I'll call her tomorrow about the lease";
  const about = (relatedPerson: string) =>
    loops.createOpenLoop(USER, { type: 'commitment', content: CALL, context: CALL, relatedPerson });

  it('the same words about two different people are two loops', async () => {
    const sister = await about('Sister');
    const mom = await about('Mom');

    expect(mom.id).not.toBe(sister.id);
    expect(savedOpen()).toHaveLength(2);
  });

  it('the same words about the same person are one loop', async () => {
    const first = await about('Mom');
    const again = await about(' mom ');

    expect(again.id).toBe(first.id);
    expect(savedOpen()).toHaveLength(1);
  });
});

describe('fetchOpenLoops (Story So Far): rows already saved twice', () => {
  const row = (id: string, content: string, context: string, ageDays: number) => ({
    id,
    userId: USER,
    type: 'intention',
    content,
    context,
    status: 'open',
    priority: 6,
    followUpCount: 0,
    created: ts(Date.now() - ageDays * DAY),
    followUpAfter: ts(Date.now() - ageDays * DAY),
    followUpBefore: ts(Date.now() + 5 * DAY),
  });

  it('lists each wording once, the newest copy, in a whole clause', async () => {
    const context = "I'll follow up with you to see how the move went. Thanks!";
    stored.push(
      row('loop_old', "I'll follow up with you to see", context, 3),
      row('loop_new', "I'll follow up with you to see", context, 1),
      row('loop_other', "I'm going to split it up", "I'm going to split it up into two trips", 2)
    );

    const data = await fetchOpenLoops(USER);

    expect(data?.total).toBe(2);
    expect(data?.items.map((i) => i.id)).toEqual(['loop_new', 'loop_other']);
    expect(data?.items.map((i) => i.content)).toEqual([
      "I'll follow up with you to see how the move went",
      "I'm going to split it up into two trips",
    ]);
  });
});

describe('wholeClause', () => {
  it('stops at the end of the sentence', () => {
    expect(wholeClause('I need to find places to stop', SAID)).toBe(
      'I need to find places to stop for gas on the drive tomorrow'
    );
  });

  it('adds nothing past the kept 200 characters: a longer fragment is still a fragment', () => {
    const cut = `I need to find places to stop ${'and then some more words '.repeat(10)}`.slice(
      0,
      200
    );
    expect(wholeClause('I need to find places to stop', cut)).toBe('I need to find places to stop');
  });

  it('keeps the words when they are not in the context', () => {
    expect(wholeClause('Mentioned job interview', 'I have an interview')).toBe(
      'Mentioned job interview'
    );
  });

  it('stops at a comma: a loop never carries the rest of a private sentence', () => {
    const said = 'I need to call the clinic, my HIV test came back and I do not know what to do';
    expect(wholeClause('I need to call the clinic', said)).toBe('I need to call the clinic');
  });

  it('stops at a dash, spaced or not', () => {
    expect(
      wholeClause('I need to call the clinic', 'I need to call the clinic - the results')
    ).toBe('I need to call the clinic');
    expect(
      wholeClause('I need to call the clinic', 'I need to call the clinic\u2014the results')
    ).toBe('I need to call the clinic');
  });

  it('stops at a comma even when what follows is short', () => {
    expect(
      wholeClause('I need to call the clinic', 'I need to call the clinic, about my results')
    ).toBe('I need to call the clinic');
  });

  it('keeps the fragment when the kept words end mid-clause, however few are left', () => {
    const cut = `${'filler '.repeat(28)}I need to stop for gas on`;
    expect(cut.length).toBeGreaterThanOrEqual(200);
    expect(wholeClause('I need to stop', cut)).toBe('I need to stop');
  });

  it('reads a number range as part of the clause, not its end', () => {
    expect(
      wholeClause('I need to be there', 'I need to be there between 10\u201312 tomorrow')
    ).toBe('I need to be there between 10\u201312 tomorrow');
  });

  it('keeps the fragment when the clause runs on past eight more words', () => {
    const said =
      'I need to call the clinic about the results that came back from the lab on Tuesday';
    expect(wholeClause('I need to call the clinic', said)).toBe('I need to call the clinic');
  });

  it('reads a short clause whole', () => {
    expect(wholeClause("I'm going to split it up", "I'm going to split it up into two trips")).toBe(
      "I'm going to split it up into two trips"
    );
  });

  it('compares wordings without case, spacing or end punctuation', () => {
    const kept = (...wordings: string[]) =>
      oneLoopPerWording(wordings.map((content) => ({ content }))).length;
    expect(kept('  I need to  STOP. ', 'i need to stop')).toBe(1);
    expect(kept('I need to stop', 'I need to start')).toBe(2);
  });

  it('keeps one loop per wording and person, newest first', () => {
    const l = (id: string, relatedPerson?: string) => ({ id, content: CALL_TEXT, relatedPerson });
    const kept = oneLoopPerWording([
      l('a', 'Sister'),
      l('b', 'Mom'),
      l('c', 'mom'),
      l('d'),
      l('e'),
    ]);
    expect(kept.map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });
});
