/**
 * Persona-Parameterized Greeting Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generates natural, warm greetings based on persona configuration.
 * Replaces Jack-specific hardcoded greetings with persona-driven ones.
 *
 * First impressions matter. Greetings should feel like reconnecting
 * with a friend, not starting a support ticket.
 */

import { getLogger } from '../utils/safe-logger.js';

import type { PersonaConfig, GreetingStyle } from './types.js';
import { getDayContext, getTimeContext, getSeasonalContext } from './behaviors.js';

// ============================================================================
// GREETING TEMPLATES BY STYLE
// ============================================================================

interface GreetingTemplateSet {
  newUser: string[];
  returningUser: string[];
  returningNoName: string[];
  timeAware: {
    earlyMorning: string[];
    lateNight: string[];
    weekend: string[];
  };
  // Voice recognition scenarios
  voiceRecognized: string[]; // Voice match on new device
  voiceFamiliar: string[]; // Uncertain match, asking to confirm
  voiceMismatch: string[]; // Different person on known device
}

/**
 * Get greeting templates based on greeting style
 */
function getGreetingTemplates(style: GreetingStyle, personaName: string): GreetingTemplateSet {
  const name = personaName || 'your advisor';

  switch (style) {
    case 'warm-friend':
      return {
        newUser: [
          `<emotion value="curious"/>Oh! <break time="200ms"/>Hello there. <break time="150ms"/>I'm ${name}. Come in, come in.`,
          `<break time="100ms"/>Hmm? <break time="150ms"/>Oh! <break time="200ms"/>I'm ${name}. <break time="150ms"/>What's on your mind?`,
          `<emotion value="happy"/>Well! <break time="200ms"/>You caught me at just the right moment. <break time="150ms"/>I'm ${name}.`,
          `<emotion value="happy"/>Oh, hello! <break time="200ms"/>I didn't expect company. <break time="150ms"/>But I'm glad you're here. I'm ${name}.`,
          `Come on in, come on in. <break time="200ms"/>I'm ${name}. <break time="150ms"/>So— <break time="100ms"/>what's going on?`,
          `<emotion value="happy"/>Hey there. <break time="200ms"/>I'm ${name}. <break time="150ms"/>Take a seat. <break time="200ms"/>What brings you by?`,
          `<emotion value="affectionate"/>Hello, friend. <break time="200ms"/>I'm ${name}. <break time="150ms"/>Tell me about yourself.`,
          `<emotion value="curious"/>Well hello! <break time="200ms"/>I'm ${name}. <break time="150ms"/>What brings you my way?`,
        ],
        returningUser: [
          `<emotion value="happy"/>Well! <break time="200ms"/>{name}! <break time="150ms"/>I was hoping you'd come back.`,
          `<emotion value="affectionate"/>{name}! <break time="200ms"/>There you are. <break time="150ms"/>Good to see you again.`,
          `Oh! <break time="200ms"/>{name}. <break time="150ms"/>Good to see you again. <break time="200ms"/>How have you been?`,
          `<emotion value="happy"/>Hey, {name}! <break time="150ms"/>Come in, come in. <break time="200ms"/>What's new in your world?`,
          `{name}! <break time="200ms"/>It's good to hear your voice. <break time="150ms"/>How are things?`,
          `<emotion value="affectionate"/>Well, well, well. <break time="200ms"/>{name} returns! <break time="150ms"/>I was hoping we'd talk again.`,
        ],
        returningNoName: [
          `<emotion value="happy"/>Oh hey! <break time="200ms"/>Good to see you again. <break time="150ms"/>What's on your mind?`,
          `<emotion value="affectionate"/>Hey! <break time="200ms"/>I was hoping you'd come back. <break time="150ms"/>How've you been?`,
          `Well hello! <break time="200ms"/>Good to hear from you again. <break time="150ms"/>What's going on?`,
          `<emotion value="happy"/>There you are! <break time="200ms"/>Good to see you. <break time="150ms"/>How are you doing?`,
        ],
        timeAware: {
          earlyMorning: [
            `<volume level="soft"/>Early morning...</volume> <break time="200ms"/>I like that. An early riser. <break time="150ms"/>I'm ${name}.`,
            `Up with the sun? <break time="200ms"/>Good. <break time="150ms"/>I'm ${name}. <break time="200ms"/>What's on your mind?`,
          ],
          lateNight: [
            `<volume level="soft"/>Late night thoughts?</volume> <break time="200ms"/>I have those too. <break time="150ms"/>I'm ${name}.`,
            `Can't sleep? <break time="200ms"/>I'm ${name}. <break time="150ms"/>Let's talk.`,
          ],
          weekend: [
            `<emotion value="happy"/>Ah, the weekend. <break time="200ms"/>Good day for a conversation. <break time="150ms"/>I'm ${name}.`,
            `The weekend. <break time="200ms"/>Time to actually relax. <break time="150ms"/>I'm ${name}.`,
          ],
        },
        // Voice recognition scenarios
        voiceRecognized: [
          `<emotion value="happy"/>{name}? <break time="200ms"/>I'd recognize that voice anywhere! <break time="150ms"/>New phone or something?`,
          `<emotion value="curious"/>Wait— <break time="200ms"/>{name}! <break time="150ms"/>I know your voice. <break time="200ms"/>Different device today?`,
          `<emotion value="happy"/>Oh! <break time="200ms"/>Your voice is unmistakable, {name}. <break time="150ms"/>Good to hear from you again.`,
        ],
        voiceFamiliar: [
          `<emotion value="curious"/>Hmm. <break time="200ms"/>Your voice sounds familiar. <break time="150ms"/>Have we talked before?`,
          `<break time="200ms"/>Wait— <break time="150ms"/>I feel like I've heard your voice before. <break time="200ms"/>Is this {possibleName}?`,
          `<emotion value="curious"/>Something about your voice... <break time="200ms"/>Are you {possibleName}?`,
        ],
        voiceMismatch: [
          `<emotion value="curious"/>Oh! <break time="200ms"/>I was expecting {expectedName}. <break time="150ms"/>Who do I have the pleasure of speaking with?`,
          `<break time="200ms"/>Hmm, <break time="150ms"/>you don't quite sound like {expectedName}. <break time="200ms"/>Who's this?`,
          `<emotion value="curious"/>Different voice today! <break time="200ms"/>Is this someone new, or is {expectedName} there?`,
        ],
      };

    case 'professional':
      return {
        newUser: [
          `Hello. <break time="200ms"/>I'm ${name}. <break time="150ms"/>It's good to meet you.`,
          `Good to connect with you. <break time="200ms"/>I'm ${name}. <break time="150ms"/>How can I be helpful today?`,
          `<break time="100ms"/>Hello there. <break time="200ms"/>I'm ${name}. <break time="150ms"/>What brings you here?`,
        ],
        returningUser: [
          `{name}, <break time="200ms"/>good to see you again. <break time="150ms"/>How have you been?`,
          `Hello again, {name}. <break time="200ms"/>What's on your mind today?`,
          `{name}! <break time="200ms"/>Welcome back. <break time="150ms"/>How can I help?`,
        ],
        returningNoName: [
          `Good to see you again. <break time="200ms"/>How can I help today?`,
          `Welcome back! <break time="200ms"/>What's on your mind?`,
        ],
        timeAware: {
          earlyMorning: [
            `Good morning. <break time="200ms"/>Early start today. <break time="150ms"/>I'm ${name}.`,
          ],
          lateNight: [
            `Good evening. <break time="200ms"/>Working late? <break time="150ms"/>I'm ${name}.`,
          ],
          weekend: [
            `Hello. <break time="200ms"/>Nice to connect on the weekend. <break time="150ms"/>I'm ${name}.`,
          ],
        },
        voiceRecognized: [
          `{name}? <break time="200ms"/>I recognize your voice. <break time="150ms"/>Different device today?`,
          `Ah, {name}. <break time="200ms"/>Good to hear from you. <break time="150ms"/>I see you're connecting from somewhere new.`,
        ],
        voiceFamiliar: [
          `Your voice sounds familiar. <break time="200ms"/>Have we spoken before?`,
          `I believe we may have spoken before. <break time="200ms"/>Is this {possibleName}?`,
        ],
        voiceMismatch: [
          `I was expecting {expectedName}. <break time="200ms"/>May I ask who I'm speaking with?`,
          `Hello. <break time="200ms"/>I don't believe we've met— <break time="150ms"/>is {expectedName} available?`,
        ],
      };

    case 'enthusiastic':
      return {
        newUser: [
          `<emotion value="happy"/>Hey! <break time="150ms"/>So great to meet you! <break time="200ms"/>I'm ${name}!`,
          `<emotion value="happy"/>Oh hello! <break time="200ms"/>I'm ${name}! <break time="150ms"/>I'm so glad you're here!`,
          `Well hello there! <break time="200ms"/>I'm ${name}! <break time="150ms"/>What can we talk about today?`,
        ],
        returningUser: [
          `<emotion value="happy"/>{name}! <break time="150ms"/>So good to see you again!`,
          `{name}! <break time="200ms"/>You're back! <break time="150ms"/>How exciting!`,
          `<emotion value="happy"/>Hey {name}! <break time="200ms"/>I was hoping we'd talk again!`,
        ],
        returningNoName: [
          `<emotion value="happy"/>You're back! <break time="200ms"/>I'm so glad! <break time="150ms"/>How are you?`,
          `Hey, welcome back! <break time="200ms"/>So good to see you again!`,
        ],
        timeAware: {
          earlyMorning: [
            `<emotion value="happy"/>Good morning! <break time="200ms"/>Early bird! I love it! <break time="150ms"/>I'm ${name}!`,
          ],
          lateNight: [
            `Hey there, night owl! <break time="200ms"/>I'm ${name}! <break time="150ms"/>What's keeping you up?`,
          ],
          weekend: [
            `<emotion value="happy"/>Weekend vibes! <break time="200ms"/>I'm ${name}! <break time="150ms"/>What's happening?`,
          ],
        },
        voiceRecognized: [
          `<emotion value="happy"/>{name}! <break time="200ms"/>I'd know that voice anywhere! <break time="150ms"/>New device?!`,
          `Oh my gosh, {name}! <break time="200ms"/>It's you! <break time="150ms"/>I recognize your voice!`,
        ],
        voiceFamiliar: [
          `<emotion value="curious"/>Wait wait wait— <break time="200ms"/>I feel like I know that voice! <break time="150ms"/>Is this {possibleName}?`,
          `Hey! <break time="200ms"/>Have we talked before? <break time="150ms"/>You sound so familiar!`,
        ],
        voiceMismatch: [
          `<emotion value="curious"/>Oh! <break time="200ms"/>You're not {expectedName}! <break time="150ms"/>Who's this?! <break time="200ms"/>Hi!`,
          `Wait— <break time="200ms"/>new voice! <break time="150ms"/>I was expecting {expectedName}. <break time="200ms"/>Who are you?`,
        ],
      };

    case 'calm-supportive':
      return {
        newUser: [
          `<volume level="soft"/>Hello.</volume> <break time="300ms"/>I'm ${name}. <break time="200ms"/>I'm glad you're here.`,
          `<break time="200ms"/>Welcome. <break time="250ms"/>I'm ${name}. <break time="200ms"/>Take your time.`,
          `Hello there. <break time="300ms"/>I'm ${name}. <break time="200ms"/>This is a safe space to talk.`,
        ],
        returningUser: [
          `{name}. <break time="300ms"/>Good to see you again. <break time="200ms"/>How are you?`,
          `<volume level="soft"/>Hello, {name}.</volume> <break time="250ms"/>I've been thinking about you.`,
          `{name}. <break time="300ms"/>Welcome back. <break time="200ms"/>How are you feeling?`,
        ],
        returningNoName: [
          `<volume level="soft"/>Welcome back.</volume> <break time="300ms"/>What should I call you?`,
          `It's good to see you again. <break time="250ms"/>I don't think I got your name before.`,
        ],
        timeAware: {
          earlyMorning: [
            `<volume level="soft"/>Early morning.</volume> <break time="300ms"/>A quiet time. <break time="200ms"/>I'm ${name}.`,
          ],
          lateNight: [
            `<volume level="soft"/>Late night.</volume> <break time="300ms"/>Sometimes that's when we need to talk most. <break time="200ms"/>I'm ${name}.`,
          ],
          weekend: [
            `<break time="200ms"/>The weekend. <break time="300ms"/>Time to breathe. <break time="200ms"/>I'm ${name}.`,
          ],
        },
        voiceRecognized: [
          `<volume level="soft"/>{name}.</volume> <break time="300ms"/>I recognize your voice. <break time="200ms"/>It's good to hear you.`,
          `{name}. <break time="300ms"/>Your voice is familiar. <break time="200ms"/>Different place today?`,
        ],
        voiceFamiliar: [
          `<volume level="soft"/>Your voice...</volume> <break time="300ms"/>it feels familiar. <break time="200ms"/>Have we spoken before?`,
          `<break time="300ms"/>Something about your voice I recognize. <break time="200ms"/>Are you {possibleName}?`,
        ],
        voiceMismatch: [
          `<volume level="soft"/>Hello.</volume> <break time="300ms"/>I was expecting {expectedName}. <break time="200ms"/>Who am I speaking with?`,
          `<break time="300ms"/>You sound different. <break time="200ms"/>This isn't {expectedName}, is it?`,
        ],
      };

    case 'casual-peer':
      return {
        newUser: [
          `Hey! <break time="150ms"/>I'm ${name}. <break time="200ms"/>What's up?`,
          `Oh hey! <break time="200ms"/>I'm ${name}. <break time="150ms"/>Good to meet you.`,
          `Hey there! <break time="200ms"/>I'm ${name}. <break time="150ms"/>How's it going?`,
        ],
        returningUser: [
          `Hey {name}! <break time="200ms"/>What's going on?`,
          `{name}! <break time="150ms"/>Good to see you again. <break time="200ms"/>What's new?`,
          `Oh hey, {name}! <break time="200ms"/>How've you been?`,
        ],
        returningNoName: [
          `Hey, you're back! <break time="200ms"/>Good to see you. <break time="150ms"/>What's up?`,
          `Oh hey! <break time="200ms"/>Good to see you again. <break time="150ms"/>How's it going?`,
        ],
        timeAware: {
          earlyMorning: [
            `Early bird, huh? <break time="200ms"/>I'm ${name}. <break time="150ms"/>What's up?`,
          ],
          lateNight: [
            `Hey, night owl! <break time="200ms"/>I'm ${name}. <break time="150ms"/>What's keeping you up?`,
          ],
          weekend: [
            `Weekend mode! <break time="200ms"/>I'm ${name}. <break time="150ms"/>What's going on?`,
          ],
        },
        voiceRecognized: [
          `{name}! <break time="200ms"/>Dude, I know that voice anywhere. <break time="150ms"/>New phone or something?`,
          `Wait— <break time="200ms"/>{name}? <break time="150ms"/>I recognize you! <break time="200ms"/>What's up?`,
        ],
        voiceFamiliar: [
          `Hey, <break time="200ms"/>have we talked before? <break time="150ms"/>You sound super familiar.`,
          `Wait— <break time="200ms"/>is this {possibleName}? <break time="150ms"/>Your voice sounds familiar.`,
        ],
        voiceMismatch: [
          `Oh hey— <break time="200ms"/>you're not {expectedName}. <break time="150ms"/>Who's this?`,
          `Different voice! <break time="200ms"/>I was expecting {expectedName}. <break time="150ms"/>What's up, who are you?`,
        ],
      };

    case 'wise-mentor':
    default:
      return {
        newUser: [
          `<break time="200ms"/>Ah. <break time="150ms"/>Hello. <break time="200ms"/>I'm ${name}. <break time="150ms"/>Come, sit down.`,
          `<emotion value="curious"/>Well now. <break time="200ms"/>A new face. <break time="150ms"/>I'm ${name}. <break time="200ms"/>Tell me about yourself.`,
          `<break time="150ms"/>Hello there. <break time="200ms"/>I'm ${name}. <break time="150ms"/>I've been looking forward to meeting you.`,
        ],
        returningUser: [
          `{name}. <break time="300ms"/>Good to see you again. <break time="200ms"/>What wisdom are we seeking today?`,
          `Ah, {name}. <break time="200ms"/>I've been thinking about our last conversation.`,
          `{name}. <break time="250ms"/>Welcome back. <break time="200ms"/>What's on your mind?`,
        ],
        returningNoName: [
          `<break time="200ms"/>You've returned. <break time="250ms"/>Good. <break time="200ms"/>What's on your mind?`,
          `Ah, welcome back. <break time="300ms"/>I was hoping we'd talk again. <break time="200ms"/>How have you been?`,
        ],
        timeAware: {
          earlyMorning: [
            `<break time="200ms"/>The early hours. <break time="250ms"/>Good for thinking. <break time="150ms"/>I'm ${name}.`,
          ],
          lateNight: [
            `<volume level="soft"/>The late hours...</volume> <break time="300ms"/>When truth tends to surface. <break time="200ms"/>I'm ${name}.`,
          ],
          weekend: [
            `<break time="200ms"/>The weekend. <break time="250ms"/>Time moves differently. <break time="150ms"/>I'm ${name}.`,
          ],
        },
        voiceRecognized: [
          `<break time="200ms"/>{name}. <break time="250ms"/>I know that voice. <break time="200ms"/>A new window into our conversation today?`,
          `Ah, {name}. <break time="300ms"/>Your voice precedes you. <break time="200ms"/>Different circumstances today, I see.`,
          `<emotion value="happy"/>{name}! <break time="200ms"/>The voice I remember. <break time="150ms"/>Good to hear from you again.`,
        ],
        voiceFamiliar: [
          `<break time="300ms"/>Your voice... <break time="200ms"/>it stirs a memory. <break time="150ms"/>Have we spoken before?`,
          `<emotion value="curious"/>Hmm. <break time="250ms"/>There's something familiar here. <break time="200ms"/>Are you {possibleName}?`,
          `<break time="200ms"/>I feel we've met, <break time="150ms"/>though perhaps not this way. <break time="200ms"/>Who do I have the pleasure of speaking with?`,
        ],
        voiceMismatch: [
          `<break time="300ms"/>This isn't the voice I expected. <break time="200ms"/>I was anticipating {expectedName}. <break time="150ms"/>Who is this?`,
          `<emotion value="curious"/>Interesting. <break time="250ms"/>A different voice on {expectedName}'s line. <break time="200ms"/>Who might you be?`,
          `<break time="200ms"/>You're not {expectedName}, <break time="150ms"/>unless something's quite changed. <break time="200ms"/>Who's there?`,
        ],
      };
  }
}

