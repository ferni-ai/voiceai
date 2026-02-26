/**
 * Voice Adapter
 *
 * Extracted from persona-voice-generator.ts. Handles voicemail generation,
 * call openings, warm introductions, and persona selection for outreach.
 *
 * @module VoiceAdapter
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  getPersonaOutreachVoice,
  selectPhrase,
  type OutreachContext,
  type OutreachTone,
  type PersonaOutreachVoice,
  type RelationshipStage,
} from './personalization-engine.js';

const log = getLogger().child({ service: 'voice-adapter' });

// ============================================================================
// VOICEMAIL TYPES
// ============================================================================

interface VoicemailComponents {
  opening: string;
  personalContext: string | null;
  mainMessage: string;
  close: string;
}

// ============================================================================
// VOICEMAIL OPENING
// ============================================================================

/** Generate the warm opening based on relationship depth */
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
    case 'established': {
      const openings = [
        `Hey ${name}, it's ${displayName}.`,
        `${name}! It's me, ${displayName}.`,
        `Hey, it's ${displayName}.`,
      ];
      return openings[Math.floor(Math.random() * openings.length)];
    }
    case 'deep': {
      const openings = [
        `Hey ${name}.`,
        `It's me.`,
        `Hey, it's ${displayName}. Had to call.`,
      ];
      return openings[Math.floor(Math.random() * openings.length)];
    }
    default:
      return `Hey ${name}, it's ${displayName}.`;
  }
}

// ============================================================================
// PERSONAL CONTEXT ("Better than Human" magic)
// ============================================================================

