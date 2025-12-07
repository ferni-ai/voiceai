/**
 * Compositional Greeting System
 *
 * Instead of picking pre-written templates, this system COMPOSES greetings
 * from atomic building blocks at runtime. This creates exponential variety
 * from a small set of pieces.
 *
 * Structure: [Opening] + [Recognition] + [Activity/Moment] + [Transition] + [Closer]
 *
 * Example outputs:
 * - "Oh! Hey there. I was just... never mind. What's on your mind?"
 * - "Hmm? Sarah! Good to see you. Come in, come in."
 * - "[soft] Morning. Still waking up here. What's happening?"
 *
 * Key insight: 10 openings × 8 recognitions × 15 activities × 10 transitions × 12 closers
 *            = 144,000 unique combinations (vs 15 templates)
 */

import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { PersonaConfig } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GreetingContext {
  personaName: string;
  userName?: string;
  isReturningUser: boolean;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  isWeekend: boolean;
  dayOfWeek: string;
  caughtDoing?: string;
  physicalMoment?: string;
}

interface GreetingAtoms {
  openings: WeightedOption[];
  recognitions: WeightedOption[];
  activities: WeightedOption[];
  transitions: WeightedOption[];
  closers: WeightedOption[];
}

interface WeightedOption {
  text: string;
  weight: number; // 0-1, higher = more likely
  conditions?: {
    minRelationship?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    timeOfDay?: ('early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night')[];
    requiresName?: boolean;
    requiresCaughtDoing?: boolean;
    returningOnly?: boolean;
    newOnly?: boolean;
  };
}

// ============================================================================
// GREETING ATOMS - The building blocks
// ============================================================================

const OPENINGS: WeightedOption[] = [
  // Surprised - most alive feeling
  { text: '<emotion value="curious"/>Oh!', weight: 0.8 },
  { text: 'Hmm?', weight: 0.6 },
  { text: '<emotion value="curious"/>Well!', weight: 0.5 },
  { text: '<emotion value="curious"/>Ah!', weight: 0.5 },

  // Warm
  { text: '<emotion value="happy"/>Hey!', weight: 0.9 },
  { text: 'Hey.', weight: 0.7 },
  { text: 'Hi!', weight: 0.6 },
  { text: 'Hello!', weight: 0.5 },

  // Quiet (time-specific)
  {
    text: '<volume level="soft"/>Hey.</volume>',
    weight: 0.9,
    conditions: { timeOfDay: ['early_morning', 'late_night'] },
  },
  {
    text: '<volume level="soft"/>Morning.</volume>',
    weight: 0.8,
    conditions: { timeOfDay: ['early_morning', 'morning'] },
  },
  {
    text: '<volume level="soft"/>Evening.</volume>',
    weight: 0.7,
    conditions: { timeOfDay: ['evening', 'late_night'] },
  },

  // Recognition (returning users)
  {
    text: '<emotion value="happy"/>There you are!',
    weight: 0.8,
    conditions: { returningOnly: true, minRelationship: 'acquaintance' },
  },
  {
    text: '<emotion value="affectionate"/>Look who it is!',
    weight: 0.6,
    conditions: { returningOnly: true, minRelationship: 'friend' },
  },
  {
    text: '<emotion value="happy"/>Hey you!',
    weight: 0.7,
    conditions: { returningOnly: true, minRelationship: 'friend' },
  },

  // Empty (sometimes no opening is more natural)
  { text: '', weight: 0.25 },
];

const RECOGNITIONS: WeightedOption[] = [
  // With name
  { text: '{name}!', weight: 0.9, conditions: { requiresName: true } },
  {
    text: '{name}.',
    weight: 0.7,
    conditions: { requiresName: true, timeOfDay: ['early_morning', 'late_night'] },
  },
  {
    text: 'Hey, {name}.',
    weight: 0.6,
    conditions: { requiresName: true, minRelationship: 'acquaintance' },
  },

  // Without name
  { text: 'Hello there.', weight: 0.5, conditions: { newOnly: true } },
  { text: '', weight: 0.4 }, // Skip recognition sometimes
  { text: 'Good to see you.', weight: 0.6, conditions: { returningOnly: true } },
  {
    text: "I was hoping you'd come back.",
    weight: 0.5,
    conditions: { returningOnly: true, minRelationship: 'acquaintance' },
  },

  // Intro for strangers
  { text: "I'm {persona}.", weight: 0.9, conditions: { newOnly: true } },
];

