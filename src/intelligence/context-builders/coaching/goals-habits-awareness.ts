/**
 * Goals & Habits Awareness Context Builder
 *
 * "Better Than Human" - Ferni remembers your goals, habits, dreams and
 * aspirations: active goals with progress, habits due today (streaks at
 * risk first), and now and then one dream that's gone quiet.
 *
 * Reads the canonical aspirations store via `getAspirationsForSession`
 * (budgeted, persona-agnostic, filtered by the user's proactive boundaries).
 * Built once per session: it's stable for the session and marks a
 * resurfaced dream so it isn't raised again for a while.
 *
 * @module intelligence/context-builders/coaching/goals-habits-awareness
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { getAspirationsForSession } from '../../../services/aspirations/session-block.js';

const builtFor = new Map<string, string>();
const MAX_SESSIONS = 5_000;

export const goalsHabitsAwarenessBuilder: ContextBuilder = {
  name: 'goals-habits-awareness',
  description: "Surfaces the user's active goals, habits due today and a quiet dream",
  priority: 5,
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const userId = input.services.userId;
    if (!userId) return [];
    const sessionKey = `${userId}:${input.services.sessionId}`;
    let content = builtFor.get(sessionKey);
    if (content === undefined) {
      content = (await getAspirationsForSession(userId)).context;
      if (builtFor.size >= MAX_SESSIONS) builtFor.clear();
      builtFor.set(sessionKey, content);
    }
    if (!content) return [];
    return [
      createStandardInjection('goals_habits_awareness', content, {
        category: 'external',
        confidence: 0.9,
      }),
    ];
  },
};

registerContextBuilder(goalsHabitsAwarenessBuilder);

export default goalsHabitsAwarenessBuilder;
