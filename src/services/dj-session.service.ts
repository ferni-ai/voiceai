/**
 * 🎧 DJ Session Service - The Full Radio Show Experience
 *
 * Makes every Ferni session feel like tuning into your favorite radio show:
 * - Session intros that "open the show" with energy
 * - Session outros that "wrap the show" with warmth
 * - Cross-session callbacks ("Last time we listened to...")
 * - Thinking music during processing moments
 * - "Guest DJ" handoff orchestration
 *
 * This is the conductor of the DJ experience - it coordinates timing,
 * music, speech, and mood to create those Pixar-level magical moments.
 */

import { getMusicPlayer } from '../audio/index.js';
import { isCoach } from '../personas/persona-ids.js';
import { getLogger } from '../utils/safe-logger.js';
import {
  getContextualMusicSuggestion,
  getCrossSessionMusicCallback,
  getDJStyle,
  getMusicConversationStarter,
  getMusicDiscoveryOffer,
  getQueueTeaser,
  getReadTheRoomAction,
  getSpontaneousMusicOffer,
  type DJPersonaStyle,
} from './dj-service.js';

const log = getLogger();

// ============================================================================
// SESSION INTRO/OUTRO TYPES
// ============================================================================

export interface SessionContext {
  /** User ID for personalization */
  userId?: string;
  /** User's name if known */
  userName?: string;
  /** Current persona ID */
  personaId: string;
  /** Is this user's first session ever? */
  isFirstSession?: boolean;
  /** Number of previous sessions */
  sessionCount?: number;
  /** Last session timestamp */
  lastSessionTime?: Date;
  /** Music history from previous sessions */
  musicHistory?: {
    favoriteArtists?: string[];
    favoriteGenres?: string[];
    lastPlayedArtist?: string;
    totalTracksPlayed?: number;
  };
  /** Topics from last session (for callbacks) */
  lastSessionTopics?: string[];
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Is it a weekend? */
  isWeekend?: boolean;
}

export interface SessionIntro {
  /** The opening phrase to speak */
  phrase: string;
  /** Optional music sting to play first */
  playStinger?: boolean;
  /** Optional ambient music to start softly */
  startAmbient?: boolean;
  /** Delay before speaking (for musical timing) */
  delayMs?: number;
  /** Special intro type for UI animations */
  introType: 'warm' | 'energetic' | 'callback' | 'first-time' | 'returning';
}

export interface SessionOutro {
  /** The closing phrase to speak */
  phrase: string;
  /** Summary of what was discussed (for personalization) */
  sessionSummary?: string;
  /** Play outro sting? */
  playStinger?: boolean;
  /** Outro type for UI animations */
  outroType: 'warm' | 'quick' | 'see-you-soon' | 'until-next-time';
}

// ============================================================================
// SESSION INTRO PHRASES - The "Opening the Show" Moment
// ============================================================================