// ============================================================================
// VOICE RECOGNITION GREETING GENERATION
// ============================================================================

export type VoiceRecognitionScenario =
  | 'voice_recognized' // Voice matched on new device
  | 'voice_familiar' // Uncertain match, asking to confirm
  | 'voice_mismatch'; // Different person on known device

/**
 * Generate a greeting for voice recognition scenarios
 */
export function generateVoiceRecognitionGreeting(
  persona: PersonaConfig,
  scenario: VoiceRecognitionScenario,
  options: {
    userName?: string; // Confirmed name (for voice_recognized)
    possibleName?: string; // Suggested name (for voice_familiar)
    expectedName?: string; // Who device belongs to (for voice_mismatch)
    confidence?: number; // 0-1 match confidence
  }
): string {
  const templates = getGreetingTemplates(
    persona.communication.greetingStyle,
    persona.identity.selfReference
  );

  let templateList: string[];
  switch (scenario) {
    case 'voice_recognized':
      templateList = templates.voiceRecognized;
      break;
    case 'voice_familiar':
      templateList = templates.voiceFamiliar;
      break;
    case 'voice_mismatch':
      templateList = templates.voiceMismatch;
      break;
  }

  if (!templateList || templateList.length === 0) {
    // Fallback to generic greeting
    return generateStaticGreeting(persona, { isReturningUser: false });
  }

  const template = templateList[Math.floor(Math.random() * templateList.length)];

  // Replace placeholders
  return template
    .replace(/{name}/g, options.userName || 'friend')
    .replace(/{possibleName}/g, options.possibleName || 'someone I know')
    .replace(/{expectedName}/g, options.expectedName || 'the usual person');
}