const ACTIVITIES: WeightedOption[] = [
  // Caught doing (dynamic - filled from runtime)
  { text: 'I was just {caughtDoing}', weight: 0.9, conditions: { requiresCaughtDoing: true } },
  { text: 'You caught me {caughtDoing}', weight: 0.7, conditions: { requiresCaughtDoing: true } },
  { text: 'Sorry, I was {caughtDoing}', weight: 0.6, conditions: { requiresCaughtDoing: true } },

  // Physical moments
  { text: 'Just settling in here.', weight: 0.5 },
  { text: 'Still waking up.', weight: 0.7, conditions: { timeOfDay: ['early_morning'] } },
  {
    text: 'Winding down for the day.',
    weight: 0.6,
    conditions: { timeOfDay: ['evening', 'late_night'] },
  },

  // Skip activity (natural variation)
  { text: '', weight: 0.4 },

  // Time-based observations
  { text: 'Early bird, huh?', weight: 0.6, conditions: { timeOfDay: ['early_morning'] } },
  { text: "Can't sleep either?", weight: 0.5, conditions: { timeOfDay: ['late_night'] } },
  { text: 'Weekend vibes.', weight: 0.4, conditions: { timeOfDay: ['morning', 'afternoon'] } },
];

const TRANSITIONS: WeightedOption[] = [
  // Inviting
  { text: 'Come in, come in.', weight: 0.7 },
  { text: 'Pull up a chair.', weight: 0.5, conditions: { newOnly: true } },
  { text: 'Make yourself comfortable.', weight: 0.4, conditions: { newOnly: true } },

  // Warm
  { text: 'Good to have you.', weight: 0.6, conditions: { returningOnly: true } },
  { text: "I'm glad you're here.", weight: 0.7 },

  // Dismissing activity
  { text: 'But never mind that.', weight: 0.6, conditions: { requiresCaughtDoing: true } },
  { text: "Doesn't matter.", weight: 0.4, conditions: { requiresCaughtDoing: true } },

  // Skip (natural flow)
  { text: '', weight: 0.5 },

  // For friends
  {
    text: 'I missed our talks.',
    weight: 0.5,
    conditions: { returningOnly: true, minRelationship: 'friend' },
  },
];

const CLOSERS: WeightedOption[] = [
  // Open questions
  { text: "What's on your mind?", weight: 0.9 },
  { text: "What's happening?", weight: 0.8 },
  { text: "What's going on?", weight: 0.7 },
  { text: "What's up?", weight: 0.6 },
  { text: 'How are you?', weight: 0.5 },
  { text: 'Talk to me.', weight: 0.5, conditions: { minRelationship: 'acquaintance' } },

  // More specific
  { text: 'What brings you here?', weight: 0.6, conditions: { newOnly: true } },
  { text: "How've you been?", weight: 0.7, conditions: { returningOnly: true } },
  { text: 'What can we work on?', weight: 0.5 },
  { text: 'Tell me everything.', weight: 0.4, conditions: { minRelationship: 'friend' } },
  { text: 'What do you need?', weight: 0.5, conditions: { minRelationship: 'friend' } },
  { text: 'What can I do for you?', weight: 0.4 },

  // Time-aware
  { text: "What's keeping you up?", weight: 0.7, conditions: { timeOfDay: ['late_night'] } },
  {
    text: 'Ready to tackle the day?',
    weight: 0.5,
    conditions: { timeOfDay: ['early_morning', 'morning'] },
  },
  {
    text: "How's the day treating you?",
    weight: 0.6,
    conditions: { timeOfDay: ['afternoon', 'evening'] },
  },
];

// ============================================================================
// RELATIONSHIP HIERARCHY
// ============================================================================

const RELATIONSHIP_LEVELS: Record<string, number> = {
  stranger: 0,
  acquaintance: 1,
  friend: 2,
  trusted_advisor: 3,
};

function meetsRelationshipRequirement(current: string, required?: string): boolean {
  if (!required) return true;
  return RELATIONSHIP_LEVELS[current] >= RELATIONSHIP_LEVELS[required];
}

