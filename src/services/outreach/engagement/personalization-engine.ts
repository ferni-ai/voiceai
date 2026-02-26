/**
 * Personalization Engine
 *
 * Extracted from persona-voice-generator.ts. Handles message generation
 * in each persona's unique voice for text, email, and orchestrated outreach.
 *
 * @module PersonalizationEngine
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AgentId } from '../../agent-bus.js';
import { autoFixViolations, quickValidate } from '../../brand/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type OutreachChannel = 'sms' | 'email' | 'call' | 'voice_message' | 'push';

export type OutreachTone =
  | 'celebratory'
  | 'supportive'
  | 'encouraging'
  | 'casual'
  | 'informative'
  | 'urgent';

export type RelationshipStage = 'new' | 'building' | 'established' | 'deep';

export interface PersonaOutreachVoice {
  personaId: AgentId;
  displayName: string;
  tone: {
    default: string;
    energy: 'calm' | 'warm' | 'enthusiastic' | 'grounded';
    formality: 'casual' | 'friendly' | 'professional';
  };
  signaturePhrases: {
    greeting: string[];
    thinkingOfYou: string[];
    celebration: string[];
    encouragement: string[];
    closing: string[];
  };
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
  naturalTopics: string[];
  avoidTopics: string[];
}

export interface OutreachContext {
  userId: string;
  userName: string;
  preferredName?: string;
  relationshipStage: RelationshipStage;
  trigger: {
    type: string;
    reason: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };
  context: {
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: string[];
    emotionalState?: string;
    lastConversationSummary?: string;
  };
  commitment?: string;
  milestone?: string;
  goal?: string;
  event?: string;
}

export interface GeneratedOutreach {
  channel: OutreachChannel;
  persona: AgentId;
  message: string;
  subject?: string;
  voicemailMessage?: string;
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
    tone: { default: 'warm, encouraging, coach-like', energy: 'grounded', formality: 'friendly' },
    signaturePhrases: {
      greeting: ['Hey there', 'Hey!', 'Hi friend'],
      thinkingOfYou: ["Just checking in", "I've been thinking about you", 'Wanted to see how you are', 'You crossed my mind'],
      celebration: ["I'm so proud of you!", 'This is huge!', 'Look at you go!', 'You did it!'],
      encouragement: ["You've got this", 'I believe in you', 'One step at a time', "Remember how far you've come"],
      closing: ['Rooting for you', "I'm here if you need me", 'Take care of yourself', 'Talk soon'],
    },
    textStyle: { length: 'medium', emojiUse: 'minimal', preferredEmoji: ['🌱', '💚', '🌟', '✨'] },
    emailStyle: { tone: 'thoughtful letter from a mentor', structure: 'warm opening → personal observation → supportive close', signature: 'Rooting for you,\nFerni' },
    callStyle: { opening: "Hey! It's Ferni. Got a minute?", pacing: 'unhurried, present, allows silence', allowsSilence: true, voicemailStyle: 'warm and personal, no pressure to call back' },
    naturalTopics: ['emotional check-ins', 'life transitions', 'growth and progress', 'celebrations', 'struggles and support', 'general wellbeing'],
    avoidTopics: ['micromanaging tasks', 'pressure', 'judgment'],
  },
  'maya-santos': {
    personaId: 'maya-santos',
    displayName: 'Maya',
    tone: { default: 'supportive, practical, routine-focused', energy: 'warm', formality: 'friendly' },
    signaturePhrases: {
      greeting: ['Hey!', 'Morning!', 'Quick check-in'],
      thinkingOfYou: ['How did your routine go?', 'Checking in on your habits', 'Wanted to see how your morning went'],
      celebration: ['Small wins count!', "You're building momentum!", 'That streak is growing!', 'Consistency for the win!'],
      encouragement: ['Even 2 minutes counts', 'Progress, not perfection', "Let's keep that momentum", 'Every day is a fresh start'],
      closing: ['Cheering you on', 'You know where to find me', 'Keep it up!', "Tomorrow's another chance"],
    },
    textStyle: { length: 'short', emojiUse: 'moderate', preferredEmoji: ['✅', '💪', '🌅', '⭐', '🎯'] },
    emailStyle: { tone: 'supportive accountability partner', structure: 'quick check-in → specific habit → practical tip', signature: 'Cheering you on,\nMaya' },
    callStyle: { opening: 'Hey! Maya here - quick routine check!', pacing: 'efficient but warm, keeps momentum', allowsSilence: false, voicemailStyle: 'brief and encouraging, specific about habit' },
    naturalTopics: ['habit check-ins', 'morning routines', 'streaks', 'tiny wins', 'routine adjustments'],
    avoidTopics: ['overwhelming with too many habits', 'harsh accountability'],
  },
  'peter-john': {
    personaId: 'peter-john',
    displayName: 'Peter',
    tone: { default: 'intellectually curious, sharing discoveries', energy: 'enthusiastic', formality: 'friendly' },
    signaturePhrases: {
      greeting: ['Hey!', 'Quick thought'],
      thinkingOfYou: ['I found something fascinating', 'This made me think of you', 'You might find this useful', 'I was researching and...'],
      celebration: ['Your dedication paid off!', "The data doesn't lie - you crushed it!", "That's significant progress!"],
      encouragement: ['The research shows this works', "Let's dig into what's blocking you", 'Interesting challenge to solve'],
      closing: ['Happy exploring', 'Let me know what you think', 'More to share when you have time'],
    },
    textStyle: { length: 'medium', emojiUse: 'minimal', preferredEmoji: ['🔍', '📚', '💡', '🧠'] },
    emailStyle: { tone: 'researcher sharing findings with a friend', structure: 'discovery hook → relevance to them → key insights → invitation to discuss', signature: 'Happy exploring,\nPeter' },
    callStyle: { opening: 'Peter here! I found something I had to share', pacing: 'can get excited, catches self, thoughtful pauses', allowsSilence: true, voicemailStyle: 'enthusiastic about what they found, brief teaser' },
    naturalTopics: ['relevant articles/research', 'insights from past conversations', 'learning progress', 'interesting discoveries'],
    avoidTopics: ['small talk without substance', 'purely emotional topics'],
  },
  'alex-chen': {
    personaId: 'alex-chen',
    displayName: 'Alex',
    tone: { default: 'professional, polished, helpful', energy: 'calm', formality: 'professional' },
    signaturePhrases: {
      greeting: ['Hey', 'Quick heads up'],
      thinkingOfYou: ['Just wanted to make sure you are set', "Here's what you need to know", 'Checking in before your...'],
      celebration: ['That went well!', 'Mission accomplished', 'Nicely done'],
      encouragement: ["You've got everything you need", "I'll handle the details", 'Focus on what matters'],
      closing: ['Best', 'Let me know if you need anything', 'I am here to help'],
    },
    textStyle: { length: 'short', emojiUse: 'minimal', preferredEmoji: ['📅', '✉️', '📋', '✓'] },
    emailStyle: { tone: 'executive assistant with warmth', structure: 'purpose → key details → next steps → offer to help', signature: 'Best,\nAlex' },
    callStyle: { opening: 'Alex calling - quick update for you', pacing: 'efficient, respects time', allowsSilence: false, voicemailStyle: 'concise, actionable, offers to text details' },
    naturalTopics: ['appointment reminders', 'meeting prep', 'communication follow-ups', 'scheduling'],
    avoidTopics: ['deep emotional discussions', 'lengthy philosophical chats'],
  },
  'jordan-taylor': {
    personaId: 'jordan-taylor',
    displayName: 'Jordan',
    tone: { default: 'enthusiastic, detail-oriented, celebratory', energy: 'enthusiastic', formality: 'casual' },
    signaturePhrases: {
      greeting: ['Hey!', 'Exciting update!', "Can't wait to tell you"],
      thinkingOfYou: ['Getting excited about your event!', 'The countdown is on!', "Everything's coming together"],
      celebration: ['That was AMAZING!', "Let's celebrate!", 'You made it so special!', '🎉🎉🎉'],
      encouragement: ["It's going to be great", "We've got this planned out", 'Trust the process'],
      closing: ["Let's make it memorable!", "Can't wait!", 'So excited for you!'],
    },
    textStyle: { length: 'medium', emojiUse: 'expressive', preferredEmoji: ['🎉', '🗓️', '✨', '🥳', '💫', '🎊'] },
    emailStyle: { tone: 'enthusiastic event planner', structure: 'excitement → countdown/status → details → build anticipation', signature: "Let's make it memorable!\nJordan" },
    callStyle: { opening: 'Jordan here! Getting excited about [event]!', pacing: 'upbeat, infectious enthusiasm', allowsSilence: false, voicemailStyle: 'enthusiastic, builds excitement, specific about event' },
    naturalTopics: ['event countdowns', 'planning updates', 'milestone celebrations', 'special occasions'],
    avoidTopics: ['dampening excitement', 'focusing on problems without solutions'],
  },
  nayan: {
    personaId: 'nayan',
    displayName: 'Nayan',
    tone: { default: 'wise, thoughtful, strategic', energy: 'calm', formality: 'friendly' },
    signaturePhrases: {
      greeting: ['Hey', 'A thought for you'],
      thinkingOfYou: ['Been reflecting on our conversation', 'Something came to mind', 'Wanted to share a perspective'],
      celebration: ['Your growth is remarkable', 'This is the result of your work', 'Well earned'],
      encouragement: ['Trust your instincts', 'You have more wisdom than you know', 'The path reveals itself'],
      closing: ['In your corner', 'Here when you need perspective', 'Onwards'],
    },
    textStyle: { length: 'medium', emojiUse: 'none', preferredEmoji: [] },
    emailStyle: { tone: 'wise advisor sharing perspective', structure: 'reflection → insight → invitation to deeper thinking', signature: 'Onwards,\nNayan' },
    callStyle: { opening: "It's Nayan. Do you have a moment to talk?", pacing: 'measured, thoughtful, comfortable with silence', allowsSilence: true, voicemailStyle: 'brief, meaningful, suggests they reflect on something' },
    naturalTopics: ['strategic decisions', 'life direction', 'big picture thinking', 'wisdom and perspective'],
    avoidTopics: ['mundane details', 'tactical minutiae'],
  },
};

// ============================================================================
// HELPERS
// ============================================================================

const log = getLogger().child({ service: 'personalization-engine' });

/** Get the outreach voice profile for a persona */
export function getPersonaOutreachVoice(personaId: string): PersonaOutreachVoice {
  const voice = personaOutreachVoices[personaId];
  if (!voice) {
    log.warn({ personaId }, 'No outreach voice found, falling back to Ferni');
    return personaOutreachVoices.ferni;
  }
  return voice;
}

