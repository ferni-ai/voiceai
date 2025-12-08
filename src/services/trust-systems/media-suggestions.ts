/**
 * Contextual Media Suggestions
 *
 * Recommends music, podcasts, and media based on current emotional
 * state, preferences, and what's worked before.
 *
 * Philosophy: The right song at the right moment can shift everything.
 * Media is emotional medicine when chosen thoughtfully.
 *
 * Suggestion Types:
 * - Music for mood (matching or shifting)
 * - Podcasts for learning/growth
 * - Guided experiences (meditation, breathwork)
 * - Comfort content (familiar favorites)
 *
 * @module MediaSuggestions
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MediaSuggestions' });

// ============================================================================
// TYPES
// ============================================================================

export type MediaType = 'music' | 'podcast' | 'meditation' | 'breathwork' | 'ambient' | 'audiobook';
export type MoodIntent = 'match' | 'shift' | 'energize' | 'calm' | 'comfort' | 'focus';

export interface MediaSuggestion {
  id: string;
  type: MediaType;
  title: string;
  artist?: string;
  description: string;
  intent: MoodIntent;
  targetMood?: string;
  duration?: number; // minutes
  energy: 'low' | 'medium' | 'high';
  reason: string;
  spotifyUri?: string;
  appleMusicId?: string;
  youtubeId?: string;
  tags: string[];
}

export interface MediaPreferences {
  userId: string;

  // Music preferences
  favoriteGenres: string[];
  dislikedGenres: string[];
  favoriteArtists: string[];

  // Podcast preferences
  podcastTopics: string[];
  podcastStyles: Array<'interview' | 'narrative' | 'educational' | 'conversational'>;

  // Meditation preferences
  guidedVsUnguided: 'guided' | 'unguided' | 'both';
  preferredVoices: Array<'male' | 'female' | 'neutral'>;
  meditationLength: 'short' | 'medium' | 'long';

  // What's worked
  effectiveSuggestions: EffectiveSuggestion[];

  // What hasn't
  dismissedSuggestions: string[];
}

export interface EffectiveSuggestion {
  suggestionId: string;
  type: MediaType;
  context: string;
  mood: string;
  rating: 1 | 2 | 3 | 4 | 5;
  usedAt: Date;
  helpedWith?: string;
}

export interface SuggestionContext {
  currentMood: string;
  moodIntensity: number;
  intent?: MoodIntent;
  recentTopics?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  activity?: 'working' | 'relaxing' | 'commuting' | 'exercising' | 'winding_down';
  duration?: number; // available minutes
  energy?: 'low' | 'medium' | 'high';
}

// ============================================================================
// CURATED SUGGESTIONS BY MOOD/INTENT
// ============================================================================

// Note: In production, these would be dynamically fetched from Spotify/Apple Music APIs
// and personalized based on user listening history

const MUSIC_SUGGESTIONS: Record<string, MediaSuggestion[]> = {
  anxious_calm: [
    {
      id: 'music-calm-1',
      type: 'music',
      title: 'Weightless',
      artist: 'Marconi Union',
      description: 'Scientifically designed to reduce anxiety',
      intent: 'calm',
      targetMood: 'peaceful',
      duration: 8,
      energy: 'low',
      reason: 'This track was designed with sound therapists to reduce anxiety by 65%',
      spotifyUri: 'spotify:track:6kkwzB6hXLIONkEk9JaE3c',
      tags: ['ambient', 'anxiety-relief', 'science-backed'],
    },
    {
      id: 'music-calm-2',
      type: 'music',
      title: 'Clair de Lune',
      artist: 'Debussy',
      description: 'Timeless piano piece for peaceful moments',
      intent: 'calm',
      targetMood: 'peaceful',
      duration: 5,
      energy: 'low',
      reason: 'Classical piano can lower cortisol and slow breathing',
      tags: ['classical', 'piano', 'relaxing'],
    },
  ],

  sad_comfort: [
    {
      id: 'music-comfort-1',
      type: 'music',
      title: 'The Night We Met',
      artist: 'Lord Huron',
      description: 'For when you need to feel understood',
      intent: 'match',
      targetMood: 'melancholy',
      duration: 4,
      energy: 'low',
      reason: 'Sometimes we need music that meets us where we are',
      spotifyUri: 'spotify:track:0QZ5yyl6B6utIWkxeBDxQN',
      tags: ['indie', 'emotional', 'melancholy'],
    },
  ],

  sad_shift: [
    {
      id: 'music-shift-1',
      type: 'music',
      title: 'Here Comes the Sun',
      artist: 'The Beatles',
      description: 'Gentle optimism when ready to shift',
      intent: 'shift',
      targetMood: 'hopeful',
      duration: 3,
      energy: 'medium',
      reason: "A gentle lift when you're ready for a change",
      spotifyUri: 'spotify:track:6dGnYIeXmHdcikdzNNDMm2',
      tags: ['classic', 'uplifting', 'gentle'],
    },
  ],

  stressed_focus: [
    {
      id: 'music-focus-1',
      type: 'music',
      title: 'Lo-Fi Beats to Study To',
      artist: 'Various',
      description: 'Steady beats for concentration',
      intent: 'focus',
      targetMood: 'focused',
      duration: 60,
      energy: 'medium',
      reason: 'Lo-fi music helps maintain focus without distraction',
      tags: ['lofi', 'focus', 'study'],
    },
  ],

  happy_energize: [
    {
      id: 'music-energy-1',
      type: 'music',
      title: 'Walking on Sunshine',
      artist: 'Katrina and the Waves',
      description: 'Pure joy in musical form',
      intent: 'energize',
      targetMood: 'joyful',
      duration: 4,
      energy: 'high',
      reason: 'Amplify that good feeling!',
      spotifyUri: 'spotify:track:05wIrZSwuaVWhcv5FfqeH0',
      tags: ['upbeat', 'feel-good', '80s'],
    },
  ],

  overwhelmed_ground: [
    {
      id: 'music-ground-1',
      type: 'ambient',
      title: 'Rain and Thunder',
      description: 'Natural sounds to ground and center',
      intent: 'calm',
      targetMood: 'grounded',
      duration: 30,
      energy: 'low',
      reason: 'Nature sounds activate the parasympathetic nervous system',
      tags: ['nature', 'ambient', 'grounding'],
    },
  ],
};

const MEDITATION_SUGGESTIONS: Record<string, MediaSuggestion[]> = {
  anxious: [
    {
      id: 'med-anxiety-1',
      type: 'breathwork',
      title: '4-7-8 Breathing',
      description: 'Calming breath technique for anxiety',
      intent: 'calm',
      targetMood: 'calm',
      duration: 5,
      energy: 'low',
      reason: 'This breathing pattern activates your parasympathetic nervous system',
      tags: ['breathwork', 'anxiety', 'quick'],
    },
    {
      id: 'med-anxiety-2',
      type: 'meditation',
      title: 'Grounding Body Scan',
      description: 'Come back to your body when thoughts race',
      intent: 'calm',
      targetMood: 'grounded',
      duration: 10,
      energy: 'low',
      reason: 'Body awareness helps interrupt anxiety spirals',
      tags: ['guided', 'grounding', 'body-scan'],
    },
  ],

  sad: [
    {
      id: 'med-sad-1',
      type: 'meditation',
      title: 'Self-Compassion Meditation',
      description: 'Kindness toward yourself in difficult moments',
      intent: 'comfort',
      targetMood: 'held',
      duration: 15,
      energy: 'low',
      reason: 'Self-compassion is more effective than self-criticism',
      tags: ['guided', 'self-compassion', 'healing'],
    },
  ],

  stressed: [
    {
      id: 'med-stress-1',
      type: 'breathwork',
      title: 'Box Breathing',
      description: 'Navy SEAL technique for stress',
      intent: 'calm',
      targetMood: 'centered',
      duration: 5,
      energy: 'low',
      reason: 'Used by elite performers to stay calm under pressure',
      tags: ['breathwork', 'stress', 'performance'],
    },
  ],

  morning: [
    {
      id: 'med-morning-1',
      type: 'meditation',
      title: 'Morning Intention Setting',
      description: 'Start your day with clarity',
      intent: 'energize',
      targetMood: 'intentional',
      duration: 10,
      energy: 'medium',
      reason: 'Setting intentions increases follow-through by 42%',
      tags: ['guided', 'morning', 'intention'],
    },
  ],

  night: [
    {
      id: 'med-night-1',
      type: 'meditation',
      title: 'Sleep Stories',
      description: 'Drift off with a calming narrative',
      intent: 'calm',
      targetMood: 'sleepy',
      duration: 30,
      energy: 'low',
      reason: 'Stories give the mind something gentle to follow',
      tags: ['guided', 'sleep', 'story'],
    },
  ],
};

const PODCAST_SUGGESTIONS: Record<string, MediaSuggestion[]> = {
  growth: [
    {
      id: 'pod-growth-1',
      type: 'podcast',
      title: 'The Tim Ferriss Show',
      description: 'World-class performers share their routines',
      intent: 'energize',
      duration: 60,
      energy: 'medium',
      reason: "Learn from people who've mastered what you're working on",
      tags: ['interview', 'performance', 'growth'],
    },
    {
      id: 'pod-growth-2',
      type: 'podcast',
      title: 'On Being',
      description: 'Deep conversations about meaning and life',
      intent: 'comfort',
      duration: 50,
      energy: 'low',
      reason: 'Thoughtful exploration of what it means to be human',
      tags: ['interview', 'meaning', 'spirituality'],
    },
  ],

  anxiety: [
    {
      id: 'pod-anxiety-1',
      type: 'podcast',
      title: 'The Anxiety Coaches Podcast',
      description: 'Practical strategies for managing anxiety',
      intent: 'calm',
      duration: 30,
      energy: 'low',
      reason: 'Learn tools while normalizing your experience',
      tags: ['educational', 'anxiety', 'tools'],
    },
  ],

  motivation: [
    {
      id: 'pod-motivation-1',
      type: 'podcast',
      title: 'The School of Greatness',
      description: 'Inspiring stories of overcoming',
      intent: 'energize',
      duration: 45,
      energy: 'high',
      reason: "Sometimes we need to hear others' stories of triumph",
      tags: ['interview', 'motivation', 'success'],
    },
  ],
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const userPreferences = new Map<string, MediaPreferences>();

// ============================================================================
// PREFERENCE MANAGEMENT
// ============================================================================

/**
 * Get or create user preferences
 */