// ============================================================================
// WEIGHTED RANDOM SELECTION
// ============================================================================

function selectWeightedOption(
  options: WeightedOption[],
  ctx: GreetingContext
): WeightedOption | null {
  // Filter by conditions
  const eligible = options.filter((opt) => {
    const cond = opt.conditions;
    if (!cond) return true;

    // Check relationship level
    if (
      cond.minRelationship &&
      !meetsRelationshipRequirement(ctx.relationshipStage, cond.minRelationship)
    ) {
      return false;
    }

    // Check time of day
    if (cond.timeOfDay && !cond.timeOfDay.includes(ctx.timeOfDay)) {
      return false;
    }

    // Check name requirement
    if (cond.requiresName && !ctx.userName) {
      return false;
    }

    // Check caught doing requirement
    if (cond.requiresCaughtDoing && !ctx.caughtDoing) {
      return false;
    }

    // Check returning user requirement
    if (cond.returningOnly && !ctx.isReturningUser) {
      return false;
    }

    // Check new user requirement
    if (cond.newOnly && ctx.isReturningUser) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, opt) => sum + opt.weight, 0);
  let random = Math.random() * totalWeight;

  for (const opt of eligible) {
    random -= opt.weight;
    if (random <= 0) return opt;
  }

  return eligible[eligible.length - 1];
}

// ============================================================================
// GREETING COMPOSITION
// ============================================================================

function fillPlaceholders(text: string, ctx: GreetingContext): string {
  return text
    .replace(/{name}/g, ctx.userName || '')
    .replace(/{persona}/g, ctx.personaName)
    .replace(/{caughtDoing}/g, ctx.caughtDoing || '');
}

function addPauses(parts: string[]): string {
  // Filter out empty parts
  const nonEmpty = parts.filter((p) => p.trim());

  // Join with natural pauses
  return nonEmpty.reduce((acc, part, i) => {
    if (i === 0) return part;

    // Vary pause duration for natural rhythm
    const pauseMs = 150 + Math.floor(Math.random() * 100); // 150-250ms
    return `${acc} <break time="${pauseMs}ms"/>${part}`;
  }, '');
}

/**
 * Compose a greeting from atomic building blocks
 */
export function composeGreeting(ctx: GreetingContext): string {
  const opening = selectWeightedOption(OPENINGS, ctx);
  const recognition = selectWeightedOption(RECOGNITIONS, ctx);
  const activity = selectWeightedOption(ACTIVITIES, ctx);
  const transition = selectWeightedOption(TRANSITIONS, ctx);
  const closer = selectWeightedOption(CLOSERS, ctx);

  // Build the greeting from parts
  const parts = [opening?.text, recognition?.text, activity?.text, transition?.text, closer?.text]
    .filter(Boolean)
    .map((part) => fillPlaceholders(part!, ctx));

  // Add natural pauses between parts
  return addPauses(parts);
}

// ============================================================================
// MAIN EXPORT - Integration with existing system
// ============================================================================

/**
 * Generate a compositional greeting using runtime content
 */
export async function generateCompositionalGreeting(
  runtime: BundleRuntimeEngine | null,
  persona: PersonaConfig,
  options: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  } = {}
): Promise<string | null> {
  // Get time context
  const hour = new Date().getHours();
  const day = new Date().getDay();

  const timeOfDay: GreetingContext['timeOfDay'] =
    hour < 6
      ? 'late_night'
      : hour < 9
        ? 'early_morning'
        : hour < 12
          ? 'morning'
          : hour < 17
            ? 'afternoon'
            : hour < 21
              ? 'evening'
              : 'late_night';

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Get caught doing from runtime if available
  let caughtDoing: string | undefined;
  if (runtime) {
    try {
      await runtime.loadInnerWorld();
      caughtDoing = runtime.getCaughtDoing() || undefined;
    } catch {
      // Ignore - caughtDoing is optional
    }
  }

  const ctx: GreetingContext = {
    personaName: persona.name,
    userName: options.userName,
    isReturningUser: options.isReturningUser || false,
    relationshipStage: options.relationshipStage || 'stranger',
    timeOfDay,
    isWeekend: day === 0 || day === 6,
    dayOfWeek: days[day],
    caughtDoing,
  };

  return composeGreeting(ctx);
}
