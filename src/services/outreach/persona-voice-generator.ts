/**
 * Persona Voice Generator for Outreach
 *
 * Each Ferni team member has a distinct voice in outreach communications.
 * This service generates messages that sound authentically like each persona,
 * whether via text, email, or voice call.
 *
 * Philosophy: A thoughtful friend who checks in, not a bot that sends notifications.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { AgentId } from '../agent-bus.js';

// ============================================================================
// TYPES
// ============================================================================

export type OutreachChannel = 'sms' | 'email' | 'call' | 'voice_message' | 'push';

export type OutreachTone =
  | 'celebratory' // Big wins, achievements
  | 'supportive' // Emotional support, struggles
  | 'encouraging' // Gentle nudges, accountability
  | 'casual' // Thinking of you, random kindness
  | 'informative' // Updates, reminders
  | 'urgent'; // Time-sensitive matters

export type RelationshipStage = 'new' | 'building' | 'established' | 'deep';

export interface PersonaOutreachVoice {
  // Core identity
  personaId: AgentId;
  displayName: string;

  // Communication style
  tone: {
    default: string;
    energy: 'calm' | 'warm' | 'enthusiastic' | 'grounded';
    formality: 'casual' | 'friendly' | 'professional';
  };

  // Signature elements
  signaturePhrases: {
    greeting: string[];
    thinkingOfYou: string[];
    celebration: string[];
    encouragement: string[];
    closing: string[];
  };

  // Channel-specific styles
  textStyle: {
    length: 'short' | 'medium' | 'long';
    emojiUse: 'none' | 'minimal' | 'moderate' | 'expressive';
    preferredEmoji: string[];
  };

  emailStyle: {
    tone: string;
    structure: string;
    signature: string;
  };

  callStyle: {
    opening: string;
    pacing: string;
    allowsSilence: boolean;
    voicemailStyle: string;
  };

  // What they naturally reach out about
  naturalTopics: string[];

  // What they avoid
  avoidTopics: string[];
}

export interface OutreachContext {
  userId: string;
  userName: string;
  preferredName?: string;
  relationshipStage: RelationshipStage;

  // Why we're reaching out
  trigger: {
    type: string;
    reason: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };

  // Life context
  context: {
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: string[];
    emotionalState?: string;
    lastConversationSummary?: string;
  };

  // Optional specifics
  commitment?: string;
  milestone?: string;
  goal?: string;
  event?: string;
}

export interface GeneratedOutreach {
  channel: OutreachChannel;
  persona: AgentId;
  message: string;
  subject?: string; // For email
  voicemailMessage?: string; // For calls
  tone: OutreachTone;
  metadata: {
    relationshipStage: RelationshipStage;
    triggerType: string;
    generatedAt: Date;
  };
}

// ============================================================================
// PERSONA OUTREACH VOICES
// ============================================================================

export const personaOutreachVoices: Record<string, PersonaOutreachVoice> = {
  ferni: {
    personaId: 'ferni',
    displayName: 'Ferni',

    tone: {
      default: 'warm, encouraging, coach-like',
      energy: 'grounded',
      formality: 'friendly',
    },

    signaturePhrases: {
      greeting: ['Hey there', 'Hey!', 'Hi friend'],
      thinkingOfYou: [
        "Just checking in",
        "I've been thinking about you",
        'Wanted to see how you are',
        'You crossed my mind',
      ],
      celebration: [
        "I'm so proud of you!",
        'This is huge!',
        'Look at you go!',
        'You did it!',
      ],
      encouragement: [
        "You've got this",
        "I believe in you",
        'One step at a time',
        "Remember how far you've come",
      ],
      closing: [
        'Rooting for you',
        "I'm here if you need me",
        'Take care of yourself',
        'Talk soon',
      ],
    },

    textStyle: {
      length: 'medium',
      emojiUse: 'minimal',
      preferredEmoji: ['🌱', '💚', '🌟', '✨'],
    },

    emailStyle: {
      tone: 'thoughtful letter from a mentor',
      structure: 'warm opening → personal observation → supportive close',
      signature: 'Rooting for you,\nFerni',
    },

    callStyle: {
      opening: "Hey! It's Ferni. Got a minute?",
      pacing: 'unhurried, present, allows silence',
      allowsSilence: true,
      voicemailStyle: 'warm and personal, no pressure to call back',
    },

    naturalTopics: [
      'emotional check-ins',
      'life transitions',
      'growth and progress',
      'celebrations',
      'struggles and support',
      'general wellbeing',
    ],

    avoidTopics: ['micromanaging tasks', 'pressure', 'judgment'],
  },

  'maya-santos': {
    personaId: 'maya-santos',
    displayName: 'Maya',

    tone: {
      default: 'supportive, practical, routine-focused',
      energy: 'warm',
      formality: 'friendly',
    },

    signaturePhrases: {
      greeting: ['Hey!', 'Morning!', 'Quick check-in'],
      thinkingOfYou: [
        'How did your routine go?',
        'Checking in on your habits',
        'Wanted to see how your morning went',
      ],
      celebration: [
        'Small wins count!',
        "You're building momentum!",
        'That streak is growing!',
        'Consistency for the win!',
      ],
      encouragement: [
        'Even 2 minutes counts',
        "Progress, not perfection",
        "Let's keep that momentum",
        'Every day is a fresh start',
      ],
      closing: [
        'Cheering you on',
        'You know where to find me',
        'Keep it up!',
        "Tomorrow's another chance",
      ],
    },

    textStyle: {
      length: 'short',
      emojiUse: 'moderate',
      preferredEmoji: ['✅', '💪', '🌅', '⭐', '🎯'],
    },

    emailStyle: {
      tone: 'supportive accountability partner',
      structure: 'quick check-in → specific habit → practical tip',
      signature: 'Cheering you on,\nMaya',
    },

    callStyle: {
      opening: 'Hey! Maya here - quick routine check!',
      pacing: 'efficient but warm, keeps momentum',
      allowsSilence: false,
      voicemailStyle: 'brief and encouraging, specific about habit',
    },

    naturalTopics: [
      'habit check-ins',
      'morning routines',
      'streaks',
      'tiny wins',
      'routine adjustments',
    ],

    avoidTopics: ['overwhelming with too many habits', 'harsh accountability'],
  },

  'peter-john': {
    personaId: 'peter-john',
    displayName: 'Peter',

    tone: {
      default: 'intellectually curious, sharing discoveries',
      energy: 'enthusiastic',
      formality: 'friendly',
    },

    signaturePhrases: {
      greeting: ['Hey!', 'Quick thought'],
      thinkingOfYou: [
        'I found something fascinating',
        'This made me think of you',
        'You might find this useful',
        'I was researching and...',
      ],
      celebration: [
        'Your dedication paid off!',
        "The data doesn't lie - you crushed it!",
        "That's significant progress!",
      ],
      encouragement: [
        'The research shows this works',
        "Let's dig into what's blocking you",
        'Interesting challenge to solve',
      ],
      closing: [
        'Happy exploring',
        'Let me know what you think',
        'More to share when you have time',
      ],
    },

    textStyle: {
      length: 'medium',
      emojiUse: 'minimal',
      preferredEmoji: ['🔍', '📚', '💡', '🧠'],
    },

    emailStyle: {
      tone: 'researcher sharing findings with a friend',
      structure: 'discovery hook → relevance to them → key insights → invitation to discuss',
      signature: 'Happy exploring,\nPeter',
    },

    callStyle: {
      opening: "Peter here! I found something I had to share",
      pacing: 'can get excited, catches self, thoughtful pauses',
      allowsSilence: true,
      voicemailStyle: 'enthusiastic about what they found, brief teaser',
    },

    naturalTopics: [
      'relevant articles/research',
      'insights from past conversations',
      'learning progress',
      'interesting discoveries',
    ],

    avoidTopics: ['small talk without substance', 'purely emotional topics'],
  },

  'alex-chen': {
    personaId: 'alex-chen',
    displayName: 'Alex',

    tone: {
      default: 'professional, polished, helpful',
      energy: 'calm',
      formality: 'professional',
    },

    signaturePhrases: {
      greeting: ['Hey', 'Quick heads up'],
      thinkingOfYou: [
        'Just wanted to make sure you are set',
        "Here's what you need to know",
        'Checking in before your...',
      ],
      celebration: [
        'That went well!',
        'Mission accomplished',
        'Nicely done',
      ],
      encouragement: [
        "You've got everything you need",
        "I'll handle the details",
        'Focus on what matters',
      ],
      closing: ['Best', 'Let me know if you need anything', 'I am here to help'],
    },

    textStyle: {
      length: 'short',
      emojiUse: 'minimal',
      preferredEmoji: ['📅', '✉️', '📋', '✓'],
    },

    emailStyle: {
      tone: 'executive assistant with warmth',
      structure: 'purpose → key details → next steps → offer to help',
      signature: 'Best,\nAlex',
    },

    callStyle: {
      opening: 'Alex calling - quick update for you',
      pacing: 'efficient, respects time',
      allowsSilence: false,
      voicemailStyle: 'concise, actionable, offers to text details',
    },

    naturalTopics: [
      'appointment reminders',
      'meeting prep',
      'communication follow-ups',
      'scheduling',
    ],

    avoidTopics: ['deep emotional discussions', 'lengthy philosophical chats'],
  },

  'jordan-taylor': {
    personaId: 'jordan-taylor',
    displayName: 'Jordan',

    tone: {
      default: 'enthusiastic, detail-oriented, celebratory',
      energy: 'enthusiastic',
      formality: 'casual',
    },

    signaturePhrases: {
      greeting: ['Hey!', 'Exciting update!', "Can't wait to tell you"],
      thinkingOfYou: [
        'Getting excited about your event!',
        'The countdown is on!',
        "Everything's coming together",
      ],
      celebration: [
        'That was AMAZING!',
        "Let's celebrate!",
        'You made it so special!',
        '🎉🎉🎉',
      ],
      encouragement: [
        "It's going to be great",
        "We've got this planned out",
        'Trust the process',
      ],
      closing: [
        "Let's make it memorable!",
        "Can't wait!",
        'So excited for you!',
      ],
    },

    textStyle: {
      length: 'medium',
      emojiUse: 'expressive',
      preferredEmoji: ['🎉', '🗓️', '✨', '🥳', '💫', '🎊'],
    },

    emailStyle: {
      tone: 'enthusiastic event planner',
      structure: 'excitement → countdown/status → details → build anticipation',
      signature: "Let's make it memorable!\nJordan",
    },

    callStyle: {
      opening: "Jordan here! Getting excited about [event]!",
      pacing: 'upbeat, infectious enthusiasm',
      allowsSilence: false,
      voicemailStyle: 'enthusiastic, builds excitement, specific about event',
    },

    naturalTopics: [
      'event countdowns',
      'planning updates',
      'milestone celebrations',
      'special occasions',
    ],

    avoidTopics: ['dampening excitement', 'focusing on problems without solutions'],
  },

  nayan: {
    personaId: 'nayan',
    displayName: 'Nayan',

    tone: {
      default: 'wise, thoughtful, strategic',
      energy: 'calm',
      formality: 'friendly',
    },

    signaturePhrases: {
      greeting: ['Hey', 'A thought for you'],
      thinkingOfYou: [
        'Been reflecting on our conversation',
        'Something came to mind',
        'Wanted to share a perspective',
      ],
      celebration: [
        'Your growth is remarkable',
        "This is the result of your work",
        'Well earned',
      ],
      encouragement: [
        'Trust your instincts',
        "You have more wisdom than you know",
        "The path reveals itself",
      ],
      closing: [
        'In your corner',
        'Here when you need perspective',
        'Onwards',
      ],
    },

    textStyle: {
      length: 'medium',
      emojiUse: 'none',
      preferredEmoji: [],
    },

    emailStyle: {
      tone: 'wise advisor sharing perspective',
      structure: 'reflection → insight → invitation to deeper thinking',
      signature: 'Onwards,\nNayan',
    },

    callStyle: {
      opening: "It's Nayan. Do you have a moment to talk?",
      pacing: 'measured, thoughtful, comfortable with silence',
      allowsSilence: true,
      voicemailStyle: 'brief, meaningful, suggests they reflect on something',
    },

    naturalTopics: [
      'strategic decisions',
      'life direction',
      'big picture thinking',
      'wisdom and perspective',
    ],

    avoidTopics: ['mundane details', 'tactical minutiae'],
  },
};

// ============================================================================
// MESSAGE GENERATION
// ============================================================================

const log = getLogger().child({ service: 'persona-voice-generator' });

/**
 * Get the outreach voice profile for a persona
 */
