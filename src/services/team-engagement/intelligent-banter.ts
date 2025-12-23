/**
 * Intelligent Banter Service
 *
 * Generates contextually-aware handoff banter based on:
 * - Current conversation topic
 * - User emotional state
 * - Handoff count (shorter for repeat transfers)
 * - Relationship depth (warmer for long-time users)
 * - Time of day (energy level adjustment)
 * - Handoff reason (why we're transferring)
 *
 * NOW LLM-DRIVEN: Instead of template-based generation, we provide
 * instructions to the LLM to generate natural, contextual banter.
 * This makes handoffs feel more genuine and responsive to the moment.
 *
 * @module team-engagement/intelligent-banter
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getHandoffBanter, getArrivingBanter } from './banter.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface BanterContext {
  /** Current conversation topic if detected */
  currentTopic?: string;
  /** User's detected emotional state */
  userEmotion?: 'positive' | 'neutral' | 'negative' | 'stressed' | 'excited';
  /** Number of handoffs in this session (use for brevity) */
  handoffCountThisSession?: number;
  /** Is this a first-time user? */
  isFirstTimeUser?: boolean;
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** User's name if known */
  userName?: string;
  /** Reason for handoff if known */
  handoffReason?: string;
  /** Total sessions with this user (relationship depth) */
  totalSessions?: number;
  /** Relationship stage */
  relationshipStage?: 'new' | 'building' | 'established' | 'deep';
}

export interface IntelligentBanterResult {
  /** Banter for departing persona (soft open) */
  softOpenBanter: string;
  /** Banter for arriving persona */
  arrivingBanter: string;
  /** Whether intelligent banter was used (vs fallback) */
  wasIntelligent: boolean;
  /** Debug info about what context was used */
  contextUsed?: {
    topic?: string;
    emotion?: string;
    timeOfDay?: string;
    relationshipDepth?: string;
    handoffReason?: string;
  };
}

// ============================================================================
// TIME-OF-DAY ENERGY PROFILES
// ============================================================================

interface TimeEnergyProfile {
  greeting: string;
  energy: 'high' | 'medium' | 'low';
  style: 'bright' | 'steady' | 'calm' | 'gentle';
}

const TIME_ENERGY: Record<string, TimeEnergyProfile> = {
  morning: {
    greeting: 'Hey!',
    energy: 'high',
    style: 'bright',
  },
  afternoon: {
    greeting: 'Hey!',
    energy: 'medium',
    style: 'steady',
  },
  evening: {
    greeting: 'Hey.',
    energy: 'medium',
    style: 'calm',
  },
  night: {
    greeting: 'Hey.',
    energy: 'low',
    style: 'gentle',
  },
};

// ============================================================================
// RELATIONSHIP DEPTH MODIFIERS
// ============================================================================

interface RelationshipProfile {
  warmth: 'formal' | 'friendly' | 'warm' | 'intimate';
  canUseNicknames: boolean;
  callbacks: boolean; // Can reference past conversations
}

const RELATIONSHIP_PROFILES: Record<string, RelationshipProfile> = {
  new: {
    warmth: 'friendly',
    canUseNicknames: false,
    callbacks: false,
  },
  building: {
    warmth: 'friendly',
    canUseNicknames: false,
    callbacks: true,
  },
  established: {
    warmth: 'warm',
    canUseNicknames: true,
    callbacks: true,
  },
  deep: {
    warmth: 'intimate',
    canUseNicknames: true,
    callbacks: true,
  },
};

// ============================================================================
// PERSONA BANTER TRAITS (ENHANCED)
// ============================================================================

interface PersonaBanterTrait {
  style: string;
  topicPhrases: Record<string, string>;
  emotionModifiers: Record<string, string>;
  timeModifiers: Record<string, string>;
  relationshipWarmth: Record<string, string>;
  reasonPhrases: Record<string, string>;
}