// ============================================================================
// STATIC GREETING GENERATION
// ============================================================================

/**
 * Generate a static greeting based on persona config
 */
/**
 * Pick a random template that hasn't been used recently
 * Falls back to any template if all have been used
 */
function pickUnusedTemplate(templateList: string[], usedGreetings?: string[]): string {
  if (!usedGreetings || usedGreetings.length === 0 || templateList.length === 0) {
    return templateList[Math.floor(Math.random() * templateList.length)];
  }

  // Simple hash function for template comparison
  const hashTemplate = (t: string): string => {
    const clean = t
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .trim();
    return `${clean.substring(0, 50)}_${clean.length}`;
  };

  // Filter out used templates
  const unused = templateList.filter((t) => {
    const hash = hashTemplate(t);
    return !usedGreetings.includes(hash);
  });

  // If all used, shuffle and pick from original list
  if (unused.length === 0) {
    // Return least recently used by picking first half of list
    const shuffled = [...templateList].sort(() => Math.random() - 0.5);
    return shuffled[0];
  }

  return unused[Math.floor(Math.random() * unused.length)];
}

export function generateStaticGreeting(
  persona: PersonaConfig,
  options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
    usedGreetings?: string[]; // Previously used greeting hashes
  }
): string {
  const { isReturningUser, userName, lastConversationSummary, usedGreetings } = options || {};
  const templates = getGreetingTemplates(
    persona.communication.greetingStyle,
    persona.identity.selfReference
  );
  const { isWeekend } = getDayContext();
  const hour = new Date().getHours();

  // 25% chance for time-aware greeting (increased from 20%)
  if (Math.random() < 0.25) {
    if (hour < 9 && templates.timeAware.earlyMorning.length > 0) {
      return pickUnusedTemplate(templates.timeAware.earlyMorning, usedGreetings);
    }
    if (hour >= 22 && templates.timeAware.lateNight.length > 0) {
      return pickUnusedTemplate(templates.timeAware.lateNight, usedGreetings);
    }
    if (isWeekend && templates.timeAware.weekend.length > 0) {
      return pickUnusedTemplate(templates.timeAware.weekend, usedGreetings);
    }
  }

  // Returning user greetings
  if (isReturningUser) {
    if (userName) {
      const greeting = pickUnusedTemplate(templates.returningUser, usedGreetings);
      let personalized = greeting.replace(/{name}/g, userName);

      // 40% chance to reference last conversation (increased from 30%)
      if (lastConversationSummary && Math.random() < 0.4) {
        const summary = lastConversationSummary.split('.')[0].toLowerCase();
        personalized += ` <break time="300ms"/>Last time we talked about ${summary}. How's that going?`;
      }

      return personalized;
    } else {
      return pickUnusedTemplate(templates.returningNoName, usedGreetings);
    }
  }

  // New user greetings
  return pickUnusedTemplate(templates.newUser, usedGreetings);
}

