/**
 * Music Emotion Offers Context Builder
 *
 * Detects emotional states and injects music offers based on the user's mood.
 * Part of the "More Than Human" music intelligence system.
 *
 * This builder:
 * - Analyzes emotional signals from conversation
 * - Determines if music might help the user's emotional state
 * - Injects contextual music offers at appropriate moments
 * - Tracks offer acceptance/rejection for future improvement
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { getMusicPlayer, getDJController } from '../../../audio/index.js';
import { getEmotionalMirrorOffer } from '../../../audio/music-humanization.js';

// Type for emotion-music mappings (formerly from dj-enhancements)
type EmotionMusicMapping = {
  emotions: string[];
  suggestions: string[];
  phrases: string[];
};

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface EmotionOfferState {
  lastOfferTime: number;
  lastOfferedEmotion: string | null;
  offerCount: number;
  acceptedCount: number;
  declinedCount: number;
}

// ============================================================================
// STATE TRACKING
// ============================================================================

const offerStates = new Map<string, EmotionOfferState>();
const OFFER_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between offers (was 5 - too aggressive)
const MAX_OFFERS_PER_SESSION = 2; // Max 2 per session (was 3 - too many)

function getOrCreateOfferState(userId: string): EmotionOfferState {
  let state = offerStates.get(userId);
  if (!state) {
    state = {
      lastOfferTime: 0,
      lastOfferedEmotion: null,
      offerCount: 0,
      acceptedCount: 0,
      declinedCount: 0,
    };
    offerStates.set(userId, state);
  }
  return state;
}

// ============================================================================
// EMOTION DETECTION
// ============================================================================

/**
 * Emotions that could benefit from a music offer
 */
const MUSIC_HELPFUL_EMOTIONS = [
  'sad',
  'anxious',
  'stressed',
  'tired',
  'frustrated',
  'happy',
  'excited',
  'nostalgic',
  'lonely',
  'overwhelmed',
  'bored',
  'restless',
];

/**
 * Keywords that indicate specific emotional states
 */
const EMOTION_INDICATORS: Record<string, string[]> = {
  sad: ['sad', 'down', 'depressed', 'blue', 'crying', 'tears', 'heartbroken', 'grief'],
  anxious: [
    'anxious',
    'worried',
    'nervous',
    'stressed',
    'panic',
    'overwhelmed',
    "can't stop thinking",
  ],
  tired: ['tired', 'exhausted', 'drained', 'sleepy', 'worn out', 'no energy', 'need rest'],
  frustrated: ['frustrated', 'annoyed', 'irritated', 'angry', 'mad', 'ugh', 'so done'],
  happy: ['happy', 'great', 'amazing', 'wonderful', 'excited', 'fantastic', 'best day'],
  excited: ['excited', "can't wait", 'pumped', 'thrilled', 'hyped', 'stoked'],
  nostalgic: ['remember when', 'miss', 'back then', 'used to', 'good old days', 'memories'],
  lonely: ['lonely', 'alone', 'no one', 'by myself', 'miss having', 'isolated'],
  overwhelmed: ['overwhelmed', 'too much', "can't handle", 'drowning', 'buried', 'so much'],
  bored: ['bored', 'nothing to do', 'boring', 'meh', 'blah', 'dull'],
  focused: ['need to focus', 'concentrate', 'working on', 'studying', 'project'],
};

/**
 * Detect emotion from user text
 */
function detectEmotionFromText(text: string): string | null {
  const lowerText = text.toLowerCase();

  for (const [emotion, indicators] of Object.entries(EMOTION_INDICATORS)) {
    if (indicators.some((indicator) => lowerText.includes(indicator))) {
      return emotion;
    }
  }

  return null;
}

/**
 * Determine if we should offer music based on emotional state
 */
