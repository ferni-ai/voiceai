/**
 * Engagement Data Sender
 *
 * Sends engagement data to the frontend via LiveKit data messages.
 * This allows the frontend to update the engagement UI in real-time.
 */

import { getLogger } from '../utils/safe-logger.js';
import { EngagementStore, type EngagementProfile, type StoredWeatherEntry } from './engagement-store.js';
import { PERSONA_RITUALS } from './daily-rituals.js';

// Generic interface for LiveKit room-like objects
interface LiveKitRoomLike {
  localParticipant?: {
    publishData: (data: Uint8Array, options?: { reliable?: boolean }) => Promise<void>;
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementDataMessage {
  type: 'engagement';
  ritualStreaks: Array<{
    ritualId: string;
    ritualName: string;
    personaId: string;
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: string | null;
    dueToday: boolean;
  }>;
  weatherHistory: Array<{
    primary: string;
    energy: string;
    note?: string;
    recordedAt: string;
  }>;
  stats: {
    totalRitualDays: number;
    longestOverallStreak: number;
    currentActiveStreaks: number;
    predictionAccuracy?: number;
    teamHuddlesAttended: number;
  };
  timestamp: number;
}

export interface EngagementTriggerMessage {
  type: 'engagement_trigger';
  triggerType: string;
  personaId: string;
  message: string;
  priority: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// DATA SENDER SERVICE
// ============================================================================

class EngagementDataSender {
  private room: LiveKitRoomLike | null = null;
  private store: EngagementStore;
  private logger = getLogger();

  constructor() {
    this.store = new EngagementStore();
  }

  /**
   * Set the LiveKit room for sending messages
   */
  setRoom(room: LiveKitRoomLike): void {
    this.room = room;
  }

  /**
   * Clear the room reference
   */
  clearRoom(): void {
    this.room = null;
  }

  /**
   * Send engagement data to frontend
   */
  async sendEngagementData(userId: string): Promise<void> {
    if (!this.room) {
      this.logger.debug('[EngagementDataSender] No room set, skipping send');
      return;
    }

    try {
      const profile = await this.store.getProfile(userId);
      const weatherHistory = await this.store.getWeatherHistory(userId, 7);
      const ritualStreaks = await this.getRitualStreaks(userId);

      const message: EngagementDataMessage = {
        type: 'engagement',
        ritualStreaks,
        weatherHistory: weatherHistory.map(w => ({
          primary: w.weather.primary,
          energy: w.weather.energy,
          note: w.weather.note,
          recordedAt: w.date,
        })),
        stats: this.calculateStats(profile, ritualStreaks),
        timestamp: Date.now(),
      };

      await this.sendDataMessage(message);
      this.logger.debug({ userId, streaks: ritualStreaks.length }, '[EngagementDataSender] Sent engagement data');
    } catch (error) {
      this.logger.error({ error, userId }, '[EngagementDataSender] Failed to send engagement data');
    }
  }

  /**
   * Send an engagement trigger to frontend
   */
  async sendTrigger(
    trigger: {
      type: string;
      personaId: string;
      message: string;
      priority: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (!this.room) return;

    const message: EngagementTriggerMessage = {
      type: 'engagement_trigger',
      triggerType: trigger.type,
      personaId: trigger.personaId,
      message: trigger.message,
      priority: trigger.priority,
      data: trigger.data,
      timestamp: Date.now(),
    };

    await this.sendDataMessage(message);
    this.logger.debug({ trigger: trigger.type }, '[EngagementDataSender] Sent trigger');
  }

  /**
   * Send ritual completion notification
   */
  async sendRitualComplete(
    userId: string,
    ritualId: string,
    newStreak: number
  ): Promise<void> {
    // Update the engagement data to reflect the completion
    await this.sendEngagementData(userId);

    // Check if this is a milestone
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];
    if (milestones.includes(newStreak)) {
      const ritual = PERSONA_RITUALS[ritualId];
      await this.sendTrigger({
        type: 'streak_milestone',
        personaId: ritual?.personaId || 'ferni',
        message: `${newStreak} days of ${ritual?.name || 'practice'}!`,
        priority: 'high',
        data: { ritualId, streak: newStreak },
      });
    }
  }

  /**
   * Send weather recorded notification
   */
  async sendWeatherRecorded(
    userId: string,
    _weather: StoredWeatherEntry
  ): Promise<void> {
    await this.sendEngagementData(userId);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getRitualStreaks(userId: string): Promise<EngagementDataMessage['ritualStreaks']> {
    const streaks: EngagementDataMessage['ritualStreaks'] = [];
    const today = new Date().toDateString();

    for (const [ritualId, ritual] of Object.entries(PERSONA_RITUALS)) {
      const streak = await this.store.getRitualStreak(userId, ritualId);
      
      if (streak) {
        const lastDate = streak.lastCompletedAt ? new Date(streak.lastCompletedAt).toDateString() : null;
        streaks.push({
          ritualId,
          ritualName: ritual.name,
          personaId: ritual.personaId,
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastCompletedAt: streak.lastCompletedAt,
          dueToday: lastDate !== today,
        });
      } else {
        // No streak yet - show as available
        streaks.push({
          ritualId,
          ritualName: ritual.name,
          personaId: ritual.personaId,
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: null,
          dueToday: true,
        });
      }
    }

    return streaks;
  }

  private calculateStats(
    profile: EngagementProfile | null,
    streaks: EngagementDataMessage['ritualStreaks']
  ): EngagementDataMessage['stats'] {
    // Calculate total ritual days
    let totalRitualDays = 0;
    let longestOverallStreak = 0;
    let currentActiveStreaks = 0;

    for (const streak of streaks) {
      totalRitualDays += streak.currentStreak;
      longestOverallStreak = Math.max(longestOverallStreak, streak.longestStreak);
      if (streak.currentStreak > 0) {
        currentActiveStreaks++;
      }
    }

    return {
      totalRitualDays,
      longestOverallStreak,
      currentActiveStreaks,
      predictionAccuracy: profile?.stats.predictionAccuracy,
      teamHuddlesAttended: profile?.stats.teamHuddlesAttended || 0,
    };
  }

  private async sendDataMessage(message: EngagementDataMessage | EngagementTriggerMessage): Promise<void> {
    if (!this.room) return;

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(message));
      await this.room.localParticipant?.publishData(data, { reliable: true });
    } catch (error) {
      this.logger.error({ error }, '[EngagementDataSender] Failed to publish data');
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: EngagementDataSender | null = null;

export function getEngagementDataSender(): EngagementDataSender {
  if (!instance) {
    instance = new EngagementDataSender();
  }
  return instance;
}

export default EngagementDataSender;
