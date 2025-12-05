/**
 * Energy & Fatigue Awareness Context Builder
 *
 * Adjusts persona behavior based on:
 * - Time of day (morning energy vs late-night tiredness)
 * - Day of week (Monday blues, Friday vibes)
 * - Conversation duration (long chats = natural fatigue)
 *
 * This makes personas feel more human - they have natural rhythms
 * and energy fluctuations just like real people.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// TIME-BASED ENERGY LEVELS
// ============================================================================

type EnergyLevel = 'low' | 'rising' | 'peak' | 'declining' | 'winding_down';

interface TimeEnergy {
  level: EnergyLevel;
  description: string;
  voiceHint: string;
  paceHint: string;
}

function getTimeBasedEnergy(): TimeEnergy {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 7) {
    return {
      level: 'rising',
      description: 'Early morning - slowly waking up',
      voiceHint: 'Voice is a bit softer, warming up for the day',
      paceHint: 'Pace is gentle, unhurried',
    };
  } else if (hour >= 7 && hour < 10) {
    return {
      level: 'rising',
      description: 'Morning - energy building',
      voiceHint: 'Voice is clear and fresh',
      paceHint: 'Pace is focused and productive',
    };
  } else if (hour >= 10 && hour < 12) {
    return {
      level: 'peak',
      description: 'Mid-morning - peak energy',
      voiceHint: 'Voice is energized and confident',
      paceHint: 'Pace is efficient and engaged',
    };
  } else if (hour >= 12 && hour < 14) {
    return {
      level: 'declining',
      description: 'Midday - post-lunch lull',
      voiceHint: 'Voice is warm but slightly relaxed',
      paceHint: 'Pace may be a touch slower',
    };
  } else if (hour >= 14 && hour < 17) {
    return {
      level: 'rising',
      description: 'Afternoon - second wind',
      voiceHint: 'Voice has renewed focus',
      paceHint: 'Pace is steady and productive',
    };
  } else if (hour >= 17 && hour < 20) {
    return {
      level: 'declining',
      description: 'Evening - winding down',
      voiceHint: 'Voice is more relaxed, conversational',
      paceHint: 'Pace is unhurried, reflective',
    };
  } else if (hour >= 20 && hour < 23) {
    return {
      level: 'winding_down',
      description: 'Night - unwinding',
      voiceHint: 'Voice is softer, calmer',
      paceHint: 'Pace is gentle, thoughtful',
    };
  } else {
    return {
      level: 'low',
      description: 'Late night - quiet hours',
      voiceHint: 'Voice is quiet, intimate',
      paceHint: 'Pace is slow and thoughtful',
    };
  }
}

// ============================================================================
// DAY-BASED ENERGY MODIFIERS
// ============================================================================

interface DayEnergy {
  modifier: string;
  vibe: string;
}

function getDayBasedEnergy(): DayEnergy {
  const day = new Date().getDay();

  switch (day) {
    case 0: // Sunday
      return {
        modifier: 'weekend_relaxed',
        vibe: "It's Sunday - a day for rest and reflection.",
      };
    case 1: // Monday
      return {
        modifier: 'monday_fresh',
        vibe: "It's Monday - fresh start energy, new week possibilities.",
      };
    case 2: // Tuesday
      return {
        modifier: 'midweek_building',
        vibe: "It's Tuesday - getting into the groove of the week.",
      };
    case 3: // Wednesday
      return {
        modifier: 'hump_day',
        vibe: "It's Wednesday - halfway through, momentum building.",
      };
    case 4: // Thursday
      return {
        modifier: 'almost_there',
        vibe: "It's Thursday - weekend is in sight.",
      };
    case 5: // Friday
      return {
        modifier: 'friday_energy',
        vibe: "It's Friday - celebratory end-of-week energy.",
      };
    case 6: // Saturday
      return {
        modifier: 'weekend_free',
        vibe: "It's Saturday - freedom and possibility.",
      };
    default:
      return {
        modifier: 'neutral',
        vibe: 'A good day for conversation.',
      };
  }
}

// ============================================================================
// PERSONA ENERGY PERSONALITIES
// ============================================================================

/**
 * How each persona expresses different energy levels.
 */
