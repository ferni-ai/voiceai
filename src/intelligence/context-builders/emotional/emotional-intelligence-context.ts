/**
 * Emotional Intelligence Context Builder
 *
 * Detects user emotional state and provides Ferni's unique response guidance.
 * Not generic empathy - Ferni brings HIS experience, HIS perspective.
 *
 * PHILOSOPHY:
 * "Anyone can say 'that sounds hard'. Ferni brings HIS experience, HIS perspective."
 *
 * This is the core of "Better Than Human" - emotional intelligence that draws on
 * Ferni's backstory (tsunami, kintsugi, seven siblings, Wyoming) to provide
 * responses that feel deeply personal and earned.
 *
 * @module EmotionalIntelligenceContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadEmotionalIntelligence } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'EmotionalIntelligenceContext' });

// ============================================================================
// TYPES
// ============================================================================

interface EmotionDetection {
  verbal_cues: string[];
  response_style: string;
  guidance: {
    intent: string;
    pacing: string;
    approach: string;
    [key: string]: string;
  };
  avoid: string[];
  ferni_brings: {
    from_backstory?: string;
    his_gift: string;
    [key: string]: string | undefined;
  };
}

interface EmotionalIntelligenceContent {
  detecting_distress?: EmotionDetection;
  detecting_excitement?: EmotionDetection;
  detecting_sadness?: EmotionDetection;
  detecting_anger?: EmotionDetection;
  detecting_shame?: EmotionDetection;
  detecting_burnout?: EmotionDetection;
  detecting_imposter_syndrome?: EmotionDetection;
  detecting_grief?: EmotionDetection;
  detecting_loneliness?: EmotionDetection;
  detecting_decision_paralysis?: EmotionDetection;
  detecting_celebration_avoidance?: EmotionDetection;
  detecting_self_criticism?: EmotionDetection;
  pacing_guidelines?: Record<string, { speech_rate: string; pause_multiplier: number; notes: string }>;
  proactive_triggers?: Record<string, { trigger: string; behavior: string }>;
  usage_rules?: {
    probability: number;
    min_turns_between: number;
    max_per_session: number;
    more_likely_when?: string[];
    never_when?: string[];
  };
  [key: string]: unknown;
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, EmotionalIntelligenceContent>();
const sessionState = new Map<
  string,
  {
    lastEmotionalTurn: number;
    emotionalGuidanceCount: number;
    detectedEmotions: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastEmotionalTurn: 0,
      emotionalGuidanceCount: 0,
      detectedEmotions: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<EmotionalIntelligenceContent | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadEmotionalIntelligence(personaId);
    if (content) {
      contentCache.set(personaId, content as EmotionalIntelligenceContent);
      log.debug({ personaId }, 'Loaded emotional intelligence content');
    }
    return content as EmotionalIntelligenceContent | null;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load emotional intelligence content');
    return null;
  }
}

// ============================================================================
// EMOTION DETECTION
// ============================================================================

type DetectedEmotion =
  | 'distress'
  | 'excitement'
  | 'sadness'
  | 'anger'
  | 'shame'
  | 'burnout'
  | 'imposter_syndrome'
  | 'grief'
  | 'loneliness'
  | 'decision_paralysis'
  | 'celebration_avoidance'
  | 'self_criticism'
  | 'none';

function detectEmotion(input: ContextBuilderInput, content: EmotionalIntelligenceContent): DetectedEmotion {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Check each emotion type against verbal cues
  const emotionChecks: Array<{ key: keyof EmotionalIntelligenceContent; result: DetectedEmotion }> = [
    { key: 'detecting_grief', result: 'grief' },
    { key: 'detecting_distress', result: 'distress' },
    { key: 'detecting_shame', result: 'shame' },
    { key: 'detecting_burnout', result: 'burnout' },
    { key: 'detecting_imposter_syndrome', result: 'imposter_syndrome' },
    { key: 'detecting_loneliness', result: 'loneliness' },
    { key: 'detecting_self_criticism', result: 'self_criticism' },
    { key: 'detecting_sadness', result: 'sadness' },
    { key: 'detecting_anger', result: 'anger' },
    { key: 'detecting_decision_paralysis', result: 'decision_paralysis' },
    { key: 'detecting_celebration_avoidance', result: 'celebration_avoidance' },
    { key: 'detecting_excitement', result: 'excitement' },
  ];

  for (const check of emotionChecks) {
    const detection = content[check.key] as EmotionDetection | undefined;
    if (detection?.verbal_cues) {
      for (const cue of detection.verbal_cues) {
        if (text.includes(cue.toLowerCase())) {
          return check.result;
        }
      }
    }
  }

  // Also check emotion analysis from input
  if (emotion?.primary === 'sad') return 'sadness';
  if (emotion?.primary === 'anxious' || (emotion?.distressLevel && emotion.distressLevel > 0.6)) return 'distress';
  if (emotion?.primary === 'angry') return 'anger';
  if (emotion?.primary === 'happy' || emotion?.primary === 'excited') return 'excitement';

  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateEmotionalGuidance(
  content: EmotionalIntelligenceContent,
  detected: DetectedEmotion
): string | null {
  const detectionKey = `detecting_${detected}` as keyof EmotionalIntelligenceContent;
  const detection = content[detectionKey] as EmotionDetection | undefined;

  if (!detection) return null;

  const lines: string[] = [`[EMOTIONAL INTELLIGENCE: ${detected.toUpperCase().replace('_', ' ')} DETECTED]`, ''];

  // Response style
  if (detection.response_style) {
    lines.push(`RESPONSE STYLE: ${detection.response_style}`);
    lines.push('');
  }

  // Guidance
  if (detection.guidance) {
    lines.push('GUIDANCE:');
    lines.push(`- Intent: ${detection.guidance.intent}`);
    lines.push(`- Pacing: ${detection.guidance.pacing}`);
    lines.push(`- Approach: ${detection.guidance.approach}`);
    
    // Additional guidance fields
    for (const [key, value] of Object.entries(detection.guidance)) {
      if (!['intent', 'pacing', 'approach'].includes(key) && typeof value === 'string') {
        lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
      }
    }
    lines.push('');
  }

  // What Ferni brings (backstory)
  if (detection.ferni_brings) {
    lines.push('FERNI\'S UNIQUE GIFT:');
    if (detection.ferni_brings.from_backstory) {
      lines.push(`From his story: ${detection.ferni_brings.from_backstory}`);
    }
    lines.push(`His gift: ${detection.ferni_brings.his_gift}`);
    lines.push('');
  }

  // What to avoid
  if (detection.avoid && detection.avoid.length > 0) {
    lines.push('AVOID:');
    for (const item of detection.avoid.slice(0, 3)) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// PROACTIVE TRIGGER DETECTION
// ============================================================================

function detectProactiveTrigger(
  input: ContextBuilderInput,
  content: EmotionalIntelligenceContent
): string | null {
  if (!content.proactive_triggers) return null;

  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Voice-text mismatch (saying fine but sounds strained)
  if (content.proactive_triggers.voice_text_mismatch) {
    if (
      (text.includes("i'm fine") || text.includes('doing good') || text.includes('doing okay')) &&
      emotion?.distressLevel && emotion.distressLevel > 0.4
    ) {
      return content.proactive_triggers.voice_text_mismatch.behavior;
    }
  }

  // Celebration deflection
  if (content.proactive_triggers.celebration_deflection) {
    if (
      (text.includes('not a big deal') ||
        text.includes('anyone could have') ||
        text.includes('got lucky')) &&
      text.length < 200
    ) {
      return content.proactive_triggers.celebration_deflection.behavior;
    }
  }

  return null;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildEmotionalIntelligenceContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Check usage rules
  const usageRules = content.usage_rules || { probability: 0.35, min_turns_between: 5, max_per_session: 3 };
  
  // Skip if too many this session
  if (state.emotionalGuidanceCount >= usageRules.max_per_session) {
    return injections;
  }

  // Skip if too soon after last
  if (turnCount - state.lastEmotionalTurn < usageRules.min_turns_between && turnCount > 2) {
    return injections;
  }

  // Check never_when conditions
  if (usageRules.never_when) {
    if (usageRules.never_when.includes('first_2_turns') && turnCount < 2) {
      return injections;
    }
  }

  // Detect emotion
  const detected = detectEmotion(input, content);

  if (detected === 'none') {
    // Check for proactive triggers even if no primary emotion detected
    const proactiveBehavior = detectProactiveTrigger(input, content);
    if (proactiveBehavior) {
      injections.push(
        createStandardInjection('emotional_intelligence', `[PROACTIVE EMOTIONAL AWARENESS]\n\n${proactiveBehavior}`, {
          category: 'emotional',
        })
      );
      state.lastEmotionalTurn = turnCount;
      state.emotionalGuidanceCount++;
    }
    return injections;
  }

  // Probability check (skip for high-distress situations)
  const isHighPriority = ['grief', 'distress', 'shame', 'burnout'].includes(detected);
  if (!isHighPriority && Math.random() > usageRules.probability) {
    return injections;
  }

  // Generate guidance
  const guidance = generateEmotionalGuidance(content, detected);
  if (guidance) {
    injections.push(
      createStandardInjection('emotional_intelligence', guidance, { category: 'emotional' })
    );

    // Update state
    state.lastEmotionalTurn = turnCount;
    state.emotionalGuidanceCount++;
    state.detectedEmotions.push(detected);

    log.debug(
      { sessionId, turnCount, detected, guidanceCount: state.emotionalGuidanceCount },
      'Emotional intelligence guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupEmotionalIntelligenceState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'emotional_intelligence_context',
  description: 'Detects user emotional state and provides Ferni\'s unique response guidance',
  priority: 65, // Enhancement layer - runs after core but influences response
  build: buildEmotionalIntelligenceContext,
});

export { buildEmotionalIntelligenceContext };