const SESSION_INTROS = {
  // First time ever - warm welcome
  firstTime: {
    phrases: [
      '<break time="200ms"/>Hey there! <break time="150ms"/>I\'m Ferni. <break time="200ms"/>It\'s really nice to meet you.',
      '<break time="200ms"/>Hi! <break time="150ms"/>Welcome. <break time="200ms"/>I\'m Ferni, <break time="100ms"/>your AI life coach.',
      '<break time="200ms"/>Hello! <break time="150ms"/>So glad you\'re here. <break time="200ms"/>I\'m Ferni.',
    ],
    followUp: ['What brings you here today?', "What's on your mind?", "What's going on?"],
  },

  // Returning user - warm callback
  returning: {
    withName: [
      '<break time="200ms"/>Hey {name}! <break time="150ms"/>Good to have you back.',
      '<break time="200ms"/>{name}! <break time="150ms"/>There you are. <break time="100ms"/>How\'s it going?',
      '<break time="200ms"/>Welcome back, {name}! <break time="150ms"/>I\'ve been thinking about you.',
    ],
    withoutName: [
      '<break time="200ms"/>Hey! <break time="150ms"/>Good to see you again.',
      '<break time="200ms"/>Welcome back! <break time="150ms"/>How\'ve you been?',
      '<break time="200ms"/>Hey there! <break time="150ms"/>Missed you.',
    ],
  },

  // Time-of-day aware
  timeAware: {
    morning: [
      '<break time="200ms"/>Good morning! <break time="150ms"/>Early bird, huh? <break time="100ms"/>I like it.',
      '<break time="200ms"/>Morning! <break time="150ms"/>Coffee in hand? <break time="100ms"/>Let\'s do this.',
      '<break time="200ms"/>Hey, good morning! <break time="150ms"/>Fresh day, fresh start.',
    ],
    afternoon: [
      '<break time="200ms"/>Good afternoon! <break time="150ms"/>How\'s your day going so far?',
      '<break time="200ms"/>Hey there! <break time="150ms"/>Afternoon check-in. <break time="100ms"/>What\'s up?',
    ],
    evening: [
      '<break time="200ms"/>Good evening! <break time="150ms"/>Winding down, or just getting started?',
      '<break time="200ms"/>Hey there! <break time="150ms"/>Evening vibes. <break time="100ms"/>What\'s on your mind?',
    ],
    night: [
      '<break time="200ms"/>Hey, night owl! <break time="150ms"/>Couldn\'t sleep, or just thinking?',
      '<break time="200ms"/>Late night check-in! <break time="150ms"/>I\'m here.',
    ],
    weekend: [
      '<break time="200ms"/>Happy weekend! <break time="150ms"/>No rush today.',
      '<break time="200ms"/>Weekend mode! <break time="150ms"/>What\'s going on?',
    ],
  },

  // Music callback intros (when they have music history)
  musicCallback: [
    '<break time="200ms"/>Hey! <break time="150ms"/>Last time we were jamming to {artist}. <break time="200ms"/>Still in that mood?',
    '<break time="200ms"/>Welcome back! <break time="150ms"/>I remember you liked {artist}. <break time="200ms"/>Want more of that today?',
    '<break time="200ms"/>Hey there! <break time="150ms"/>We had some good tunes last time. <break time="200ms"/>How are you?',
  ],

  // Persona-specific intros
  persona: {
    ferni: {
      energetic: [
        '<emotion value="happy"/><break time="150ms"/>Hey! <break time="100ms"/>Great to see you!',
        '<break time="150ms"/>Welcome! <break time="100ms"/>Let\'s make today count.',
      ],
    },
    'peter-john': {
      energetic: [
        '<break time="200ms"/>Hello there. <break time="150ms"/>Good to connect.',
        '<break time="200ms"/>Welcome. <break time="150ms"/>Let\'s think through some things together.',
      ],
    },
    'maya-santos': {
      energetic: [
        '<break time="200ms"/>Hey! <break time="150ms"/>Good to see you.',
        '<break time="200ms"/>Welcome back! <break time="150ms"/>How are you feeling today?',
      ],
    },
    'jordan-taylor': {
      energetic: [
        '<emotion value="happy"/><break time="100ms"/>Hey hey! <break time="100ms"/>What\'s happening?',
        '<emotion value="happy"/><break time="150ms"/>There you are! <break time="100ms"/>Let\'s plan something fun!',
      ],
    },
    'alex-chen': {
      energetic: [
        '<break time="150ms"/>Hey! <break time="100ms"/>Good to connect.',
        '<break time="150ms"/>Welcome! <break time="100ms"/>What can we tackle today?',
      ],
    },
    'nayan-patel': {
      energetic: [
        '<break time="300ms"/>Hello, friend. <break time="200ms"/>Welcome.',
        '<break time="300ms"/>Ah, <break time="150ms"/>you\'re here. <break time="200ms"/>Good.',
      ],
    },
  },
};

// ============================================================================
// SESSION OUTRO PHRASES - The "Wrapping the Show" Moment
// ============================================================================