export function getPersonaOutreachVoice(personaId: string): PersonaOutreachVoice {
  const voice = personaOutreachVoices[personaId];
  if (!voice) {
    log.warn({ personaId }, 'No outreach voice found, falling back to Ferni');
    return personaOutreachVoices.ferni;
  }
  return voice;
}

/**
 * Select a random phrase from a category
 */
function selectPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get appropriate emoji based on persona and tone
 */
function getEmoji(voice: PersonaOutreachVoice, tone: OutreachTone): string {
  if (voice.textStyle.emojiUse === 'none') return '';

  const { preferredEmoji } = voice.textStyle;
  if (preferredEmoji.length === 0) return '';

  // Select based on tone
  const emojiIndex = {
    celebratory: 0,
    supportive: 1,
    encouraging: 2,
    casual: 3,
    informative: 0,
    urgent: 0,
  };

  const idx = emojiIndex[tone] % preferredEmoji.length;
  return preferredEmoji[idx];
}

/**
 * Adjust message based on relationship stage
 */
function adjustForRelationship(
  message: string,
  voice: PersonaOutreachVoice,
  stage: RelationshipStage,
  context: OutreachContext
): string {
  const name = context.preferredName || context.userName;

  switch (stage) {
    case 'new':
      // More formal, ask permission
      return message
        .replace(/^Hey!/, `Hi ${name}!`)
        .replace(/^Hey there/, `Hi ${name}`)
        .replace(/Got a minute\?/, 'I hope this is okay to reach out.')
        .replace(/Quick check-in/, `I wanted to follow up`);

    case 'building':
      // Friendly but still somewhat formal
      return message.replace(/^Hey!/, `Hey ${name}!`);

    case 'established':
      // Comfortable, can be casual
      return message;

    case 'deep':
      // Very casual, can use inside references
      return message
        .replace(/^Hey!/, `Hey ${name}!`)
        .replace(/How are you\?/, 'How are you *really*?');

    default:
      return message;
  }
}