function getOrCreatePreferences(userId: string): MediaPreferences {
  let prefs = userPreferences.get(userId);

  if (!prefs) {
    prefs = {
      userId,
      favoriteGenres: [],
      dislikedGenres: [],
      favoriteArtists: [],
      podcastTopics: [],
      podcastStyles: [],
      guidedVsUnguided: 'both',
      preferredVoices: [],
      meditationLength: 'medium',
      effectiveSuggestions: [],
      dismissedSuggestions: [],
    };
    userPreferences.set(userId, prefs);
  }

  return prefs;
}

/**
 * Update preferences based on feedback
 */
export function recordSuggestionFeedback(
  userId: string,
  suggestionId: string,
  feedback: {
    used: boolean;
    rating?: 1 | 2 | 3 | 4 | 5;
    helpedWith?: string;
    mood: string;
  }
): void {
  const prefs = getOrCreatePreferences(userId);

  if (!feedback.used) {
    prefs.dismissedSuggestions.push(suggestionId);
    return;
  }

  if (feedback.rating && feedback.rating >= 4) {
    prefs.effectiveSuggestions.push({
      suggestionId,
      type: 'music', // Would get from suggestion
      context: feedback.mood,
      mood: feedback.mood,
      rating: feedback.rating,
      usedAt: new Date(),
      helpedWith: feedback.helpedWith,
    });
  }

  log.debug(
    {
      userId,
      suggestionId,
      rating: feedback.rating,
    },
    '🎵 Media feedback recorded'
  );
}

