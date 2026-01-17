/**
 * Outbound Call Templates - "Better Than Human" Voice Messages
 *
 * Natural, warm, personalized message templates with:
 * - Full SSML support for prosody control
 * - Persona-specific voice characteristics
 * - Context-aware dynamic personalization
 * - Natural pacing and breathing pauses
 *
 * The goal: Calls that feel MORE human than actual humans
 * - Perfect memory of previous conversations
 * - Consistent warmth regardless of time/mood
 * - Thoughtful pauses that feel genuine
 * - Never rushed, always present
 *
 * @module outbound-call-templates
 */

import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import { getEmotionProfile } from '../../speech/voice-manager/config.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'outbound-call-templates' });

// ============================================================================
// TYPES
// ============================================================================

export interface CallContext {
  /** Recipient's name */
  recipientName: string;
  /** Persona making the call */
  personaId?: string;
  /** Relationship depth (affects warmth level) */
  relationshipStage?: 'new' | 'building' | 'established' | 'deep';
  /** Time of day (affects greeting style) */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
  /** Previous conversation topics (for callbacks) */
  previousTopics?: string[];
  /** Days since last contact */
  daysSinceContact?: number;
  /** Specific occasion if applicable */
  occasion?: 'birthday' | 'holiday' | 'achievement' | 'check_in' | 'thinking_of_you' | 'reminder';
  /** Custom context for dynamic insertion */
  customContext?: Record<string, string>;
}

export interface GeneratedCall {
  /** The full message with SSML */
  message: string;
  /** Plain text version (for logs/fallback) */
  plainText: string;
  /** Estimated duration in seconds */
  estimatedDuration: number;
  /** Persona voice ID for TTS */
  voiceId: string;
  /** Emotion settings for TTS */
  emotion: string;
  /** Speed multiplier for TTS */
  speedMultiplier: number;
}

export type CallTemplateType =
  | 'thinking_of_you'
  | 'check_in'
  | 'birthday'
  | 'celebration'
  | 'reminder'
  | 'follow_up'
  | 'encouragement'
  | 'concern'
  | 'gratitude'
  | 'appointment_confirmation'
  | 'appointment_reminder';

// ============================================================================
// NATURAL PACING HELPERS - Plain Text with Punctuation
// ============================================================================

/**
 * Cartesia TTS uses API params (voice_experimental_controls) for emotion/speed.
 * For pacing, we use natural punctuation:
 * - Commas (,) → short pause
 * - Ellipsis (...) → thoughtful pause
 * - Period (.) → sentence break
 * - Em-dash (—) → dramatic pause
 */
const PACE = {
  /** Short pause */
  short: ', ',
  /** Thoughtful pause */
  think: '... ',
  /** Em-dash pause */
  dramatic: ' — ',
};

/**
 * Helper functions for building natural-sounding messages
 */
const SSML = {
  /** Natural breathing pause */
  breath: () => PACE.short,

  /** Sentence pause */
  sentencePause: (punct: '.' | '!' | '?') => `${punct} `,

  /** Thoughtful pause */
  thoughtful: () => PACE.think,

  /** Just returns text - emotion comes from API params */
  warm: (text: string) => text,
  concern: (text: string) => text,
  excited: (text: string) => text,

  /** Emphasis via ellipsis */
  slow: (text: string) => `${PACE.think}${text}`,

  /** Just returns text */
  quick: (text: string) => text,

  /** Name with natural pause after */
  name: (name: string) => `${name}${PACE.short}`,

  /** Dramatic pause */
  think: () => PACE.dramatic,

  /** Trailing off */
  trail: (text: string) => `${text}...`,
};

// ============================================================================
// TIME-AWARE GREETINGS
// ============================================================================

function getTimeGreeting(timeOfDay?: string): string {
  switch (timeOfDay) {
    case 'morning':
      return 'Good morning';
    case 'afternoon':
      return 'Hey there';
    case 'evening':
      return 'Good evening';
    case 'late_night':
      return 'Hey';
    default:
      return 'Hey';
  }
}

function getTimeContext(timeOfDay?: string): string {
  switch (timeOfDay) {
    case 'morning':
      return 'hope you slept well';
    case 'afternoon':
      return "hope your day's going okay";
    case 'evening':
      return 'hope you had a good day';
    case 'late_night':
      return "hope I'm not catching you at a bad time";
    default:
      return "hope you're doing alright";
  }
}

// ============================================================================
// RELATIONSHIP-AWARE WARMTH
// ============================================================================

function getWarmthLevel(stage?: string): { opener: string; closer: string } {
  switch (stage) {
    case 'new':
      return {
        opener: '',
        closer: 'Take care of yourself.',
      };
    case 'building':
      return {
        opener: "It's good to hear from you.",
        closer: 'Take care, okay?',
      };
    case 'established':
      return {
        opener: "I've been thinking about you.",
        closer: "Talk soon. You've got this.",
      };
    case 'deep':
      return {
        opener: 'Hey friend.',
        closer: "I'm here whenever you need me. Love you.",
      };
    default:
      return {
        opener: '',
        closer: 'Take care.',
      };
  }
}

