/**
 * Speech insights integration helpers.
 *
 * This is intentionally separate from ContextManager to keep the core context
 * assembly readable and to make speech logic easier to test.
 */

import type { SpeedControlResult } from '../speech/adaptive-ssml/dynamic-speed-control.js';
import type { EmotionalMomentum, ProsodyContinuityHints } from '../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../speech/human-listening-pipeline/types.js';

import type { SpeechInsightsContext } from './types.js';

export interface BuildSpeechInsightsOptions {
  humanListeningResult?: HumanListeningResult;
  emotionalMomentum?: EmotionalMomentum;
  prosodyContinuityHints?: ProsodyContinuityHints;
  speedControl?: SpeedControlResult;
}

export function buildSpeechInsightsContext(
  options: BuildSpeechInsightsOptions
): SpeechInsightsContext {
  const { humanListeningResult, emotionalMomentum, prosodyContinuityHints, speedControl } = options;

  const voiceDistressSignals = Boolean(
    humanListeningResult?.possibleDistress ||
    (humanListeningResult?.audio?.tremor?.detected ?? false)
  );

  const estimatedCognitiveLoad = estimateCognitiveLoad(humanListeningResult);

  const speechGuidance = buildSpeechGuidance({
    humanListeningResult,
    emotionalMomentum,
    speedControl,
    voiceDistressSignals,
    estimatedCognitiveLoad,
  });

  return {
    emotionalMomentum,
    prosodyContinuityHints,
    humanListeningResult,
    speedControl,
    voiceDistressSignals,
    estimatedCognitiveLoad,
    speechGuidance,
  };
}

export function formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string {
  return insights.speechGuidance ? insights.speechGuidance : '';
}

function estimateCognitiveLoad(humanListeningResult?: HumanListeningResult): number {
  if (!humanListeningResult) {
    return 0.3;
  }

  const cognitiveLevel = humanListeningResult.text.cognitiveLoad?.level;
  const textLoadScore =
    cognitiveLevel === 'overloaded'
      ? 1.0
      : cognitiveLevel === 'high'
        ? 0.8
        : cognitiveLevel === 'medium'
          ? 0.5
          : 0.3;

  const hedgingDensity = humanListeningResult.text.hedging?.hedgingDensity ?? 0;
  return Math.min(1, textLoadScore + Math.min(hedgingDensity / 20, 0.5));
}

function buildSpeechGuidance(options: {
  humanListeningResult?: HumanListeningResult;
  emotionalMomentum?: EmotionalMomentum;
  speedControl?: SpeedControlResult;
  voiceDistressSignals: boolean;
  estimatedCognitiveLoad: number;
}): string {
  const guidance: string[] = [];
  addDistressGuidance(guidance, options.voiceDistressSignals);
  addCognitiveLoadGuidance(guidance, options.estimatedCognitiveLoad);
  addMomentumGuidance(guidance, options.emotionalMomentum);
  addHumanListeningGuidance(guidance, options.humanListeningResult);
  addSpeedControlGuidance(guidance, options.speedControl);

  return guidance.length > 0 ? `[VOICE INSIGHTS]\n${guidance.join('\n')}` : '';
}

function addDistressGuidance(guidance: string[], voiceDistressSignals: boolean): void {
  if (voiceDistressSignals) {
    guidance.push('🔴 Voice shows distress signals - prioritize emotional support');
  }
}

function addCognitiveLoadGuidance(guidance: string[], estimatedCognitiveLoad: number): void {
  if (estimatedCognitiveLoad > 0.7) {
    guidance.push('User is processing heavily - use simpler language, shorter sentences');
    return;
  }
  if (estimatedCognitiveLoad > 0.5) {
    guidance.push('User showing moderate cognitive load - be clear and concise');
  }
}

function addMomentumGuidance(guidance: string[], emotionalMomentum?: EmotionalMomentum): void {
  if (!emotionalMomentum) return;

  if (emotionalMomentum.warmth === 'high') {
    guidance.push('Maintain warm, supportive tone (momentum: high warmth)');
  }

  if (emotionalMomentum.trend === 'building') {
    guidance.push('Energy is building - match the increasing momentum');
    return;
  }
  if (emotionalMomentum.trend === 'dissipating') {
    guidance.push('Energy is settling - use calm, grounding language');
  }
}

function addHumanListeningGuidance(
  guidance: string[],
  humanListeningResult: HumanListeningResult | undefined
): void {
  if (!humanListeningResult) return;
  const { text } = humanListeningResult;

  if (text.selfSoothing?.detected && text.selfSoothing.confidence > 0.5) {
    guidance.push('User is self-soothing - they need validation, not advice');
  }

  if (text.hedging?.elevated && text.hedging.shouldProbe) {
    guidance.push('User hedging significantly - gently explore what they really mean');
  }

  if (humanListeningResult.shouldSlowDown) {
    guidance.push('Slow down - user needs processing time');
  }
}

function addSpeedControlGuidance(guidance: string[], speedControl?: SpeedControlResult): void {
  if (speedControl && speedControl.reason !== 'normal pace') {
    guidance.push(`Speech pacing: ${speedControl.reason}`);
  }
}