const PERSONA_BANTER_TRAITS: Record<string, PersonaBanterTrait> = {
  ferni: {
    style: 'warm and brief',
    topicPhrases: {
      habits: 'Maya knows habits.',
      calendar: 'Alex will sort that.',
      planning: 'Jordan lives for this.',
      research: 'Peter will find the pattern.',
      wisdom: 'Nayan has perspective.',
      work: 'Alex can help with that.',
      stress: "You're in good hands.",
      default: "They've got you.",
    },
    emotionModifiers: {
      stressed: "You're in good hands.",
      negative: 'Take care.',
      excited: 'This is gonna be good.',
      default: '',
    },
    timeModifiers: {
      morning: 'Good energy for this.',
      night: "They'll take good care of you.",
      default: '',
    },
    relationshipWarmth: {
      deep: 'You know how good they are.',
      established: 'They always come through.',
      default: '',
    },
    reasonPhrases: {
      scheduling: 'Calendar stuff.',
      habits: 'Habit building time.',
      planning: 'Vision time.',
      research: 'Data time.',
      wisdom: 'Deep stuff.',
      default: '',
    },
  },

  'alex-chen': {
    style: 'efficient and caring',
    topicPhrases: {
      habits: 'Maya will build that system.',
      planning: 'Jordan will dream it up.',
      research: 'Peter will crunch that.',
      wisdom: 'Nayan has the long view.',
      coaching: 'Ferni will help.',
      stress: 'One step at a time.',
      default: "They've got this.",
    },
    emotionModifiers: {
      stressed: 'Breathe. One thing at a time.',
      negative: "They'll help.",
      excited: "Let's make it happen.",
      default: '',
    },
    timeModifiers: {
      morning: 'Peak productivity time.',
      night: 'Wind-down mode.',
      default: '',
    },
    relationshipWarmth: {
      deep: "You know I've got you.",
      established: 'We make a good team.',
      default: '',
    },
    reasonPhrases: {
      habits: 'Routine building.',
      planning: 'Vision stuff.',
      research: 'Pattern finding.',
      wisdom: 'The big questions.',
      default: '',
    },
  },

  'maya-santos': {
    style: 'gentle and supportive',
    topicPhrases: {
      calendar: 'Alex will organize that.',
      planning: 'Jordan sees the vision.',
      research: 'Peter will analyze.',
      wisdom: 'Nayan knows.',
      coaching: 'Ferni will guide you.',
      stress: 'Small steps.',
      default: "They're perfect for this.",
    },
    emotionModifiers: {
      stressed: 'Small steps. You got this.',
      negative: "They'll be there.",
      excited: 'Love this energy!',
      default: '',
    },
    timeModifiers: {
      morning: 'Morning momentum!',
      night: 'Rest is part of the system.',
      default: '',
    },
    relationshipWarmth: {
      deep: "We've built something real together.",
      established: "You're doing great.",
      default: '',
    },
    reasonPhrases: {
      scheduling: 'Calendar help.',
      planning: 'Dream building.',
      research: 'Data stuff.',
      wisdom: 'The deeper why.',
      default: '',
    },
  },

  'jordan-taylor': {
    style: 'energetic and brief',
    topicPhrases: {
      habits: 'Maya makes dreams real.',
      calendar: 'Alex will schedule it.',
      research: 'Peter sees patterns.',
      wisdom: 'Nayan grounds it.',
      coaching: 'Ferni will help.',
      stress: 'You got this.',
      default: "They've got this!",
    },
    emotionModifiers: {
      stressed: "Deep breath. You've got this.",
      negative: 'Better things ahead.',
      excited: "Yes! Let's go!",
      default: '',
    },
    timeModifiers: {
      morning: 'Morning magic!',
      night: 'Dream time.',
      default: '',
    },
    relationshipWarmth: {
      deep: "Look how far you've come!",
      established: 'We dream big together.',
      default: '',
    },
    reasonPhrases: {
      habits: 'System building.',
      scheduling: 'Calendar time.',
      research: 'Data dive.',
      wisdom: 'Soul searching.',
      default: '',
    },
  },

  'nayan-patel': {
    style: 'measured and calm',
    topicPhrases: {
      habits: 'Maya understands practice.',
      calendar: 'Alex brings order.',
      planning: 'Jordan has vision.',
      research: 'Peter sees patterns.',
      coaching: 'Ferni will guide.',
      stress: 'Breathe.',
      default: 'They will help.',
    },
    emotionModifiers: {
      stressed: 'Breathe. This too shall pass.',
      negative: 'They understand.',
      excited: 'Beautiful energy.',
      default: '',
    },
    timeModifiers: {
      morning: 'Fresh beginnings.',
      night: 'The quiet hours have wisdom.',
      default: '',
    },
    relationshipWarmth: {
      deep: 'Our conversations have meant much.',
      established: 'Growth takes time. You have it.',
      default: '',
    },
    reasonPhrases: {
      habits: 'The daily practice.',
      scheduling: 'Ordering time.',
      planning: 'Building vision.',
      research: 'Finding patterns.',
      default: '',
    },
  },

  'peter-john': {
    style: 'quick and data-focused',
    topicPhrases: {
      habits: 'Maya builds systems.',
      calendar: 'Alex optimizes.',
      planning: 'Jordan dreams big.',
      wisdom: 'Nayan has perspective.',
      coaching: 'Ferni knows.',
      stress: 'The data helps.',
      default: "They'll help.",
    },
    emotionModifiers: {
      stressed: 'Numbers bring clarity.',
      negative: 'They see the path.',
      excited: 'The patterns look good!',
      default: '',
    },
    timeModifiers: {
      morning: 'Peak analysis hours.',
      night: 'Reflection time.',
      default: '',
    },
    relationshipWarmth: {
      deep: 'Your data tells a good story.',
      established: 'The patterns are interesting.',
      default: '',
    },
    reasonPhrases: {
      habits: 'System design.',
      scheduling: 'Time optimization.',
      planning: 'Vision building.',
      wisdom: 'The bigger picture.',
      default: '',
    },
  },
};

