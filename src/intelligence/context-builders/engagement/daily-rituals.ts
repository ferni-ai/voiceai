/**
 * Daily Rituals Context Builder
 *
 * Injects daily ritual opportunities into conversations based on:
 * - Time of day (morning, afternoon, evening)
 * - Current persona
 * - User's streak status
 * - Whether they've already done a ritual today
 *
 * This creates delightful daily touchpoints that give users a reason to return.
 *
 * @module intelligence/context-builders/daily-rituals
 */

import {
  getDailyRitualsService,
  PERSONA_RITUALS,
  RITUAL_PROMPTS,
} from '../../services/daily-rituals.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  BuilderCategory,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'DailyRitualsContextBuilder' });

// ============================================================================
// HELPERS
// ============================================================================

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getPersonaRitualId(personaId: string): string | null {
  const ritualMap: Record<string, string> = {
    ferni: 'ferni-sky-check',
    'maya-santos': 'maya-habit-heartbeat',
    'alex-chen': 'alex-inbox-pulse',
    'jordan-taylor': 'jordan-todays-chapter',
    'nayan-patel': 'nayan-morning-stillness',
    'peter-john': 'peter-pattern-pulse',
  };
  return ritualMap[personaId] || null;
}

// ============================================================================
// DAILY RITUALS CONTEXT BUILDER
// ============================================================================

export const dailyRitualsBuilder: ContextBuilder = {
  name: 'daily-rituals',
  description: 'Injects daily ritual opportunities based on time and persona',
  priority: 45, // Medium priority - enhancement
  category: BuilderCategory.ENGAGEMENT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData, services } = input;
    const injections: ContextInjection[] = [];

    const personaId = persona?.id || 'ferni';
    const userId = services?.userId;
    const turnCount = userData?.turnCount || 0;
    const timeOfDay = getTimeOfDay();

    // Only suggest rituals in early conversation (first 3 turns)
    if (turnCount > 3) {
      return injections;
    }

    // Get the ritual for this persona
    const ritualId = getPersonaRitualId(personaId);
    if (!ritualId) {
      return injections;
    }

    const ritual = PERSONA_RITUALS[ritualId];
    if (!ritual) {
      return injections;
    }

    // Check if ritual is appropriate for time of day
    const isMorningRitual = ritual.preferredTime === 'morning';
    const isMorning = timeOfDay === 'morning';

    // Morning rituals only in morning, others anytime
    if (isMorningRitual && !isMorning) {
      return injections;
    }

    // Check if user has already done this ritual today
    const ritualsService = getDailyRitualsService();
    if (userId) {
      const dueRituals = ritualsService.getDueRituals(userId);
      const isRitualDue = dueRituals.some((r) => r.id === ritualId);

      if (!isRitualDue) {
        // Already completed today
        return injections;
      }

      // Get streak info for personalized messaging
      const profile = ritualsService.getOrCreateProfile(userId);
      const streak = profile.streaks[ritualId];
      const currentStreak = streak?.currentStreak || 0;

      // Build the ritual injection
      const prompts = RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS];
      if (!prompts) {
        return injections;
      }

      // Get a random opening
      let opening = '';
      if ('openings' in prompts) {
        const openings = prompts.openings as string[];
        opening = openings[Math.floor(Math.random() * openings.length)];
      } else if ('wisdomDrops' in prompts) {
        // Nayan's wisdom drops
        const wisdomDrops = prompts.wisdomDrops as string[];
        opening = wisdomDrops[Math.floor(Math.random() * wisdomDrops.length)];
      }

      // Check for streak celebration
      let streakCelebration = '';
      if (currentStreak > 0 && 'streakCelebrations' in prompts) {
        const celebrations = prompts.streakCelebrations as Record<number, string>;
        // Find the highest milestone they've passed
        const milestones = Object.keys(celebrations)
          .map(Number)
          .sort((a, b) => b - a);
        for (const milestone of milestones) {
          if (currentStreak >= milestone && currentStreak < milestone + 7) {
            streakCelebration = celebrations[milestone];
            break;
          }
        }
      }

      // Build the injection content
      let content = `[DAILY RITUAL OPPORTUNITY - ${ritual.name}]

This is a beautiful moment for your daily ${ritual.name} ritual with ${userData?.userName || 'them'}.

RITUAL: ${ritual.name}
DURATION: ${ritual.duration}
STREAK: ${currentStreak} days

HOW TO OFFER IT:
- Don't force it - make it feel natural
- Early in conversation is best
- If they seem rushed, skip it

SUGGESTED OPENING:
"${opening}"`;

      if (streakCelebration) {
        content += `

STREAK CELEBRATION (${currentStreak} days!):
"${streakCelebration}"`;
      }

      // Add persona-specific guidance
      if (personaId === 'ferni') {
        content += `

FERNI'S SKY CHECK:
- Ask about their "internal weather"
- Options: sunny, partly-cloudy, cloudy, rainy, stormy, foggy, rainbow
- Follow up based on their answer
- This builds emotional self-awareness`;
      } else if (personaId === 'maya-santos') {
        content += `

MAYA'S HABIT HEARTBEAT:
- Check on their habit progress
- Reference Compound and Interest (the cats!)
- Celebrate consistency, not perfection`;
      } else if (personaId === 'nayan-patel') {
        content += `

NAYAN'S MORNING STILLNESS:
- Share a brief wisdom drop
- Let it land with silence
- Don't rush to fill the space`;
      }

      injections.push(
        createStandardInjection('daily_ritual_opportunity', content, {
          category: 'engagement',
        })
      );

      log.debug(
        { personaId, ritualId, currentStreak, timeOfDay },
        'Daily ritual opportunity injected'
      );
    }

    return injections;
  },
};

// Register the builder
registerContextBuilder(dailyRitualsBuilder);

export default dailyRitualsBuilder;
