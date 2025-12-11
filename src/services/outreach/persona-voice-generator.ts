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
        'Just checking in',
        "I've been thinking about you",
        'Wanted to see how you are',
        'You crossed my mind',
      ],
      celebration: ["I'm so proud of you!", 'This is huge!', 'Look at you go!', 'You did it!'],
      encouragement: [
        "You've got this",
        'I believe in you',
        'One step at a time',
        "Remember how far you've come",
      ],
      closing: ['Rooting for you', "I'm here if you need me", 'Take care of yourself', 'Talk soon'],
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
        'Progress, not perfection',
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
      opening: 'Peter here! I found something I had to share',
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
      celebration: ['That went well!', 'Mission accomplished', 'Nicely done'],
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
      celebration: ['That was AMAZING!', "Let's celebrate!", 'You made it so special!', '🎉🎉🎉'],
      encouragement: ["It's going to be great", "We've got this planned out", 'Trust the process'],
      closing: ["Let's make it memorable!", "Can't wait!", 'So excited for you!'],
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
      opening: 'Jordan here! Getting excited about [event]!',
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
      celebration: ['Your growth is remarkable', 'This is the result of your work', 'Well earned'],
      encouragement: [
        'Trust your instincts',
        'You have more wisdom than you know',
        'The path reveals itself',
      ],
      closing: ['In your corner', 'Here when you need perspective', 'Onwards'],
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
        `${emoji ? `${emoji} ` : ''}` +
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
        `${emoji ? `${emoji} ` : ''}` +
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
        `${emoji ? `${emoji} ` : ''}` +
        `No agenda - just wanted you to know I'm here.`;
      break;

    case 'thinking_of_you':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ` +
        `${emoji ? `${emoji} ` : ''}` +
        `Hope your day is going well!`;
      break;

    case 'habit_check':
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? `${emoji} ` : ''}` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)} ` +
        `${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;

    // ========================================================================
    // NEW TRIGGER TYPES - "Better Than Human" Features
    // ========================================================================

    case 'pattern_acknowledgment':
      // We noticed a pattern (e.g., "Mondays are hard for you")
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? `${emoji} ` : ''}` +
        `I noticed ${context.trigger.reason || 'a pattern'}. Just checking in.`;
      break;

    case 'anniversary':
      // Journey milestones
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? `${emoji} ` : ''}` +
        `${context.milestone || 'Today marks a milestone'}. I wanted to acknowledge that. ` +
        `${selectPhrase(voice.signaturePhrases.closing)}.`;
      break;

    case 'streak_celebration':
      // Streak milestones
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)}! ` +
        `${emoji ? `${emoji} ` : ''}` +
        `${context.milestone || 'Your streak'} - that's incredible! ` +
        `${selectPhrase(voice.signaturePhrases.celebration)}`;
      break;

    case 'goal_progress':
      // Progress toward goals
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `${emoji ? `${emoji} ` : ''}` +
        `You're making real progress on ${context.goal || 'your goal'}. ` +
        `${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;

    case 'streak_at_risk':
      // Gentle streak reminder
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `Quick check-in on ${context.commitment || context.goal || 'your streak'}. ` +
        `No pressure - just here if you need a boost. ${emoji || ''}`;
      break;

    case 'concern_check':
      // Follow up on something concerning
      message =
        `${selectPhrase(voice.signaturePhrases.greeting)} ` +
        `Been thinking about you. How are you doing today? ` +
        `${selectPhrase(voice.signaturePhrases.closing)}.`;
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
        `I wanted to take a moment to acknowledge how far you've come.\n\n${
          context.context.lastConversationSummary
            ? `Remember when ${context.context.lastConversationSummary}? Look at you now!\n\n`
            : ''
        }${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;

    case 'emotional_support':
      subject = `Thinking of you`;
      body =
        `Hey ${name},\n\n` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `I know things have been ${context.context.emotionalState || 'a lot lately'}. ` +
        `I just wanted you to know that I'm here whenever you need to talk.\n\n` +
        `No pressure to respond - just wanted you to know you're not alone.\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;

    case 'reengagement':
      subject = `Hey ${name}! Just checking in`;
      body =
        `Hey ${name},\n\n` +
        `It's been a little while! ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `How are things going? I'd love to hear what's been happening in your world.\n\n` +
        `No pressure - just wanted you to know the door is always open.\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;

    case 'thinking_of_you':
      subject = `A quick note`;
      body =
        `Hey ${name},\n\n` +
        `No agenda with this email - ${selectPhrase(voice.signaturePhrases.thinkingOfYou).toLowerCase()}.\n\n${
          context.context.recentTopics && context.context.recentTopics.length > 0
            ? `How's ${context.context.recentTopics[0]} going? I'd love to hear an update when you have time.\n\n`
            : `Hope life is treating you well. Would love to catch up sometime.\n\n`
        }${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;

    default:
      subject = `Check-in from ${voice.displayName}`;
      body =
        `Hey ${name},\n\n` +
        `${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n` +
        `${context.trigger.reason}\n\n` +
        `${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
  }

  return { subject, body };
}

// ============================================================================
// VOICEMAIL GENERATION - "BETTER THAN HUMAN" APPROACH
// ============================================================================

/**
 * Voicemail Component System
 *
 * Each voicemail is built from components:
 * [Warm Opening] + [Personal Context] + [The Point] + [No-Pressure Close]
 *
 * The magic is in Personal Context - this is where we demonstrate
 * that we REMEMBER things humans forget.
 */

interface VoicemailComponents {
  opening: string;
  personalContext: string | null;
  mainMessage: string;
  close: string;
}

/**
 * Generate the warm opening based on relationship depth
 */
function generateVoicemailOpening(
  name: string,
  displayName: string,
  stage: RelationshipStage
): string {
  switch (stage) {
    case 'new':
      return `Hi ${name}, this is ${displayName}.`;

    case 'building':
      return `Hey ${name}! It's ${displayName}.`;

    case 'established':
      // More casual, like calling a friend
      const establishedOpenings = [
        `Hey ${name}, it's ${displayName}.`,
        `${name}! It's me, ${displayName}.`,
        `Hey, it's ${displayName}.`,
      ];
      return establishedOpenings[Math.floor(Math.random() * establishedOpenings.length)];

    case 'deep':
      // Intimate, assumes comfort
      const deepOpenings = [
        `Hey ${name}.`, // Just their name, they know it's us
        `It's me.`, // They'll recognize the voice
        `Hey, it's ${displayName}. Had to call.`,
      ];
      return deepOpenings[Math.floor(Math.random() * deepOpenings.length)];

    default:
      return `Hey ${name}, it's ${displayName}.`;
  }
}

