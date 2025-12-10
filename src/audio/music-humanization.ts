/**
 * 🎵 Music Humanization System
 *
 * Makes music interactions feel natural, fun, engaging, and deeply human.
 * This module adds the "soul" to our DJ system - the moments that make
 * users feel like they're hanging out with a friend who has great taste.
 *
 * Features:
 * - Music Discovery Conversations (asking about preferences, memories)
 * - Active Engagement Detection (vibing vs wanting to talk)
 * - Music as Emotional Mirror (reflecting feelings through music)
 * - Spontaneous Music Moments (proactive offers)
 * - Time-Aware Vibes (different moods for different times)
 * - Musical Humor & Personality (fun DJ moments)
 * - Post-Music Check-ins ("How was that?")
 * - Music as Conversation Bridge (transitions)
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface MusicHumanizationState {
  /** Last time we offered music */
  lastMusicOfferTime: number | null;
  /** Last time music was played */
  lastMusicPlayTime: number | null;
  /** How long user has been silent during music (ms) */
  silenceDuringMusicMs: number;
  /** Whether user seems to be vibing (enjoying quietly) */
  isVibing: boolean;
  /** Current conversation heaviness (0-1) */
  conversationHeaviness: number;
  /** Conversation duration without music (ms) */
  talkingWithoutMusicMs: number;
  /** Last post-music check-in time */
  lastCheckInTime: number | null;
  /** Number of tracks played this session */
  tracksPlayedThisSession: number;
  /** Topics that came up during music */
  musicMomentTopics: string[];
  /** Whether we've done a music discovery conversation */
  hasAskedAboutMusicTaste: boolean;
}

export interface MusicMoment {
  trackName: string;
  artistName: string;
  topic?: string;
  emotion?: string;
  userQuote?: string;
  timestamp: number;
}

export type TimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';

export interface MusicHumanizationConfig {
  /** Minimum time between music offers (ms) */
  minOfferInterval: number;
  /** Silence threshold to consider user "vibing" (ms) */
  vibingThreshold: number;
  /** Conversation duration before spontaneous offer (ms) */
  spontaneousOfferThreshold: number;
  /** Whether to do post-music check-ins */
  enableCheckIns: boolean;
  /** Probability of fun DJ interjections (0-1) */
  funInterjectionProbability: number;
}

const DEFAULT_CONFIG: MusicHumanizationConfig = {
  minOfferInterval: 5 * 60 * 1000, // 5 minutes
  vibingThreshold: 15 * 1000, // 15 seconds of silence = vibing
  spontaneousOfferThreshold: 8 * 60 * 1000, // 8 minutes of heavy talk
  enableCheckIns: true,
  funInterjectionProbability: 0.15, // 15% chance
};

// ============================================================================
// TIME-AWARE MUSIC VIBES
// ============================================================================

/**
 * Get current time of day for music mood
 */
export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 7) return 'early_morning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 && hour < 24) return 'night';
  return 'late_night'; // 0-5am
}

/**
 * Time-aware music suggestions and vibes
 */
const TIME_VIBES: Record<
  TimeOfDay,
  {
    searchQueries: string[];
    mood: string;
    djStyle: 'energetic' | 'warm' | 'chill' | 'intimate';
    greetingPrefix: string;
  }
> = {
  early_morning: {
    searchQueries: ['gentle morning music', 'peaceful wake up', 'soft acoustic morning'],
    mood: 'gentle awakening',
    djStyle: 'warm',
    greetingPrefix: 'Early bird!',
  },
  morning: {
    searchQueries: ['upbeat morning playlist', 'feel good morning', 'energizing start'],
    mood: 'fresh and ready',
    djStyle: 'energetic',
    greetingPrefix: 'Good morning!',
  },
  afternoon: {
    searchQueries: ['afternoon vibes', 'productive focus', 'midday energy'],
    mood: 'productive and flowing',
    djStyle: 'warm',
    greetingPrefix: 'Hey there!',
  },
  evening: {
    searchQueries: ['evening wind down', 'sunset vibes', 'relaxing evening'],
    mood: 'winding down',
    djStyle: 'chill',
    greetingPrefix: 'Good evening!',
  },
  night: {
    searchQueries: ['night time chill', 'late night vibes', 'mellow night'],
    mood: 'reflective',
    djStyle: 'chill',
    greetingPrefix: 'Hey night owl!',
  },
  late_night: {
    searchQueries: ['late night thoughts', 'ambient night', '3am vibes', 'insomnia playlist'],
    mood: 'intimate and thoughtful',
    djStyle: 'intimate',
    greetingPrefix: "Can't sleep?",
  },
};