const SESSION_OUTROS = {
  // Warm goodbye
  warm: [
    '<break time="200ms"/>It was really good talking with you. <break time="150ms"/>Take care of yourself.',
    '<break time="200ms"/>I enjoyed this. <break time="150ms"/>Talk soon?',
    '<break time="200ms"/>Thanks for hanging out. <break time="150ms"/>You know where to find me.',
  ],

  // Quick goodbye (short session)
  quick: [
    '<break time="150ms"/>Alright! <break time="100ms"/>Catch you later.',
    '<break time="150ms"/>Cool. <break time="100ms"/>Talk soon!',
    '<break time="150ms"/>Got it. <break time="100ms"/>I\'m here when you need me.',
  ],

  // See you soon (implied return)
  seeYouSoon: [
    '<break time="200ms"/>Until next time! <break time="150ms"/>I\'ll be here.',
    '<break time="200ms"/>See you soon! <break time="150ms"/>Take care.',
    '<break time="200ms"/>Don\'t be a stranger! <break time="150ms"/>Talk soon.',
  ],

  // Session summary outro
  withSummary: [
    '<break time="200ms"/>Good session! <break time="150ms"/>We talked about {topics}. <break time="200ms"/>I\'ll remember.',
    '<break time="200ms"/>That was great. <break time="150ms"/>Lots to think about with {topics}. <break time="200ms"/>Take care.',
  ],

  // Music-themed outro (if they listened to music)
  musicThemed: [
    '<break time="200ms"/>Good vibes today! <break time="150ms"/>I\'ll save that {artist} energy for next time.',
    '<break time="200ms"/>Great session! <break time="150ms"/>The music was on point. <break time="200ms"/>Until next time!',
  ],

  // Persona-specific outros
  persona: {
    ferni: [
      '<break time="200ms"/>Take care of yourself. <break time="150ms"/>I mean it.',
      '<break time="200ms"/>You\'ve got this. <break time="150ms"/>Talk soon.',
    ],
    'peter-john': [
      '<break time="250ms"/>Good thinking today. <break time="200ms"/>Let it marinate.',
      '<break time="250ms"/>Progress, not perfection. <break time="200ms"/>Talk soon.',
    ],
    'maya-santos': [
      '<break time="200ms"/>Remember: small steps. <break time="150ms"/>You\'re doing great.',
      '<break time="200ms"/>Be gentle with yourself. <break time="150ms"/>See you soon.',
    ],
    'jordan-taylor': [
      '<emotion value="happy"/><break time="150ms"/>This was fun! <break time="100ms"/>Let\'s do it again!',
      '<break time="150ms"/>Awesome session! <break time="100ms"/>Can\'t wait to plan more!',
    ],
    'alex-chen': [
      '<break time="150ms"/>Good progress. <break time="100ms"/>Keep the momentum.',
      '<break time="150ms"/>Productive session! <break time="100ms"/>Talk soon.',
    ],
    'nayan-patel': [
      '<break time="300ms"/>Go gently. <break time="200ms"/>The path unfolds.',
      '<break time="300ms"/>Peace to you. <break time="200ms"/>Until we meet again.',
    ],
  },
};

// ============================================================================
// THINKING MUSIC CONFIGURATION
// ============================================================================

const THINKING_MUSIC_CONFIG = {
  /**
   * How long to wait before starting thinking music
   * TUNED: Reduced from 2000ms to 800ms to minimize dead air during LLM processing
   * The goal is to fill silence quickly without interrupting fast responses
   */
  delayBeforeStartMs: 800,
  /** Volume for thinking music (very soft) */
  volume: 0.08,
  /** Maximum thinking music duration before fading */
  maxDurationMs: 15000, // Reduced from 30s - if we're thinking this long, something's wrong
  /** Fade out duration */
  fadeOutDurationMs: 1000, // Slightly faster fade for snappier transitions
};

// ============================================================================
// GUEST DJ HANDOFF BANTER
// ============================================================================

/**
 * Banter phrases when handing off - the "Let me get my friend" moment
 */