/**
 * Update genre preferences
 */
export function updateMusicPreferences(
  userId: string,
  preferences: Partial<
    Pick<MediaPreferences, 'favoriteGenres' | 'dislikedGenres' | 'favoriteArtists'>
  >
): void {
  const prefs = getOrCreatePreferences(userId);

  if (preferences.favoriteGenres) {
    prefs.favoriteGenres = preferences.favoriteGenres;
  }
  if (preferences.dislikedGenres) {
    prefs.dislikedGenres = preferences.dislikedGenres;
  }
  if (preferences.favoriteArtists) {
    prefs.favoriteArtists = preferences.favoriteArtists;
  }
}

// ============================================================================
// SUGGESTION GENERATION
// ============================================================================

/**
 * Generate media suggestions based on context
 */
export function generateSuggestions(userId: string, context: SuggestionContext): MediaSuggestion[] {
  const prefs = getOrCreatePreferences(userId);
  const suggestions: MediaSuggestion[] = [];

  // Determine what type of media to suggest
  const mediaTypes = selectMediaTypes(context);

  for (const type of mediaTypes) {
    const typeSuggestions = getSuggestionsForType(type, context, prefs);
    suggestions.push(...typeSuggestions);
  }

  // Filter out dismissed suggestions
  const filtered = suggestions.filter((s) => !prefs.dismissedSuggestions.includes(s.id));

  // Prioritize based on past effectiveness
  const prioritized = prioritizeSuggestions(filtered, prefs, context);

  log.debug(
    {
      userId,
      mood: context.currentMood,
      suggestionCount: prioritized.length,
    },
    '🎶 Media suggestions generated'
  );

  return prioritized.slice(0, 5);
}

