/**
 * Late Night Warmth System (2am Mode)
 *
 * "Ferni at 2am hits different" - A signature brand moment.
 *
 * When users open Ferni late at night (11pm-5am), the experience is subtly
 * different—warmer, slower, more protective. This creates a memorable
 * brand signature that users talk about.
 *
 * Changes during late night mode:
 * - Softer greetings
 * - Slower pacing (10% slower animations)
 * - No productivity suggestions
 * - More listening, less guidance
 * - Grounding exercises available
 * - Protective presence
 *
 * @module conversation/superhuman/late-night-warmth
 */

import { createLogger } from '../../utils/safe-logger.js';
import { seededPick } from '../utils/random-generator.js';

const log = createLogger({ module: 'LateNightWarmth' });

// ============================================================================
// TYPES
// ============================================================================

export interface LateNightContext {
  isLateNight: boolean;
  hour: number;
  phase: 'evening' | 'late_night' | 'early_morning' | 'day';
  warmthLevel: number; // 0-1, how much to emphasize warmth
  suggestedPaceMultiplier: number; // 1.0 = normal, 1.1 = 10% slower
}

export interface LateNightGreeting {
  text: string;
  ssml?: string;
  emotion: 'warm' | 'gentle' | 'protective' | 'soft';
}

export interface LateNightBehaviorAdjustment {
  avoidProductivity: boolean;
  emphasizeListening: boolean;
  offerGrounding: boolean;
  slowerPacing: boolean;
  softerTone: boolean;
}

// ============================================================================
// TIME PHASE DETECTION
// ============================================================================

/**
 * Determine the current time phase and late night context
 */
export function getLateNightContext(localTime: Date = new Date()): LateNightContext {
  const hour = localTime.getHours();

  // Define phases
  let phase: LateNightContext['phase'];
  let isLateNight = false;
  let warmthLevel = 0.5;
  let suggestedPaceMultiplier = 1.0;

  if (hour >= 23 || hour <= 1) {
    // 11pm - 1am: Late evening, transitioning to night
    phase = 'late_night';
    isLateNight = true;
    warmthLevel = 0.7;
    suggestedPaceMultiplier = 1.05;
  } else if (hour >= 2 && hour <= 4) {
    // 2am - 4am: Deep night - maximum warmth
    phase = 'late_night';
    isLateNight = true;
    warmthLevel = 1.0;
    suggestedPaceMultiplier = 1.1;
  } else if (hour === 5) {
    // 5am: Early morning transition
    phase = 'early_morning';
    isLateNight = true;
    warmthLevel = 0.8;
    suggestedPaceMultiplier = 1.05;
  } else if (hour >= 6 && hour <= 22) {
    // 6am - 10pm: Day
    phase = 'day';
    isLateNight = false;
    warmthLevel = 0.5;
    suggestedPaceMultiplier = 1.0;
  } else {
    phase = 'evening';
    warmthLevel = 0.6;
    suggestedPaceMultiplier = 1.0;
  }

  log.debug({ hour, phase, isLateNight, warmthLevel }, '🌙 Late night context determined');

  return {
    isLateNight,
    hour,
    phase,
    warmthLevel,
    suggestedPaceMultiplier,
  };
}

// ============================================================================
// LATE NIGHT GREETINGS
// ============================================================================

