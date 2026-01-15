/**
 * 🎧 DJ Service - Human-Like Music Intelligence
 *
 * Makes Ferni feel like a real DJ who:
 * - Reads the room and offers music at the right moments
 * - Has different DJ styles per persona
 * - Appreciates music during playback
 * - Remembers your taste across sessions
 * - Suggests music that matches the conversation mood
 * - Introduces you to new music you might like
 *
 * This is the brain behind the DJ experience.
 */

import { getMusicPlayer, type MusicTrack, type SessionMusicEntry } from '../../audio/index.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * Check if music is currently playing (utility for external use)
 */
export function isMusicCurrentlyPlaying(): boolean {
  const player = getMusicPlayer();
  return player.isPlaying();
}

/**
 * Get current track info if music is playing
 */
export function getCurrentPlayingTrack(): MusicTrack | null {
  const player = getMusicPlayer();
  if (!player.isPlaying()) return null;
  const track = player.getCurrentTrack();
  if (!track) return null;
  log.debug('DJ Service: Got current track', { track: track.name });
  return track;
}

// ============================================================================
// DJ PERSONA STYLES
// ============================================================================

/**
 * Each persona has a distinct DJ style that affects:
 * - How they introduce music
 * - How they react during playback
 * - How they transition between tracks
 * - The energy level of their commentary
 */
export interface DJPersonaStyle {
  /** The overall DJ vibe */
  style: 'hype' | 'chill' | 'sophisticated' | 'playful' | 'mindful' | 'warm';
  /** How often they interject during music (0-1) */
  interjectionFrequency: number;
  /** Preferred music moods */
  preferredMoods: string[];
  /** How they refer to themselves as DJ */
  djName?: string;
}

// HUMANIZATION FIX: Reduced interjection frequencies by ~60%
// Music should be enjoyed, not constantly commented on
export const DJ_PERSONA_STYLES: Record<string, DJPersonaStyle> = {
  ferni: {
    style: 'warm',
    interjectionFrequency: 0.12, // Reduced from 0.3
    preferredMoods: ['relaxing', 'thoughtful', 'uplifting'],
    djName: undefined, // Just Ferni
  },
  'jack-b': {
    style: 'chill',
    interjectionFrequency: 0.12, // Reduced from 0.35
    preferredMoods: ['chill', 'acoustic', 'classic rock', 'indie'],
  },
  jordan: {
    style: 'hype',
    interjectionFrequency: 0.2, // Reduced from 0.5
    preferredMoods: ['upbeat', 'party', 'energetic', 'dance'],
    djName: 'DJ Jordan',
  },
  'jordan-taylor': {
    style: 'hype',
    interjectionFrequency: 0.2, // Reduced from 0.5
    preferredMoods: ['upbeat', 'party', 'energetic', 'dance'],
    djName: 'DJ Jordan',
  },
  maya: {
    style: 'mindful',
    interjectionFrequency: 0.08, // Reduced from 0.2
    preferredMoods: ['calm', 'meditation', 'ambient', 'nature sounds'],
  },
  'maya-santos': {
    style: 'mindful',
    interjectionFrequency: 0.08, // Reduced from 0.2
    preferredMoods: ['calm', 'meditation', 'ambient', 'nature sounds'],
  },
  alex: {
    style: 'sophisticated',
    interjectionFrequency: 0.1, // Reduced from 0.25
    preferredMoods: ['focus', 'classical', 'jazz', 'lo-fi'],
  },
  'alex-chen': {
    style: 'sophisticated',
    interjectionFrequency: 0.1, // Reduced from 0.25
    preferredMoods: ['focus', 'classical', 'jazz', 'lo-fi'],
  },
  'peter-john': {
    style: 'sophisticated',
    interjectionFrequency: 0.12, // Reduced from 0.3
    preferredMoods: ['jazz', 'classical', 'oldies', 'easy listening'],
  },
  'nayan-patel': {
    style: 'mindful',
    interjectionFrequency: 0.06, // Reduced from 0.15
    preferredMoods: ['meditation', 'world music', 'ambient', 'spiritual'],
  },
};