function shouldOfferMusic(
  emotion: string,
  state: EmotionOfferState,
  isMusicPlaying: boolean
): boolean {
  // Don't offer if music is already playing
  if (isMusicPlaying) {
    return false;
  }

  // Don't over-offer
  if (state.offerCount >= MAX_OFFERS_PER_SESSION) {
    return false;
  }

  // Respect cooldown
  const timeSinceLastOffer = Date.now() - state.lastOfferTime;
  if (timeSinceLastOffer < OFFER_COOLDOWN_MS) {
    return false;
  }

  // Don't re-offer the same emotion
  if (state.lastOfferedEmotion === emotion) {
    return false;
  }

  // Check if this emotion benefits from music
  if (!MUSIC_HELPFUL_EMOTIONS.includes(emotion)) {
    return false;
  }

  // Calculate offer probability based on history
  // REDUCED from 40% to 15% - was too aggressive and felt repetitive
  let probability = 0.15; // Base probability (was 0.4)

  // Increase if user has accepted before
  if (state.acceptedCount > 0) {
    probability += 0.15; // Reduced from 0.2
  }

  // Decrease if user has declined recently
  if (state.declinedCount > state.acceptedCount) {
    probability -= 0.1; // Reduced from 0.2
  }

  // Some emotions have higher offer rates, but still conservative
  const highOfferEmotions = ['sad', 'anxious', 'stressed', 'lonely'];
  if (highOfferEmotions.includes(emotion)) {
    probability += 0.1;
  }

  return Math.random() < probability;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build music emotion offer injections
 */
async function buildMusicEmotionOffers(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, userProfile, services, analysis, persona } = input;
  const injections: ContextInjection[] = [];

  // Get user ID for state tracking
  const userId = userProfile?.id || services?.sessionId || 'anonymous';

  try {
    // Check if music is currently playing
    const musicPlayer = getMusicPlayer();
    const isMusicPlaying = musicPlayer.isPlaying();

    // Get offer state
    const offerState = getOrCreateOfferState(userId);

    // Detect emotion from text or use provided emotion from analysis
    let detectedEmotion = detectEmotionFromText(userText);

    // Also check analysis for emotion
    if (!detectedEmotion && analysis?.emotion?.primary) {
      detectedEmotion = analysis.emotion.primary;
    }

    if (!detectedEmotion) {
      return [];
    }

    // Check if we should offer music
    if (!shouldOfferMusic(detectedEmotion, offerState, isMusicPlaying)) {
      return [];
    }

    // Simple emotion-to-genre mapping
    const emotionGenreMap: Record<string, string[]> = {
      sad: ['soft rock', 'acoustic', 'chill'],
      anxious: ['calm', 'ambient', 'lo-fi'],
      stressed: ['relaxing', 'nature sounds', 'meditation'],
      happy: ['upbeat', 'pop', 'feel-good'],
      excited: ['energetic', 'dance', 'motivational'],
      grateful: ['acoustic', 'folk', 'warm'],
    };
    const genres = emotionGenreMap[detectedEmotion] || ['calm', 'relaxing'];

    // Get emotional mirror offer from music humanization
    const emotionalMirrorPhrase = getEmotionalMirrorOffer(detectedEmotion);

    // Update state
    offerState.lastOfferTime = Date.now();
    offerState.lastOfferedEmotion = detectedEmotion;
    offerState.offerCount++;

    // Build the injection
    const offerPhrase = emotionalMirrorPhrase || `Would some ${genres[0]} music help right now?`;
    const searchQuery = `${genres[0]} ${detectedEmotion} mood`;

    const injection = createStandardInjection(
      'music_emotion_offer',
      `[MUSIC OFFER OPPORTUNITY]
The user seems to be feeling ${detectedEmotion}.
Music that might help: ${genres.join(', ')}
Suggested search: "${searchQuery}"

You can naturally offer music by saying something like:
"${offerPhrase}"

But only offer if it feels natural and appropriate. Don't force it.
Note: Only offer once, don't push if they don't respond.`
    );

    injections.push(injection);

    log.debug('Music emotion offer injected', {
      emotion: detectedEmotion,
      userId,
      offerCount: offerState.offerCount,
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to build music emotion offer');
  }

  return injections;
}

// ============================================================================
// TRACKING HELPERS
// ============================================================================

/**
 * Track that a music offer was accepted
 */
export function trackMusicOfferAccepted(userId: string): void {
  const state = getOrCreateOfferState(userId);
  state.acceptedCount++;
  log.debug('Music offer accepted', { userId, total: state.acceptedCount });
}

/**
 * Track that a music offer was declined
 */
export function trackMusicOfferDeclined(userId: string): void {
  const state = getOrCreateOfferState(userId);
  state.declinedCount++;
  log.debug('Music offer declined', { userId, total: state.declinedCount });
}

/**
 * Reset offer state for a new session
 */
export function resetMusicOfferState(userId: string): void {
  offerStates.delete(userId);
}

/**
 * Get offer statistics for a user
 */
export function getMusicOfferStats(userId: string): EmotionOfferState | null {
  return offerStates.get(userId) || null;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('music-emotion-offers', buildMusicEmotionOffers);

export { buildMusicEmotionOffers, detectEmotionFromText };
