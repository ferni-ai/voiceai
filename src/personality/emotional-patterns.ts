/**
 * Emotional Pattern Recognition
 *
 * Superhuman feature: Notice things about users that they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 * "When you talk about your boss, your whole energy shifts"
 *
 * Humans miss these patterns because they're self-absorbed or too close.
 * We can see the bigger picture and reflect it back gently.
 *
 * ## Architecture (2024-12)
 *
 * This module is split into focused sub-modules:
 * - `emotional-data.ts` - Data collection and storage
 * - `pattern-analysis.ts` - Pattern detection algorithms
 * - `growth-tracking.ts` - Growth moment tracking
 *
 * This file re-exports everything for backwards compatibility.
 *
 * @module personality/emotional-patterns
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  clearUserEmotionalData,
  emotionalHistory,
  getEmotionalDataStats,
  getEmotionalHistory,
  recordEmotionalDataPoint as recordDataPoint,
} from './emotional-data.js';
import { analyzeForPatterns, clearUserPatterns, detectedPatterns } from './pattern-analysis.js';
import { clearUserGrowthMoments, growthMoments } from './growth-tracking.js';

const log = createLogger({ module: 'EmotionalPatterns' });

// ============================================================================
// RE-EXPORTS - Types
// ============================================================================

export type { EmotionalDataPoint, EmotionalTrend } from './emotional-data.js';
export type { DeliveryTiming, EmotionalPattern } from './pattern-analysis.js';
export type { GrowthMoment } from './growth-tracking.js';

// ============================================================================
// RE-EXPORTS - Data Collection
// ============================================================================

export {
  EMOTIONAL_DATA_CONFIG,
  clearAllEmotionalData,
  clearUserEmotionalData,
  getEmotionalDataStats,
  getEmotionalHistory,
  hasEnoughHistoryForPatterns,
  emotionalHistory,
} from './emotional-data.js';

// ============================================================================
// RE-EXPORTS - Pattern Analysis
// ============================================================================

export {
  PATTERN_CONFIG,
  analyzeForPatterns,
  clearAllPatterns,
  clearUserPatterns,
  detectedPatterns,
  formatPatternForPrompt,
  getPatternInsights,
  markPatternSurfaced,
} from './pattern-analysis.js';

// ============================================================================
// RE-EXPORTS - Growth Tracking
// ============================================================================

export {
  clearAllGrowthMoments,
  clearUserGrowthMoments,
  formatGrowthForPrompt,
  getGrowthCelebrations,
  growthMoments,
  markGrowthSurfaced,
  recordGrowthEvidence,
} from './growth-tracking.js';

// ============================================================================
// INTEGRATED FUNCTIONS
// ============================================================================

/**
 * Record an emotional data point and trigger pattern analysis
 *
 * This is the main entry point for recording emotional data.
 * It records the data point and then analyzes for patterns.
 */
export function recordEmotionalDataPoint(
  userId: string,
  emotion: string,
  intensity: number,
  topics: string[],
  context?: string
): void {
  // Record the data point
  recordDataPoint(userId, emotion, intensity, topics, context);

  // Analyze for patterns after recording
  analyzeForPatterns(userId);
}

// ============================================================================
// MEMORY MANAGEMENT (Unified)
// ============================================================================

/**
 * Clear all emotional tracking data for a user
 *
 * Call this on session end to prevent memory leaks in long-running processes.
 * This clears:
 * - Emotional history
 * - Detected patterns
 * - Growth moments
 */
export function clearAllUserEmotionalTracking(userId: string): void {
  clearUserEmotionalData(userId);
  clearUserPatterns(userId);
  clearUserGrowthMoments(userId);
  log.info({ userId }, '🧹 Cleared all emotional tracking for user');
}

/**
 * Get current memory usage stats for emotional tracking
 */
export function getEmotionalTrackingStats(): {
  emotionalData: { userCount: number; totalDataPoints: number; averagePointsPerUser: number };
  patterns: { userCount: number };
  growth: { userCount: number };
} {
  return {
    emotionalData: getEmotionalDataStats(),
    patterns: { userCount: detectedPatterns.size },
    growth: { userCount: growthMoments.size },
  };
}