export function getDJStyle(personaId: string): DJPersonaStyle {
  return DJ_PERSONA_STYLES[personaId] || DJ_PERSONA_STYLES.ferni;
}

// ============================================================================
// SPONTANEOUS MUSIC OFFERS
// ============================================================================

/**
 * Get a spontaneous music offer based on context.
 * Used during silence or after emotional moments.
 */
export function getSpontaneousMusicOffer(
  personaId: string,
  context: {
    silenceDurationSec?: number;
    recentMood?: string;
    isAfterEmotionalMoment?: boolean;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    hasPlayedMusicThisSession?: boolean;
  }
): string | null {
  const style = getDJStyle(personaId);

  // Don't offer if we've already played music this session (too pushy)
  if (context.hasPlayedMusicThisSession && Math.random() > 0.3) {
    return null;
  }

  // Mood-based offers
  if (context.isAfterEmotionalMoment) {
    return getMoodBasedOffer(personaId, 'emotional', style);
  }

  if (context.recentMood) {
    return getMoodBasedOffer(personaId, context.recentMood, style);
  }

  // Time-of-day offers
  if (context.timeOfDay) {
    return getTimeBasedOffer(personaId, context.timeOfDay, style);
  }

  // Generic offer
  return getGenericMusicOffer(personaId, style);
}

function getMoodBasedOffer(personaId: string, mood: string, style: DJPersonaStyle): string {
  const moodOffers: Record<string, Record<string, string[]>> = {
    hype: {
      happy: [
        '<emotion value="happy"/><break time="100ms"/>Your energy is amazing! Want me to put on something to match?',
        '<emotion value="happy"/><break time="100ms"/>Okay I HAVE to play you something! Ready?',
        '<break time="100ms"/>This calls for a soundtrack! Let me find something good.',
      ],
      stressed: [
        '<break time="100ms"/>Let me put on something to change the vibe!',
        '<break time="150ms"/>Music fixes everything. Trust me on this.',
      ],
      emotional: [
        '<break time="200ms"/>Want me to play something? Sometimes music says what words can\'t.',
      ],
    },
    chill: {
      happy: [
        '<break time="200ms"/>Want some tunes? I\'ve got something good.',
        '<break time="150ms"/>This is a good moment for music. Thoughts?',
      ],
      stressed: [
        '<break time="200ms"/>Hey... want me to put something on? Might help.',
        '<break time="200ms"/>Some music might be nice right now.',
      ],
      emotional: [
        '<break time="300ms"/>I could put on something if you want. <break time="200ms"/>No pressure.',
        '<break time="250ms"/>Music sometimes helps. Want me to play something quiet?',
      ],
    },
    mindful: {
      happy: [
        '<break time="200ms"/>Shall I play something to complement this moment?',
        '<break time="200ms"/>Some gentle music might be nice.',
      ],
      stressed: [
        '<break time="250ms"/>Would some calming music help? <break time="200ms"/>I have just the thing.',
        '<break time="200ms"/>Let me play something soothing.',
      ],
      emotional: [
        '<break time="300ms"/>Sometimes music can hold space for us. <break time="200ms"/>Want me to put something on?',
        '<break time="250ms"/>Music can be healing. <break time="200ms"/>Shall I?',
      ],
    },
    warm: {
      happy: [
        '<break time="150ms"/>Want me to put on some music?',
        '<break time="200ms"/>This feels like a good moment for music.',
      ],
      stressed: [
        '<break time="200ms"/>You know what might help? <break time="150ms"/>Some music.',
        '<break time="200ms"/>Let me play something nice for you.',
      ],
      emotional: [
        '<break time="250ms"/>I could put on some music. <break time="200ms"/>Sometimes it helps just to listen.',
        '<break time="200ms"/>Want me to play something? <break time="150ms"/>We don\'t have to talk.',
      ],
    },
    sophisticated: {
      happy: [
        '<break time="150ms"/>Shall I put on some music?',
        '<break time="200ms"/>I could play something appropriate.',
      ],
      stressed: [
        '<break time="200ms"/>Perhaps some music would help. <break time="150ms"/>I have a suggestion.',
      ],
      emotional: [
        '<break time="250ms"/>Music might be fitting here. <break time="200ms"/>Would you like that?',
      ],
    },
    playful: {
      happy: [
        '<emotion value="happy"/><break time="100ms"/>Ooh! Can I play you something? Please?',
        '<break time="100ms"/>I have the perfect song for this moment!',
      ],
      stressed: [
        '<break time="150ms"/>Music time? Music time.',
        '<break time="150ms"/>Let me find something to cheer you up!',
      ],
      emotional: ['<break time="200ms"/>Want some music? I\'ll pick something good.'],
    },
  };

  const styleOffers = moodOffers[style.style] || moodOffers.warm;
  const moodKey =
    mood === 'sad' || mood === 'anxious' || mood === 'stressed'
      ? 'stressed'
      : mood === 'happy' || mood === 'excited'
        ? 'happy'
        : 'emotional';

  const offers = styleOffers[moodKey] || styleOffers.emotional;
  return offers[Math.floor(Math.random() * offers.length)];
}