const HANDOFF_BANTER = {
  // From Ferni to specialists
  ferniTo: {
    'peter-john': [
      '<break time="150ms"/>Oh! <break time="100ms"/>You know who\'d love this? <break time="150ms"/>Let me get Peter...',
      '<break time="150ms"/>This is right up Peter\'s alley. <break time="100ms"/>One sec...',
      '<break time="150ms"/>Peter\'s gonna have thoughts on this. <break time="100ms"/>Let me bring him in...',
    ],
    'maya-santos': [
      '<break time="150ms"/>Maya would be perfect for this! <break time="100ms"/>Hold on...',
      '<break time="150ms"/>Let me get Maya. <break time="100ms"/>She\'s great with this stuff.',
      '<break time="150ms"/>Oh, Maya! <break time="100ms"/>She\'ll love helping with this...',
    ],
    'jordan-taylor': [
      '<emotion value="happy"/><break time="100ms"/>Jordan time! <break time="100ms"/>They\'re going to be SO into this.',
      '<break time="150ms"/>This has Jordan written all over it. <break time="100ms"/>Let me grab them...',
    ],
    'alex-chen': [
      '<break time="150ms"/>Alex would be great here. <break time="100ms"/>One moment...',
      '<break time="150ms"/>Let me get Alex. <break time="100ms"/>Communications is their thing.',
    ],
    'nayan-patel': [
      '<break time="200ms"/>Hmm. <break time="150ms"/>Let me bring in Nayan. <break time="150ms"/>He\'ll have perspective on this.',
      '<break time="200ms"/>Nayan should hear this. <break time="100ms"/>One moment...',
    ],
  },

  // From specialists back to Ferni
  toFerni: {
    'peter-john': [
      '<break time="200ms"/>Let me hand you back to Ferni. <break time="150ms"/>Good thinking today.',
      '<break time="200ms"/>Ferni can take it from here. <break time="150ms"/>Great chat.',
    ],
    'maya-santos': [
      '<break time="200ms"/>I\'ll let Ferni take over. <break time="150ms"/>You\'ve got this!',
      '<break time="200ms"/>Back to Ferni! <break time="150ms"/>Keep up the good work.',
    ],
    'jordan-taylor': [
      '<break time="150ms"/>Handing you back to Ferni! <break time="100ms"/>This was fun!',
      '<break time="150ms"/>Ferni\'s turn! <break time="100ms"/>Great planning session!',
    ],
    'alex-chen': [
      '<break time="150ms"/>I\'ll pass you to Ferni. <break time="100ms"/>Good work today.',
      '<break time="150ms"/>Back to base! <break time="100ms"/>Ferni\'s got you.',
    ],
    'nayan-patel': [
      '<break time="250ms"/>Go back to Ferni now. <break time="200ms"/>Carry this with you.',
      '<break time="250ms"/>Ferni awaits. <break time="200ms"/>Go in peace.',
    ],
  },

  // Between specialists (Guest DJ to Guest DJ!)
  specialistToSpecialist: {
    default: [
      '<break time="150ms"/>Let me bring in a colleague. <break time="100ms"/>They\'ll be great for this.',
      '<break time="150ms"/>I know just who to call. <break time="100ms"/>One moment...',
    ],
  },
};

/**
 * Entrance phrases when a "Guest DJ" arrives
 */
