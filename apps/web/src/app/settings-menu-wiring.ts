/**
 * Settings Menu Wiring
 *
 * The settings menu callbacks, push notifications and integrations
 * settings.
 */

import { showThemeLanguageSettings } from '../ui/theme-language-settings.ui.js';
import { appState } from '../state/app.state.js';
import { messageUI } from '../ui/message.ui.js';
import {
  getSpotifyLinkStatus,
  onSpotifyLinkStateChange,
  triggerSpotifyLinkToggle,
} from '../ui/spotify.ui.js';
import { openYourPeople } from '../ui/your-people.ui.js';
import { openChronicle } from '../ui/chronicle.ui.js';
import { openCreativeYouDashboard } from '../ui/creative-you-dashboard.ui.js';
import {
  getIntegrationsSettingsUI,
  showIntegrationsSettings,
} from '../ui/integrations-settings.ui.js';
import { openAdminQueue as openMarketplaceAdmin } from '../ui/marketplace-admin.ui.js';
import { openMarketplace } from '../ui/marketplace.ui.js';
import { teamInsightsUI } from '../ui/team-insights.ui.js';
import { startGoogleCalendarLink } from '../services/calendar-providers.service.js';
import accentSettingsUI from '../ui/accent-settings.ui.js';
import { showActivity } from '../ui/activity.ui.js';
import { getRitualBuilderUI } from '../ui/ritual-builder.ui.js';
import { getSanctuaryUI } from '../ui/sanctuary.ui.js';
import { getSettingsMenuUI, initSettingsMenuUI } from '../ui/settings-menu.ui.js';
import { openGrowthJournal } from '../ui/growth-journal.ui.js';
import { openKnowledgeQuiz } from '../ui/knowledge-quiz.ui.js';
import { memoryLaneUI } from '../ui/memory-lane.ui.js';
import { openPatternInsights } from '../ui/pattern-insights-modal.ui.js';
import { getOnboardingUI } from '../ui/onboarding.ui.js';
import { showGamePicker } from '../ui/game-picker.ui.js';
import { musicDashboard } from '../ui/music-dashboard.ui.js';
import { initPushNotifications } from '../services/push-notifications.service.js';
import {
  initNotificationSettingsUI,
  showNotificationSettings,
} from '../ui/notification-settings.ui.js';
import { openOutreachSchedule } from '../ui/outreach-schedule.ui.js';
import { openContactSettings } from '../ui/contact-settings.ui.js';
import { openCalendarSettings } from '../ui/calendar-settings.ui.js';
import { setCalendarViewCallbacks, showCalendarView } from '../ui/calendar-view.ui.js';
import { showWearableSettings } from '../ui/wearable-settings.ui.js';
import { showVideoSettings } from '../ui/video-settings.ui.js';
import { initLinkedInSettings, showLinkedInSettings } from '../ui/linkedin-settings.ui.js';
import { show as showVibeController } from '../ui/vibe-controller.ui.js';
import { showSmartHomeSettings } from '../ui/smart-home-settings.ui.js';
import { showEightSleepSettings } from '../ui/eight-sleep-settings.ui.js';
import { showOuraSettings } from '../ui/oura-settings.ui.js';
import { showAppleHealthSettings } from '../ui/apple-health-settings.ui.js';
import { connectLinkedIn, disconnectLinkedIn } from '../services/linkedin.service.js';
import { showGroupCoaching } from '../ui/group-coaching.ui.js';
import { showVoiceEnrollmentModal } from '../ui/voice-enrollment.ui.js';
import { FamilyIdentities } from '../ui/family-identities.ui.js';
import { showHouseholdManager } from '../ui/household-manager.ui.js';
import { showWellbeingDashboard } from '../ui/wellbeing-dashboard.ui.js';
import { showLifeContextDashboard } from '../ui/life-context-dashboard.ui.js';
import { futureInsightsUI } from '../ui/future-insights.ui.js';
import { journeyUI } from '../ui/journey.ui.js';
import { supportFerniUI } from '../ui/support-ferni.ui.js';
import { personalizeUI } from '../ui/personalize.ui.js';
import { referralUI } from '../ui/referral.ui.js';
import {
  showAnalyticsDashboard,
  showCognitiveInsights,
  showConversationHistory,
  openMemoryPanel,
  showDataExport,
  showPredictionTracker,
  showTeamHuddle,
  showYourStoryDashboard,
} from '../app/panel-methods.js';
import { safeInit } from './init-helpers.js';
import { openBillingPortal } from './subscription-gating.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Initialize the settings menu, notifications and integrations settings.
 */