function getTimeBasedOffer(personaId: string, timeOfDay: string, style: DJPersonaStyle): string {
  const timeOffers: Record<string, Record<string, string[]>> = {
    morning: {
      hype: [
        '<emotion value="happy"/><break time="100ms"/>Morning energy! Want some upbeat tunes?',
      ],
      chill: ['<break time="200ms"/>Morning. <break time="150ms"/>Coffee and music?'],
      mindful: ['<break time="200ms"/>Some gentle morning music perhaps?'],
      warm: ['<break time="200ms"/>Good morning music always helps. Want some?'],
      sophisticated: ['<break time="150ms"/>Shall I put on something for the morning?'],
      playful: ['<emotion value="happy"/><break time="100ms"/>Wake-up music!'],
    },
    evening: {
      hype: ['<break time="150ms"/>Evening vibes! Time for some good music?'],
      chill: ['<break time="200ms"/>Evening\'s a good time for music. Thoughts?'],
      mindful: ['<break time="200ms"/>The evening calls for something gentle. Shall I?'],
      warm: ['<break time="200ms"/>Want some evening music to unwind?'],
      sophisticated: ['<break time="150ms"/>Some evening ambiance perhaps?'],
      playful: ['<break time="100ms"/>Evening playlist time?'],
    },
    night: {
      hype: ['<break time="200ms"/>Late night vibes? I\'ve got you.'],
      chill: ['<break time="250ms"/>Late night music?'],
      mindful: ['<break time="250ms"/>Peaceful night music?'],
      warm: ['<break time="250ms"/>Something quiet for the night?'],
      sophisticated: ['<break time="200ms"/>Night music?'],
      playful: ['<break time="200ms"/>Late night jams?'],
    },
  };

  const timeSet = timeOffers[timeOfDay] || timeOffers.evening;
  const styleOffer = timeSet[style.style] || timeSet.warm;
  return styleOffer[Math.floor(Math.random() * styleOffer.length)];
}

function getGenericMusicOffer(personaId: string, style: DJPersonaStyle): string {
  const genericOffers: Record<string, string[]> = {
    hype: [
      '<emotion value="happy"/><break time="100ms"/>Want me to play something?',
      '<break time="100ms"/>Music? Yes? Yes.',
    ],
    chill: [
      '<break time="200ms"/>Want some music?',
      '<break time="200ms"/>I could put something on.',
    ],
    mindful: [
      '<break time="200ms"/>Shall I play some music?',
      '<break time="200ms"/>Would music be welcome?',
    ],
    warm: [
      '<break time="200ms"/>Want me to put on some music?',
      '<break time="200ms"/>How about some music?',
    ],
    sophisticated: ['<break time="150ms"/>Shall I play something?', '<break time="200ms"/>Music?'],
    playful: [
      '<break time="100ms"/>Music? Pretty please?',
      '<emotion value="happy"/><break time="100ms"/>Can I DJ for you?',
    ],
  };

  const offers = genericOffers[style.style] || genericOffers.warm;
  return offers[Math.floor(Math.random() * offers.length)];
}

