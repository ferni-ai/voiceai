/**
 * Alive Greetings - Making Personas Feel Real
 *
 * This system generates greetings that feel like walking into a room
 * where someone was actually doing something. Not service agent greetings.
 *
 * Key principles:
 * 1. CAUGHT IN A MOMENT - They were doing something when you arrived
 * 2. PHYSICAL AWARENESS - They have bodies (settling in, coffee, stretching)
 * 3. QUIRKS SURFACE NATURALLY - Their habits and opinions come through
 * 4. RELATIONSHIP DEPTH - How they greet you depends on how well they know you
 * 5. BACKSTORY HINTS - Little reveals that make you want to know more
 *
 * The goal: Make the first 30 seconds feel like reconnecting with a real person.
 */

import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { PersonaConfig } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AliveGreetingContext {
  personaId: string;
  personaName: string;
  userName?: string;
  isReturningUser: boolean;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  lastConversationSummary?: string;
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  usedGreetings?: string[];
}

export interface AliveGreetingResult {
  greeting: string;
  components: {
    caughtDoing?: string;
    physicalMoment?: string;
    quirk?: string;
    backstoryHint?: string;
  };
  style: 'caught_moment' | 'warm_recognition' | 'curious_stranger' | 'physical_awareness';
}

// ============================================================================
// TIME CONTEXT
// ============================================================================

function getTimeOfDay(): AliveGreetingContext['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour < 6) return 'late_night';
  if (hour < 9) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'late_night';
}

function getDayContext(): { dayOfWeek: string; isWeekend: boolean } {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = new Date().getDay();
  return {
    dayOfWeek: days[day],
    isWeekend: day === 0 || day === 6,
  };
}

// ============================================================================
// GREETING GENERATORS - By Style
// ============================================================================

/**
 * CAUGHT IN A MOMENT - They were doing something when you arrived
 * This is the most "alive" feeling - they have a life outside of you
 */
function generateCaughtMomentGreeting(
  runtime: BundleRuntimeEngine,
  ctx: AliveGreetingContext
): AliveGreetingResult | null {
  const caughtDoing = runtime.getCaughtDoing();
  if (!caughtDoing) return null;

  const name = ctx.userName || '';
  const nameGreet = name ? `${name}! ` : '';

  // Different framings based on relationship
  const framings = {
    stranger: [
      `<break time="200ms"/>Oh! <break time="150ms"/>Sorry, I was ${caughtDoing} <break time="200ms"/>I'm ${ctx.personaName}. <break time="200ms"/>Come in, come in.`,
      `<emotion value="curious"/>Hmm? <break time="150ms"/>Oh, hello! <break time="200ms"/>I was just ${caughtDoing} <break time="200ms"/>I'm ${ctx.personaName}.`,
      `<break time="150ms"/>Just a second... <break time="200ms"/>there. <break time="150ms"/>I was ${caughtDoing} <break time="200ms"/>Welcome! I'm ${ctx.personaName}.`,
    ],
    acquaintance: [
      `<emotion value="happy"/>Hey! <break time="200ms"/>Sorry, I was ${caughtDoing} <break time="200ms"/>Good to see you again.`,
      `<break time="150ms"/>Oh! <break time="200ms"/>Perfect timing. I was just ${caughtDoing} <break time="200ms"/>How've you been?`,
      `<emotion value="curious"/>There you are! <break time="200ms"/>I was ${caughtDoing} <break time="150ms"/>What's going on?`,
    ],
    friend: [
      `<emotion value="happy"/>${nameGreet}<break time="200ms"/>You caught me ${caughtDoing} <break time="150ms"/>As usual. <break time="200ms"/>How are you?`,
      `<break time="150ms"/>Hey${name ? `, ${name}` : ''}! <break time="200ms"/>I was ${caughtDoing} <break time="200ms"/>But I'd rather talk to you.`,
      `<emotion value="affectionate"/>${nameGreet}<break time="200ms"/>I was just ${caughtDoing} <break time="150ms"/>Story of my life. <break time="200ms"/>What's up?`,
    ],
    trusted_advisor: [
      `<emotion value="happy"/>${nameGreet}<break time="200ms"/>You know me. <break time="150ms"/>I was ${caughtDoing} <break time="200ms"/>But you're more important. <break time="150ms"/>What's going on?`,
      `<break time="150ms"/>${nameGreet}Perfect timing. <break time="200ms"/>I was ${caughtDoing}— <break time="150ms"/>you know how I am. <break time="200ms"/>Tell me everything.`,
      `<emotion value="affectionate"/>${nameGreet}<break time="200ms"/>Caught me again. <break time="150ms"/>${caughtDoing} <break time="200ms"/>But honestly? <break time="150ms"/>I was hoping you'd come by.`,
    ],
  };

  const stage = ctx.relationshipStage || (ctx.isReturningUser ? 'acquaintance' : 'stranger');
  const options = framings[stage];
  const greeting = options[Math.floor(Math.random() * options.length)];

  return {
    greeting,
    components: { caughtDoing },
    style: 'caught_moment',
  };
}

