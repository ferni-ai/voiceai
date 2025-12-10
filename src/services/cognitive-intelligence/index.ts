/**
 * Cognitive Intelligence Module
 *
 * Evidence-based cognitive tools for Ferni's coaching capabilities.
 * Includes distortion detection, ANT tracking, Socratic questioning,
 * and thought record support.
 *
 * @module CognitiveIntelligence
 */

// Core exports
export {
  detectDistortions,
  distortionDetector,
  getDistortionContextInjection,
  getGentleResponse,
  getUserDistortionStats,
  isCommonDistortion,
} from './distortion-detector.js';
export type {
  CognitiveDistortion,
  ConversationContext,
  DistortionDetection,
} from './distortion-detector.js';

export {
  antTracker,
  generateWeeklyReport,
  getANTContextInjection,
  getANTPatterns,
  getInsights,
  recordANT,
} from './ant-tracker.js';
export type {
  ANTEntry,
  ANTInsight,
  ANTPattern,
  DayOfWeek,
  TimeOfDay,
  WeeklyReport,
} from './ant-tracker.js';

// Unified API
import { antTracker } from './ant-tracker.js';
import { distortionDetector, getDistortionContextInjection } from './distortion-detector.js';

export const cognitiveIntelligence = {
  distortions: distortionDetector,
  ants: antTracker,
};

export default cognitiveIntelligence;

/**
 * Build complete cognitive intelligence context for a user's message.
 * This is the main entry point for cognitive analysis.
 */
export function buildCognitiveIntelligenceContext(
  userId: string,
  text: string,
  context: {
    emotion?: string;
    emotionIntensity?: number;
    relationshipStage?: string;
  } = {}
): {
  hasDistortion: boolean;
  primary: ReturnType<typeof distortionDetector.detect>[0] | null;
  contextInjection: { llmContext: string } | null;
} {
  const detections = distortionDetector.detect(userId, text, {
    emotionalState: context.emotion,
    relationshipStage: context.relationshipStage,
  });

  if (detections.length === 0) {
    return {
      hasDistortion: false,
      primary: null,
      contextInjection: null,
    };
  }

  const llmContext = getDistortionContextInjection(detections);

  return {
    hasDistortion: true,
    primary: detections[0],
    contextInjection: { llmContext },
  };
}

// ============================================================================
// ADDITIONAL EXPORTS FOR SCHEDULED JOBS
// ============================================================================

// Re-export persistence functions from ant-tracker
export {
  clearOldANTData,
  deleteUserANTData,
  getAllUsersWithANTData,
  loadUserANTData,
} from './ant-tracker.js';

/**
 * Generate weekly insights from ANT patterns
 */
export function generateWeeklyInsights(pattern: {
  totalDetected: number;
  peakTime?: string;
  peakDay?: string;
  topicTriggers?: Map<string, unknown[]>;
}): string[] {
  const insights: string[] = [];

  if (pattern.totalDetected > 10) {
    insights.push("You've been doing great at noticing your thought patterns.");
  }

  if (pattern.peakTime === 'evening' || pattern.peakTime === 'night') {
    insights.push('Many of these thoughts come later in the day - tiredness might be a factor.');
  }

  if (pattern.topicTriggers && pattern.topicTriggers.size > 0) {
    const topTopic = Array.from(pattern.topicTriggers.keys())[0];
    insights.push(
      `Work-related thoughts seem to trigger these patterns, especially around ${topTopic}.`
    );
  }

  return insights;
}