// ============================================================================
// SMART QUEUE TEASERS
// ============================================================================

/**
 * Get a teaser about what's coming next in the queue
 * Used after tracks end to maintain engagement
 */
export function getQueueTeaser(personaId: string, hasQueue: boolean): string | null {
  const style = getDJStyle(personaId);

  if (!hasQueue) {
    return getContinuityOffer(personaId, style);
  }

  const teasers: Record<string, string[]> = {
    hype: [
      '<emotion value="happy"/><break time="100ms"/>I\'ve got something great coming up next!',
      '<break time="100ms"/>Oh you\'re gonna love the next one.',
      '<emotion value="happy"/><break time="100ms"/>Wait till you hear what\'s next!',
    ],
    chill: [
      '<break time="150ms"/>Got another good one lined up.',
      '<break time="200ms"/>Next one\'s good too.',
    ],
    mindful: ['<break time="200ms"/>I have something beautiful queued up.'],
    warm: [
      '<break time="150ms"/>I\'ve got something nice coming next.',
      '<break time="200ms"/>Wait for the next one.',
    ],
    sophisticated: ['<break time="150ms"/>The next selection is excellent.'],
    playful: ['<emotion value="happy"/><break time="100ms"/>Ooh the next one though!'],
  };

  const personaTeasers = teasers[style.style] || teasers.warm;
  return personaTeasers[Math.floor(Math.random() * personaTeasers.length)];
}

function getContinuityOffer(personaId: string, style: DJPersonaStyle): string {
  const offers: Record<string, string[]> = {
    hype: [
      '<emotion value="happy"/><break time="100ms"/>Want me to keep it going?',
      '<break time="100ms"/>More? Say the word!',
    ],
    chill: [
      '<break time="200ms"/>Want more? I\'ve got plenty.',
      '<break time="200ms"/>Should I keep this vibe going?',
    ],
    mindful: [
      '<break time="200ms"/>Shall I continue?',
      '<break time="200ms"/>More music, or shall we rest here?',
    ],
    warm: [
      '<break time="200ms"/>Want me to play something else?',
      '<break time="200ms"/>More music?',
    ],
    sophisticated: ['<break time="150ms"/>Another selection?'],
    playful: [
      '<emotion value="happy"/><break time="100ms"/>Again! Again!',
      '<break time="100ms"/>Encore?',
    ],
  };

  const personaOffers = offers[style.style] || offers.warm;
  return personaOffers[Math.floor(Math.random() * personaOffers.length)];
}

// ============================================================================
// MUSIC APPRECIATION COMMENTS
// ============================================================================

/**
 * Get an appreciation comment about the music
 * These are brief comments that show the DJ is enjoying the music too
 * @param personaId - The persona's ID for style selection
 * @param _track - Track info for future track-specific comments (currently unused)
 */
