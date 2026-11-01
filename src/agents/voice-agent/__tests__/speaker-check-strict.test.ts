/**
 * SPEAKER_CHECK_STRICT on the agent side, real modules end to end with only the
 * embedding model scripted (scripted-voices.ts):
 * - the caller's frames while Ferni speaks (and 600 ms after) never reach the
 *   session's detector (speaker-change-feed.ts);
 * - "Yes, it's me" re-anchors the detector, so the same caller is not asked again.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/voice-memory-enhanced.js', async () => ({
  extractSpeakerEmbedding: (await import('../../../services/voice/__tests__/scripted-voices.js'))
    .extractScripted,
}));

import {
  extractionCount,
  resetScript,
  script,
  speakFrames,
  speakWindows,
  VOICE,
} from '../../../services/voice/__tests__/scripted-voices.js';
import { endHouseholdSession } from '../../../services/voice/voice-household.js';
import {
  getSpeakerChangeDetector,
  removeSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../../../services/voice/voice-speaker-change.js';
import { cleanupSession, onAgentStateChanged } from '../../shared/response-orchestrator.js';
import { applySpeakerCheckReply } from '../speaker-check.js';
import { AGENT_SPEECH_TAIL_MS, feedSpeakerChangeDetector } from '../speaker-change-feed.js';

const SESSION = 'session-speaker-check-strict';
const { CALLER, CALLER_FAR } = VOICE;

/** 2 s of the caller, as LiveKit's Int16 frames, through the agent's feed. */
function callerSpeaks(userData: { lastAgentSpeechEndTime?: number }, now: number): void {
  script.push(CALLER);
  speakFrames((frame) => {
    const pcm = Int16Array.from(frame, (x) => Math.round(x * 32767));
    feedSpeakerChangeDetector(SESSION, pcm, false, userData, now);
  });
}

let changes: SpeakerChangeEvent[];

beforeEach(() => {
  vi.useFakeTimers();
  resetScript();
  changes = [];
  const detector = getSpeakerChangeDetector(SESSION);
  detector.on('speaker_changed', (e: SpeakerChangeEvent) => changes.push(e));
  detector.start('user-1');
});

afterEach(() => {
  removeSpeakerChangeDetector(SESSION);
  endHouseholdSession(SESSION);
  cleanupSession(SESSION);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('caller frames while Ferni is audible', () => {
  it('are not fed while Ferni speaks', async () => {
    onAgentStateChanged(SESSION, 'speaking');
    callerSpeaks({}, Date.now());
    await vi.advanceTimersByTimeAsync(2000);
    expect(extractionCount()).toBe(0);
  });

  it(`are not fed within ${AGENT_SPEECH_TAIL_MS} ms after Ferni stops, and are after that`, async () => {
    const stoppedAt = Date.now();
    callerSpeaks({ lastAgentSpeechEndTime: stoppedAt }, stoppedAt + AGENT_SPEECH_TAIL_MS - 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(extractionCount()).toBe(0);

    callerSpeaks({ lastAgentSpeechEndTime: stoppedAt }, stoppedAt + AGENT_SPEECH_TAIL_MS);
    await vi.advanceTimersByTimeAsync(2000);
    expect(extractionCount()).toBe(1);
  });

  it('are fed while Ferni speaks with SPEAKER_CHECK_STRICT=off (the old behaviour)', async () => {
    vi.stubEnv('SPEAKER_CHECK_STRICT', 'off');
    onAgentStateChanged(SESSION, 'speaking');
    callerSpeaks({}, Date.now());
    await vi.advanceTimersByTimeAsync(2000);
    expect(extractionCount()).toBe(1);
  });
});

describe('"Yes, it\'s me"', () => {
  it('re-anchors the detector: the same caller is not reported as someone new again', async () => {
    const detector = getSpeakerChangeDetector(SESSION);
    // The caller sounds different for a while (moved away, switched to speakerphone)
    await speakWindows(detector, CALLER, CALLER, CALLER_FAR, CALLER_FAR, CALLER_FAR);
    expect(changes).toHaveLength(1);

    await applySpeakerCheckReply(SESSION, 'user-1', 'still_me');
    await speakWindows(detector, CALLER, CALLER, CALLER, CALLER_FAR, CALLER, CALLER_FAR);

    expect(changes).toHaveLength(1);
    expect(detector.getState().currentSpeakerId).toBe('user-1');
  });
});