/**
 * Get time-aware music suggestion
 */
export function getTimeAwareMusicSuggestion(): {
  searchQuery: string;
  offer: string;
  mood: string;
} {
  const timeOfDay = getTimeOfDay();
  const vibe = TIME_VIBES[timeOfDay];

  const searchQuery = vibe.searchQueries[Math.floor(Math.random() * vibe.searchQueries.length)];

  const offers: Record<TimeOfDay, string[]> = {
    early_morning: [
      "It's early... want some gentle music to ease into the day?",
      'How about some soft music while the world wakes up?',
      'Early morning calls for peaceful sounds. Shall I?',
    ],
    morning: [
      'Want some music to kickstart the day?',
      "Morning energy! Let's get some tunes going?",
      'How about some feel-good music this morning?',
    ],
    afternoon: [
      'Afternoon vibes... want some background music?',
      'Need some tunes to power through the afternoon?',
      'How about some music to keep the momentum going?',
    ],
    evening: [
      "Evening's here... want some music to wind down?",
      'How about some chill music for the evening?',
      'Sunset vibes? I could put something on.',
    ],
    night: [
      'Night owl hours... want some mellow music?',
      'How about some night time vibes?',
      "It's getting late... some chill music?",
    ],
    late_night: [
      '3am thoughts call for 3am music. Want some?',
      "Can't sleep? Let me put on something soothing.",
      'Late night... sometimes music helps. Want me to play something?',
      'These quiet hours... want some company in the form of music?',
    ],
  };

  const offer = offers[timeOfDay][Math.floor(Math.random() * offers[timeOfDay].length)];

  return { searchQuery, offer, mood: vibe.mood };
}

// ============================================================================
// MUSIC DISCOVERY CONVERSATIONS
// ============================================================================

/**
 * Questions to learn about user's music taste
 * These should feel like natural conversation, not an interview
 */
const MUSIC_DISCOVERY_QUESTIONS: Array<{
  question: string;
  context: string; // When to ask this
  followUp?: string;
}> = [
  {
    question: 'What kind of music do you usually listen to?',
    context: 'general',
    followUp: "Nice! I'll keep that in mind.",
  },
  {
    question: 'Do you have a song that always puts you in a good mood?',
    context: 'positive_emotion',
    followUp: "I love that. Music has such power, doesn't it?",
  },
  {
    question: 'Is there a song that takes you back to a specific memory?',
    context: 'nostalgic_moment',
    followUp: "Music and memory are so connected. That's beautiful.",
  },
  {
    question: "What's the last concert or live music you experienced?",
    context: 'general',
    followUp: "There's something special about live music.",
  },
  {
    question: 'Do you have a go-to artist when you need to decompress?',
    context: 'stressed',
    followUp: "Good to know. I'll remember that.",
  },
  {
    question: 'What music did you grow up listening to?',
    context: 'deep_conversation',
    followUp: 'Those early musical memories really shape us.',
  },
  {
    question: "Is there a song that you've had on repeat lately?",
    context: 'general',
    followUp: 'I love when a song just gets you like that.',
  },
  {
    question: 'Do you discover music through playlists, recommendations, or...?',
    context: 'general',
    followUp: 'Interesting! Everyone finds their music differently.',
  },
  {
    question: "What's a guilty pleasure song you secretly love?",
    context: 'playful_moment',
    followUp: 'Ha! No judgment here. Those songs exist for a reason.',
  },
  {
    question: 'Is there an artist you wish more people knew about?',
    context: 'general',
    followUp: "I'll check them out. Thanks for the rec!",
  },
];