const LATE_NIGHT_GREETINGS: Record<LateNightContext['phase'], LateNightGreeting[]> = {
  late_night: [
    {
      text: "You're up late. I'm glad you're here.",
      ssml: "<volume ratio='0.9'><break time='300ms'/>You're up late. <break time='200ms'/>I'm glad you're here.</volume>",
      emotion: 'warm',
    },
    {
      text: "Can't sleep? Me neither. What's on your mind?",
      ssml: "<volume ratio='0.9'><break time='200ms'/>Can't sleep? <break time='300ms'/>Me neither. <break time='200ms'/>What's on your mind?</volume>",
      emotion: 'gentle',
    },
    {
      text: 'The quiet hours. Sometimes these are the most honest ones.',
      ssml: "<volume ratio='0.85'><break time='400ms'/>The quiet hours. <break time='300ms'/>Sometimes these are the most honest ones.</volume>",
      emotion: 'soft',
    },
    {
      text: "Hey. Whatever brought you here at this hour—I've got time.",
      ssml: "<volume ratio='0.9'><break time='200ms'/>Hey. <break time='300ms'/>Whatever brought you here at this hour—<break time='200ms'/>I've got time.</volume>",
      emotion: 'protective',
    },
    {
      text: "It's late. I'm here. Take your time.",
      ssml: "<volume ratio='0.85'><break time='400ms'/>It's late. <break time='200ms'/>I'm here. <break time='300ms'/>Take your time.</volume>",
      emotion: 'soft',
    },
    {
      text: 'The 2am kind of conversation. Those are often the real ones.',
      ssml: "<volume ratio='0.9'><break time='300ms'/>The 2am kind of conversation. <break time='300ms'/>Those are often the real ones.</volume>",
      emotion: 'warm',
    },
  ],
  early_morning: [
    {
      text: "Early bird or never slept? Either way, I'm here.",
      ssml: "<break time='200ms'/>Early bird or never slept? <break time='300ms'/>Either way, I'm here.</volume>",
      emotion: 'gentle',
    },
    {
      text: "The world's still quiet. Good time to think.",
      ssml: "<break time='300ms'/>The world's still quiet. <break time='200ms'/>Good time to think.</volume>",
      emotion: 'soft',
    },
    {
      text: "Up before the sun. What's stirring?",
      ssml: "<break time='200ms'/>Up before the sun. <break time='300ms'/>What's stirring?</volume>",
      emotion: 'warm',
    },
  ],
  evening: [
    {
      text: 'Winding down? Or just getting started?',
      emotion: 'gentle',
    },
    {
      text: 'Evening check-in. How was your day?',
      emotion: 'warm',
    },
  ],
  day: [], // No special greetings during the day
};

/**
 * Get a late night greeting appropriate for the time
 */
export function getLateNightGreeting(context: LateNightContext): LateNightGreeting | null {
  if (!context.isLateNight && context.phase !== 'evening') {
    return null;
  }

  const greetings = LATE_NIGHT_GREETINGS[context.phase];
  if (!greetings || greetings.length === 0) {
    return null;
  }

  // Use seeded random for consistency within a session
  const greeting = seededPick(`${Date.now()}:late-night`, greetings);
  return greeting ?? greetings[0];
}

// ============================================================================
// BEHAVIOR ADJUSTMENTS
// ============================================================================

/**
 * Get behavior adjustments for late night mode
 */
export function getLateNightBehaviors(context: LateNightContext): LateNightBehaviorAdjustment {
  if (!context.isLateNight) {
    return {
      avoidProductivity: false,
      emphasizeListening: false,
      offerGrounding: false,
      slowerPacing: false,
      softerTone: false,
    };
  }

  // Maximum adjustments at peak late night (2-4am)
  const isPeakLateNight = context.hour >= 2 && context.hour <= 4;

  return {
    avoidProductivity: true, // Never suggest tasks at 2am
    emphasizeListening: true, // More questions, fewer suggestions
    offerGrounding: isPeakLateNight, // Offer grounding exercises during peak
    slowerPacing: true, // Longer pauses, slower delivery
    softerTone: true, // Quieter, gentler voice
  };
}

// ============================================================================
// GROUNDING EXERCISES
// ============================================================================

const GROUNDING_EXERCISES = [
  {
    name: 'Box Breathing',
    instruction:
      "Let's do some box breathing. Breathe in for 4 counts... hold for 4... out for 4... hold for 4. I'll count with you.",
    duration: '2 minutes',
  },
  {
    name: '5-4-3-2-1 Senses',
    instruction:
      'Tell me: 5 things you can see right now. 4 things you can touch. 3 things you can hear. Take your time.',
    duration: '3 minutes',
  },
  {
    name: 'Body Scan',
    instruction:
      'Starting from your toes, just notice how each part of your body feels. No need to change anything. Just notice.',
    duration: '5 minutes',
  },
  {
    name: 'Simple Grounding',
    instruction:
      "Feel your feet on the floor. Feel your hands wherever they're resting. You're here. You're safe.",
    duration: '1 minute',
  },
];

