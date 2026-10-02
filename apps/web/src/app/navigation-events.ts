/**
 * Navigation Events
 *
 * Window events that open panels: push notification taps, voice
 * navigation, persona switches, dev panel and mobile quick actions.
 */

import type { PersonaId } from '../types/persona.js';
import { appState } from '../state/app.state.js';
import { messageUI } from '../ui/message.ui.js';
import { openYourPeople } from '../ui/your-people.ui.js';
import { connectionQualityUI } from '../ui/connection-quality.ui.js';
import { transcriptUI } from '../ui/transcript.ui.js';
import { openChronicle } from '../ui/chronicle.ui.js';
import { marketplaceUI } from '../ui/marketplace.ui.js';
import { getInsightsView } from '../ui/insights-view.ui.js';
import { getPredictionsUI } from '../ui/predictions.ui.js';
import { showStreakMilestone } from '../ui/notifications.ui.js';
import { celebrateStreak } from '../ui/streak-celebrations.ui.js';
import { startGoogleCalendarLink } from '../services/calendar-providers.service.js';
import { getSanctuaryUI } from '../ui/sanctuary.ui.js';
import { getSettingsMenuUI } from '../ui/settings-menu.ui.js';
import { openKnowledgeQuiz } from '../ui/knowledge-quiz.ui.js';
import { memoryLaneUI } from '../ui/memory-lane.ui.js';
import { openPatternInsights } from '../ui/pattern-insights-modal.ui.js';
import { getOnboardingUI } from '../ui/onboarding.ui.js';
import { musicDashboard } from '../ui/music-dashboard.ui.js';
import { showTeamIntro } from '../ui/team-intro.ui.js';
import { showNotificationSettings } from '../ui/notification-settings.ui.js';
import { setCalendarViewCallbacks, showCalendarView } from '../ui/calendar-view.ui.js';
import { showVoiceEnrollmentModal } from '../ui/voice-enrollment.ui.js';
import { showHouseholdManager } from '../ui/household-manager.ui.js';
import { ferniFundUI } from '../ui/ferni-fund.ui.js';
import {
  showAnalyticsDashboard,
  showCognitiveInsights,
  openMemoryPanel,
  showConversationHistory,
  showTeamHuddle,
  showYourStoryDashboard,
} from '../app/panel-methods.js';
import { addTrackedListener } from './init-helpers.js';
import type { AppHost } from './app-host.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Panel-opening events from push notifications and voice commands.
 */