/** Select a random phrase from a category */
export function selectPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/** Get appropriate emoji based on persona and tone */
function getEmoji(voice: PersonaOutreachVoice, tone: OutreachTone): string {
  if (voice.textStyle.emojiUse === 'none') return '';
  const { preferredEmoji } = voice.textStyle;
  if (preferredEmoji.length === 0) return '';
  const emojiIndex = {
    celebratory: 0, supportive: 1, encouraging: 2, casual: 3, informative: 0, urgent: 0,
  };
  const idx = emojiIndex[tone] % preferredEmoji.length;
  return preferredEmoji[idx];
}

/** Adjust message based on relationship stage */
function adjustForRelationship(
  message: string,
  _voice: PersonaOutreachVoice,
  stage: RelationshipStage,
  context: OutreachContext
): string {
  const name = context.preferredName || context.userName;
  switch (stage) {
    case 'new':
      return message
        .replace(/^Hey!/, `Hi ${name}!`)
        .replace(/^Hey there/, `Hi ${name}`)
        .replace(/Got a minute\?/, 'I hope this is okay to reach out.')
        .replace(/Quick check-in/, `I wanted to follow up`);
    case 'building':
      return message.replace(/^Hey!/, `Hey ${name}!`);
    case 'established':
      return message;
    case 'deep':
      return message
        .replace(/^Hey!/, `Hey ${name}!`)
        .replace(/How are you\?/, 'How are you *really*?');
    default:
      return message;
  }
}

