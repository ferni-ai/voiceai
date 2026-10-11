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
    expect(text).toContain('How your last call (2 days ago) felt');
    expect(text).toContain('you confused martial arts with tea blocks');
    expect(text).not.toMatch(/assistant/i);
    expect(text).toContain('How the move to Denver is going');
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
    expect(line.text).toContain("don't ask where they've been");
    expect(sessionGapLines(input({ lastContact: 'not a date' }))).toEqual([]);
  });

  it('inFerniVoice and alreadyCovered', () => {
    expect(inFerniVoice("The assistant's answer confused the user", 'Ana')).toBe(
      'your answer confused Ana'
    );
    expect(alreadyCovered('how the vet visit went', ['Ask how the vet visit went'])).toBe(true);
    expect(alreadyCovered('how the new job is going', ['Ask how the vet visit went'])).toBe(false);
  });
});
