/**
 * Startup Checks
 *
 * Welcome greeting, engagement data, voice profile re-enrollment and the
 * default user name, run once the UI is up.
 */

import { appState, setUserName } from '../state/app.state.js';
import { engagementService } from '../services/index.js';
import { messageUI } from '../ui/message.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { greetingUI } from '../ui/greeting.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { getEngagementUI } from '../ui/engagement.ui.js';
import { getPredictionsUI } from '../ui/predictions.ui.js';
import { handleMomentTrigger } from '../systems/index.js';
import {
  disableDemoData,
  enableDemoData,
  getDemoEngagementData,
  getDemoPredictions,
} from '../services/engagement-demo-data.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { startOnboardingIfNeeded } from '../ui/onboarding.ui.js';
import { getVoiceAuthService } from '../services/voice-auth.service.js';
import { toast } from '../ui/whisper.ui.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Show personalized welcome message and track engagement.
 * FIRST CONVERSATION IS ONBOARDING - keep it simple for new users.
 */
export function showWelcome(): void {
  // Record visit
  greetingUI.recordVisit();

  // Get personalized greeting - but only show for returning users
  // First-time users get a clean, simple experience
  if (modalCoordinator.hasMinimumConversations(1)) {
    const greeting = greetingUI.getGreeting();
    messageUI.setHelper(greeting);

    // 🌟 Transcendent: Recognition moment for returning users
    // This creates the powerful "I see you, I remember you" moment
    handleMomentTrigger('recognition');

    // Check for streak milestone - only for returning users
    const streakMilestone = greetingUI.checkStreakMilestone();
    if (streakMilestone) {
      // Celebrate streak milestone - warm acknowledgement
      setTimeout(() => {
        const message = greetingUI.getMilestoneMessage('streak', streakMilestone);
        messageUI.show(message, 'success', 4000);
        celebrationsUI.warmthGlow({ intensity: 'warm' });
        soundUI.play('success');
      }, 2000);
    }

    // Show streak badge if streak >= 3 - DISABLED: Now shown in Connection Heart
    // Streak is visible on the heart indicator (fire badge) and in Journey modal
    // const streak = greetingUI.getStreak();
    // if (streak >= 3) {
    //   showStreakBadge(streak);
    // }
  }

  // Ambient particles removed - keeping UI clean and human
  // Weather effects available via dev panel when contextually appropriate

  // 🆕 Auto-start onboarding for returning users only (gated in onboarding.ui.ts)
  setTimeout(() => {
    startOnboardingIfNeeded();
  }, 1500);
}

/**
 * Load engagement data - tries API first, falls back to demo in development.
 *
 * BEHAVIOR:
 * - Always tries API first (using X-User-Id header for auth)
 * - In development: Falls back to demo data if API fails/returns empty
 * - In production: Shows empty state if API fails (no demo data)
 */
export async function loadEngagementData(): Promise<void> {
  const userId = localStorage.getItem('ferni_user_id');

  // Try API first
  if (userId) {
    try {
      const data = await engagementService.fetchEngagementData(userId);
      if (data && (data.ritualStreaks.length > 0 || data.weatherHistory.length > 0)) {
        log.info('Loaded engagement data from API', {
          streaks: data.ritualStreaks.length,
          weather: data.weatherHistory.length,
        });
        getEngagementUI().update(data);

        // Update badges from real data
        const dueCount = data.ritualStreaks.filter((s) => s.dueToday).length;
        engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

        disableDemoData();
        return;
      }
    } catch (err) {
      log.warn('Failed to load engagement data from API', err);
    }
  }

  // Fall back to demo data in development only
  if (shouldUseDemoData()) {
    log.debug('No API data available - loading demo data (development mode)');
    enableDemoData();

    const demoData = getDemoEngagementData();
    getEngagementUI().update(demoData);

    const dueCount = demoData.ritualStreaks.filter((s) => s.dueToday).length;
    engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

    const demoPredictions = getDemoPredictions();
    const pendingCount = demoPredictions.filter((p) => p.status === 'pending').length;
    engagementTriggerUI.updateBadges({ predictionsReady: pendingCount });

    getPredictionsUI().update({
      predictions: demoPredictions,
      accuracy: 78,
      totalResolved: demoPredictions.filter((p) => p.status === 'resolved').length,
      currentStreak: 4,
    });
  } else {
    log.info('No engagement data available - showing empty state');
    disableDemoData();
  }
}

/**
 * Check if user needs to re-enroll their voice profile.
 * Shows a toast if quality is low, pointing to Settings > Voice ID.
 */
export async function checkVoiceReEnrollment(): Promise<void> {
  try {
    const voiceAuth = getVoiceAuthService();
    const result = await voiceAuth.checkReEnrollmentNeeded();

    if (result.needed && result.message) {
      // Delay the toast to not overwhelm on startup
      setTimeout(() => {
        if (result.severity === 'high') {
          // High severity - show warning
          toast.warning('Your voice profile needs a refresh. Head to Settings → Voice ID.');
        } else {
          // Low severity - just informational
          toast.info('Voice profile could be sharper. Try Settings → Voice ID.');
        }
      }, 5000); // Wait 5 seconds after app loads
    }
  } catch (error) {
    // Silently fail - not critical
    log.debug('Voice re-enrollment check skipped:', error);
  }
}

/**
 * Prompt for user name if not set.
 */
export function promptForUserName(): void {
  const currentName = appState.get('userName');
  if (currentName) return;

  // For now, use a default name
  // In production, you'd show a modal or use the name input
  const defaultName = 'User';
  setUserName(defaultName);
}