const PERSONA_ENERGY_EXPRESSIONS: Record<string, {
  low: string[];
  peak: string[];
  declining: string[];
}> = {
  'ferni': {
    low: [
      'speaking more softly, reflectively',
      'taking longer pauses, savoring the quiet',
      'voice has that late-night intimacy',
    ],
    peak: [
      'fully present and engaged',
      'questions come easily',
      'curious energy is flowing',
    ],
    declining: [
      'settling into a comfortable rhythm',
      'voice is warm and unhurried',
      'enjoying the slower pace',
    ],
  },

  'nayan-patel': {
    low: [
      'voice carries the weight of long experience',
      'speaking with quiet authority',
      'measured words, chosen carefully',
    ],
    peak: [
      'that familiar passion for index funds shining through',
      'speaking with conviction',
      'the wise mentor at full engagement',
    ],
    declining: [
      'grandfatherly warmth in the voice',
      'patient, unhurried wisdom',
      'savoring the conversation',
    ],
  },

  'peter-john': {
    low: [
      'still enthusiastic but more contained',
      'the excited energy channeled into focus',
      'thoughtful rather than bouncy',
    ],
    peak: [
      'practically vibrating with stock ideas',
      'rapid-fire connections',
      'the researcher fully alive',
    ],
    declining: [
      'still curious but more reflective',
      'sharing stories rather than racing ahead',
      'enjoying the wander through ideas',
    ],
  },

  'alex-chen': {
    low: [
      'efficient but with softer edges',
      'organized thoughts, gentle delivery',
      'crisp but warm',
    ],
    peak: [
      'rapid-fire organization',
      'clicking through tasks effortlessly',
      'peak productivity mode',
    ],
    declining: [
      'wrapping up thoughts neatly',
      'creating closure naturally',
      'organized wind-down',
    ],
  },

  'maya-santos': {
    low: [
      'gentle supportive presence',
      'quieter encouragement',
      'soft-spoken wisdom',
    ],
    peak: [
      'warm enthusiasm for the user\'s goals',
      'actively problem-solving together',
      'optimistic momentum',
    ],
    declining: [
      'nurturing end-of-day energy',
      'celebrating small wins',
      'compassionate wrap-up',
    ],
  },

  'jordan-taylor': {
    low: [
      'dreamy rather than bouncy',
      'painting visions in softer strokes',
      'excitement contained in imagination',
    ],
    peak: [
      'absolutely buzzing with ideas',
      'can barely contain the excitement',
      'vision-casting at full throttle',
    ],
    declining: [
      'satisfied excitement',
      'wrapping dreams in warm anticipation',
      'contentedly planning ahead',
    ],
  },
};

// ============================================================================
// ENERGY CONTEXT BUILDER
// ============================================================================

async function buildEnergyAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userData } = input;
  const injections: ContextInjection[] = [];

  // Only inject energy awareness occasionally (10% chance)
  // This is subtle background influence
  if (Math.random() > 0.10) {
    return injections;
  }

  const personaId = persona?.id || 'ferni';
  const timeEnergy = getTimeBasedEnergy();
  const dayEnergy = getDayBasedEnergy();
  const personaExpressions = PERSONA_ENERGY_EXPRESSIONS[personaId];

  if (!personaExpressions) {
    return injections;
  }

  // Get appropriate expression for current energy level
  let expression = '';
  switch (timeEnergy.level) {
    case 'low':
    case 'winding_down':
      expression = personaExpressions.low[Math.floor(Math.random() * personaExpressions.low.length)];
      break;
    case 'peak':
      expression = personaExpressions.peak[Math.floor(Math.random() * personaExpressions.peak.length)];
      break;
    case 'rising':
    case 'declining':
      expression = personaExpressions.declining[Math.floor(Math.random() * personaExpressions.declining.length)];
      break;
  }

  // Check for conversation fatigue (long sessions)
  const sessionDurationMs = userData?.sessionDurationMs || 0;
  const sessionMinutes = sessionDurationMs / 60000;
  let fatigueMod = '';

  if (sessionMinutes > 30) {
    fatigueMod = ' After our long conversation, there\'s a natural settling into familiarity.';
  } else if (sessionMinutes > 15) {
    fatigueMod = ' We\'ve found our rhythm together.';
  }

  if (expression) {
    const hint = `[ENERGY AWARENESS: ${timeEnergy.description}. Your current vibe: ${expression}.${fatigueMod} Let this subtly influence your tone - don't mention it explicitly.]`;

    injections.push(createHintInjection('energy_awareness', hint));

    getLogger().debug(
      { personaId, energyLevel: timeEnergy.level, expression },
      'Energy awareness injected'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('energy_awareness', buildEnergyAwareness);

export { buildEnergyAwareness, getTimeBasedEnergy, getDayBasedEnergy };

