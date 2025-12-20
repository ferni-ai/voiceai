/**
 * Practice Briefings Service
 *
 * Fetches and displays pre-practice briefings from the backend.
 * Shows upcoming practices with encouragement and prep tips.
 *
 * @module services/practice-briefings
 */

import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';

const log = createLogger('PracticeBriefings');

// ============================================================================
// TYPES
// ============================================================================

export interface PracticeBriefing {
  practiceId: string;
  practiceName: string;
  startsAt: string;
  minutesUntil: number;
  greeting: string;
  lastSession?: string;
  streak: number;
  encouragement: string;
  prepTips?: string[];
}

export interface PatternSuggestion {
  title: string;
  description: string;
  suggestedFrequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
  suggestedTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
  specificTime?: { hour: number; minute: number };
  durationMinutes: number;
  reasoning: string;
  confidence: number;
}

// ============================================================================
// SERVICE
// ============================================================================

class PracticeBriefingsService {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastNotifiedPracticeId: string | null = null;
  private onBriefingCallback: ((briefing: PracticeBriefing) => void) | null = null;

  /**
   * Start monitoring for upcoming practices
   */
  startMonitoring(onBriefing: (briefing: PracticeBriefing) => void): void {
    this.onBriefingCallback = onBriefing;

    // Check immediately
    this.checkUpcomingPractices();

    // Check every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkUpcomingPractices();
    }, 5 * 60 * 1000);

    log.info('Started practice briefing monitoring');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.onBriefingCallback = null;
    log.info('Stopped practice briefing monitoring');
  }

  /**
   * Fetch upcoming practice briefings
   */
  async getUpcomingBriefings(windowMinutes = 60): Promise<PracticeBriefing[]> {
    try {
      const response = await apiGet(`/api/practices/briefings?windowMinutes=${windowMinutes}`);

      if (response.ok && response.data) {
        const data = response.data as { briefings?: PracticeBriefing[] };
        return data.briefings ?? [];
      }

      return [];
    } catch (err) {
      log.debug('Failed to fetch briefings', err);
      return [];
    }
  }

  /**
   * Fetch pattern-based practice suggestions
   */
  async getPatternSuggestions(): Promise<PatternSuggestion[]> {
    try {
      const response = await apiGet('/api/practices/pattern-suggestions');

      if (response.ok && response.data) {
        const data = response.data as { suggestions?: PatternSuggestion[] };
        return data.suggestions ?? [];
      }

      return [];
    } catch (err) {
      log.debug('Failed to fetch pattern suggestions', err);
      return [];
    }
  }

  /**
   * Check for upcoming practices and notify if needed
   */
  private async checkUpcomingPractices(): Promise<void> {
    if (!this.onBriefingCallback) return;

    try {
      const briefings = await this.getUpcomingBriefings(30); // 30 minute window

      // Find the soonest practice we haven't notified about
      for (const briefing of briefings) {
        if (briefing.practiceId !== this.lastNotifiedPracticeId) {
          // Notify only if within 15 minutes
          if (briefing.minutesUntil <= 15) {
            this.lastNotifiedPracticeId = briefing.practiceId;
            this.onBriefingCallback(briefing);
            log.info('Notified upcoming practice', {
              practice: briefing.practiceName,
              minutesUntil: briefing.minutesUntil,
            });
            break; // Only notify one at a time
          }
        }
      }
    } catch (err) {
      log.debug('Error checking upcoming practices', err);
    }
  }

  /**
   * Manually trigger a check (useful after creating a new practice)
   */
  async triggerCheck(): Promise<void> {
    await this.checkUpcomingPractices();
  }

  /**
   * Reset notification state (useful for testing or after completing a practice)
   */
  resetNotificationState(): void {
    this.lastNotifiedPracticeId = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const practiceBriefingsService = new PracticeBriefingsService();

export default practiceBriefingsService;

