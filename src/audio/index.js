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
// =============================================================================
// DJ CONTROLLER - Single Source of Truth
// =============================================================================
export { DJController, getDJController, resetDJController, isDJControllerInitialized, } from './dj-controller.js';
// =============================================================================
// DJ DECISION ENGINE - Pure Functions for Decision Making
// =============================================================================
export { 
// Decision functions
shouldDuck, shouldSpeakIntro, shouldSpeakOutro, shouldInterject, shouldInterruptMusic, shouldSkipThinkingMusic, isDeadAirDetectionActive, calculateScheduledMoments, getDuckTiming, getPersonaStyle, 
// Constants
DJ_PROBABILITIES, DJ_TIMING, PERSONA_DJ_STYLES, } from './dj-decision-engine.js';
// =============================================================================
// DJ SPEECH ENGINE - Phrase Generation
// =============================================================================
export { 
// Phrase generators
getOutroPhrase, getTransitionPhrase, getDropPhrase, getMomentPhrase, getCheckInPhrase, getMusicStoppedPhrase, 
// LLM-powered interjections
generateLLMInterjection, prewarmInterjectionCache, clearInterjectionCache, getInterjection, } from './dj-speech-engine.js';
// Re-export for backward compatibility with code using shouldInterruptMusic
export { shouldInterruptMusic as shouldInterruptMusicLegacy } from './music-humanization.js';
// =============================================================================
// DJ TIMING ENGINE - Centralized Timer Management
// =============================================================================
export { DJTimingEngine, getDJTimingEngine, resetDJTimingEngine, } from './dj-timing-engine.js';
// =============================================================================
// MUSIC PLAYER - Low-level Playback
// =============================================================================
export { CallMusicPlayer, getMusicPlayer, initializeMusicPlayer, isMusicAvailable, resetMusicPlayer, } from './music-player.js';
// =============================================================================
// AMBIENT MUSIC - Thinking/Background Music
// =============================================================================
export { getAmbientMusicEndedPhrase, getAmbientTracks, getDJDropPhrase, getDJOutroPhrase, getDJTrackChangePhrase, getMidSongMomentPhrase, getMoodAwareMusicOffer, getMusicStoppedPhrase as getLegacyMusicStoppedPhrase, // Legacy, use dj-speech-engine instead
getRandomAmbientTrack, getSessionCallbackPhrase, isAmbientMusicEnabled, playAmbientMusic, stopAmbientMusic, } from './ambient-music.js';
// =============================================================================
// SESSION SOUNDS - Stingers, Game Sounds
// =============================================================================
export { VERBAL_SOUNDS, getSessionSounds, getVerbalSound, playSessionSound, resetSessionSounds, } from './session-sounds.js';
export { getSoundEffectsPlayer, initializeSoundEffectsPlayer, resetSoundEffectsPlayer, } from './sound-effects-player.js';
// =============================================================================
// MUSIC HUMANIZATION - Natural Music Interactions
// =============================================================================
export { MusicHumanizationController, analyzeVibingBehavior, buildTrackContext, checkSpontaneousMusicMoment, clearLLMInterjectionCache, getConversationBridge, getEmotionalMirrorOffer, getFunInterjection, getFunInterjectionAsync, getMusicConversationStarter, getMusicDiscoveryQuestion, getMusicHumanization, getPersonaFunMoment, getPostMusicCheckIn, getTimeAwareMusicSuggestion, getTimeOfDay, prewarmMusicInterjection, resetMusicHumanization, } from './music-humanization.js';
// =============================================================================
// INTELLIGENT MUSIC TRANSITIONS
// =============================================================================
export { clearMusicContext, detectMidThought, endMusicContext, getMusicContext, inferMusicStartReason, startMusicContext, } from './music-session-context.js';
export { getIntelligentMusicTransition, getMusicTransition, logTransitionDecision, recordTransitionFeedback, getTransitionAnalyticsDashboard, } from './intelligent-music-transitions.js';
// =============================================================================
// MUSIC ANALYTICS & LEARNING
// =============================================================================
export { getTransitionAnalytics, resetTransitionAnalytics, generateEventId, createTransitionEvent, recordTransitionWithAnalytics, recordEngagementSignals, getBestTransitionType, } from './music-transition-analytics.js';
export { getUserProfile, selectTransitionWithLearning, updateUserLearning, addMusicMemory, findRelevantMusicMemories, getUserPreferredTransition, exportUserProfile, importUserProfile, clearAllProfiles, getUserLearningStats, } from './music-user-learning.js';
export { storeMusicHelpedMemory, findRelevantMemories, getMusicPreferences, generateMusicCallback, shouldMentionMusicMemory, exportUserMusicMemories, importUserMusicMemories, clearAllMusicMemories, getUserMusicMemoryStats, detectEmotionalContext, detectMusicHelped, } from './music-memory-integration.js';
export { registerMusicFeedbackRecorder, markMusicEnded, recordMusicFeedback, hasPendingMusicFeedback, clearMusicFeedbackRecorder, detectFeedbackFromResponse, } from './music-feedback-manager.js';
export { ensureProfileLoaded, ensureMemoriesLoaded, ensureMusicLearningLoaded, isMusicLearningLoaded, saveProfile, saveMemories, saveMusicLearning, flushMusicLearning, flushAllMusicLearning, clearUserCache, shutdownMusicLearningPersistence, getMusicLearningStats, onTransitionFeedbackRecorded, onMusicMemoryStored, } from './music-learning-persistence.js';
export { extractMusicPreferences, hasMusicContext, } from './music-preference-extractor.js';
//# sourceMappingURL=index.js.map