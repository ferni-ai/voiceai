/**
 * Feature UI Initialization
 *
 * Engagement, rituals, practices, data export, monetization, voice
 * identity and dashboard modules.
 */

import { messageUI } from '../ui/message.ui.js';
import { initGroupConversationUI } from '../ui/group-conversation.ui.js';
import { initProactiveMessages } from '../ui/proactive-messages.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { initEngagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { getInsightsView } from '../ui/insights-view.ui.js';
import { getPredictionsUI } from '../ui/predictions.ui.js';
import { initNotificationsUI } from '../ui/notifications.ui.js';
import { teamInsightsUI } from '../ui/team-insights.ui.js';
import { apiGet, apiPost } from '../utils/api.js';
import { initActivityUI } from '../ui/activity.ui.js';
import { initAnalyticsDashboardUI } from '../ui/analytics-dashboard.ui.js';
import { initCognitiveInsightsUI } from '../ui/cognitive-insights.ui.js';
import { getCommandsPanelUI } from '../ui/commands.ui.js';
import { initConversationHistoryUI } from '../ui/conversation-history.ui.js';
import { getDataExportUI, initDataExportUI } from '../ui/data-export.ui.js';
import { initGameBoard } from '../ui/game-board.ui.js';
import { initPredictionTrackerUI } from '../ui/prediction-tracker.ui.js';
import { getRitualBuilderUI, initRitualBuilderUI } from '../ui/ritual-builder.ui.js';
import { initConversationTracker } from '../services/conversation-tracker.service.js';
import { dataExportService } from '../services/data-export.service.js';
import { initRitualsService, ritualsService } from '../services/rituals.service.js';
import { initOnboardingUI } from '../ui/onboarding.ui.js';
import { initPersonaTransitionUI } from '../ui/persona-transition.ui.js';
import { initCameoRoster } from '../ui/cameo-roster.ui.js';
import { initRelationshipProgressUI } from '../ui/stage-celebration.ui.js';
import { initTeamHuddleUI } from '../ui/team-huddle.ui.js';
import { initTeamIntro } from '../ui/team-intro.ui.js';
import { initVoiceEnrollmentUI } from '../ui/voice-enrollment.ui.js';
import { initVoiceIdBadge } from '../ui/voice-id-badge.ui.js';
import { initSpeakerChangeIndicator } from '../ui/speaker-change-indicator.ui.js';
import { initHouseholdManager } from '../ui/household-manager.ui.js';
import { initWellbeingDashboard } from '../ui/wellbeing-dashboard.ui.js';
import { initLifeContextDashboard } from '../ui/life-context-dashboard.ui.js';
import { initServiceHealthUI } from '../ui/service-health.ui.js';
import { initSupportFerniUI } from '../ui/support-ferni.ui.js';
import { growthJourneyService } from '../services/growth-journey.service.js';
import { initMomentsSystem } from '../ui/moments/index.js';
import { initSubscriptionUI } from '../ui/subscription.ui.js';
import { initCosmeticsService } from '../services/cosmetics.service.js';
import { initSeedsEconomy } from '../services/seeds-economy.service.js';
import { initReferralService } from '../services/referral.service.js';
import { initSeedsDisplay } from '../ui/seeds-display.ui.js';
import { initSeedsToast } from '../ui/seeds-toast.ui.js';
import { initSubscriptionBadge } from '../ui/subscription-badge.ui.js';
import { initRoadmapPanelUI } from '../ui/roadmap-panel.ui.js';
import { addTrackedListener, deferredInit, safeInit } from './init-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Initialize feature UIs and wire their callbacks.
 */
