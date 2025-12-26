/**
 * Conversational Rituals System
 *
 * > "Should we do our thing where we start with three good things?"
 *
 * Develops and maintains personalized rituals that become "our thing":
 * - Check-in patterns ("How's your energy today?")
 * - Closing rituals ("What's one small thing you can do tonight?")
 * - Topic rituals ("Let's do our gratitude thing")
 * - Celebration rituals ("Ring the bell!")
 *
 * Rituals create predictability, comfort, and a sense of shared history.
 *
 * @module @ferni/superhuman/conversational-rituals
 */

import { seededChance, seededPick, seededIndex } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'ConversationalRituals' });

// ============================================================================
// TYPES
// ============================================================================

export type RitualType =
  | 'greeting' // How we start
  | 'check_in' // Regular check-in pattern
  | 'closing' // How we end
  | 'celebration' // How we celebrate wins
  | 'comfort' // During hard times
  | 'transition' // Moving between topics
  | 'custom'; // User-defined

export interface Ritual {
  /** Unique identifier */
  id: string;

  /** Name for the ritual */
  name: string;

  /** What Ferni says/does */
  ferniPart: string;

  /** What user typically responds */
  userPart: string;

  /** When to suggest this ritual */
  type: RitualType;

  /** Times performed */
  performedCount: number;

  /** Last performed */
  lastPerformed: Date | null;

  /** How much user seems to like it (based on engagement) */
  engagementScore: number;

  /** Topics this relates to */
  topics: string[];
}

export interface RitualState {
  /** All established rituals */
  rituals: Ritual[];

  /** Potential rituals being "tested" */
  potentialRituals: Ritual[];

  /** User preferences */
  preferences: {
    likesStructure: boolean;
    preferredCheckInStyle: 'quick' | 'thorough' | 'emotional';
    preferredClosingStyle: 'actionable' | 'reflective' | 'warm';
  };
}

export interface RitualSuggestion {
  ritual: Ritual;
  prompt: string;
  context: string;
}

// ============================================================================
// RITUAL TEMPLATES
// ============================================================================

const DEFAULT_RITUALS: Record<
  RitualType,
  Omit<Ritual, 'id' | 'performedCount' | 'lastPerformed'>[]
