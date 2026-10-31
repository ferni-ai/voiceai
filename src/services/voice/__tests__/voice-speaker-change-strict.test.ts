/**
 * SPEAKER_CHECK_STRICT on the real SpeakerChangeDetector (speaker-change-evidence.ts).
 * Only the embedding model is replaced: scripted-voices.ts states what each 2 s
 * window embeds as. Odd windows (a laugh, a cough, Ferni's voice leaking back)
 * must not become "someone new", a real second person still must, and `off`
 * restores the old 2-window rule.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../voice-memory-enhanced.js', async () => ({
  extractSpeakerEmbedding: (await import('./scripted-voices.js')).extractScripted,
}));

import { endHouseholdSession } from '../voice-household.js';
import { SpeakerChangeDetector, type SpeakerChangeEvent } from '../voice-speaker-change.js';
import { resetScript, speakWindows, VOICE } from './scripted-voices.js';

const DEVICE = 'strict-speaker-device';
const { CALLER, ECHO, LAUGH, COUGH, OTHER } = VOICE;

let detector: SpeakerChangeDetector;
let changes: SpeakerChangeEvent[];

function startDetector(): void {
  detector = new SpeakerChangeDetector(DEVICE);
  changes = [];
  detector.on('speaker_changed', (e: SpeakerChangeEvent) => changes.push(e));
  detector.start('user-1');
}

beforeEach(() => {
  vi.useFakeTimers();
  resetScript();
});

afterEach(() => {
  detector.stop();
  endHouseholdSession(DEVICE);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('SPEAKER_CHECK_STRICT on (the default)', () => {
  beforeEach(startDetector);

  it("one odd window between the caller's windows is no change", async () => {
    await speakWindows(detector, CALLER, ECHO, CALLER, CALLER);
    expect(changes).toEqual([]);
  });

  it('two odd windows in a row are no change, and the caller still reads as the caller', async () => {
    await speakWindows(detector, CALLER, ECHO, LAUGH, CALLER, CALLER, CALLER, CALLER);
    expect(changes).toEqual([]);
    expect(detector.getState().currentSpeakerId).toBe('user-1');
  });

  it('three odd windows unlike each other (a laugh, a cough, echo) are no change', async () => {
    await speakWindows(detector, CALLER, LAUGH, COUGH, ECHO, CALLER, CALLER);
    expect(changes).toEqual([]);
  });

  it('a second person who keeps talking is still a change, once', async () => {
    await speakWindows(detector, CALLER, OTHER, OTHER);
    expect(changes).toEqual([]); // 2 windows are not enough evidence yet

    await speakWindows(detector, OTHER);
    expect(changes).toHaveLength(1);
    expect(changes[0].previousSpeakerId).toBe('user-1');
    expect(changes[0].confidence).toBeGreaterThan(detector.getChangeConfidenceThreshold());

    // The new person is now the reference: no ping-pong while they talk on
    await speakWindows(detector, OTHER, OTHER, OTHER);
    expect(changes).toHaveLength(1);
  });
});

describe('SPEAKER_CHECK_STRICT=off (the kill switch): the old rule', () => {
  beforeEach(() => {
    vi.stubEnv('SPEAKER_CHECK_STRICT', 'off');
    startDetector();
  });

  it('two windows confirm a second person', async () => {
    await speakWindows(detector, CALLER, OTHER, OTHER);
    expect(changes).toHaveLength(1);
  });

  it('two odd windows confirm a change, and the caller then reads as someone else', async () => {
    await speakWindows(detector, CALLER, ECHO, LAUGH, CALLER, CALLER);
    expect(changes).toHaveLength(2);
    expect(changes[1].previousSpeakerId).toBeNull();
  });
});