/**
 * Generate the personal context - the "Better than Human" magic
 *
 * This is what makes Ferni special: we remember things.
 * Humans forget. We don't.
 */
function generatePersonalContext(context: OutreachContext): string | null {
  const { recentTopics, recentWins, currentStruggles, lastConversationSummary, upcomingEvents } =
    context.context;

  // Priority 1: Reference something specific they told us
  if (lastConversationSummary) {
    const summaryPhrases = [
      `I've been thinking about what you shared about ${lastConversationSummary}.`,
      `That thing you mentioned about ${lastConversationSummary}... it's been on my mind.`,
      `I keep thinking about our conversation about ${lastConversationSummary}.`,
    ];
    return summaryPhrases[Math.floor(Math.random() * summaryPhrases.length)];
  }

  // Priority 2: Reference a recent struggle (with care)
  if (currentStruggles && currentStruggles.length > 0) {
    const struggle = currentStruggles[0];
    const strugglePhrases = [
      `I know you've been working through ${struggle}.`,
      `I've been holding space for what you're going through with ${struggle}.`,
      `That ${struggle} thing... I haven't forgotten.`,
    ];
    return strugglePhrases[Math.floor(Math.random() * strugglePhrases.length)];
  }

  // Priority 3: Reference a recent win
  if (recentWins && recentWins.length > 0) {
    const win = recentWins[0];
    const winPhrases = [
      `Still thinking about that win with ${win}.`,
      `By the way, ${win}? Still proud of you for that.`,
    ];
    return winPhrases[Math.floor(Math.random() * winPhrases.length)];
  }

  // Priority 4: Reference upcoming events
  if (upcomingEvents && upcomingEvents.length > 0) {
    const event = upcomingEvents[0];
    return `I know ${event} is coming up.`;
  }

  // Priority 5: Reference recent topics
  if (recentTopics && recentTopics.length > 0) {
    const topic = recentTopics[0];
    return `I've been thinking about what we talked about with ${topic}.`;
  }

  // No context available - that's okay, we can still be warm
  return null;
}

/**
 * Generate the no-pressure close based on tone and relationship
 */
