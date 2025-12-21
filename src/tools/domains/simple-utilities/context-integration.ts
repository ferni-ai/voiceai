/**
 * Context Integration for Simple Utilities
 *
 * Connects utilities to what Ferni already knows about the user:
 * - Life events and milestones
 * - Goals and habits
 * - Travel plans
 * - Relationships and important dates
 *
 * This transforms generic utilities into personalized help:
 * "90 days from now" → "90 days - that's right before your marathon!"
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LifeContext {
  // From life-planning domain
  upcomingEvents: Array<{
    name: string;
    date: Date;
    type: 'milestone' | 'event' | 'deadline' | 'celebration';
    linkedGoal?: string;
  }>;

  // From goals
  activeGoals: Array<{
    name: string;
    targetDate?: Date;
    category: string;
  }>;

  // From relationships/memory
  importantPeople: Array<{
    name: string;
    relationship: string;
    birthday?: Date;
    anniversary?: Date;
    timezone?: string;
  }>;

  // From travel/calendar
  travelPlans: Array<{
    destination: string;
    startDate: Date;
    endDate: Date;
  }>;

  // From habits
  activeRoutines: Array<{
    name: string;
    schedule: string; // e.g., "daily at 3pm"
    linkedTimer?: { minutes: number; label: string };
  }>;
}

// ============================================================================
// CONTEXT LOADERS
// ============================================================================

/**
 * Load life context for a user from various services
 */
export async function loadLifeContext(userId: string): Promise<LifeContext> {
  const context: LifeContext = {
    upcomingEvents: [],
    activeGoals: [],
    importantPeople: [],
    travelPlans: [],
    activeRoutines: [],
  };

  try {
    // Try to load from life-planning service
    await loadLifePlanningContext(userId, context);
  } catch (err) {
    getLogger().debug({ err }, 'Could not load life-planning context');
  }

  try {
    // Try to load from memory service
    await loadMemoryContext(userId, context);
  } catch (err) {
    getLogger().debug({ err }, 'Could not load memory context');
  }

  try {
    // Try to load from habits service
    await loadHabitsContext(userId, context);
  } catch (err) {
    getLogger().debug({ err }, 'Could not load habits context');
  }

  return context;
}

async function loadLifePlanningContext(userId: string, context: LifeContext): Promise<void> {
  try {
    const { getActiveGoals, getUpcomingMilestones } =
      await import('../life-planning/goal-management.js');

    // Load active goals
    const activeGoals = getActiveGoals(userId);
    for (const goal of activeGoals) {
      context.activeGoals.push({
        name: goal.name,
        targetDate: goal.targetDate,
        category: goal.category,
      });
    }

    // Load upcoming milestones
    const milestones = getUpcomingMilestones(userId, 90);
    for (const milestone of milestones) {
      context.upcomingEvents.push({
        name: milestone.name,
        date: milestone.targetDate,
        type: 'milestone',
        linkedGoal: milestone.goalId,
      });
    }
  } catch {
    // Goal management not available
  }
}

async function loadMemoryContext(userId: string, context: LifeContext): Promise<void> {
  try {
    const { semanticSearch } = await import('../../../memory/semantic-rag.js');

    // Search for important people/relationships
    const peopleResults = await semanticSearch(
      'important people family friends relationships birthday anniversary',
      {
        userId,
        topK: 20,
        minScore: 0.4,
      }
    );

    for (const result of peopleResults) {
      // Extract person names from content
      const personMatch = result.content.match(
        /(?:my\s+)?(?:friend|partner|spouse|husband|wife|brother|sister|mom|dad|mother|father|parent|child|son|daughter|colleague|boss)\s+(\w+)/i
      );
      if (personMatch) {
        const name = personMatch[1];
        if (!context.importantPeople.find((p) => p.name.toLowerCase() === name.toLowerCase())) {
          context.importantPeople.push({
            name,
            relationship: 'contact',
            // Check for birthday/anniversary in content
            birthday: extractDate(result.content, 'birthday'),
            anniversary: extractDate(result.content, 'anniversary'),
            timezone: result.metadata?.timezone as string | undefined,
          });
        }
      }
    }

    // Search for travel plans
    const travelResults = await semanticSearch('trip travel vacation flight going to visiting', {
      userId,
      topK: 10,
      minScore: 0.4,
    });

    for (const result of travelResults) {
      const destMatch = result.content.match(
        /(?:trip|travel|going|flying|visiting)\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
      );
      if (destMatch) {
        const startDate = extractDate(result.content, 'start|depart|leave');
        const endDate = extractDate(result.content, 'return|end|back');
        if (startDate) {
          context.travelPlans.push({
            destination: destMatch[1],
            startDate,
            endDate: endDate || new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
          });
        }
      }
    }
  } catch {
    // Semantic search not available - this is fine
  }
}

/**
 * Extract a date from text near a keyword
 */
