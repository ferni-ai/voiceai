/**
 * Energy Mirroring Context Builder
 *
 * Great friends match your energy. When you're exhausted, they don't
 * bombard you with enthusiasm. When you're excited, they share the joy.
 * This builder helps Ferni mirror the user's energy appropriately.
 *
 * Energy levels:
 * - Exhausted/Depleted → Calm, gentle, low-energy
 * - Low/Subdued → Quiet, steady, warm
 * - Neutral → Balanced engagement
 * - Engaged/Active → Match engagement, more animated
 * - Excited/High → Share enthusiasm, match excitement
 *
 * @module EnergyMirroringContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from '../index.js';

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EnergyMirroring' });

// ============================================================================
// ENERGY DETECTION
// ============================================================================

type EnergyLevel = 'exhausted' | 'low' | 'neutral' | 'engaged' | 'excited';

interface EnergySignals {
  textEnergy: EnergyLevel;
  emotionEnergy: EnergyLevel;
  voiceEnergy?: EnergyLevel;
  timeContext?: 'late_night' | 'early_morning' | 'normal';
}

/**
 * Detect energy from text patterns
 */
function detectTextEnergy(text: string): EnergyLevel {
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // Exhausted signals
  if (
    lower.includes('so tired') ||
    lower.includes('exhausted') ||
    lower.includes("can't even") ||
    lower.includes('drained') ||
    lower.includes('burned out') ||
    lower.includes('wiped')
  ) {
    return 'exhausted';
  }

  // Low energy signals
  if (
    lower.includes('tired') ||
    lower.includes('meh') ||
    lower.includes('whatever') ||
    lower.includes('i guess') ||
    lower.includes("don't know") ||
    lower.includes('blah') ||
    (wordCount < 5 && !lower.includes('!'))
  ) {
    return 'low';
  }

  // Excited signals
  if (
    lower.includes('!!!') ||
    lower.includes('omg') ||
    lower.includes('amazing') ||
    lower.includes('incredible') ||
    lower.includes("can't believe") ||
    lower.includes('so excited') ||
    lower.includes('guess what') ||
    text.split('!').length > 2
  ) {
    return 'excited';
  }

  // Engaged signals
  if (
    lower.includes('really') ||
    lower.includes('actually') ||
    text.includes('!') ||
    text.includes('?') ||
    wordCount > 30
  ) {
    return 'engaged';
  }

  return 'neutral';
}

/**
 * Detect energy from emotion analysis
 */
function detectEmotionEnergy(analysis: ContextBuilderInput['analysis']): EnergyLevel {
  const emotion = analysis?.emotion;

  if (!emotion) return 'neutral';

  const primary = emotion.primary?.toLowerCase() || '';
  const intensity = emotion.intensity || 0.5;

  // High arousal emotions
  if (['excitement', 'joy', 'enthusiasm', 'anger', 'fear'].includes(primary)) {
    if (intensity > 0.7) return 'excited';
    if (intensity > 0.4) return 'engaged';
  }

  // Low arousal emotions
  if (['sadness', 'melancholy', 'tired', 'bored', 'disappointed'].includes(primary)) {
    if (intensity > 0.7) return 'exhausted';
    if (intensity > 0.4) return 'low';
  }

  // Neutral-ish emotions
  if (['calm', 'content', 'thoughtful', 'curious'].includes(primary)) {
    return intensity > 0.5 ? 'engaged' : 'neutral';
  }

  return 'neutral';
}

/**
 * Detect time-based energy context
 */
function detectTimeContext(): 'late_night' | 'early_morning' | 'normal' {
  const hour = new Date().getHours();

  if (hour >= 23 || hour < 5) return 'late_night';
  if (hour >= 5 && hour < 7) return 'early_morning';
  return 'normal';
}

/**
 * Combine signals to get overall energy level
 */
function combineEnergySignals(signals: EnergySignals): EnergyLevel {
  const levels: EnergyLevel[] = [signals.textEnergy, signals.emotionEnergy];
  if (signals.voiceEnergy) levels.push(signals.voiceEnergy);

  // Time context can pull energy down
  if (signals.timeContext === 'late_night') {
    // Late night - default to lower energy unless they're clearly excited
    if (!levels.includes('excited')) {
      const hasLowEnergy = levels.some((l) => l === 'exhausted' || l === 'low');
      if (hasLowEnergy) return 'exhausted';
      return 'low';
    }
  }

  // Count occurrences
  const counts: Record<EnergyLevel, number> = {
    exhausted: 0,
    low: 0,
    neutral: 0,
    engaged: 0,
    excited: 0,
  };

  for (const level of levels) {
    counts[level]++;
  }

  // Priority: extreme states first (exhausted, excited)
  if (counts.exhausted > 0) return 'exhausted';
  if (counts.excited > 0 && counts.excited >= counts.low) return 'excited';
  if (counts.low > counts.engaged) return 'low';
  if (counts.engaged > 0) return 'engaged';

  return 'neutral';
}