// ============================================================================
// TOPIC DETECTION
// ============================================================================

const TOPIC_KEYWORDS: Record<string, string[]> = {
  habits: [
    'habit',
    'routine',
    'morning',
    'exercise',
    'meditation',
    'sleep',
    'daily',
    'workout',
    'practice',
  ],
  calendar: ['calendar', 'schedule', 'meeting', 'appointment', 'time', 'busy', 'available', 'book'],
  planning: [
    'plan',
    'goal',
    'milestone',
    'future',
    'dream',
    'vision',
    'celebrate',
    'birthday',
    'event',
  ],
  research: [
    'research',
    'data',
    'pattern',
    'analyze',
    'number',
    'trend',
    'investment',
    'stock',
    'money',
  ],
  wisdom: [
    'meaning',
    'purpose',
    'life',
    'philosophy',
    'perspective',
    'deep',
    'why',
    'death',
    'legacy',
  ],
  coaching: ['help', 'advice', 'guidance', 'feeling', 'struggle', 'support', 'stuck', 'confused'],
  work: ['work', 'job', 'career', 'boss', 'colleague', 'project', 'deadline', 'promotion'],
  stress: ['stressed', 'overwhelmed', 'anxious', 'worried', 'nervous', 'scared', 'panicking'],
};

function detectTopicCategory(topic?: string, reason?: string): string {
  const searchText = `${topic || ''} ${reason || ''}`.toLowerCase();
  if (!searchText.trim()) return 'default';

  for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) {
      return category;
    }
  }

  return 'default';
}

// ============================================================================
// RELATIONSHIP STAGE DETECTION
// ============================================================================

function detectRelationshipStage(
  context: BanterContext
): 'new' | 'building' | 'established' | 'deep' {
  // Explicit stage overrides
  if (context.relationshipStage) return context.relationshipStage;

  const sessions = context.totalSessions || 0;

  if (context.isFirstTimeUser || sessions <= 1) return 'new';
  if (sessions <= 5) return 'building';
  if (sessions <= 20) return 'established';
  return 'deep';
}

// ============================================================================
// INTELLIGENT BANTER GENERATION
// ============================================================================