export function getMusicAppreciationComment(personaId: string, _track: MusicTrack): string | null {
  const style = getDJStyle(personaId);

  // Only comment based on persona's interjection frequency
  if (Math.random() > style.interjectionFrequency) {
    return null;
  }

  const comments: Record<string, string[]> = {
    hype: [
      '<emotion value="happy"/><break time="100ms"/>This song hits different!',
      '<break time="100ms"/>Okay I\'m vibing.',
      '<emotion value="happy"/><break time="100ms"/>Such a banger.',
      '<break time="100ms"/>The energy!',
    ],
    chill: [
      '<break time="200ms"/>Good stuff.',
      '<break time="200ms"/>Yeah, this is nice.',
      '<break time="200ms"/>Solid track.',
      '<break time="200ms"/>I dig it.',
    ],
    mindful: [
      '<break time="250ms"/>Beautiful.',
      '<break time="250ms"/>Listen to that...',
      '<break time="250ms"/>So peaceful.',
    ],
    warm: [
      '<break time="200ms"/>This is nice.',
      '<break time="200ms"/>Good choice.',
      '<break time="200ms"/>I like this one.',
    ],
    sophisticated: [
      '<break time="150ms"/>Excellent arrangement.',
      '<break time="150ms"/>Quality musicianship.',
      '<break time="200ms"/>Well done.',
    ],
    playful: [
      '<emotion value="happy"/><break time="100ms"/>Ooh I like this!',
      '<break time="100ms"/>Tune!',
      '<emotion value="happy"/><break time="100ms"/>This is my jam!',
    ],
  };

  const personaComments = comments[style.style] || comments.warm;
  return personaComments[Math.floor(Math.random() * personaComments.length)];
}

/**
 * Get a specific music element appreciation
 * "That bass line though..." style comments
 */
export function getMusicElementAppreciation(personaId: string): string | null {
  const style = getDJStyle(personaId);

  // Less frequent than general appreciation
  if (Math.random() > style.interjectionFrequency * 0.5) {
    return null;
  }

  const appreciations: Record<string, string[]> = {
    hype: [
      '<break time="100ms"/>That drop though!',
      '<emotion value="happy"/><break time="100ms"/>The beat!',
      '<break time="100ms"/>Those synths!',
    ],
    chill: [
      '<break time="200ms"/>That guitar...',
      '<break time="200ms"/>Love that bass line.',
      '<break time="200ms"/>Nice melody.',
    ],
    mindful: [
      '<break time="250ms"/>Those harmonies...',
      '<break time="250ms"/>The layering is beautiful.',
      '<break time="250ms"/>Such texture.',
    ],
    warm: [
      '<break time="200ms"/>Love that part.',
      '<break time="200ms"/>Nice chord there.',
      '<break time="200ms"/>That melody.',
    ],
    sophisticated: [
      '<break time="150ms"/>Masterful arrangement.',
      '<break time="200ms"/>The counterpoint...',
      '<break time="150ms"/>Brilliant dynamics.',
    ],
    playful: [
      '<emotion value="happy"/><break time="100ms"/>That part right there!',
      '<break time="100ms"/>The hook!',
    ],
  };

  const personaAppreciations = appreciations[style.style] || appreciations.warm;
  return personaAppreciations[Math.floor(Math.random() * personaAppreciations.length)];
}

// ============================================================================
// MUSIC CONVERSATION STARTERS
// ============================================================================

/**
 * Get a conversation starter about music
 * Used to engage the user about their musical tastes
 */
export function getMusicConversationStarter(
  personaId: string,
  context: {
    track?: MusicTrack;
    sessionHistory?: SessionMusicEntry[];
  }
): string {
  const style = getDJStyle(personaId);

  // About the current track
  if (context.track) {
    return getTrackConversation(personaId, context.track, style);
  }

  // About their taste
  if (context.sessionHistory && context.sessionHistory.length > 0) {
    return getTasteConversation(personaId, context.sessionHistory, style);
  }

  // General music conversation
  return getGeneralMusicConversation(personaId, style);
}

function getTrackConversation(personaId: string, track: MusicTrack, style: DJPersonaStyle): string {
  const questions: Record<string, string[]> = {
    hype: [
      `<break time="100ms"/>What do you love about ${track.artist}?`,
      `<break time="100ms"/>How\'d you discover this?`,
    ],
    chill: [
      `<break time="200ms"/>You a big ${track.artist} fan?`,
      `<break time="200ms"/>What draws you to this kind of music?`,
    ],
    mindful: [
      `<break time="200ms"/>What does this song bring up for you?`,
      `<break time="200ms"/>Does this connect to any memories?`,
    ],
    warm: [
      `<break time="200ms"/>Do you have a history with this song?`,
      `<break time="200ms"/>What made you think of this?`,
    ],
    sophisticated: [`<break time="150ms"/>What appeals to you about ${track.artist}\'s work?`],
    playful: [
      `<emotion value="happy"/><break time="100ms"/>Okay but what\'s your ALL time favorite song?`,
    ],
  };

  const personaQuestions = questions[style.style] || questions.warm;
  return personaQuestions[Math.floor(Math.random() * personaQuestions.length)];
}