export function initSettingsMenu(): void {
  // 📋 Settings Menu - Central navigation hub
  safeInit('SettingsMenuUI', () => {
    initSettingsMenuUI({
      onHistoryClick: () => void showConversationHistory(),
      onAnalyticsClick: () => void showAnalyticsDashboard(),
      onCognitiveClick: () => void showCognitiveInsights(),
      onRitualBuilderClick: () => getRitualBuilderUI().show(),
      onCommandsClick: () => void getSanctuaryUI().open(),
      onPredictionTrackerClick: () => void showPredictionTracker(),
      onExportDataClick: () => void showDataExport(),
      onOnboardingClick: () => getOnboardingUI().start(),
      onThemeToggle: () => showThemeLanguageSettings(),
      onNotificationSettingsClick: () => showNotificationSettings(),
      onSleepSettingsClick: () => void import('../ui/sleep-settings.ui.js').then((m) => m.show()),
      onSpotifyClick: () => void triggerSpotifyLinkToggle(),
      onTeamHuddleClick: () => showTeamHuddle(),
      onTeamObservationsClick: () =>
        void import('../ui/team-observations-panel.ui.js').then((m) => m.show()),
      // Trust Journey is now integrated into the unified Journey modal
      onTrustJourneyClick: () => journeyUI.open(),
      onMusicDashboardClick: () => void musicDashboard.show(),
      onPlayGamesClick: () => showGamePicker(),
      onOutreachScheduleClick: () => void openOutreachSchedule(),
      onContactSettingsClick: () => void openContactSettings(),
      onCalendarSettingsClick: () => {
        // Show calendar view (has connect button for disconnected users)
        setCalendarViewCallbacks({
          onConnectCalendar: () => {
            // Redirect to Google OAuth flow
            const userId = appState.get('deviceId') || 'anonymous';
            void startGoogleCalendarLink(userId);
          },
        });
        void showCalendarView();
      },
      onVoiceEnrollmentClick: () => void showVoiceEnrollmentModal(),
      onSubscriptionClick: () => void supportFerniUI.open(),
      onBillingPortalClick: () => void openBillingPortal(),
      onHouseholdClick: () => void showHouseholdManager(),
      onFamilyCallersClick: () => void FamilyIdentities.show(),
      onConversationMemoryClick: () => void openMemoryPanel('memories'),
      onWellbeingClick: () => void showWellbeingDashboard(),
      onLifeContextClick: () => void showLifeContextDashboard(),
      onTeamInsightsClick: () => teamInsightsUI.toggle(),
      onSupportFerniClick: () => void supportFerniUI.open(),
      onPersonalizeClick: () => personalizeUI.open(),
      onYourStoryClick: () => void showYourStoryDashboard(),
      onActivityClick: () => showActivity(),
      onYourYearClick: () => {
        // Open "Your Year with Ferni" visualization
        log.debug('YourYear callback triggered, starting import');
        import('../ui/your-year-with-ferni.ui.js')
          .then(({ openYourYearWithFerni }) => {
            log.debug('YourYear module loaded, opening');
            const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
            return openYourYearWithFerni(userId);
          })
          .then(() => {
            log.debug('YourYear opened successfully');
          })
          .catch((err) => {
            log.error({ error: String(err) }, 'YourYear error');
          });
      },
      onFutureInsightsClick: () => futureInsightsUI.open(),
      onDeepInsightsClick: () => {
        // Open the Semantic Intelligence Panel (8-tab dashboard showing all superhuman insights)
        import('../ui/semantic-intelligence-panel.ui.js').then(
          ({ showSemanticIntelligencePanel }) => {
            showSemanticIntelligencePanel();
          }
        );
      },
      onShareFerniClick: () => referralUI.open(),
      onAccentSettingsClick: () => accentSettingsUI.open(),
      onWearableSettingsClick: () => void showWearableSettings(),
      onLinkedInClick: () => {
        initLinkedInSettings();
        showLinkedInSettings();
      },
      onVibeControllerClick: () => void showVibeController(),
      onSmartHomeClick: () => void showSmartHomeSettings(),
      onEightSleepClick: () => void showEightSleepSettings(),
      onOuraClick: () => void showOuraSettings(),
      onAppleHealthClick: () => void showAppleHealthSettings(),
      onVideoSettingsClick: () => void showVideoSettings(),
      onGroupCoachingClick: () => void showGroupCoaching(),
      onMarketplaceAdminClick: () => {
        // Admin panel requires admin session
        const adminId = localStorage.getItem('ferni_admin_id');
        if (adminId) {
          void openMarketplaceAdmin({ id: adminId, name: 'Admin' });
        }
      },
      onCreativeYouClick: () => {
        const userId = appState.get('deviceId') || 'anonymous';
        void openCreativeYouDashboard(userId);
      },
      onDiscoverAgentsClick: () => void openMarketplace(),
      onJournalClick: () => void openChronicle(),
      onHubClick: () => {
        // Open Ferni Hub - "Your Day with Ferni"
        void import('../ui/ferni-hub.ui.js').then(({ show }) => {
          void show();
        });
      },
      onWhatIDoForYouClick: () => {
        // Open "What I Do For You" - Ferni's care routines
        void import('../ui/ferni-care/index.js').then(({ showFerniCareDashboard }) => {
          showFerniCareDashboard();
        });
      },
      onConnectionsClick: () => void showIntegrationsSettings(),
      onContactsClick: () => void openYourPeople(),
      onGiftsClick: () => void openYourPeople(), // Gifts now integrated into relationship cards
      // Warm menu callbacks
      onTogetherSessionsClick: () => void showGroupCoaching(), // Combines group coaching + team huddles
      onAllConnectionsClick: () => {
        // Open the Connected Life panel (consolidates all integrations)
        void import('../ui/connected-life.ui.js').then(({ showConnectedLife }) => {
          void showConnectedLife({
            onConnectAppleHealth: () => void showAppleHealthSettings(),
            onConnectOura: () => void showOuraSettings(),
            onConnectEightSleep: () => void showEightSleepSettings(),
            onConnectWearables: () => void showWearableSettings(),
            onConnectCalendar: () => void openCalendarSettings(),
            onConnectLinkedIn: () => {
              void initLinkedInSettings();
              void showLinkedInSettings();
            },
            onConnectSpotify: () => void triggerSpotifyLinkToggle(),
            onConnectEcobee: () => void showVibeController(), // Ecobee is in Vibe Controller
            onOpenVibeController: () => void showVibeController(),
          });
        });
      },
      // New feature callbacks
      onMemoryLaneClick: () => void memoryLaneUI.open(),
      onPatternInsightsClick: () => void openPatternInsights(),
      onConversationInsightsClick: async () => {
        // Show feedback insights panel (how conversations are resonating)
        const { openFeedbackInsightsPanel } = await import('../ui/feedback-insights-panel.ui.js');
        const userId = appState.get('firebaseUid');
        if (userId) {
          void openFeedbackInsightsPanel(userId);
        }
      },
      onKnowledgeQuizClick: () => void openKnowledgeQuiz(),
      onGrowthJournalClick: () => void openGrowthJournal(),
    });

    // Wire up Spotify state changes to menu
    onSpotifyLinkStateChange((linked, configured) => {
      getSettingsMenuUI().updateSpotifyState(linked, configured);
    });

    // Initialize menu with current Spotify state
    const spotifyStatus = getSpotifyLinkStatus();
    getSettingsMenuUI().updateSpotifyState(spotifyStatus.linked, spotifyStatus.configured);
  });

  // 🔔 Push Notifications
  safeInit('NotificationSettingsUI', () => initNotificationSettingsUI());
  safeInit('PushNotifications', () => void initPushNotifications());

  // 🔗 Integrations Settings - "Better than Human" connections (LinkedIn, Calendar, Health)
  safeInit('IntegrationsSettingsUI', () => {
    getIntegrationsSettingsUI().initialize();
    getIntegrationsSettingsUI().setCallbacks({
      onConnectLinkedIn: () => {
        void connectLinkedIn();
      },
      onDisconnectLinkedIn: () => {
        void disconnectLinkedIn();
      },
      onConnectCalendar: () => {
        const userId = appState.get('deviceId') || 'anonymous';
        void startGoogleCalendarLink(userId);
      },
      onConnectBiometrics: async (platform) => {
        const userId = appState.get('deviceId') || 'anonymous';
        log.info('Connect biometrics requested', { platform, userId });

        // Import biometrics service dynamically to avoid circular deps
        const { connectBiometrics, isPlatformAvailable, getPlatformConfig } =
          await import('../services/biometrics.service.js');

        // Type assertion - the callback provides a string but we know it's a valid platform
        type BiometricsPlatform = Parameters<typeof connectBiometrics>[0];
        const typedPlatform = platform as BiometricsPlatform;

        // Check if platform is available
        if (!isPlatformAvailable(typedPlatform)) {
          const config = getPlatformConfig(typedPlatform);
          messageUI.show(
            config?.name
              ? `${config.name} isn't available on this device`
              : 'Platform not available',
            'warning',
            3000
          );
          return;
        }

        // Initiate OAuth connection
        const result = await connectBiometrics(typedPlatform, userId);

        if (!result.success && result.error) {
          messageUI.show(result.error, 'error', 4000);
        }
      },
      onConnectBanking: async () => {
        const userId = appState.get('deviceId') || 'anonymous';
        log.info('Connect banking requested', { userId });

        // Import banking service dynamically to avoid circular deps
        const { connectBanking } = await import('../services/banking.service.js');

        // Initiate Plaid Link flow
        const result = await connectBanking(userId);

        if (result.success) {
          messageUI.show('Bank connected!', 'success', 2500);
        } else if (result.error && result.error !== 'User cancelled') {
          messageUI.show(result.error, 'error', 4000);
        }
      },
    });
  });
}
