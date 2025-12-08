/**
 * Cognitive Intelligence Index
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * The Cognitive Intelligence system helps Ferni detect and gently
 * address cognitive distortions in real-time conversation.
 *
 * PHILOSOPHY:
 * A great coach notices when someone is stuck in a thinking trap—
 * not to lecture, but to invite curiosity. The goal is never to
 * dismiss feelings. It's to question thoughts that may not be
 * serving them.
 *
 * CAPABILITIES:
 * 1. Distortion Detection - Identify 15 cognitive distortions in real-time
 * 2. ANT Tracking - Track Automatic Negative Thought patterns over time
 * 3. Socratic Engine - Guide discovery through questions, not lectures
 * 4. Thought Records - (Coming) CBT thought record support
 * 5. Progress Tracking - (Coming) Measure cognitive restructuring progress
 *
 * @module CognitiveIntelligence
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  CognitiveDistortion,
  DistortionMetadata,
  DistortionDetection,
  DistortionResponse,
  ResponseApproach,

  // ANT tracking
  ANTInstance,
  ANTProfile,

  // Socratic questioning
  SocraticSequence,
  SocraticContext,

  // Thought records
  ThoughtRecord,

  // Progress tracking
  RestructuringProgress,

  // Context injection
  CognitiveContextInjection,

  // Configuration
  CognitiveIntelligenceConfig,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// ============================================================================
// DISTORTION DETECTION
// ============================================================================

export {
  // Core detection
  detectDistortions,
  getDistortionResponse,

  // Profile management
  getANTProfile,
  getTopDistortions,
  recordReframeOutcome,

  // Metadata
  getDistortionMetadata,
  getAllDistortionTypes,

  // Patterns
  DISTORTION_PATTERNS,
  RESPONSE_TEMPLATES,
} from './distortion-detector.js';

// ============================================================================
// ANT TRACKING
// ============================================================================

export {
  // Recording
  recordANT,

  // Analysis
  analyzePatterns,

  // Access
  getANTProfile as getANTTrackingProfile,
  getRecentANTs,
  getDistortionCount,

  // Management
  clearANTData,

  // Types
  type ANTPatternAnalysis,
  type PatternInsight,
} from './ant-tracker.js';

// ============================================================================
// SOCRATIC QUESTIONING
// ============================================================================

export {
  // Question generation
  selectSocraticQuestion,
  generateSocraticDialogue,

  // Sequences
  SOCRATIC_SEQUENCES,
  socraticSequences,

  // Types
  type QuestionCategory,
  type SocraticQuestion,
  type SocraticDialogue,
} from './socratic-engine.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import { detectDistortions, getDistortionResponse } from './distortion-detector.js';
import { recordANT, analyzePatterns } from './ant-tracker.js';
import { generateSocraticDialogue } from './socratic-engine.js';
import type {
  DistortionDetection,
  DistortionResponse,
  SocraticContext,
  CognitiveContextInjection,
} from './types.js';
import type { SocraticDialogue } from './socratic-engine.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CognitiveIntelligence' });

/**
 * Build complete cognitive context for a conversation turn.
 *
 * This is the main entry point for the cognitive intelligence system.
 * It detects distortions, determines the appropriate response, and
 * generates context for the LLM.
 */
export function buildCognitiveIntelligenceContext(
  userId: string,
  userMessage: string,
  context: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    recentReframes?: number;
    questionsAsked?: string[];
  }
): CognitiveIntelligenceResult {
  // Detect distortions
  const detections = detectDistortions(userId, userMessage, {
    topic: context.topic,
    emotion: context.emotion,
    emotionIntensity: context.emotionIntensity,
  });

  // If no distortions, return empty result
  if (detections.length === 0) {
    return {
      hasDistortion: false,
      detections: [],
      contextInjection: null,
    };
  }

  // Get the primary distortion (highest confidence)
  const primary = detections[0];

  // Determine response approach
  const response = getDistortionResponse(primary, {
    relationshipStage: context.relationshipStage,
    emotionalIntensity: context.emotionIntensity,
    recentReframes: context.recentReframes,
  });

  // Record the ANT
  recordANT(userId, primary);

  // Generate Socratic dialogue if appropriate
  let dialogue: SocraticDialogue | null = null;
  if (response.approach === 'socratic' || response.approach === 'gentle_name') {
    const socraticContext: SocraticContext = {
      userId,
      distortion: primary.type,
      triggerThought: primary.triggerPhrase,
      questionsAsked: context.questionsAsked || [],
      emotionalState: context.emotion,
      emotionalIntensity: context.emotionIntensity,
      relationshipStage: context.relationshipStage || 'new',
      receptivity: 'unknown',
    };
    dialogue = generateSocraticDialogue(socraticContext);
  }

  // Build context injection
  const contextInjection = buildContextInjection(primary, response, dialogue);

  log.debug(
    {
      userId,
      distortionType: primary.type,
      confidence: primary.confidence,
      approach: response.approach,
      hasSocratic: !!dialogue,
    },
    '🧠 Cognitive intelligence context built'
  );

  return {
    hasDistortion: true,
    detections,
    primary,
    response,
    dialogue,
    contextInjection,
  };
}