/**
 * Get a music discovery question based on context
 */
export function getMusicDiscoveryQuestion(
  context:
    | 'general'
    | 'positive_emotion'
    | 'stressed'
    | 'nostalgic_moment'
    | 'deep_conversation'
    | 'playful_moment'
): { question: string; followUp: string } | null {
  const matchingQuestions = MUSIC_DISCOVERY_QUESTIONS.filter(
    (q) => q.context === context || q.context === 'general'
  );

  if (matchingQuestions.length === 0) return null;

  const selected = matchingQuestions[Math.floor(Math.random() * matchingQuestions.length)];
  return {
    question: selected.question,
    followUp: selected.followUp || "That's cool!",
  };
}

// ============================================================================
// ACTIVE ENGAGEMENT DETECTION
// ============================================================================

/**
 * Signals that suggest user is vibing (enjoying music quietly)
 */
const VIBING_SIGNALS = {
  /** Short positive sounds */
  positiveUtterances: ['mmm', 'mm', 'mhm', 'yeah', 'nice', 'ooh', 'ah'],
  /** Minimum silence to consider vibing (ms) */
  silenceThreshold: 10000,
  /** Maximum words before breaking vibe */
  maxWordsWhileVibing: 3,
};

/**
 * Analyze if user is vibing to the music
 * Returns confidence 0-1
 */
export function analyzeVibingBehavior(params: {
  silenceDurationMs: number;
  recentUtterance?: string;
  wasShortResponse: boolean;
}): { isVibing: boolean; confidence: number; reason: string } {
  const { silenceDurationMs, recentUtterance, wasShortResponse } = params;

  // Long silence during music = likely vibing
  if (silenceDurationMs > VIBING_SIGNALS.silenceThreshold) {
    return {
      isVibing: true,
      confidence: Math.min(silenceDurationMs / 30000, 0.9), // Max 90% confidence
      reason: 'enjoying_quietly',
    };
  }

  // Short positive sound = vibing
  if (recentUtterance) {
    const normalized = recentUtterance.toLowerCase().trim();
    if (VIBING_SIGNALS.positiveUtterances.some((u) => normalized.includes(u))) {
      return {
        isVibing: true,
        confidence: 0.7,
        reason: 'positive_sound',
      };
    }
  }

  // Very short response = probably still vibing
  if (wasShortResponse && recentUtterance && recentUtterance.split(' ').length <= 3) {
    return {
      isVibing: true,
      confidence: 0.5,
      reason: 'brief_acknowledgment',
    };
  }

  return {
    isVibing: false,
    confidence: 0.3,
    reason: 'engaged_in_conversation',
  };
}

/**
 * Decide whether to interrupt music for conversation
 */
export function shouldInterruptMusic(params: {
  isVibing: boolean;
  userStartedTalking: boolean;
  userAskedQuestion: boolean;
  urgentTopic: boolean;
}): { shouldInterrupt: boolean; action: 'duck' | 'stop' | 'none' } {
  const { isVibing, userStartedTalking, userAskedQuestion, urgentTopic } = params;

  // Urgent topic always interrupts
  if (urgentTopic) {
    return { shouldInterrupt: true, action: 'stop' };
  }

  // User asked a question - duck but don't stop
  if (userAskedQuestion) {
    return { shouldInterrupt: true, action: 'duck' };
  }

  // User started extended talking - duck
  if (userStartedTalking && !isVibing) {
    return { shouldInterrupt: true, action: 'duck' };
  }

  // User is vibing - don't interrupt
  if (isVibing) {
    return { shouldInterrupt: false, action: 'none' };
  }

  return { shouldInterrupt: false, action: 'none' };
}

// ============================================================================
// MUSIC AS EMOTIONAL MIRROR
// ============================================================================

