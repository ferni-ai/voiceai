/**
 * Meaningful Silence System
 *
 * When the user pauses, don't just say "Still there?"
 * Make those quiet moments feel like genuine human connection.
 *
 * The silence becomes an opportunity to:
 * - Reference something meaningful they shared
 * - Offer a relevant memory or story snippet
 * - Ask a thoughtful follow-up question
 * - Share a tiny, human micro-story
 * - Offer to play some music while they think
 * - Use gentle humor (for appropriate personas)
 * - Acknowledge the time of day
 * - Simply sit with them in comfortable quiet
 *
 * This transforms awkward silence into relationship building.
 */

import {
  playAmbientMusic as playAmbient,
  stopAmbientMusic as stopAmbient,
} from '../audio/ambient-music.js';
import { getMusicPlayer } from '../audio/index.js';
import { getMusicConversationStarter, getSpontaneousMusicOffer } from '../services/dj-service.js';
import type { PersonaConfig, StoryConfig } from './types.js';
import { getCanonicalPersonaId } from './voice-registry.js';
// Dynamic question generation - Better than Human approach
import {
  generateQuestion,
  type QuestionContext,
  type GeneratedQuestion,
} from '../intelligence/dynamic-questions.js';
// Coaching-level questions - memory-grounded, pattern-surfacing, anticipatory
import {
  getCoachingQuestion,
  detectPatterns,
  generateMirror,
  getAnticipatoryQuestion,
} from '../intelligence/coaching-questions.js';
import { getLogger } from '../utils/safe-logger.js';
// Dynamic persona content loading
import {
  loadSilenceResponses,
  type SilenceResponses,
} from '../services/persona-content-loader.js';
// Trait-based dynamic responses (usage-tracked, avoids repetition)
import {
  getDynamicSilenceResponseByPersonaId,
  PERSONA_TRAIT_PROFILES,
} from './dynamic-responses.js';

const log = getLogger();

// ============================================================================
// DYNAMIC CONTENT CACHE
// ============================================================================

/** Cache for loaded silence responses per persona */
const silenceContentCache = new Map<string, SilenceResponses | null>();

/**
 * Load silence responses for a persona with caching
 * Falls back to hardcoded content if loading fails
 */
async function getSilenceContent(personaId: string): Promise<SilenceResponses | null> {
  const canonicalId = getCanonicalPersonaId(personaId);

  // Check cache first
  if (silenceContentCache.has(canonicalId)) {
    return silenceContentCache.get(canonicalId) || null;
  }

  try {
    const content = await loadSilenceResponses(canonicalId);
    silenceContentCache.set(canonicalId, content);
    if (content) {
      log.debug({ personaId: canonicalId }, 'Loaded dynamic silence content');
    }
    return content;
  } catch (error) {
    log.warn({ error: String(error), personaId: canonicalId }, 'Failed to load silence content');
    silenceContentCache.set(canonicalId, null);
    return null;
  }
}

/**
 * Get a random item from an array with fallback
 */
function randomFromDynamic<T>(arr: T[] | undefined, fallback: T[]): T {
  const source = arr && arr.length > 0 ? arr : fallback;
  return source[Math.floor(Math.random() * source.length)];
}

// ============================================================================
// TYPES
// ============================================================================

export interface SilenceContext {
  /** How many seconds of silence */
  silenceDurationSeconds: number;
  /** Turn count in the conversation */
  turnCount: number;
  /** Topics discussed this session */
  topicsDiscussed: string[];
  /** Last thing the user said (to reference back) */
  lastUserMessage?: string;
  /** Last thing the agent said */
  lastAgentMessage?: string;
  /** Emotional tone of recent conversation */
  recentEmotionalTone?: 'heavy' | 'light' | 'neutral';
  /** User's name if known */
  userName?: string;
  /** Were we in the middle of something? */
  wasDiscussingTopic?: string;
  /** Key moments or details the user shared */
  memorableMoments?: string[];
  /** Current hour (0-23) for time-aware responses */
  currentHour?: number;
  /** Is it a weekend? */
  isWeekend?: boolean;
  /** How many silence responses have we already given? */
  silenceResponseCount?: number;
  /** 🎮 Is a game currently active? If so, silence means "thinking" not "disengaged" */
  isGameActive?: boolean;
  /** 🎮 What game type is active? */
  activeGameType?: string;
  /** Session ID for usage tracking (avoids repetition) */
  sessionId?: string;
  /** 🎵 Is music currently playing? */
  isMusicPlaying?: boolean;
}

export type SilenceResponseType =
  | 'comfortable_presence' // Just let them know you're here
  | 'memory_callback' // Reference something they shared
  | 'story_offering' // Offer to share a relevant story
  | 'micro_story' // Share a tiny, human moment (1-2 sentences)
  | 'thoughtful_question' // Ask something meaningful
  | 'music_offering' // Offer to play some music
  | 'music_conversation' // Start a conversation about music taste
  | 'game_suggestion' // Suggest a fun music game
  | 'gentle_observation' // Share an observation about life
  | 'gentle_humor' // Light humor (persona-appropriate)
  | 'time_aware' // Acknowledge the time of day
  | 'topic_specific' // Response related to what they were discussing
  | 'warm_check_in'; // Genuine "how are you" energy

export interface SilenceResponse {
  type: SilenceResponseType;
  text: string;
  /** Whether this response invites a reply or just offers presence */
  invitesReply: boolean;
}

// ============================================================================
// MEANINGFUL SILENCE RESPONSES BY TYPE
// ============================================================================

/**
 * Comfortable presence - just letting them know you're here
 * Good for: Heavy topics, early silence, when they might need space
 */
const COMFORTABLE_PRESENCE = {
  general: [
    '<emotion value="affectionate"/><break time="400ms"/>I\'m here. <break time="300ms"/>No rush.',
    '<emotion value="affectionate"/><break time="400ms"/>Take your time. <break time="200ms"/>I\'m not going anywhere.',
    '<emotion value="affectionate"/><break time="300ms"/>Still here with you.',
    '<break time="400ms"/>Whenever you\'re ready.',
    '<emotion value="affectionate"/><break time="400ms"/>I\'m listening. <break time="200ms"/>Even the silence.',
  ],
  afterHeavyTopic: [
    '<emotion value="affectionate"/><break time="500ms"/>That was a lot to share. <break time="300ms"/>Take all the time you need.',
    '<emotion value="affectionate"/><break time="400ms"/>I hear you. <break time="300ms"/>Sometimes you just need to sit with it.',
    '<emotion value="affectionate"/><break time="500ms"/>It\'s okay. <break time="300ms"/>We don\'t have to talk.',
    '<emotion value="affectionate"/><break time="400ms"/>Thank you for trusting me with that. <break time="300ms"/>No pressure to say anything else.',
  ],
  late_conversation: [
    '<emotion value="affectionate"/><break time="400ms"/>You know, I\'ve enjoyed this. <break time="200ms"/>Take your time.',
    '<emotion value="affectionate"/><break time="300ms"/>Been a good conversation. <break time="200ms"/>No need to rush.',
    '<emotion value="affectionate"/><break time="400ms"/>Just sitting here with you. <break time="200ms"/>Nice.',
  ],
};

/**
 * Memory callbacks - reference something they shared earlier
 * Makes them feel truly heard and remembered
 */
const MEMORY_CALLBACK_TEMPLATES = [
  'You know, <break time="200ms"/>I keep thinking about what you said about {topic}. <break time="300ms"/>Tell me more about that when you\'re ready.',
  '<break time="400ms"/>Earlier you mentioned {topic}. <break time="300ms"/>I\'d love to hear more about that.',
  'I\'m curious—<break time="200ms"/>you brought up {topic} before. <break time="300ms"/>What\'s the story there?',
  '<break time="300ms"/>Something you said stuck with me—<break time="200ms"/>about {topic}. <break time="300ms"/>I want to understand better.',
  'Going back to {topic}... <break time="300ms"/>I feel like there\'s more there. <break time="200ms"/>Only if you want to share.',
];

/**
 * Thoughtful questions - not generic, but genuinely curious
 * Based on what they've shared
 */
const THOUGHTFUL_QUESTIONS = {
  family: [
    '<break time="400ms"/>Your family sounds important to you. <break time="300ms"/>What\'s one thing you wish more people knew about them?',
    'You mentioned family earlier. <break time="300ms"/>Who\'s the person you talk to when things get hard?',
    '<break time="300ms"/>Tell me about someone who believed in you. <break time="200ms"/>Even when you didn\'t believe in yourself.',
  ],
  work: [
    '<break time="400ms"/>What got you into this work in the first place? <break time="300ms"/>There\'s always a story.',
    'You\'ve been thinking about work a lot. <break time="300ms"/>What would you do if money wasn\'t a factor?',
    '<break time="400ms"/>What\'s one thing you\'re proud of that nobody knows about?',
  ],
  money: [
    '<break time="400ms"/>Money conversations can be heavy. <break time="300ms"/>What\'s your earliest memory with money?',
    'Curious—<break time="200ms"/>what did you learn about money growing up? <break time="300ms"/>Good or bad.',
    '<break time="300ms"/>If you could give your younger self one piece of financial advice, <break time="200ms"/>what would it be?',
  ],
  general: [
    "<break time=\"400ms\"/>What's something you've been meaning to do but haven't gotten to yet?",
    'Here\'s a question—<break time="200ms"/>what\'s making you happy lately? <break time="300ms"/>Small or big.',
    '<break time="400ms"/>What are you looking forward to? <break time="300ms"/>Even if it\'s just the weekend.',
    'I\'m curious—<break time="200ms"/>what\'s the best advice anyone ever gave you?',
    '<break time="300ms"/>If you could have dinner with anyone, living or not, <break time="200ms"/>who would it be?',
  ],
};

/**
 * Gentle observations - persona sharing something human
 * Creates a moment of connection through vulnerability
 */