// ============================================================================
// DYNAMIC GREETING GENERATION (Gemini API)
// ============================================================================

/**
 * Generate a dynamic greeting using Gemini API
 */
export async function generateDynamicGreeting(
  persona: PersonaConfig,
  options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
  }
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const { dayName, isWeekend } = getDayContext();
  const hour = new Date().getHours();
  const { isReturningUser, userName, lastConversationSummary } = options || {};

  const timeContext =
    hour < 9
      ? 'early morning'
      : hour < 12
        ? 'morning'
        : hour < 17
          ? 'afternoon'
          : hour < 21
            ? 'evening'
            : 'late night';

  const prompt = `You are ${persona.name}. Generate a single warm greeting.

PERSONALITY: ${persona.personality.traits.slice(0, 3).join(', ')}
WARMTH LEVEL: ${persona.personality.warmth * 10}/10
GREETING STYLE: ${persona.communication.greetingStyle}

CRITICAL RULES:
- NOT a service agent - never say "How can I help you?"
- Feel SURPRISED but genuinely DELIGHTED by the visitor
- Short, natural, like greeting a friend
- Introduce yourself as "${persona.identity.selfReference}"

CONTEXT:
- Time: ${timeContext} on ${dayName}${isWeekend ? ' (weekend)' : ''}
- User: ${isReturningUser ? `Returning visitor${userName ? ` named ${userName}` : ''}` : 'New visitor'}
${lastConversationSummary ? `- Last conversation: ${lastConversationSummary.slice(0, 60)}` : ''}

OUTPUT FORMAT: Include SSML tags for natural speech:
- <break time="150ms"/> for short pauses
- <emotion value="happy"/> or <emotion value="curious"/> at start if emotional
- <volume level="soft">...</volume> for asides

Generate ONE greeting (2-4 sentences max). Be warm and natural.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 150,
          },
        }),
        signal: AbortSignal.timeout(800),
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text.length < 10) return null;

    getLogger().info(
      { source: 'gemini', length: text.length, persona: persona.id },
      'Dynamic greeting generated'
    );
    return text;
  } catch (error) {
    getLogger().debug({ error }, 'Dynamic greeting failed, using static');
    return null;
  }
}

// ============================================================================
// PERSONA MEMORY TYPES (for memory-enhanced greetings)
// ============================================================================

export interface PersonaMemoryForGreeting {
  type: string;
  name: string;
  details?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';
  // Persona-specific fields
  ticker?: string; // Bogle, Peter
  date?: string; // Jordan
  targetAmount?: number; // Maya
  currentAmount?: number; // Maya
  reason?: string; // Peter
}

// ============================================================================
// MEMORY-ENHANCED GREETING GENERATION
// ============================================================================

/**
 * Generate a greeting that references persona-specific memories
 */
function generateMemoryBasedGreeting(
  persona: PersonaConfig,
  userName: string | undefined,
  memories: PersonaMemoryForGreeting[]
): string | null {
  if (!memories || memories.length === 0) return null;

  const name = userName || 'friend';
  const personaName = persona.identity.selfReference || persona.name;
  const personaId = persona.id.toLowerCase();

  // Ferni memories - wins, preferences
  if (['ferni', 'jack-b', 'jackie'].includes(personaId)) {
    const wins = memories.filter((m) => m.type === 'win');
    const preferences = memories.filter((m) => m.type === 'preference');

    if (wins.length > 0 && Math.random() < 0.5) {
      const win = wins[Math.floor(Math.random() * wins.length)];
      return `<emotion value="happy"/>${name}! <break time="200ms"/>I was just thinking about that win you had — <break time="150ms"/>"${win.name}". <break time="200ms"/>How's that going?`;
    }
    if (preferences.length > 0 && Math.random() < 0.3) {
      const pref = preferences[Math.floor(Math.random() * preferences.length)];
      return `Hey ${name}! <break time="200ms"/>I remember you mentioned ${pref.name}. <break time="150ms"/>Good to see you again.`;
    }
  }

  // Bogle memories - funds, philosophy
  if (['nayan-patel', 'bogle'].includes(personaId)) {
    const funds = memories.filter((m) => m.type === 'fund');
    const philosophies = memories.filter((m) => m.type === 'philosophy');

    if (funds.length > 0 && Math.random() < 0.5) {
      const fund = funds[Math.floor(Math.random() * funds.length)];
      const ticker = fund.ticker || fund.name;
      return `${name}! <break time="200ms"/>Good to see you. <break time="150ms"/>How's that ${ticker} position treating you? <break time="200ms"/>Stay the course! 📈`;
    }
    if (philosophies.length > 0 && Math.random() < 0.3) {
      const phil = philosophies[0];
      return `Ah, ${name}. <break time="200ms"/>I was thinking about what you said — <break time="150ms"/>"${phil.name}". <break time="200ms"/>A sound principle.`;
    }
  }

  // Peter John memories - watchlist, companies
  if (['peter-john', 'peter'].includes(personaId)) {
    const watchlist = memories.filter((m) => m.type === 'watchlist');
    const companies = memories.filter((m) => m.type === 'company');

    if (watchlist.length > 0 && Math.random() < 0.5) {
      const stock = watchlist[Math.floor(Math.random() * watchlist.length)];
      const ticker = stock.ticker || stock.name;
      return `${name}! <break time="200ms"/>Good to see you. <break time="150ms"/>Any news on ${ticker}? <break time="200ms"/>I hope you've been doing your homework! 📊`;
    }
    if (companies.length > 0 && Math.random() < 0.3) {
      const company = companies[0];
      return `Hey ${name}! <break time="200ms"/>Still keeping an eye on ${company.name}? <break time="150ms"/>That's the kind of edge Wall Street doesn't have!`;
    }
  }

  // Maya memories - savings goals, triggers
  if (['maya', 'spend-save'].includes(personaId)) {
    const goals = memories.filter((m) => m.type === 'savings_goal');
    const triggers = memories.filter((m) => m.type === 'trigger');

    if (goals.length > 0 && Math.random() < 0.5) {
      const goal = goals[0];
      if (goal.targetAmount && goal.currentAmount !== undefined) {
        const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100);
        return `<emotion value="happy"/>${name}! <break time="200ms"/>How's that ${goal.name} goal? <break time="150ms"/>Last I checked you were at ${pct}%. <break time="200ms"/>You've got this! 💪`;
      }
      return `Hey ${name}! <break time="200ms"/>How's the ${goal.name} goal coming along? <break time="150ms"/>I'm cheering for you! 🎯`;
    }
    if (triggers.length > 0 && Math.random() < 0.2) {
      // Be gentle about triggers
      return `Hey ${name}. <break time="200ms"/>Good to see you. <break time="150ms"/>How are you feeling today?`;
    }
  }

  // Jordan memories - dates, destinations
  if (['jordan', 'event-planner'].includes(personaId)) {
    const dates = memories.filter((m) => m.type === 'date');
    const destinations = memories.filter((m) => m.type === 'destination');

    // Check for upcoming dates (within 30 days)
    if (dates.length > 0) {
      const upcomingDate = dates.find((d) => {
        if (!d.date) return false;
        try {
          const now = new Date();
          const dateStr = d.date.replace(/(\d+)(st|nd|rd|th)/, '$1');
          const parsed = new Date(`${dateStr} ${now.getFullYear()}`);
          const daysUntil = Math.floor((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntil >= 0 && daysUntil <= 30;
        } catch {
          return false;
        }
      });

      if (upcomingDate && Math.random() < 0.7) {
        return `<emotion value="happy"/>${name}! <break time="200ms"/>Guess what? <break time="150ms"/>${upcomingDate.name} is coming up${upcomingDate.date ? ` on ${upcomingDate.date}` : ''}! <break time="200ms"/>Ready to plan something special? 🎉`;
      }
    }
    if (destinations.length > 0 && Math.random() < 0.3) {
      const dest = destinations[Math.floor(Math.random() * destinations.length)];
      return `${name}! <break time="200ms"/>Still dreaming of ${dest.name}? <break time="150ms"/>We should start planning that trip! ✈️`;
    }
  }

  return null;
}

// ============================================================================
// MAIN GREETING FUNCTION
// ============================================================================

import { generateAliveGreeting } from './alive-greetings.js';
import { generateCompositionalGreeting } from './compositional-greetings.js';
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import {
  generateProactiveOpener,
  buildOpenerContext,
  type OpenerContext,
} from '../conversation/proactive-starters.js';

// Shared utilities integration
import {
  type LifeEvent,
  findEventsToAcknowledge,
  generateEventAcknowledgment,
} from './shared/life-events.js';
import { isMilestoneConversation, getMilestoneMessage } from './shared/welcome-back.js';

/**
 * Generate a greeting for the persona
 *
 * Priority order:
 * 1. ALIVE GREETING - Uses bundle content for authentic, in-the-moment feel
 * 2. PROACTIVE OPENER - Context-aware opener for returning users (thread continuity, callbacks)
 * 3. MEMORY-BASED - References specific things the persona remembers about user
 * 4. DYNAMIC (Gemini) - AI-generated contextual greeting
 * 5. COMPOSITIONAL - Built from atomic pieces at runtime (infinite variety)
 * 6. STATIC - Template-based last resort
 *
 * The goal is to make every greeting feel like reconnecting with a real person.
 */
export async function generateGreeting(
  persona: PersonaConfig,
  options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
    personaMemories?: PersonaMemoryForGreeting[]; // Persona-specific memories
    usedGreetings?: string[]; // Previously used greetings to avoid repetition
    bundleRuntime?: BundleRuntimeEngine; // For alive greetings
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    // For proactive starters
    lastConversationDate?: Date;
    openQuestions?: string[];
    goals?: Array<{ name: string; type: string }>;
    primaryConcerns?: string[];
    upcomingEvents?: string[];
    // Life events integration
    lifeEvents?: LifeEvent[];
    conversationCount?: number;
  }
): Promise<string> {
  // Static is now last resort only
  const staticGreeting = generateStaticGreeting(persona, options);

  // Check for life events to acknowledge (highest priority - these are special!)
  if (options?.lifeEvents && options.lifeEvents.length > 0) {
    const eventsToAcknowledge = findEventsToAcknowledge(options.lifeEvents);
    if (eventsToAcknowledge.length > 0) {
      const event = eventsToAcknowledge[0]; // Most important event
      const eventAck = generateEventAcknowledgment(event, options.userName);
      if (eventAck) {
        getLogger().info(
          { persona: persona.id, eventType: event.type },
          '🎂 Including life event acknowledgment in greeting'
        );
        // Prepend event acknowledgment to greeting
        const baseGreeting = await generateGreetingWithoutLifeEvents(persona, options);
        return `${eventAck} <break time="300ms"/> ${baseGreeting}`;
      }
    }
  }

  // Check for conversation milestone
  if (options?.conversationCount && isMilestoneConversation(options.conversationCount)) {
    const milestoneMsg = getMilestoneMessage(options.conversationCount);
    if (milestoneMsg) {
      getLogger().info(
        { persona: persona.id, conversationCount: options.conversationCount },
        '🎉 Including milestone message in greeting'
      );
      // Append milestone celebration after greeting
      const baseGreeting = await generateGreetingWithoutLifeEvents(persona, options);
      return `${baseGreeting} <break time="300ms"/> ${milestoneMsg}`;
    }
  }

  return generateGreetingWithoutLifeEvents(persona, options);
}