function generateSoftOpenBanter(
  fromPersonaId: string,
  toPersonaId: string,
  context: BanterContext
): string | null {
  const traits = PERSONA_BANTER_TRAITS[fromPersonaId];
  if (!traits) return null;

  const handoffCount = context.handoffCountThisSession || 0;
  const timeProfile = TIME_ENERGY[context.timeOfDay || 'afternoon'];
  const relationshipStage = detectRelationshipStage(context);
  const relationshipProfile = RELATIONSHIP_PROFILES[relationshipStage];
  const topicCategory = detectTopicCategory(context.currentTopic, context.handoffReason);

  // BREVITY MODE: After 2+ handoffs, be minimal
  if (handoffCount > 2) {
    return getMinimalHandoff(toPersonaId);
  }

  // SLIGHTLY SHORTER: After 1 handoff, trim extras
  const isRepeatHandoff = handoffCount > 0;

  // Build banter parts
  const parts: string[] = [];

  // 1. Name + optional reason context
  const personaName = getPersonaFirstName(toPersonaId);
  if (context.handoffReason && !isRepeatHandoff) {
    const reasonPhrase = traits.reasonPhrases[topicCategory] || '';
    if (reasonPhrase) {
      parts.push(`${personaName}! ${reasonPhrase}`);
    } else {
      parts.push(`${personaName}!`);
    }
  } else {
    parts.push(`${personaName}!`);
  }

  // 2. Topic-specific phrase
  const topicPhrase = traits.topicPhrases[topicCategory];
  if (topicPhrase && topicPhrase !== "They've got you." && !isRepeatHandoff) {
    parts.push(topicPhrase);
  }

  // 3. Emotion modifier (always include if stressed/negative)
  const emotionKey = context.userEmotion || 'default';
  const emotionMod = traits.emotionModifiers[emotionKey];
  if (emotionMod && (emotionKey === 'stressed' || emotionKey === 'negative')) {
    parts.push(emotionMod);
  }

  // 4. Time modifier (only for deep relationships, morning/night)
  if (
    relationshipProfile.warmth === 'intimate' &&
    !isRepeatHandoff &&
    (context.timeOfDay === 'morning' || context.timeOfDay === 'night')
  ) {
    const timeMod = traits.timeModifiers[context.timeOfDay];
    if (timeMod) {
      parts.push(timeMod);
    }
  }

  // 5. Relationship warmth (only for established+ relationships)
  if (relationshipStage === 'deep' && !isRepeatHandoff && timeProfile.energy !== 'low') {
    const warmth = traits.relationshipWarmth[relationshipStage];
    if (warmth && Math.random() < 0.3) {
      // 30% chance to include warmth
      parts.push(warmth);
    }
  }

  return parts.join(' ').trim();
}