export function wireNavigationEvents(host: AppHost): void {
  // 📬 Listen for push notification navigation events
  addTrackedListener(window, 'ferni:open-engagement', () => {
    // Open InsightsView ("What I'm Noticing") - the relationship-focused view
    void getInsightsView().show();
  });
  addTrackedListener(window, 'ferni:open-predictions', () => {
    void getPredictionsUI().show();
  });
  addTrackedListener(window, 'ferni:open-team-huddle', () => {
    void showTeamHuddle();
  });

  // 🎤 Voice-Activated Navigation - Handle panel open events from voice commands
  // These are triggered by the ui-navigation tool domain via show_view events
  addTrackedListener(window, 'ferni:open-your-story', () => {
    void showYourStoryDashboard();
  });
  addTrackedListener(window, 'ferni:open-memory-lane', () => {
    void memoryLaneUI.open();
  });
  addTrackedListener(window, 'ferni:open-history', () => {
    void showConversationHistory();
  });
  addTrackedListener(window, 'ferni:open-memories', (e) => {
    // Optional detail.tab ('goals', 'story', 'conversations', 'data') opens that tab.
    const tab = (e as CustomEvent<{ tab?: string } | undefined>).detail?.tab;
    void openMemoryPanel(
      tab === 'goals' || tab === 'story' || tab === 'conversations' || tab === 'data'
        ? tab
        : 'memories'
    );
  });
  addTrackedListener(window, 'ferni:open-patterns', () => {
    void openPatternInsights();
  });
  addTrackedListener(window, 'ferni:open-quiz', () => {
    void openKnowledgeQuiz();
  });
  addTrackedListener(window, 'ferni:open-music', () => {
    void musicDashboard.show();
  });
  addTrackedListener(window, 'ferni:open-calendar', () => {
    setCalendarViewCallbacks({
      onConnectCalendar: () => {
        const userId = appState.get('deviceId') || 'anonymous';
        void startGoogleCalendarLink(userId);
      },
    });
    void showCalendarView();
  });
  addTrackedListener(window, 'ferni:open-contacts', () => {
    void openYourPeople();
  });
  addTrackedListener(window, 'ferni:open-journal', () => {
    void openChronicle();
  });
  addTrackedListener(window, 'ferni:open-year-with-ferni', () => {
    import('../ui/your-year-with-ferni.ui.js')
      .then(({ openYourYearWithFerni }) => {
        const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
        return openYourYearWithFerni(userId);
      })
      .catch((err) => {
        log.error({ error: String(err) }, 'Failed to open Your Year with Ferni');
      });
  });
  addTrackedListener(window, 'ferni:open-settings', () => {
    getSettingsMenuUI().show();
  });
  addTrackedListener(window, 'ferni:open-practices', () => {
    void getSanctuaryUI().open();
  });
  addTrackedListener(window, 'ferni:open-household', () => {
    void showHouseholdManager();
  });
  addTrackedListener(window, 'ferni:open-voice-id', () => {
    void showVoiceEnrollmentModal();
  });
  addTrackedListener(window, 'ferni:open-notifications', () => {
    showNotificationSettings();
  });
  addTrackedListener(window, 'ferni:close-panel', () => {
    // Close any open modal by dispatching escape key event
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  // 🔄 Persona Switch - connects dispatched events to actual handoff
  // Multiple UI components dispatch this event (team-unlock-celebration, command-palette, etc.)
  // but it wasn't triggering the voice agent handoff - this fixes that!
  addTrackedListener(window, 'ferni:switch-persona', ((e: CustomEvent) => {
    const personaId = e.detail?.personaId || e.detail?.persona;
    if (personaId) {
      log.info({ personaId }, '🔄 ferni:switch-persona event received, triggering selectPersona');
      host.selectPersona(personaId as PersonaId);
    }
  }) as EventListener);
  // 🎙️ Group Conversations - imported UI opens team roundtable or adds participant
  addTrackedListener(window, 'ferni:start-roundtable', ((e: CustomEvent) => {
    // Import dynamically to avoid circular deps
    void import('../ui/group-conversation.ui.js').then((m) => {
      void m.showTeamSelector(e.detail?.preselected);
    });
  }) as EventListener);
  addTrackedListener(window, 'ferni:add-call-participant', () => {
    void import('../ui/group-conversation.ui.js').then((m) => {
      void m.showAddParticipant({
        onAdd: (phoneNumber, name, relationship) => {
          log.info({ phoneNumber, name, relationship }, 'Adding participant to call');
          // TODO: Implement actual participant addition via connection service
        },
        onCancel: () => {
          log.debug('Add participant cancelled');
        },
      });
    });
  });
}

/**
 * Dev panel, Sanctuary and mobile bottom sheet events.
 */
export function wireQuickActionEvents(): void {
  // 📊 Dev Panel modal event listeners
  addTrackedListener(window, 'ferni:open-analytics', () => {
    void showAnalyticsDashboard();
  });
  addTrackedListener(window, 'ferni:open-history', () => {
    void showConversationHistory();
  });
  addTrackedListener(window, 'ferni:open-insights', () => {
    void showCognitiveInsights();
  });
  addTrackedListener(window, 'ferni:start-tour', () => {
    getOnboardingUI().start();
  });
  addTrackedListener(window, 'ferni:open-daily-practice', () => {
    // Daily check-in - open the relationship-focused InsightsView
    void getInsightsView().show();
  });
  addTrackedListener(window, 'ferni:open-sanctuary', () => {
    // The Sanctuary - immersive guided practices experience
    void getSanctuaryUI().open();
  });
  addTrackedListener(window, 'ferni:start-practice', async (e: Event) => {
    // Practice started from Sanctuary
    const customEvent = e as CustomEvent<{
      practiceId: string;
      prompt: string;
      practice: { id: string; name: string };
    }>;
    const { practice, prompt } = customEvent.detail;
    log.info('Practice started from Sanctuary', { id: practice.id, name: practice.name });

    // Check if connected to agent
    const { connectionService } = await import('../services/connection.service.js');
    const roomState = connectionService.getRoomState();
    const room = connectionService.getRoom();

    if (!roomState.isConnected || !room?.localParticipant) {
      messageUI.show('Connect to Ferni first to start a practice', 'info', 3000);
      return;
    }

    // Send practice start request via data channel
    const message = JSON.stringify({
      type: 'practice_start_request',
      commandId: practice.id,
      commandName: practice.name,
      prompt,
      timestamp: Date.now(),
    });

    try {
      await room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });
      messageUI.show(`Starting "${practice.name}"...`, 'success', 2500);
    } catch (err) {
      log.error('Failed to start practice from Sanctuary', err);
      messageUI.show("Couldn't start practice. Try asking Ferni directly!", 'error', 4000);
    }
  });
  addTrackedListener(window, 'ferni:open-marketplace', () => {
    void marketplaceUI.open();
  });

  // 📱 Mobile Bottom Sheet - Quick action event handlers
  addTrackedListener(window, 'ferni:open-settings', () => {
    void getSettingsMenuUI().show();
  });
  addTrackedListener(window, 'ferni:open-team', () => {
    void showTeamIntro();
  });
  addTrackedListener(window, 'ferni:open-music', () => {
    void musicDashboard.show();
  });
  addTrackedListener(window, 'ferni:open-calendar', () => {
    void showCalendarView();
  });
  addTrackedListener(window, 'ferni:open-people', () => {
    openYourPeople();
  });

  // 🌱 Garden Widget - Plant seed flow integration
  addTrackedListener(window, 'ferni:open-plant-seed', ((e: CustomEvent) => {
    const detail = e.detail as { type: 'one-time' | 'monthly' } | undefined;
    const userId = appState.get('deviceId');
    if (userId) {
      // Open Ferni Fund modal - user can choose contribution type
      log.debug('Plant seed requested', { type: detail?.type });
      void ferniFundUI.open(userId);
    }
  }) as EventListener);

  // 💬 Dev Panel transcript injection
  addTrackedListener(window, 'ferni:transcript', ((e: CustomEvent) => {
    const { type, text, isFinal } = e.detail;
    // transcriptUI.show() handles both user and agent messages
    // User messages are typically interim, agent messages are final
    if (type === 'user') {
      transcriptUI.updateInterim(text);
    } else if (type === 'agent') {
      transcriptUI.show(text, isFinal ?? true);
    }
  }) as EventListener);

  // 📶 Dev Panel connection quality simulation
  addTrackedListener(window, 'ferni:connection-quality', ((e: CustomEvent) => {
    const { quality } = e.detail;
    // Map dev panel values to ConnectionQuality type
    const qualityMap: Record<string, 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected'> = {
      excellent: 'excellent',
      good: 'good',
      poor: 'poor',
      offline: 'disconnected', // Map 'offline' to 'disconnected'
    };
    const mappedQuality = qualityMap[quality] ?? 'good';
    connectionQualityUI.setQuality(mappedQuality);
    connectionQualityUI.show();
  }) as EventListener);

  // 🎊 Dev Panel streak milestone simulation
  addTrackedListener(window, 'ferni:streak-milestone', ((e: CustomEvent) => {
    const { days, intensity } = e.detail;
    // Show streak notification UI
    showStreakMilestone('Daily Check-in', days, 'ferni');
    // Also trigger celebration animation if high enough
    if (intensity === 'large' || intensity === 'epic') {
      celebrateStreak(days, 'ferni');
    }
  }) as EventListener);
}