// ============================================================================
// DYNAMIC CALLBACK PHRASES
// ============================================================================

function generateCallbackReference(previousTopics?: string[], daysSince?: number): string {
  if (!previousTopics || previousTopics.length === 0) {
    return '';
  }

  const topic = previousTopics[0];
  const timeRef = daysSince && daysSince > 7 ? 'a while ago' : 'last time';

  const templates = [
    `I keep thinking about what you shared ${timeRef} about ${topic}.`,
    `That thing you mentioned about ${topic}... it's been on my mind.`,
    `I wanted to circle back on ${topic}.`,
    `Still thinking about our conversation about ${topic}.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

// ============================================================================
// TEMPLATE GENERATORS - Natural Ferni Voice
// ============================================================================

/**
 * These templates capture Ferni's authentic voice:
 * - "Caught mid-thought" energy
 * - Wyoming hospitality - genuine, not polished
 * - Unhurried, present
 * - Uses contractions and casual language
 * - Never performative or scripted
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TEMPLATES: Record<CallTemplateType, (ctx: CallContext, persona: string) => string> = {
  thinking_of_you: (ctx, _persona) => {
    const name = ctx.recipientName;

    // Ferni's "thinking of you" - genuinely casual, like he just happened to think of them
    const openers = [`Hey ${name}. It's Ferni.`, `Hey, it's Ferni.`, `${name}! Hey. It's Ferni.`];

    const middles = [
      `I was just... I don't know, you crossed my mind. Wanted to say hey.`,
      `Something reminded me of you and I thought, you know what, I should just call.`,
      `I was grabbing coffee and thought of you. Just wanted to check in.`,
      `You popped into my head. No real reason. Just... thinking of you.`,
      `I don't know, I was just sitting here and thought about you.`,
    ];

    const closers = [
      `No need to call back. Just wanted you to know. Take care of yourself.`,
      `Anyway. Hope you're good. Talk whenever.`,
      `That's it really. Hope things are okay on your end.`,
      `No pressure to call me back. I'm around when you need me.`,
    ];

    return `${pick(openers)} ${pick(middles)} ${pick(closers)}`;
  },

  check_in: (ctx, _persona) => {
    const name = ctx.recipientName;
    const daysSince = ctx.daysSinceContact || 0;

    const timeAck =
      daysSince > 30 ? `It's been a minute, I know. ` : daysSince > 14 ? `Been a bit. ` : ``;

    const openers = [`Hey ${name}, it's Ferni.`, `${name}. Hey. It's Ferni.`, `Hey. It's Ferni.`];

    const bodies = [
      `${timeAck}Just wanted to check in. See how you're doing.`,
      `${timeAck}Wanted to hear your voice. How are things?`,
      `${timeAck}I was thinking about you. How's life treating you?`,
      `${timeAck}Just checking in. No agenda. How are you?`,
    ];

    const closers = [
      `No pressure to call back. I'm around when you need me.`,
      `Whenever you want to talk, I'm here. Take care.`,
      `Hope you're taking care of yourself. Talk soon.`,
      `Anyway, just wanted to reach out. Take care of yourself.`,
    ];

    return `${pick(openers)} ${pick(bodies)} ${pick(closers)}`;
  },

  birthday: (ctx, _persona) => {
    const name = ctx.recipientName;
    return (
      `Hey ${name}! It's Ferni. Happy birthday. ` +
      `I hope you're doing something nice for yourself today. Even if it's small. ` +
      `You deserve to feel celebrated. Here's to another year of figuring it all out. Take care.`
    );
  },

  celebration: (ctx, _persona) => {
    const name = ctx.recipientName;
    const achievement = ctx.customContext?.achievement || 'what you accomplished';

    const openers = [
      `Wait... ${name}, it's Ferni. I just heard about ${achievement}. Are you serious?`,
      `${name}! It's Ferni. I heard about ${achievement}.`,
      `Hey! It's Ferni. I just found out about ${achievement}.`,
    ];

    return (
      `${pick(openers)} ` +
      `I'm genuinely proud of you. Like... that's huge. ` +
      `You put in the work and it paid off. Enjoy this. You earned it.`
    );
  },

  reminder: (ctx, _persona) => {
    const name = ctx.recipientName;
    const reminder = ctx.customContext?.reminder || 'that thing we talked about';

    return (
      `Hey ${name}, it's Ferni. Quick one... ` +
      `just wanted to remind you about ${reminder}. ` +
      `Didn't want it to slip by. That's all. Take care.`
    );
  },

  follow_up: (ctx, _persona) => {
    const name = ctx.recipientName;
    const topic = ctx.customContext?.topic || ctx.previousTopics?.[0] || 'what we talked about';

    return (
      `Hey ${name}. It's Ferni. ` +
      `I've been thinking about ${topic} since we talked. ` +
      `How's that going? No pressure... just curious. ` +
      `Hope things are moving in a good direction.`
    );
  },

  encouragement: (ctx, _persona) => {
    const name = ctx.recipientName;
    const challenge = ctx.customContext?.challenge || "what you're dealing with";

    return (
      `Hey ${name}. It's Ferni. ` +
      `I know ${challenge} hasn't been easy. ` +
      `I just wanted you to hear this... you're handling more than most people could. ` +
      `And you're not alone. I'm in your corner. ` +
      `One step at a time. You've got this.`
    );
  },

  concern: (ctx, _persona) => {
    const name = ctx.recipientName;

    return (
      `Hey ${name}. It's Ferni. ` +
      `I've been thinking about you. Wanted to check in for real. ` +
      `How are you? Not the polite answer... how are you actually doing? ` +
      `No need to be strong with me. I'm here. ` +
      `Call me back if you want to talk.`
    );
  },

  gratitude: (ctx, _persona) => {
    const name = ctx.recipientName;
    const reason = ctx.customContext?.reason || 'being you';

    return (
      `Hey ${name}. It's Ferni. ` +
      `I just wanted to say thank you. For ${reason}. ` +
      `I don't say it enough, but... it means a lot. ` +
      `Hope you know how much I appreciate you.`
    );
  },

  appointment_confirmation: (ctx, _persona) => {
    const name = ctx.recipientName;
    const appointment = ctx.customContext?.appointment || 'your appointment';
    const time = ctx.customContext?.time || '';
    const location = ctx.customContext?.location || '';

    return (
      `Hey ${name}, it's Ferni. Good news... ` +
      `${appointment} is all set${time ? ` for ${time}` : ''}.` +
      `${location ? ` That's at ${location}.` : ''} ` +
      `I've got the details saved for you. Let me know if anything changes.`
    );
  },

  appointment_reminder: (ctx, _persona) => {
    const name = ctx.recipientName;
    const appointment = ctx.customContext?.appointment || 'your appointment';
    const time = ctx.customContext?.time || 'coming up';
    const location = ctx.customContext?.location || '';

    return (
      `Hey ${name}, it's Ferni. Quick reminder... ` +
      `you've got ${appointment} ${time}.` +
      `${location ? ` That's at ${location}.` : ''} ` +
      `Need anything before then? Either way... you've got this.`
    );
  },
};

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate a natural, SSML-enhanced outbound call message
 */