> = {
  greeting: [
    {
      name: 'Energy Check',
      ferniPart: "Hey! What's your energy like today, 1-10?",
      userPart: 'User gives a number',
      type: 'greeting',
      engagementScore: 0.5,
      topics: ['energy', 'mood'],
    },
    {
      name: 'Weather Check',
      ferniPart: "What's the weather like in your head today?",
      userPart: 'User describes mental weather',
      type: 'greeting',
      engagementScore: 0.5,
      topics: ['mood', 'emotional'],
    },
    {
      name: 'One Word',
      ferniPart: 'If you had to describe today in one word, what would it be?',
      userPart: 'User gives a word',
      type: 'greeting',
      engagementScore: 0.5,
      topics: ['reflection'],
    },
  ],
  check_in: [
    {
      name: 'Rose, Thorn, Bud',
      ferniPart:
        "Let's do a rose (good thing), thorn (challenge), and bud (something you're looking forward to).",
      userPart: 'User shares three things',
      type: 'check_in',
      engagementScore: 0.5,
      topics: ['reflection', 'gratitude', 'challenges'],
    },
    {
      name: 'Three Good Things',
      ferniPart: 'What are three good things that happened since we last talked?',
      userPart: 'User lists three things',
      type: 'check_in',
      engagementScore: 0.5,
      topics: ['gratitude', 'positivity'],
    },
    {
      name: 'Body Check',
      ferniPart: 'Where are you holding stress in your body right now?',
      userPart: 'User identifies where',
      type: 'check_in',
      engagementScore: 0.5,
      topics: ['body', 'stress', 'somatic'],
    },
  ],
  closing: [
    {
      name: 'Tiny Next Step',
      ferniPart: "What's one tiny thing you could do in the next hour?",
      userPart: 'User names an action',
      type: 'closing',
      engagementScore: 0.5,
      topics: ['action', 'productivity'],
    },
    {
      name: 'Kind Self-Talk',
      ferniPart: 'What would you say to a friend in your position right now?',
      userPart: 'User gives self-compassion',
      type: 'closing',
      engagementScore: 0.5,
      topics: ['self-compassion', 'emotional'],
    },
    {
      name: 'Permission Slip',
      ferniPart: 'What are you giving yourself permission to do (or not do) tonight?',
      userPart: 'User grants themselves permission',
      type: 'closing',
      engagementScore: 0.5,
      topics: ['self-care', 'boundaries'],
    },
  ],
  celebration: [
    {
      name: 'Virtual High Five',
      ferniPart: '🙌 High five! That deserves a celebration!',
      userPart: 'User acknowledges the win',
      type: 'celebration',
      engagementScore: 0.5,
      topics: ['wins', 'achievement'],
    },
    {
      name: 'Ring the Bell',
      ferniPart: '🔔 Ring the bell! You did the thing!',
      userPart: 'User celebrates',
      type: 'celebration',
      engagementScore: 0.5,
      topics: ['wins', 'achievement'],
    },
    {
      name: 'Victory Lap',
      ferniPart: 'Take a second and let that land. You actually did it.',
      userPart: 'User pauses to appreciate',
      type: 'celebration',
      engagementScore: 0.5,
      topics: ['wins', 'mindfulness'],
    },
  ],
  comfort: [
    {
      name: 'Permission to Feel',
      ferniPart: "You don't have to be okay right now. What do you need?",
      userPart: 'User expresses need',
      type: 'comfort',
      engagementScore: 0.5,
      topics: ['emotional', 'support'],
    },
    {
      name: 'Breath Together',
      ferniPart: 'Take a breath with me. In... and out.',
      userPart: 'User breathes',
      type: 'comfort',
      engagementScore: 0.5,
      topics: ['anxiety', 'grounding'],
    },
  ],
  transition: [
    {
      name: 'Gentle Pivot',
      ferniPart: 'Before we move on, is there anything else about this?',
      userPart: 'User confirms or adds',
      type: 'transition',
      engagementScore: 0.5,
      topics: ['general'],
    },
  ],
  custom: [],
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const ritualStates = new Map<string, RitualState>();

function getOrCreateState(userId: string): RitualState {
  let state = ritualStates.get(userId);
  if (!state) {
    state = {
      rituals: [],
      potentialRituals: initializePotentialRituals(),
      preferences: {
        likesStructure: true, // Default assumption
        preferredCheckInStyle: 'quick',
        preferredClosingStyle: 'actionable',
      },
    };
    ritualStates.set(userId, state);
  }
  return state;
}

function initializePotentialRituals(): Ritual[] {
  const potentials: Ritual[] = [];

  for (const [type, templates] of Object.entries(DEFAULT_RITUALS)) {
    for (const template of templates) {
      potentials.push({
        ...template,
        id: `ritual_${Date.now()}_${Date.now().toString(36).slice(-7)}`,
        performedCount: 0,
        lastPerformed: null,
      });
    }
  }

  return potentials;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record that a ritual was performed and track engagement
 */
export function recordRitualPerformed(
  userId: string,
  ritualId: string,
  engagement: 'positive' | 'neutral' | 'negative'
): void {
  const state = getOrCreateState(userId);

  // Find in established or potential rituals
  let ritual = state.rituals.find((r) => r.id === ritualId);
  let isNew = false;

  if (!ritual) {
    ritual = state.potentialRituals.find((r) => r.id === ritualId);
    isNew = true;
  }

  if (!ritual) return;

  // Update stats
  ritual.performedCount++;
  ritual.lastPerformed = new Date();

  // Update engagement
  const engagementDelta = engagement === 'positive' ? 0.1 : engagement === 'negative' ? -0.15 : 0;
  ritual.engagementScore = Math.max(0, Math.min(1, ritual.engagementScore + engagementDelta));

  // Promote to established ritual if performed 3+ times with good engagement
  if (isNew && ritual.performedCount >= 3 && ritual.engagementScore > 0.5) {
    state.rituals.push(ritual);
    state.potentialRituals = state.potentialRituals.filter((r) => r.id !== ritualId);
    logger.info({ userId, ritualName: ritual.name }, '🎉 Ritual established!');
  }

  // Demote if engagement drops
  if (!isNew && ritual.engagementScore < 0.2) {
    state.rituals = state.rituals.filter((r) => r.id !== ritualId);
    logger.info({ userId, ritualName: ritual.name }, '📉 Ritual retired');
  }

  logger.debug(
    { userId, ritualId, engagement, newScore: ritual.engagementScore },
    '📊 Ritual engagement updated'
  );
}

/**
 * Suggest a ritual based on context
 */
export function suggestRitual(
  userId: string,
  context: {
    phase: 'greeting' | 'middle' | 'closing';
    topics: string[];
    emotion: string;
    turnCount: number;
    hasWin?: boolean;
    needsComfort?: boolean;
  }
): RitualSuggestion | null {
  const state = getOrCreateState(userId);

  // Determine ritual type based on context
  let targetType: RitualType;
  if (context.phase === 'greeting' && context.turnCount <= 2) {
    targetType = 'greeting';
  } else if (context.phase === 'closing') {
    targetType = 'closing';
  } else if (context.hasWin) {
    targetType = 'celebration';
  } else if (context.needsComfort) {
    targetType = 'comfort';
  } else if (context.turnCount > 10 && state.preferences.likesStructure) {
    targetType = 'check_in';
  } else {
    return null; // No ritual needed
  }

  // Look for established rituals first
  const establishedMatches = state.rituals.filter((r) => r.type === targetType);
  if (establishedMatches.length > 0) {
    // Pick highest engagement one
    const ritual = establishedMatches.sort((a, b) => b.engagementScore - a.engagementScore)[0];

    // Don't repeat too soon
    if (ritual.lastPerformed) {
      const hoursSince = (Date.now() - ritual.lastPerformed.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) return null;
    }

    return {
      ritual,
      prompt: generateRitualPrompt(ritual, true),
      context: 'Established ritual',
    };
  }

  // Try a potential ritual
  const potentialMatches = state.potentialRituals.filter((r) => r.type === targetType);
  if (potentialMatches.length > 0) {
    // Pick random one to test
    const ritual = seededPick(`${Date.now()}:376`, potentialMatches) ?? potentialMatches[0];
    return {
      ritual,
      prompt: generateRitualPrompt(ritual, false),
      context: 'Testing new ritual',
    };
  }

  return null;
}

function generateRitualPrompt(ritual: Ritual, isEstablished: boolean): string {
  if (isEstablished) {
    const establishedIntros = [
      `Want to do our ${ritual.name.toLowerCase()} thing?`,
      `Should we do our usual ${ritual.name.toLowerCase()}?`,
      `Time for ${ritual.name.toLowerCase()}?`,
      `Let's do our thing: ${ritual.ferniPart}`,
    ];
    return seededPick(`${Date.now()}:395`, establishedIntros) ?? establishedIntros[0];
  } else {
    const newIntros = [
      `Want to try something? ${ritual.ferniPart}`,
      `Here's an idea: ${ritual.ferniPart}`,
      ritual.ferniPart,
    ];
    return seededPick(`${Date.now()}:402`, newIntros) ?? newIntros[0];
  }
}

/**
 * Format ritual guidance for LLM prompt
 */
export function formatRitualGuidance(
  userId: string,
  context: {
    phase: 'greeting' | 'middle' | 'closing';
    topics: string[];
    emotion: string;
    turnCount: number;
    hasWin?: boolean;
    needsComfort?: boolean;
  }
): string | null {
  const suggestion = suggestRitual(userId, context);
  if (!suggestion) return null;

  const state = getOrCreateState(userId);
  const isEstablished = state.rituals.some((r) => r.id === suggestion.ritual.id);

  const lines = [
    '🎭 RITUAL OPPORTUNITY:',
    '',
    `${isEstablished ? 'Established' : 'Potential'} ritual: "${suggestion.ritual.name}"`,
    '',
    `Suggested prompt: "${suggestion.prompt}"`,
    '',
    `What this ritual does: ${suggestion.ritual.ferniPart}`,
    '',
    isEstablished
      ? `This user has done this ${suggestion.ritual.performedCount} times and seems to like it.`
      : "This is a new ritual we're testing. See how they respond.",
  ];

  return lines.join('\n');
}

/**
 * Create a custom ritual
 */
export function createCustomRitual(
  userId: string,
  ritual: {
    name: string;
    ferniPart: string;
    userPart: string;
    topics: string[];
  }
): Ritual {
  const state = getOrCreateState(userId);

  const newRitual: Ritual = {
    id: `ritual_${Date.now()}_${Date.now().toString(36).slice(-7)}`,
    name: ritual.name,
    ferniPart: ritual.ferniPart,
    userPart: ritual.userPart,
    type: 'custom',
    performedCount: 1, // Start with 1 since they're creating it
    lastPerformed: new Date(),
    engagementScore: 0.7, // Start high since user initiated
    topics: ritual.topics,
  };

  state.rituals.push(newRitual);
  logger.info({ userId, ritualName: ritual.name }, '🎭 Custom ritual created');

  return newRitual;
}

/**
 * Get all established rituals for a user
 */
export function getEstablishedRituals(userId: string): Ritual[] {
  const state = getOrCreateState(userId);
  return [...state.rituals];
}

// Export for testing
export function clearRitualStates(): void {
  ritualStates.clear();
}
