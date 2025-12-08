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

async function loadLifePlanningContext(_userId: string, _context: LifeContext): Promise<void> {
  // TODO: Integrate with goal-management service when API is stabilized
  // The goal-management module uses a different data structure (LifePortfolio)
  // that doesn't directly expose goals in the way we need here.
  // For now, context enrichment will be minimal.
  // 
  // Future enhancement: Add getActiveGoals() and getUpcomingMilestones() to goal-management.ts
}

async function loadMemoryContext(_userId: string, _context: LifeContext): Promise<void> {
  // TODO: Integrate with memory service when semantic search API is ready
  // The current MemoryStore interface uses query() not search().
  // For now, context enrichment from memories is disabled.
  //
  // Future enhancement: Add semantic search for people, travel, important dates
}

async function loadHabitsContext(userId: string, context: LifeContext): Promise<void> {
  try {
    // Dynamic import
    const habitsModule = await import('../../habits.js');
    
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
  const nearbyEvents = lifeContext.upcomingEvents.filter(event => {
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
  const nearbyGoals = lifeContext.activeGoals.filter(goal => {
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
export function enrichTimezoneWithContext(
  city: string,
  lifeContext: LifeContext
): string | null {
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
    if (routine.linkedTimer && 
        Math.abs(routine.linkedTimer.minutes - minutes) < 1) {
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
  withinDays: number = 30
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
    
    const daysUntil = Math.ceil(
      (birthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    
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
  withinDays: number = 30
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
    
    const daysUntil = Math.ceil(
      (anniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    
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

