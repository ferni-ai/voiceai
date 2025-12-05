/**
 * Engagement Service
 *
 * Fetches and manages user engagement data from the backend.
 * Handles ritual streaks, emotional weather, predictions, and team huddles.
 *
 * Communicates via:
 * - LiveKit data messages (real-time updates during conversation)
 * - HTTP API (initial load and background sync)
 */

import type { EngagementEvent, EngagementTriggerEvent } from '../types/events.js';
import { isEngagementMessage, isEngagementTriggerMessage } from '../types/events.js';
import type { EngagementData } from '../ui/engagement.ui.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PredictionData {
  id: string;
  category: string;
  question: string;
  userPrediction: number;
  actualOutcome?: number;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

export interface EngagementServiceCallbacks {
  onEngagementUpdate?: (data: EngagementData) => void;
  onEngagementTrigger?: (trigger: EngagementTriggerEvent) => void;
  onPredictionsUpdate?: (predictions: PredictionData[]) => void;
  onStreakMilestone?: (streak: { ritualName: string; count: number; personaId: string }) => void;
}

// ============================================================================
// ENGAGEMENT SERVICE
// ============================================================================

class EngagementService {
  private callbacks: EngagementServiceCallbacks = {};
  private cachedData: EngagementData | null = null;
  private cachedPredictions: PredictionData[] = [];

  /**
   * Register callbacks for engagement events.
   */
  setCallbacks(callbacks: EngagementServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Handle incoming data message from LiveKit.
   * Called by the connection service when engagement data arrives.
   */
  handleDataMessage(data: unknown): boolean {
    // Check for engagement data update
    if (isEngagementMessage(data)) {
      this.handleEngagementUpdate(data);
      return true;
    }

    // Check for engagement triggers
    if (isEngagementTriggerMessage(data)) {
      this.handleEngagementTrigger(data);
      return true;
    }

    return false;
  }

  /**
   * Handle engagement data update from agent.
   */
  private handleEngagementUpdate(event: EngagementEvent): void {
    // Transform to EngagementData format
    const data: EngagementData = {
      ritualStreaks: event.ritualStreaks,
      weatherHistory: event.weatherHistory,
      stats: event.stats,
      lastEngagementAt: new Date(event.timestamp).toISOString(),
    };

    // Cache the data
    this.cachedData = data;

    // Store predictions if provided
    if (event.predictions) {
      this.cachedPredictions = event.predictions;
      this.callbacks.onPredictionsUpdate?.(this.cachedPredictions);
    }

    // Check for streak milestones
    for (const streak of event.ritualStreaks) {
      if (this.isStreakMilestone(streak.currentStreak)) {
        this.callbacks.onStreakMilestone?.({
          ritualName: streak.ritualName,
          count: streak.currentStreak,
          personaId: streak.personaId,
        });
      }
    }

    // Notify listeners
    this.callbacks.onEngagementUpdate?.(data);

    console.log('[Engagement] Data updated:', {
      streaks: data.ritualStreaks.length,
      weather: data.weatherHistory.length,
      stats: data.stats,
    });
  }

  /**
   * Handle engagement trigger from agent.
   */
  private handleEngagementTrigger(event: EngagementTriggerEvent): void {
    console.log('[Engagement] Trigger received:', event.triggerType, event.message);
    this.callbacks.onEngagementTrigger?.(event);
  }

  /**
   * Check if streak count is a milestone.
   */
  private isStreakMilestone(count: number): boolean {
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];
    return milestones.includes(count);
  }

  /**
   * Fetch engagement data from backend.
   * Data comes via LiveKit data messages in real-time.
   * This returns cached data from those messages.
   */
  async fetchEngagementData(_userId: string): Promise<EngagementData | null> {
    // Return cached data (populated via LiveKit data messages)
    return this.cachedData;
  }

  /**
   * Fetch predictions from backend.
   * Returns cached predictions from LiveKit data messages.
   */
  async fetchPredictions(_userId: string): Promise<PredictionData[]> {
    return this.cachedPredictions;
  }

  /**
   * Submit a new prediction.
   * In the real implementation, this would send via LiveKit data message
   * which the backend would process.
   */
  async submitPrediction(
    _userId: string,
    prediction: { category: string; question: string; userPrediction: number }
  ): Promise<PredictionData | null> {
    // Create a local prediction record
    // The backend will send the full record via LiveKit when it processes this
    const newPrediction: PredictionData = {
      id: `pred-${Date.now()}`,
      category: prediction.category,
      question: prediction.question,
      userPrediction: prediction.userPrediction,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.cachedPredictions = [...this.cachedPredictions, newPrediction];
    this.callbacks.onPredictionsUpdate?.(this.cachedPredictions);
    return newPrediction;
  }

  /**
   * Get cached engagement data.
   */
  getCachedData(): EngagementData | null {
    return this.cachedData;
  }

  /**
   * Get cached predictions.
   */
  getCachedPredictions(): PredictionData[] {
    return this.cachedPredictions;
  }

  /**
   * Clear cached data.
   */
  clearCache(): void {
    this.cachedData = null;
    this.cachedPredictions = [];
  }

  /**
   * Get pending predictions (not yet resolved).
   */
  getPendingPredictions(): PredictionData[] {
    return this.cachedPredictions.filter(p => p.status === 'pending');
  }

  /**
   * Get resolved predictions.
   */
  getResolvedPredictions(): PredictionData[] {
    return this.cachedPredictions.filter(p => p.status === 'resolved');
  }

  /**
   * Calculate prediction accuracy.
   */
  calculateAccuracy(): number | null {
    const resolved = this.getResolvedPredictions();
    if (resolved.length === 0) return null;

    let totalError = 0;
    for (const pred of resolved) {
      if (pred.actualOutcome !== undefined) {
        totalError += Math.abs(pred.userPrediction - pred.actualOutcome);
      }
    }

    // Convert error to accuracy (inverse, scaled to 0-100)
    // Lower error = higher accuracy
    const avgError = totalError / resolved.length;
    return Math.max(0, Math.round(100 - avgError));
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const engagementService = new EngagementService();