/**
 * Emotional mirroring phrases - offering music that matches the feeling
 */
const EMOTIONAL_MIRROR_OFFERS: Record<string, string[]> = {
  sad: [
    'I hear that in your voice. Want me to put on something that matches that feeling? Sometimes it helps to just... sit in it for a moment.',
    'That sounds heavy. Want some music that gets it? No pressure to feel different.',
    'Sometimes the best thing is music that understands. Want me to find something?',
  ],
  grief: [
    "I'm here with you. Want me to put on something gentle? We can just... be together with it.",
    "There's music for these moments. Want me to play something?",
    'No words needed. Want some music instead?',
  ],
  anxious: [
    'Your mind sounds busy. Want something to help ground you?',
    'Let me put on something calming. Just breathe.',
    'How about some music to help settle those thoughts?',
  ],
  stressed: [
    "That's a lot. Want a musical break? Just a few minutes to breathe.",
    'Your plate is full. How about some decompression music?',
    'Sometimes we need to step back. Want some stress-relief sounds?',
  ],
  happy: [
    'I love this energy! This moment needs a soundtrack!',
    'Your joy is contagious! Want some music to match?',
    'This calls for a celebration song!',
  ],
  excited: [
    "Yes! Let's match this energy with some music!",
    'This excitement needs a beat! Want some hype music?',
    'I can feel the energy! Let me find something!',
  ],
  proud: [
    'You should be proud! This moment deserves a victory song.',
    "That's huge! Want some music to celebrate?",
    'Achievement unlocked! Let me put on something triumphant.',
  ],
  nostalgic: [
    "That's a beautiful memory. Want me to find music from that era?",
    'Nostalgia hits different. Want some music to match?',
    "Those memories deserve a soundtrack. Any era you're thinking of?",
  ],
  peaceful: [
    "This is nice, isn't it? Want some ambient music to hold this moment?",
    "Let's keep this peaceful feeling going with some gentle music.",
    'How about some music to match this calm?',
  ],
  frustrated: [
    "That's frustrating. Want some music to channel that energy?",
    'Sometimes you need music that matches the fire. Want something with edge?',
    "Let it out through music? I've got some options.",
  ],
  lonely: [
    "You're not alone right now. Want me to put on some music? I'm here.",
    'Music can be good company. Want some?',
    "Let's fill this space with some sound. What mood?",
  ],
};

/**
 * Get an emotional mirroring music offer
 */
export function getEmotionalMirrorOffer(emotion: string): string | null {
  const normalizedEmotion = emotion.toLowerCase();

  // Direct match
  if (EMOTIONAL_MIRROR_OFFERS[normalizedEmotion]) {
    const offers = EMOTIONAL_MIRROR_OFFERS[normalizedEmotion];
    return offers[Math.floor(Math.random() * offers.length)];
  }

  // Map similar emotions
  const emotionMap: Record<string, string> = {
    depressed: 'sad',
    melancholy: 'sad',
    down: 'sad',
    worried: 'anxious',
    nervous: 'anxious',
    overwhelmed: 'stressed',
    burned_out: 'stressed',
    joyful: 'happy',
    elated: 'happy',
    thrilled: 'excited',
    pumped: 'excited',
    angry: 'frustrated',
    annoyed: 'frustrated',
    calm: 'peaceful',
    content: 'peaceful',
    isolated: 'lonely',
    alone: 'lonely',
    wistful: 'nostalgic',
    reminiscing: 'nostalgic',
    accomplished: 'proud',
    successful: 'proud',
  };

  const mappedEmotion = emotionMap[normalizedEmotion];
  if (mappedEmotion && EMOTIONAL_MIRROR_OFFERS[mappedEmotion]) {
    const offers = EMOTIONAL_MIRROR_OFFERS[mappedEmotion];
    return offers[Math.floor(Math.random() * offers.length)];
  }

  return null;
}

// ============================================================================
// SPONTANEOUS MUSIC MOMENTS
// ============================================================================

/**
 * Triggers for spontaneous music offers
 */
