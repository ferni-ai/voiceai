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

import type {
  EngagementEvent,
  EngagementTriggerEvent,
  DailyCheckInRecordedEvent,
} from '../types/events.js';
import {
  isEngagementMessage,
  isEngagementTriggerMessage,
  isDailyCheckInRecordedMessage,
} from '../types/events.js';
import type { EngagementData, EmotionalWeatherData } from '../ui/engagement.ui.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { runningAccuracy, toPredictionData, type PredictionData } from './prediction-data.js';
import type { PredictionsResponse } from './prediction-tracker-data.js';

const log = createLogger('Engagement');

// ============================================================================
// TYPES
// ============================================================================

export type { PredictionData } from './prediction-data.js';

export interface EngagementServiceCallbacks {
  onEngagementUpdate?: (data: EngagementData) => void;
  onEngagementTrigger?: (trigger: EngagementTriggerEvent) => void;
  onPredictionsUpdate?: (predictions: PredictionData[]) => void;
  onStreakMilestone?: (streak: {
    ritualName: string;
    count: number;
    personaId: string;
    celebration?: string;
  }) => void;
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

    // Check for daily check-in recorded (from voice conversation)
    if (isDailyCheckInRecordedMessage(data)) {
      this.handleDailyCheckInRecorded(data);
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

    log.debug('[Engagement] Data updated:', {
      streaks: data.ritualStreaks.length,
      weather: data.weatherHistory.length,
      stats: data.stats,
    });
  }

  /**
   * Handle engagement trigger from agent.
   */
  private handleEngagementTrigger(event: EngagementTriggerEvent): void {
    log.debug('[Engagement] Trigger received:', event.triggerType, event.message);
    this.callbacks.onEngagementTrigger?.(event);
  }