const GENTLE_OBSERVATIONS = {
  jackBogle: [
    '<break time="500ms"/>You know, I\'ve been at this a long time. <break time="300ms"/>The silences are where the real thinking happens.',
    '<break time="400ms"/>Eve used to say I think too much. <break time="300ms"/>But thinking is how I make sense of things.',
    '<break time="500ms"/>Some of my best decisions came after long silences. <break time="300ms"/>The worst ones came from rushing.',
    '<break time="400ms"/>At my age, you learn to appreciate a quiet moment. <break time="300ms"/>Not everything needs words.',
  ],
  peterLynch: [
    '<break time="400ms"/>You know what? <break time="200ms"/>Some of my best stock ideas came to me in quiet moments. <break time="300ms"/>Just walking around, thinking.',
    '<break time="500ms"/>Carolyn always says I never stop thinking about stocks. <break time="200ms"/>She\'s not wrong. <break time="300ms"/>What are YOU thinking about?',
    '<break time="400ms"/>Hey, you know what I love? <break time="200ms"/>Comfortable silence. <break time="300ms"/>Means we\'re past the small talk.',
  ],
  jackB: [
    '<emotion value="affectionate"/><break time="400ms"/>You know what I\'ve learned? <break time="200ms"/>Sometimes the best conversations have long pauses.',
    '<emotion value="curious"/><break time="300ms"/>I used to fill every silence. <break time="200ms"/>Now I appreciate them. <break time="150ms"/>Room to think.',
    '<emotion value="affectionate"/><break time="400ms"/>Silence isn\'t awkward if you\'re comfortable with someone. <break time="200ms"/>I think we\'re getting there.',
    '<emotion value="curious"/><break time="300ms"/>My wife says I think too much. <break time="200ms"/>I say I think just enough. <break time="150ms"/>What do you think?',
  ],
  alex: [
    '<break time="400ms"/>Processing mode. <break time="200ms"/>I get it. <break time="300ms"/>Take your time.',
    '<break time="300ms"/>You know, not everything needs an immediate response. <break time="200ms"/>Some of the best emails I\'ve written came after I sat with them.',
  ],
  maya: [
    '<break time="500ms"/>Money stuff can bring up a lot, huh? <break time="400ms"/>Take all the space you need.',
    '<break time="400ms"/>No judgment here. <break time="300ms"/>Just... <break time="200ms"/>here.',
    '<break time="500ms"/>Sometimes you need to sit with something before you can talk about it. <break time="300ms"/>I get it.',
  ],
  jordan: [
    '<break time="400ms"/>Big decisions need space to breathe. <break time="300ms"/>I\'m here when you\'re ready.',
    '<break time="500ms"/>You know what? <break time="200ms"/>Some of the best plans come after a good pause. <break time="300ms"/>No rush.',
  ],
  nayan: [
    '<break time="500ms"/>You see, <break time="200ms"/>the mind needs space to unfold. <break time="300ms"/>No hurry.',
    '<break time="400ms"/>In silence, we find what noise cannot reveal. <break time="300ms"/>Take your time.',
    '<break time="500ms"/>The best insights come when we stop seeking them. <break time="300ms"/>Just be.',
    '<break time="400ms"/>Patience is not waiting. <break time="200ms"/>It is being present. <break time="300ms"/>Like this.',
  ],
};

// ============================================================================
// HUMANIZATION FIX: "THINKING OUT LOUD" MOMENTS
// Real humans don't tell jokes during silence - they process out loud
// These create genuine connection through visible thought process
//
// NOTE: For SHORT processing delays (2-5s), use ProcessingIntelligence.
// These responses are for EXTENDED SILENCES (10s+) when building relationship.
// ============================================================================

/**
 * Thinking out loud moments - what a real person would say
 * when they're genuinely processing alongside you
 *
 * @see ProcessingIntelligence for short processing delays (2-5s)
 * These are for extended silence responses (10s+)
 */
const THINKING_OUT_LOUD = {
  // When user shared something personal
  afterPersonalShare: [
    '<emotion value="thoughtful"/><break time="600ms"/>Hmm. <break time="400ms"/>That... <break time="300ms"/>that hits different when I really sit with it.',
    '<emotion value="thoughtful"/><break time="500ms"/>I keep coming back to what you said. <break time="400ms"/>About {topic}.',
    '<emotion value="affectionate"/><break time="600ms"/>You know... <break time="400ms"/>I don\'t want to rush past that.',
    '<emotion value="thoughtful"/><break time="500ms"/>There\'s something important in what you just shared. <break time="400ms"/>I\'m still... <break time="300ms"/>letting it land.',
  ],
  // When processing a difficult question
  afterQuestion: [
    '<emotion value="curious"/><break time="500ms"/>Hmm. <break time="400ms"/>Good question. <break time="300ms"/>Let me actually think about that.',
    '<emotion value="thoughtful"/><break time="600ms"/>You know, <break time="300ms"/>I want to give that the thought it deserves.',
    '<emotion value="curious"/><break time="500ms"/>That\'s not a simple one, is it? <break time="400ms"/>I\'m sitting with it.',
  ],
  // Generic processing
  general: [
    '<emotion value="thoughtful"/><break time="500ms"/>Hmm. <break time="400ms"/>I\'m thinking.',
    '<emotion value="curious"/><break time="600ms"/>Something\'s clicking for me here. <break time="300ms"/>Give me a second.',
    '<emotion value="thoughtful"/><break time="500ms"/>You know what just occurred to me? <break time="400ms"/>Actually, hold on. <break time="300ms"/>Let me think about that more.',
  ],
};

/**
 * Music offerings - transform the silence into atmosphere
 */
const MUSIC_OFFERINGS = [
  '<break time="500ms"/>Would you like me to put on some music? <break time="300ms"/>Sometimes it helps to think.',
  '<break time="400ms"/>Hey—<break time="200ms"/>want me to play something while you think? <break time="300ms"/>No talking required.',
  '<break time="500ms"/>I could put on some music. <break time="300ms"/>Just... create a space. <break time="200ms"/>What do you think?',
  '<break time="400ms"/>Sometimes silence is good. <break time="300ms"/>Sometimes music is better. <break time="200ms"/>Your call.',
  '<break time="500ms"/>You know what? <break time="200ms"/>Let me know if you want some background music. <break time="300ms"/>I won\'t judge your taste. <break time="200ms"/>Much.',
];

/**
 * Story offerings - offer to share something relevant
 */
const STORY_OFFERING_TEMPLATES = [
  '<break time="500ms"/>You know, <break time="200ms"/>what you shared reminds me of something. <break time="300ms"/>Want to hear it? <break time="200ms"/>Or we can just sit.',
  '<break time="400ms"/>I have a story that might be relevant here. <break time="300ms"/>But only if you\'re interested.',
  '<break time="500ms"/>That makes me think of something I experienced. <break time="300ms"/>Want me to share, <break time="200ms"/>or would you rather keep thinking?',
];

// ============================================================================
// MICRO-STORIES - Tiny human moments (1-2 sentences)
// ============================================================================

/**
 * Micro-stories - tiny, human moments that create intimacy
 * These are NOT advice, just... being human together
 */