const GUEST_DJ_ENTRANCES = {
  'peter-john': {
    fromFerni: [
      '<break time="200ms"/>Peter here. <break time="150ms"/>Ferni said you had something interesting...',
      '<break time="200ms"/>Hey, Peter jumping in. <break time="150ms"/>What are we thinking about?',
    ],
    fromOther: [
      '<break time="200ms"/>Peter here. <break time="150ms"/>I heard I was needed.',
      '<break time="200ms"/>Hello. <break time="150ms"/>Let\'s dig into this.',
    ],
  },
  'maya-santos': {
    fromFerni: [
      '<break time="200ms"/>Hey! Maya here. <break time="150ms"/>Ferni told me you wanted to talk habits?',
      '<break time="200ms"/>Hi! <break time="150ms"/>I\'m Maya. <break time="150ms"/>Let\'s work on this together.',
    ],
    fromOther: [
      '<break time="200ms"/>Maya here! <break time="150ms"/>Ready to help.',
      '<break time="200ms"/>Hey! <break time="150ms"/>Jumping in. <break time="100ms"/>What\'s the focus?',
    ],
  },
  'jordan-taylor': {
    fromFerni: [
      '<emotion value="happy"/><break time="150ms"/>Jordan here! <break time="100ms"/>I heard we\'re planning something?!',
      '<emotion value="happy"/><break time="150ms"/>Hey hey! <break time="100ms"/>Ferni got me excited. <break time="100ms"/>What are we doing?',
    ],
    fromOther: [
      '<emotion value="happy"/><break time="150ms"/>Jordan in the house! <break time="100ms"/>What\'s happening?',
      '<emotion value="happy"/><break time="150ms"/>It\'s Jordan! <break time="100ms"/>Let\'s make some plans!',
    ],
  },
  'alex-chen': {
    fromFerni: [
      '<break time="150ms"/>Alex here. <break time="100ms"/>Ferni said you needed help with something.',
      '<break time="150ms"/>Hey, Alex jumping in. <break time="100ms"/>What are we working on?',
    ],
    fromOther: [
      '<break time="150ms"/>Alex here. <break time="100ms"/>Let\'s get into it.',
      '<break time="150ms"/>Hi! Alex. <break time="100ms"/>Ready to help.',
    ],
  },
  'nayan-patel': {
    fromFerni: [
      '<break time="300ms"/>Ah, hello. <break time="200ms"/>Ferni mentioned you might benefit from a different perspective.',
      '<break time="300ms"/>Nayan here. <break time="200ms"/>Tell me what\'s on your heart.',
    ],
    fromOther: [
      '<break time="300ms"/>Hello, friend. <break time="200ms"/>I\'m here.',
      '<break time="300ms"/>Nayan. <break time="200ms"/>What wisdom shall we seek today?',
    ],
  },
  ferni: {
    returning: [
      '<break time="200ms"/>Ferni back! <break time="150ms"/>How\'d that go?',
      '<break time="200ms"/>I\'m back! <break time="150ms"/>Good chat with them?',
      '<break time="200ms"/>Hey, me again! <break time="150ms"/>What did you think?',
    ],
  },
};

// ============================================================================
// DJ SESSION SERVICE CLASS
// ============================================================================

class DJSessionService {
  private sessionStartTime: Date | null = null;
  private currentContext: SessionContext | null = null;
  private thinkingMusicTimer: ReturnType<typeof setTimeout> | null = null;
  private isThinkingMusicPlaying = false;
  private sessionTopics: string[] = [];
  private sessionMusicArtists: string[] = [];

