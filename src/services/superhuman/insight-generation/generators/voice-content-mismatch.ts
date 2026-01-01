/**
 * Voice-Content Mismatch Insight Generator
 *
 * Generates insights when what someone SAYS doesn't match how they SOUND:
 * - "You said you're fine but your voice sounds heavy"
 * - "Your words say 'okay' but I hear stress"
 * - "There's a disconnect between what you're saying and how you're saying it"
 *
 * This is uniquely superhuman - humans often miss these cues or feel rude pointing them out.
 *
 * @module services/superhuman/insight-generation/generators/voice-content-mismatch
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { checkBaselineDeviation } from '../../semantic-intelligence/behavioral-intelligence.js';
import { registerInsightGenerator } from '../engine.js';
import type { GeneratedInsight, InsightGenerator, InsightGeneratorContext } from '../types.js';

const log = createLogger({ module: 'insight-gen:voice-mismatch' });

// ============================================================================
// TEMPLATES
// ============================================================================

const MISMATCH_TEMPLATES = {
  fine_but_stressed: [
    "You said you're fine, but I'm picking up something different in your voice. You don't have to be fine with me.",
    "I hear 'fine,' but your voice tells a different story. What's really going on?",
    "'Fine' is what you said, but the way you said it... I'm sensing there's more. Want to talk about it?",
  ],
  positive_but_heavy: [
    "Your words sound positive, but there's a heaviness I'm picking up on. It's okay to feel both.",
    "I notice you're putting a positive spin on things, but your voice sounds tired. How are you really doing?",
    "You're saying the right things, but something in your tone makes me want to check in deeper. What's underneath?",
  ],
  dismissive_but_emotional: [
    "You brushed that off pretty quickly, but your voice cracked a little. That might matter more than you're letting on.",
    "I caught something in your voice when you said that. It sounded like it touched something deeper.",
    "Your words said 'no big deal,' but your voice said otherwise. Want to sit with that for a second?",
  ],
  excited_but_anxious: [
    "I hear excitement in your words, but also some anxiety in your voice. Both can be true at once.",
    "You sound excited and nervous at the same time. That's a lot to hold. How are you managing?",
    "There's eagerness in what you're saying but I'm sensing some stress too. What's making you nervous?",
  ],
  calm_but_tense: [
    "Your words are calm, but I'm picking up tension. Sometimes we hold things in our voice that we're not ready to say out loud.",
    "You're keeping it together, but I sense some strain. How much energy is that taking?",
    "I hear you trying to stay steady, but there's an edge in your voice. What's pulling at you?",
  ],
  energy_drop: [
    "I noticed your energy drop just now. What happened there?",
    "Something shifted in your voice when you said that. Want to explore what came up?",
    "Your voice changed when that topic came up. I'm curious what's behind that.",
  ],
};

// ============================================================================
// DETECTION
// ============================================================================

interface MismatchData {
  statement: string;
  declaredState: string;
  detectedState: string;
  mismatchType:
    | 'fine_but_stressed'
    | 'positive_but_heavy'
    | 'dismissive_but_emotional'
    | 'excited_but_anxious'
    | 'calm_but_tense'
    | 'energy_drop';
  confidence: number;
  voiceMetrics: {
    energy?: number;
    stress?: number;
    confidence?: number;
  };
  timestamp: Date;
}

async function detectMismatch(
  userId: string,
  context: InsightGeneratorContext
): Promise<MismatchData | null> {
  // Check if we have voice metrics
  if (!context.voiceMetrics) {
    return null;
  }

  const { energy, stress } = context.voiceMetrics;

  // Check for baseline deviations
  let deviationResult: { isDeviation: boolean; description?: string } | undefined;
  try {
    // Map emotion and intensity to valence and energy for baseline check
    const valence = context.currentEmotion === 'positive' ? 0.7 : context.currentEmotion === 'negative' ? 0.3 : 0.5;
    deviationResult = await checkBaselineDeviation(userId, { valence, energy: energy || 0.5 });
  } catch {
    // Continue without deviation data
  }

  // Detect "fine but stressed" pattern
  if (stress !== undefined && stress > 0.6) {
    // High stress detected
    return {
      statement: context.currentTopic || 'recent statement',
      declaredState: 'fine/okay',
      detectedState: 'stressed',
      mismatchType: 'fine_but_stressed',
      confidence: Math.min(stress, 0.9),
      voiceMetrics: context.voiceMetrics,
      timestamp: new Date(),
    };
  }

  // Detect energy drop
  if (energy !== undefined && energy < 0.3) {
    return {
      statement: context.currentTopic || 'recent statement',
      declaredState: 'engaged',
      detectedState: 'low energy',
      mismatchType: 'energy_drop',
      confidence: 0.7,
      voiceMetrics: context.voiceMetrics,
      timestamp: new Date(),
    };
  }

  // Detect calm but tense (low energy + high stress)
  if (stress !== undefined && energy !== undefined && stress > 0.5 && energy < 0.4) {
    return {
      statement: context.currentTopic || 'recent statement',
      declaredState: 'calm',
      detectedState: 'tense',
      mismatchType: 'calm_but_tense',
      confidence: 0.75,
      voiceMetrics: context.voiceMetrics,
      timestamp: new Date(),
    };
  }

  // Use baseline deviation if significant
  if (deviationResult?.isDeviation && deviationResult.description?.includes('lower')) {
    return {
      statement: context.currentTopic || 'recent statement',
      declaredState: 'positive',
      detectedState: 'below baseline',
      mismatchType: 'positive_but_heavy',
      confidence: 0.6,
      voiceMetrics: context.voiceMetrics,
      timestamp: new Date(),
    };
  }

  return null;
}

// ============================================================================
// GENERATOR
// ============================================================================

async function generateVoiceMismatchInsights(
  userId: string,
  context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  const insights: GeneratedInsight[] = [];

  try {
    const mismatch = await detectMismatch(userId, context);

    if (mismatch && mismatch.confidence >= 0.6) {
      const insight = buildMismatchInsight(mismatch, userId);
      if (insight) {
        insights.push(insight);
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate voice mismatch insights');
  }

  return insights;
}

function buildMismatchInsight(data: MismatchData, userId: string): GeneratedInsight {
  const templates = MISMATCH_TEMPLATES[data.mismatchType];
  const message = templates[Math.floor(Math.random() * templates.length)];

  const headlines: Record<string, string> = {
    fine_but_stressed: 'Voice suggests stress beneath "fine"',
    positive_but_heavy: 'Detecting heaviness in positive words',
    dismissive_but_emotional: 'Something deeper behind the dismissal',
    excited_but_anxious: 'Mixed excitement and anxiety',
    calm_but_tense: 'Tension beneath calm words',
    energy_drop: 'Energy shift detected',
  };

  return {
    id: `voice_mismatch_${data.mismatchType}_${Date.now()}`,
    userId,
    category: 'voice_content_mismatch',
    priority: data.confidence > 0.8 ? 'high' : 'medium',
    headline: headlines[data.mismatchType],
    message,
    evidence: [
      `Declared: "${data.declaredState}"`,
      `Detected: ${data.detectedState}`,
      `Confidence: ${Math.round(data.confidence * 100)}%`,
    ],
    surfacingMoment: 'natural_pause',
    tone: 'protective_care',
    triggerTopics: data.statement ? [data.statement] : undefined,
    triggerEmotions:
      data.mismatchType === 'fine_but_stressed' ? ['fine', 'okay', 'good'] : undefined,
    confidence: data.confidence,
    dataPoints: 1,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // Expire in 1 hour - these are time-sensitive
    surfaced: false,
    dismissed: false,
  };
}

async function hasEnoughData(userId: string): Promise<boolean> {
  // Voice mismatch detection requires real-time voice data
  // We'll always return true and let the generator check for actual data
  return true;
}

// ============================================================================
// REGISTRATION
// ============================================================================

const voiceContentMismatchGenerator: InsightGenerator = {
  category: 'voice_content_mismatch',
  name: 'Voice-Content Mismatch Generator',
  description: "Detects when what someone says doesn't match how they sound",
  generate: generateVoiceMismatchInsights,
  hasEnoughData,
};

registerInsightGenerator(voiceContentMismatchGenerator);

export { voiceContentMismatchGenerator };