/**
 * Build the context injection for the LLM.
 */
function buildContextInjection(
  detection: DistortionDetection,
  response: DistortionResponse,
  dialogue: SocraticDialogue | null
): CognitiveContextInjection {
  const lines: string[] = [
    '[🧠 COGNITIVE PATTERN DETECTED]',
    '',
  ];

  // Name the distortion
  const distortionLabels: Record<string, string> = {
    catastrophizing: 'Catastrophizing',
    mind_reading: 'Mind Reading',
    all_or_nothing: 'All-or-Nothing Thinking',
    fortune_telling: 'Fortune Telling',
    personalization: 'Personalization',
    overgeneralization: 'Overgeneralization',
    mental_filtering: 'Mental Filtering',
    disqualifying_positive: 'Disqualifying the Positive',
    should_statements: '"Should" Statements',
    emotional_reasoning: 'Emotional Reasoning',
    labeling: 'Labeling',
    magnification: 'Magnification',
    minimization: 'Minimization',
    jumping_to_conclusions: 'Jumping to Conclusions',
    blame: 'Blame',
  };

  lines.push(`Pattern: ${distortionLabels[detection.type] || detection.type}`);
  lines.push(`Trigger: "${detection.triggerPhrase}"`);

  if (detection.isRecurring) {
    lines.push(`⚠️ This is a recurring pattern (detected ${detection.patternCount}+ times)`);
  }

  lines.push('');

  // Response guidance based on approach
  switch (response.approach) {
    case 'validate':
      lines.push('APPROACH: Validate only (high emotional intensity)');
      lines.push('');
      lines.push('DO:');
      lines.push(`• "${detection.validation}"`);
      lines.push('• Sit with them in the feeling');
      lines.push('• NO cognitive challenges right now');
      break;

    case 'socratic':
      lines.push('APPROACH: Socratic questioning');
      lines.push('');
      lines.push('DO:');
      lines.push(`• First: "${detection.validation}"`);
      if (dialogue) {
        lines.push(`• Then ask: "${dialogue.question}"`);
      }
      lines.push("• Let them discover the pattern, don't lecture");
      lines.push('');
      lines.push("DON'T:");
      lines.push("• Don't tell them they're wrong");
      lines.push("• Don't explain the distortion by name (unless they ask)");
      break;

    case 'gentle_name':
      lines.push('APPROACH: Gently name the pattern');
      lines.push('');
      lines.push('DO:');
      lines.push(`• "${detection.validation}"`);
      lines.push(`• "Can I gently push back on something? ${detection.gentleChallenge}"`);
      lines.push('');
      lines.push('You can name it:');
      lines.push(`• "I notice your mind is ${detection.type.replace(/_/g, ' ')} a bit there."`);
      break;

    case 'reframe':
      lines.push('APPROACH: Offer reframe');
      lines.push('');
      lines.push('DO:');
      lines.push(`• "${detection.validation}"`);
      lines.push(`• Consider: "${detection.reframe}"`);
      break;

    case 'wait':
      lines.push("APPROACH: Wait (we've done enough challenging recently)");
      lines.push('');
      lines.push("Just acknowledge and move on. Don't add more cognitive work.");
      break;
  }

  lines.push('');
  lines.push('Remember: Validate feelings, question thoughts. Never dismiss.');

  return {
    hasDistortion: true,
    detection,
    response,
    llmContext: lines.join('\n'),
    priority: response.priority,
  };
}

/**
 * Result from building cognitive intelligence context.
 */
export interface CognitiveIntelligenceResult {
  hasDistortion: boolean;
  detections: DistortionDetection[];
  primary?: DistortionDetection;
  response?: DistortionResponse;
  dialogue?: SocraticDialogue | null;
  contextInjection: CognitiveContextInjection | null;
}

/**
 * Get a summary of cognitive patterns for a user.
 */
export function getCognitiveSummary(userId: string): CognitiveSummary {
  const analysis = analyzePatterns(userId);

  return {
    hasData: analysis.hasEnoughData,
    insights: analysis.insights.map((i) => ({
      type: i.type,
      message: i.message,
      actionable: i.actionable,
    })),
    profile: analysis.profile || null,
  };
}

export interface CognitiveSummary {
  hasData: boolean;
  insights: Array<{
    type: string;
    message: string;
    actionable: string;
  }>;
  profile: {
    totalDetected: number;
    topDistortions: string[];
    reframeSuccessRate: number;
    trend: string;
  } | null;
}