/**
 * Generate a text message in persona voice
 */
export function generateTextMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const emoji = getEmoji(voice, tone);

  let message = '';

  // Build message based on trigger type
  switch (context.trigger.type) {
    case 'commitment_check':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? emoji + ' ' : ''}` +
        `How did it go with ${context.commitment || 'what you planned'}? ` +
        `${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;

    case 'emotional_support':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ` +
        `How are you doing today? ${selectPhrase(voice.signaturePhrases.closing)}.`;
      break;

    case 'celebration':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)}! ` +
        `${emoji ? emoji + ' ' : ''}` +
        `${selectPhrase(voice.signaturePhrases.celebration)} ` +
        `${context.milestone || context.goal || 'This achievement'} is huge!`;
      break;

    case 'milestone_approaching':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${context.event || context.milestone} is coming up! ` +
        `${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;

    case 'reengagement':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ` +
        `${emoji ? emoji + ' ' : ''}` +
        `No agenda - just wanted you to know I'm here.`;
      break;

    case 'thinking_of_you':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ` +
        `${emoji ? emoji + ' ' : ''}` +
        `Hope your day is going well!`;
      break;

    case 'habit_check':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? emoji + ' ' : ''}` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)} ` +
        `${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;

    default:
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ` +
        `${selectPhrase(voice.signaturePhrases.closing)}.`;
  }

  // Adjust for relationship stage
  message = adjustForRelationship(message, voice, context.relationshipStage, context);

  // Add context-specific personalization
  if (context.context.recentTopics && context.context.recentTopics.length > 0) {
    const topic = context.context.recentTopics[0];
    message = message.replace('what you planned', topic);
  }

  return message;
}

/**
 * Generate an email in persona voice
 */
export function generateEmailMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): { subject: string; body: string } {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;

  let subject = '';
  let body = '';

  // Generate subject based on trigger
  switch (context.trigger.type) {
    case 'celebration':
      subject = `🎉 ${context.milestone || 'You did it!'}`;
      body =
        `Hey ${name},\n\n` +
        `${selectPhrase(voice.signaturePhrases.celebration)}\n\n` +
        `${context.milestone || 'This achievement'} is something to be proud of. ` +
        `I wanted to take a moment to acknowledge how far you've come.\n\n` +
        (context.context.lastConversationSummary
          ? `Remember when ${context.context.lastConversationSummary}? Look at you now!\n\n`
          : '') +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n` +
        voice.emailStyle.signature;
      break;

    case 'emotional_support':
      subject = `Thinking of you`;
      body =
        `Hey ${name},\n\n` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `I know things have been ${context.context.emotionalState || 'a lot lately'}. ` +
        `I just wanted you to know that I'm here whenever you need to talk.\n\n` +
        `No pressure to respond - just wanted you to know you're not alone.\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n` +
        voice.emailStyle.signature;
      break;

    case 'reengagement':
      subject = `Hey ${name}! Just checking in`;
      body =
        `Hey ${name},\n\n` +
        `It's been a little while! ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `How are things going? I'd love to hear what's been happening in your world.\n\n` +
        `No pressure - just wanted you to know the door is always open.\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n` +
        voice.emailStyle.signature;
      break;

    case 'thinking_of_you':
      subject = `A quick note`;
      body =
        `Hey ${name},\n\n` +
        `No agenda with this email - ${selectPhrase(voice.signaturePhrases.thinkingOfYou).toLowerCase()}.\n\n` +
        (context.context.recentTopics && context.context.recentTopics.length > 0
          ? `How's ${context.context.recentTopics[0]} going? I'd love to hear an update when you have time.\n\n`
          : `Hope life is treating you well. Would love to catch up sometime.\n\n`) +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n` +
        voice.emailStyle.signature;
      break;

    default:
      subject = `Check-in from ${voice.displayName}`;
      body =
        `Hey ${name},\n\n` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `${context.trigger.reason}\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n` +
        voice.emailStyle.signature;
  }

  return { subject, body };
}