export interface SpontaneousTrigger {
  type: 'heavy_conversation' | 'long_session' | 'energy_shift' | 'awkward_silence' | 'celebration';
  offer: string;
  searchQuery?: string;
}

/**
 * Check if it's time for a spontaneous music offer
 */
export function checkSpontaneousMusicMoment(params: {
  conversationDurationMs: number;
  timeSinceLastMusicMs: number;
  recentTopics: string[];
  emotionalIntensity: number; // 0-1
  isAwkwardSilence: boolean;
  recentAchievement: boolean;
}): SpontaneousTrigger | null {
  const {
    conversationDurationMs,
    timeSinceLastMusicMs,
    recentTopics,
    emotionalIntensity,
    isAwkwardSilence,
    recentAchievement,
  } = params;

  // Don't offer too frequently
  if (timeSinceLastMusicMs < 5 * 60 * 1000) {
    return null;
  }

  // Celebration moment
  if (recentAchievement) {
    return {
      type: 'celebration',
      offer: 'This calls for a celebration! Want some music?',
      searchQuery: 'celebration victory music',
    };
  }

  // Heavy conversation - need a break
  const heavyTopics = ['loss', 'grief', 'death', 'divorce', 'trauma', 'anxiety', 'depression'];
  const hasHeavyTopic = recentTopics.some((t) =>
    heavyTopics.some((h) => t.toLowerCase().includes(h))
  );

  if (hasHeavyTopic && conversationDurationMs > 10 * 60 * 1000 && emotionalIntensity > 0.6) {
    return {
      type: 'heavy_conversation',
      offer: "We've been going deep. Want to take a music break? Just a moment to breathe.",
      searchQuery: 'calming peaceful music',
    };
  }

  // Long session without music
  if (conversationDurationMs > 20 * 60 * 1000 && timeSinceLastMusicMs > 15 * 60 * 1000) {
    return {
      type: 'long_session',
      offer: "You know what? We've been talking for a while. Want some background music?",
    };
  }

  // Awkward silence - fill with offer
  if (isAwkwardSilence) {
    return {
      type: 'awkward_silence',
      offer: 'How about some music while we hang out?',
    };
  }

  return null;
}

// ============================================================================
// MUSICAL HUMOR & PERSONALITY
// ============================================================================

/**
 * Fun DJ interjections that show personality
 * These should be used sparingly (15% chance or less)
 */
const FUN_DJ_INTERJECTIONS: Record<string, string[]> = {
  track_start: [
    "Okay confession: I've had this on repeat all day. It's just too good.",
    "This one? *chef's kiss*",
    'Fun fact: I was just thinking about this song.',
    "Ooh I love this one. No pressure but... it's a vibe.",
  ],
  mid_song: [
    'Right? RIGHT?',
    'This part. Every time.',
    "I'm not saying this is perfect but... it's perfect.",
    "If you're not vibing right now, I don't know what to tell you.",
  ],
  track_end: [
    'That was... *sighs* that was good.',
    'Okay I might be biased but that was great.',
    'Did that hit? I feel like that hit.',
    'And THAT is how you do it.',
  ],
  user_liked: [
    "YES! I knew you'd like this one!",
    'Good taste. I approve.',
    'See? I know things.',
    "This is why we're friends.",
  ],
  user_skipped: [
    'Fair enough. Not every song is for everyone.',
    'Okay okay, moving on!',
    "I mean... I liked it. But that's okay!",
    "Noted. Won't play that one again.",
  ],
};

/**
 * Get a fun DJ interjection
 */
export function getFunInterjection(
  moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped',
  probability = 0.15
): string | null {
  // Only trigger some of the time
  if (Math.random() > probability) {
    return null;
  }

  const interjections = FUN_DJ_INTERJECTIONS[moment];
  if (!interjections || interjections.length === 0) {
    return null;
  }

  return interjections[Math.floor(Math.random() * interjections.length)];
}

/**
 * Persona-specific fun DJ moments
 */
