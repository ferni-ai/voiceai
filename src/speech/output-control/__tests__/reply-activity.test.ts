import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_REPLY_HOLD_MS,
  clearReplyActivity,
  holdReplyAudio,
  noteReplyText,
  replyAudioHoldMs,
  replyTextSince,
} from '../reply-activity.js';
import { createFirstAudioObserver } from '../../tts-gateway/first-audio-observer.js';

afterEach(() => clearReplyActivity('s1'));

describe('reply activity', () => {
  it('tells when reply words reached TTS', () => {
    expect(replyTextSince('s1', 1000)).toBe(false);
    noteReplyText('s1', 1200);
    expect(replyTextSince('s1', 1000)).toBe(true);
    expect(replyTextSince('s1', 1300)).toBe(false);
  });

  it('holds reply audio for the rest of the clip, capped', () => {
    expect(replyAudioHoldMs('s1', 0)).toBe(0);
    holdReplyAudio('s1', 450, 1000);
    expect(replyAudioHoldMs('s1', 1100)).toBe(350);
    expect(replyAudioHoldMs('s1', 1500)).toBe(0);
    holdReplyAudio('s1', 10_000, 2000);
    expect(replyAudioHoldMs('s1', 2000)).toBe(MAX_REPLY_HOLD_MS);
  });
});

describe('first-audio observer', () => {
  it('marks reply text at the text stage', () => {
    const observe = createFirstAudioObserver({ sessionId: 's1', startTime: Date.now() });
    const before = Date.now();
    expect(replyTextSince('s1', before)).toBe(false);
    observe.stage('text');
    expect(replyTextSince('s1', before)).toBe(true);
  });

  it('holds while an opening sound plays, and not otherwise', async () => {
    const observe = createFirstAudioObserver({ sessionId: 's1', startTime: Date.now() });
    let t = Date.now();
    await observe.hold();
    expect(Date.now() - t).toBeLessThan(20);
    holdReplyAudio('s1', 60);
    t = Date.now();
    await observe.hold();
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
  });
});