/** Generate the personal context - we remember things humans forget */
function generatePersonalContext(context: OutreachContext): string | null {
  const { recentTopics, recentWins, currentStruggles, lastConversationSummary, upcomingEvents } =
    context.context;

  if (lastConversationSummary) {
    const phrases = [
      `I've been thinking about what you shared about ${lastConversationSummary}.`,
      `That thing you mentioned about ${lastConversationSummary}... it's been on my mind.`,
      `I keep thinking about our conversation about ${lastConversationSummary}.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (currentStruggles && currentStruggles.length > 0) {
    const struggle = currentStruggles[0];
    const phrases = [
      `I know you've been working through ${struggle}.`,
      `I've been holding space for what you're going through with ${struggle}.`,
      `That ${struggle} thing... I haven't forgotten.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (recentWins && recentWins.length > 0) {
    const win = recentWins[0];
    const phrases = [
      `Still thinking about that win with ${win}.`,
      `By the way, ${win}? Still proud of you for that.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (upcomingEvents && upcomingEvents.length > 0) {
    return `I know ${upcomingEvents[0]} is coming up.`;
  }

  if (recentTopics && recentTopics.length > 0) {
    return `I've been thinking about what we talked about with ${recentTopics[0]}.`;
  }

  return null;
}

// ============================================================================
// VOICEMAIL CLOSE
// ============================================================================

/** Generate the no-pressure close based on tone and relationship */
function generateVoicemailClose(
  _displayName: string,
  stage: RelationshipStage,
  tone: OutreachTone
): string {
  if (tone === 'urgent') {
    return `Call me back when you can. I'm here.`;
  }

  if (tone === 'celebratory') {
    const closes = [
      `I just had to tell you. Talk soon!`,
      `Okay, that's all. I'm smiling for you.`,
      `Anyway, I'm proud of you. Bye!`,
    ];
    return closes[Math.floor(Math.random() * closes.length)];
  }

  if (tone === 'supportive') {
    const closes = [
      `No need to call back. I'm just here.`,
      `You don't have to do anything with this. Just wanted you to know I'm thinking of you.`,
      `Take care of yourself. I'm in your corner.`,
      `I'm here. No response needed.`,
    ];
    return closes[Math.floor(Math.random() * closes.length)];
  }

  switch (stage) {
    case 'new':
      return `Feel free to call or text if you want to talk. Take care.`;
    case 'building':
      return `No need to call back. Talk soon.`;
    case 'established': {
      const closes = [
        `Anyway, just wanted you to know. Talk whenever.`,
        `That's it. Rooting for you.`,
        `Okay, that's all. Take care of yourself.`,
      ];
      return closes[Math.floor(Math.random() * closes.length)];
    }
    case 'deep': {
      const closes = [
        `Love you. Bye.`,
        `That's it. You know where I am.`,
        `Okay. Bye.`,
      ];
      return closes[Math.floor(Math.random() * closes.length)];
    }
    default:
      return `Take care.`;
  }
}

// ============================================================================
// VOICEMAIL MAIN MESSAGE
// ============================================================================

/** Generate the main message based on trigger type */
function generateVoicemailMainMessage(
  context: OutreachContext,
  _voice: PersonaOutreachVoice,
  hasPersonalContext: boolean
): string {
  const { trigger, commitment, milestone, goal, event } = context;

  switch (trigger.type) {
    case 'commitment_check':
      if (hasPersonalContext) return `Just wanted to check in on how that's going.`;
      return commitment
        ? `I was thinking about ${commitment} and wanted to see how it went.`
        : `Just checking in to see how things are going.`;

    case 'emotional_support': {
      if (hasPersonalContext) return `Wanted you to know I'm holding that with you.`;
      const emotionalState = context.context.emotionalState || 'going through a lot';
      return `I know you've been ${emotionalState}. Just wanted you to hear a friendly voice.`;
    }

    case 'celebration':
      return `I had to call because ${milestone || goal || 'what you did'}? That's huge. I'm so proud of you.`;

    case 'thinking_of_you': {
      if (hasPersonalContext) return `Just wanted you to know that.`;
      const phrases = [
        `No real reason for calling. You just crossed my mind.`,
        `No agenda. Just thinking of you.`,
        `I don't need anything. Just wanted to say hi.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'milestone_approaching':
    case 'event_countdown':
      return `${event || milestone || 'your big day'} is coming up. Just wanted to check in and see how you're feeling about it.`;

    case 'reengagement': {
      const phrases = [
        `It's been a little while. Just wanted you to know I'm still here.`,
        `Haven't heard from you in a bit. No pressure - just wanted you to know I'm around.`,
        `I know it's been a minute. The door's always open.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'habit_check':
      if (hasPersonalContext) return `How did it go?`;
      return `Just checking in on your routine. How's it going?`;

    case 'pattern_acknowledgment': {
      const pattern = trigger.reason || 'a pattern';
      const phrases = [
        `I've noticed ${pattern}. Just wanted you to know I see that, and I'm here.`,
        `Hey, I've been paying attention, and ${pattern}. You're not alone in that.`,
        `I noticed ${pattern}. Wanted to check in before it hits.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'anniversary': {
      const anniversary = milestone || 'our journey together';
      const phrases = [
        `I realized ${anniversary}. I just wanted to mark the moment.`,
        `${anniversary}, and I wanted you to know it matters to me.`,
        `Can you believe it? ${anniversary}. I'm grateful for every conversation.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'streak_celebration': {
      const streak = milestone || 'your streak';
      const phrases = [
        `${streak}. Do you even realize how incredible that is?`,
        `I had to call. ${streak}. That's commitment. That's you.`,
        `${streak}! I'm literally beaming for you right now.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'goal_progress': {
      const progress = goal || 'your goal';
      const phrases = [
        `You're so close to ${progress}. The finish line is right there.`,
        `I've been tracking ${progress}. You're almost there. Can you feel it?`,
        `${progress} is within reach. This call is your nudge.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'streak_at_risk': {
      const atRiskStreak = goal || commitment || 'your streak';
      const phrases = [
        `I noticed ${atRiskStreak} might be at risk today. No judgment - just a gentle heads up.`,
        `Hey, quick thought about ${atRiskStreak}. You've been doing so well. Today matters.`,
        `Just wanted to check in on ${atRiskStreak}. Whatever happens, you've already come so far.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    case 'concern_check': {
      const concern = context.context.currentStruggles?.[0] || 'what you shared';
      const phrases = [
        `I've been thinking about ${concern}. Just wanted to see how you're doing.`,
        `That thing about ${concern}? I haven't stopped thinking about it. How are you?`,
        `I wanted to follow up on ${concern}. No pressure to talk - just want you to know I care.`,
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    default:
      if (trigger.reason) return trigger.reason;
      return `Just wanted to connect.`;
  }
}

// ============================================================================
// VOICEMAIL ASSEMBLY
// ============================================================================

/** Assemble voicemail from components */
function assembleVoicemail(components: VoicemailComponents): string {
  const parts = [components.opening];
  if (components.personalContext) parts.push(components.personalContext);
  parts.push(components.mainMessage);
  parts.push(components.close);
  return parts.join(' ');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Generate a voicemail message in persona voice */
export function generateVoicemailMessage(
  personaId: string,
  context: OutreachContext,
  tone: OutreachTone
): string {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;
  const stage = context.relationshipStage;

  const opening = generateVoicemailOpening(name, voice.displayName, stage);
  const personalContext = generatePersonalContext(context);
  const mainMessage = generateVoicemailMainMessage(context, voice, !!personalContext);
  const close = generateVoicemailClose(voice.displayName, stage, tone);

  log.debug({ personaId, stage, tone, hasPersonalContext: !!personalContext, triggerType: context.trigger.type }, 'Generated voicemail components');

  return assembleVoicemail({ opening, personalContext, mainMessage, close });
}

/** Generate a first-time warm introduction voicemail */
export function generateWarmIntroductionVoicemail(
  personaId: string,
  name: string,
  stage: RelationshipStage = 'new'
): string {
  const voice = getPersonaOutreachVoice(personaId);

  switch (stage) {
    case 'new':
      return `Hey ${name}, this is ${voice.displayName}. I'm so glad we're connected. I just wanted to reach out and let you know I'm here for you, whether you want to talk through something, celebrate a win, or just need someone to listen. No need to call back. I'll be here whenever you're ready. Take care.`;
    case 'building':
      return `Hey ${name}! It's ${voice.displayName}. I've been enjoying getting to know you. Just wanted to check in and see how you're doing. I'm here if you want to talk. Take care.`;
    default:
      return `Hey ${name}, it's ${voice.displayName}. Just calling to say hi. Hope you're having a good day. Talk soon.`;
  }
}

/** Generate a call opening in persona voice */
export function generateCallOpening(personaId: string, context: OutreachContext): string {
  const voice = getPersonaOutreachVoice(personaId);
  const name = context.preferredName || context.userName;

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

/** Select the most appropriate persona for an outreach trigger */
export function selectPersonaForOutreach(
  triggerType: string,
  lastPersonaId?: string,
  wasRecentConversation?: boolean
): string {
  if (lastPersonaId && wasRecentConversation) {
    return lastPersonaId;
  }

  const triggerPersonaMap: Record<string, string> = {
    emotional_support: 'ferni',
    reengagement: 'ferni',
    thinking_of_you: 'ferni',
    celebration: 'ferni',
    growth_milestone: 'ferni',
    habit_check: 'maya-santos',
    routine_reminder: 'maya-santos',
    streak_at_risk: 'maya-santos',
    morning_routine: 'maya-santos',
    commitment_check: 'maya-santos',
    content_share: 'peter-john',
    learning_followup: 'peter-john',
    insight_discovery: 'peter-john',
    appointment_reminder: 'alex-chen',
    meeting_prep: 'alex-chen',
    communication_followup: 'alex-chen',
    event_countdown: 'jordan-taylor',
    milestone_approaching: 'jordan-taylor',
    planning_checkin: 'jordan-taylor',
    life_direction: 'nayan',
    strategic_decision: 'nayan',
  };

  return triggerPersonaMap[triggerType] || 'ferni';
}