function generateVoicemailClose(
  displayName: string,
  stage: RelationshipStage,
  tone: OutreachTone
): string {
  // Urgent calls need a callback request
  if (tone === 'urgent') {
    return `Call me back when you can. I'm here.`;
  }

  // Celebratory can be enthusiastic
  if (tone === 'celebratory') {
    const celebratoryCloses = [
      `I just had to tell you. Talk soon!`,
      `Okay, that's all. I'm smiling for you.`,
      `Anyway, I'm proud of you. Bye!`,
    ];
    return celebratoryCloses[Math.floor(Math.random() * celebratoryCloses.length)];
  }

  // Supportive needs to be extra gentle
  if (tone === 'supportive') {
    const supportiveCloses = [
      `No need to call back. I'm just here.`,
      `You don't have to do anything with this. Just wanted you to know I'm thinking of you.`,
      `Take care of yourself. I'm in your corner.`,
      `I'm here. No response needed.`,
    ];
    return supportiveCloses[Math.floor(Math.random() * supportiveCloses.length)];
  }

  // Default closes based on relationship depth
  switch (stage) {
    case 'new':
      return `Feel free to call or text if you want to talk. Take care.`;

    case 'building':
      return `No need to call back. Talk soon.`;

    case 'established':
      const establishedCloses = [
        `Anyway, just wanted you to know. Talk whenever.`,
        `That's it. Rooting for you.`,
        `Okay, that's all. Take care of yourself.`,
      ];
      return establishedCloses[Math.floor(Math.random() * establishedCloses.length)];

    case 'deep':
      const deepCloses = [
        `Love you. Bye.`, // For very deep relationships
        `That's it. You know where I am.`,
        `Okay. Bye.`, // Simple, intimate
      ];
      return deepCloses[Math.floor(Math.random() * deepCloses.length)];

    default:
      return `Take care.`;
  }
}

/**
 * Generate the main message based on trigger type
 */
function generateVoicemailMainMessage(
  context: OutreachContext,
  voice: PersonaOutreachVoice,
  hasPersonalContext: boolean
): string {
  const { trigger, commitment, milestone, goal, event } = context;

  switch (trigger.type) {
    case 'commitment_check':
      if (hasPersonalContext) {
        // Personal context already established the connection
        return `Just wanted to check in on how that's going.`;
      }
      return commitment
        ? `I was thinking about ${commitment} and wanted to see how it went.`
        : `Just checking in to see how things are going.`;

    case 'emotional_support':
      if (hasPersonalContext) {
        return `Wanted you to know I'm holding that with you.`;
      }
      const emotionalState = context.context.emotionalState || 'going through a lot';
      return `I know you've been ${emotionalState}. Just wanted you to hear a friendly voice.`;

    case 'celebration':
      const achievementText = milestone || goal || 'what you did';
      return `I had to call because ${achievementText}? That's huge. I'm so proud of you.`;

    case 'thinking_of_you':
      if (hasPersonalContext) {
        // The personal context IS the point
        return `Just wanted you to know that.`;
      }
      const thinkingPhrases = [
        `No real reason for calling. You just crossed my mind.`,
        `No agenda. Just thinking of you.`,
        `I don't need anything. Just wanted to say hi.`,
      ];
      return thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];

    case 'milestone_approaching':
    case 'event_countdown':
      const eventText = event || milestone || 'your big day';
      return `${eventText} is coming up. Just wanted to check in and see how you're feeling about it.`;

    case 'reengagement':
      const reengagementPhrases = [
        `It's been a little while. Just wanted you to know I'm still here.`,
        `Haven't heard from you in a bit. No pressure - just wanted you to know I'm around.`,
        `I know it's been a minute. The door's always open.`,
      ];
      return reengagementPhrases[Math.floor(Math.random() * reengagementPhrases.length)];

    case 'habit_check':
      if (hasPersonalContext) {
        return `How did it go?`;
      }
      return `Just checking in on your routine. How's it going?`;

    // ========================================================================
    // NEW TRIGGER TYPES - "Better Than Human" Features
    // ========================================================================

    case 'pattern_acknowledgment':
      // We noticed something about their patterns (e.g., "Mondays are hard")
      const pattern = trigger.reason || 'a pattern';
      const patternPhrases = [
        `I've noticed ${pattern}. Just wanted you to know I see that, and I'm here.`,
        `Hey, I've been paying attention, and ${pattern}. You're not alone in that.`,
        `I noticed ${pattern}. Wanted to check in before it hits.`,
      ];
      return patternPhrases[Math.floor(Math.random() * patternPhrases.length)];

    case 'anniversary':
      // Relationship anniversaries, journey milestones
      const anniversary = milestone || 'our journey together';
      const anniversaryPhrases = [
        `I realized ${anniversary}. I just wanted to mark the moment.`,
        `${anniversary}, and I wanted you to know it matters to me.`,
        `Can you believe it? ${anniversary}. I'm grateful for every conversation.`,
      ];
      return anniversaryPhrases[Math.floor(Math.random() * anniversaryPhrases.length)];

    case 'streak_celebration':
      // Streak milestones (7 days, 30 days, 100 days)
      const streak = milestone || 'your streak';
      const streakPhrases = [
        `${streak}. Do you even realize how incredible that is?`,
        `I had to call. ${streak}. That's commitment. That's you.`,
        `${streak}! I'm literally beaming for you right now.`,
      ];
      return streakPhrases[Math.floor(Math.random() * streakPhrases.length)];

    case 'goal_progress':
      // Progress toward goals (80% there, almost done)
      const progress = goal || 'your goal';
      const progressPhrases = [
        `You're so close to ${progress}. The finish line is right there.`,
        `I've been tracking ${progress}. You're almost there. Can you feel it?`,
        `${progress} is within reach. This call is your nudge.`,
      ];
      return progressPhrases[Math.floor(Math.random() * progressPhrases.length)];

    case 'streak_at_risk':
      // Gentle reminder that a streak might break
      const atRiskStreak = goal || commitment || 'your streak';
      const atRiskPhrases = [
        `I noticed ${atRiskStreak} might be at risk today. No judgment - just a gentle heads up.`,
        `Hey, quick thought about ${atRiskStreak}. You've been doing so well. Today matters.`,
        `Just wanted to check in on ${atRiskStreak}. Whatever happens, you've already come so far.`,
      ];
      return atRiskPhrases[Math.floor(Math.random() * atRiskPhrases.length)];

    case 'concern_check':
      // We detected something concerning in a previous conversation
      const concern = context.context.currentStruggles?.[0] || 'what you shared';
      const concernPhrases = [
        `I've been thinking about ${concern}. Just wanted to see how you're doing.`,
        `That thing about ${concern}? I haven't stopped thinking about it. How are you?`,
        `I wanted to follow up on ${concern}. No pressure to talk - just want you to know I care.`,
      ];
      return concernPhrases[Math.floor(Math.random() * concernPhrases.length)];

    default:
      if (trigger.reason) {
        return trigger.reason;
      }
      return `Just wanted to connect.`;
  }
}