function getTasteConversation(
  personaId: string,
  history: SessionMusicEntry[],
  style: DJPersonaStyle
): string {
  const artist = history[history.length - 1]?.track.artist || 'music';

  const questions: Record<string, string[]> = {
    hype: [`<break time="100ms"/>You\'ve got good taste! Who else do you like?`],
    chill: [`<break time="200ms"/>So you\'re into ${artist}... what else?`],
    mindful: [
      `<break time="200ms"/>Music seems important to you. <break time="150ms"/>What role does it play in your life?`,
    ],
    warm: [`<break time="200ms"/>What kind of music speaks to you?`],
    sophisticated: [`<break time="150ms"/>Tell me about your musical preferences.`],
    playful: [`<emotion value="happy"/><break time="100ms"/>What\'s your guilty pleasure song?`],
  };

  const personaQuestions = questions[style.style] || questions.warm;
  return personaQuestions[Math.floor(Math.random() * personaQuestions.length)];
}

function getGeneralMusicConversation(personaId: string, style: DJPersonaStyle): string {
  const questions: Record<string, string[]> = {
    hype: ['<break time="100ms"/>What music gets you pumped?'],
    chill: ['<break time="200ms"/>What do you usually listen to?'],
    mindful: ['<break time="200ms"/>What music moves you?'],
    warm: ['<break time="200ms"/>What kind of music do you like?'],
    sophisticated: ['<break time="150ms"/>What are your musical preferences?'],
    playful: ['<emotion value="happy"/><break time="100ms"/>What\'s on your playlist lately?'],
  };

  const personaQuestions = questions[style.style] || questions.warm;
  return personaQuestions[Math.floor(Math.random() * personaQuestions.length)];
}

// ============================================================================
// READ THE ROOM
// ============================================================================

/**
 * Determine the right music behavior based on context
 */
export function getReadTheRoomAction(
  context: {
    userIsSilentDuringMusic?: boolean;
    userIsTalkingDuringMusic?: boolean;
    musicHasBeenPlayingFor?: number; // seconds
    userEngagementLevel?: 'high' | 'medium' | 'low';
  },
  personaId: string
): { action: 'continue' | 'offer_stop' | 'auto_duck' | 'check_in'; phrase?: string } | null {
  const style = getDJStyle(personaId);

  // User is talking - auto-duck (handled by music player, but we can note it)
  if (context.userIsTalkingDuringMusic) {
    return { action: 'auto_duck' };
  }

  // User is quiet during music for a while - check if they're enjoying it
  // HUMANIZATION FIX: Increased from 60s to 120s - silence during music is NORMAL
  if (context.userIsSilentDuringMusic && (context.musicHasBeenPlayingFor || 0) > 120) {
    const checkIns: Record<string, string[]> = {
      hype: ['<break time="150ms"/>You vibing? Or should I switch it up?'],
      chill: ['<break time="200ms"/>Just enjoying the music? Cool.'],
      mindful: [
        '<break time="200ms"/>I\'ll let the music play. <break time="150ms"/>Just enjoying it with you.',
      ],
      warm: ['<break time="200ms"/>I\'ll let it play. <break time="150ms"/>Enjoying this?'],
      sophisticated: ['<break time="150ms"/>Shall I continue with this selection?'],
      playful: ['<break time="150ms"/>You still with me? [laughter]'],
    };

    const personaCheckIns = checkIns[style.style] || checkIns.warm;
    return {
      action: 'check_in',
      phrase: personaCheckIns[Math.floor(Math.random() * personaCheckIns.length)],
    };
  }

  // Low engagement after music has been playing - offer to stop
  // HUMANIZATION FIX: Increased from 90s to 180s - let them enjoy the music
  if (context.userEngagementLevel === 'low' && (context.musicHasBeenPlayingFor || 0) > 180) {
    const offers: Record<string, string[]> = {
      hype: ['<break time="150ms"/>Want me to turn this off? No judgment.'],
      chill: ['<break time="200ms"/>Should I kill the music?'],
      mindful: ['<break time="200ms"/>Perhaps silence would be better?'],
      warm: ['<break time="200ms"/>Want me to stop the music?'],
      sophisticated: ['<break time="150ms"/>Shall I pause this?'],
      playful: ['<break time="150ms"/>Music break over?'],
    };

    const personaOffers = offers[style.style] || offers.warm;
    return {
      action: 'offer_stop',
      phrase: personaOffers[Math.floor(Math.random() * personaOffers.length)],
    };
  }

  return { action: 'continue' };
}