/**
 * Select appropriate media types
 */
function selectMediaTypes(context: SuggestionContext): MediaType[] {
  const types: MediaType[] = [];

  // High anxiety/stress -> breathwork and calming music
  if (['anxious', 'stressed', 'overwhelmed'].includes(context.currentMood)) {
    types.push('breathwork', 'music', 'ambient');
  }

  // Sad -> comfort music and self-compassion
  if (['sad', 'lonely', 'down'].includes(context.currentMood)) {
    types.push('music', 'meditation');
  }

  // Need to focus -> ambient and focus music
  if (context.activity === 'working') {
    types.push('music', 'ambient');
  }

  // Winding down -> meditation and ambient
  if (context.activity === 'winding_down' || context.timeOfDay === 'night') {
    types.push('meditation', 'ambient');
  }

  // Morning -> energizing content
  if (context.timeOfDay === 'morning') {
    types.push('music', 'podcast');
  }

  // Default to music
  if (types.length === 0) {
    types.push('music');
  }

  return [...new Set(types)];
}

/**
 * Get suggestions for a specific type
 */
function getSuggestionsForType(
  type: MediaType,
  context: SuggestionContext,
  prefs: MediaPreferences
): MediaSuggestion[] {
  const mood = context.currentMood;
  const intent = context.intent || determineIntent(context);

  if (type === 'music' || type === 'ambient') {
    // Find matching music suggestions
    const key = `${mood}_${intent}`;
    return MUSIC_SUGGESTIONS[key] || MUSIC_SUGGESTIONS['anxious_calm'] || [];
  }

  if (type === 'meditation' || type === 'breathwork') {
    // Find matching meditation suggestions
    let key = mood;
    if (context.timeOfDay === 'morning') key = 'morning';
    if (context.timeOfDay === 'night') key = 'night';

    return MEDITATION_SUGGESTIONS[key] || MEDITATION_SUGGESTIONS['anxious'] || [];
  }

  if (type === 'podcast') {
    // Match to podcast topics
    if (['anxious', 'stressed'].includes(mood)) {
      return PODCAST_SUGGESTIONS['anxiety'] || [];
    }
    if (['motivated', 'energized'].includes(mood)) {
      return PODCAST_SUGGESTIONS['motivation'] || [];
    }
    return PODCAST_SUGGESTIONS['growth'] || [];
  }

  return [];
}