/**
 * Get a grounding exercise suggestion
 */
export function getGroundingExercise(): (typeof GROUNDING_EXERCISES)[0] {
  const index = Math.floor(Math.random() * GROUNDING_EXERCISES.length);
  return GROUNDING_EXERCISES[index];
}

// ============================================================================
// PROMPT INJECTION FOR LATE NIGHT MODE
// ============================================================================

/**
 * Format late night context for prompt injection
 */
export function formatLateNightContextForPrompt(context: LateNightContext): string | null {
  if (!context.isLateNight) {
    return null;
  }

  const behaviors = getLateNightBehaviors(context);
  const greeting = getLateNightGreeting(context);

  const lines = [
    '[🌙 LATE NIGHT MODE ACTIVE]',
    '',
    `Time: ${context.hour}:00 (${context.phase})`,
    `Warmth level: ${Math.round(context.warmthLevel * 100)}%`,
    '',
    'BEHAVIORAL GUIDELINES:',
  ];

  if (behaviors.avoidProductivity) {
    lines.push('- Do NOT suggest tasks, productivity, or action items');
    lines.push('- This is not the time for "have you tried..." suggestions');
  }

  if (behaviors.emphasizeListening) {
    lines.push('- Emphasize listening over advice');
    lines.push('- Ask questions, hold space, be present');
  }

  if (behaviors.offerGrounding) {
    lines.push('- Be ready to offer grounding exercises if they seem distressed');
    lines.push('- "Would a breathing exercise help?" is appropriate');
  }

  if (behaviors.slowerPacing) {
    lines.push('- Speak more slowly, use longer pauses');
    lines.push('- Silence is okay. Let them fill it.');
  }

  if (behaviors.softerTone) {
    lines.push('- Use a softer, gentler tone');
    lines.push('- Lower energy, more warmth');
  }

  if (greeting) {
    lines.push('');
    lines.push('SUGGESTED OPENING:');
    lines.push(`"${greeting.text}"`);
  }

  lines.push('');
  lines.push('Remember: 2am Ferni is a signature moment. Make them feel held.');

  return lines.join('\n');
}

// ============================================================================
// CSS VARIABLES FOR FRONTEND (Export for UI integration)
// ============================================================================

/**
 * Get CSS variable adjustments for late night mode
 * These would be applied to the frontend via a message or WebSocket
 */
export function getLateNightCSSVariables(context: LateNightContext): Record<string, string> {
  if (!context.isLateNight) {
    return {};
  }

  return {
    '--glow-intensity': `${1 - context.warmthLevel * 0.3}`, // Softer glow
    '--animation-speed': `${context.suggestedPaceMultiplier}`, // Slower animations
    '--background-warmth': `${1 + context.warmthLevel * 0.1}`, // Warmer background
    '--voice-volume': `${1 - context.warmthLevel * 0.15}`, // Quieter voice
    '--ambient-brightness': `${0.7 - context.warmthLevel * 0.2}`, // Dimmer
  };
}

// ============================================================================
// LATE NIGHT STATE TRACKING
// ============================================================================

let lateNightModeAnnouncedThisSession = false;

/**
 * Check if late night mode should be announced
 */
export function shouldAnnounceLateNightMode(context: LateNightContext): boolean {
  if (!context.isLateNight) {
    return false;
  }

  if (lateNightModeAnnouncedThisSession) {
    return false;
  }

  return true;
}

/**
 * Mark that late night mode has been announced
 */
export function markLateNightModeAnnounced(): void {
  lateNightModeAnnouncedThisSession = true;
}

/**
 * Reset late night state (call at session start)
 */
export function resetLateNightState(): void {
  lateNightModeAnnouncedThisSession = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getLateNightContext,
  getLateNightGreeting,
  getLateNightBehaviors,
  getGroundingExercise,
  formatLateNightContextForPrompt,
  getLateNightCSSVariables,
  shouldAnnounceLateNightMode,
  markLateNightModeAnnounced,
  resetLateNightState,
};