// ============================================================================
// CONTEXTUAL MUSIC INTELLIGENCE
// ============================================================================

/**
 * Suggest music based on conversation context
 */
export function getContextualMusicSuggestion(
  conversationContext: {
    topics?: string[];
    mood?: string;
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    needsFocus?: boolean;
  },
  personaId: string
): { suggestion: string; genre: string } | null {
  const style = getDJStyle(personaId);

  // Heavy emotional topic - suggest calming music
  if (conversationContext.isHeavyTopic) {
    return {
      suggestion: getSuggestionPhrase(style, 'calming'),
      genre: 'calming',
    };
  }

  // Celebration - suggest upbeat music
  if (conversationContext.isCelebration) {
    return {
      suggestion: getSuggestionPhrase(style, 'celebration'),
      genre: 'upbeat celebration',
    };
  }

  // Focus needed - suggest focus music
  if (conversationContext.needsFocus) {
    return {
      suggestion: getSuggestionPhrase(style, 'focus'),
      genre: 'focus',
    };
  }

  // Mood-based suggestion
  if (conversationContext.mood) {
    const genre = getMoodGenre(conversationContext.mood);
    return {
      suggestion: getSuggestionPhrase(style, genre),
      genre,
    };
  }

  return null;
}

function getSuggestionPhrase(style: DJPersonaStyle, type: string): string {
  const suggestions: Record<string, Record<string, string>> = {
    calming: {
      hype: '<break time="150ms"/>Let me put on something soothing.',
      chill: '<break time="200ms"/>Some calm music might help here.',
      mindful: '<break time="200ms"/>Let me play something peaceful.',
      warm: '<break time="200ms"/>How about something calming?',
      sophisticated: '<break time="150ms"/>Perhaps something tranquil.',
      playful: '<break time="150ms"/>Chill vibes incoming.',
    },
    celebration: {
      hype: '<emotion value="happy"/><break time="100ms"/>This calls for celebration music!',
      chill: '<break time="150ms"/>Let\'s celebrate with some good music!',
      mindful: '<break time="200ms"/>A joyful moment deserves joyful music.',
      warm: '<break time="150ms"/>This deserves some celebration music!',
      sophisticated: '<break time="150ms"/>An occasion for festive music.',
      playful: '<emotion value="happy"/><break time="100ms"/>Party music!',
    },
    focus: {
      hype: '<break time="150ms"/>Focus music coming up!',
      chill: '<break time="200ms"/>I\'ll put on something to help you concentrate.',
      mindful: '<break time="200ms"/>Let me create a focused atmosphere.',
      warm: '<break time="200ms"/>Some focus music might help.',
      sophisticated: '<break time="150ms"/>Shall I play something conducive to concentration?',
      playful: '<break time="150ms"/>Productivity playlist activated!',
    },
  };

  const typeSuggestions = suggestions[type] || suggestions.calming;
  return typeSuggestions[style.style] || typeSuggestions.warm;
}

