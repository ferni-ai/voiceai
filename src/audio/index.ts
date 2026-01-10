/**
 * Audio Module
 *
 * Handles all audio-related functionality including:
 * - Background music playback into calls via LiveKit BackgroundAudioPlayer
 * - Audio ducking when agent speaks
 * - Volume control
 * - Spotify preview streaming
 * - Ambient/thinking music for silences
 */

export {
  CallMusicPlayer,
  getMusicPlayer,
  initializeMusicPlayer,
  isMusicAvailable,
  resetMusicPlayer,
  type MusicPlayerEvents,
  type MusicPlayerState,
  type MusicState,
  type MusicTrack,
  type OnMidSongMomentCallback,
  type OnMusicStateChangeCallback,
  type OnTrackEndedCallback,
  type SessionMusicEntry,
  type TypedMusicPlayerEmitter,
} from './music-player.js';

// Ambient music for silences
export {
  getAmbientMusicEndedPhrase,
  getAmbientTracks,
  getDJDropPhrase,
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getMusicStoppedPhrase,
  getRandomAmbientTrack,
  getSessionCallbackPhrase,
  isAmbientMusicEnabled,
  playAmbientMusic,
  stopAmbientMusic,
} from './ambient-music.js';

// Session sounds (stingers, game sounds, etc.)
export {
  VERBAL_SOUNDS,
  getSessionSounds,
  getVerbalSound,
  playSessionSound,
  resetSessionSounds,
  type SessionSoundType,
} from './session-sounds.js';

// Sound Effects Player - Dedicated player for short sounds (separate from music)
// This ensures sound effects NEVER trigger "music ended" callbacks
export {
  getSoundEffectsPlayer,
  initializeSoundEffectsPlayer,
  resetSoundEffectsPlayer,
} from './sound-effects-player.js';

// DJ Booth - Full audio orchestration (ducking, timing, talk-over)
export {
  DJBooth,
  getDJBooth,
  initializeDJBooth,
  resetDJBooth,
  type DJBoothConfig,
  type DJBoothState,
} from './dj-booth.js';

// DJ Enhancements - Pixar-level magic (thinking music, emotion-reactive, session flow)
export {
  // Controllers
  DJEnhancementController,
  MusicMemoryManager,
  PERSONA_DJ_STYLES,
  SessionFlowManager,
  ThinkingMusicController,
  getCountdownPhrase,
  getDJEnhancements,
  getEmotionMusicOffer,
  // Phase 5: Emotion-reactive
  getEmotionMusicSuggestion,
  // Phase 6: Game music
  getGameMusicConfig,
  getGameMusicPhrase,
  // Phase 3: Persona DJ styles
  getPersonaDJStyle,
  getPersonaMusicIntro,
  // Singleton management
  initializeDJEnhancements,
  resetDJEnhancements,
  // Phase 2: Predictive timing
  scheduleTrackTimingCallbacks,
  type EmotionMusicMapping,
  type GameMusicConfig,
  type MusicPreferences,
  // Types
  type PersonaDJStyle,
  type SessionFlowState,
  type TrackTimingCallbacks,
} from './dj-enhancements.js';

// Music Humanization - Natural, fun, engaging music interactions
export {
  // Main controller
  MusicHumanizationController,
  // Engagement detection
  analyzeVibingBehavior,
  // Track context builder for contextual interjections
  buildTrackContext,
  // Spontaneous moments
  checkSpontaneousMusicMoment,
  // LLM interjection cache management
  clearLLMInterjectionCache,
  // Conversation bridges
  getConversationBridge,
  // Emotional mirror
  getEmotionalMirrorOffer,
  // Fun personality (sync + async versions)
  getFunInterjection,
  getFunInterjectionAsync,
  getMusicConversationStarter,
  // Music discovery
  getMusicDiscoveryQuestion,
  getMusicHumanization,
  getPersonaFunMoment,
  // Post-music check-ins
  getPostMusicCheckIn,
  getTimeAwareMusicSuggestion,
  // Time awareness
  getTimeOfDay,
  // LLM pre-warming
  prewarmMusicInterjection,
  resetMusicHumanization,
  shouldInterruptMusic,
  type MusicHumanizationConfig,
  // Types
  type MusicHumanizationState,
  type MusicMoment,
  type SpontaneousTrigger,
  type TimeOfDay,
  // Track context for contextual interjections
  type TrackContext,
} from './music-humanization.js';

