/**
 * Special Dates Awareness Context Builder
 *
 * "Better Than Human" - Ferni remembers birthdays, anniversaries, deadlines and
 * other important dates, and brings them up at the right moment.
 *
 * Reads the canonical important-dates store via `getRemindersForSession`,
 * which also marks a reminder due today as delivered "in conversation" so the
 * scheduled job doesn't push it as well.
 *
 * @module intelligence/context-builders/family/special-dates-awareness
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getRemindersForSession } from '../../../services/important-dates/session-reminders.js';

const log = createLogger({ module: 'context:special-dates' });

/** Once per session: the block is stable for the session and claims reminders. */
const builtFor = new Map<string, string>();
const MAX_SESSIONS = 5_000;

export const specialDatesAwarenessBuilder: ContextBuilder = {
  name: 'special-dates-awareness',
  description: 'Surfaces upcoming birthdays, anniversaries and other important dates',
  priority: 4,
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const userId = input.services.userId;
    if (!userId) return [];
    const sessionKey = `${userId}:${input.services.sessionId}`;

    let content = builtFor.get(sessionKey);
    if (content === undefined) {
      const { context, reminders } = await getRemindersForSession(userId);
      content = context;
      if (builtFor.size >= MAX_SESSIONS) builtFor.clear();
      builtFor.set(sessionKey, content);
      if (reminders.length > 0) {
        log.debug({ userId, count: reminders.length }, 'Important dates in session context');
      }
    }
    if (!content) return [];
    return [
      createStandardInjection('special_dates_awareness', content, {
        category: 'external',
        confidence: 0.95,
      }),
    ];
  },
};

registerContextBuilder(specialDatesAwarenessBuilder);

export default specialDatesAwarenessBuilder;
