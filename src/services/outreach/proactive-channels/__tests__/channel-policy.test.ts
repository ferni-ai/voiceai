/**
 * The call rules of the channel policy. The run doesn't place calls yet
 * (canCall is false there), so these drive chooseChannel directly.
 */
import { describe, expect, it } from 'vitest';
import { chooseChannel, type PolicyInput } from '../channel-policy.js';
import type { OutreachLogEntry } from '../outreach-log.js';

const HOUR = 3600_000;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');

function input(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    trigger: { weight: 'meaningful', timely: true, promisedCall: true },
    now: NOW,
    prefs: { channels: ['sms', 'voice_call'] },
    timezone: 'America/New_York',
    verifiedPhone: '+15555550123',
    recent: [],
    canCall: true,
    optedOut: { sms: false, call: false },
    ...over,
  };
}
const call = (hoursAgo: number, outcome: OutreachLogEntry['outcome']): OutreachLogEntry => ({
  sourceId: `c${hoursAgo}`,
  kind: 'promise',
  channel: 'voice_call',
  reason: 'r',
  why: 'w',
  at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
  outcome,
});

describe('chooseChannel: calls', () => {
  it('calls for a meaningful trigger when calls are on', () => {
    expect(chooseChannel(input())).toEqual({ channel: 'voice_call', why: 'promised a call' });
  });

  it('a light trigger is a text, never a call', () => {
    expect(chooseChannel(input({ trigger: { weight: 'light', timely: true } })).channel).toBe(
      'sms'
    );
  });

  it('without calls turned on, a meaningful trigger is a text', () => {
    expect(chooseChannel(input({ prefs: { channels: ['sms'] } })).channel).toBe('sms');
  });

  it('on the do-not-call list, a meaningful trigger is a text; opted out of texts too, a note', () => {
    expect(chooseChannel(input({ optedOut: { sms: false, call: true } })).channel).toBe('sms');
    expect(chooseChannel(input({ optedOut: { sms: true, call: true } }))).toEqual({
      channel: 'in_app',
      why: 'opted out of texts',
    });
  });

  it('opted out of texts only, a meaningful trigger still calls', () => {
    expect(chooseChannel(input({ optedOut: { sms: true, call: false } })).channel).toBe(
      'voice_call'
    );
  });

  it('without a SIP trunk (canCall false) it is a text', () => {
    expect(chooseChannel(input({ canCall: false })).channel).toBe('sms');
  });

  it('at most one call a day', () => {
    const r = chooseChannel(input({ recent: [call(5, 'answered')] }));
    expect(r).toEqual({ channel: 'sms', why: 'timely' });
  });

  it('backs off calls for three days after one that was not picked up', () => {
    expect(chooseChannel(input({ recent: [call(30, 'no_answer')] })).channel).toBe('sms');
    expect(chooseChannel(input({ recent: [call(30, 'declined')] })).channel).toBe('sms');
    expect(chooseChannel(input({ recent: [call(80, 'no_answer')] })).channel).toBe('voice_call');
  });

  it('a promised call outside call hours waits instead of becoming a text', () => {
    // 20:45 in New York: after the 20:30 call window, before quiet hours.
    const late = new Date('2026-10-13T00:45:00Z');
    expect(chooseChannel(input({ now: late }))).toEqual({
      channel: null,
      why: 'outside call hours',
    });
    const unpromised = { weight: 'meaningful' as const, timely: true, promisedCall: false };
    expect(chooseChannel(input({ now: late, trigger: unpromised })).channel).toBe('sms');
  });

  it('nothing but the app without a time zone on file', () => {
    expect(chooseChannel(input({ timezone: undefined })).channel).toBe('in_app');
  });

  it('a check-in that is not time-sensitive stays in the app', () => {
    const r = chooseChannel(input({ trigger: { weight: 'light', timely: false } }));
    expect(r).toEqual({ channel: 'in_app', why: 'not time-sensitive' });
  });

  it('outreach switched off stops everything', () => {
    expect(chooseChannel(input({ prefs: { enabled: false } }))).toMatchObject({ stop: true });
  });

  it('the daily total caps every channel', () => {
    const recent = [call(1, 'answered'), call(2, 'answered'), call(3, 'answered')];
    expect(chooseChannel(input({ recent }))).toEqual({ channel: null, why: 'daily limit reached' });
  });

  it('light: one a day and never a call', () => {
    const prefs = { channels: ['sms', 'voice_call'], proactiveFrequency: 'light' };
    expect(chooseChannel(input({ prefs })).channel).toBe('sms');
    const textedToday = { ...call(2, 'replied'), channel: 'sms' as const };
    expect(chooseChannel(input({ prefs, recent: [textedToday] }))).toEqual({
      channel: null,
      why: 'daily limit reached',
    });
  });
});
