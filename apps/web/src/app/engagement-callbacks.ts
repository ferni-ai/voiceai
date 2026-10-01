/**
 * Engagement Callbacks
 *
 * Spotify now-playing messages and engagement service updates
 * (rituals, predictions, streak milestones).
 */

import { delightService } from '../services/delight.service.js';
import { engagementService, spotifyService } from '../services/index.js';
import { roadmapService } from '../services/roadmap.service.js';
import { messageUI } from '../ui/message.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { getEngagementUI } from '../ui/engagement.ui.js';
import { getPredictionsUI } from '../ui/predictions.ui.js';
import { showStreakMilestone } from '../ui/notifications.ui.js';
import { celebrateStreak, isStreakMilestone } from '../ui/streak-celebrations.ui.js';
import { handleEngagementTrigger } from '../app/data-message-handlers.js';

/**
 * Wire Spotify and engagement service callbacks to the UI.
 */
export function setupEngagementCallbacks(): void {
  // Spotify state changes
  spotifyService.onStateChange((state, trackInfo) => {
    if (state === 'playing' && trackInfo) {
      messageUI.show(`Now playing: ${trackInfo.name}`, 'info', 3000);
    }
  });

  // Engagement service callbacks
  engagementService.setCallbacks({
    onEngagementUpdate: (data) => {
      // Update the engagement UI panel
      getEngagementUI().update(data);

      // Update badge count for due rituals
      const dueCount = data.ritualStreaks.filter((s) => s.dueToday).length;
      engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

      // Check for streak at risk (streak > 3 days and due today)
      const atRisk = data.ritualStreaks.some((s) => s.currentStreak >= 3 && s.dueToday);
      if (atRisk) {
        engagementTriggerUI.updateBadges({ streakAtRisk: true });
      }
    },

    onEngagementTrigger: (trigger) => {
      // Handle engagement triggers from the agent
      handleEngagementTrigger(trigger);
    },

    onPredictionsUpdate: (predictions) => {
      // Update predictions UI
      const readyCount = predictions.filter((p) => p.status === 'resolved').length;
      engagementTriggerUI.updateBadges({ predictionsReady: readyCount > 0 ? readyCount : 0 });

      // Update predictions panel
      // Calculate prediction streak: consecutive accurate predictions (within 15% of actual)
      const resolved = predictions
        .filter((p) => p.status === 'resolved' && p.actualOutcome !== undefined)
        .sort(
          (a, b) => new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime()
        );

      let predictionStreak = 0;
      for (const p of resolved) {
        const error = Math.abs(p.userPrediction - (p.actualOutcome ?? 0));
        if (error <= 15) {
          predictionStreak++;
        } else {
          break; // Streak broken
        }
      }

      getPredictionsUI().update({
        predictions,
        accuracy: engagementService.calculateAccuracy(),
        totalResolved: predictions.filter((p) => p.status === 'resolved').length,
        currentStreak: predictionStreak,
      });
    },

    onStreakMilestone: (streak) => {
      // Celebrate streak milestones with brand-aligned animations
      if (isStreakMilestone(streak.count)) {
        // Play character-style particle celebration
        celebrateStreak(streak.count, streak.personaId);

        // Show notification
        showStreakMilestone(streak.ritualName, streak.count, streak.personaId);
      }

      // Always show warmth glow and haptic feedback
      celebrationsUI.warmthGlow({ intensity: streak.count >= 30 ? 'intense' : 'warm' });
      delightService.haptic(streak.count >= 7 ? 'heavy' : 'medium');
      presenceUI.bounce();

      // 🌱 Check for seed rewards at streak milestones (7-day: 5 seeds, 30-day: 15 seeds)
      void roadmapService.checkStreakReward(streak.count).then((result) => {
        if (result.awarded && result.seedsAwarded) {
          // Show seed reward notification
          const msg = result.message || `You earned ${result.seedsAwarded} seeds!`;
          messageUI.show(msg, 'success', 4000);
        }
      });
    },
  });
}