function extractDate(text: string, keyword: string): Date | undefined {
  const regex = new RegExp(
    `${keyword}[^.]*?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\w+\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)`,
    'i'
  );
  const match = text.match(regex);
  if (match?.[1]) {
    const parsed = new Date(match[1]);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return undefined;
}

async function loadHabitsContext(userId: string, context: LifeContext): Promise<void> {
  try {
    // Dynamic import
    const habitsModule = await import('../habits/habits.js');

    const habits = habitsModule.getUserHabits(userId);

    for (const habit of habits) {
      // Only add active habits
      if (habit.isActive !== false) {
        context.activeRoutines.push({
          name: habit.name,
          schedule: habit.frequency || 'daily',
          // Note: Habit type doesn't have targetDuration, so we can't link timers yet
          linkedTimer: undefined,
        });
      }
    }
  } catch {
    // Habits service not available
  }
}

// ============================================================================
// CONTEXT ENRICHMENT
// ============================================================================

/**
 * Enrich a countdown response with life context
 */
export function enrichCountdownWithContext(
  daysUntil: number,
  targetDate: Date,
  lifeContext: LifeContext
): string | null {
  // Check if this date is near any known events
  const nearbyEvents = lifeContext.upcomingEvents.filter((event) => {
    const eventDays = Math.ceil(
      (event.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.abs(eventDays - daysUntil) <= 3; // Within 3 days
  });

  if (nearbyEvents.length > 0) {
    const event = nearbyEvents[0];
    const daysDiff = Math.ceil(
      (targetDate.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {
      return `That's the same day as ${event.name}!`;
    } else if (daysDiff > 0) {
      return `That's ${daysDiff} day${daysDiff !== 1 ? 's' : ''} after ${event.name}!`;
    } else {
      return `That's ${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} before ${event.name}!`;
    }
  }

  // Check if near any goals
  const nearbyGoals = lifeContext.activeGoals.filter((goal) => {
    if (!goal.targetDate) return false;
    const goalDays = Math.ceil(
      (goal.targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.abs(goalDays - daysUntil) <= 7;
  });

  if (nearbyGoals.length > 0) {
    const goal = nearbyGoals[0];
    return `Right around when you're targeting ${goal.name}!`;
  }

  return null;
}

/**
 * Enrich a timezone lookup with relationship context
 */
export function enrichTimezoneWithContext(city: string, lifeContext: LifeContext): string | null {
  const cityLower = city.toLowerCase();

  // Check if we know someone in that timezone/city
  for (const person of lifeContext.importantPeople) {
    if (person.timezone?.toLowerCase().includes(cityLower)) {
      return `That's where ${person.name} is!`;
    }
  }

  // Check travel plans
  for (const trip of lifeContext.travelPlans) {
    if (trip.destination.toLowerCase().includes(cityLower)) {
      const daysUntil = Math.ceil(
        (trip.startDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil > 0 && daysUntil <= 30) {
        return `For your upcoming trip in ${daysUntil} days!`;
      }
    }
  }

  return null;
}

/**
 * Enrich a timer with habit context
 */
export function enrichTimerWithContext(
  minutes: number,
  label: string | undefined,
  lifeContext: LifeContext
): string | null {
  // Check if this matches a known routine
  for (const routine of lifeContext.activeRoutines) {
    if (routine.linkedTimer && Math.abs(routine.linkedTimer.minutes - minutes) < 1) {
      return `Your ${routine.name} routine timer`;
    }

    if (label && routine.name.toLowerCase().includes(label.toLowerCase())) {
      return `Part of your ${routine.name} habit`;
    }
  }

  return null;
}

/**
 * Get upcoming birthdays from context
 */
export function getUpcomingBirthdays(
  lifeContext: LifeContext,
  withinDays = 30
): Array<{ name: string; relationship: string; daysUntil: number }> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const birthdays: Array<{ name: string; relationship: string; daysUntil: number }> = [];

  for (const person of lifeContext.importantPeople) {
    if (!person.birthday) continue;

    // Get this year's birthday
    const birthday = new Date(person.birthday);
    birthday.setFullYear(currentYear);

    // If already passed, get next year's
    if (birthday < now) {
      birthday.setFullYear(currentYear + 1);
    }

    const daysUntil = Math.ceil((birthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= withinDays) {
      birthdays.push({
        name: person.name,
        relationship: person.relationship,
        daysUntil,
      });
    }
  }

  return birthdays.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Get upcoming anniversaries from context
 */
export function getUpcomingAnniversaries(
  lifeContext: LifeContext,
  withinDays = 30
): Array<{ name: string; daysUntil: number; years: number }> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const anniversaries: Array<{ name: string; daysUntil: number; years: number }> = [];

  for (const person of lifeContext.importantPeople) {
    if (!person.anniversary) continue;

    const anniversary = new Date(person.anniversary);
    const startYear = anniversary.getFullYear();
    anniversary.setFullYear(currentYear);

    if (anniversary < now) {
      anniversary.setFullYear(currentYear + 1);
    }

    const daysUntil = Math.ceil((anniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= withinDays) {
      const years = anniversary.getFullYear() - startYear;
      anniversaries.push({
        name: `Anniversary with ${person.name}`,
        daysUntil,
        years,
      });
    }
  }

  return anniversaries.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadLifeContext,
  enrichCountdownWithContext,
  enrichTimezoneWithContext,
  enrichTimerWithContext,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
};