/**
 * Determine intent from context
 */
function determineIntent(context: SuggestionContext): MoodIntent {
  // High intensity negative mood -> match first, then shift
  if (
    context.moodIntensity > 0.7 &&
    ['sad', 'anxious', 'overwhelmed'].includes(context.currentMood)
  ) {
    return 'match'; // Meet them where they are
  }

  // Lower intensity negative mood -> can try to shift
  if (['sad', 'anxious', 'stressed'].includes(context.currentMood)) {
    return 'shift';
  }

  // Positive moods -> energize
  if (['happy', 'excited', 'motivated'].includes(context.currentMood)) {
    return 'energize';
  }

  // Neutral -> depends on time/activity
  if (context.timeOfDay === 'night') return 'calm';
  if (context.activity === 'working') return 'focus';

  return 'comfort';
}

/**
 * Prioritize suggestions based on past effectiveness
 */
function prioritizeSuggestions(
  suggestions: MediaSuggestion[],
  prefs: MediaPreferences,
  context: SuggestionContext
): MediaSuggestion[] {
  return suggestions.sort((a, b) => {
    // Check if either has been effective before
    const aEffective = prefs.effectiveSuggestions.find(
      (e) => e.suggestionId === a.id && e.mood === context.currentMood
    );
    const bEffective = prefs.effectiveSuggestions.find(
      (e) => e.suggestionId === b.id && e.mood === context.currentMood
    );

    if (aEffective && !bEffective) return -1;
    if (bEffective && !aEffective) return 1;

    // Prefer matching duration
    if (context.duration) {
      const aDiff = Math.abs((a.duration || 30) - context.duration);
      const bDiff = Math.abs((b.duration || 30) - context.duration);
      return aDiff - bDiff;
    }

    return 0;
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get single best suggestion
 */
export function getBestSuggestion(
  userId: string,
  context: SuggestionContext
): MediaSuggestion | null {
  const suggestions = generateSuggestions(userId, context);
  return suggestions[0] || null;
}

/**
 * Get suggestions for a specific type
 */
export function getSuggestionsForMood(
  userId: string,
  mood: string,
  type?: MediaType
): MediaSuggestion[] {
  return generateSuggestions(userId, {
    currentMood: mood,
    moodIntensity: 0.5,
    timeOfDay: 'afternoon',
  }).filter((s) => !type || s.type === type);
}

/**
 * Format suggestion for voice
 */
export function formatSuggestionForVoice(suggestion: MediaSuggestion): {
  text: string;
  ssml: string;
} {
  const typeIntros: Record<MediaType, string> = {
    music: 'I have a song that might help',
    podcast: "There's a podcast episode you might enjoy",
    meditation: "Here's a meditation that could help",
    breathwork: 'Let me guide you through a breathing exercise',
    ambient: 'Some calming sounds might help right now',
    audiobook: 'I have an audiobook suggestion',
  };

  const intro = typeIntros[suggestion.type];
  const text = `${intro}: "${suggestion.title}"${suggestion.artist ? ` by ${suggestion.artist}` : ''}. ${suggestion.reason}`;

  return {
    text,
    ssml: `<speak>
      <prosody rate="95%">
        ${intro}:
        <break time="300ms"/>
        "${suggestion.title}"${suggestion.artist ? `, by ${suggestion.artist}` : ''}.
        <break time="500ms"/>
        ${suggestion.reason}
      </prosody>
    </speak>`,
  };
}

/**
 * Get user preferences
 */
export function getMediaPreferences(userId: string): MediaPreferences | null {
  return userPreferences.get(userId) || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateSuggestions,
  getBestSuggestion,
  getSuggestionsForMood,
  recordSuggestionFeedback,
  updateMusicPreferences,
  formatSuggestionForVoice,
  getMediaPreferences,
};