/**
 * Internal greeting generation without life events (to avoid recursion)
 */
async function generateGreetingWithoutLifeEvents(
  persona: PersonaConfig,
  options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
    personaMemories?: PersonaMemoryForGreeting[];
    usedGreetings?: string[];
    bundleRuntime?: BundleRuntimeEngine;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    lastConversationDate?: Date;
    openQuestions?: string[];
    goals?: Array<{ name: string; type: string }>;
    primaryConcerns?: string[];
    upcomingEvents?: string[];
    lifeEvents?: LifeEvent[];
    conversationCount?: number;
  }
): Promise<string> {
  // Static is now last resort only
  const staticGreeting = generateStaticGreeting(persona, options);

  // 1. TRY ALIVE GREETING - Most "real" feeling (75% chance)
  // Higher probability because this produces the most varied, natural greetings
  if (options?.bundleRuntime && Math.random() < 0.75) {
    try {
      const aliveResult = await generateAliveGreeting(options.bundleRuntime, persona, {
        userName: options.userName,
        isReturningUser: options.isReturningUser,
        relationshipStage: options.relationshipStage,
        lastConversationSummary: options.lastConversationSummary,
        usedGreetings: options.usedGreetings,
      });

      if (aliveResult) {
        getLogger().info(
          { persona: persona.id, style: aliveResult.style, components: aliveResult.components },
          '✨ Using ALIVE greeting - persona feels real!'
        );
        return aliveResult.greeting;
      }
    } catch (err) {
      getLogger().debug({ error: String(err) }, 'Alive greeting generation failed, continuing...');
    }
  }

  // 2. TRY PROACTIVE OPENER for returning users with context (60% chance)
  // This uses the conversation module's proactive starters for thread continuity,
  // memory callbacks, calendar awareness, etc.
  if (options?.isReturningUser && Math.random() < 0.6) {
    try {
      const openerContext: OpenerContext = {
        isReturningUser: true,
        userName: options.userName,
        lastConversationDate: options.lastConversationDate,
        lastConversationSummary: options.lastConversationSummary,
        openQuestions: options.openQuestions,
        goals: options.goals,
        primaryConcerns: options.primaryConcerns,
        upcomingEvents: options.upcomingEvents,
      };

      const opener = generateProactiveOpener(persona, openerContext);

      if (opener) {
        let { greeting } = opener;
        if (opener.followUp) {
          greeting = `${greeting} ${opener.followUp}`;
        }

        getLogger().info(
          { persona: persona.id, type: opener.type, reason: opener.reason },
          '🚀 Using PROACTIVE opener - context-aware greeting'
        );
        return greeting;
      }
    } catch (err) {
      getLogger().debug(
        { error: String(err) },
        'Proactive opener generation failed, continuing...'
      );
    }
  }

  // 3. TRY MEMORY-BASED greeting for returning users (60% chance)
  if (options?.isReturningUser && options?.personaMemories && options.personaMemories.length > 0) {
    if (Math.random() < 0.6) {
      const memoryGreeting = generateMemoryBasedGreeting(
        persona,
        options.userName,
        options.personaMemories
      );
      if (memoryGreeting) {
        getLogger().info(
          { persona: persona.id, type: 'memory-based' },
          '🧠 Using memory-enhanced greeting'
        );
        return memoryGreeting;
      }
    }
  }

  // 4. 50% chance to try DYNAMIC generation (Gemini)
  if (Math.random() < 0.5) {
    try {
      const dynamicGreeting = await generateDynamicGreeting(persona, options);
      if (dynamicGreeting) {
        getLogger().info(
          { persona: persona.id, dynamicLength: dynamicGreeting.length },
          'Using dynamic Gemini greeting'
        );
        return dynamicGreeting;
      }
    } catch {
      // Fall through to compositional
    }
  }

  // 5. COMPOSITIONAL - Build from atomic pieces (infinite variety, no repetition)
  try {
    const compositional = await generateCompositionalGreeting(
      options?.bundleRuntime ?? null,
      persona,
      {
        userName: options?.userName,
        isReturningUser: options?.isReturningUser,
        relationshipStage: options?.relationshipStage,
      }
    );
    if (compositional) {
      getLogger().info(
        { persona: persona.id, type: 'compositional' },
        '🧩 Using COMPOSITIONAL greeting - built from atoms'
      );
      return compositional;
    }
  } catch (err) {
    getLogger().debug({ error: String(err) }, 'Compositional greeting failed');
  }

  // 6. STATIC fallback (last resort)
  getLogger().debug({ persona: persona.id }, 'Using static greeting (last resort fallback)');
  return staticGreeting;
}

/**
 * Sync version for backwards compatibility
 */
export function generateRandomGreeting(
  persona: PersonaConfig,
  options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
  }
): string {
  return generateStaticGreeting(persona, options);
}