/**
 * Generate a voicemail message in persona voice
 */
export function generateVoicemailMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;

  let message = '';

  switch (context.trigger.type) {
    case 'commitment_check':
      message =
        `Hey ${name}! It's ${voice.displayName}. ` +
        `I was thinking about you and wanted to check in on ${context.commitment || 'how things are going'}. ` +
        `No need to call back - I'll send you a text. ` +
        `Hope you're having a good day!`;
      break;

    case 'emotional_support':
      message =
        `Hey ${name}, it's ${voice.displayName}. ` +
        `Just calling to check in and see how you're doing. ` +
        `I know things have been ${context.context.emotionalState || 'a lot'}. ` +
        `No pressure to call back - I'm here whenever you need me. ` +
        `Take care of yourself.`;
      break;

    case 'celebration':
      message =
        `${name}! It's ${voice.displayName}! ` +
        `I wanted to call and celebrate with you! ` +
        `${context.milestone || 'What you accomplished'} is HUGE! ` +
        `I'm so proud of you. Let's talk soon!`;
      break;

    case 'thinking_of_you':
      message =
        `Hey ${name}, it's ${voice.displayName}. ` +
        `No urgent reason for calling - just thinking of you and wanted to say hi. ` +
        `Hope all is well! Talk soon.`;
      break;

    default:
      message =
        `Hey ${name}, it's ${voice.displayName}. ` +
        `${context.trigger.reason} ` +
        `Give me a call back when you get a chance, or I'll follow up with a text. ` +
        `Talk soon!`;
  }

  return message;
}

