/**
 * The background turn-intelligence pass and the caller's voice emotion
 * (BACKGROUND_VOICE_EMOTION). Every turn here goes through the real exported
 * entry, createTurnIntelligenceHook; only the turn handler is injected, so the
 * turn context it builds is captured and fed to the real readers: the
 * emotional-state builder (which runs voice-mismatch.ts) and the turn crisis read.
 * All voices and words are synthetic.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEmotionalState } from '../../processors/emotional-state-builder.js';
import type { TurnAnalysisResult, TurnContext } from '../../processors/types.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { detectEmotion } from '../../../services/emotion-detection.js';
import {
  calculateStressLevel,
  classifyEmotion,
  detectAnxietyMarkers,
  mapToEmotionalDimensions,
  type ProsodyFeatures,
  type VoiceEmotionResult,
} from '../../../speech/audio-prosody/index.js';
import { backgroundVoiceEmotion, backgroundVoiceEmotionOn } from '../background-voice-emotion.js';
import { createTurnIntelligenceHook, type TurnIntelligenceDeps } from '../turn-intelligence.js';

const persona = { id: 'ferni', name: 'Ferni' } as unknown as TurnIntelligenceDeps['persona'];

/** What the native analyzer writes for the three features it does not measure (analyzer.ts). */
const NATIVE_DEFAULTS = { jitter: 0.02, shimmer: 0.03, breathiness: 0.1 } as const;
const BASELINE = { pitch: 180, energy: 60, rate: 4.5 };

/** A reading shaped as AudioProsodyAnalyzer.analyze() returns it, from these features. */
function analyzerReading(prosody: ProsodyFeatures): VoiceEmotionResult {
  const dimensions = mapToEmotionalDimensions(prosody, BASELINE, true);
  const { emotion, confidence } = classifyEmotion(dimensions, prosody);
  return {
    primary: emotion,
    confidence,
    ...dimensions,
    stressLevel: calculateStressLevel(prosody, dimensions),
    anxietyMarkers: detectAnxietyMarkers(prosody),
    prosody,
    sampleCount: 12,
    processingTimeMs: 4,
  };
}

/** Flat and halting: low, level pitch, quiet, slow, many pauses. */
const FLAT: ProsodyFeatures = {
  pitchMean: 150,
  pitchVariance: 3,
  pitchRange: 15,
  pitchContour: 'flat',
  energyMean: 50,
  energyVariance: 4,
  energyPeaks: 2,
  speechRate: 2.5,
  pauseDuration: 700,
  pauseFrequency: 18,
  ...NATIVE_DEFAULTS,
  utteranceDuration: 3000,
  speakingRatio: 0.35,
};

/** Calm and bright: rising, varied pitch, steady pace, few pauses. */
const CALM: ProsodyFeatures = {
  ...FLAT,
  pitchMean: 185,
  pitchVariance: 40,
  pitchRange: 60,
  pitchContour: 'rising',
  energyMean: 62,
  speechRate: 4.2,
  pauseFrequency: 4,
  speakingRatio: 0.8,
};

let turn = 0;
/** Runs one synthetic turn through the real background entry; returns the turn context it built. */
async function backgroundTurn(
  text: string,
  voice: VoiceEmotionResult | undefined,
  flag: 'on' | '' = '',
  sessionId = `session-bve-${(turn += 1)}`
): Promise<{ userData: Record<string, unknown>; voiceEmotion?: unknown }> {
  vi.stubEnv('BACKGROUND_VOICE_EMOTION', flag);
  const services = {
    sessionId,
    userId: 'user-bve',
  } as unknown as TurnIntelligenceDeps['services'];
  const userData = {
    turnCount: 4,
    voiceEmotion: voice,
  } as unknown as TurnIntelligenceDeps['userData'];
  const handle = vi.fn().mockResolvedValue(undefined);
  const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
  await hook(llm.ChatContext.empty(), llm.ChatMessage.create({ role: 'user', content: text }));
  expect(handle).toHaveBeenCalledTimes(1);
  return handle.mock.calls[0][0];
}