// 🧠 Intelligent Music Transitions - Context-aware responses when music ends
// > "We believe in making AI human, and the decisions we make will reflect that."
export {
  // Context tracking (capture when music starts, use when music ends)
  clearMusicContext,
  detectMidThought,
  endMusicContext,
  getMusicContext,
  inferMusicStartReason,
  startMusicContext,
  type MusicContextInput,
  type MusicSessionContext,
  type MusicStartReason,
} from './music-session-context.js';

export {
  // Intelligent transition generation
  getIntelligentMusicTransition,
  getMusicTransition,
  logTransitionDecision,
  recordTransitionFeedback,
  getTransitionAnalyticsDashboard,
  type EnhancedTransitionResult,
  type TransitionInput,
  type TransitionResult,
  type TransitionType,
} from './intelligent-music-transitions.js';

// 📊 Music Transition Analytics - Track what works
export {
  getTransitionAnalytics,
  resetTransitionAnalytics,
  generateEventId,
  createTransitionEvent,
  recordTransitionWithAnalytics,
  recordEngagementSignals,
  getBestTransitionType,
  type TransitionEvent,
  type EngagementSignals,
  type TransitionStats,
  type ABTestConfig,
  type TransitionOverrides,
} from './music-transition-analytics.js';

// 🎯 Music User Learning - Per-user preferences with Thompson Sampling
export {
  getUserProfile,
  selectTransitionWithLearning,
  updateUserLearning,
  addMusicMemory,
  findRelevantMusicMemories,
  getUserPreferredTransition,
  exportUserProfile,
  importUserProfile,
  clearAllProfiles,
  getUserLearningStats,
  type UserTransitionProfile,
  type ThompsonArmState,
  type MusicMemoryEntry,
  type EngagementFeedback,
} from './music-user-learning.js';

// 🎵 Music Memory Integration - Remember what music helped
export {
  storeMusicHelpedMemory,
  findRelevantMemories,
  getMusicPreferences,
  generateMusicCallback,
  shouldMentionMusicMemory,
  exportUserMusicMemories,
  importUserMusicMemories,
  clearAllMusicMemories,
  getUserMusicMemoryStats,
  detectEmotionalContext,
  detectMusicHelped,
  type MusicHelpedMemory,
  type MusicPreference,
  type MusicCallbackPhrase,
} from './music-memory-integration.js';

// 📊 Music Feedback Manager - Global feedback recording for learning
export {
  registerMusicFeedbackRecorder,
  markMusicEnded,
  recordMusicFeedback,
  hasPendingMusicFeedback,
  clearMusicFeedbackRecorder,
  detectFeedbackFromResponse,
  type MusicFeedback,
  type MusicFeedbackRecorder,
} from './music-feedback-manager.js';

// 💾 Music Learning Persistence - Firestore backup for user profiles/memories
export {
  ensureProfileLoaded,
  ensureMemoriesLoaded,
  ensureMusicLearningLoaded,
  isMusicLearningLoaded,
  saveProfile,
  saveMemories,
  saveMusicLearning,
  flushMusicLearning,
  flushAllMusicLearning,
  clearUserCache,
  shutdownMusicLearningPersistence,
  getMusicLearningStats,
  onTransitionFeedbackRecorded,
  onMusicMemoryStored,
} from './music-learning-persistence.js';

// 🎵 Music Preference Extractor - Learn preferences from natural conversation
export {
  extractMusicPreferences,
  hasMusicContext,
  type ExtractedMusicPreference,
} from './music-preference-extractor.js';
