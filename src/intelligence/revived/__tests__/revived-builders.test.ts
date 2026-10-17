import { describe, expect, it } from 'vitest';
import {
  alreadyCovered,
  inFerniVoice,
  lastCallLines,
  recentCallsLines,
  sessionGapLines,
  type RevivedInput,
} from '../revived-builders.js';

const NOW = new Date('2026-10-10T18:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// Shaped like a real prod summary (bogle_users/{id}/summaries, 2026-10-10).
const LAST_CALL = {
  sessionId: 'session-prev',
  timestamp: daysAgo(2),
  emotionalArc:
    'Started lighthearted, became awkward when the assistant confused martial arts with tea blocks, and ended abruptly.',
  questionsRemaining: [
    'How the move to Denver is going',
    "How Seth's martial arts training is going",
  ],
  followUpItems: ['Ask Seth directly about his martial arts training'],
  keyPoints: ['Seth trains martial arts'],
  turnCount: 33,
};
const OLDER = {
  sessionId: 'session-older',
  timestamp: daysAgo(30),
  emotionalArc: 'An easy, chatty catch-up.',
  keyPoints: ['Match sparring has been limited for the user', 'Knee is still sore'],
};

const input = (over: Partial<RevivedInput> = {}): RevivedInput => ({
  sessionId: 'session-now',
  userName: 'Seth',
  summaries: [LAST_CALL, OLDER],
  now: NOW,
  ...over,
});

describe('revived builders', () => {
  it("last-call: the previous call's arc, in Ferni's voice, and only the open questions recall does not cover", () => {
    const text = lastCallLines(input())
      .map((l) => l.text)
      .join('\n');
    expect(text).toContain('A recent call (2 days ago) went easily');
    expect(text).not.toContain('tea blocks'); // the arc is never passed on as written
    expect(text).not.toMatch(/assistant/i);
    expect(text).toContain(
      "Only if they bring it up: last time you didn't find out how the move to Denver is going"
    );
    // Covered by the follow-up memory recall already offers.
    expect(text).not.toContain('martial arts training is going');
  });

  it("last-call: skips this session's own summary and calls older than 90 days", () => {
    expect(lastCallLines(input({ sessionId: 'session-prev', summaries: [LAST_CALL] }))).toEqual([]);
    expect(
      lastCallLines(input({ summaries: [{ ...LAST_CALL, timestamp: daysAgo(120) }] }))
    ).toEqual([]);
  });

  it('recent-calls: one dated line per earlier call, never what the system prompt already says', () => {
    const [line] = recentCallsLines(input());
    expect(line.text).toBe(
      'Earlier calls: 4 weeks ago: Match sparring has been limited for Seth; Knee is still sore'
    );
    expect(
      recentCallsLines(
        input({ lastConversationSummary: 'Match sparring has been limited. Knee is still sore.' })
      )
    ).toEqual([]);
  });

  it('session-gap: only after two weeks, and it tells Ferni not to make them explain', () => {
    expect(sessionGapLines(input({ lastContact: daysAgo(5) }))).toEqual([]);
    const [line] = sessionGapLines(input({ lastContact: daysAgo(30) }));
    expect(line.text).toContain("It's been 4 weeks since you last talked");
    expect(line.text).toContain("they don't owe you an explanation for the gap");
    expect(sessionGapLines(input({ lastContact: 'not a date' }))).toEqual([]);
  });

  it('inFerniVoice and alreadyCovered', () => {
    expect(inFerniVoice("The assistant's answer confused the user", 'Ana')).toBe(
      'your answer confused Ana'
    );
    expect(alreadyCovered('how the vet visit went', ['Ask how the vet visit went'])).toBe(true);
    expect(alreadyCovered('how the new job is going', ['Ask how the vet visit went'])).toBe(false);
  });

  it('last-call: a hard last call gives Ferni the tone, never the painful details', () => {
    const hard = {
      ...LAST_CALL,
      emotionalArc: 'Started heavy; the user cried about the divorce and hung up upset.',
    };
    const text = lastCallLines(input({ summaries: [hard] }))
      .map((l) => l.text)
      .join('\n');
    expect(text).toContain('Let them lead on anything from a recent call (2 days ago)');
    expect(text).toContain("don't bring it up");
    expect(text).not.toMatch(/divorce|cried|hung up/i);
  });

  it("last-call: after a hard call, none of that call's open questions (they could name what hurt)", () => {
    const hard = {
      ...LAST_CALL,
      emotionalArc: 'Started heavy; the user cried about the divorce.',
      questionsRemaining: ['Whether the custody hearing went okay'],
    };
    const text = lastCallLines(input({ summaries: [hard] }))
      .map((l) => l.text)
      .join('\n');
    expect(text).not.toMatch(/custody|hearing|divorce/i);
  });

  it('last-call: fails closed on an arc it cannot read as light, painful words or not', () => {
    for (const emotionalArc of [
      'Quiet; they talked through the miscarriage and what the doctor said.',
      'They walked through their week and the new schedule.',
    ]) {
      const call = {
        ...LAST_CALL,
        emotionalArc,
        questionsRemaining: ['What the doctor said next'],
      };
      const text = lastCallLines(input({ summaries: [call] }))
        .map((l) => l.text)
        .join('\n');
      expect(text).toMatch(/let them lead/i);
      expect(text).not.toMatch(/miscarriage|doctor|schedule/i);
    }
  });
});

describe('revived builders fail closed on what an earlier call might hold', () => {
  const lastText = (doc: Record<string, unknown>) =>
    lastCallLines(input({ summaries: [doc] }))
      .map((l) => l.text)
      .join('\n');

  it('no arc: a tone line at most, never its open questions', () => {
    const text = lastText({
      sessionId: 'session-prev',
      timestamp: daysAgo(2),
      keyPoints: ['Talked about the week'],
      questionsRemaining: ['Whether the biopsy came back clear'],
    });
    expect(text).not.toMatch(/biopsy/i);
  });

  it('a negated or mixed arc is not light: "not happy", or warm but about a death', () => {
    for (const [emotionalArc, question] of [
      [
        'Not happy at all; Sam was frustrated and lonely after the breakup.',
        'Whether Sam reached out to his ex',
      ],
      ['Warm and calm; Sam talked about his father passing last month.', 'How Sam is coping'],
    ]) {
      const text = lastText({ ...LAST_CALL, emotionalArc, questionsRemaining: [question] });
      expect(text).toContain('Let them lead');
      expect(text).not.toMatch(/breakup|ex\b|father|passing|coping|happy|warm/i);
    }
  });

  it('a call the summary calls light still keeps hard details out (eviction, stroke, relapse)', () => {
    for (const question of [
      'Whether the eviction notice was resolved',
      "How Sam's mum is after the stroke",
      'Whether Sam is okay after the relapse',
    ]) {
      const text = lastText({
        ...LAST_CALL,
        emotionalArc: 'Light and friendly throughout.',
        questionsRemaining: [question],
      });
      expect(text).not.toMatch(/eviction|stroke|relapse/i);
    }
  });

  it("an earlier hard call's key points stay out of the earlier-calls line", () => {
    const hardOlder = {
      sessionId: 'session-hard',
      timestamp: daysAgo(4),
      emotionalArc: 'Easy at first, then heavy.',
      keyPoints: ['Sam had a miscarriage last week'],
    };
    const lines = recentCallsLines(input({ summaries: [LAST_CALL, hardOlder, OLDER] }));
    const text = lines.map((l) => l.text).join('\n');
    expect(text).not.toMatch(/miscarriage/i);
    expect(text).toContain('Knee is still sore'); // a light earlier call still comes through
  });
});