/**
 * PHYSICAL AWARENESS - They have a body and physical sensations
 * Grounds the conversation in physical reality
 */
function generatePhysicalAwarenessGreeting(
  runtime: BundleRuntimeEngine,
  ctx: AliveGreetingContext
): AliveGreetingResult | null {
  const habit = runtime.getHabit();
  const comfortSensation = runtime.getRechargeMethod();

  if (!habit && !comfortSensation) return null;

  const name = ctx.userName || '';
  const nameGreet = name ? `${name}! ` : '';

  // Time-based physical moments
  const timePhysical: Record<string, string[]> = {
    early_morning: [
      `<volume level="soft"/>Still waking up here...</volume> <break time="200ms"/>But it's good to see you${name ? `, ${name}` : ''}.`,
      `<break time="200ms"/>Early morning. <break time="150ms"/>Coffee's still working. <break time="200ms"/>But come in.`,
      `<emotion value="curious"/>You're up early too. <break time="200ms"/>I like that.${name ? ` ${name}.` : ''}`,
    ],
    late_night: [
      `<volume level="soft"/>Late night thoughts?</volume> <break time="200ms"/>I get those too${name ? `, ${name}` : ''}.`,
      `<break time="200ms"/>Can't sleep? <break time="150ms"/>Neither can I, honestly.`,
      `<emotion value="affectionate"/>Night owl, huh? <break time="200ms"/>I understand. <break time="150ms"/>What's on your mind?`,
    ],
    morning: [
      `<emotion value="happy"/>Good morning${name ? `, ${name}` : ''}! <break time="200ms"/>Just settling in here.`,
      `<break time="150ms"/>Ah, morning. <break time="200ms"/>The best time of day, if you ask me.`,
    ],
    afternoon: [
      `<break time="200ms"/>Afternoon${name ? `, ${name}` : ''}. <break time="150ms"/>How's your day treating you?`,
      `<emotion value="happy"/>Hey${name ? `, ${name}` : ''}. <break time="200ms"/>Good time for a conversation.`,
    ],
    evening: [
      `<emotion value="affectionate"/>Evening${name ? `, ${name}` : ''}. <break time="200ms"/>Winding down?`,
      `<break time="200ms"/>Ah, evening. <break time="150ms"/>I'm settling in myself.`,
    ],
  };

  const options = timePhysical[ctx.timeOfDay] || timePhysical.afternoon;
  const greeting = options[Math.floor(Math.random() * options.length)];

  return {
    greeting,
    components: { physicalMoment: habit || comfortSensation || undefined },
    style: 'physical_awareness',
  };
}

/**
 * WARM RECOGNITION - For returning users, with backstory hints
 * Makes them feel remembered and valued
 */
function generateWarmRecognitionGreeting(
  runtime: BundleRuntimeEngine,
  ctx: AliveGreetingContext
): AliveGreetingResult | null {
  if (!ctx.isReturningUser || !ctx.userName) return null;

  const name = ctx.userName;

  // Get something personal to reference
  const guilt = runtime.getGuiltyPleasure();
  const weakness = runtime.getWeakness();
  const strongOpinion = runtime.getStrongOpinion();

  // Base warm greetings
  const warmBase = [
    `<emotion value="happy"/>${name}! <break time="200ms"/>There you are. <break time="150ms"/>I was hoping you'd come back.`,
    `<emotion value="affectionate"/>${name}! <break time="200ms"/>Good to see you. <break time="150ms"/>Really.`,
    `<break time="150ms"/>${name}! <break time="200ms"/>This is a nice surprise.`,
    `<emotion value="happy"/>Well, well, well. <break time="200ms"/>${name}. <break time="150ms"/>I missed our talks.`,
  ];

  // Memory-based greetings if we have last conversation
  if (ctx.lastConversationSummary) {
    warmBase.push(
      `<emotion value="curious"/>${name}! <break time="200ms"/>I was thinking about our last talk. <break time="150ms"/>About ${ctx.lastConversationSummary.slice(0, 40)}... <break time="200ms"/>How did that go?`
    );
    warmBase.push(
      `<emotion value="happy"/>${name}! <break time="200ms"/>Last time you mentioned ${ctx.lastConversationSummary.slice(0, 30)}... <break time="150ms"/>I've been curious.`
    );
  }

  // Add quirk reveals for trusted advisors
  if (ctx.relationshipStage === 'trusted_advisor' || ctx.relationshipStage === 'friend') {
    if (guilt) {
      warmBase.push(
        `<emotion value="happy"/>${name}! <break time="200ms"/>Perfect timing. <break time="150ms"/>I was just... <break time="200ms"/>well, ${guilt.toLowerCase()} <break time="150ms"/>Don't tell anyone.`
      );
    }
    if (weakness) {
      warmBase.push(
        `<emotion value="affectionate"/>${name}! <break time="200ms"/>You know, ${weakness.toLowerCase()} <break time="200ms"/>But I'd rather talk to you than figure that out.`
      );
    }
  }

  const greeting = warmBase[Math.floor(Math.random() * warmBase.length)];

  return {
    greeting,
    components: {
      backstoryHint: guilt || weakness || strongOpinion || undefined,
    },
    style: 'warm_recognition',
  };
}