const PERSONA_FUN_MOMENTS: Record<string, string[]> = {
  ferni: [
    'Between us? This song is a 10/10.',
    "I don't say this about every song but... this one.",
    "Okay I might play this one a lot. Don't judge.",
  ],
  jack: [
    'Ha! Classic. Gets me every time.',
    'This one takes me back.',
    "Now THIS is what I'm talking about.",
  ],
  maya: [
    'Okay but the beat in this one though?',
    'This song just... gets it, you know?',
    'I could listen to this all day. And I have.',
  ],
  jordan: [
    'BOP ALERT! This is a BOP!',
    "I'm physically incapable of not vibing to this.",
    "This song makes me want to dance and I'm not sorry.",
  ],
  alex: [
    'This is objectively excellent music.',
    'A well-structured composition.',
    'I appreciate the craftsmanship here.',
  ],
  peter: [
    'Interesting sonic texture on this one.',
    'The production quality here is notable.',
    'This has good algorithmic appeal.',
  ],
};

/**
 * Get persona-specific fun moment
 */
export function getPersonaFunMoment(personaId: string): string | null {
  const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
  const matchingKey = Object.keys(PERSONA_FUN_MOMENTS).find((key) => normalizedId.includes(key));

  const moments = PERSONA_FUN_MOMENTS[matchingKey || 'ferni'];
  return moments[Math.floor(Math.random() * moments.length)];
}

// ============================================================================
// POST-MUSIC CHECK-INS
// ============================================================================

/**
 * Check-in phrases after music ends
 */
const POST_MUSIC_CHECK_INS: string[] = [
  'How was that?',
  'Did that hit the spot?',
  'Good choice?',
  'Feel any different after that?',
  "What'd you think?",
  'That was nice, right?',
  'How are you feeling now?',
  'Did that help?',
];

/**
 * Persona-specific post-music check-ins
 */
const PERSONA_CHECK_INS: Record<string, string[]> = {
  ferni: ['How was that? Did it help?', 'Feel any different?', 'That was nice. How are you?'],
  jack: [
    'Good stuff. How you feeling?',
    'That hit different, right?',
    "Music does something, doesn't it? How you doing?",
  ],
  maya: ["So? What'd you think?", 'Good vibes? I thought so.', "How's that energy now?"],
  jordan: [
    'That was fun! How you feeling?',
    'Good pick, right? RIGHT?',
    'Did that put you in a good mood?',
  ],
  alex: [
    'How was that selection?',
    'Did that meet your expectations?',
    'Shall we continue or change direction?',
  ],
  peter: [
    'How did that resonate with you?',
    'Was that the right mood?',
    'Feedback noted. How are you feeling?',
  ],
};

/**
 * Get a post-music check-in phrase
 */
export function getPostMusicCheckIn(personaId?: string, wasRequested = true): string {
  // Don't always check in - 60% of the time for requested music, 30% for ambient
  const checkInProbability = wasRequested ? 0.6 : 0.3;
  if (Math.random() > checkInProbability) {
    // Return a simple transition instead
    return "So... what's on your mind?";
  }

  if (personaId) {
    const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
    const matchingKey = Object.keys(PERSONA_CHECK_INS).find((key) => normalizedId.includes(key));

    if (matchingKey) {
      const checkIns = PERSONA_CHECK_INS[matchingKey];
      return checkIns[Math.floor(Math.random() * checkIns.length)];
    }
  }

  return POST_MUSIC_CHECK_INS[Math.floor(Math.random() * POST_MUSIC_CHECK_INS.length)];
}

// ============================================================================
// MUSIC AS CONVERSATION BRIDGE
// ============================================================================

/**
 * Use music to transition between conversation modes
 */