/** The emotional state the turn processor builds from that context (processTurn, emotional-state-builder.ts). */
function emotionalState(ctx: { userData: Record<string, unknown> }, text: string) {
  const analysis = { emotion: detectEmotion(text) } as unknown as TurnAnalysisResult['analysis'];
  return buildEmotionalState({ userText: text, userData: ctx.userData } as unknown as TurnContext, {
    analysis,
    currentTopic: undefined,
    previousTopic: undefined,
    topicChanged: false,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('BACKGROUND_VOICE_EMOTION', () => {
  it('is off by default', () => {
    expect(backgroundVoiceEmotionOn({})).toBe(false);
    expect(backgroundVoiceEmotionOn({ BACKGROUND_VOICE_EMOTION: 'on' })).toBe(true);
  });

  it('flag off: the voice-vs-words read gets no voice; on: it gets it and reads the flat "fine"', async () => {
    const text = "I'm fine, really, it was a normal day.";
    const flat = analyzerReading(FLAT);

    const off = await backgroundTurn(text, flat);
    expect(off.userData.voiceEmotion).toBeUndefined(); // the gap: the detector input is null
    expect(emotionalState(off, text).mismatch).toBeUndefined();

    const on = await backgroundTurn(text, flat, 'on');
    expect(on.userData.voiceEmotion).toEqual(backgroundVoiceEmotion(flat));
    const { mismatch } = emotionalState(on, text);
    expect(mismatch?.type).toBe('masking_negative');
    expect(mismatch?.voiceEmotion).toBe('anxious');
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

  it('flag off: the turn context is byte-identical to main for three synthetic turns', async () => {
    // Recorded on origin/main 5bc761f41 with the same turns and session ids.
    const turns: Array<[string, VoiceEmotionResult | undefined]> = [
      ['we went to the lake on saturday', analyzerReading(CALM)],
      ["I'm fine, just tired", analyzerReading(FLAT)],
      ['what time is it in Lisbon', undefined],
    ];
    const contexts = await Promise.all(
      turns.map(([text, voice], i) => backgroundTurn(text, voice, '', `session-bve-golden-${i}`))
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

    const read = async (flag: 'on' | '') => {
      const ctx = await backgroundTurn(text, calm, flag);
      const crisis = startTurnCrisis(text, ctx.userData, { env: {} });
      const resolved = await crisis.resolve();
      return {
        voiceSeen: ctx.userData.voiceEmotion !== undefined,
        patterns: crisis.patterns,
        shouldBlock: crisis.shouldBlock,
        resolved,
      };
    };
    const off = await read('');
    const on = await read('on');
    expect(off.voiceSeen).toBe(false);
    expect(on.voiceSeen).toBe(true);
    expect(off.patterns.isCrisis).toBe(true); // not vacuous: this turn is a crisis
    expect(on.patterns).toEqual(off.patterns);
    expect(on.shouldBlock).toBe(off.shouldBlock);
    expect(on.resolved).toEqual(off.resolved);
  });

  it('never reads jitter, shimmer or breathiness: the view is the same whatever they hold', () => {
    const variants = [
      NATIVE_DEFAULTS,
      { jitter: 0, shimmer: 0, breathiness: 0 },
      { jitter: 0.2, shimmer: 0.3, breathiness: 0.6 },
    ].map((quality) => backgroundVoiceEmotion(analyzerReading({ ...FLAT, ...quality })));
    expect(variants[1]).toEqual(variants[0]);
    expect(variants[2]).toEqual(variants[0]);
    // ...while a measured feature does move it
    const steadier = backgroundVoiceEmotion(analyzerReading({ ...FLAT, pauseFrequency: 6 }));
    expect(steadier?.anxietyMarkers).toBe(false);
    expect(variants[0]?.anxietyMarkers).toBe(true);
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
];
