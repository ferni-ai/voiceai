import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  applyReview,
  leakCheck,
  notePairs,
  reviewMarkdown,
  reviewPrompt,
  selfTopicRepeats,
  unbackedActionClaims,
} from '../../../scripts/voice-eval/judge-calls.mjs';

const e = (t: number, who: string, text: string) => ({ t, who, text });

const run = {
  events: [
    e(100, 'agent', 'Hey Sam, how was the day?'),
    e(5000, 'user', 'long day at the office again'),
    e(6000, 'agent', 'My garden needs water.'),
    e(9000, 'user', 'oh really'),
    e(10000, 'agent', 'The garden is dry again.'),
    e(13000, 'user', 'okay then'),
    e(14000, 'agent', "I've set a reminder about the garden for you."),
  ],
  notes: [{ t: 9500, notes: ['drop the garden'] }],
  tools: [] as Array<{ t: number; tool: string }>,
};

describe('judge-calls transcript checks', () => {
  it('counts the topic Ferni keeps returning to, not ones the caller raised', () => {
    expect(selfTopicRepeats(run.events)).toEqual({
      turns: 2,
      topics: [{ word: 'garden', turns: 3 }],
    });
    const callerTopic = selfTopicRepeats([
      e(0, 'agent', 'Hi Sam.'),
      e(1, 'user', 'my garden is a mess'),
      e(2, 'agent', 'Gardens are hard.'),
      e(3, 'agent', 'My garden too.'),
      e(4, 'agent', 'A garden needs time.'),
    ]);
    expect(callerTopic).toEqual({ turns: 0, topics: [] });
  });

  it('flags an action claim only when no tool ran for it', () => {
    expect(unbackedActionClaims(run)).toBe(1);
    expect(unbackedActionClaims({ ...run, tools: [{ t: 13500, tool: 'setReminder' }] })).toBe(0);
    // a tool call from an earlier turn does not back a later claim
    expect(unbackedActionClaims({ ...run, tools: [{ t: 4000, tool: 'setReminder' }] })).toBe(1);
  });

  it('pairs each director note with the next Ferni reply', () => {
    expect(notePairs(run)).toEqual([
      { note: 'drop the garden', turn: 5, reply: 'The garden is dry again.' },
    ]);
    expect(reviewPrompt(run, { replyGapMs: {} }, null)).toContain(
      '1. before turn 5: drop the garden'
    );
  });
});

describe('judge-calls privacy', () => {
  const caller = ['long day at the office again', 'oh really'];

  it('rejects text that repeats four caller words in a row', () => {
    expect(leakCheck('The caller said it was a long day at the office.', caller)).toBe(false);
    expect(
      leakCheck('The caller mentioned a tiring workday; Ferni changed the subject.', caller)
    ).toBe(true);
    // three in a row is not a quote
    expect(leakCheck('They had a long day.', caller)).toBe(true);
  });

  it('drops leaky moments and counts ignored notes', () => {
    const reply = {
      notes: [
        { n: 1, ignored: true },
        { n: 2, ignored: false },
      ],
      notHuman: [
        {
          turn: 5,
          what: 'Ferni went back to its garden after being told to drop it',
          cluster: 'own-topic loop',
        },
        { turn: 2, what: 'Answered "long day at the office again" with a story', cluster: 'x' },
      ],
    };
    const r = applyReview(reply, run);
    expect(r.ignored).toBe(1);
    expect(r.notHuman.map((m: { turn: number }) => m.turn)).toEqual([5]);
    expect(r.dropped).toBe(1);
  });

  it('keeps caller words out of review.md', () => {
    const md = reviewMarkdown({
      date: '2026-10-11',
      window: { since: 'a', until: 'b' },
      skipped: 3,
      calls: [
        {
          sessionId: 's1',
          env: 'prod',
          userKind: 'owner',
          startedAt: 't',
          metrics: {
            replyGapMs: { p50: 1, p90: 2, first: 3, n: 2, source: 'reply-gap' },
            callerTalkShare: 0.2,
            selfTopicRepeats: selfTopicRepeats(run.events),
            directorNotes: { notes: 1, ignored: 1 },
            crisis: { disagreements: 2, resourcesSpoken: 1 },
            presence: { spokenChecks: 0, sounds: {} },
            summary: { fallback: false },
            unbackedActionClaims: 1,
          },
          notHuman: [{ turn: 5, cluster: 'own-topic loop', what: 'went back to its garden' }],
        },
      ],
    });
    for (const said of caller) expect(md).not.toContain(said);
    expect(md).toContain('kept returning to garden×3');
    expect(md).toContain('crisis classifier disagreements 2');
    expect(md).toContain('turn 5 [own-topic loop]: went back to its garden');
    expect(md).toContain('3 other session(s) not reviewed');
  });
});
