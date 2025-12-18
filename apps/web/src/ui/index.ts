/**
 * UI Components - Central Export
 *
 * A comprehensive UI system that rivals Apple and Google.
 */

// Core UI Components
export {
  coachUI,
  flashAvatar,
  initCoachUI,
  setDimmed,
  setVisualizationVolume,
  updateAudioState,
  updateConnectionState,
  updatePersonaDisplay,
} from './coach.ui.js';
export {
  controlsUI,
  dispose as disposeControlsUI,
  initControlsUI,
  setConnecting,
} from './controls.ui.js';
export {
  clearMessage,
  dispose as disposeMessageUI,
  initMessageUI,
  messageUI,
  setHelperText,
  showMessage,
} from './message.ui.js';
export { hideSpotifyStatus, initSpotifyUI, showSpotifyStatus, spotifyUI } from './spotify.ui.js';
export {
  dispose as disposeTeamUI,
  initTeamUI,
  setActiveTeamMember,
  setRosterVisible,
  teamUI,
} from './team.ui.js';
export {
  dispose as disposeWaveformUI,
  initWaveformUI,
  setVolume as setWaveformVolume,
  start as startWaveform,
  stop as stopWaveform,
  waveformUI,
} from './waveform.ui.js';

// Avatar-Based Feedback (No Text Toasts)
export { avatarFeedback, initAvatarFeedback } from './avatar-feedback.ui.js';

// 🎬 Avatar Lamp - Pixar Luxo Jr. level body language animation
export {
  bounce as avatarBounce,
  express as avatarExpress,
  avatarLamp,
  nod as avatarNod,
  perkUp as avatarPerkUp,
  shake as avatarShake,
  shrink as avatarShrink,
  tilt as avatarTilt,
  initAvatarLamp,
} from './avatar-lamp.ui.js';
export type { LampEmotion } from './avatar-lamp.ui.js';

// Enhanced UI Features
export { connectionQualityUI, initConnectionQualityUI } from './connection-quality.ui.js';
export { initKeyboardUI, keyboardUI, setConnected as setKeyboardConnected } from './keyboard.ui.js';
export { initThinkingUI, thinkingUI } from './thinking.ui.js';
export { initTranscriptUI, transcriptUI } from './transcript.ui.js';

// World-class Toast System
export {
  dismissAllToasts,
  dismissToast,
  getToastManager,
  showToast,
  toast,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
} from './toast.ui.js';
export type { ToastConfig, ToastType } from './toast.ui.js';

// Premium Experience
export { agentParticlesUI, initAgentParticles } from './agent-particles.ui.js';
export { celebrationsUI, initCelebrationsUI } from './celebrations.ui.js';
export { easterEggsUI, initEasterEggsUI } from './easter-eggs.ui.js';
export { gesturesUI, initGesturesUI } from './gestures.ui.js';
export { initPresenceUI, presenceUI } from './presence.ui.js';
export { initRippleUI, rippleUI } from './ripple.ui.js';
export { initSoundUI, soundUI } from './sound.ui.js';
export { initStatsUI, statsUI } from './stats.ui.js';

// 📱 Mobile Delights - Magical mobile interactions
export {
  disposeMobileDelights,
  hapticError,
  hapticNotify,
  hapticSuccess,
  initMobileDelights,
  mobileDelights,
  requestTiltPermission,
  setImmersiveMode,
  vibrate,
} from './mobile-delights.ui.js';

// 🎬 Animation Orchestrator - Pixar-quality coordinated animations
export {
  animatePersonaTransition,
  animationOrchestrator,
  initAnimationOrchestrator,
  playCharacterReaction,
  runPageLoadSequence,
} from './animation-orchestrator.ui.js';

// ✨ Micro-Interactions - Pixar-quality button & interactive effects
export { initMicroInteractions, microInteractionsUI } from './micro-interactions.ui.js';

// 🔤 Kinetic Typography - Pixar-quality text animations
export {
  animateNameHandoff,
  initKineticTypography,
  kineticTypographyUI,
  revealText,
  scrambleReveal,
  typewriterEffect,
} from './kinetic-typography.ui.js';

