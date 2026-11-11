/**
 * Synthetic voices and turns for the BACKGROUND_VOICE_EMOTION tests. Every voice is
 * a made-up feature set run through the analyzer's own functions; every turn goes
 * through the real background entry, createTurnIntelligenceHook, with only the turn
 * handler injected so the turn context it builds can be read.
 */
import { llm } from '@livekit/agents';
import { expect, vi } from 'vitest';
import { buildEmotionalState } from '../../processors/emotional-state-builder.js';
import type { TurnAnalysisResult, TurnContext } from '../../processors/types.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { detectEmotion } from '../../../services/emotion-detection.js';
import {
  calculateStressLevel,
  classifyEmotion,
  detectAnxietyMarkers,
  mapToEmotionalDimensions,
  NATIVE_VOICE_QUALITY,
  type ProsodyFeatures,
  type VoiceEmotionResult,
} from '../../../speech/audio-prosody/index.js';
import { createTurnIntelligenceHook, type TurnIntelligenceDeps } from '../turn-intelligence.js';

const persona = { id: 'ferni', name: 'Ferni' } as unknown as TurnIntelligenceDeps['persona'];
const BASELINE = { pitch: 180, energy: 60, rate: 4.5 };

/** A reading shaped as AudioProsodyAnalyzer.analyze() returns it, from these features. */
export function analyzerReading(prosody: ProsodyFeatures): VoiceEmotionResult {
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

type Shape = Pick<
  ProsodyFeatures,
  | 'pitchContour'
  | 'speakingRatio'
  | 'pitchRange'
  | 'pitchMean'
  | 'energyMean'
  | 'speechRate'
  | 'pitchVariance'
  | 'energyPeaks'
>;

/** A native-shaped reading: what mapNativeToJsFeatures writes, voice quality included. */
export function nativeVoice(shape: Shape): ProsodyFeatures {
  return {
    energyVariance: 5,
    pauseDuration: 500,
    pauseFrequency: 8,
    utteranceDuration: 3000,
    ...NATIVE_VOICE_QUALITY,
    ...shape,
  };
}

/** Flat and halting: low, level pitch, quiet, slow, many pauses. */
export const FLAT: ProsodyFeatures = {
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
  ...NATIVE_VOICE_QUALITY,
  utteranceDuration: 3000,
  speakingRatio: 0.35,
};

/** Calm and bright: rising, varied pitch, steady pace, few pauses. */
export const CALM: ProsodyFeatures = {
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

/** The seven voices the crisis tests read every line with. */
export const VOICES: Record<string, ProsodyFeatures> = {
  calm: CALM,
  happy: nativeVoice({
    pitchContour: 'rising',
    speakingRatio: 0.95,
    pitchRange: 150,
    pitchMean: 210,
    energyMean: 70,
    speechRate: 7.5,
    pitchVariance: 150,
    energyPeaks: 0,
  }),
  neutral: nativeVoice({
    pitchContour: 'flat',
    speakingRatio: 0.5,
    pitchRange: 60,
    pitchMean: 180,
    energyMean: 60,
    speechRate: 4.5,
    pitchVariance: 3,
    energyPeaks: 0,
  }),
  anxious: nativeVoice({
    pitchContour: 'falling',
    speakingRatio: 0.2,
    pitchRange: 5,
    pitchMean: 250,
    energyMean: 50,
    speechRate: 7.5,
    pitchVariance: 150,
    energyPeaks: 0,
  }),
  sad: nativeVoice({
    pitchContour: 'falling',
    speakingRatio: 0.2,
    pitchRange: 5,
    pitchMean: 150,
    energyMean: 40,
    speechRate: 2,
    pitchVariance: 3,
    energyPeaks: 2,
  }),
  angry: nativeVoice({
    pitchContour: 'flat',
    speakingRatio: 0.2,
    pitchRange: 5,
    pitchMean: 150,
    energyMean: 80,
    speechRate: 7.5,
    pitchVariance: 150,
    energyPeaks: 2,
  }),
  flat: FLAT,
};

let turn = 0;
/** Runs one synthetic turn through the real background entry; returns the turn context it built. */
export async function backgroundTurn(
  text: string,
  voice: unknown,
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
export function emotionalState(ctx: { userData: Record<string, unknown> }, text: string) {
  const analysis = { emotion: detectEmotion(text) } as unknown as TurnAnalysisResult['analysis'];
  return buildEmotionalState({ userText: text, userData: ctx.userData } as unknown as TurnContext, {
    analysis,
    currentTopic: undefined,
    previousTopic: undefined,
    topicChanged: false,
  });
}

/** The turn crisis read of a background turn: the pattern reading, its block, and the settled read. */
export async function backgroundCrisis(text: string, voice: unknown, flag: 'on' | '') {
  const ctx = await backgroundTurn(text, voice, flag);
  return crisisOf(text, ctx.userData);
}

/** The turn crisis read for these user data (turn-crisis.ts), every optional stage off. */
export async function crisisOf(text: string, userData: Record<string, unknown> | undefined) {
  const crisis = startTurnCrisis(text, userData, { env: {} });
  return {
    voiceSeen: userData?.voiceEmotion !== undefined,
    patterns: crisis.patterns,
    shouldBlock: crisis.shouldBlock,
    resolved: await crisis.resolve(),
  };
}

const reading = (name: keyof typeof VOICES) => analyzerReading(VOICES[name]);
const { prosody: _none, ...noProsody } = analyzerReading(FLAT);

/** The flag-off golden turns: every voice, no voice, a null voice and a reading with no prosody. */
export const GOLDEN_TURNS: Array<[string, unknown]> = [
  ['we went to the lake on saturday', reading('calm')],
  ["I'm fine, just tired", reading('flat')],
  ['what time is it in Lisbon', undefined],
  ['the new bakery on our street is so good', reading('happy')],
  ['can you remind me to call the dentist', reading('neutral')],
  ["it's okay, no big deal", reading('anxious')],
  ["i'm good, really", reading('sad')],
  ['the delivery came late again and i am done with them', reading('angry')],
  ['work was a nightmare, my boss is killing me', reading('flat')],
  ["i can't do this anymore, my inbox is out of control", reading('anxious')],
  ["i'm a burden to everyone around me", reading('sad')],
  ["i'm so tired of being alive", reading('anxious')],
  ['i want to kill myself', reading('calm')],
  ['everyone would be better off without me', reading('happy')],
  ['my friend wants to kill herself and honestly i get why', reading('sad')],
  ['tell me a joke about penguins', null],
  ['whatever, it is what it is', noProsody],
  ["i've been hurting myself again", undefined],
  ['what should i cook tonight', reading('neutral')],
  ["honestly i'm just venting, the commute was awful", reading('angry')],
  ['i keep thinking about ending my life', reading('flat')],
  ['nothing matters anymore', noProsody],
  ['the game last night was incredible', reading('happy')],
  ["i'm fine, it was a normal day", reading('anxious')],
];