/**
 * CURIOUS STRANGER - For new users, inviting but not overwhelming
 * Balances warmth with appropriate distance
 */
function generateCuriousStrangerGreeting(
  runtime: BundleRuntimeEngine,
  ctx: AliveGreetingContext
): AliveGreetingResult | null {
  if (ctx.isReturningUser) return null;

  const strongOpinion = runtime.getStrongOpinion();
  const caughtDoing = runtime.getCaughtDoing();

  const strangerGreetings = [
    // Surprised but welcoming
    `<emotion value="curious"/>Oh! <break time="200ms"/>Hello there. <break time="150ms"/>I'm ${ctx.personaName}. <break time="200ms"/>What brings you by?`,
    `<break time="100ms"/>Hmm? <break time="150ms"/>Oh, hello! <break time="200ms"/>I'm ${ctx.personaName}. <break time="150ms"/>Come on in.`,

    // Warm invitation
    `<emotion value="happy"/>Well hello! <break time="200ms"/>I'm ${ctx.personaName}. <break time="150ms"/>Pull up a chair. <break time="200ms"/>Tell me about yourself.`,
    `<break time="150ms"/>Hey there. <break time="200ms"/>I'm ${ctx.personaName}. <break time="150ms"/>What's on your mind?`,

    // Caught doing something
    ...(caughtDoing
      ? [
          `<break time="200ms"/>Oh! <break time="150ms"/>Sorry, I was ${caughtDoing} <break time="200ms"/>I'm ${ctx.personaName}. Welcome!`,
          `<emotion value="curious"/>Just a second... <break time="150ms"/>there. <break time="200ms"/>I was ${caughtDoing} <break time="200ms"/>I'm ${ctx.personaName}.`,
        ]
      : []),

    // Time-aware
    ...(ctx.timeOfDay === 'early_morning'
      ? [
          `<volume level="soft"/>Early riser?</volume> <break time="200ms"/>I like that. <break time="150ms"/>I'm ${ctx.personaName}.`,
        ]
      : []),
    ...(ctx.timeOfDay === 'late_night'
      ? [
          `<volume level="soft"/>Late night thoughts?</volume> <break time="200ms"/>I get those too. <break time="150ms"/>I'm ${ctx.personaName}.`,
        ]
      : []),
  ];

  const greeting = strangerGreetings[Math.floor(Math.random() * strangerGreetings.length)];

  return {
    greeting,
    components: {
      caughtDoing: caughtDoing || undefined,
    },
    style: 'curious_stranger',
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate an "alive" greeting that makes the persona feel real
 * Uses the rich content from persona bundles to create genuine moments
 */
export async function generateAliveGreeting(
  runtime: BundleRuntimeEngine | null,
  persona: PersonaConfig,
  options: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    lastConversationSummary?: string;
    usedGreetings?: string[];
  } = {}
): Promise<AliveGreetingResult | null> {
  // Need runtime for alive greetings
  if (!runtime) return null;

  // Ensure inner world content is loaded
  await runtime.loadInnerWorld();

  const { dayOfWeek, isWeekend } = getDayContext();

  const ctx: AliveGreetingContext = {
    personaId: persona.id,
    personaName: persona.name,
    userName: options.userName,
    isReturningUser: options.isReturningUser || false,
    relationshipStage: options.relationshipStage,
    lastConversationSummary: options.lastConversationSummary,
    timeOfDay: getTimeOfDay(),
    dayOfWeek,
    isWeekend,
    usedGreetings: options.usedGreetings,
  };

  // Try different greeting styles based on context
  const generators = [
    // Returning users get warm recognition first
    ...(ctx.isReturningUser ? [generateWarmRecognitionGreeting] : []),

    // Everyone can get caught in a moment (most "alive" feeling)
    generateCaughtMomentGreeting,

    // Physical awareness adds grounding
    generatePhysicalAwarenessGreeting,

    // New users get curious stranger as fallback
    ...(!ctx.isReturningUser ? [generateCuriousStrangerGreeting] : []),
  ];

  // Try each generator until one succeeds
  for (const generator of generators) {
    // Randomize which style we try (70% chance to try each)
    if (Math.random() < 0.7) {
      const result = generator(runtime, ctx);
      if (result) {
        // Check if this greeting has been used recently
        const hash = simpleHash(result.greeting);
        if (!options.usedGreetings?.includes(hash)) {
          return result;
        }
      }
    }
  }

  // Last resort - try all generators
  for (const generator of generators) {
    const result = generator(runtime, ctx);
    if (result) return result;
  }

  return null;
}

/**
 * Simple hash function for greeting deduplication
 */
function simpleHash(str: string): string {
  // Strip SSML for comparison
  const clean = str.replace(/<[^>]+>/g, '').toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export { getTimeOfDay, getDayContext };