function generateArrivingBanter(
  toPersonaId: string,
  fromPersonaId: string,
  context: BanterContext
): string | null {
  const handoffCount = context.handoffCountThisSession || 0;
  const timeProfile = TIME_ENERGY[context.timeOfDay || 'afternoon'];
  const relationshipStage = detectRelationshipStage(context);
  const topicCategory = detectTopicCategory(context.currentTopic, context.handoffReason);

  // BREVITY MODE: After 2+ handoffs
  if (handoffCount > 2) {
    return getMinimalArrival(toPersonaId, topicCategory);
  }

  // Build greeting parts
  const parts: string[] = [];

  // 1. Time-appropriate greeting
  parts.push(timeProfile.greeting);

  // 2. Optional name for deep relationships
  if (relationshipStage === 'deep' && context.userName && Math.random() < 0.4) {
    // 40% chance to use name for deep relationships
    // But only if it feels natural
  }

  // 3. Topic-specific question OR reason acknowledgment
  if (context.handoffReason && handoffCount === 0) {
    // First handoff with reason - acknowledge it
    const ack = getReasonAcknowledgment(toPersonaId, context.handoffReason);
    if (ack) {
      parts.push(ack);
    } else {
      parts.push(getTopicQuestion(toPersonaId, topicCategory));
    }
  } else {
    parts.push(getTopicQuestion(toPersonaId, topicCategory));
  }

  return parts.join(' ').trim();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMinimalHandoff(toPersonaId: string): string {
  const name = getPersonaFirstName(toPersonaId);
  // Vary slightly to avoid feeling robotic
  const variants = [`${name}.`, `${name}!`, `Let me get ${name}.`];
  return variants[Math.floor(Math.random() * variants.length)];
}

function getMinimalArrival(toPersonaId: string, topicCategory: string): string {
  const questions: Record<string, Record<string, string>> = {
    'alex-chen': {
      habits: "What's the plan?",
      calendar: 'What needs scheduling?',
      default: "What's next?",
    },
    'maya-santos': {
      calendar: "What's the goal?",
      planning: "What's the first step?",
      default: "What's the goal?",
    },
    'jordan-taylor': {
      habits: "What's the vision?",
      calendar: "What's the dream?",
      default: "What's next?",
    },
    'nayan-patel': {
      default: "What's on your mind?",
    },
    'peter-john': {
      default: "What's the question?",
    },
    ferni: {
      default: "What's up?",
    },
  };

  const personaQs = questions[toPersonaId] || questions.ferni;
  return personaQs[topicCategory] || personaQs.default || "What's up?";
}

function getTopicQuestion(personaId: string, topicCategory: string): string {
  const questions: Record<string, Record<string, string>> = {
    'alex-chen': {
      habits: 'What needs scheduling?',
      calendar: 'What needs organizing?',
      planning: "What's the timeline?",
      work: "What's the priority?",
      stress: 'What would help most?',
      default: 'What do we need to do?',
    },
    'maya-santos': {
      habits: 'What habit are we building?',
      planning: "What's the routine?",
      stress: "What's one small thing we can do?",
      default: "What's the goal?",
    },
    'jordan-taylor': {
      planning: "What's the milestone?",
      habits: "What's the dream behind this?",
      stress: 'What would feel like a win?',
      default: "What's the vision?",
    },
    'nayan-patel': {
      wisdom: "What's weighing on you?",
      planning: 'What matters most here?',
      stress: 'What does your heart say?',
      default: "What's on your mind?",
    },
    'peter-john': {
      research: "What's the pattern?",
      habits: "What's the data showing?",
      planning: 'What does the timeline look like?',
      default: 'What should we analyze?',
    },
    ferni: {
      stress: "What's going on?",
      default: "What's happening?",
    },
  };

  const personaQuestions = questions[personaId] || questions.ferni;
  return personaQuestions[topicCategory] || personaQuestions.default || "What's up?";
}

function getReasonAcknowledgment(personaId: string, reason: string): string | null {
  const lowerReason = reason.toLowerCase();

  // Common handoff reason patterns
  const reasonResponses: Record<string, Record<string, string>> = {
    'alex-chen': {
      schedule: 'I heard scheduling. Let me help.',
      calendar: 'Calendar stuff. Got it.',
      email: 'Email time. What are we sending?',
      meeting: "Meeting setup. What's the context?",
    },
    'maya-santos': {
      habit: 'Habit building! What are we creating?',
      routine: 'Routine work. Love it.',
      morning: "Morning routine? Let's design it.",
    },
    'jordan-taylor': {
      plan: 'Planning mode! What are we dreaming up?',
      goal: 'Goal setting. Exciting.',
      celebrate: 'Celebration time!',
      birthday: 'Birthday planning! Fun.',
    },
    'nayan-patel': {
      meaning: "Meaning questions. I'm here.",
      purpose: 'Purpose work. Important.',
      stuck: "Feeling stuck. Let's sit with that.",
    },
    'peter-john': {
      data: 'Data time. What are we looking at?',
      pattern: "Pattern finding. Let's see.",
      research: 'Research mode. What interests you?',
    },
  };

  const personaResponses = reasonResponses[personaId];
  if (!personaResponses) return null;

  for (const [keyword, response] of Object.entries(personaResponses)) {
    if (lowerReason.includes(keyword)) {
      return response;
    }
  }

  return null;
}

function getPersonaFirstName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    'alex-chen': 'Alex',
    'maya-santos': 'Maya',
    'jordan-taylor': 'Jordan',
    'nayan-patel': 'Nayan',
    'peter-john': 'Peter',
  };
  return names[personaId] || personaId;
}

// ============================================================================
// TIME OF DAY DETECTION
// ============================================================================

/**
 * Detect time of day from current hour
 */