export function initFeatureUI(): void {
  // 📊 Engagement UI - load after 500ms
  deferredInit('EngagementUI', 500, async () => {
    const [{ initializeEngagementUI }, { initializeInsightsView }, { initializePredictionsUI }] =
      await Promise.all([
        import('../ui/engagement.ui.js'),
        import('../ui/insights-view.ui.js'),
        import('../ui/predictions.ui.js'),
      ]);
    initializeEngagementUI();
    initializeInsightsView();
    initializePredictionsUI();
    // Wire up prediction resolution callback
    getPredictionsUI().setOnResolutionSubmit(async (predictionId, actualValue) => {
      try {
        // TODO: Backend POST /api/predictions/:id/actuals and GET /api/predictions not implemented yet.
        const postResponse = await apiPost(`/api/predictions/${predictionId}/actuals`, {
          actuals: { result: actualValue },
        });
        if (!postResponse.ok) throw new Error('Failed to save');

        // Refresh predictions data using apiGet
        const refreshResponse = await apiGet<{
          predictions: Record<string, unknown>[];
          stats?: { averageAccuracy?: number };
        }>('/api/predictions');
        if (refreshResponse.ok && refreshResponse.data) {
          const predictions = refreshResponse.data.predictions || [];
          getPredictionsUI().update({
            predictions: predictions.map((p: Record<string, unknown>) => ({
              id: p.id as string,
              category: 'overall',
              question: `Week of ${p.weekOf}`,
              userPrediction: 50,
              actualOutcome: p.accuracy as number | undefined,
              status: p.completedAt ? ('resolved' as const) : ('pending' as const),
              createdAt: p.createdAt as string,
            })),
            accuracy: refreshResponse.data.stats?.averageAccuracy || null,
            totalResolved: predictions.filter((p: Record<string, unknown>) => p.completedAt).length,
            currentStreak: 0,
          });
        }

        messageUI.show('Result recorded! Nice work tracking your predictions.', 'success', 3000);
      } catch (err) {
        log.error('Failed to save prediction result', err);
        throw err;
      }
    });
  });
  safeInit('EngagementTriggerUI', () =>
    initEngagementTriggerUI({
      // Show InsightsView ("What I'm Noticing") - the relationship-focused daily check-in
      onEngagementClick: () => getInsightsView().toggle(),
      onPredictionsClick: () => getPredictionsUI().toggle(),
      onInsightsClick: () => teamInsightsUI.toggle(),
    })
  );

  // 🔔 Notifications UI - Proactive engagement notifications
  safeInit('NotificationsUI', () => initNotificationsUI());

  // 🆕 New Feature UIs (v2)
  safeInit('ConversationHistoryUI', () => initConversationHistoryUI());
  safeInit('ActivityUI', () => initActivityUI());
  safeInit('AnalyticsDashboardUI', () => initAnalyticsDashboardUI());
  safeInit('CognitiveInsightsUI', () => initCognitiveInsightsUI());

  // 🔥 Ritual Builder - with persistence callbacks
  safeInit('RitualsService', () => initRitualsService());

  // 📝 Conversation Tracker - for history persistence
  safeInit('ConversationTracker', () => initConversationTracker());
  safeInit('RitualBuilderUI', () => {
    initRitualBuilderUI();
    getRitualBuilderUI().setCallbacks({
      onSave: async (ritual) => {
        const saved = await ritualsService.createRitual(ritual);
        messageUI.show(`"${saved.name}" created! You've got this.`, 'success', 4000);
        log.info('Ritual created via builder', { id: saved.id, name: saved.name });
      },
      onClose: () => log.debug('Ritual builder closed'),
    });
  });

  // 🎯 Commands Panel - for starting predefined practices
  safeInit('CommandsPanelUI', () => {
    getCommandsPanelUI().initialize();
    getCommandsPanelUI().setCallbacks({
      onCommandSelected: async (command, renderedPrompt) => {
        log.info('Practice selected', { id: command.id, name: command.name });

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
          commandId: command.id,
          commandName: command.name,
          prompt: renderedPrompt,
          timestamp: Date.now(),
        });

        try {
          await room.localParticipant.publishData(new TextEncoder().encode(message), {
            reliable: true,
          });
          messageUI.show(`Starting "${command.name}"...`, 'success', 2500);
        } catch (err) {
          log.error('Failed to start practice', err);
          messageUI.show("Couldn't start practice. Try asking Ferni directly!", 'error', 4000);
        }
      },
      onClose: () => log.debug('Commands panel closed'),
    });
  });

  safeInit('PredictionTrackerUI', () => initPredictionTrackerUI());

  // 📦 Data Export - with actual export/delete functionality
  safeInit('DataExportUI', () => {
    initDataExportUI();
    getDataExportUI().setCallbacks({
      onExport: async (format, categories) => {
        try {
          messageUI.show('Preparing your data...', 'info', 2000);
          await dataExportService.exportData(format, categories);
          messageUI.show('Your data has been downloaded!', 'success', 4000);
        } catch (err) {
          log.error('Export failed', err);
          messageUI.show("Hmm, couldn't export your data. Mind trying again?", 'error', 4000);
        }
      },
      onDeleteData: async () => {
        try {
          await dataExportService.deleteAllData();
          messageUI.show('Your data has been removed. Fresh start!', 'info', 4000);
          // Optionally reload to reset state
          setTimeout(() => window.location.reload(), 2000);
        } catch (err) {
          log.error('Deletion failed', err);
          messageUI.show("Couldn't delete your data right now. Try again?", 'error', 4000);
        }
      },
      onClose: () => log.debug('Data export closed'),
    });
  });
  safeInit('OnboardingUI', () => initOnboardingUI());
  safeInit('PersonaTransitionUI', () => initPersonaTransitionUI());
  // 🎬 Cameo Roster - Team member pop-in/out in the roster
  safeInit('CameoRoster', () => initCameoRoster());
  safeInit('TeamHuddleUI', () => initTeamHuddleUI());
  // Team Intro - "Meet the Team" modal (used by mobile bottom sheet)
  safeInit('TeamIntro', () => initTeamIntro());
  safeInit('RelationshipProgressUI', () => initRelationshipProgressUI());
  // 🎙️ Group Conversations - Team Roundtables and Conference Calls with external people
  safeInit('GroupConversationUI', () => initGroupConversationUI());
  // 🎮 Game Board - Visual game state display for voice games
  safeInit('GameBoardUI', () => initGameBoard());
  // Proactive Messages - In-app messages from intelligent outreach
  deferredInit('ProactiveMessagesUI', 500, async () => {
    initProactiveMessages();
  });

  // 📋 While You Were Away - Background agent results notification
  deferredInit('WhileYouWereAwayUI', 600, async () => {
    const { whileYouWereAwayUI } = await import('../ui/while-you-were-away.ui.js');
    whileYouWereAwayUI.init();
  });

  // 🏠 Ferni Hub - Your Day with Ferni (non-voice UI for background results)
  deferredInit('FerniHubUI', 700, async () => {
    const { ferniHubUI } = await import('../ui/ferni-hub.ui.js');
    ferniHubUI.init();
  });

  // Trust Journey is now integrated into journey.ui.ts - no separate init needed

  // 🌱 Progressive Relationship Features - All quick wins in one init
  // Stage celebrations, trust signal cards, persona intros, feature hints, progress indicator
  safeInit('ProgressiveFeatures', () => {
    // Import dynamically to avoid circular deps
    void import('../services/progressive-features.service.js').then(
      ({ initProgressiveFeatures }) => {
        void initProgressiveFeatures();
      }
    );
  });

  // 💰 Subscription UI - Human-centered monetization
  // Philosophy: "Limits feel like natural breaks, not walls."
  safeInit('SubscriptionUI', () => initSubscriptionUI());

  // 💚 Support Ferni / Founders Fund - Community-driven support
  safeInit('SupportFerniUI', () => initSupportFerniUI());

  // 🌱 Roadmap Panel - "What's Growing" feature voting
  safeInit('RoadmapPanelUI', () => initRoadmapPanelUI());

  // 💰 Subscription Badge - Subtle status indicator in header
  safeInit('SubscriptionBadge', () => initSubscriptionBadge());

  // 🎨 Cosmetics Service - Personalization system (themes, skins, sounds)
  safeInit('CosmeticsService', () => initCosmeticsService());

  // 🌱 Seeds Economy - Earn seeds through natural engagement
  safeInit('SeedsEconomy', () => initSeedsEconomy());

  // 🤝 Referral Service - Network effect seeds (check URL for ?ref= param)
  safeInit('ReferralService', () => initReferralService());

  // 🌱 Seeds UI - Display balance and toast notifications
  safeInit('SeedsDisplay', () => initSeedsDisplay());
  safeInit('SeedsToast', () => initSeedsToast());

  // 🎯 Moments System - Unified feedback (whisper, notice, celebration, milestone)
  deferredInit('MomentsSystem', 500, async () => {
    await initMomentsSystem();
  });

  // 🌱 Growth Journey - Celebrate milestones as relationship deepens
  safeInit('GrowthJourney', () => {
    growthJourneyService.init();

    // Listen for new milestones to celebrate
    addTrackedListener(document, 'ferni:milestone-celebrated', ((e: CustomEvent) => {
      const { milestone } = e.detail;
      // Celebrate with warmth, not gamification
      presenceUI.bounce();
      soundUI.play('success');
      celebrationsUI.warmthGlow({ intensity: 'warm' });
      messageUI.show(milestone.title, 'success', 3000);
    }) as EventListener);
  });

  // 📍 Location Prompt - "Better than Human" location awareness
  // Listen for contextual location requests (e.g., when weather is mentioned)
  safeInit('LocationPrompt', () => {
    addTrackedListener(window, 'ferni:request-location', ((e: Event) => {
      const customEvent = e as CustomEvent;
      const { context } = customEvent.detail || {};
      log.debug({ context }, '📍 Location request received');

      (async () => {
        try {
          const { requestLocationWithWarmPrompt } = await import('../ui/location-prompt.ui.js');
          const result = await requestLocationWithWarmPrompt(context || 'personalization');

          if (result.success && result.location?.city) {
            log.info({ city: result.location.city }, '📍 Location obtained');
            // Optionally notify the app that location is now available
            window.dispatchEvent(
              new CustomEvent('ferni:location-updated', {
                detail: { location: result.location },
              })
            );
          }
        } catch (err) {
          log.debug('📍 Location prompt dismissed or failed:', err);
        }
      })();
    }) as EventListener);
  });

  // 🔊 Voice Enrollment UI - Learn user's voice
  safeInit('VoiceEnrollmentUI', () => initVoiceEnrollmentUI());

  // 🎤 Voice ID Badge - Show enrollment status on avatar
  safeInit('VoiceIdBadge', () => initVoiceIdBadge());

  // 👥 Speaker Change Indicator - Gentle verification when voice changes
  safeInit('SpeakerChangeIndicator', () => initSpeakerChangeIndicator());

  // 🏠 Household Manager - Multi-user voice household management
  safeInit('HouseholdManager', () => initHouseholdManager());

  // 💭 Conversation Memory - Browse past conversations and memories

  // 🌈 Wellbeing Dashboard - "State of Me" visualization
  safeInit('WellbeingDashboard', () => initWellbeingDashboard());

  // 📊 Life Context Dashboard - Cross-domain synthesis (Phase 6)
  safeInit('LifeContextDashboard', () => initLifeContextDashboard());

  // 🏥 Service Health - Show degradation status to users
  safeInit('ServiceHealthUI', () => initServiceHealthUI());
}