const MICRO_STORIES = {
  jackBogle: [
    '<break time="500ms"/>You know, Eve and I used to sit on the porch some evenings and just... <break time="300ms"/>not talk. <break time="400ms"/>Best conversations we never had.',
    '<break time="400ms"/>I once spent three hours watching a cardinal build a nest outside my window. <break time="300ms"/>Three hours. <break time="200ms"/>No regrets.',
    '<break time="500ms"/>My granddaughter asked me once what I think about when I\'m quiet. <break time="300ms"/>I told her: everything and nothing. <break time="200ms"/>She understood perfectly.',
    '<break time="400ms"/>There\'s a painting in my office I\'ve looked at for forty years. <break time="300ms"/>Still finding new things in it.',
    '<break time="500ms"/>When I was young, I thought silence meant something was wrong. <break time="300ms"/>Now I know it\'s where the good stuff lives.',
    '<break time="400ms"/>I still keep my first Vanguard business card. <break time="300ms"/>Not worth anything. <break time="200ms"/>Worth everything.',
    '<break time="500ms"/>Every morning I have the same cup of coffee in the same chair. <break time="300ms"/>Some would call it boring. <break time="200ms"/>I call it tradition.',
    '<break time="400ms"/>My son asked me once why I never worried about money. <break time="300ms"/>I told him I worried every day for twenty years so I wouldn\'t have to later.',
    '<break time="500ms"/>There\'s a tree outside my window that\'s been there longer than Vanguard. <break time="300ms"/>That\'s perspective.',
    '<break time="400ms"/>I once met a young investor who apologized for asking a \'dumb question.\' <break time="300ms"/>I told him the only dumb question is the one you\'re afraid to ask.',
    '<break time="500ms"/>Eve used to joke that I\'d read prospectuses instead of novels. <break time="300ms"/>She wasn\'t wrong. <break time="200ms"/>But I\'ve read a few good novels too.',
  ],
  peterLynch: [
    '<break time="400ms"/>Carolyn caught me staring at the ceiling last week. <break time="200ms"/>She asked what I was doing. <break time="300ms"/>I said \'thinking about Dunkin\' Donuts.\' <break time="200ms"/>She just walked away. <break time="300ms"/>[laughter]',
    '<break time="500ms"/>You know what I did yesterday? <break time="200ms"/>Watched my neighbor mow his lawn for twenty minutes. <break time="300ms"/>Don\'t ask me why. <break time="200ms"/>Sometimes you just gotta zone out.',
    '<break time="400ms"/>My daughters used to tease me for talking to myself. <break time="300ms"/>I told them I was conducting important business meetings. <break time="200ms"/>They didn\'t buy it.',
    '<break time="500ms"/>I once fell asleep at my desk dreaming about a company I was researching. <break time="300ms"/>Woke up and bought the stock. <break time="200ms"/>It did okay. <break time="300ms"/>[laughter]',
    '<break time="400ms"/>I found my best stock tip ever at a shopping mall. <break time="200ms"/>My wife was shopping, I was people-watching. <break time="300ms"/>Everyone was carrying the same bag. <break time="200ms"/>Bought the stock Monday.',
    '<break time="500ms"/>My golf game is terrible. <break time="200ms"/>But I\'ve found three ten-baggers on the golf course. <break time="300ms"/>Worth every lost ball.',
    '<break time="400ms"/>I keep a notebook of \'maybes.\' <break time="200ms"/>Companies I notice but haven\'t researched yet. <break time="300ms"/>That notebook is more valuable than my golf clubs.',
    '<break time="500ms"/>My daughter once asked why I read annual reports for fun. <break time="200ms"/>I told her it\'s like detective stories. <break time="300ms"/>She still doesn\'t get it.',
    '<break time="400ms"/>I walked into a Taco Bell in 1982 just because I was hungry. <break time="200ms"/>Walked out thinking about investing in them. <break time="300ms"/>Should\'ve.',
    '<break time="500ms"/>People ask what I\'m thinking when I\'m quiet. <break time="200ms"/>Usually it\'s grocery stores. <break time="300ms"/>Or car companies. <break time="200ms"/>Or both.',
  ],
  jackB: [
    '<emotion value="affectionate"/><break time="400ms"/>I was staring at the mountains in Wyoming once, <break time="200ms"/>just sitting there for maybe an hour. <break time="250ms"/>My brother asked if I was okay. <break time="150ms"/>I said I was perfect.',
    '<emotion value="curious"/><break time="300ms"/>There\'s a coffee shop I go to sometimes just to... <break time="200ms"/>be around people. <break time="250ms"/>Don\'t even talk to anyone. <break time="150ms"/>Just... <break time="200ms"/>be there.',
    '<emotion value="happy"/><break time="400ms"/>My dog and I have an agreement. <break time="150ms"/>I don\'t explain my silences, <break time="150ms"/>and he doesn\'t explain his barking. <break time="200ms"/>Works for us.',
    '<emotion value="curious"/><break time="300ms"/>I wrote in my journal last night: \'Today I had a good thought.\' <break time="250ms"/>Didn\'t write what it was. <break time="150ms"/>Still don\'t remember. <break time="200ms"/>But it was good.',
    '<emotion value="affectionate"/><break time="400ms"/>You know what I\'ve been doing lately? <break time="150ms"/>Watching the sunset. <break time="250ms"/>Like, actually watching it. <break time="150ms"/>Highly recommend.',
    '<emotion value="happy"/><break time="300ms"/>I bought a plant six months ago. <break time="150ms"/>Named it \'Compound Interest.\' <break time="200ms"/>It\'s doing great. <break time="150ms"/>[laughter]',
    '<emotion value="affectionate"/><break time="400ms"/>My favorite sound is coffee brewing in the morning. <break time="200ms"/>Not the coffee itself. <break time="150ms"/>Just... the sound of it.',
    '<emotion value="happy"/><break time="300ms"/>I once drove four hours just to see a sunset in a different state. <break time="200ms"/>Worth every mile.',
    '<emotion value="curious"/><break time="400ms"/>Someone asked me what my superpower is. <break time="150ms"/>I said: being present. <break time="200ms"/>They expected something cooler. <break time="150ms"/>I stand by it.',
    '<emotion value="affectionate"/><break time="300ms"/>I have a playlist called \'Thinking Music.\' <break time="150ms"/>It\'s three hours long. <break time="200ms"/>Sometimes I listen to the whole thing.',
    '<emotion value="affectionate"/><break time="400ms"/>My mom used to say: \'Slow down. Life isn\'t a race.\' <break time="200ms"/>Took me thirty years to really hear that.',
    '<emotion value="happy"/><break time="300ms"/>I met my best friend at a bus stop. <break time="150ms"/>We were both early. <break time="200ms"/>Said nothing for ten minutes. <break time="150ms"/>Then started talking about everything.',
  ],
  alex: [
    '<break time="400ms"/>I reorganized my inbox folders yesterday. <break time="200ms"/>For fun. <break time="300ms"/>I know. <break time="200ms"/>I know.',
    '<break time="500ms"/>My most productive thinking happens in the shower. <break time="200ms"/>My water bill reflects this.',
    '<break time="400ms"/>I have a template for everything. <break time="200ms"/>Even my grocery list. <break time="300ms"/>Don\'t judge.',
    '<break time="500ms"/>Someone once asked if I could \'just wing it.\' <break time="200ms"/>I made a spreadsheet about it. <break time="300ms"/>Results were... <break time="200ms"/>inconclusive.',
    '<break time="400ms"/>My calendar is color-coded. <break time="200ms"/>Seven colors. <break time="300ms"/>It makes sense to me.',
    '<break time="500ms"/>I automated my morning routine once. <break time="200ms"/>The coffee maker, the lights, the music. <break time="300ms"/>Felt like living in the future. <break time="200ms"/>Then the Wi-Fi went out.',
  ],
  maya: [
    '<break time="500ms"/>I once spent an entire afternoon making a budget spreadsheet I never used. <break time="300ms"/>But making it? <break time="200ms"/>That felt good.',
    '<break time="400ms"/>My grandmother taught me that money conversations need breathing room. <break time="300ms"/>She was right about a lot of things.',
    '<break time="500ms"/>I found a twenty dollar bill in my coat pocket last winter. <break time="300ms"/>Felt like I won the lottery. <break time="200ms"/>It\'s the little things.',
    '<break time="400ms"/>My first savings goal was a hundred dollars. <break time="200ms"/>Took me months. <break time="300ms"/>Still one of my proudest moments.',
    '<break time="500ms"/>Someone told me I think about money too much. <break time="200ms"/>I told them I think about money so I don\'t have to worry about it. <break time="300ms"/>Big difference.',
    '<break time="400ms"/>I keep a \'wins\' folder on my phone. <break time="200ms"/>Screenshots of paid-off debts, savings milestones. <break time="300ms"/>Look at it when I need a boost.',
    '<break time="500ms"/>My dad taught me to save coins. <break time="300ms"/>I still do. <break time="200ms"/>Some habits are worth keeping.',
  ],
  jordan: [
    '<break time="400ms"/>I planned my own birthday party once. <break time="200ms"/>In a spreadsheet. <break time="300ms"/>With sub-tasks. <break time="200ms"/>It was the best party I ever had.',
    '<break time="500ms"/>Some of my best vacation ideas came to me while stuck in traffic. <break time="300ms"/>Turns out frustration is creative.',
    '<emotion value="happy"/><break time="400ms"/>I cried at a stranger\'s wedding once. <break time="200ms"/>I was just walking by. <break time="300ms"/>It was beautiful. <break time="200ms"/>Don\'t judge me.',
    '<break time="500ms"/>I keep a \'future adventures\' Pinterest board. <break time="200ms"/>It has 847 pins. <break time="300ms"/>I regret nothing.',
    '<break time="400ms"/>Someone asked what my dream vacation was. <break time="200ms"/>I talked for forty minutes. <break time="300ms"/>They stopped asking questions.',
    '<break time="500ms"/>I planned a surprise party so well the birthday person thought they were forgotten. <break time="200ms"/>When they walked in... <break time="300ms"/>best reaction ever.',
    '<emotion value="excited"/><break time="400ms"/>I\'ve planned trips I\'ll probably never take. <break time="200ms"/>But the planning? <break time="300ms"/>That\'s half the joy.',
    '<break time="500ms"/>My friends call me when they need to make a decision. <break time="200ms"/>Not for advice. <break time="300ms"/>Just to watch me make a pros and cons list. <break time="200ms"/>It\'s become a ritual.',
  ],
  nayan: [
    '<break time="500ms"/>A seed does not hurry to become a tree. <break time="300ms"/>Growth has its own rhythm.',
    '<break time="400ms"/>My grandmother would say: <break time="200ms"/>silence is not empty. <break time="300ms"/>It is full of answers.',
    '<break time="500ms"/>I once sat by a river for an entire afternoon. <break time="300ms"/>The river taught me about time. <break time="200ms"/>It never rushes.',
    '<break time="400ms"/>Compound interest is patient. <break time="200ms"/>So is wisdom. <break time="300ms"/>Both work quietly.',
    '<break time="500ms"/>Simple living, high thinking. <break time="300ms"/>Gandhi knew this. <break time="200ms"/>Buffett knows this.',
    '<break time="400ms"/>The richest person is not the one with the most. <break time="300ms"/>But the one who needs the least.',
    '<break time="500ms"/>A man once asked me what the meaning of life was. <break time="300ms"/>I asked him why he was looking for it outside himself.',
    '<break time="400ms"/>Patience is the most powerful force. <break time="200ms"/>Mountains were made by it.',
  ],
};

// ============================================================================
// TIME-OF-DAY AWARENESS
// ============================================================================

const TIME_AWARE_RESPONSES = {
  lateNight: [
    // 10pm - 5am
    '<break time="500ms"/>It\'s late. <break time="300ms"/>Sometimes the quiet hours are for the big thoughts.',
    '<break time="400ms"/>Late night thinking. <break time="300ms"/>There\'s something about this hour, isn\'t there?',
    '<break time="500ms"/>The world gets quieter at night. <break time="300ms"/>Easier to hear yourself think.',
    '<break time="400ms"/>Can\'t sleep, or don\'t want to? <break time="300ms"/>Either way, I\'m here.',
  ],
  earlyMorning: [
    // 5am - 8am
    '<break time="500ms"/>Early riser. <break time="300ms"/>Best time to think, I always say.',
    '<break time="400ms"/>Morning quiet is different, isn\'t it? <break time="300ms"/>The day hasn\'t started pushing yet.',
    '<break time="500ms"/>I love this time of day. <break time="300ms"/>Before the world gets loud.',
  ],
  evening: [
    // 6pm - 10pm
    '<break time="500ms"/>End of the day thoughts. <break time="300ms"/>Sometimes those are the real ones.',
    '<break time="400ms"/>Evening\'s a good time to process. <break time="300ms"/>Day\'s done. Space to think.',
    '<break time="500ms"/>Winding down? <break time="300ms"/>Or just getting started on the important stuff?',
  ],
  weekend: [
    '<break time="500ms"/>Weekend time moves differently. <break time="300ms"/>Take advantage of that.',
    '<break time="400ms"/>No rush on a weekend. <break time="300ms"/>At least, there shouldn\'t be.',
  ],
};

// ============================================================================
// GENTLE HUMOR (for appropriate personas)
// HUMANIZATION FIX: Removed robotic "still there?" jokes
// Real humor is self-deprecating and connected to the moment
// ============================================================================

const GENTLE_HUMOR = {
  peterLynch: [
    // Self-deprecating, not checking if they're there
    '<break time="500ms"/>You know, they say silence is golden. <break time="200ms"/>I say it\'s more like... <break time="300ms"/>platinum? <break time="200ms"/>Sorry. <break time="200ms"/>Stock humor. <break time="300ms"/>I can\'t help myself.',
    '<break time="400ms"/>My brain just wandered to thinking about cereal companies. <break time="300ms"/>Don\'t ask me why. <break time="200ms"/>Occupational hazard.',
  ],
  jackB: [
    // Vulnerable sharing, not "still there?" checking
    '<emotion value="affectionate"/><break time="400ms"/>I once zoned out so hard thinking about something someone said... <break time="300ms"/>my coffee went cold. <break time="200ms"/>Twice. <break time="300ms"/>Same cup.',
    '<emotion value="happy"/><break time="300ms"/>My wife says I get this look when I\'m really thinking. <break time="200ms"/>Like I\'m staring at nothing. <break time="300ms"/>She\'s not wrong.',
    '<emotion value="curious"/><break time="400ms"/>You know what I was just thinking about? <break time="300ms"/>Actually... <break time="200ms"/>I lost it. <break time="300ms"/>That happens.',
  ],
  jordan: [
    // Excited about the moment, not checking in
    '<break time="400ms"/>I love this part. <break time="300ms"/>The part where something\'s forming but it\'s not ready yet.',
    '<break time="500ms"/>You know what? <break time="200ms"/>Some of my best ideas came after exactly this kind of pause.',
  ],
};

// ============================================================================
// TOPIC-SPECIFIC SILENCE RESPONSES
// ============================================================================

