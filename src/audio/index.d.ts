/**
 * Audio Module
 *
 * Handles all audio-related functionality including:
 * - Background music playback into calls via LiveKit BackgroundAudioPlayer
 * - Audio ducking when agent speaks
 * - Volume control
 * - Spotify preview streaming
 * - Ambient/thinking music for silences
 *
 * NEW ARCHITECTURE (2024):
 * - DJController: Single source of truth for all music/DJ state
 * - DJDecisionEngine: Pure functions for decision making
 * - DJSpeechEngine: Phrase generation
 * - DJTimingEngine: Centralized timer management
 */
export { DJController, getDJController, resetDJController, isDJControllerInitialized, type DJState, type DJCommand, type DJEvent, type DJControllerState, type DJControllerConfig, type DuckReason, } from './dj-controller.js';
export { shouldDuck, shouldSpeakIntro, shouldSpeakOutro, shouldInterject, shouldInterruptMusic, shouldSkipThinkingMusic, isDeadAirDetectionActive, calculateScheduledMoments, getDuckTiming, getPersonaStyle, DJ_PROBABILITIES, DJ_TIMING, PERSONA_DJ_STYLES, type DuckDecision, type IntroDecision, type OutroDecision, type InterjectionDecision, type ScheduledMoment, type DecisionContext, type PersonaDJStyle, } from './dj-decision-engine.js';
export { getOutroPhrase, getTransitionPhrase, getDropPhrase, getMomentPhrase, getCheckInPhrase, getMusicStoppedPhrase, generateLLMInterjection, prewarmInterjectionCache, clearInterjectionCache, getInterjection, type TrackSpeechContext, type InterjectionMoment, } from './dj-speech-engine.js';
export { shouldInterruptMusic as shouldInterruptMusicLegacy } from './music-humanization.js';
export { DJTimingEngine, getDJTimingEngine, resetDJTimingEngine, type ScheduledTimer, type TimingEvent, type TimingEngineConfig, } from './dj-timing-engine.js';
export { CallMusicPlayer, getMusicPlayer, initializeMusicPlayer, isMusicAvailable, resetMusicPlayer, type MusicPlayerEvents, type MusicPlayerState, type MusicState, type MusicTrack, type OnMidSongMomentCallback, type OnMusicStateChangeCallback, type OnTrackEndedCallback, type SessionMusicEntry, type TypedMusicPlayerEmitter, } from './music-player.js';
export { getAmbientMusicEndedPhrase, getAmbientTracks, getDJDropPhrase, getDJOutroPhrase, getDJTrackChangePhrase, getMidSongMomentPhrase, getMoodAwareMusicOffer, getMusicStoppedPhrase as getLegacyMusicStoppedPhrase, // Legacy, use dj-speech-engine instead
getRandomAmbientTrack, getSessionCallbackPhrase, isAmbientMusicEnabled, playAmbientMusic, stopAmbientMusic, } from './ambient-music.js';
export { VERBAL_SOUNDS, getSessionSounds, getVerbalSound, playSessionSound, resetSessionSounds, type SessionSoundType, } from './session-sounds.js';
export { getSoundEffectsPlayer, initializeSoundEffectsPlayer, resetSoundEffectsPlayer, } from './sound-effects-player.js';
export { MusicHumanizationController, analyzeVibingBehavior, buildTrackContext, checkSpontaneousMusicMoment, clearLLMInterjectionCache, getConversationBridge, getEmotionalMirrorOffer, getFunInterjection, getFunInterjectionAsync, getMusicConversationStarter, getMusicDiscoveryQuestion, getMusicHumanization, getPersonaFunMoment, getPostMusicCheckIn, getTimeAwareMusicSuggestion, getTimeOfDay, prewarmMusicInterjection, resetMusicHumanization, type MusicHumanizationConfig, type MusicHumanizationState, type MusicMoment, type SpontaneousTrigger, type TimeOfDay, type TrackContext, } from './music-humanization.js';
export { clearMusicContext, detectMidThought, endMusicContext, getMusicContext, inferMusicStartReason, startMusicContext, type MusicContextInput, type MusicSessionContext, type MusicStartReason, } from './music-session-context.js';
export { getIntelligentMusicTransition, getMusicTransition, logTransitionDecision, recordTransitionFeedback, getTransitionAnalyticsDashboard, type EnhancedTransitionResult, type TransitionInput, type TransitionResult, type TransitionType, } from './intelligent-music-transitions.js';
export { getTransitionAnalytics, resetTransitionAnalytics, generateEventId, createTransitionEvent, recordTransitionWithAnalytics, recordEngagementSignals, getBestTransitionType, type TransitionEvent, type EngagementSignals, type TransitionStats, type ABTestConfig, type TransitionOverrides, } from './music-transition-analytics.js';
export { getUserProfile, selectTransitionWithLearning, updateUserLearning, addMusicMemory, findRelevantMusicMemories, getUserPreferredTransition, exportUserProfile, importUserProfile, clearAllProfiles, getUserLearningStats, type UserTransitionProfile, type ThompsonArmState, type MusicMemoryEntry, type EngagementFeedback, } from './music-user-learning.js';
export { storeMusicHelpedMemory, findRelevantMemories, getMusicPreferences, generateMusicCallback, shouldMentionMusicMemory, exportUserMusicMemories, importUserMusicMemories, clearAllMusicMemories, getUserMusicMemoryStats, detectEmotionalContext, detectMusicHelped, type MusicHelpedMemory, type MusicPreference, type MusicCallbackPhrase, } from './music-memory-integration.js';
export { registerMusicFeedbackRecorder, markMusicEnded, recordMusicFeedback, hasPendingMusicFeedback, clearMusicFeedbackRecorder, detectFeedbackFromResponse, type MusicFeedback, type MusicFeedbackRecorder, } from './music-feedback-manager.js';
export { ensureProfileLoaded, ensureMemoriesLoaded, ensureMusicLearningLoaded, isMusicLearningLoaded, saveProfile, saveMemories, saveMusicLearning, flushMusicLearning, flushAllMusicLearning, clearUserCache, shutdownMusicLearningPersistence, getMusicLearningStats, onTransitionFeedbackRecorded, onMusicMemoryStored, } from './music-learning-persistence.js';
export { extractMusicPreferences, hasMusicContext, type ExtractedMusicPreference, } from './music-preference-extractor.js';
//# sourceMappingURL=index.d.ts.map