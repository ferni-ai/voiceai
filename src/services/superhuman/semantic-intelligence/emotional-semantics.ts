/**
 * Emotional Semantics - Shim Module
 *
 * Provides a simplified interface to emotional trajectory data
 * for the awareness context builders.
 *
 * @module services/superhuman/semantic-intelligence/emotional-semantics
 */

import { getEmotionalContext } from './emotional-trajectories.js';

/**
 * Result from getEmotionalTrajectory
 */
export interface EmotionalTrajectoryResult {
  dominantEmotion?: string;
  trend?: 'improving' | 'declining' | 'stable' | 'volatile';
  durationDescription?: string;
  recentEmotions?: string[];
  avgDistress?: number;
  patterns?: string[];
  alerts?: string[];
}

/**
 * Get emotional trajectory for a user.
 * Simplified wrapper around getEmotionalContext for backward compatibility.
 *
 * @param userId - The user ID
 * @returns Emotional trajectory or null if unavailable
 */
export async function getEmotionalTrajectory(
  userId: string
): Promise<EmotionalTrajectoryResult | null> {
  try {
    const context = await getEmotionalContext(userId);

    if (!context.activeArcs || context.activeArcs.length === 0) {
      return null;
    }

    // Extract dominant arc info
    const dominantArc = context.activeArcs[0];
    const recentWaypoints = dominantArc?.waypoints?.slice(-5) || [];
    const recentEmotions = recentWaypoints.map((w) => w.emotion);

    // Calculate average distress (inverse of valence for negative emotions)
    const avgValence =
      recentWaypoints.reduce((sum, w) => sum + (w.valence || 0), 0) / (recentWaypoints.length || 1);
    const avgDistress = avgValence < 0 ? Math.abs(avgValence) : 0;

    return {
      dominantEmotion: dominantArc?.theme || 'neutral',
      trend: context.trend,
      durationDescription: dominantArc?.phase || 'recently',
      recentEmotions,
      avgDistress,
      patterns: [],
      alerts: [],
    };
  } catch {
    return null;
  }
}
