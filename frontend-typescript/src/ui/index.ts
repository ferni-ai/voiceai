/**
 * UI Components - Central Export
 * 
 * A comprehensive UI system that rivals Apple and Google.
 */

// Core UI Components
export { coachUI, initCoachUI, updatePersonaDisplay, updateConnectionState, updateAudioState, setVisualizationVolume, flashAvatar, setDimmed } from './coach.ui.js';
export { teamUI, initTeamUI, setActiveTeamMember, setRosterVisible, dispose as disposeTeamUI } from './team.ui.js';
export { messageUI, initMessageUI, showMessage, clearMessage, setHelperText, dispose as disposeMessageUI } from './message.ui.js';
export { waveformUI, initWaveformUI, start as startWaveform, stop as stopWaveform, setVolume as setWaveformVolume, dispose as disposeWaveformUI } from './waveform.ui.js';
export { controlsUI, initControlsUI, setConnecting, dispose as disposeControlsUI } from './controls.ui.js';
export { spotifyUI, initSpotifyUI, showSpotifyStatus, hideSpotifyStatus } from './spotify.ui.js';

// Avatar-Based Feedback (No Text Toasts)
export { avatarFeedback, initAvatarFeedback } from './avatar-feedback.ui.js';

// 👁️ Ferni Eye - Pixar-inspired peek-through personality
export { 
  ferniEye, 
  initFerniEye, 
  triggerPeek as eyePeek,
  triggerBlink as eyeBlink,
  triggerWink as eyeWink,
  triggerCurious as eyeCurious,
} from './ferni-eye.ui.js';

// Enhanced UI Features
export { keyboardUI, initKeyboardUI, setConnected as setKeyboardConnected } from './keyboard.ui.js';
export { transcriptUI, initTranscriptUI } from './transcript.ui.js';
export { thinkingUI, initThinkingUI } from './thinking.ui.js';
export { connectionQualityUI, initConnectionQualityUI } from './connection-quality.ui.js';

// World-class Toast System (Sonner-inspired)
export {
  toastUI,
  toast,
  toastSuccess,
  toastError,
  toastWarning,
  toastInfo,
  toastLoading,
  dismiss as dismissToast,
  dismissAll as dismissAllToasts,
  update as updateToast,
  promise as toastPromise,
} from './toast.ui.js';
export type { ToastType, ToastOptions } from './toast.ui.js';

// Premium Experience
export { soundUI, initSoundUI } from './sound.ui.js';
export { gesturesUI, initGesturesUI } from './gestures.ui.js';
export { celebrationsUI, initCelebrationsUI } from './celebrations.ui.js';
export { statsUI, initStatsUI } from './stats.ui.js';
export { presenceUI, initPresenceUI } from './presence.ui.js';
export { rippleUI, initRippleUI } from './ripple.ui.js';
export { easterEggsUI, initEasterEggsUI } from './easter-eggs.ui.js';
export { agentParticlesUI, initAgentParticles } from './agent-particles.ui.js';

// 🎬 Animation Orchestrator - Pixar-quality coordinated animations
export { 
  animationOrchestrator, 
  initAnimationOrchestrator,
  runPageLoadSequence,
  animatePersonaTransition,
  playPixarReaction,
} from './animation-orchestrator.ui.js';

// ✨ Micro-Interactions - Pixar-quality button & interactive effects
export {
  microInteractionsUI,
  initMicroInteractions,
} from './micro-interactions.ui.js';

// 🔤 Kinetic Typography - Pixar-quality text animations
export {
  kineticTypographyUI,
  initKineticTypography,
  revealText,
  typewriterEffect,
  scrambleReveal,
  animateNameHandoff,
} from './kinetic-typography.ui.js';

// 🌌 Ambient Effects - Pixar-quality visual atmosphere
export {
  ambientEffectsUI,
  initAmbientEffects,
  startAurora,
  stopAurora,
  startParticles,
  stopParticles,
} from './ambient-effects.ui.js';

// ⏳ Loading States - Pixar-quality loading experiences
export {
  loadingStatesUI,
  initLoadingStates,
  startWarmthPulse,
  stopWarmthPulse,
  playLuxoBounce,
  createDustParticles,
} from './loading-states.ui.js';

// 🔧 Admin Dashboard
export {
  initAdminDashboard,
  injectAdminStyles,
} from './admin.ui.js';

// Daily Engagement UI
export {
  EngagementUI,
  getEngagementUI,
  initializeEngagementUI,
} from './engagement.ui.js';
export type {
  RitualStreakData,
  EmotionalWeatherData,
  EngagementStats,
  EngagementData,
} from './engagement.ui.js';

// Predictions UI
export {
  PredictionsUI,
  getPredictionsUI,
  initializePredictionsUI,
} from './predictions.ui.js';
export type { PredictionsUIData } from './predictions.ui.js';

// Engagement Trigger Buttons
export {
  engagementTriggerUI,
  initEngagementTriggerUI,
} from './engagement-trigger.ui.js';
export type { EngagementTriggerCallbacks, EngagementBadgeState } from './engagement-trigger.ui.js';