// 🌌 Ambient Effects - Pixar-quality visual atmosphere
export {
  ambientEffectsUI,
  initAmbientEffects,
  startAurora,
  startParticles,
  stopAurora,
  stopParticles,
} from './ambient-effects.ui.js';

// ⏳ Loading States - Pixar-quality loading experiences
export {
  createDustParticles,
  initLoadingStates,
  loadingStatesUI,
  playLuxoBounce,
  startWarmthPulse,
  stopWarmthPulse,
} from './loading-states.ui.js';

// 🔧 Admin Dashboard
export { initAdminDashboard, injectAdminStyles } from './admin.ui.js';

// Daily Engagement UI
export { EngagementUI, getEngagementUI, initializeEngagementUI } from './engagement.ui.js';
export type {
  EmotionalWeatherData,
  EngagementData,
  EngagementStats,
  RitualStreakData,
} from './engagement.ui.js';

// Predictions UI
export { PredictionsUI, getPredictionsUI, initializePredictionsUI } from './predictions.ui.js';
export type { PredictionsUIData } from './predictions.ui.js';

// Predictive Insights UI (proactive predictions)
export {
  dismissPredictiveInsight,
  getPredictiveInsightsUI,
  initPredictiveInsights,
  showInsightFromAPI,
  showPredictiveInsight,
} from './predictive-insights.ui.js';
export type { InsightCard, InsightType } from './predictive-insights.ui.js';

// Engagement Trigger Buttons
export { engagementTriggerUI, initEngagementTriggerUI } from './engagement-trigger.ui.js';
export type { EngagementBadgeState, EngagementTriggerCallbacks } from './engagement-trigger.ui.js';

// Notifications UI
export {
  getNotificationsUI,
  initNotificationsUI,
  showPredictionReady,
  showRitualReminder,
  showStreakMilestone,
  showTeamHuddle,
} from './notifications.ui.js';
export type { Notification, NotificationUICallbacks } from './notifications.ui.js';

// Streak Celebrations
export {
  celebrateStreak,
  getStreakCelebrationsUI,
  isStreakMilestone,
} from './streak-celebrations.ui.js';
export type { StreakCelebration } from './streak-celebrations.ui.js';

// Team Huddles UI
export {
  getTeamHuddleUI,
  hideTeamHuddle,
  initTeamHuddleUI,
  showTeamHuddle as showTeamHuddlePanel,
} from './team-huddle.ui.js';
export type {
  TeamHuddleData,
  TeamHuddleParticipant,
  TeamHuddleUICallbacks,
} from './team-huddle.ui.js';

// Conversation History UI
export {
  getConversationHistoryUI,
  hideConversationHistory,
  initConversationHistoryUI,
  showConversationHistory,
} from './conversation-history.ui.js';
export type {
  ConversationHistoryData,
  ConversationHistoryUICallbacks,
  ConversationSession,
} from './conversation-history.ui.js';

// Analytics Dashboard UI
export {
  getAnalyticsDashboardUI,
  hideAnalyticsDashboard,
  initAnalyticsDashboardUI,
  showAnalyticsDashboard,
} from './analytics-dashboard.ui.js';
export type {
  AnalyticsDashboardData,
  AnalyticsDashboardUICallbacks,
  MoodTrend,
  PredictionAccuracyTrend,
  StreakTrend,
} from './analytics-dashboard.ui.js';

// Onboarding UI
export {
  getOnboardingUI,
  initOnboardingUI,
  startOnboarding,
  startOnboardingIfNeeded,
} from './onboarding.ui.js';
export type { OnboardingStep, OnboardingUICallbacks } from './onboarding.ui.js';

// Persona Transition UI
export {
  getPersonaTransitionUI,
  initPersonaTransitionUI,
  transitionPersona,
} from './persona-transition.ui.js';
export type {
  PersonaTransitionData,
  PersonaTransitionUICallbacks,
} from './persona-transition.ui.js';

