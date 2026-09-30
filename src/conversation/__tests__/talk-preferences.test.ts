import { describe, expect, it } from 'vitest';
import {
  applyTalkRequests,
  detectTalkRequests,
  formatTalkPreferences,
  isTalkPreference,
  type TalkPreference,
} from '../talk-preferences.js';

const prefs = (text: string) => detectTalkRequests(text).map((r) => `${r.preference}:${r.on}`);

describe('detectTalkRequests', () => {
  it('hears how they ask to be talked to', () => {
    expect(prefs("I don't need you to fix it, I just need to vent")).toEqual(['just_listen:true']);
    expect(prefs("I'm not looking for advice right now")).toEqual(['just_listen:true']);
    expect(prefs("Don't sugarcoat it")).toEqual(['be_direct:true']);
    expect(prefs('Why are you asking so many questions')).toEqual(['fewer_questions:true']);
    expect(prefs('Can you keep it short')).toEqual(['shorter:true']);
  });

  it('does not mistake everyday phrases for a request', () => {
    expect(prefs('Just listen to this song, it is amazing')).toEqual([]);
    expect(prefs('My boss is so direct with everyone')).toEqual([]);
  });

  it('takes "just listen" back when they ask what to do', () => {
    expect(prefs('Okay, what do you think I should do?')).toEqual(['just_listen:false']);
  });

  it('tells a lasting preference from a request for right now', () => {
    expect(detectTalkRequests('I never want advice, I just want to vent')[0].lasting).toBe(true);
    expect(detectTalkRequests('I hate it when you sugarcoat things')[0].lasting).toBe(true);
    expect(detectTalkRequests("Tonight I just need to vent, don't fix it")[0].lasting).toBe(false);
  });
});

describe('applyTalkRequests', () => {
  it('adds requests and removes ones taken back', () => {
    const start = new Set<TalkPreference>(['just_listen', 'shorter']);
    const next = applyTalkRequests(start, detectTalkRequests('So what should I do?'));
    expect([...next]).toEqual(['shorter']);
    expect([...start]).toEqual(['just_listen', 'shorter']);
  });
});

describe('formatTalkPreferences', () => {
  it('asks the reply to keep to them without mentioning it', () => {
    const note = formatTalkPreferences(new Set<TalkPreference>(['just_listen']));
    expect(note).toContain('[HOW THEY HAVE ASKED YOU TO TALK]');
    expect(note).toMatch(/no advice unless they ask/);
    expect(note).toMatch(/without mentioning it/);
    expect(formatTalkPreferences(new Set())).toBeNull();
  });

  it('recognizes stored values', () => {
    expect(isTalkPreference('be_direct')).toBe(true);
    expect(isTalkPreference('toString')).toBe(false);
  });
});