// Notifications UI
export {
  getNotificationsUI,
  initNotificationsUI,
  showRitualReminder,
  showStreakMilestone,
  showPredictionReady,
  showTeamHuddle,
} from './notifications.ui.js';
export type { Notification, NotificationUICallbacks } from './notifications.ui.js';

// Streak Celebrations
export {
  getStreakCelebrationsUI,
  celebrateStreak,
  isStreakMilestone,
} from './streak-celebrations.ui.js';
export type { StreakCelebration } from './streak-celebrations.ui.js';

// Team Huddles UI
export {
  getTeamHuddleUI,
  initTeamHuddleUI,
  showTeamHuddle as showTeamHuddlePanel,
  hideTeamHuddle,
} from './team-huddle.ui.js';
export type { TeamHuddleData, TeamHuddleParticipant, TeamHuddleUICallbacks } from './team-huddle.ui.js';

// Conversation History UI
export {
  getConversationHistoryUI,
  initConversationHistoryUI,
  showConversationHistory,
  hideConversationHistory,
} from './conversation-history.ui.js';
export type { ConversationSession, ConversationHistoryData, ConversationHistoryUICallbacks } from './conversation-history.ui.js';

// Analytics Dashboard UI
export {
  getAnalyticsDashboardUI,
  initAnalyticsDashboardUI,
  showAnalyticsDashboard,
  hideAnalyticsDashboard,
} from './analytics-dashboard.ui.js';
export type { AnalyticsDashboardData, StreakTrend, MoodTrend, PredictionAccuracyTrend, AnalyticsDashboardUICallbacks } from './analytics-dashboard.ui.js';

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
export type { PersonaTransitionData, PersonaTransitionUICallbacks } from './persona-transition.ui.js';

// Cognitive Insights UI
export {
  getCognitiveInsightsUI,
  initCognitiveInsightsUI,
  showCognitiveInsights,
  hideCognitiveInsights,
} from './cognitive-insights.ui.js';
export type { CognitiveMemory, LearningPattern, CognitiveInsightsData, CognitiveInsightsUICallbacks } from './cognitive-insights.ui.js';

// Custom Ritual Builder UI
export {
  getRitualBuilderUI,
  initRitualBuilderUI,
  showRitualBuilder,
} from './ritual-builder.ui.js';
export type { CustomRitual, RitualBuilderUICallbacks } from './ritual-builder.ui.js';

// User Data Export UI
export {
  getDataExportUI,
  initDataExportUI,
  showDataExport,
} from './data-export.ui.js';
export type { ExportableData, DataExportUICallbacks } from './data-export.ui.js';

// Prediction Accuracy Tracker UI
export {
  getPredictionTrackerUI,
  initPredictionTrackerUI,
  showPredictionTracker,
} from './prediction-tracker.ui.js';
export type { PredictionTrackerData, CategoryAccuracy, PredictionTrackerUICallbacks } from './prediction-tracker.ui.js';

// Settings Menu UI
export {
  getSettingsMenuUI,
  initSettingsMenuUI,
  showSettingsMenu,
  hideSettingsMenu,
} from './settings-menu.ui.js';
export type { SettingsMenuItem, SettingsMenuUICallbacks } from './settings-menu.ui.js';

// Relationship Progress UI
export {
  relationshipProgressUI,
  initRelationshipProgressUI,
  showProgressPanel as showRelationshipProgress,
  hideProgressPanel as hideRelationshipProgress,
  toggleProgressPanel as toggleRelationshipProgress,
} from './relationship-progress.ui.js';

// Trust Journey UI - "Better Than Human" relationship visualization
export {
  trustJourneyUI,
  initTrustJourneyUI,
  showTrustJourney,
  hideTrustJourney,
  toggleTrustJourney,
} from './trust-journey.ui.js';

// Outreach Preferences UI - User controls for proactive check-ins
export {
  outreachPreferencesUI,
  initOutreachPreferencesUI,
  showOutreachPreferences,
  hideOutreachPreferences,
  setOutreachPreferencesCallbacks,
} from './outreach-preferences.ui.js';
export type { OutreachPreferences, OutreachPreferencesCallbacks } from './outreach-preferences.ui.js';

// Trust Analytics Dashboard - Admin monitoring view
export {
  trustAnalyticsUI,
  initTrustAnalyticsUI,
  showTrustAnalytics,
  hideTrustAnalytics,
  setTrustAnalyticsCallbacks,
} from './trust-analytics.ui.js';
export type { TrustMetrics, SystemHealth, ABTestResult, TrustAnalyticsData, TrustAnalyticsCallbacks } from './trust-analytics.ui.js';

// Trust Dashboard - Consolidated trust features UI (Phases 12-29)
export {
  initTrustDashboardUI,
  showTrustDashboard,
  hideTrustDashboard,
} from './trust-dashboard.ui.js';

// Notification Settings UI
export {
  getNotificationSettingsUI,
  initNotificationSettingsUI,
  showNotificationSettings,
  hideNotificationSettings,
} from './notification-settings.ui.js';
export type { NotificationSettingsUICallbacks } from './notification-settings.ui.js';

// Types
export type { ControlCallbacks } from './controls.ui.js';
export type { ConnectionQuality } from './connection-quality.ui.js';