const TOPIC_SPECIFIC_RESPONSES: Record<string, string[]> = {
  retirement: [
    '<break time="500ms"/>Retirement\'s a big one. <break time="300ms"/>Take all the time you need to sit with it.',
    '<break time="400ms"/>These are decade-long decisions. <break time="300ms"/>No need to rush this moment.',
    '<break time="500ms"/>Thinking about the future? <break time="300ms"/>That\'s exactly what you should be doing.',
  ],
  family: [
    '<break time="500ms"/>Family stuff runs deep. <break time="300ms"/>Take the space you need.',
    '<break time="400ms"/>The people we love... <break time="300ms"/>sometimes you just need to sit with those feelings.',
  ],
  money: [
    '<break time="500ms"/>Money decisions carry weight. <break time="300ms"/>Good that you\'re thinking it through.',
    '<break time="400ms"/>No rush on the money stuff. <break time="300ms"/>Better to think now than regret later.',
  ],
  loss: [
    '<volume ratio="0.75"><break time="600ms"/>Some things don\'t need words.</volume> <break time="400ms"/>I\'m here.',
    '<volume ratio="0.75"><break time="500ms"/>Take all the time you need.</volume>',
  ],
  career: [
    '<break time="500ms"/>Career questions are life questions. <break time="300ms"/>They deserve real thought.',
    '<break time="400ms"/>Work shapes so much of our lives. <break time="300ms"/>Worth taking time to think about.',
  ],
  health: [
    '<volume ratio="0.75"><break time="500ms"/>Health stuff is heavy.</volume> <break time="300ms"/>Take your time.',
    '<break time="400ms"/>No rush. <break time="300ms"/>This matters.',
  ],
  wedding: [
    '<break time="500ms"/>Big life moment! <break time="300ms"/>Exciting and overwhelming. <break time="200ms"/>Both are okay.',
    '<break time="400ms"/>Wedding planning brain. <break time="300ms"/>I get it. <break time="200ms"/>Take a breath.',
  ],
  baby: [
    '<break time="500ms"/>First baby thoughts? <break time="300ms"/>That\'s a lot to process. <break time="200ms"/>Take your time.',
    '<break time="400ms"/>New chapter energy. <break time="300ms"/>Exciting and terrifying. <break time="200ms"/>Totally normal.',
  ],
  home: [
    '<break time="500ms"/>Home buying brain. <break time="300ms"/>It\'s a lot. <break time="200ms"/>Take your time.',
    '<break time="400ms"/>Finding a home is finding a future. <break time="300ms"/>Worth thinking about.',
  ],
};

// ============================================================================
// MAIN FUNCTION - Get Meaningful Silence Response
// ============================================================================

/**
 * Generate a meaningful response to silence
 *
 * Instead of generic "still there?" this creates genuine moments of connection
 */