const CONVERSATION_BRIDGES: Record<string, string[]> = {
  heavy_to_light: [
    'That was a lot. Want to just... listen to something for a minute? We can come back to it, or not.',
    "Let's take a breath. How about some music while we process that?",
    "Sometimes words aren't the thing. Want some music instead?",
  ],
  light_to_deep: [
    'You know, this song always makes me think about growth. What does it bring up for you?',
    "Music has a way of opening things up. What's really on your mind?",
    'While this plays... how are you really doing?',
  ],
  closure: [
    'That felt like a good place to pause. Want some music to close that chapter?',
    'We covered a lot. How about some music to let it settle?',
    "Good talk. Let's seal it with a song?",
  ],
  opening: [
    'Before we dive in... want some music to set the tone?',
    "Let's ease into this with some background music.",
    'How about some tunes while we figure out where to start?',
  ],
};

/**
 * Get a conversation bridge phrase
 */
export function getConversationBridge(
  bridgeType: 'heavy_to_light' | 'light_to_deep' | 'closure' | 'opening'
): string {
  const bridges = CONVERSATION_BRIDGES[bridgeType];
  return bridges[Math.floor(Math.random() * bridges.length)];
}

/**
 * Music-triggered conversation starters
 */
const MUSIC_CONVERSATION_STARTERS: string[] = [
  "This song makes me curious... what's been on your mind lately?",
  "While this plays... anything you've been wanting to talk about?",
  'The mood feels right... how are you really doing?',
  "This music hits different when you've got something on your mind. Do you?",
  "Let's just sit with this for a moment... unless there's something you want to share?",
];

/**
 * Get a music-triggered conversation starter
 */
export function getMusicConversationStarter(): string {
  return MUSIC_CONVERSATION_STARTERS[
    Math.floor(Math.random() * MUSIC_CONVERSATION_STARTERS.length)
  ];
}

// ============================================================================
// MUSIC HUMANIZATION CONTROLLER
// ============================================================================

/**
 * Main controller for music humanization
 */
export class MusicHumanizationController {
  private state: MusicHumanizationState;
  private config: MusicHumanizationConfig;
  private personaId = 'ferni';
  private musicMoments: MusicMoment[] = [];

  constructor(config: Partial<MusicHumanizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      lastMusicOfferTime: null,
      lastMusicPlayTime: null,
      silenceDuringMusicMs: 0,
      isVibing: false,
      conversationHeaviness: 0,
      talkingWithoutMusicMs: 0,
      lastCheckInTime: null,
      tracksPlayedThisSession: 0,
      musicMomentTopics: [],
      hasAskedAboutMusicTaste: false,
    };

