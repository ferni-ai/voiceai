/**
 * HOUR_ONCE: once the hour has come up on a call, the reply's "Right now" line (WORLD_NOW)
 * stops prompting it, and gives it back when the caller asks. Each case runs the real turn
 * reminder (withTurnReminder) with the flag off (prod today) and on. Shapes from the prod
 * sweep of 2026-10-21 (long-day, late-night-energy), about 5 a.m. for the caller.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withTurnReminder } from '../../personas/turn-request.js';
import { HOUR_SAID, mentionsTheHour } from '../hour-once.js';

// 4:58 a.m. in New York (2:58 mountain), Wednesday Oct 21 2026: the prod long-day call
const AT = new Date('2026-10-21T08:58:48Z');
const session = {
  userData: { callerTimezone: 'America/New_York', services: { sessionId: 'hour-once' } },
};

function reminder(lines: Array<['ferni' | 'caller', string]>): string {
  const chat = llm.ChatContext.empty();
  for (const [who, text] of lines) {
    chat.addMessage({ role: who === 'caller' ? 'user' : 'assistant', content: text });
  }
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
  vi.stubEnv('WORLD_NOW', 'on');
  vi.stubEnv('FERNI_LOCAL_CLOCK', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const LONG_DAY: Array<['ferni' | 'caller', string]> = [
  ['ferni', 'Hey Sam, burning the midnight oil again?'],
  ['caller', "Hey Ferni, it's been kind of a long day."],
  ['ferni', "I hear that. I'm really glad you reached out, though, even at this hour."],
  ['caller', 'Work was just a lot. My manager moved a big deadline up to Friday.'],
];

describe('the hour, once it has come up (long-day)', () => {
  it('off: every reply is handed the clock, the part of the day and his own clock', () => {
    vi.stubEnv('HOUR_ONCE', 'off');
    const sent = reminder(LONG_DAY);
    expect(sent).toContain('Right now for the caller: Wednesday, Oct 21, 4:58 AM EDT, night.');
    expect(sent).toContain('For you: 2:58 AM mountain.');
    expect(sent).not.toContain(HOUR_SAID);
  });

  it('on: the day stays, the clock goes, and the reply is told not to bring it up', () => {
    vi.stubEnv('HOUR_ONCE', 'on');
    const sent = reminder(LONG_DAY);
    expect(sent).toContain(`Right now for the caller: Wednesday, Oct 21. ${HOUR_SAID}`);
    expect(sent).not.toContain('4:58');
    expect(sent).not.toContain('night.');
    expect(sent).not.toContain('mountain');
  });

  it("on: the caller's own mention counts too (late-night-energy)", () => {
    vi.stubEnv('HOUR_ONCE', 'on');
    const sent = reminder([
      ['ferni', 'Hey Sam.'],
      ['caller', 'Hey Ferni, you still up?'],
    ]);
    expect(sent).not.toContain('4:58');
    expect(sent).toContain(HOUR_SAID);
  });

  it('on: before anyone mentions it, the clock is there (the one time it may come up)', () => {
    vi.stubEnv('HOUR_ONCE', 'on');
    const sent = reminder([
      ['ferni', 'Hey Sam.'],
      ['caller', "Hey Ferni, it's been kind of a long day."],
    ]);
    expect(sent).toContain('4:58 AM EDT');
    expect(sent).not.toContain(HOUR_SAID);
  });

  it('on: a caller who asks the time gets it back', () => {
    vi.stubEnv('HOUR_ONCE', 'on');
    const sent = reminder([...LONG_DAY, ['caller', 'Wait, what time is it for you anyway?']]);
    expect(sent).toContain('4:58 AM EDT');
    expect(sent).toContain('For you: 2:58 AM mountain.');
  });
});

describe('mentionsTheHour', () => {
  it('knows the hour and the part of the day as said on a call', () => {
    for (const said of [
      'Hey Sam, burning the midnight oil again?',
      'even if it is four in the morning',
      "It's nearly three here in Wyoming",
      "I'm really glad you reached out, even at this hour.",
      'morning, sam, what are you getting into today?',
      'Hey Sam, good morning.',
      'I guess the late hour is catching up with me.',
      "It's 2:58 am here.",
      'you still up?',
    ]) {
      expect(mentionsTheHour(said), said).toBe(true);
    }
  });

  it('not a day, a habit, or a time that is not now', () => {
    for (const said of [
      "I've hit snooze like 5 times every morning this week.",
      'Biscuit chewed up my phone charger this morning.',
      'I start at 8 and I keep rolling in at 8:20.',
      'My manager moved a big deadline up to Friday.',
    ]) {
      expect(mentionsTheHour(said), said).toBe(false);
    }
  });
});