// Cognitive Insights UI
export {
  getCognitiveInsightsUI,
  hideCognitiveInsights,
  initCognitiveInsightsUI,
  showCognitiveInsights,
} from './cognitive-insights.ui.js';
export type {
  CognitiveInsightsData,
  CognitiveInsightsUICallbacks,
  CognitiveMemory,
  LearningPattern,
} from './cognitive-insights.ui.js';

// Custom Ritual Builder UI
export { getRitualBuilderUI, initRitualBuilderUI, showRitualBuilder } from './ritual-builder.ui.js';
export type { CustomRitual, RitualBuilderUICallbacks } from './ritual-builder.ui.js';

// User Data Export UI
export { getDataExportUI, initDataExportUI, showDataExport } from './data-export.ui.js';
export type { DataExportUICallbacks, ExportableData } from './data-export.ui.js';

// Prediction Accuracy Tracker UI
export {
  getPredictionTrackerUI,
  initPredictionTrackerUI,
  showPredictionTracker,
} from './prediction-tracker.ui.js';
export type {
  CategoryAccuracy,
  PredictionTrackerData,
  PredictionTrackerUICallbacks,
} from './prediction-tracker.ui.js';

// Settings Menu UI
export {
  getSettingsMenuUI,
  hideSettingsMenu,
  initSettingsMenuUI,
  showSettingsMenu,
} from './settings-menu.ui.js';
export type { SettingsMenuItem, SettingsMenuUICallbacks } from './settings-menu.ui.js';

// Relationship Progress UI
export {
  hideProgressPanel as hideRelationshipProgress,
  initRelationshipProgressUI,
  relationshipProgressUI,
  showProgressPanel as showRelationshipProgress,
  toggleProgressPanel as toggleRelationshipProgress,
} from './relationship-progress.ui.js';

// Trust Journey UI - "Better Than Human" relationship visualization
export {
  hideTrustJourney,
  initTrustJourneyUI,
  showTrustJourney,
  toggleTrustJourney,
  trustJourneyUI,
} from './trust-journey.ui.js';

// Outreach Preferences UI - User controls for proactive check-ins
export {
  hideOutreachPreferences,
  initOutreachPreferencesUI,
  outreachPreferencesUI,
  setOutreachPreferencesCallbacks,
  showOutreachPreferences,
} from './outreach-preferences.ui.js';
export type {
  OutreachPreferences,
  OutreachPreferencesCallbacks,
} from './outreach-preferences.ui.js';

// Outreach Schedule UI - View upcoming and past check-ins
export {
  closeOutreachSchedule,
  initializeOutreachScheduleUI,
  openOutreachSchedule,
  outreachSchedule,
} from './outreach-schedule.ui.js';

// Next Check-in Widget - Embeddable widget showing next scheduled outreach
export {
  mountNextCheckinWidget,
  nextCheckinWidget,
  refreshNextCheckin,
  unmountNextCheckinWidget,
} from './next-checkin.ui.js';

// Trust Analytics Dashboard - Admin monitoring view
export {
  hideTrustAnalytics,
  initTrustAnalyticsUI,
  setTrustAnalyticsCallbacks,
  showTrustAnalytics,
  trustAnalyticsUI,
} from './trust-analytics.ui.js';
export type {
  ABTestResult,
  SystemHealth,
  TrustAnalyticsCallbacks,
  TrustAnalyticsData,
  TrustMetrics,
} from './trust-analytics.ui.js';

// Trust Dashboard - Consolidated trust features UI (Phases 12-29)
export {
  hideTrustDashboard,
  initTrustDashboardUI,
  showTrustDashboard,
} from './trust-dashboard.ui.js';

// Notification Settings UI
export {
  getNotificationSettingsUI,
  hideNotificationSettings,
  initNotificationSettingsUI,
  showNotificationSettings,
} from './notification-settings.ui.js';
export type { NotificationSettingsUICallbacks } from './notification-settings.ui.js';