    log.info('🎵 Music Humanization Controller initialized');
  }

  /**
   * Set persona for personalized interactions
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Record that music started playing
   */
  onMusicStarted(trackName: string, artistName: string): void {
    this.state.lastMusicPlayTime = Date.now();
    this.state.tracksPlayedThisSession++;
    this.state.silenceDuringMusicMs = 0;
    this.state.isVibing = false;

    log.debug('🎵 Music started', { trackName, artistName });
  }

  /**
   * Record that music stopped
   */
  onMusicStopped(trackName: string, artistName: string, topic?: string): void {
    // Save this as a music moment
    this.musicMoments.push({
      trackName,
      artistName,
      topic,
      timestamp: Date.now(),
    });

    // Keep only last 10 moments
    if (this.musicMoments.length > 10) {
      this.musicMoments.shift();
    }
  }

  /**
   * Update silence duration during music
   */
  updateSilenceDuringMusic(durationMs: number): void {
    this.state.silenceDuringMusicMs = durationMs;

    // Check if user is vibing
    const analysis = analyzeVibingBehavior({
      silenceDurationMs: durationMs,
      wasShortResponse: false,
    });

    this.state.isVibing = analysis.isVibing;
  }

  /**
   * Check if we should offer music
   */
  shouldOfferMusic(params: {
    conversationDurationMs: number;
    recentTopics: string[];
    emotionalIntensity: number;
    isAwkwardSilence: boolean;
    recentAchievement: boolean;
  }): SpontaneousTrigger | null {
    const timeSinceLastMusic = this.state.lastMusicPlayTime
      ? Date.now() - this.state.lastMusicPlayTime
      : Infinity;

    return checkSpontaneousMusicMoment({
      ...params,
      timeSinceLastMusicMs: timeSinceLastMusic,
    });
  }

  /**
   * Get time-aware music suggestion
   */
  getTimeAwareSuggestion(): { searchQuery: string; offer: string; mood: string } {
    return getTimeAwareMusicSuggestion();
  }

  /**
   * Get emotional mirror offer
   */
  getEmotionalOffer(emotion: string): string | null {
    return getEmotionalMirrorOffer(emotion);
  }

  /**
   * Get music discovery question
   */
  getMusicDiscoveryQuestion(
    context:
      | 'general'
      | 'positive_emotion'
      | 'stressed'
      | 'nostalgic_moment'
      | 'deep_conversation'
      | 'playful_moment'
  ): { question: string; followUp: string } | null {
    // Only ask if we haven't asked recently
    if (this.state.hasAskedAboutMusicTaste) {
      return null;
    }

    const result = getMusicDiscoveryQuestion(context);
    if (result) {
      this.state.hasAskedAboutMusicTaste = true;
    }
    return result;
  }

  /**
   * Get post-music check-in
   */
  getCheckIn(wasRequested: boolean): string {
    if (!this.config.enableCheckIns) {
      return "So... what's on your mind?";
    }

    // Don't check in too frequently
    if (this.state.lastCheckInTime && Date.now() - this.state.lastCheckInTime < 5 * 60 * 1000) {
      return "What's next?";
    }

    this.state.lastCheckInTime = Date.now();
    return getPostMusicCheckIn(this.personaId, wasRequested);
  }

  /**
   * Get fun interjection (if lucky!)
   */
  getFunInterjection(
    moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped'
  ): string | null {
    return getFunInterjection(moment, this.config.funInterjectionProbability);
  }

  /**
   * Get persona-specific fun moment
   */
  getPersonaFunMoment(): string | null {
    return getPersonaFunMoment(this.personaId);
  }

  /**
   * Get conversation bridge
   */
  getConversationBridge(
    bridgeType: 'heavy_to_light' | 'light_to_deep' | 'closure' | 'opening'
  ): string {
    return getConversationBridge(bridgeType);
  }

  /**
   * Check if user is vibing
   */
  isUserVibing(): boolean {
    return this.state.isVibing;
  }

  /**
   * Get recent music moments for callbacks
   */
  getRecentMoments(): MusicMoment[] {
    return [...this.musicMoments];
  }

  /**
   * Get session stats
   */
  getSessionStats(): {
    tracksPlayed: number;
    hasAskedAboutMusic: boolean;
    recentMoments: number;
  } {
    return {
      tracksPlayed: this.state.tracksPlayedThisSession,
      hasAskedAboutMusic: this.state.hasAskedAboutMusicTaste,
      recentMoments: this.musicMoments.length,
    };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.state = {
      lastMusicOfferTime: null,
      lastMusicPlayTime: null,
      silenceDuringMusicMs: 0,
      isVibing: false,
      conversationHeaviness: 0,
      talkingWithoutMusicMs: 0,
      lastCheckInTime: null,
      tracksPlayedThisSession: 0,
      musicMomentTopics: [],
      hasAskedAboutMusicTaste: false,
    };
    this.musicMoments = [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: MusicHumanizationController | null = null;

export function getMusicHumanization(): MusicHumanizationController {
  if (!instance) {
    instance = new MusicHumanizationController();
  }
  return instance;
}

export function resetMusicHumanization(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default {
  MusicHumanizationController,
  getMusicHumanization,
  resetMusicHumanization,
  getTimeAwareMusicSuggestion,
  getMusicDiscoveryQuestion,
  analyzeVibingBehavior,
  shouldInterruptMusic,
  getEmotionalMirrorOffer,
  checkSpontaneousMusicMoment,
  getFunInterjection,
  getPersonaFunMoment,
  getPostMusicCheckIn,
  getConversationBridge,
  getMusicConversationStarter,
  getTimeOfDay,
};