function getMoodGenre(mood: string): string {
  const moodMap: Record<string, string> = {
    happy: 'upbeat',
    excited: 'energetic',
    sad: 'comforting',
    anxious: 'calming',
    stressed: 'relaxing',
    tired: 'gentle',
    focused: 'focus',
    neutral: 'chill',
  };
  return moodMap[mood.toLowerCase()] || 'chill';
}

// ============================================================================
// MUSIC DISCOVERY MODE
// ============================================================================

/**
 * Offer to introduce the user to new music
 */
export function getMusicDiscoveryOffer(personaId: string): string {
  const style = getDJStyle(personaId);

  const offers: Record<string, string[]> = {
    hype: [
      '<emotion value="happy"/><break time="100ms"/>Want me to play you something you probably haven\'t heard?',
      '<break time="100ms"/>Can I introduce you to a new artist?',
    ],
    chill: [
      '<break time="200ms"/>Want to hear something new? I\'ve got suggestions.',
      '<break time="200ms"/>Up for some music discovery?',
    ],
    mindful: [
      '<break time="200ms"/>Would you like to explore some new music together?',
      '<break time="200ms"/>I could introduce you to something different.',
    ],
    warm: [
      '<break time="200ms"/>Want me to play you something new?',
      '<break time="200ms"/>I could suggest something you might not have heard.',
    ],
    sophisticated: [
      '<break time="150ms"/>Shall I introduce you to a new artist?',
      '<break time="200ms"/>I have a recommendation.',
    ],
    playful: [
      '<emotion value="happy"/><break time="100ms"/>Ooh! Can I show you something cool?',
      '<break time="100ms"/>Trust me on this one - new song time!',
    ],
  };

  const personaOffers = offers[style.style] || offers.warm;
  return personaOffers[Math.floor(Math.random() * personaOffers.length)];
}

// ============================================================================
// CROSS-SESSION MUSIC MEMORY
// ============================================================================

/**
 * Get a callback phrase referencing past music sessions
 */
export function getCrossSessionMusicCallback(
  personaId: string,
  musicMemory: {
    favoriteArtists?: string[];
    favoriteGenres?: string[];
    lastPlayedArtist?: string;
    totalTracksPlayed?: number;
  }
): string | null {
  if (!musicMemory.favoriteArtists?.length && !musicMemory.lastPlayedArtist) {
    return null;
  }

  const style = getDJStyle(personaId);
  const artist = musicMemory.favoriteArtists?.[0] || musicMemory.lastPlayedArtist;

  const callbacks: Record<string, string[]> = {
    hype: [
      `<emotion value="happy"/><break time="100ms"/>You know I remember you love ${artist}!`,
      `<break time="100ms"/>More ${artist} today?`,
    ],
    chill: [
      `<break time="200ms"/>Last time you were into ${artist}. <break time="150ms"/>More of that?`,
      `<break time="200ms"/>You seem to dig ${artist}.`,
    ],
    mindful: [
      `<break time="200ms"/>I remember you connected with ${artist}. <break time="150ms"/>Shall we return there?`,
    ],
    warm: [
      `<break time="200ms"/>You\'ve enjoyed ${artist} before. <break time="150ms"/>Want more?`,
      `<break time="200ms"/>Remember that ${artist} music? <break time="150ms"/>Want something similar?`,
    ],
    sophisticated: [
      `<break time="150ms"/>Based on your preference for ${artist}, I have a suggestion.`,
    ],
    playful: [`<emotion value="happy"/><break time="100ms"/>I know you love ${artist}!`],
  };

  const personaCallbacks = callbacks[style.style] || callbacks.warm;
  return personaCallbacks[Math.floor(Math.random() * personaCallbacks.length)];
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const DJService = {
  getDJStyle,
  getSpontaneousMusicOffer,
  getQueueTeaser,
  getMusicAppreciationComment,
  getMusicElementAppreciation,
  getMusicConversationStarter,
  getReadTheRoomAction,
  getContextualMusicSuggestion,
  getMusicDiscoveryOffer,
  getCrossSessionMusicCallback,
};

export default DJService;
