/**
 * Task transition lines, and whether they may be handed to the model.
 *
 * When a task starts or ends, the task manager used to tell the model
 * `[TRANSITION] Start with: "Wait, hold on—let's not skip over this!"`. On the
 * 2026-10-03 dev call that came out word for word after the caller said "It's
 * pretty good." These are canned lines, not answers to the caller, so they are
 * off by default. FERNI_TASK_SCRIPTED_TRANSITIONS=on restores them.
 *
 * Moved out of task-manager.ts (getSmartEntryTransition and its mood helpers).
 *
 * @module tasks/task-entry-transition
 */
import type { ConversationAnalysis } from '../services/types.js';
import {
  getContextualTransition,
  getTransition,
  TASK_TRANSITIONS,
  type TransitionKey,
} from './transitions.js';
import type { TaskWisdom } from './wisdom/index.js';

type Mood = 'light' | 'serious' | 'support' | 'practical';

export function scriptedTaskTransitionsEnabled(): boolean {
  return process.env.FERNI_TASK_SCRIPTED_TRANSITIONS === 'on';
}

const TASK_TO_TRANSITION: Record<string, string> = {
  goals: 'toGoals',
  wisdom_sharing: 'toWisdom',
  investment_wisdom: 'toWisdom',
  fear_addressing: 'toFear',
  panic_prevention: 'toFear',
  market_panic: 'toFear',
  milestone_celebration: 'toCelebration',
  quick_celebrate: 'toCelebration',
  goodbye: 'toGoodbye',
};

/** A contextually-appropriate entry line for a task. */
export function pickEntryTransition(wisdom: TaskWisdom, analysis: ConversationAnalysis): string {
  if (wisdom.transitions?.entry && wisdom.transitions.entry.length > 0) {
    return wisdom.transitions.entry[Math.floor(Math.random() * wisdom.transitions.entry.length)];
  }

  const transitionKey = TASK_TO_TRANSITION[wisdom.id];
  if (transitionKey && transitionKey in TASK_TRANSITIONS) {
    return getTransition(transitionKey as TransitionKey);
  }

  const currentMood = moodFromAnalysis(analysis);
  const targetMood = targetMoodForCategory(wisdom.category);
  if (currentMood !== targetMood) {
    return getContextualTransition({ fromMood: currentMood, toMood: targetMood });
  }
  return getTransition('gentle');
}

/** A random exit line for a finished task, if it has any. */
export function pickExitTransition(wisdom: TaskWisdom): string | undefined {
  const exits = wisdom.transitions?.exit;
  if (!exits || exits.length === 0) return undefined;
  return exits[Math.floor(Math.random() * exits.length)];
}

function moodFromAnalysis(analysis: ConversationAnalysis): Mood {
  if (analysis.emotion.distressLevel > 0.6) return 'support';
  if (analysis.emotion.valence === 'positive') return 'light';
  if (
    analysis.intent.primary === 'seeking_advice' ||
    analysis.intent.primary === 'asking_question'
  ) {
    return 'practical';
  }
  return 'serious';
}

function targetMoodForCategory(category: TaskWisdom['category']): Mood {
  switch (category) {
    case 'support':
    case 'life_event':
      return 'support';
    case 'micro':
    case 'relationship':
      return 'light';
    default:
      return 'practical';
  }
}
