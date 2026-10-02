/**
 * Voice Agent Module Index
 *
 * Re-exports voice agent components for cleaner imports.
 */

// Types
export type * from './types.js';

// Cleanup handler
export { handleSessionCleanup, type CleanupContext } from './cleanup-handler.js';

// Greeting handler
export {
  generateAndSpeakGreeting,
  type GreetingContext,
  type GreetingResult,
} from './greeting-handler.js';

// Data channel handler
export {
  setupDataChannelHandler,
  type DataChannelContext,
  type DataChannelResult,
} from './data-channel-handler.js';

// Music handler
export {
  setupMusicHandler,
  type MusicHandlerContext,
  type MusicHandlerResult,
} from './music-handler.js';

// Transcript handler
export {
  createTranscriptHandler,
  type TranscriptHandlerContext,
  type TranscriptHandlerResult,
  type TranscriptEvent,
} from './transcript-handler.js';

// Tool routing handled by UTO semantic selection + LLM native function calling
// See: src/tools/orchestrator/tool-orchestrator.ts

// Session state handler (AgentStateChanged, UserStateChanged)
export {
  setupSessionStateHandlers,
  type SessionStateContext,
  type SessionStateResult,
} from './session-state-handler.js';

// User identification handler
export {
  identifyUser,
  type UserIdentificationContext,
  type UserIdentificationResult,
} from './user-identification-handler.js';

// Tool tracking handler
export {
  setupToolTrackingHandler,
  type ToolTrackingContext,
  type ToolTrackingResult,
} from './tool-tracking-handler.js';

// Trust recording handler
export {
  recordTrustSystemsData,
  type TrustRecordingContext,
  type TurnResult,
} from './trust-recording-handler.js';

// Slash command handler
export {
  handleSlashCommand,
  type SlashCommandContext,
  type SlashCommandResult,
} from './slash-command-handler.js';

// Celebration events handler
export {
  sendCelebrationEvents,
  type CelebrationContext,
  type CelebrationConfig,
} from './celebration-events-handler.js';

// Turn handler (main orchestrator)
export {
  handleUserTurn,
  cleanupPersonalityState,
  type TurnHandlerContext,
} from './turn-handler.js';

// Turn personality (extracted from turn-handler)
export {
  processPersonality,
  processFerniPersonality,
  processSharedPersonality,
  getPreviousExpression,
  storePreviousExpression,
  recordTurnHistory,
  getTurnHistory,
  mapMoodToMomentum,
  mapIntentToSharing,
  buildPersonalityInjection,
  type PersonalityContext,
  type PersonalityProcessingResult,
} from './turn-personality.js';

// Turn events (extracted from turn-handler)
export {
  dispatchAllTurnEvents,
  dispatchTurnEmotionEvents,
  dispatchTurnBehaviorEvents,
  sendMoodUpdate,
  buildBehaviorContext,
  type EventDispatchContext,
  type EventDispatchResult,
} from './turn-events.js';

// Turn learning (extracted from turn-handler)
export {
  recordAllLearningData,
  recordTurnTrustData,
  recordCollectiveLearning,
  type LearningContext,
  type LearningResult,
} from './turn-learning.js';

// Human turn intelligence
export {
  getAverageSpeechRate,
  updateSessionState as updateTurnSessionState,
  clearSessionState as clearTurnSessionState,
} from './human-turn-intelligence.js';

// Audio processor (extracted from sttNode)
export {
  processAudioStream,
  type AudioProcessorContext,
  type VoiceEmotionResult,
} from './audio-processor.js';

// Voice humanization init handler
export {
  setupVoiceHumanizationInit,
  type VoiceHumanizationInitContext,
  type VoiceHumanizationInitResult,
} from './voice-humanization-init-handler.js';

// Session init handler
export {
  initializeSession,
  type SessionInitContext,
  type SessionInitResult,
  type UserDataInit,
} from './session-init-handler.js';

// Daily check-in handler (emotional weather extraction)
export {
  detectDailyCheckIn,
  extractEmotionalWeather,
  extractEmotionalWeatherWithLLM,
  recordDailyCheckIn,
  processDailyCheckIn,
  getStreakCelebration,
  cleanupStaleCheckIns,
  resetActiveCheckIns,
  type EmotionalWeather,
  type DailyCheckInContext,
  type CheckInDetectionResult,
} from './daily-checkin-handler.js';

// Active listening handler (Better Than Human real-time entity extraction)
export {
  processActiveListeningPartial,
  processActiveListeningFinal,
  type ActiveListeningContext,
  type ActiveListeningResult,
} from './active-listening-handler.js';

// Anticipation handler (Sesame-inspired + unified anticipation pipeline)
export {
  processSesameAnticipation,
  signalNewTurn,
  processUnifiedAnticipation,
  processAnticipatoryTriggers,
  recordAnticipatoryOutcomeFromTranscript,
  type AnticipationContext,
  type AnticipationResult,
  type AnticipatoryTriggerContext,
} from './anticipation-handler.js';

// Interrupt handler (micro-interruptions + graceful interrupt sensing)
export {
  processInterruptSignals,
  hasMicroInterruptSignal,
  type InterruptContext,
  type InterruptResult,
} from './interrupt-handler.js';

// Constants
export const VOICE_AGENT_VERSION = '1.0.0';

// Pure helpers (kept in a leaf module so they can be imported without
// loading every handler above)
export {
  hasSsmlTags,
  isRealUserName,
  parsePersonaFromMetadata,
  parseUserFromMetadata,
} from './helpers.js';