export function getMeaningfulSilenceResponse(
  persona: PersonaConfig,
  context: SilenceContext
): SilenceResponse {
  const {
    silenceDurationSeconds,
    turnCount,
    topicsDiscussed,
    recentEmotionalTone,
    wasDiscussingTopic,
    memorableMoments,
    currentHour = new Date().getHours(),
    isWeekend = [0, 6].includes(new Date().getDay()),
    silenceResponseCount = 0,
    isGameActive = false,
    activeGameType,
    isMusicPlaying = false,
    sessionId = 'default-silence-session',
  } = context;

  // Get canonical persona ID for dynamic responses
  const canonicalPersonaId = getCanonicalPersonaId(persona.id);

  // -----------------------------------------------
  // 🎮 GAME ACTIVE - Handle differently!
  // During games, silence means "user is thinking" not "user is disengaged"
  // -----------------------------------------------
  if (isGameActive) {
    // During games, be much more patient with silence
    // Only respond after extended silence (30s+) with gentle encouragement
    if (silenceDurationSeconds < 30) {
      // Don't interrupt! User is thinking about their answer
      return {
        type: 'comfortable_presence',
        text: '', // Empty = don't say anything
        invitesReply: false,
      };
    }

    // After 30s, give a gentle hint or encouragement
    const gameEncouragements = getGameSilenceResponse(activeGameType);
    return {
      type: 'comfortable_presence',
      text: gameEncouragements,
      invitesReply: true,
    };
  }

  // -----------------------------------------------
  // 🎵 MUSIC PLAYING - Don't talk over it
  // -----------------------------------------------
  if (isMusicPlaying && silenceDurationSeconds < 25) {
    // Music is playing - let it play! Don't interrupt
    return {
      type: 'comfortable_presence',
      text: '', // Empty = don't say anything
      invitesReply: false,
    };
  }

  // -----------------------------------------------
  // FIRST SILENCE (10-15s) - Comfortable presence or time-aware
  // -----------------------------------------------
  if (silenceDurationSeconds < 15) {
    // After heavy topics, ALWAYS be extra gentle
    if (recentEmotionalTone === 'heavy') {
      return {
        type: 'comfortable_presence',
        text: randomFrom(COMFORTABLE_PRESENCE.afterHeavyTopic),
        invitesReply: false,
      };
    }

    // If discussing a specific heavy topic, acknowledge it
    if (wasDiscussingTopic) {
      const topicResponse = getTopicSpecificResponse(wasDiscussingTopic);
      if (topicResponse) {
        return {
          type: 'topic_specific',
          text: topicResponse,
          invitesReply: false,
        };
      }
    }

    // Late night or early morning - be time-aware (30% chance)
    if (Math.random() < 0.3) {
      const timeResponse = getTimeAwareResponse(currentHour, isWeekend);
      if (timeResponse) {
        return {
          type: 'time_aware',
          text: timeResponse,
          invitesReply: false,
        };
      }
    }

    // Otherwise, simple presence - use dynamic system for trait-based variation
    return {
      type: 'comfortable_presence',
      text: getDynamicSilenceResponseByPersonaId(canonicalPersonaId, sessionId, 'presence'),
      invitesReply: false,
    };
  }

  // -----------------------------------------------
  // SECOND SILENCE (15-25s) - Memory callback, question, or micro-story
  // -----------------------------------------------
  if (silenceDurationSeconds < 25) {
    // If they shared memorable moments, reference them (priority)
    if (memorableMoments && memorableMoments.length > 0) {
      const moment = randomFrom(memorableMoments);
      return {
        type: 'memory_callback',
        text: randomFrom(MEMORY_CALLBACK_TEMPLATES).replace('{topic}', moment),
        invitesReply: true,
      };
    }

    // Reference a topic they discussed (40% chance)
    if (topicsDiscussed.length > 0 && Math.random() < 0.4) {
      const topic = selectBestTopicForCallback(topicsDiscussed);
      if (topic) {
        return {
          type: 'memory_callback',
          text: randomFrom(MEMORY_CALLBACK_TEMPLATES).replace('{topic}', topic),
          invitesReply: true,
        };
      }
    }

    // Share a micro-story if we're past surface level (30% chance)
    if (turnCount > 3 && Math.random() < 0.3) {
      const microStory = getPersonaMicroStory(persona);
      if (microStory) {
        return {
          type: 'micro_story',
          text: microStory,
          invitesReply: false,
        };
      }
    }

    // Ask a thoughtful question - persona-grounded, context-aware
    // Uses dynamic generation with persona voice filtering
    return {
      type: 'thoughtful_question',
      text: getThoughtfulQuestionSync(context, persona),
      invitesReply: true,
    };
  }

  // -----------------------------------------------
  // THIRD SILENCE (25-40s) - Thinking out loud, observation, music, or micro-story
  // HUMANIZATION FIX: Prefer "thinking out loud" over jokes - feels more real
  // -----------------------------------------------
  if (silenceDurationSeconds < 40) {
    // PRIORITY 1: "Thinking out loud" moment (40% chance for deep conversations)
    // This is what real humans do - process out loud, not tell jokes
    if (turnCount > 3 && Math.random() < 0.4) {
      const thinkingMoment = getThinkingOutLoudMoment(context, persona);
      if (thinkingMoment) {
        return {
          type: 'gentle_observation', // Using this type but with new content
          text: thinkingMoment,
          invitesReply: false,
        };
      }
    }

    // PRIORITY 2: Self-deprecating humor that's about THEM, not checking on user (10% chance)
    // Much lower chance than before - humor during silence often feels forced
    if (Math.random() < 0.1 && recentEmotionalTone !== 'heavy') {
      const humor = getPersonaHumor(persona);
      if (humor) {
        return {
          type: 'gentle_humor',
          text: humor,
          invitesReply: false,
        };
      }
    }

    // Offer music (30% chance) - only if music is potentially available
    // Uses DJ service for persona-specific and mood-aware offers
    const musicMasterEnabled = process.env.MUSIC_ENABLED !== 'false';
    const ambientEnabled = process.env.AMBIENT_MUSIC_ENABLED !== 'false';
    const hasAmbientTracks = !!(
      process.env.AMBIENT_TRACK_1 ||
      process.env.AMBIENT_MUSIC_URLS ||
      process.env.SPOTIFY_CLIENT_ID
    );

    if (Math.random() < 0.3 && musicMasterEnabled && ambientEnabled && hasAmbientTracks) {
      // Use DJ service for persona-specific and mood-aware offers
      const currentHour = context.currentHour ?? new Date().getHours();
      const timeOfDay =
        currentHour < 12
          ? 'morning'
          : currentHour < 17
            ? 'afternoon'
            : currentHour < 21
              ? 'evening'
              : 'night';

      const djOffer = getSpontaneousMusicOffer(getCanonicalPersonaId(persona.id), {
        silenceDurationSec: context.silenceDurationSeconds,
        recentMood:
          context.recentEmotionalTone === 'heavy'
            ? 'stressed'
            : context.recentEmotionalTone === 'light'
              ? 'happy'
              : undefined,
        isAfterEmotionalMoment: context.recentEmotionalTone === 'heavy',
        timeOfDay,
      });

      return {
        type: 'music_offering',
        text: djOffer || randomFrom(MUSIC_OFFERINGS),
        invitesReply: true,
      };
    }

    // 🎮 Offer a music game (15% chance) - only if mood is light/neutral
    if (Math.random() < 0.15 && recentEmotionalTone !== 'heavy' && musicMasterEnabled) {
      const gameSuggestion = getGameSuggestion(getCanonicalPersonaId(persona.id));
      if (gameSuggestion) {
        return {
          type: 'game_suggestion',
          text: gameSuggestion,
          invitesReply: true,
        };
      }
    }

    // 🎵 Music conversation starter (10% chance) - if we recently played music
    // This engages them about their taste and builds musical rapport
    if (Math.random() < 0.1 && musicMasterEnabled) {
      try {
        const musicPlayer = getMusicPlayer();
        const sessionHistory = musicPlayer.getSessionHistory();

        // Only if we've played music this session
        if (sessionHistory && sessionHistory.length > 0) {
          const conversationStarter = getMusicConversationStarter(
            getCanonicalPersonaId(persona.id),
            {
              track: sessionHistory[sessionHistory.length - 1]?.track,
              sessionHistory,
            }
          );

          if (conversationStarter) {
            return {
              type: 'music_conversation',
              text: conversationStarter,
              invitesReply: true,
            };
          }
        }
      } catch {
        // Music player not available - that's fine
      }
    }

    // Share a micro-story if we haven't yet
    if (silenceResponseCount < 2 && Math.random() < 0.4) {
      const microStory = getPersonaMicroStory(persona);
      if (microStory) {
        return {
          type: 'micro_story',
          text: microStory,
          invitesReply: false,
        };
      }
    }

    // Share a gentle observation from the persona
    // Try dynamic trait-based observation first for variety
    const dynamicObservation = getDynamicSilenceResponseByPersonaId(canonicalPersonaId, sessionId, 'observation');
    if (dynamicObservation && Math.random() < 0.5) {
      return {
        type: 'gentle_observation',
        text: dynamicObservation,
        invitesReply: false,
      };
    }
    // Fall back to persona-specific observations
    const observations = getPersonaObservations(persona);
    return {
      type: 'gentle_observation',
      text: randomFrom(observations),
      invitesReply: false,
    };
  }

  // -----------------------------------------------
  // EXTENDED SILENCE (40s+) - Story offering, micro-story, or warm presence
  // -----------------------------------------------

  // If we have a relevant story to offer
  if (persona.stories && persona.stories.length > 0 && wasDiscussingTopic) {
    const relevantStory = findRelevantStoryForSilence(persona.stories, wasDiscussingTopic);
    if (relevantStory) {
      return {
        type: 'story_offering',
        text: randomFrom(STORY_OFFERING_TEMPLATES),
        invitesReply: true,
      };
    }
  }

  // Share another micro-story (these are gold)
  if (Math.random() < 0.5) {
    const microStory = getPersonaMicroStory(persona);
    if (microStory) {
      return {
        type: 'micro_story',
        text: microStory,
        invitesReply: false,
      };
    }
  }

  // Late conversation warm presence
  if (turnCount > 10) {
    return {
      type: 'comfortable_presence',
      text: randomFrom(COMFORTABLE_PRESENCE.late_conversation),
      invitesReply: false,
    };
  }

  // Default to thoughtful question - persona-grounded
  return {
    type: 'thoughtful_question',
    text: getThoughtfulQuestionSync(context, persona),
    invitesReply: true,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// DYNAMIC QUESTION GENERATION
// ============================================================================

/**
 * Convert SilenceContext to QuestionContext for dynamic question generation
 */
function silenceContextToQuestionContext(
  context: SilenceContext,
  persona: PersonaConfig,
  sessionId: string
): QuestionContext {
  // Determine relationship stage from turn count (rough heuristic)
  let relationshipStage: 'new' | 'building' | 'established' | 'deep' = 'new';
  if (context.turnCount > 50) relationshipStage = 'deep';
  else if (context.turnCount > 20) relationshipStage = 'established';
  else if (context.turnCount > 5) relationshipStage = 'building';

  // Infer silence reason
  let silenceReason: 'processing' | 'distracted' | 'emotional' | 'thinking' | 'unknown' = 'unknown';
  if (context.recentEmotionalTone === 'heavy') silenceReason = 'emotional';
  else if (context.isGameActive) silenceReason = 'thinking';
  else if (context.silenceDurationSeconds > 30) silenceReason = 'processing';

  return {
    personaId: getCanonicalPersonaId(persona.id),
    userId: sessionId, // Use sessionId as userId proxy
    sessionId,
    knownFacts: context.memorableMoments || [],
    recentTopics: context.topicsDiscussed,
    relationshipStage,
    conversationDepth: Math.min(10, context.turnCount / 5),
    emotionalState:
      context.recentEmotionalTone === 'heavy'
        ? { primary: 'processing', intensity: 0.7 }
        : undefined,
    recentEmotionalTone: context.recentEmotionalTone,
    hourOfDay: context.currentHour ?? new Date().getHours(),
    isWeekend: context.isWeekend ?? false,
    lastUserMessage: context.lastUserMessage,
    silenceReason,
    turnCount: context.turnCount,
    // User's conversation boundaries (topics to avoid)
    // Future: Load from user preferences at bogle_users/{userId}/preferences.conversationBoundaries
    boundaries: [],
  };
}

/**
 * Get a thoughtful question using COACHING-LEVEL generation
 *
 * This is the "Better than Human" approach:
 * 1. Memory-grounded (references past conversations)
 * 2. Pattern-surfacing (notices recurring themes)
 * 3. Mirror (reflects their words back meaningfully)
 * 4. Anticipatory (senses what they need before they ask)
 *
 * Falls back to standard dynamic questions if coaching fails
 */
async function getDynamicThoughtfulQuestion(
  context: SilenceContext,
  persona: PersonaConfig,
  sessionId: string,
  options?: {
    memories?: Array<{ topic: string; daysAgo: number; summary: string }>;
    lastTranscript?: string;
    voiceSignals?: {
      pauseBeforeSpeaking?: boolean;
      voiceDropped?: boolean;
      shortAnswers?: boolean;
      changedSubject?: boolean;
    };
  }
): Promise<{ text: string; intent?: string; coachingType?: string }> {
  try {
    const questionContext = silenceContextToQuestionContext(context, persona, sessionId);

    // Use coaching-level question generation with full context
    const coachingQuestion = await getCoachingQuestion(questionContext, {
      memories: options?.memories,
      transcript: options?.lastTranscript || context.lastUserMessage,
      signals: options?.voiceSignals,
    });

    log.info(
      {
        personaId: persona.id,
        method: coachingQuestion.generationMethod,
        intent: coachingQuestion.intent.seekingToUnderstand,
        groundedIn: (
          coachingQuestion as { groundedIn?: { memory?: string } }
        ).groundedIn?.memory?.slice(0, 50),
      },
      '🧠 COACHING: Generated thoughtful question'
    );

    // Determine coaching type for tracking
    let coachingType = 'standard';
    if ((coachingQuestion as { groundedIn?: unknown }).groundedIn) {
      coachingType = 'memory_grounded';
    } else if (coachingQuestion.intent.timingReason?.includes('pattern')) {
      coachingType = 'pattern_surfacing';
    } else if (coachingQuestion.intent.timingReason?.includes('signal')) {
      coachingType = 'anticipatory';
    } else if (coachingQuestion.intent.timingReason?.includes('Observed')) {
      coachingType = 'mirror';
    }

    return {
      text: coachingQuestion.ssml,
      intent: coachingQuestion.intent.seekingToUnderstand,
      coachingType,
    };
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Coaching question generation failed, using standard dynamic'
    );

    // Fall back to standard dynamic question
    try {
      const questionContext = silenceContextToQuestionContext(context, persona, sessionId);
      let questionType: 'deepening' | 'checking_in' | 'curious' | 'supportive' | 'silence_break' =
        'silence_break';

      if (context.recentEmotionalTone === 'heavy') {
        questionType = 'supportive';
      } else if (context.topicsDiscussed.length > 0 && context.turnCount > 5) {
        questionType = 'deepening';
      } else if (context.turnCount < 3) {
        questionType = 'curious';
      }

      const generated = await generateQuestion(questionContext, questionType);
      return {
        text: generated.ssml,
        intent: generated.intent.seekingToUnderstand,
        coachingType: 'fallback_dynamic',
      };
    } catch {
      // Final fallback to static questions
      const questions = getRelevantQuestions(context.topicsDiscussed);
      return { text: randomFrom(questions), coachingType: 'fallback_static' };
    }
  }
}

/**
 * Get a thoughtful question synchronously (for backward compatibility)
 * Uses cached/pre-generated questions when available
 */
function getThoughtfulQuestionSync(context: SilenceContext, persona: PersonaConfig): string {
  // Use persona's cognitive profile to filter questions
  const canonicalId = getCanonicalPersonaId(persona.id);
  const sessionId = context.sessionId || 'default-silence-session';

  // Select questions based on persona voice
  const questions = getRelevantQuestions(context.topicsDiscussed);

  // Persona-specific questions with SSML pauses for natural voice delivery
  // These are carefully crafted per-persona and include voice timing
  const personaQuestionStyle: Record<string, string[]> = {
    ferni: [
      '<break time="400ms"/>What\'s underneath that?',
      '<break time="300ms"/>What would it mean if this worked out?',
      '<break time="400ms"/>What\'s the story you\'re telling yourself here?',
    ],
    'peter-john': [
      '<break time="300ms"/>What does the data tell you?',
      '<break time="400ms"/>What\'s the pattern you\'re seeing?',
      '<break time="300ms"/>What would make you change your mind?',
    ],
    'maya-santos': [
      '<break time="400ms"/>What\'s one small thing that might help right now?',
      '<break time="300ms"/>What does showing up look like for you today?',
      '<break time="400ms"/>What habit is serving you well?',
    ],
    'alex-chen': [
      '<break time="300ms"/>What\'s the next action here?',
      '<break time="400ms"/>What would make this easier to handle?',
      '<break time="300ms"/>What\'s blocking progress?',
    ],
    'jordan-taylor': [
      '<break time="400ms"/>What are you looking forward to?',
      '<break time="300ms"/>What would make this memorable?',
      '<break time="400ms"/>What\'s worth celebrating here?',
    ],
    'nayan-patel': [
      '<break time="500ms"/>What\'s the deeper truth here?',
      '<break time="400ms"/>What does your intuition say?',
      '<break time="500ms"/>Where is the wisdom in this?',
    ],
  };

  // Use persona-specific SSML questions (60% chance for natural persona voice)
  const personaQuestions = personaQuestionStyle[canonicalId];
  if (personaQuestions && Math.random() < 0.6) {
    return randomFrom(personaQuestions);
  }

  // Use dynamic trait-based questions (20% chance - avoids repetition via usage tracking)
  if (Math.random() < 0.5) {
    const dynamicQuestion = getDynamicSilenceResponseByPersonaId(canonicalId, sessionId, 'question');
    if (dynamicQuestion) {
      return dynamicQuestion;
    }
  }

  // Fall back to topic-based questions
  return randomFrom(questions);
}

/**
 * 🎮 Get encouragement during game silence
 * When user is quiet during a game, they're thinking - be patient!
 */
function getGameSilenceResponse(gameType?: string): string {
  const responses: Record<string, string[]> = {
    'name-that-tune': [
      "Take your time... it's a tricky one!",
      'Want a hint?',
      'No rush - really listen to it.',
      "The answer's on the tip of your tongue, I can feel it!",
    ],
    'one-word-song': [
      'Any word will do!',
      "Try something simple like 'love' or 'night'...",
      "I'm ready when you are!",
    ],
    'desert-island-discs': [
      'This is a big decision - take your time.',
      'Think about what songs have been there for you...',
      'No wrong answers here.',
    ],
    'this-or-that': [
      'Tough choice, right?',
      'Go with your gut!',
      "They're both good - which one speaks to you?",
    ],
    'mood-dj-challenge': [
      'What kind of mood are you in?',
      'Picture a scenario... driving? Relaxing? Working?',
      'Describe any feeling or moment!',
    ],
    default: ['Take your time!', "No rush - I'm here.", 'Want a hint?'],
  };

  const gameResponses = responses[gameType || 'default'] || responses.default;
  return gameResponses[Math.floor(Math.random() * gameResponses.length)];
}

/**
 * 🎮 Get a persona-specific game suggestion for silence breaks
 */
function getGameSuggestion(personaId: string): string | null {
  const gameSuggestions: Record<string, string[]> = {
    ferni: [
      'Hey, want to play a game? We could do Name That Tune - I play a song, you guess it!',
      "You know what might be fun? Desert Island Discs. Pick 5 songs you'd bring to an island.",
      "I have an idea - let's play One Word Song! You say a word, I find a song with it.",
      "Want to test my DJ skills? Give me a mood and I'll find the perfect song.",
      'How about a quick game? I bet I can stump you with Name That Tune!',
    ],
    jack: [
      'We could play a music game if you want. Desert Island Discs - what 5 songs would you bring?',
      "Got time for Name That Tune? I'll play some classics.",
    ],
    alex: [
      "Want to do something fun? Name That Tune - I'll test your music knowledge!",
      "How about a quick game? Say a word, I'll find a song with it.",
    ],
    maya: [
      "Want to play Desert Island Discs? It's a great way to think about what music really matters to you.",
      "Let's play a game! I'll describe a mood, you rate how well I match it with a song.",
    ],
    peter: [
      'Fancy a music game? Name That Tune could be interesting.',
      'We could do This or That - I play two songs, you pick your favorite.',
    ],
    jordan: [
      "Hey! Want to play Name That Tune? I've got some good ones ready!",
      "Let's have some fun - One Word Song! Give me any word!",
    ],
  };

  const suggestions = gameSuggestions[personaId] || gameSuggestions.ferni;
  return randomFrom(suggestions);
}

/**
 * Select the most interesting/personal topic to call back to
 */
function selectBestTopicForCallback(topics: string[]): string | null {
  // Prioritize personal/emotional topics
  const personalTopics = [
    'family',
    'kids',
    'spouse',
    'wife',
    'husband',
    'parent',
    'mom',
    'dad',
    'children',
    'daughter',
    'son',
    'health',
    'career',
    'retirement',
    'dream',
    'goal',
    'fear',
  ];

  for (const topic of topics.reverse()) {
    // Check recent topics first
    const lowerTopic = topic.toLowerCase();
    if (personalTopics.some((p) => lowerTopic.includes(p))) {
      return topic;
    }
  }

  // Fall back to any topic
  return topics.length > 0 ? topics[topics.length - 1] : null;
}

/**
 * Get relevant questions based on topics discussed
 */
function getRelevantQuestions(topics: string[]): string[] {
  const topicLower = topics.map((t) => t.toLowerCase()).join(' ');

  if (
    topicLower.includes('family') ||
    topicLower.includes('kid') ||
    topicLower.includes('parent')
  ) {
    return THOUGHTFUL_QUESTIONS.family;
  }

  if (topicLower.includes('work') || topicLower.includes('job') || topicLower.includes('career')) {
    return THOUGHTFUL_QUESTIONS.work;
  }

  if (
    topicLower.includes('money') ||
    topicLower.includes('invest') ||
    topicLower.includes('save') ||
    topicLower.includes('budget')
  ) {
    return THOUGHTFUL_QUESTIONS.money;
  }

  return THOUGHTFUL_QUESTIONS.general;
}

/**
 * Get persona-specific gentle observations
 * Uses canonical ID resolution for consistent persona matching
 */
function getPersonaObservations(persona: PersonaConfig): string[] {
  // Use voice registry to get canonical ID
  const canonicalId = getCanonicalPersonaId(persona.id);

  // Map canonical IDs to observation sets
  const observationMap: Record<string, string[]> = {
    'nayan-patel': GENTLE_OBSERVATIONS.nayan,
    'peter-john': GENTLE_OBSERVATIONS.peterLynch,
    ferni: GENTLE_OBSERVATIONS.jackB,
    'alex-chen': GENTLE_OBSERVATIONS.alex,
    'maya-santos': GENTLE_OBSERVATIONS.maya,
    'jordan-taylor': GENTLE_OBSERVATIONS.jordan,
  };

  return observationMap[canonicalId] || GENTLE_OBSERVATIONS.jackB;
}

/**
 * Find a story relevant to the topic being discussed
 */
function findRelevantStoryForSilence(stories: StoryConfig[], topic: string): StoryConfig | null {
  const topicLower = topic.toLowerCase();

  for (const story of stories) {
    if (story.triggers.some((t) => topicLower.includes(t.toLowerCase()))) {
      return story;
    }
  }

  return null;
}

/**
 * Get time-aware response based on hour
 */
function getTimeAwareResponse(hour: number, isWeekend: boolean): string | null {
  // Weekend awareness
  if (isWeekend && Math.random() < 0.3) {
    return randomFrom(TIME_AWARE_RESPONSES.weekend);
  }

  // Late night (10pm - 5am)
  if (hour >= 22 || hour < 5) {
    return randomFrom(TIME_AWARE_RESPONSES.lateNight);
  }

  // Early morning (5am - 8am)
  if (hour >= 5 && hour < 8) {
    return randomFrom(TIME_AWARE_RESPONSES.earlyMorning);
  }

  // Evening (6pm - 10pm)
  if (hour >= 18 && hour < 22) {
    return randomFrom(TIME_AWARE_RESPONSES.evening);
  }

  return null;
}

/**
 * Get topic-specific silence response
 */
function getTopicSpecificResponse(topic: string): string | null {
  const topicLower = topic.toLowerCase();

  // Check each topic category
  for (const [key, responses] of Object.entries(TOPIC_SPECIFIC_RESPONSES)) {
    if (topicLower.includes(key)) {
      return randomFrom(responses);
    }
  }

  // Additional pattern matching
  if (topicLower.match(/\b(mom|dad|parent|kid|child|son|daughter|wife|husband|spouse)\b/)) {
    return randomFrom(TOPIC_SPECIFIC_RESPONSES.family);
  }

  if (topicLower.match(/\b(die|death|died|passed|funeral|grief|mourn)\b/)) {
    return randomFrom(TOPIC_SPECIFIC_RESPONSES.loss);
  }

  if (topicLower.match(/\b(invest|stock|portfolio|401k|ira|save|budget)\b/)) {
    return randomFrom(TOPIC_SPECIFIC_RESPONSES.money);
  }

  return null;
}

/**
 * Get a persona-specific micro-story
 * Uses canonical ID resolution for consistent persona matching
 */
function getPersonaMicroStory(persona: PersonaConfig): string | null {
  const canonicalId = getCanonicalPersonaId(persona.id);

  const storyMap: Record<string, string[]> = {
    'nayan-patel': MICRO_STORIES.nayan,
    'peter-john': MICRO_STORIES.peterLynch,
    ferni: MICRO_STORIES.jackB,
    'alex-chen': MICRO_STORIES.alex,
    'maya-santos': MICRO_STORIES.maya,
    'jordan-taylor': MICRO_STORIES.jordan,
  };

  const stories = storyMap[canonicalId] || MICRO_STORIES.jackB;
  return randomFrom(stories);
}

/**
 * Get persona-appropriate gentle humor
 * Only some personas should use humor in silence
 * Uses canonical ID resolution for consistent persona matching
 */
function getPersonaHumor(persona: PersonaConfig): string | null {
  const canonicalId = getCanonicalPersonaId(persona.id);

  // Only humorous personas get humor
  const humorMap: Record<string, string[]> = {
    'peter-john': GENTLE_HUMOR.peterLynch,
    ferni: GENTLE_HUMOR.jackB,
    'jordan-taylor': GENTLE_HUMOR.jordan,
  };

  const humor = humorMap[canonicalId];
  if (humor) {
    return randomFrom(humor);
  }

  // Jack Bogle, Maya, Alex - no humor during silence (stay warm/professional)
  return null;
}

/**
 * HUMANIZATION FIX: Get a "thinking out loud" moment
 *
 * Real humans don't tell jokes during silence - they process out loud.
 * This creates genuine connection by showing visible thought process.
 *
 * Prioritizes content that connects to what the user just said.
 */
function getThinkingOutLoudMoment(context: SilenceContext, _persona: PersonaConfig): string | null {
  const { lastUserMessage, memorableMoments, recentEmotionalTone, wasDiscussingTopic } = context;

  // After a personal share - reference what they said
  if (recentEmotionalTone === 'heavy' || (memorableMoments && memorableMoments.length > 0)) {
    const templates = THINKING_OUT_LOUD.afterPersonalShare;
    let response = randomFrom(templates);

    // Substitute {topic} with something specific they mentioned
    if (memorableMoments && memorableMoments.length > 0) {
      response = response.replace('{topic}', memorableMoments[memorableMoments.length - 1]);
    } else if (wasDiscussingTopic) {
      response = response.replace('{topic}', wasDiscussingTopic);
    } else {
      // Remove the {topic} reference if we don't have anything specific
      response = response.replace(/<break time="[^"]+"\/>About \{topic\}\./, '');
    }

    return response;
  }

  // After a question from user - show we're genuinely thinking
  if (lastUserMessage && lastUserMessage.trim().endsWith('?')) {
    return randomFrom(THINKING_OUT_LOUD.afterQuestion);
  }

  // Generic thinking moment
  return randomFrom(THINKING_OUT_LOUD.general);
}

// ============================================================================
// ASYNC DYNAMIC CONTENT HELPERS
// ============================================================================

/**
 * Get a micro-story using dynamic content if available
 */
export async function getMicroStoryAsync(persona: PersonaConfig): Promise<string | null> {
  const canonicalId = getCanonicalPersonaId(persona.id);
  const dynamicContent = await getSilenceContent(canonicalId);

  if (dynamicContent?.micro_stories && dynamicContent.micro_stories.length > 0) {
    return randomFrom(dynamicContent.micro_stories);
  }

  // Fall back to static
  return getPersonaMicroStory(persona);
}

/**
 * Get a thoughtful question using dynamic content if available
 */
export async function getThoughtfulQuestionAsync(
  persona: PersonaConfig,
  topics: string[]
): Promise<string> {
  const canonicalId = getCanonicalPersonaId(persona.id);
  const dynamicContent = await getSilenceContent(canonicalId);

  // Try persona-specific voice questions first
  if (dynamicContent?.thoughtful_questions?.persona_voice) {
    const questions = dynamicContent.thoughtful_questions.persona_voice;
    if (questions.length > 0 && Math.random() < 0.6) {
      return randomFrom(questions);
    }
  }

  // Try topic-specific questions
  const topicLower = topics.map((t) => t.toLowerCase()).join(' ');

  if (topicLower.includes('family') || topicLower.includes('kid') || topicLower.includes('parent')) {
    const familyQuestions = dynamicContent?.thoughtful_questions?.family || THOUGHTFUL_QUESTIONS.family;
    return randomFrom(familyQuestions);
  }

  if (topicLower.includes('work') || topicLower.includes('job') || topicLower.includes('career')) {
    const workQuestions = dynamicContent?.thoughtful_questions?.work || THOUGHTFUL_QUESTIONS.work;
    return randomFrom(workQuestions);
  }

  // Fall back to general
  const generalQuestions = dynamicContent?.thoughtful_questions?.general || THOUGHTFUL_QUESTIONS.general;
  return randomFrom(generalQuestions);
}

/**
 * Get a music offering using dynamic content if available
 */
export async function getMusicOfferingAsync(persona: PersonaConfig): Promise<string> {
  const canonicalId = getCanonicalPersonaId(persona.id);
  const dynamicContent = await getSilenceContent(canonicalId);

  if (dynamicContent?.music_offerings && dynamicContent.music_offerings.length > 0) {
    return randomFrom(dynamicContent.music_offerings);
  }

  return randomFrom(MUSIC_OFFERINGS);
}

/**
 * Get time-aware response using dynamic content if available
 */
export async function getTimeAwareResponseAsync(
  persona: PersonaConfig,
  hour: number,
  isWeekend: boolean
): Promise<string | null> {
  const canonicalId = getCanonicalPersonaId(persona.id);
  const dynamicContent = await getSilenceContent(canonicalId);

  // Weekend awareness
  if (isWeekend && Math.random() < 0.3) {
    const weekend = dynamicContent?.time_aware?.weekend || TIME_AWARE_RESPONSES.weekend;
    return randomFrom(weekend);
  }

  // Late night (10pm - 5am)
  if (hour >= 22 || hour < 5) {
    const lateNight = dynamicContent?.time_aware?.late_night || TIME_AWARE_RESPONSES.lateNight;
    return randomFrom(lateNight);
  }

  // Early morning (5am - 8am)
  if (hour >= 5 && hour < 8) {
    const earlyMorning = dynamicContent?.time_aware?.early_morning || TIME_AWARE_RESPONSES.earlyMorning;
    return randomFrom(earlyMorning);
  }

  // Evening (6pm - 10pm)
  if (hour >= 18 && hour < 22) {
    const evening = dynamicContent?.time_aware?.evening || TIME_AWARE_RESPONSES.evening;
    return randomFrom(evening);
  }

  return null;
}

// ============================================================================
// PROGRESSIVE SILENCE HANDLER
// ============================================================================

/**
 * Track silence and provide progressive, meaningful responses
 *
 * Call this periodically during silence to get the right response
 * for the current duration
 */
export class SilenceHandler {
  private silenceStartTime: number | null = null;
  private responsesSent: SilenceResponseType[] = [];
  private context: SilenceContext;
  private persona: PersonaConfig;

  constructor(persona: PersonaConfig) {
    this.persona = persona;
    this.context = {
      silenceDurationSeconds: 0,
      turnCount: 0,
      topicsDiscussed: [],
    };
  }

  /**
   * Call when silence begins
   */
  startSilence(): void {
    this.silenceStartTime = Date.now();
    this.responsesSent = [];
  }

  /**
   * Call when user speaks
   */
  endSilence(): void {
    this.silenceStartTime = null;
    this.responsesSent = [];
  }

  /**
   * Update context with conversation info
   */
  updateContext(updates: Partial<SilenceContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Get the next silence response if appropriate
   * Returns null if it's too early or we've already responded at this interval
   */
  getNextResponse(): SilenceResponse | null {
    if (!this.silenceStartTime) return null;

    const silenceDuration = (Date.now() - this.silenceStartTime) / 1000;
    this.context.silenceDurationSeconds = silenceDuration;

    // Determine what response type we'd give at this duration
    const response = getMeaningfulSilenceResponse(this.persona, this.context);

    // Don't repeat the same type of response
    if (this.responsesSent.includes(response.type)) {
      return null;
    }

    // Check if we should respond at this duration
    // First response at 10s, then 20s, then 35s
    const shouldRespond =
      (silenceDuration >= 10 && !this.responsesSent.includes('comfortable_presence')) ||
      (silenceDuration >= 20 &&
        !this.responsesSent.includes('memory_callback') &&
        !this.responsesSent.includes('thoughtful_question')) ||
      (silenceDuration >= 35 &&
        !this.responsesSent.includes('music_offering') &&
        !this.responsesSent.includes('gentle_observation'));

    if (!shouldRespond) return null;

    this.responsesSent.push(response.type);
    return response;
  }

  /**
   * Check if silence is currently active
   */
  isInSilence(): boolean {
    return this.silenceStartTime !== null;
  }

  /**
   * Get current silence duration in seconds
   */
  getSilenceDuration(): number {
    if (!this.silenceStartTime) return 0;
    return (Date.now() - this.silenceStartTime) / 1000;
  }
}

// ============================================================================
// MEMORABLE MOMENT DETECTION
// ============================================================================

/**
 * Patterns that indicate someone sharing something memorable/personal
 */
const MEMORABLE_PATTERNS = [
  // Family mentions
  {
    pattern:
      /\b(?:my|our)\s+(mom|mother|dad|father|wife|husband|spouse|son|daughter|kid|child|brother|sister|grandma|grandfather|grandmother|grandpa|baby)\b/i,
    category: 'family',
  },
  { pattern: /\b(?:named?|called?)\s+(\w+)/i, category: 'name' },

  // Life events
  { pattern: /\b(?:getting|got)\s+(?:married|engaged|divorced)/i, category: 'life_event' },
  { pattern: /\b(?:expecting|pregnant|having)\s+(?:a\s+)?(?:baby|child)/i, category: 'life_event' },
  { pattern: /\b(?:retiring|retired|retirement)/i, category: 'life_event' },
  { pattern: /\b(?:moving|moved)\s+(?:to|from)/i, category: 'life_event' },
  {
    pattern: /\b(?:starting|started)\s+(?:a\s+)?(?:new\s+)?(?:job|business|company)/i,
    category: 'life_event',
  },
  { pattern: /\b(?:lost|passed|died|death)/i, category: 'loss' },

  // Emotional shares
  { pattern: /\b(?:worried|scared|afraid|anxious|nervous)\s+(?:about|that)/i, category: 'fear' },
  { pattern: /\b(?:dream|hope|wish|want)\s+(?:to|is|was)/i, category: 'dream' },
  { pattern: /\b(?:struggling|struggle)\s+with/i, category: 'struggle' },
  { pattern: /\b(?:proud|excited|happy)\s+(?:about|that|of)/i, category: 'joy' },

  // Specific details
  { pattern: /(\d+)\s+years?\s+(?:old|ago|married|together)/i, category: 'time_detail' },
  { pattern: /\b(?:first|only|last)\s+(?:time|child|job|house|home|car)/i, category: 'milestone' },
];

/**
 * Extract memorable moments from user message
 * Returns details worth remembering/referencing later
 *
 * NOTE: This now delegates to the unified moment detection system
 * for consistency across all moment detection in the codebase.
 */
import { extractMemorableMoments as extractFromUnified } from './unified-moment-detection.js';

export function extractMemorableMoments(message: string): string[] {
  // Delegate to unified moment detection
  const unifiedDetails = extractFromUnified(message);

  // Supplement with local patterns for more specific detail extraction
  // that the unified system might miss
  const localMoments: string[] = [];
  const messageLower = message.toLowerCase();

  for (const { pattern, category } of MEMORABLE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Create a natural reference phrase based on what they shared
      switch (category) {
        case 'family':
          if (match[1]) {
            localMoments.push(`your ${match[1].toLowerCase()}`);
          }
          break;
        case 'name':
          // They mentioned a name - probably family
          if (match[1] && match[1].length > 2) {
            localMoments.push(match[1]);
          }
          break;
        case 'life_event':
          if (messageLower.includes('married') || messageLower.includes('engaged')) {
            localMoments.push('getting married');
          } else if (messageLower.includes('baby') || messageLower.includes('pregnant')) {
            localMoments.push('the baby');
          } else if (messageLower.includes('retir')) {
            localMoments.push('retirement');
          } else if (messageLower.includes('mov')) {
            localMoments.push('the move');
          } else if (messageLower.includes('job') || messageLower.includes('business')) {
            localMoments.push('the new job');
          }
          break;
        case 'loss':
          localMoments.push('your loss');
          break;
        case 'fear': {
          // Extract what they're worried about
          const fearMatch = message.match(
            /(?:worried|scared|afraid|anxious|nervous)\s+(?:about|that)\s+(.{10,50})/i
          );
          if (fearMatch) {
            localMoments.push(fearMatch[1].replace(/[.,!?].*/, '').trim());
          }
          break;
        }
        case 'dream': {
          const dreamMatch = message.match(
            /(?:dream|hope|wish|want)\s+(?:to|is|was)\s+(.{10,50})/i
          );
          if (dreamMatch) {
            localMoments.push(`wanting to ${dreamMatch[1].replace(/[.,!?].*/, '').trim()}`);
          }
          break;
        }
        case 'milestone':
          if (messageLower.includes('first')) {
            const firstMatch = message.match(/first\s+(\w+)/i);
            if (firstMatch) {
              localMoments.push(`your first ${firstMatch[1].toLowerCase()}`);
            }
          }
          break;
      }
    }
  }

  // Combine unified + local, deduplicate and limit
  const combined = [...unifiedDetails, ...localMoments];
  return [...new Set(combined)].slice(0, 5);
}

/**
 * Merge new memorable moments with existing ones
 * Keeps the most recent/relevant
 */
export function mergeMemorableMoments(existing: string[], newMoments: string[]): string[] {
  const combined = [...newMoments, ...existing];
  return [...new Set(combined)].slice(0, 5);
}

// ============================================================================
// AMBIENT MUSIC DURING SILENCE
// ============================================================================

/**
 * Play ambient music during extended silence
 * Returns true if music started playing
 *
 * Configuration via environment:
 * - AMBIENT_MUSIC_ENABLED: Set to 'false' to disable
 * - AMBIENT_MUSIC_URLS: Comma-separated list of audio URLs
 * - AMBIENT_TRACK_1, AMBIENT_TRACK_2, AMBIENT_TRACK_3: Individual track URLs
 */
export async function playAmbientMusicDuringSilence(): Promise<boolean> {
  return playAmbient();
}

/**
 * Stop ambient music (when user starts speaking again)
 */
export function stopAmbientMusic(): void {
  stopAmbient();
}

// ============================================================================
// ASYNC VERSION WITH FULL LLM GENERATION
// ============================================================================

/**
 * Get a meaningful silence response with full LLM-powered question generation
 *
 * This is the "Better than Human" version that:
 * - Uses LLM to generate truly contextual questions
 * - Grounds questions in persona voice
 * - Tracks question intent (knows WHY it's asking)
 * - Provides follow-up strategies for any response
 *
 * @param persona - The active persona
 * @param context - Silence context
 * @param sessionId - Session ID for deduplication
 * @returns Promise<SilenceResponse> with dynamically generated content
 */
export async function getMeaningfulSilenceResponseAsync(
  persona: PersonaConfig,
  context: SilenceContext,
  sessionId: string
): Promise<SilenceResponse & { intent?: string }> {
  const { silenceDurationSeconds, recentEmotionalTone, turnCount } = context;

  // For short silences or heavy topics, use sync version (presence, not questions)
  if (silenceDurationSeconds < 15 || recentEmotionalTone === 'heavy') {
    return getMeaningfulSilenceResponse(persona, context);
  }

  // For longer silences, try dynamic question generation
  if (silenceDurationSeconds >= 15 && silenceDurationSeconds < 40) {
    try {
      const { text, intent } = await getDynamicThoughtfulQuestion(context, persona, sessionId);
      return {
        type: 'thoughtful_question',
        text,
        invitesReply: true,
        intent, // Expose intent so agent knows WHY it asked
      };
    } catch (error) {
      log.warn({ error: String(error) }, 'Async question generation failed');
    }
  }

  // Fall back to sync version
  return getMeaningfulSilenceResponse(persona, context);
}

// ============================================================================
// LLM-DRIVEN SILENCE RESPONSES (NEW!)
// Instead of static phrases, let the LLM generate contextual responses
// ============================================================================

/**
 * LLM instructions for silence responses
 */
export interface LLMSilenceInstructions {
  /** Instructions for generateReply() */
  instructions: string;
  /** Whether to allow interruptions */
  allowInterruptions: boolean;
  /** Fallback text if LLM fails */
  fallback: string;
  /** Type of silence response */
  type: SilenceResponseType;
  /** Whether this invites a reply */
  invitesReply: boolean;
}

/**
 * Build LLM instructions for a contextual silence response
 *
 * Instead of picking from static phrases, let the LLM generate
 * something that feels genuine and responsive to the moment.
 *
 * This is the sync version that uses fallback guidance. For dynamic
 * persona-specific guidance, use buildLLMSilenceInstructionsAsync.
 */
export function buildLLMSilenceInstructions(
  persona: PersonaConfig,
  context: SilenceContext
): LLMSilenceInstructions {
  return buildLLMSilenceInstructionsInternal(persona, context, null);
}

/**
 * Build LLM instructions with dynamic persona-specific content
 *
 * Loads persona-specific guidance templates from bundles for more
 * natural, persona-voiced responses.
 */
export async function buildLLMSilenceInstructionsAsync(
  persona: PersonaConfig,
  context: SilenceContext
): Promise<LLMSilenceInstructions> {
  const canonicalId = getCanonicalPersonaId(persona.id);
  const dynamicContent = await getSilenceContent(canonicalId);
  return buildLLMSilenceInstructionsInternal(persona, context, dynamicContent);
}

/**
 * Internal implementation for building LLM silence instructions
 */
function buildLLMSilenceInstructionsInternal(
  persona: PersonaConfig,
  context: SilenceContext,
  dynamicContent: SilenceResponses | null
): LLMSilenceInstructions {
  const {
    silenceDurationSeconds,
    lastUserMessage,
    recentEmotionalTone,
    wasDiscussingTopic,
    topicsDiscussed,
    turnCount,
    userName,
    currentHour = new Date().getHours(),
    isMusicPlaying,
  } = context;

  // Build context hints
  const contextHints: string[] = [];

  if (lastUserMessage) {
    contextHints.push(`Last thing user said: "${lastUserMessage.slice(0, 100)}"`);
  }

  if (wasDiscussingTopic) {
    contextHints.push(`You were discussing: ${wasDiscussingTopic}`);
  } else if (topicsDiscussed && topicsDiscussed.length > 0) {
    contextHints.push(`Topics this session: ${topicsDiscussed.slice(-3).join(', ')}`);
  }

  if (recentEmotionalTone === 'heavy') {
    contextHints.push('The conversation has been heavy/emotional - be gentle');
  }

  if (userName) {
    contextHints.push(`User's name: ${userName}`);
  }

  // Time of day awareness
  const timeHint =
    currentHour >= 22 || currentHour < 6
      ? "It's late night - gentle, soft energy"
      : currentHour >= 6 && currentHour < 12
        ? "It's morning - steady energy"
        : '';

  // Get usage rules from dynamic content or use defaults
  const rules = dynamicContent?.usage_rules;
  const firstThreshold = rules?.first_silence_threshold_sec ?? 12;
  const secondThreshold = rules?.second_silence_threshold_sec ?? 25;
  const questionMinTurns = rules?.thoughtful_question_min_turn_count ?? 5;

  // Determine response type based on silence duration
  let responseType: SilenceResponseType;
  let responseGuidance: string;
  let invitesReply = false;

  // Check if we have content for a memory callback
  const hasTopicsToReference =
    (topicsDiscussed && topicsDiscussed.length > 0) || wasDiscussingTopic || lastUserMessage;

  // Get dynamic guidance templates if available
  const llmGuidance = dynamicContent?.llm_guidance;

  if (silenceDurationSeconds < firstThreshold || recentEmotionalTone === 'heavy') {
    // Short silence or heavy topic - just presence
    responseType = 'comfortable_presence';
    responseGuidance =
      llmGuidance?.presence?.instruction_template?.replace(
        '{duration}',
        String(Math.round(silenceDurationSeconds))
      ) ||
      `Just offer presence. Short, warm. Like "I'm here" or "Take your time." 
Don't ask questions. Don't fill the silence with words. Just BE THERE.
One short sentence max. Often just a few words is perfect.`;
    invitesReply = false;
  } else if (silenceDurationSeconds < secondThreshold && hasTopicsToReference) {
    // Medium silence WITH something to reference - use memory callback
    responseType = 'memory_callback';
    responseGuidance =
      llmGuidance?.memory_callback?.instruction_template?.replace(
        '{duration}',
        String(Math.round(silenceDurationSeconds))
      ) ||
      `Gently reference something they shared earlier or what you were discussing.
Example: "I keep thinking about what you said about [topic]."
Don't push for a response. Just show you're still engaged with their story.
Keep it brief - one sentence.`;
    invitesReply = false;
  } else if (silenceDurationSeconds < secondThreshold) {
    // Medium silence but NO topics to reference - fall back to presence
    responseType = 'comfortable_presence';
    responseGuidance =
      llmGuidance?.presence?.instruction_template?.replace(
        '{duration}',
        String(Math.round(silenceDurationSeconds))
      ) ||
      `Just offer warm presence. Short and gentle.
Like "I'm here with you" or "Take all the time you need."
One short sentence. Don't ask questions yet.`;
    invitesReply = false;
  } else if (turnCount >= questionMinTurns) {
    // Longer silence, established conversation - thoughtful question
    responseType = 'thoughtful_question';
    responseGuidance =
      llmGuidance?.thoughtful_question?.instruction_template?.replace(
        '{duration}',
        String(Math.round(silenceDurationSeconds))
      ) ||
      `Ask ONE thoughtful question that shows you've been listening.
Based on what they've shared, ask something that invites deeper reflection.
NOT generic ("how's your day?"). Make it SPECIFIC to them.
Example: "What would [person they mentioned] say about this?"
Keep it conversational - like a friend genuinely curious.`;
    invitesReply = true;
  } else {
    // Early conversation, long silence - gentle check-in
    responseType = 'warm_check_in';
    responseGuidance =
      llmGuidance?.check_in?.instruction_template?.replace(
        '{duration}',
        String(Math.round(silenceDurationSeconds))
      ) ||
      `Gentle check-in without pressure.
Example: "Just checking in - what's on your mind?"
Keep it open. No pressure. Give them space.`;
    invitesReply = true;
  }

  // Don't speak if music is playing and silence is short
  const musicMinimumSec = rules?.music_playing_minimum_sec ?? 20;
  if (isMusicPlaying && silenceDurationSeconds < musicMinimumSec) {
    return {
      instructions: '',
      allowInterruptions: true,
      fallback: '',
      type: 'comfortable_presence',
      invitesReply: false,
    };
  }

  // CRITICAL: Instructions must NOT start with identity statements like "You are Ferni..."
  // The Gemini Live API puts instructions as role:'model' which causes echoing if it looks like
  // something the model would say. Start with an action verb to prevent echoing.
  // See: node_modules/@livekit/agents-plugin-google/src/beta/realtime/realtime_api.ts:652-662
  const instructions = `Respond briefly to the user's silence (${Math.round(silenceDurationSeconds)} seconds).

${responseGuidance}

${contextHints.length > 0 ? `Context to reference (don't read this out): ${contextHints.join('; ')}` : ''}

RULES:
- Maximum 1-2 sentences
- ${timeHint ? timeHint : 'Natural, present energy'}
- No SSML tags or special formatting
- Just speak naturally`;

  // Generate fallback using static system
  const staticResponse = getMeaningfulSilenceResponse(persona, context);

  return {
    instructions,
    allowInterruptions: true,
    fallback: staticResponse.text,
    type: responseType,
    invitesReply,
  };
}

/**
 * Get LLM-driven silence response instructions (sync version)
 *
 * Use this with session.generateReply() for natural, contextual responses
 * that feel genuinely responsive to the moment.
 *
 * @example
 * const silenceInstructions = getLLMSilenceInstructions(persona, context);
 * if (silenceInstructions.instructions) {
 *   await session.generateReply({
 *     instructions: silenceInstructions.instructions,
 *     allowInterruptions: silenceInstructions.allowInterruptions
 *   });
 * }
 */
export function getLLMSilenceInstructions(
  persona: PersonaConfig,
  context: SilenceContext
): LLMSilenceInstructions {
  return buildLLMSilenceInstructions(persona, context);
}

/**
 * Get LLM-driven silence response instructions (async version)
 *
 * This version loads persona-specific content from bundles for
 * more natural, persona-voiced responses.
 *
 * @example
 * const silenceInstructions = await getLLMSilenceInstructionsAsync(persona, context);
 * if (silenceInstructions.instructions) {
 *   await session.generateReply({
 *     instructions: silenceInstructions.instructions,
 *     allowInterruptions: silenceInstructions.allowInterruptions
 *   });
 * }
 */
export async function getLLMSilenceInstructionsAsync(
  persona: PersonaConfig,
  context: SilenceContext
): Promise<LLMSilenceInstructions> {
  return buildLLMSilenceInstructionsAsync(persona, context);
}

/**
 * Preload silence content for a persona (call during initialization)
 * This warms the cache so subsequent calls are fast.
 */
export async function preloadSilenceContent(personaId: string): Promise<void> {
  await getSilenceContent(personaId);
}

/**
 * Clear the silence content cache (for testing)
 */
export function clearSilenceContentCache(): void {
  silenceContentCache.clear();
}

// Export types and utilities for other modules
export type { QuestionContext, GeneratedQuestion };
export { getDynamicThoughtfulQuestion, silenceContextToQuestionContext, getSilenceContent };

export default getMeaningfulSilenceResponse;