  /**
   * Handle daily check-in recorded from voice conversation.
   * Updates cached data and triggers UI refresh.
   */
  private handleDailyCheckInRecorded(event: DailyCheckInRecordedEvent): void {
    log.info('[Engagement] Daily check-in recorded via voice:', {
      weather: event.weather,
      streak: event.streak,
      isNewRecord: event.isNewRecord,
    });

    // Add to weather history in cached data
    if (this.cachedData) {
      // Add new weather entry
      this.cachedData.weatherHistory.unshift({
        primary: event.weather,
        energy: event.energy,
        recordedAt: event.timestamp,
      });

      // Keep only last 30 entries
      if (this.cachedData.weatherHistory.length > 30) {
        this.cachedData.weatherHistory = this.cachedData.weatherHistory.slice(0, 30);
      }

      // Update streak for the ritual
      const streakIndex = this.cachedData.ritualStreaks.findIndex(
        (s) => s.ritualId === event.ritualId
      );
      if (streakIndex >= 0) {
        const streak = this.cachedData.ritualStreaks[streakIndex];
        if (streak) {
          streak.currentStreak = event.streak;
          if (event.isNewRecord) {
            streak.longestStreak = event.streak;
          }
          streak.lastCompletedAt = event.timestamp;
          streak.dueToday = false;
        }
      }

      // Update stats
      this.cachedData.lastEngagementAt = event.timestamp;

      // Notify listeners to refresh UI
      this.callbacks.onEngagementUpdate?.(this.cachedData);
    }

    // Check for milestone celebration
    if (event.streak && this.isStreakMilestone(event.streak)) {
      this.callbacks.onStreakMilestone?.({
        ritualName: 'Morning Sky Check', // Default for sky check
        count: event.streak,
        personaId: 'ferni',
        celebration: event.celebration,
      });
    }
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
   * First tries REST API, then falls back to cached data from LiveKit.
   */
  async fetchEngagementData(userId: string): Promise<EngagementData | null> {
    // If we have cached data, return it
    if (this.cachedData) {
      return this.cachedData;
    }

    // Try REST API with proper auth headers
    try {
      const result = await apiGet<{
        streaks?: Array<Record<string, unknown>>;
        weatherHistory?: Array<Record<string, unknown>>;
        stats?: Record<string, unknown>;
        lastEngagementAt?: string;
      }>('/api/rituals', { userId });

      if (result.ok && result.data) {
        const data = result.data;

        // Transform to EngagementData format
        const engagementData: EngagementData = {
          ritualStreaks: (data.streaks || []).map((s: Record<string, unknown>) => ({
            ritualId: s.ritualId as string,
            ritualName: this.getRitualName(s.ritualId as string),
            personaId: s.personaId as string,
            currentStreak: s.currentStreak as number,
            longestStreak: s.longestStreak as number,
            lastCompletedAt: s.lastCompletedAt as string | null,
            dueToday: this.isDueToday(s.lastCompletedAt as string | null),
          })),
          weatherHistory: (data.weatherHistory || []).map((w: Record<string, unknown>) => ({
            primary: ((w.weather as Record<string, string>)?.primary ||
              'cloudy') as EmotionalWeatherData['primary'],
            energy: ((w.weather as Record<string, string>)?.energy ||
              'medium') as EmotionalWeatherData['energy'],
            note: w.weather ? (w.weather as Record<string, string>).note : undefined,
            recordedAt: w.date as string,
          })),
          stats: {
            totalRitualDays: (data.stats?.totalRitualDays as number) || 0,
            longestOverallStreak: (data.stats?.longestOverallStreak as number) || 0,
            currentActiveStreaks:
              data.streaks?.filter((s: Record<string, unknown>) => (s.currentStreak as number) > 0)
                .length || 0,
            predictionAccuracy: data.stats?.predictionAccuracy as number | undefined,
            teamHuddlesAttended: (data.stats?.teamHuddlesAttended as number) || 0,
          },
          lastEngagementAt: data.lastEngagementAt || null,
        };

        this.cachedData = engagementData;
        this.callbacks.onEngagementUpdate?.(engagementData);
        log.info('Loaded engagement data from API', {
          streaks: engagementData.ritualStreaks.length,
          weather: engagementData.weatherHistory.length,
        });
        return engagementData;
      } else {
        // 401 errors are expected before auth completes - use debug level
        if (result.status === 401) {
          log.debug('Engagement API unauthorized (auth pending)');
        } else {
          log.warn('API returned error', { error: result.error, status: result.status });
        }
      }
    } catch (err) {
      log.warn('Failed to fetch engagement data from API', err);
    }

    return this.cachedData;
  }

  /**
   * Get ritual display name from ID.
   */
  private getRitualName(ritualId: string): string {
    const names: Record<string, string> = {
      'ferni-sky-check': 'Morning Sky Check',
      'alex-inbox-pulse': 'Inbox Pulse',
      'maya-habit-heartbeat': 'Habit Heartbeat',
      'jordan-todays-chapter': "Today's Chapter",
      'nayan-morning-stillness': 'Morning Stillness',
      'peter-pattern-pulse': 'Pattern Pulse',
    };
    return names[ritualId] || ritualId;
  }

  /**
   * Check if ritual is due today.
   */
  private isDueToday(lastCompletedAt: string | null): boolean {
    if (!lastCompletedAt) return true;
    const lastDate = new Date(lastCompletedAt).toDateString();
    const today = new Date().toDateString();
    return lastDate !== today;
  }

  /**
   * Fetch predictions from backend.
   * First tries REST API, then falls back to cached data from LiveKit.
   */
  async fetchPredictions(userId: string): Promise<PredictionData[]> {
    if (this.cachedPredictions.length > 0) {
      return this.cachedPredictions;
    }
    return this.loadPredictions({ userId });
  }

  /** Re-read predictions from the server (e.g. after one is resolved). */
  async refreshPredictions(): Promise<PredictionData[]> {
    return this.loadPredictions();
  }

  private async loadPredictions(params?: Record<string, string>): Promise<PredictionData[]> {
    try {
      const result = await apiGet<PredictionsResponse>('/api/predictions', params);
      if (result.ok && result.data) {
        const predictions = (result.data.predictions ?? []).map(toPredictionData);
        this.cachedPredictions = predictions;
        this.callbacks.onPredictionsUpdate?.(predictions);
        return predictions;
      }
    } catch (err) {
      log.warn('Failed to fetch predictions from API', err);
    }

    return this.cachedPredictions;
  }

  /**
   * Submit a new prediction.
   * In the real implementation, this would send via LiveKit data message
   * which the backend would process.
   */
  submitPrediction(
    _userId: string,
    prediction: { category: string; question: string; userPrediction: number }
  ): PredictionData | null {
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
    return this.cachedPredictions.filter((p) => p.status === 'pending');
  }

  /**
   * Get resolved predictions.
   */
  getResolvedPredictions(): PredictionData[] {
    return this.cachedPredictions.filter((p) => p.status === 'resolved');
  }

  /**
   * Running prediction accuracy: the average of the server's scores for
   * resolved predictions, or null when none has been scored.
   */
  calculateAccuracy(): number | null {
    return runningAccuracy(this.cachedPredictions);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const engagementService = new EngagementService();