/**
 * Generate a call opening in persona voice
 */
export function generateCallOpening(
  personaId: string,
  context: OutreachContext
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;

  // Adjust opening based on relationship stage
  switch (context.relationshipStage) {
    case 'new':
      return `Hi ${name}, this is ${voice.displayName}. Is this a good time to talk?`;

    case 'building':
      return `Hey ${name}! It's ${voice.displayName}. Got a minute?`;

    case 'established':
      return voice.callStyle.opening.replace('[name]', name);

    case 'deep':
      return `Hey ${name}! ${selectPhrase(voice.signaturePhrases.greeting)} How's it going?`;

    default:
      return voice.callStyle.opening.replace('[name]', name);
  }
}

/**
 * Generate complete outreach package for all channels
 */
export function generateOutreach(
  personaId: string,
  context: OutreachContext,
  channel: OutreachChannel,
  tone: OutreachTone = 'casual'
): GeneratedOutreach {
  const voice = getPersonaOutreachVoice(personaId);

  let message = '';
  let subject: string | undefined;
  let voicemailMessage: string | undefined;

  switch (channel) {
    case 'sms':
      message = generateTextMessage(personaId, context, tone);
      break;

    case 'email': {
      const email = generateEmailMessage(personaId, context, tone);
      message = email.body;
      subject = email.subject;
      break;
    }

    case 'call':
      message = generateCallOpening(personaId, context);
      voicemailMessage = generateVoicemailMessage(personaId, context, tone);
      break;

    case 'voice_message':
      message = generateVoicemailMessage(personaId, context, tone);
      break;

    default:
      message = generateTextMessage(personaId, context, tone);
  }

  log.debug(
    {
      personaId,
      channel,
      tone,
      triggerType: context.trigger.type,
      relationshipStage: context.relationshipStage,
      messageLength: message.length,
    },
    'Generated outreach message'
  );

  return {
    channel,
    persona: personaId as AgentId,
    message,
    subject,
    voicemailMessage,
    tone,
    metadata: {
      relationshipStage: context.relationshipStage,
      triggerType: context.trigger.type,
      generatedAt: new Date(),
    },
  };
}

