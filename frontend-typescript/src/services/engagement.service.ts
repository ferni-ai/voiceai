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
import type { EngagementData, EmotionalWeatherData } from '../ui/engagement.ui.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';

const log = createLogger('Engagement');

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
            primary: ((w.weather as Record<string, string>)?.primary || 'cloudy') as EmotionalWeatherData['primary'],
            energy: ((w.weather as Record<string, string>)?.energy || 'medium') as EmotionalWeatherData['energy'],
            note: w.weather ? (w.weather as Record<string, string>).note : undefined,
            recordedAt: w.date as string,
          })),
          stats: {
            totalRitualDays: (data.stats?.totalRitualDays as number) || 0,
            longestOverallStreak: (data.stats?.longestOverallStreak as number) || 0,
            currentActiveStreaks: data.streaks?.filter((s: Record<string, unknown>) => (s.currentStreak as number) > 0).length || 0,
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
        log.warn('API returned error', { error: result.error, status: result.status });
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
    // If we have cached data, return it
    if (this.cachedPredictions.length > 0) {
      return this.cachedPredictions;
    }

    // Try REST API with proper auth headers
    try {
      const result = await apiGet<{
        predictions?: Array<Record<string, unknown>>;
      }>('/api/predictions', { userId });
      
      if (result.ok && result.data) {
        const data = result.data;
        // Transform from StoredPrediction to PredictionData format
        const predictions: PredictionData[] = (data.predictions || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          category: this.extractCategory(p.predictions as Record<string, number>),
          question: `Week of ${p.weekOf}`,
          userPrediction: this.extractMainValue(p.predictions as Record<string, number>),
          actualOutcome: p.accuracy as number | undefined,
          status: p.completedAt ? 'resolved' as const : 'pending' as const,
          createdAt: p.createdAt as string,
        }));
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
   * Extract category from prediction data.
   */
  private extractCategory(predictions: Record<string, number>): string {
    const keys = Object.keys(predictions);
    if (keys.includes('Mood average (1-10)')) return 'mood';
    if (keys.includes('Deep work hours')) return 'productivity';
    if (keys.includes('Exercise sessions')) return 'health';
    return 'overall';
  }

  /**
   * Extract main value from prediction data.
   */
  private extractMainValue(predictions: Record<string, number>): number {
    const values = Object.values(predictions);
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0] ?? 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
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