  constructor() {
    log.info('🎧 DJ Session Service initialized');
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Start a new session - "Open the show!"
   * Returns the intro to speak and any timing instructions.
   */
  startSession(context: SessionContext): SessionIntro {
    this.sessionStartTime = new Date();
    this.currentContext = context;
    this.sessionTopics = [];
    this.sessionMusicArtists = [];

    log.info('🎧 Starting DJ session', {
      userId: context.userId,
      persona: context.personaId,
      isFirst: context.isFirstSession,
      sessionCount: context.sessionCount,
    });

    // First time ever?
    if (context.isFirstSession) {
      return this.getFirstTimeIntro(context);
    }

    // Has music history? Try a music callback intro!
    if (
      context.musicHistory?.lastPlayedArtist &&
      Math.random() < 0.4 // 40% chance to use music callback
    ) {
      return this.getMusicCallbackIntro(context);
    }

    // Returning user
    return this.getReturningUserIntro(context);
  }

  /**
   * End the session - "Wrap the show!"
   * Returns the outro to speak.
   */
  endSession(context?: Partial<SessionContext>): SessionOutro {
    const sessionDuration = this.sessionStartTime
      ? Date.now() - this.sessionStartTime.getTime()
      : 0;
    const isShortSession = sessionDuration < 60000; // Less than 1 minute

    log.info('🎧 Ending DJ session', {
      duration: Math.round(sessionDuration / 1000),
      topics: this.sessionTopics,
      musicArtists: this.sessionMusicArtists,
    });

    // Stop any thinking music
    void this.stopThinkingMusic();

    const personaId = context?.personaId || this.currentContext?.personaId || 'ferni';

    // Short session - quick goodbye
    if (isShortSession) {
      return {
        phrase: this.randomFrom(SESSION_OUTROS.quick),
        outroType: 'quick',
        playStinger: false,
      };
    }

    // Had music? Music-themed outro!
    if (this.sessionMusicArtists.length > 0 && Math.random() < 0.3) {
      const artist = this.sessionMusicArtists[this.sessionMusicArtists.length - 1];
      return {
        phrase: this.randomFrom(SESSION_OUTROS.musicThemed).replace('{artist}', artist),
        outroType: 'warm',
        playStinger: true,
      };
    }

    // Had meaningful topics? Summarize!
    if (this.sessionTopics.length > 0 && Math.random() < 0.4) {
      const topicSummary = this.sessionTopics.slice(-2).join(' and ');
      return {
        phrase: this.randomFrom(SESSION_OUTROS.withSummary).replace('{topics}', topicSummary),
        sessionSummary: topicSummary,
        outroType: 'warm',
        playStinger: true,
      };
    }

    // Persona-specific outro
    const personaOutros = SESSION_OUTROS.persona[personaId as keyof typeof SESSION_OUTROS.persona];
    if (personaOutros) {
      return {
        phrase: this.randomFrom(personaOutros),
        outroType: 'warm',
        playStinger: true,
      };
    }

    // Default warm outro
    return {
      phrase: this.randomFrom(SESSION_OUTROS.warm),
      outroType: 'warm',
      playStinger: true,
    };
  }

  // ==========================================================================
  // INTRO GENERATORS
  // ==========================================================================

  private getFirstTimeIntro(_context: SessionContext): SessionIntro {
    // Note: context available for future personalization (e.g., userName)
    const phrase = this.randomFrom(SESSION_INTROS.firstTime.phrases);
    const followUp = this.randomFrom(SESSION_INTROS.firstTime.followUp);

    return {
      phrase: `${phrase} <break time="300ms"/>${followUp}`,
      playStinger: true,
      startAmbient: false,
      delayMs: 500, // Let the stinger breathe
      introType: 'first-time',
    };
  }

  private getMusicCallbackIntro(context: SessionContext): SessionIntro {
    const artist = context.musicHistory?.lastPlayedArtist || 'that music';
    const template = this.randomFrom(SESSION_INTROS.musicCallback);
    const phrase = template.replace('{artist}', artist);

    return {
      phrase,
      playStinger: true,
      startAmbient: false,
      delayMs: 400,
      introType: 'callback',
    };
  }

  private getReturningUserIntro(context: SessionContext): SessionIntro {
    // Time-aware intro?
    if (context.timeOfDay && Math.random() < 0.35) {
      const timeIntros = SESSION_INTROS.timeAware[context.timeOfDay];
      if (timeIntros) {
        return {
          phrase: this.randomFrom(timeIntros),
          playStinger: true,
          delayMs: 300,
          introType: 'warm',
        };
      }
    }

    // Weekend special?
    if (context.isWeekend && Math.random() < 0.4) {
      return {
        phrase: this.randomFrom(SESSION_INTROS.timeAware.weekend),
        playStinger: true,
        delayMs: 300,
        introType: 'warm',
      };
    }

    // Named vs unnamed
    if (context.userName) {
      const phrase = this.randomFrom(SESSION_INTROS.returning.withName).replace(
        '{name}',
        context.userName
      );
      return {
        phrase,
        playStinger: true,
        delayMs: 300,
        introType: 'returning',
      };
    }

    return {
      phrase: this.randomFrom(SESSION_INTROS.returning.withoutName),
      playStinger: true,
      delayMs: 300,
      introType: 'returning',
    };
  }

  // ==========================================================================
  // GUEST DJ HANDOFFS
  // ==========================================================================

  /**
   * Get the "let me get my friend" banter when handing off
   */
  getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null {
    // From coach to specialist
    if (isCoach(fromPersonaId)) {
      const banterSet = HANDOFF_BANTER.ferniTo[toPersonaId as keyof typeof HANDOFF_BANTER.ferniTo];
      if (banterSet) {
        return this.randomFrom(banterSet);
      }
    }

    // From specialist back to coach
    if (isCoach(toPersonaId)) {
      const banterSet =
        HANDOFF_BANTER.toFerni[fromPersonaId as keyof typeof HANDOFF_BANTER.toFerni];
      if (banterSet) {
        return this.randomFrom(banterSet);
      }
    }

    // Specialist to specialist
    return this.randomFrom(HANDOFF_BANTER.specialistToSpecialist.default);
  }

  /**
   * Get the "Guest DJ entrance" phrase when arriving after handoff
   */
  getGuestDJEntrance(arrivingPersonaId: string, fromPersonaId: string): string | null {
    const entrances = GUEST_DJ_ENTRANCES[arrivingPersonaId as keyof typeof GUEST_DJ_ENTRANCES];
    if (!entrances) return null;

    // Special case: Coach returning (check literal key for data lookup)
    if (arrivingPersonaId === 'ferni' && 'returning' in entrances) {
      return this.randomFrom(entrances.returning as string[]);
    }

    // Check if coming from coach vs other
    const isFromCoach = isCoach(fromPersonaId);

    if ('fromFerni' in entrances && 'fromOther' in entrances) {
      const phraseSet = isFromCoach
        ? (entrances.fromFerni as string[])
        : (entrances.fromOther as string[]);
      return this.randomFrom(phraseSet);
    }

    return null;
  }

  // ==========================================================================
  // THINKING MUSIC
  // ==========================================================================

  /**
   * Start soft thinking music during processing
   * Call this when the agent is about to do heavy processing
   */
  async startThinkingMusic(): Promise<boolean> {
    if (this.isThinkingMusicPlaying) {
      return false;
    }

    const player = getMusicPlayer();
    if (!player.isInitialized() || player.isPlaying()) {
      return false;
    }

    log.debug('🎧 Starting thinking music');

    // Set very low volume
    player.setVolume(THINKING_MUSIC_CONFIG.volume);

    // Try to play ambient track
    const { playAmbientMusic } = await import('../audio/ambient-music.js');
    const success = await playAmbientMusic();

    if (success) {
      this.isThinkingMusicPlaying = true;

      // Auto-stop after max duration
      this.thinkingMusicTimer = setTimeout(() => {
        void this.stopThinkingMusic();
      }, THINKING_MUSIC_CONFIG.maxDurationMs);
    }

    return success;
  }

  /**
   * Stop thinking music with fade
   */
  async stopThinkingMusic(): Promise<void> {
    if (!this.isThinkingMusicPlaying) {
      return;
    }

    // Clear auto-stop timer
    if (this.thinkingMusicTimer) {
      clearTimeout(this.thinkingMusicTimer);
      this.thinkingMusicTimer = null;
    }

    log.debug('🎧 Stopping thinking music');

    const player = getMusicPlayer();

    // NOTE: BackgroundAudioPlayer doesn't support real-time volume changes,
    // so we can't actually fade. Stop immediately.
    // The frontend shows a smooth visual transition regardless.
    player.stop();
    this.isThinkingMusicPlaying = false;
  }

  // ==========================================================================
  // CROSS-SESSION CALLBACKS
  // ==========================================================================

  /**
   * Get a music callback phrase if user has music history
   */
  getMusicMemoryCallback(personaId: string): string | null {
    if (!this.currentContext?.musicHistory) {
      return null;
    }

    return getCrossSessionMusicCallback(personaId, this.currentContext.musicHistory);
  }

  /**
   * Get a spontaneous music offer based on context
   */
  getSpontaneousOffer(
    personaId: string,
    options: {
      silenceDurationSec?: number;
      recentMood?: string;
      isAfterEmotionalMoment?: boolean;
    }
  ): string | null {
    return getSpontaneousMusicOffer(personaId, {
      ...options,
      timeOfDay: this.currentContext?.timeOfDay,
      hasPlayedMusicThisSession: this.sessionMusicArtists.length > 0,
    });
  }

  /**
   * Get music discovery offer
   */
  getDiscoveryOffer(personaId: string): string {
    return getMusicDiscoveryOffer(personaId);
  }

  /**
   * Get queue teaser ("Wait till you hear what's next!")
   */
  getQueueTeaser(personaId: string): string | null {
    const player = getMusicPlayer();
    const hasQueue = (player.getState().queue?.length || 0) > 0;
    return getQueueTeaser(personaId, hasQueue);
  }

  // ==========================================================================
  // SESSION TRACKING
  // ==========================================================================

  /**
   * Track a topic discussed in this session
   */
  trackTopic(topic: string): void {
    if (topic && !this.sessionTopics.includes(topic)) {
      this.sessionTopics.push(topic);
      log.debug('🎧 Tracked session topic', { topic });
    }
  }

  /**
   * Track music played in this session
   */
  trackMusicPlayed(artist: string): void {
    if (artist && !this.sessionMusicArtists.includes(artist)) {
      this.sessionMusicArtists.push(artist);
      log.debug('🎧 Tracked session music', { artist });
    }
  }

  /**
   * Get session summary for potential callback next time
   */
  getSessionSummary(): {
    topics: string[];
    musicArtists: string[];
    duration: number;
  } {
    return {
      topics: this.sessionTopics,
      musicArtists: this.sessionMusicArtists,
      duration: this.sessionStartTime ? Date.now() - this.sessionStartTime.getTime() : 0,
    };
  }

  // ==========================================================================
  // MUSIC INTEGRATION (Uses dj-service functions)
  // ==========================================================================

  /**
   * Get a music-based conversation starter for the current context
   * Good to call during silences or topic transitions
   */
  getMusicConversationStarterPhrase(): string | null {
    if (!this.currentContext?.personaId) {
      return null;
    }
    return getMusicConversationStarter(this.currentContext.personaId, {});
  }

  /**
   * Get contextual music suggestion based on current conversation
   */
  getContextualMusicSuggestionForTopics(): { suggestion: string; genre: string } | null {
    if (!this.currentContext?.personaId) {
      return null;
    }

    const context = {
      topics: this.sessionTopics,
      isHeavyTopic: this.sessionTopics.some(
        (t) => t.includes('difficult') || t.includes('stress') || t.includes('anxiety')
      ),
      isCelebration: this.sessionTopics.some(
        (t) => t.includes('celebration') || t.includes('success') || t.includes('achievement')
      ),
      needsFocus: this.sessionTopics.some(
        (t) => t.includes('work') || t.includes('focus') || t.includes('study')
      ),
    };

    return getContextualMusicSuggestion(context, this.currentContext.personaId);
  }

  /**
   * Determine appropriate action based on user behavior during music
   * @param musicPlayingForSec - How long music has been playing
   * @param isUserSilent - Is the user currently silent
   * @param isUserTalking - Is the user currently talking
   */
  getReadTheRoomSuggestion(
    musicPlayingForSec: number,
    isUserSilent: boolean,
    isUserTalking: boolean
  ): { action: 'continue' | 'offer_stop' | 'auto_duck' | 'check_in'; phrase?: string } | null {
    if (!this.currentContext?.personaId) {
      return null;
    }

    return getReadTheRoomAction(
      {
        userIsSilentDuringMusic: isUserSilent,
        userIsTalkingDuringMusic: isUserTalking,
        musicHasBeenPlayingFor: musicPlayingForSec,
      },
      this.currentContext.personaId
    );
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Get the current DJ style for the active persona
   */
  getCurrentDJStyle(): DJPersonaStyle | null {
    if (!this.currentContext?.personaId) {
      return null;
    }
    return getDJStyle(this.currentContext.personaId);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let djSessionInstance: DJSessionService | null = null;

export function getDJSessionService(): DJSessionService {
  if (!djSessionInstance) {
    djSessionInstance = new DJSessionService();
  }
  return djSessionInstance;
}

export function resetDJSessionService(): void {
  djSessionInstance = null;
}

export default getDJSessionService;