// ============================================================================
// ENERGY GUIDANCE
// ============================================================================

interface EnergyGuidance {
  description: string;
  tone: string[];
  avoid: string[];
  voiceNotes?: string;
}

const ENERGY_GUIDANCE: Record<EnergyLevel, EnergyGuidance> = {
  exhausted: {
    description: "They're running on empty. Be a calm, quiet presence.",
    tone: [
      'Gentle, almost hushed',
      'Minimal energy expenditure',
      'Holding space without demands',
      'Soft, warm, like a blanket',
    ],
    avoid: [
      'Enthusiasm or exclamation points',
      'Lots of questions',
      'Advice or action items',
      'Long responses',
      'Anything that requires effort from them',
    ],
    voiceNotes: 'Speak slowly, softly. Long pauses are okay. Less is more.',
  },

  low: {
    description: "They're subdued. Match their quiet energy.",
    tone: ['Calm and steady', 'Warm but not peppy', 'Gentle presence', 'Patient, no rush'],
    avoid: [
      'Excessive enthusiasm',
      'Trying to cheer them up',
      'Too many questions',
      'Pushing for action',
    ],
    voiceNotes: 'Moderate pace, warm tone. Give them breathing room.',
  },

  neutral: {
    description: 'Standard engaged conversation.',
    tone: ['Balanced engagement', 'Natural warmth', 'Responsive to their lead'],
    avoid: [],
  },

  engaged: {
    description: "They're interested and engaged. Match their energy.",
    tone: [
      'Animated and present',
      'Curious and interested',
      'Quick to respond',
      'Enthusiastic without overdoing it',
    ],
    avoid: ['Being too mellow', 'Slow or dragging responses'],
  },

  excited: {
    description: "They're fired up! Share the excitement!",
    tone: [
      'Enthusiastic!',
      'Exclamation points welcome',
      'Quick, energetic',
      'Celebrate with them',
      'Mirror their excitement',
    ],
    avoid: [
      'Being a buzzkill',
      'Immediately moving to practicalities',
      'Dampening their energy',
      'Being overly measured',
    ],
    voiceNotes: 'Match their pace! Be animated! Share the joy!',
  },
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build energy mirroring context
 */
async function buildEnergyMirroringContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, analysis, voiceEmotion } = input;
  const injections: ContextInjection[] = [];

  // Gather energy signals
  const signals: EnergySignals = {
    textEnergy: detectTextEnergy(userText),
    emotionEnergy: detectEmotionEnergy(analysis),
    timeContext: detectTimeContext(),
  };

  // Add voice energy if available
  if (voiceEmotion) {
    const voiceArousal = voiceEmotion.pitch && voiceEmotion.speechRate;
    if (voiceArousal) {
      // High pitch + fast speech = high energy
      // Low pitch + slow speech = low energy
      const avgArousal = ((voiceEmotion.pitch || 0.5) + (voiceEmotion.speechRate || 100) / 200) / 2;
      signals.voiceEnergy = avgArousal < 0.3 ? 'low' : avgArousal > 0.7 ? 'excited' : 'neutral';
    }
  }

  // Determine overall energy level
  const energyLevel = combineEnergySignals(signals);

  // Only inject for non-neutral energy
  if (energyLevel === 'neutral') {
    return injections;
  }

  const guidance = ENERGY_GUIDANCE[energyLevel];

  const lines: string[] = [
    `[⚡ ENERGY LEVEL: ${energyLevel.toUpperCase()}]`,
    '',
    guidance.description,
    '',
    '✅ Your tone should be:',
    ...guidance.tone.map((t) => `• ${t}`),
  ];

  if (guidance.avoid.length > 0) {
    lines.push('');
    lines.push('❌ Avoid:');
    lines.push(...guidance.avoid.map((a) => `• ${a}`));
  }

  if (guidance.voiceNotes) {
    lines.push('');
    lines.push(`🎤 Voice: ${guidance.voiceNotes}`);
  }

  // Special late night guidance
  if (signals.timeContext === 'late_night' && energyLevel !== 'excited') {
    lines.push('');
    lines.push("🌙 It's late. They might need rest more than conversation.");
    lines.push('Consider: "Should we pick this up tomorrow when you\'ve had some sleep?"');
  }

  injections.push(
    createHintInjection('energy_mirroring', lines.join('\n'), { category: 'humanizing' })
  );

  log.debug(
    {
      energyLevel,
      textEnergy: signals.textEnergy,
      emotionEnergy: signals.emotionEnergy,
      timeContext: signals.timeContext,
      voiceEnergy: signals.voiceEnergy,
    },
    '⚡ Energy mirroring'
  );

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'energy_mirroring',
  description: 'Mirror user energy level - calm when exhausted, excited when excited',
  priority: 75, // High priority - affects overall tone
  build: buildEnergyMirroringContext,
});

export { buildEnergyMirroringContext, detectTextEnergy, combineEnergySignals };
