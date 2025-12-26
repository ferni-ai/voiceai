/**
 * Music Memory Integration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Remembers what music helped in what situations, enabling responses like:
 * - "Last time you were stressed, that jazz really seemed to help..."
 * - "You mentioned before that lo-fi helps you focus..."
 * - "Remember when we played that Debussy piece? You seemed more at peace after."
 *
 * This integrates with the existing memory system to store music-related memories
 * that persist across sessions.
 *
 * Philosophy: Music is deeply personal. The same song can bring joy to one person
 * and sadness to another. We track what works for EACH user.
 */

import { createLogger } from '../utils/safe-logger.js';
import type { MusicSessionContext } from './music-session-context.js';
import type { TransitionType } from './intelligent-music-transitions.js';

const log = createLogger({ module: 'MusicMemoryIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A memory of music that helped the user
 */
export interface MusicHelpedMemory {
  /** Unique memory ID */
  id: string;

  /** User ID */
  userId: string;

  /** When this memory was created */
  createdAt: number;

  /** What emotional state the user was in */
  emotionalContext: {
    state:
      | 'stressed'
      | 'sad'
      | 'anxious'
      | 'overwhelmed'
      | 'tired'
      | 'frustrated'
      | 'celebrating'
      | 'thinking'
      | 'general';
    intensity?: number; // 0-1
    topic?: string; // What they were dealing with
  };

  /** The music that helped */
  music: {
    trackName?: string;
    artist?: string;
    genre?: string;
    mood?: string; // relaxing, upbeat, focus, etc.
    wasAmbient: boolean;
  };

  /** How did we know it helped? */
  evidence: {
    /** User's first words after music ended */
    userResponse?: string;
    /** Detected emotional shift */
    emotionalShift?: 'positive' | 'neutral' | 'negative';
    /** Did they continue the session happily? */
    continuedSession: boolean;
    /** Did they explicitly thank or praise the music? */
    explicitPositive: boolean;
    /** Voice tone analysis */
    voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
  };

  /** What transition worked after the music? */
  effectiveTransition: TransitionType;

  /** Confidence that this was actually helpful (0-1) */
  confidence: number;

  /** Tags for retrieval */
  tags: string[];
}

/**
 * A music preference learned from history
 */
export interface MusicPreference {
  /** Context this preference applies to */
  context: {
    emotionalState?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'lateNight';
    activity?: string; // thinking, working, relaxing, etc.
  };

  /** Preferred music attributes */
  preference: {
    genre?: string;
    mood?: string;
    artist?: string;
    ambientPreferred: boolean;
  };

  /** Strength of this preference (0-1) */
  strength: number;

  /** Number of times this preference was validated */
  validationCount: number;
}

/**
 * Callback phrase when referencing music memories
 */
export interface MusicCallbackPhrase {
  /** The phrase to say */
  phrase: string;
  /** What memory this references */
  memoryId: string;
  /** How confident we are this is appropriate */
  confidence: number;
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * In-memory storage (would be backed by Firestore in production)
 */
const userMusicMemories = new Map<string, MusicHelpedMemory[]>();
const userMusicPreferences = new Map<string, MusicPreference[]>();

// ============================================================================
// MEMORY CREATION
// ============================================================================

/**
 * Generate a unique memory ID
 */
function generateMemoryId(): string {
  return `music_mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Detect emotional context from music session
 */
export function detectEmotionalContext(
  musicContext: MusicSessionContext | null,
  userMessage?: string
): MusicHelpedMemory['emotionalContext'] {
  // Default to general
  let state: MusicHelpedMemory['emotionalContext']['state'] = 'general';
  let intensity = 0.5;
  let topic: string | undefined;

  if (musicContext) {
    // Map start reason to emotional state
    switch (musicContext.startReason) {
      case 'emotional_processing':
        state = 'sad';
        intensity = 0.7;
        break;
      case 'comfort':
        state = 'stressed';
        intensity = 0.8;
        break;
      case 'celebration':
        state = 'celebrating';
        intensity = 0.7;
        break;
      case 'thinking':
        state = 'thinking';
        intensity = 0.5;
        break;
    }

    // Get topic from context
    topic = musicContext.topicBeforeMusic;

    // Adjust based on emotional tone
    if (musicContext.emotionalToneBeforeMusic === 'heavy') {
      intensity = Math.max(intensity, 0.7);
    } else if (musicContext.emotionalToneBeforeMusic === 'crisis') {
      state = 'overwhelmed';
      intensity = 0.9;
    }
  }

  // Detect from user message if available
  if (userMessage) {
    const msg = userMessage.toLowerCase();

    if (msg.includes('stressed') || msg.includes('stress')) {
      state = 'stressed';
    } else if (msg.includes('sad') || msg.includes('down')) {
      state = 'sad';
    } else if (msg.includes('anxious') || msg.includes('worry')) {
      state = 'anxious';
    } else if (msg.includes('tired') || msg.includes('exhausted')) {
      state = 'tired';
    } else if (msg.includes('frustrated') || msg.includes('angry')) {
      state = 'frustrated';
    } else if (msg.includes('thinking') || msg.includes('deciding')) {
      state = 'thinking';
    }
  }

  return { state, intensity, topic };
}

/**
 * Detect if music helped based on user response
 */
export function detectMusicHelped(
  userResponse?: string,
  voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral',
  sessionContinued = true
): { helped: boolean; confidence: number; explicitPositive: boolean } {
  let helpedScore = 0;
  let explicitPositive = false;

  // Voice tone is a strong signal
  if (voiceTone === 'warmer' || voiceTone === 'calmer' || voiceTone === 'energized') {
    helpedScore += 0.4;
  }

  // Session continuation is a moderate signal
  if (sessionContinued) {
    helpedScore += 0.2;
  }

  // User response analysis
  if (userResponse) {
    const response = userResponse.toLowerCase();

    // Explicit positive signals
    const positivePatterns = [
      /that (was |felt )?(nice|good|great|lovely|perfect|exactly what i needed)/,
      /thank(s| you)/,
      /i (feel|felt) (better|calmer|more relaxed|good|great)/,
      /that helped/,
      /i needed that/,
      /beautiful/,
      /love(d)? (that|it|the music)/,
    ];

    for (const pattern of positivePatterns) {
      if (pattern.test(response)) {
        helpedScore += 0.3;
        explicitPositive = true;
        break;
      }
    }

    // Negative signals
    const negativePatterns = [
      /not (really |what i |helping)/,
      /don't like/,
      /stop/,
      /too (loud|quiet|much)/,
      /annoying/,
    ];

    for (const pattern of negativePatterns) {
      if (pattern.test(response)) {
        helpedScore -= 0.5;
        break;
      }
    }
  }

  // Normalize score
  const confidence = Math.max(0, Math.min(1, helpedScore + 0.3)); // Base 0.3 confidence
  const helped = confidence >= 0.5;

  return { helped, confidence, explicitPositive };
}

/**
 * Store a memory that music helped
 */
export function storeMusicHelpedMemory(
  userId: string,
  musicContext: MusicSessionContext | null,
  effectiveTransition: TransitionType,
  evidence: {
    userResponse?: string;
    voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
    continuedSession?: boolean;
  }
): MusicHelpedMemory | null {
  // Check if music actually helped
  const helpCheck = detectMusicHelped(
    evidence.userResponse,
    evidence.voiceTone,
    evidence.continuedSession
  );

  if (!helpCheck.helped) {
    log.debug(
      { userId, confidence: helpCheck.confidence },
      '🎵 Music did not help enough to store memory'
    );
    return null;
  }

  // Create the memory
  const memory: MusicHelpedMemory = {
    id: generateMemoryId(),
    userId,
    createdAt: Date.now(),
    emotionalContext: detectEmotionalContext(
      musicContext,
      musicContext?.lastUserMessageBeforeMusic
    ),
    music: {
      trackName: musicContext?.trackName,
      artist: musicContext?.trackArtist,
      mood: musicContext?.startReason === 'celebration' ? 'upbeat' : 'relaxing',
      wasAmbient: musicContext?.wasAmbient ?? false,
    },
    evidence: {
      userResponse: evidence.userResponse,
      emotionalShift: helpCheck.helped ? 'positive' : 'neutral',
      continuedSession: evidence.continuedSession ?? true,
      explicitPositive: helpCheck.explicitPositive,
      voiceTone: evidence.voiceTone,
    },
    effectiveTransition,
    confidence: helpCheck.confidence,
    tags: generateTags(musicContext),
  };

  // Store it
  let memories = userMusicMemories.get(userId);
  if (!memories) {
    memories = [];
    userMusicMemories.set(userId, memories);
  }
  memories.push(memory);

  // Keep only last 100 memories
  if (memories.length > 100) {
    userMusicMemories.set(userId, memories.slice(-100));
  }

  log.info(
    {
      userId,
      memoryId: memory.id,
      emotionalState: memory.emotionalContext.state,
      confidence: memory.confidence,
    },
    '🎵 Music memory stored'
  );

  // Update preferences
  updatePreferencesFromMemory(userId, memory);

  return memory;
}

/**
 * Generate tags for a memory
 */
function generateTags(musicContext: MusicSessionContext | null): string[] {
  const tags: string[] = [];

  if (musicContext) {
    if (musicContext.startReason) tags.push(musicContext.startReason);
    if (musicContext.emotionalToneBeforeMusic) tags.push(musicContext.emotionalToneBeforeMusic);
    if (musicContext.wasAmbient) tags.push('ambient');
    if (musicContext.trackArtist) tags.push(musicContext.trackArtist.toLowerCase());
    if (musicContext.topicBeforeMusic) {
      // Extract key topic words
      const topicWords = musicContext.topicBeforeMusic.toLowerCase().split(/\s+/);
      tags.push(...topicWords.filter((w) => w.length > 3).slice(0, 3));
    }
  }

  return [...new Set(tags)]; // Dedupe
}

/**
 * Update preferences based on a new memory
 */
function updatePreferencesFromMemory(userId: string, memory: MusicHelpedMemory): void {
  let prefs = userMusicPreferences.get(userId);
  if (!prefs) {
    prefs = [];
    userMusicPreferences.set(userId, prefs);
  }

  // Check if we have an existing preference for this context
  const existingPref = prefs.find(
    (p) => p.context.emotionalState === memory.emotionalContext.state
  );

  if (existingPref) {
    // Strengthen existing preference
    existingPref.validationCount++;
    existingPref.strength = Math.min(1, existingPref.strength + 0.1);

    // Update if new memory has higher confidence
    if (memory.confidence > existingPref.strength) {
      existingPref.preference.genre = memory.music.genre || existingPref.preference.genre;
      existingPref.preference.mood = memory.music.mood || existingPref.preference.mood;
      existingPref.preference.artist = memory.music.artist || existingPref.preference.artist;
    }
  } else {
    // Create new preference
    prefs.push({
      context: {
        emotionalState: memory.emotionalContext.state,
      },
      preference: {
        genre: memory.music.genre,
        mood: memory.music.mood,
        artist: memory.music.artist,
        ambientPreferred: memory.music.wasAmbient,
      },
      strength: memory.confidence,
      validationCount: 1,
    });
  }
}

// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================

/**
 * Find relevant music memories for a context
 */
export function findRelevantMemories(
  userId: string,
  context: {
    emotionalState?: string;
    topic?: string;
    mood?: string;
  }
): MusicHelpedMemory[] {
  const memories = userMusicMemories.get(userId) || [];

  if (memories.length === 0) {
    return [];
  }

  // Score each memory by relevance
  const scored = memories.map((memory) => {
    let score = memory.confidence;

    // Boost for matching emotional state
    if (context.emotionalState && memory.emotionalContext.state === context.emotionalState) {
      score += 0.5;
    }

    // Boost for matching topic
    if (context.topic && memory.emotionalContext.topic?.includes(context.topic)) {
      score += 0.3;
    }

    // Boost for matching mood
    if (context.mood && memory.music.mood === context.mood) {
      score += 0.2;
    }

    // Recency boost (last 7 days)
    const daysSince = (Date.now() - memory.createdAt) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      score += (7 - daysSince) / 20;
    }

    // Boost for explicit positive feedback
    if (memory.evidence.explicitPositive) {
      score += 0.2;
    }

    return { memory, score };
  });

  // Return top 3 most relevant
  return scored
    .filter((s) => s.score > 0.5) // Only confident memories
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.memory);
}

/**
 * Get user's music preferences for a context
 */
export function getMusicPreferences(
  userId: string,
  context?: { emotionalState?: string }
): MusicPreference | null {
  const prefs = userMusicPreferences.get(userId) || [];

  if (prefs.length === 0) {
    return null;
  }

  // Find matching preference
  if (context?.emotionalState) {
    const matching = prefs.find((p) => p.context.emotionalState === context.emotionalState);
    if (matching && matching.strength > 0.5) {
      return matching;
    }
  }

  // Return strongest general preference
  const strongest = prefs.reduce((a, b) => (a.strength > b.strength ? a : b));
  return strongest.strength > 0.5 ? strongest : null;
}

// ============================================================================
// CALLBACK PHRASE GENERATION
// ============================================================================

/**
 * Generate a callback phrase referencing music memory
 *
 * These phrases make Ferni feel more human by remembering past music moments.
 * Use sparingly - maybe once per session when relevant.
 */
export function generateMusicCallback(
  userId: string,
  personaId: string,
  currentContext: {
    emotionalState?: string;
    topic?: string;
  }
): MusicCallbackPhrase | null {
  const relevantMemories = findRelevantMemories(userId, currentContext);

  if (relevantMemories.length === 0) {
    return null;
  }

  const memory = relevantMemories[0];
  const phrases = generateCallbackPhrases(memory, personaId);

  if (phrases.length === 0) {
    return null;
  }

  // Pick a random phrase
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  return {
    phrase,
    memoryId: memory.id,
    confidence: memory.confidence,
  };
}

/**
 * Generate callback phrases for a memory
 */
function generateCallbackPhrases(memory: MusicHelpedMemory, personaId: string): string[] {
  const phrases: string[] = [];
  const hasArtist = !!memory.music.artist;
  const hasTrack = !!memory.music.trackName;

  // Context-specific phrases
  switch (memory.emotionalContext.state) {
    case 'stressed':
      if (hasArtist) {
        phrases.push(
          `<break time="300ms"/>Last time you were stressed, some ${memory.music.artist} seemed to help...`,
          `<break time="300ms"/>Remember when we played ${memory.music.artist}? That seemed to take the edge off.`
        );
      } else {
        phrases.push(
          `<break time="300ms"/>Music helped last time you were feeling like this...`,
          `<break time="300ms"/>I remember music made a difference before when things felt heavy.`
        );
      }
      break;

    case 'sad':
      phrases.push(
        `<break time="300ms"/>I remember music helped before. Want me to put something on?`,
        `<break time="300ms"/>Last time you were down, we listened together. Want to do that again?`
      );
      break;

    case 'thinking':
      if (memory.music.wasAmbient) {
        phrases.push(
          `<break time="300ms"/>Some background music helped you think last time...`,
          `<break time="300ms"/>Want some thinking music? It seemed to help before.`
        );
      }
      break;

    case 'celebrating':
      if (hasTrack) {
        phrases.push(
          `<break time="300ms"/>Remember "${memory.music.trackName}"? That was a good moment.`
        );
      }
      break;
  }

  // Persona-specific adjustments
  if (personaId === 'nayan-patel') {
    // Nayan is more philosophical
    return phrases.map((p) =>
      p.replace('Last time', 'I recall when').replace('I remember', 'There was a time when')
    );
  } else if (personaId === 'jordan-taylor') {
    // Jordan is more energetic
    return phrases.map((p) =>
      p.replace('seemed to help', 'was great!').replace('made a difference', 'really worked!')
    );
  }

  return phrases;
}

/**
 * Check if we should mention a music memory (don't do it too often)
 */
export function shouldMentionMusicMemory(userId: string, lastMentionTimestamp?: number): boolean {
  // Don't mention more than once per session
  if (lastMentionTimestamp && Date.now() - lastMentionTimestamp < 30 * 60 * 1000) {
    return false;
  }

  // Need at least one memory
  const memories = userMusicMemories.get(userId) || [];
  if (memories.length === 0) {
    return false;
  }

  // 30% chance to mention (don't overdo it)
  return Math.random() < 0.3;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Export user's music memories (for persistence)
 */
export function exportUserMusicMemories(userId: string): {
  memories: MusicHelpedMemory[];
  preferences: MusicPreference[];
} {
  return {
    memories: userMusicMemories.get(userId) || [],
    preferences: userMusicPreferences.get(userId) || [],
  };
}

/**
 * Import user's music memories (from persistence)
 */
export function importUserMusicMemories(
  userId: string,
  data: {
    memories: MusicHelpedMemory[];
    preferences: MusicPreference[];
  }
): void {
  if (data.memories.length > 0) {
    userMusicMemories.set(userId, data.memories);
  }
  if (data.preferences.length > 0) {
    userMusicPreferences.set(userId, data.preferences);
  }

  log.info(
    {
      userId,
      memoriesCount: data.memories.length,
      preferencesCount: data.preferences.length,
    },
    '🎵 Music memories imported'
  );
}

/**
 * Clear all data (for testing)
 */
export function clearAllMusicMemories(): void {
  userMusicMemories.clear();
  userMusicPreferences.clear();
}

/**
 * Get memory stats for a user
 */
export function getUserMusicMemoryStats(userId: string): {
  totalMemories: number;
  oldestMemory?: number;
  mostCommonEmotionalState?: string;
  preferredMood?: string;
  hasStrongPreferences: boolean;
} {
  const memories = userMusicMemories.get(userId) || [];
  const prefs = userMusicPreferences.get(userId) || [];

  if (memories.length === 0) {
    return {
      totalMemories: 0,
      hasStrongPreferences: false,
    };
  }

  // Count emotional states
  const stateCounts: Record<string, number> = {};
  for (const memory of memories) {
    const { state } = memory.emotionalContext;
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }

  const mostCommon = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    totalMemories: memories.length,
    oldestMemory: memories[0].createdAt,
    mostCommonEmotionalState: mostCommon?.[0],
    preferredMood: prefs.find((p) => p.strength > 0.7)?.preference.mood,
    hasStrongPreferences: prefs.some((p) => p.strength > 0.7 && p.validationCount >= 3),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
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
};