// Voice Enrollment UI - Learn user's voice
export {
  hideVoiceEnrollmentModal,
  initVoiceEnrollmentUI,
  isEnrolled as isVoiceEnrolled,
  showVoiceEnrollmentModal,
  voiceEnrollment,
} from './voice-enrollment.ui.js';
export type { VoiceEnrollmentOptions } from './voice-enrollment.ui.js';

// Service Health UI - Show service degradation status
export {
  cleanupServiceHealthUI,
  getServiceHealthStatus,
  hasServiceIssues,
  initServiceHealthUI,
  refreshServiceHealth,
} from './service-health.ui.js';

// Voice ID Badge
export {
  hideVerifying as hideVoiceIdVerifying,
  initVoiceIdBadge,
  showVerifying as showVoiceIdVerifying,
  updateBadgeStatus as updateVoiceIdBadge,
} from './voice-id-badge.ui.js';

// Speaker Change Indicator - Gentle verification when voice changes
export {
  getSpeakerIndicatorState,
  hideSpeakerChangeIndicator,
  initSpeakerChangeIndicator,
  showSpeakerChangePrompt,
  speakerChangeIndicator,
} from './speaker-change-indicator.ui.js';
export type { SpeakerChangeEvent } from './speaker-change-indicator.ui.js';

// Household Manager - Multi-user voice household management
export {
  hideHouseholdManager,
  householdManager,
  initHouseholdManager,
  showHouseholdManager,
} from './household-manager.ui.js';
export type {
  Household,
  HouseholdManagerCallbacks,
  HouseholdMember,
} from './household-manager.ui.js';

// Conversation Memory Browser - Browse past conversations and memories
export {
  conversationMemory,
  getSelectedConversation,
  hideConversationMemory,
  initConversationMemory,
  showConversationMemory,
} from './conversation-memory.ui.js';
export type {
  Conversation,
  ConversationMemoryCallbacks,
  ConversationMemory as ConversationMemoryData,
} from './conversation-memory.ui.js';

// Integrations Settings UI - Better-than-Human connections
export {
  getIntegrationsSettingsUI,
  hideIntegrationsSettings,
  initIntegrationsSettingsUI,
  showIntegrationsSettings,
} from './integrations-settings.ui.js';
export type {
  IntegrationCapabilities,
  IntegrationStatus,
  IntegrationsUICallbacks,
} from './integrations-settings.ui.js';

// ============================================================================
// PROGRESSIVE RELATIONSHIP FEATURES (Quick Wins Implementation)
// ============================================================================

// Stage Celebration Modal - Full celebration with confetti on relationship stage-up
export {
  initStageCelebration,
  showStageCelebration,
  hideStageCelebration,
  stageCelebration,
} from './stage-celebration.ui.js';

// Trust Signal Cards - "Ferni noticed..." moments from trust systems
export {
  initTrustSignals,
  showTrustSignal,
  dismissSignal as dismissTrustSignal,
  dismissAllSignals as dismissAllTrustSignals,
  trustSignalHelpers,
  trustSignalsUI,
} from './trust-signals.ui.js';
export type { TrustSignal, TrustSignalType } from './trust-signals.ui.js';

// Persona Introduction Flows - 3-screen intro when team members unlock
export {
  initPersonaIntro,
  showPersonaIntro,
  hidePersonaIntro,
  personaIntro,
} from './persona-intro.ui.js';

// Feature Discovery Hints - Contextual hints for newly unlocked features
export {
  initFeatureHints,
  registerHint,
  showHint,
  dismissHint,
  dismissAllHints,
  featureHints,
  FEATURE_HINTS,
} from './feature-hints.ui.js';
export type { FeatureHint, HintType } from './feature-hints.ui.js';

// Relationship Progress Indicator - Always visible progress to next stage
export {
  initProgressIndicator,
  showIndicator,
  hideIndicator,
  toggleProgressIndicator,
  expandProgressIndicator,
  progressIndicator,
} from './progress-indicator.ui.js';

// Types
export type { ConnectionQuality } from './connection-quality.ui.js';
export type { ControlCallbacks } from './controls.ui.js';