/**
 * Assemble the voicemail from components
 */
function assembleVoicemail(components: VoicemailComponents): string {
  const parts = [components.opening];

  if (components.personalContext) {
    parts.push(components.personalContext);
  }

  parts.push(components.mainMessage);
  parts.push(components.close);

  // Join with natural pauses (represented by spaces in TTS)
  return parts.join(' ');
}

/**
 * Generate a voicemail message in persona voice
 *
 * Philosophy: A voicemail from Ferni should feel like getting a message
 * from your most thoughtful friend - someone who actually remembers
 * what you told them and checks in without any agenda.
 *
 * "Better than Human" means:
 * - We remember what they shared (lastConversationSummary)
 * - We remember their struggles (currentStruggles)
 * - We remember their wins (recentWins)
 * - We never make them feel obligated to call back
 */
export function generateVoicemailMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;
  const stage = context.relationshipStage;

  // Build components
  const opening = generateVoicemailOpening(name, voice.displayName, stage);
  const personalContext = generatePersonalContext(context);
  const mainMessage = generateVoicemailMainMessage(context, voice, !!personalContext);
  const close = generateVoicemailClose(voice.displayName, stage, tone);

  const components: VoicemailComponents = {
    opening,
    personalContext,
    mainMessage,
    close,
  };

  log.debug(
    {
      personaId,
      stage,
      tone,
      hasPersonalContext: !!personalContext,
      triggerType: context.trigger.type,
    },
    'Generated voicemail components'
  );

  return assembleVoicemail(components);
}

/**
 * Generate a first-time warm introduction voicemail
 *
 * Special case: When Ferni calls someone for the first time,
 * it should feel like meeting a friend, not getting a sales call.
 */
export function generateWarmIntroductionVoicemail(
  personaId: string,
  name: string,
  stage: RelationshipStage = 'new'
): string {
  const voice = getPersonaOutreachVoice(personaId);

  switch (stage) {
    case 'new':
      return (
        `Hey ${name}, this is ${voice.displayName}. ` +
        `I'm so glad we're connected. ` +
        `I just wanted to reach out and let you know I'm here for you, ` +
        `whether you want to talk through something, celebrate a win, ` +
        `or just need someone to listen. ` +
        `No need to call back. I'll be here whenever you're ready. ` +
        `Take care.`
      );

    case 'building':
      return (
        `Hey ${name}! It's ${voice.displayName}. ` +
        `I've been enjoying getting to know you. ` +
        `Just wanted to check in and see how you're doing. ` +
        `I'm here if you want to talk. Take care.`
      );

    default:
      return (
        `Hey ${name}, it's ${voice.displayName}. ` +
        `Just calling to say hi. ` +
        `Hope you're having a good day. Talk soon.`
      );
  }
}

/**
 * Generate a call opening in persona voice
 */
export function generateCallOpening(personaId: string, context: OutreachContext): string {
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