export function generateCallMessage(
  templateType: CallTemplateType,
  context: CallContext
): GeneratedCall {
  const personaId = context.personaId || 'ferni';
  const personaName = getPersonaDisplayName(personaId);
  const voiceId = getVoiceId(personaId);
  const emotionProfile = getEmotionProfile(personaId);

  // Generate the message using the template
  const template = TEMPLATES[templateType];
  if (!template) {
    throw new Error(`Unknown template type: ${templateType}`);
  }

  const message = template(context, personaName);

  // Generate plain text version (strip SSML and clean up spacing)
  const plainText = message
    .replace(/<[^>]+>/g, ' ') // Replace SSML tags with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/\s([.,!?])/g, '$1') // Remove space before punctuation
    .trim();

  // Estimate duration (rough: ~150ms per word + pauses)
  const wordCount = plainText.split(/\s+/).length;
  const pauseCount = (message.match(/<break/g) || []).length;
  const estimatedDuration = Math.ceil(wordCount * 0.4 + pauseCount * 0.25);

  log.debug(
    {
      templateType,
      personaId,
      recipientName: context.recipientName,
      wordCount,
      estimatedDuration,
    },
    'Generated call message'
  );

  return {
    message,
    plainText,
    estimatedDuration,
    voiceId,
    emotion: emotionProfile.defaultEmotion,
    speedMultiplier: emotionProfile.defaultSpeed,
  };
}

/**
 * Quick helper to generate a thinking-of-you call
 */
export function generateThinkingOfYouCall(name: string, personaId = 'ferni'): GeneratedCall {
  return generateCallMessage('thinking_of_you', {
    recipientName: name,
    personaId,
    relationshipStage: 'established',
    timeOfDay: getCurrentTimeOfDay(),
  });
}

/**
 * Quick helper to generate a check-in call
 */
export function generateCheckInCall(
  name: string,
  personaId = 'ferni',
  daysSinceContact?: number
): GeneratedCall {
  return generateCallMessage('check_in', {
    recipientName: name,
    personaId,
    relationshipStage: daysSinceContact && daysSinceContact > 30 ? 'established' : 'building',
    timeOfDay: getCurrentTimeOfDay(),
    daysSinceContact,
  });
}

/**
 * Quick helper to generate an appointment confirmation call
 */
export function generateAppointmentConfirmationCall(
  name: string,
  appointment: string,
  time?: string,
  location?: string,
  personaId = 'ferni'
): GeneratedCall {
  return generateCallMessage('appointment_confirmation', {
    recipientName: name,
    personaId,
    customContext: {
      appointment,
      ...(time && { time }),
      ...(location && { location }),
    },
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function getCurrentTimeOfDay(): CallContext['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SSML };