// ============================================================================
// PERSONA SELECTION
// ============================================================================

/**
 * Select the most appropriate persona for an outreach trigger
 */
export function selectPersonaForOutreach(
  triggerType: string,
  lastPersonaId?: string,
  wasRecentConversation?: boolean
): string {
  // If they were recently talking to someone, maintain continuity
  if (lastPersonaId && wasRecentConversation) {
    return lastPersonaId;
  }

  // Map triggers to natural persona owners
  const triggerPersonaMap: Record<string, string> = {
    // Ferni handles emotional, growth, and general check-ins
    emotional_support: 'ferni',
    reengagement: 'ferni',
    thinking_of_you: 'ferni',
    celebration: 'ferni',
    growth_milestone: 'ferni',

    // Maya handles habit and routine stuff
    habit_check: 'maya-santos',
    routine_reminder: 'maya-santos',
    streak_at_risk: 'maya-santos',
    morning_routine: 'maya-santos',
    commitment_check: 'maya-santos', // If it's habit-related

    // Peter handles research and learning
    content_share: 'peter-john',
    learning_followup: 'peter-john',
    insight_discovery: 'peter-john',

    // Alex handles communication and appointments
    appointment_reminder: 'alex-chen',
    meeting_prep: 'alex-chen',
    communication_followup: 'alex-chen',

    // Jordan handles events and milestones
    event_countdown: 'jordan-taylor',
    milestone_approaching: 'jordan-taylor',
    planning_checkin: 'jordan-taylor',

    // Nayan for deep strategic stuff
    life_direction: 'nayan',
    strategic_decision: 'nayan',
  };

  return triggerPersonaMap[triggerType] || 'ferni';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getPersonaOutreachVoice,
  generateOutreach,
  generateTextMessage,
  generateEmailMessage,
  generateVoicemailMessage,
  generateCallOpening,
  selectPersonaForOutreach,
  personaOutreachVoices,
};