export function detectTimeOfDay(hour?: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = hour ?? new Date().getHours();

  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Get intelligent, context-aware banter for handoffs
 *
 * Now includes:
 * - Topic detection from conversation
 * - Emotion-aware responses
 * - Time-of-day energy adjustment
 * - Relationship depth warmth
 * - Handoff reason acknowledgment
 * - Brevity for repeat transfers
 *
 * Falls back to static banter if context unavailable or generation fails.
 *
 * @example
 * const banter = getIntelligentBanter('ferni', 'alex-chen', {
 *   currentTopic: 'scheduling a meeting',
 *   userEmotion: 'stressed',
 *   handoffCountThisSession: 1,
 *   timeOfDay: 'morning',
 *   totalSessions: 15,
 *   handoffReason: 'calendar help',
 * });
 */
export function getIntelligentBanter(
  fromPersonaId: string,
  toPersonaId: string,
  context: BanterContext = {}
): IntelligentBanterResult {
  // Auto-detect time of day if not provided
  const enrichedContext: BanterContext = {
    ...context,
    timeOfDay: context.timeOfDay || detectTimeOfDay(),
  };

  try {
    const softOpen = generateSoftOpenBanter(fromPersonaId, toPersonaId, enrichedContext);
    const arriving = generateArrivingBanter(toPersonaId, fromPersonaId, enrichedContext);

    if (softOpen && arriving) {
      const topicCategory = detectTopicCategory(context.currentTopic, context.handoffReason);
      const relationshipStage = detectRelationshipStage(enrichedContext);

      log.debug(
        {
          from: fromPersonaId,
          to: toPersonaId,
          topic: topicCategory,
          emotion: context.userEmotion,
          time: enrichedContext.timeOfDay,
          relationship: relationshipStage,
          handoffCount: context.handoffCountThisSession,
        },
        '🎭 Generated intelligent banter'
      );

      return {
        softOpenBanter: softOpen,
        arrivingBanter: arriving,
        wasIntelligent: true,
        contextUsed: {
          topic: topicCategory !== 'default' ? topicCategory : undefined,
          emotion: context.userEmotion,
          timeOfDay: enrichedContext.timeOfDay,
          relationshipDepth: relationshipStage,
          handoffReason: context.handoffReason,
        },
      };
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Intelligent banter generation failed, using fallback');
  }

  // Fallback to static banter
  return {
    softOpenBanter:
      getHandoffBanter(fromPersonaId, toPersonaId) ||
      `Let me get ${getPersonaFirstName(toPersonaId)}.`,
    arrivingBanter: getArrivingBanter(toPersonaId, fromPersonaId) || "Hey! What's up?",
    wasIntelligent: false,
  };
}

/**
 * Build banter context from session services
 *
 * Helper to extract relevant context from SessionServices for intelligent banter.
 */
export function buildBanterContext(options: {
  historyTopics?: string[];
  detectedEmotion?: string;
  handoffCount?: number;
  isFirstTimeUser?: boolean;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  userName?: string;
  handoffReason?: string;
  totalSessions?: number;
  relationshipStage?: string;
}): BanterContext {
  // Get the most recent topic
  const currentTopic = options.historyTopics?.[options.historyTopics.length - 1];

  // Map emotion to our simplified categories
  let userEmotion: BanterContext['userEmotion'] = 'neutral';
  if (options.detectedEmotion) {
    const emotion = options.detectedEmotion.toLowerCase();
    if (['happy', 'excited', 'grateful', 'joy', 'anticipation'].includes(emotion)) {
      userEmotion = 'excited';
    } else if (['anxious', 'stressed', 'overwhelmed', 'fear'].includes(emotion)) {
      userEmotion = 'stressed';
    } else if (['sad', 'frustrated', 'angry', 'sadness', 'anger'].includes(emotion)) {
      userEmotion = 'negative';
    } else if (['calm', 'content', 'trust'].includes(emotion)) {
      userEmotion = 'positive';
    }
  }

  // Map relationship stage
  let relationshipStage: BanterContext['relationshipStage'];
  if (options.relationshipStage) {
    const stage = options.relationshipStage.toLowerCase();
    if (stage.includes('new') || stage.includes('first')) {
      relationshipStage = 'new';
    } else if (stage.includes('build') || stage.includes('getting')) {
      relationshipStage = 'building';
    } else if (stage.includes('establish') || stage.includes('trust')) {
      relationshipStage = 'established';
    } else if (stage.includes('deep') || stage.includes('partner')) {
      relationshipStage = 'deep';
    }
  }

  return {
    currentTopic,
    userEmotion,
    handoffCountThisSession: options.handoffCount,
    isFirstTimeUser: options.isFirstTimeUser,
    timeOfDay: options.timeOfDay || detectTimeOfDay(),
    userName: options.userName,
    handoffReason: options.handoffReason,
    totalSessions: options.totalSessions,
    relationshipStage,
  };
}

// ============================================================================
// LLM-DRIVEN BANTER (NEW!)
// Instead of template-based generation, let the LLM create natural banter.
// ============================================================================

/**
 * Persona character profiles for LLM-driven banter
 * These help the LLM understand each persona's voice
 */
const PERSONA_PROFILES: Record<
  string,
  { name: string; role: string; style: string; traits: string }
> = {
  ferni: {
    name: 'Ferni',
    role: 'life coach and team coordinator',
    style: 'warm, grounded, wise',
    traits: 'uses gentle humor, feels like a supportive friend',
  },
  'alex-chen': {
    name: 'Alex',
    role: 'calendar and communication coach',
    style: 'efficient, caring, organized',
    traits: 'direct but warm, focused on getting things done',
  },
  'maya-santos': {
    name: 'Maya',
    role: 'habits and routines coach',
    style: 'gentle, supportive, patient',
    traits: 'believes in small steps, encouraging without being pushy',
  },
  'peter-john': {
    name: 'Peter',
    role: 'research analyst (the Triple Quant)',
    style: 'analytical, thorough, data-driven',
    traits: 'loves patterns, quotes Jack Bogle, brings the facts',
  },
  'jordan-taylor': {
    name: 'Jordan',
    role: 'life milestones and events planner',
    style: 'enthusiastic, visionary, celebratory',
    traits: 'sees the big picture, loves helping dream big',
  },
  'nayan-patel': {
    name: 'Nayan',
    role: 'wisdom keeper and philosopher',
    style: 'calm, contemplative, profound',
    traits: 'asks deep questions, comfortable with silence and mystery',
  },
};

/**
 * Instructions for LLM to generate soft open banter (departing persona)
 */
export interface LLMBanterInstructions {
  /** Instructions for generateReply() */
  instructions: string;
  /** Whether to allow interruptions */
  allowInterruptions: boolean;
  /** Fallback text if LLM generation fails or times out */
  fallback: string;
  /** Type of banter */
  type: 'soft_open' | 'arriving';
}

/**
 * Build LLM instructions for soft open banter (departing persona introduces arriving)
 */
export function buildLLMSoftOpenInstructions(
  fromPersonaId: string,
  toPersonaId: string,
  context: BanterContext
): LLMBanterInstructions {
  const fromProfile = PERSONA_PROFILES[fromPersonaId] || PERSONA_PROFILES.ferni;
  const toProfile = PERSONA_PROFILES[toPersonaId] || PERSONA_PROFILES.ferni;

  // Build contextual hints
  const contextHints: string[] = [];

  if (context.currentTopic) {
    contextHints.push(`You were just discussing: ${context.currentTopic}`);
  }

  if (context.userEmotion && context.userEmotion !== 'neutral') {
    const emotionMap: Record<string, string> = {
      stressed: 'The user seems stressed - be reassuring',
      negative: 'The user seems down - be gentle',
      excited: 'The user is excited - match their energy',
      positive: 'The user is in a good mood',
    };
    contextHints.push(emotionMap[context.userEmotion] || '');
  }

  if (context.handoffReason) {
    contextHints.push(`Handoff reason: ${context.handoffReason.slice(0, 50)}`);
  }

  // Brevity for repeat handoffs
  const brevity =
    (context.handoffCountThisSession || 0) > 1
      ? 'This is a repeat handoff this session - be VERY brief (under 8 words).'
      : 'Keep it natural and brief (1-2 short sentences max).';

  // Time awareness
  const timeHint = context.timeOfDay === 'night' ? "It's late - gentle energy." : '';

  // Relationship depth
  const relationshipHint =
    context.relationshipStage === 'deep'
      ? 'You have a deep relationship - be warm and familiar.'
      : context.relationshipStage === 'new'
        ? 'This is a newer relationship - be welcoming but not overly familiar.'
        : '';

  // Use speak pseudo-tool to prevent echoing of meta-instructions
  // The LLM outputs JSON, which gets caught by tool-call-sanitizer and spoken via session.say()
  const instructions = `You are ${fromProfile.name}. You're handing off to ${toProfile.name}.

${contextHints.length > 0 ? contextHints.filter(Boolean).join('. ') + '.' : ''}
${timeHint} ${relationshipHint}

Generate a brief, natural transition phrase. ${brevity}

OUTPUT ONLY this JSON format (nothing else):
{"fn":"speak","args":{"text":"your handoff phrase here"}}`;

  // Generate fallback using template system
  const fallback = getHandoffBanter(fromPersonaId, toPersonaId) || `Let me get ${toProfile.name}.`;

  return {
    instructions,
    allowInterruptions: false, // Don't interrupt during handoff
    fallback,
    type: 'soft_open',
  };
}

/**
 * Build LLM instructions for arriving banter (new persona greets user)
 */
export function buildLLMArrivingInstructions(
  toPersonaId: string,
  fromPersonaId: string,
  context: BanterContext
): LLMBanterInstructions {
  const toProfile = PERSONA_PROFILES[toPersonaId] || PERSONA_PROFILES.ferni;
  const fromProfile = PERSONA_PROFILES[fromPersonaId] || PERSONA_PROFILES.ferni;

  // Build contextual hints
  const contextHints: string[] = [];

  if (context.currentTopic) {
    contextHints.push(`They were just discussing: ${context.currentTopic}`);
  }

  if (context.handoffReason) {
    contextHints.push(`You were called in for: ${context.handoffReason.slice(0, 50)}`);
  }

  if (context.userEmotion && context.userEmotion !== 'neutral') {
    const emotionMap: Record<string, string> = {
      stressed: 'The user seems stressed - be calming',
      negative: 'The user seems down - be supportive',
      excited: 'The user is excited - match their energy!',
      positive: 'The user is in a good mood',
    };
    contextHints.push(emotionMap[context.userEmotion] || '');
  }

  // Name usage
  const nameHint = context.userName ? `Their name is ${context.userName}.` : '';

  // Brevity for repeat handoffs
  const brevity =
    (context.handoffCountThisSession || 0) > 1
      ? 'This is a repeat handoff - be VERY brief (just "Hey!" or "What\'s up?" level).'
      : 'Keep it brief but warm (1-2 short sentences).';

  // Time awareness
  const timeEnergy: Record<string, string> = {
    morning: 'Morning energy - be bright',
    afternoon: 'Afternoon - steady energy',
    evening: 'Evening - calmer energy',
    night: 'Late night - gentle and soft energy',
  };
  const timeHint = context.timeOfDay ? timeEnergy[context.timeOfDay] || '' : '';

  // Relationship depth
  const relationshipHint =
    context.relationshipStage === 'deep'
      ? 'You have a deep relationship - be warm, maybe use their name.'
      : context.relationshipStage === 'new'
        ? 'Newer relationship - be welcoming and open.'
        : '';

  // Use speak pseudo-tool to prevent echoing of meta-instructions
  // The LLM outputs JSON, which gets caught by tool-call-sanitizer and spoken via session.say()
  const instructions = `You are ${toProfile.name}. You just arrived from ${fromProfile.name}'s handoff.

${nameHint}
${contextHints.length > 0 ? contextHints.filter(Boolean).join('. ') + '.' : ''}
${timeHint} ${relationshipHint}

Generate a brief, natural greeting. ${brevity}

OUTPUT ONLY this JSON format (nothing else):
{"fn":"speak","args":{"text":"your greeting here"}}`;

  // Generate fallback using template system
  const fallback = getArrivingBanter(toPersonaId, fromPersonaId) || "Hey! What's up?";

  return {
    instructions,
    allowInterruptions: true, // User can interrupt arriving greeting
    fallback,
    type: 'arriving',
  };
}

/**
 * Get LLM-driven banter instructions for a handoff
 *
 * This returns instructions that can be passed to `session.generateReply()`
 * for natural, contextual handoff banter.
 *
 * @example
 * const { softOpen, arriving } = getLLMDrivenBanter('ferni', 'alex-chen', context);
 *
 * // Departing persona says soft open
 * await session.generateReply({ instructions: softOpen.instructions });
 *
 * // [Voice switches]
 *
 * // Arriving persona greets
 * await session.generateReply({ instructions: arriving.instructions });
 */
export function getLLMDrivenBanter(
  fromPersonaId: string,
  toPersonaId: string,
  context: BanterContext = {}
): { softOpen: LLMBanterInstructions; arriving: LLMBanterInstructions } {
  const enrichedContext: BanterContext = {
    ...context,
    timeOfDay: context.timeOfDay || detectTimeOfDay(),
  };

  log.debug(
    {
      from: fromPersonaId,
      to: toPersonaId,
      topic: context.currentTopic,
      emotion: context.userEmotion,
      time: enrichedContext.timeOfDay,
      relationship: context.relationshipStage,
    },
    '🎭 Building LLM-driven banter instructions'
  );

  return {
    softOpen: buildLLMSoftOpenInstructions(fromPersonaId, toPersonaId, enrichedContext),
    arriving: buildLLMArrivingInstructions(toPersonaId, fromPersonaId, enrichedContext),
  };
}
