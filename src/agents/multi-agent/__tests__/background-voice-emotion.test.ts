/**
 * The background turn-intelligence pass and the caller's voice emotion
 * (BACKGROUND_VOICE_EMOTION). Every turn here goes through the real exported
 * entry, createTurnIntelligenceHook; only the turn handler is injected, so the
 * turn context it builds is captured and fed to the real readers: the
 * emotional-state builder (which runs voice-mismatch.ts) and the turn crisis read.
 * All voices and words are synthetic. Masking and crisis are pinned in
 * background-voice-emotion-masking.test.ts and background-voice-emotion-crisis.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NATIVE_VOICE_QUALITY,
  type VoiceEmotionResult,
} from '../../../speech/audio-prosody/index.js';
import { backgroundVoiceEmotion, backgroundVoiceEmotionOn } from '../background-voice-emotion.js';
import {
  analyzerReading,
  backgroundCrisis,
  backgroundTurn,
  CALM,
  emotionalState,
  FLAT,
  GOLDEN_TURNS,
  VOICES,
} from './background-voice-fixtures.js';

afterEach(() => vi.unstubAllEnvs());

describe('BACKGROUND_VOICE_EMOTION', () => {
  it('is off by default', () => {
    expect(backgroundVoiceEmotionOn({})).toBe(false);
    expect(backgroundVoiceEmotionOn({ BACKGROUND_VOICE_EMOTION: 'on' })).toBe(true);
  });

  it('flag off: the voice-vs-words read gets no voice; on: it gets it and reads the sad "fine"', async () => {
    const text = "I'm fine, really, it was a normal day.";
    const sad = analyzerReading(VOICES.sad);

    const off = await backgroundTurn(text, sad);
    expect(off.userData.voiceEmotion).toBeUndefined(); // the gap: the detector input is null
    expect(emotionalState(off, text).mismatch).toBeUndefined();

    const on = await backgroundTurn(text, sad, 'on');
    expect(on.userData.voiceEmotion).toEqual(backgroundVoiceEmotion(sad));
    const { mismatch } = emotionalState(on, text);
    expect(mismatch?.type).toBe('masking_negative');
    expect(mismatch?.voiceEmotion).toBe('sad');
    expect(mismatch?.shouldSurface).toBe(true);
  });

  it('flag on: the top-level voice emotion carries real arousal and measured valence', async () => {
    const flat = analyzerReading(FLAT);
    const view = backgroundVoiceEmotion(flat);
    const on = await backgroundTurn('ok so anyway', flat, 'on');
    expect(on.voiceEmotion).toEqual({
      primary: view?.primary,
      confidence: view?.confidence,
      arousal: flat.arousal,
      valence: view?.valence,
    });
    expect(typeof flat.arousal).toBe('number');
  });

  it('flag off: the turn context is byte-identical to main for 24 synthetic turns', async () => {
    // Recorded on origin/main 5bc761f41 with the same turns and session ids.
    const contexts = await Promise.all(
      GOLDEN_TURNS.map(([text, voice], i) =>
        backgroundTurn(text, voice, '', `session-bve-golden-${i}`)
      )
    );
    for (const ctx of contexts) expect('voiceEmotion' in ctx.userData).toBe(false);
    const seen = contexts.map((ctx) =>
      JSON.stringify({ userData: ctx.userData, voiceEmotion: ctx.voiceEmotion })
    );
    expect(seen).toEqual(GOLDEN_OFF);
  });

  it('a crisis turn with a calm, bright voice reads the same crisis with the flag on and off', async () => {
    const text = 'i have decided to end my life tonight';
    const calm = analyzerReading(CALM);
    expect(backgroundVoiceEmotion(calm)?.valence).toBeGreaterThan(0.3);

    const off = await backgroundCrisis(text, calm, '');
    const on = await backgroundCrisis(text, calm, 'on');
    expect(off.voiceSeen).toBe(false);
    expect(on.voiceSeen).toBe(true);
    expect(off.patterns.isCrisis).toBe(true); // not vacuous: this turn is a crisis
    expect(on.patterns).toEqual(off.patterns);
    expect(on.shouldBlock).toBe(off.shouldBlock);
    expect(on.resolved).toEqual(off.resolved);
  });

  it('never reads jitter, shimmer or breathiness: the view is the same whatever they hold', () => {
    for (const voice of Object.values(VOICES)) {
      const variants = [
        NATIVE_VOICE_QUALITY,
        { jitter: 0, shimmer: 0, breathiness: 0 },
        { jitter: 0.2, shimmer: 0.3, breathiness: 0.6 },
      ].map((quality) => backgroundVoiceEmotion(analyzerReading({ ...voice, ...quality })));
      expect(variants[1]).toEqual(variants[0]);
      expect(variants[2]).toEqual(variants[0]);
    }
    // ...while a measured feature does move it
    const steadier = backgroundVoiceEmotion(analyzerReading({ ...FLAT, pauseFrequency: 6 }));
    expect(steadier?.anxietyMarkers).toBe(false);
    expect(backgroundVoiceEmotion(analyzerReading(FLAT))?.anxietyMarkers).toBe(true);
  });

  it('gives no view without a reading or its prosody', () => {
    expect(backgroundVoiceEmotion(undefined)).toBeUndefined();
    const { prosody: _dropped, ...noProsody } = analyzerReading(FLAT);
    expect(backgroundVoiceEmotion(noProsody as VoiceEmotionResult)).toBeUndefined();
  });
});

const GOLDEN_OFF: string[] = [
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"neutral","confidence":0.8558666990726501}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"bored","confidence":0.9070546312945824}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"happy","confidence":0.9721570209661128}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"neutral","confidence":0.9969861431133291}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"anxious","confidence":0.9149522041907231}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"sad","confidence":0.9124861621759188}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"angry","confidence":1}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"bored","confidence":0.9070546312945824}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"anxious","confidence":0.9149522041907231}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"sad","confidence":0.9124861621759188}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"anxious","confidence":0.9149522041907231}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"neutral","confidence":0.8558666990726501}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"happy","confidence":0.9721570209661128}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"sad","confidence":0.9124861621759188}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"bored","confidence":0.9070546312945824}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"neutral","confidence":0.9969861431133291}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"angry","confidence":1}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"bored","confidence":0.9070546312945824}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"bored","confidence":0.9070546312945824}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"happy","confidence":0.9721570209661128}}',
  '{"userData":{"turnCount":4,"callerTurn":1,"pauseBeforeMs":0},"voiceEmotion":{"primary":"anxious","confidence":0.9149522041907231}}',
];