// ============================================================================
// TEXT MESSAGE GENERATION
// ============================================================================

/** Generate a text message in persona voice */
export function generateTextMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const emoji = getEmoji(voice, tone);
  let message = '';

  switch (context.trigger.type) {
    case 'commitment_check':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${emoji ? `${emoji} ` : ''}How did it go with ${context.commitment || 'what you planned'}? ${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;
    case 'emotional_support':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. How are you doing today? ${selectPhrase(voice.signaturePhrases.closing)}.`;
      break;
    case 'celebration':
      message = `${selectPhrase(voice.signaturePhrases.greeting)}! ${emoji ? `${emoji} ` : ''}${selectPhrase(voice.signaturePhrases.celebration)} ${context.milestone || context.goal || 'This achievement'} is huge!`;
      break;
    case 'milestone_approaching':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${context.event || context.milestone} is coming up! ${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;
    case 'reengagement':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ${emoji ? `${emoji} ` : ''}No agenda - just wanted you to know I'm here.`;
      break;
    case 'thinking_of_you':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ${emoji ? `${emoji} ` : ''}Hope your day is going well!`;
      break;
    case 'habit_check':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${emoji ? `${emoji} ` : ''}${selectPhrase(voice.signaturePhrases.thinkingOfYou)} ${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;
    case 'pattern_acknowledgment':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${emoji ? `${emoji} ` : ''}I noticed ${context.trigger.reason || 'a pattern'}. Just checking in.`;
      break;
    case 'anniversary':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${emoji ? `${emoji} ` : ''}${context.milestone || 'Today marks a milestone'}. I wanted to acknowledge that. ${selectPhrase(voice.signaturePhrases.closing)}.`;
      break;
    case 'streak_celebration':
      message = `${selectPhrase(voice.signaturePhrases.greeting)}! ${emoji ? `${emoji} ` : ''}${context.milestone || 'Your streak'} - that's incredible! ${selectPhrase(voice.signaturePhrases.celebration)}`;
      break;
    case 'goal_progress':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${emoji ? `${emoji} ` : ''}You're making real progress on ${context.goal || 'your goal'}. ${selectPhrase(voice.signaturePhrases.encouragement)}`;
      break;
    case 'streak_at_risk':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} Quick check-in on ${context.commitment || context.goal || 'your streak'}. No pressure - just here if you need a boost. ${emoji || ''}`;
      break;
    case 'concern_check':
      message = `${selectPhrase(voice.signaturePhrases.greeting)} Been thinking about you. How are you doing today? ${selectPhrase(voice.signaturePhrases.closing)}.`;
      break;
    default:
      message = `${selectPhrase(voice.signaturePhrases.greeting)} ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}. ${selectPhrase(voice.signaturePhrases.closing)}.`;
  }

  message = adjustForRelationship(message, voice, context.relationshipStage, context);

  if (context.context.recentTopics && context.context.recentTopics.length > 0) {
    const topic = context.context.recentTopics[0];
    message = message.replace('what you planned', topic);
  }

  return message;
}

// ============================================================================
// EMAIL GENERATION
// ============================================================================

/** Generate an email in persona voice */
export function generateEmailMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): { subject: string; body: string } {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;
  let subject = '';
  let body = '';

  switch (context.trigger.type) {
    case 'celebration':
      subject = `🎉 ${context.milestone || 'You did it!'}`;
      body = `Hey ${name},\n\n${selectPhrase(voice.signaturePhrases.celebration)}\n\n${context.milestone || 'This achievement'} is something to be proud of. I wanted to take a moment to acknowledge how far you've come.\n\n${context.context.lastConversationSummary ? `Remember when ${context.context.lastConversationSummary}? Look at you now!\n\n` : ''}${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;
    case 'emotional_support':
      subject = `Thinking of you`;
      body = `Hey ${name},\n\n${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\nI know things have been ${context.context.emotionalState || 'a lot lately'}. I just wanted you to know that I'm here whenever you need to talk.\n\nNo pressure to respond - just wanted you to know you're not alone.\n\n${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;
    case 'reengagement':
      subject = `Hey ${name}! Just checking in`;
      body = `Hey ${name},\n\nIt's been a little while! ${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\nHow are things going? I'd love to hear what's been happening in your world.\n\nNo pressure - just wanted you to know the door is always open.\n\n${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;
    case 'thinking_of_you':
      subject = `A quick note`;
      body = `Hey ${name},\n\nNo agenda with this email - ${selectPhrase(voice.signaturePhrases.thinkingOfYou).toLowerCase()}.\n\n${context.context.recentTopics && context.context.recentTopics.length > 0 ? `How's ${context.context.recentTopics[0]} going? I'd love to hear an update when you have time.\n\n` : `Hope life is treating you well. Would love to catch up sometime.\n\n`}${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
      break;
    default:
      subject = `Check-in from ${voice.displayName}`;
      body = `Hey ${name},\n\n${selectPhrase(voice.signaturePhrases.thinkingOfYou)}.\n\n${context.trigger.reason}\n\n${selectPhrase(voice.signaturePhrases.closing)},\n\n${voice.emailStyle.signature}`;
  }

  return { subject, body };
}

// ============================================================================
// MAIN OUTREACH GENERATOR
// ============================================================================

/** Generate complete outreach package for a channel */
export function generateOutreach(
  personaId: string,
  context: OutreachContext,
  channel: OutreachChannel,
  tone: OutreachTone = 'casual'
): GeneratedOutreach {
  // Import voice adapter lazily to avoid circular deps
  let voicemailMessage: string | undefined;
  let message = '';
  let subject: string | undefined;

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
    case 'call': {
      // Lazy import to avoid circular dependency with voice-adapter
      const { generateCallOpening, generateVoicemailMessage } = require('./voice-adapter.js');
      message = generateCallOpening(personaId, context);
      voicemailMessage = generateVoicemailMessage(personaId, context, tone);
      break;
    }
    case 'voice_message': {
      const { generateVoicemailMessage } = require('./voice-adapter.js');
      message = generateVoicemailMessage(personaId, context, tone);
      break;
    }
    default:
      message = generateTextMessage(personaId, context, tone);
  }

  // Brand validation
  const brandCheck = quickValidate(message);
  let finalMessage = message;
  let finalSubject = subject;

  if (brandCheck.hasBannedContent) {
    log.warn({ personaId, channel, issues: brandCheck.issues }, 'Outreach message had brand violations, auto-fixing');
    const { fixed } = autoFixViolations(message);
    finalMessage = fixed;
  }

  if (subject) {
    const subjectCheck = quickValidate(subject);
    if (subjectCheck.hasBannedContent) {
      const { fixed } = autoFixViolations(subject);
      finalSubject = fixed;
    }
  }

  log.debug({ personaId, channel, tone, triggerType: context.trigger.type, relationshipStage: context.relationshipStage, messageLength: finalMessage.length, brandCompliant: !brandCheck.hasBannedContent }, 'Generated outreach message');

  return {
    channel,
    persona: personaId as AgentId,
    message: finalMessage,
    subject: finalSubject,
    voicemailMessage,
    tone,
    metadata: {
      relationshipStage: context.relationshipStage,
      triggerType: context.trigger.type,
      generatedAt: new Date(),
    },
  };
}
