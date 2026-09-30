import { describe, expect, it } from 'vitest';
import type { TalkPreference } from '../../../conversation/talk-preferences.js';
import { createTalkPreferenceRecorder } from '../talk-preference-recorder.js';

describe('createTalkPreferenceRecorder', () => {
  it('keeps to a request for the rest of the call and saves only lasting ones', () => {
    const userData: { talkPreferences?: TalkPreference[] } = {};
    const saved: TalkPreference[] = [];
    const recorder = createTalkPreferenceRecorder({ userData, saveLasting: (p) => saved.push(p) });

    recorder.heard("Tonight I just need to vent, don't fix it");
    expect(userData.talkPreferences).toEqual(['just_listen']);
    expect(saved).toEqual([]);

    recorder.heard('And in general I prefer you keep it short');
    recorder.heard('I prefer you keep it short'); // interim and final both arrive
    expect(userData.talkPreferences).toEqual(['just_listen', 'shorter']);
    expect(saved).toEqual(['shorter']);
  });

  it('starts a call with what they asked for before, and lets them take it back for now', () => {
    const userData: { talkPreferences?: TalkPreference[] } = {};
    const saved: TalkPreference[] = [];
    const recorder = createTalkPreferenceRecorder({ userData, saveLasting: (p) => saved.push(p) });
    recorder.loaded(['just_listen']);
    expect(userData.talkPreferences).toEqual(['just_listen']);

    recorder.heard('Okay, what do you think I should do?');
    expect(userData.talkPreferences).toEqual([]);
    recorder.heard('I never want advice, I just want to vent');
    expect(saved).toEqual([]); // already stored
  });
});
