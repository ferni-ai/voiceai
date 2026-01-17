/**
 * Calendar Test Utilities
 *
 * Shared utilities for testing calendar functionality across unit,
 * integration, and E2E tests.
 *
 * @module tests/utils/calendar-test-utils
 */

import type { CalendarEvent, DayOverview, TimeSlot } from '../../services/calendar/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TestEvent {
  title: string;
  start: Date | string;
  duration: number; // minutes
  attendees?: string[];
  location?: string;
  description?: string;
  isAllDay?: boolean;
}

export interface TestWeekScenario {
  name: string;
  events: TestEvent[];
  expectedMetrics: {
    totalMeetingHours: number;
    focusTimeRatio: number;
    backToBackPercentage: number;
    busiestDay: string;
  };
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Get a date relative to now
 */
export function inMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function inHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function inDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0); // Default to 9am
  return date;
}

export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function tomorrow(time?: string): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  if (time) {
    const [hours, minutes] = parseTime(time);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

export function today(time?: string): Date {
  const date = new Date();
  if (time) {
    const [hours, minutes] = parseTime(time);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

export function thisWeek(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

export function nextWeek(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + 7);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

/**
 * Get a specific day of the current week
 */
export function weekday(
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday',
  time?: string
): Date {
  const dayMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
  const date = new Date();
  const currentDay = date.getDay();
  const targetDay = dayMap[day];
  const diff = targetDay - currentDay;

  date.setDate(date.getDate() + diff);

  if (time) {
    const [hours, minutes] = parseTime(time);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }

  return date;
}

function parseTime(time: string): [number, number] {
  // Handle formats: "9am", "9:30am", "14:00", "2pm"
  const lower = time.toLowerCase();

  if (lower.includes(':')) {
    const [h, rest] = lower.split(':');
    const m = parseInt(rest, 10);
    let hours = parseInt(h, 10);

    if (lower.includes('pm') && hours < 12) hours += 12;
    if (lower.includes('am') && hours === 12) hours = 0;

    return [hours, m];
  }

  let hours = parseInt(lower, 10);
  if (lower.includes('pm') && hours < 12) hours += 12;
  if (lower.includes('am') && hours === 12) hours = 0;

  return [hours, 0];
}

// ============================================================================
// EVENT GENERATORS
// ============================================================================

let eventIdCounter = 0;

/**
 * Create a test calendar event
 */
export function createTestEvent(overrides?: Partial<TestEvent>): CalendarEvent {
  const id = `test_event_${++eventIdCounter}`;
  const start = overrides?.start
    ? typeof overrides.start === 'string'
      ? new Date(overrides.start)
      : overrides.start
    : inHours(1);
  const duration = overrides?.duration ?? 60;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  return {
    id,
    title: overrides?.title ?? 'Test Meeting',
    startTime: start,
    endTime: end,
    isAllDay: overrides?.isAllDay ?? false,
    attendees: overrides?.attendees,
    location: overrides?.location,
    description: overrides?.description,
    status: 'confirmed',
    providerId: `google_${id}`,
    provider: 'google',
  };
}

/**
 * Create multiple test events for a day
 */
export function createDayEvents(
  date: Date,
  config: Array<{ start: string; duration: number; title?: string }>
): CalendarEvent[] {
  return config.map((c) => {
    const startDate = new Date(date);
    const [hours, minutes] = parseTime(c.start);
    startDate.setHours(hours, minutes, 0, 0);

    return createTestEvent({
      title: c.title ?? `Meeting at ${c.start}`,
      start: startDate,
      duration: c.duration,
    });
  });
}

// ============================================================================
// SCENARIO GENERATORS
// ============================================================================

/**
 * Create a light week scenario (15h meetings, 50%+ focus time)
 */
export function createLightWeek(): TestWeekScenario {
  const events: TestEvent[] = [];

  // Monday-Friday: 3 hours of meetings per day
  for (let day = 1; day <= 5; day++) {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + day);

    events.push(
      { title: 'Team Standup', start: setTime(date, 9, 0), duration: 30 },
      { title: '1:1', start: setTime(date, 10, 0), duration: 30 },
      { title: 'Project Sync', start: setTime(date, 14, 0), duration: 60 },
      { title: 'Planning', start: setTime(date, 16, 0), duration: 60 }
    );
  }

  return {
    name: 'Light Week',
    events,
    expectedMetrics: {
      totalMeetingHours: 15,
      focusTimeRatio: 0.55,
      backToBackPercentage: 10,
      busiestDay: 'Monday',
    },
  };
}

/**
 * Create a heavy week scenario (35h+ meetings, <20% focus time)
 */
export function createHeavyWeek(): TestWeekScenario {
  const events: TestEvent[] = [];

  // Monday-Friday: 7 hours of meetings per day
  for (let day = 1; day <= 5; day++) {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + day);

    events.push(
      { title: 'Early Standup', start: setTime(date, 8, 0), duration: 30 },
      { title: 'Planning', start: setTime(date, 8, 30), duration: 60 },
      { title: 'Review', start: setTime(date, 9, 30), duration: 60 },
      { title: 'Workshop', start: setTime(date, 10, 30), duration: 90 },
      { title: 'Lunch Meeting', start: setTime(date, 12, 0), duration: 60 },
      { title: 'Client Call', start: setTime(date, 13, 0), duration: 60 },
      { title: 'Strategy', start: setTime(date, 14, 0), duration: 60 },
      { title: 'Team Sync', start: setTime(date, 15, 0), duration: 60 },
      { title: 'Wrap Up', start: setTime(date, 16, 0), duration: 60 }
    );
  }

  return {
    name: 'Heavy Week',
    events,
    expectedMetrics: {
      totalMeetingHours: 37.5,
      focusTimeRatio: 0.15,
      backToBackPercentage: 65,
      busiestDay: 'Monday',
    },
  };
}

/**
 * Create a burnout scenario (overloaded + back-to-back)
 */
export function createBurnoutScenario(): TestWeekScenario {
  const events: TestEvent[] = [];

  // Monday-Friday: 8+ hours of back-to-back meetings
  for (let day = 1; day <= 5; day++) {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + day);

    events.push(
      { title: 'Early Call', start: setTime(date, 7, 30), duration: 60 },
      { title: 'Standup', start: setTime(date, 8, 30), duration: 30 },
      { title: 'Planning', start: setTime(date, 9, 0), duration: 60 },
      { title: 'Design Review', start: setTime(date, 10, 0), duration: 60 },
      { title: 'Architecture', start: setTime(date, 11, 0), duration: 60 },
      { title: 'Working Lunch', start: setTime(date, 12, 0), duration: 60 },
      { title: 'Client Sync', start: setTime(date, 13, 0), duration: 60 },
      { title: 'Sprint Review', start: setTime(date, 14, 0), duration: 90 },
      { title: 'Retro', start: setTime(date, 15, 30), duration: 60 },
      { title: 'Late Call', start: setTime(date, 16, 30), duration: 60 },
      { title: 'Wrap Up', start: setTime(date, 17, 30), duration: 30 }
    );
  }

  return {
    name: 'Burnout Scenario',
    events,
    expectedMetrics: {
      totalMeetingHours: 45,
      focusTimeRatio: 0.05,
      backToBackPercentage: 85,
      busiestDay: 'Wednesday',
    },
  };
}

/**
 * Create a packed day (no gaps)
 */
export function createPackedDay(date: Date = new Date()): TestEvent[] {
  return [
    { title: 'Early Meeting', start: setTime(date, 8, 0), duration: 60 },
    { title: 'Back-to-back 1', start: setTime(date, 9, 0), duration: 60 },
    { title: 'Back-to-back 2', start: setTime(date, 10, 0), duration: 60 },
    { title: 'Back-to-back 3', start: setTime(date, 11, 0), duration: 60 },
    { title: 'Lunch Meeting', start: setTime(date, 12, 0), duration: 60 },
    { title: 'Afternoon 1', start: setTime(date, 13, 0), duration: 60 },
    { title: 'Afternoon 2', start: setTime(date, 14, 0), duration: 60 },
    { title: 'Afternoon 3', start: setTime(date, 15, 0), duration: 60 },
    { title: 'Late Meeting', start: setTime(date, 16, 0), duration: 60 },
  ];
}

/**
 * Create back-to-back meeting scenarios
 */
export function createBackToBackScenario(): TestEvent[] {
  const date = new Date();
  return [
    { title: 'Meeting 1', start: setTime(date, 9, 0), duration: 60 },
    { title: 'Meeting 2', start: setTime(date, 10, 0), duration: 60 },
    { title: 'Meeting 3', start: setTime(date, 11, 0), duration: 60 },
    { title: 'Meeting 4', start: setTime(date, 12, 0), duration: 60 },
    // 1 hour break
    { title: 'Meeting 5', start: setTime(date, 14, 0), duration: 60 },
    { title: 'Meeting 6', start: setTime(date, 15, 0), duration: 60 },
    { title: 'Meeting 7', start: setTime(date, 16, 0), duration: 60 },
  ];
}

// ============================================================================
// MOCK DATA HELPERS
// ============================================================================

/**
 * Create mock DayOverview for testing
 */
export function createMockDayOverview(overrides?: Partial<DayOverview>): DayOverview {
  return {
    date: overrides?.date ?? new Date(),
    events: overrides?.events ?? [],
    totalMeetings: overrides?.totalMeetings ?? 0,
    totalMeetingMinutes: overrides?.totalMeetingMinutes ?? 0,
    freeTimeMinutes: overrides?.freeTimeMinutes ?? 480,
    isOverloaded: overrides?.isOverloaded ?? false,
    hasBackToBack: overrides?.hasBackToBack ?? false,
    firstEvent: overrides?.firstEvent ?? null,
    lastEvent: overrides?.lastEvent ?? null,
  };
}

/**
 * Create mock TimeSlot for testing
 */
export function createMockTimeSlot(overrides?: Partial<TimeSlot>): TimeSlot {
  const start = overrides?.start ?? inHours(1);
  const duration = overrides?.durationMinutes ?? 60;

  return {
    start,
    end: new Date(start.getTime() + duration * 60 * 1000),
    durationMinutes: duration,
  };
}

// ============================================================================
// ENERGY/CAPACITY TEST DATA
// ============================================================================

export interface TestEnergyReading {
  level: 'high' | 'good' | 'moderate' | 'low' | 'depleted';
  score: number;
  daysAgo: number;
}

export function createEnergyHistory(readings: TestEnergyReading[]) {
  return readings.map((r) => ({
    id: `energy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    userId: 'test_user',
    energyLevel: r.level,
    energyScore: r.score,
    timestamp: daysAgo(r.daysAgo).getTime(),
    dayOfWeek: daysAgo(r.daysAgo).getDay(),
    hourOfDay: 14,
    indicators: [],
  }));
}

export const BURNOUT_ENERGY_HISTORY: TestEnergyReading[] = [
  { level: 'depleted', score: 15, daysAgo: 0 },
  { level: 'depleted', score: 20, daysAgo: 1 },
  { level: 'low', score: 30, daysAgo: 2 },
  { level: 'low', score: 35, daysAgo: 3 },
  { level: 'moderate', score: 45, daysAgo: 4 },
  { level: 'moderate', score: 50, daysAgo: 5 },
  { level: 'good', score: 65, daysAgo: 6 },
  { level: 'good', score: 70, daysAgo: 7 },
];

export const HEALTHY_ENERGY_HISTORY: TestEnergyReading[] = [
  { level: 'good', score: 70, daysAgo: 0 },
  { level: 'high', score: 80, daysAgo: 1 },
  { level: 'good', score: 75, daysAgo: 2 },
  { level: 'good', score: 70, daysAgo: 3 },
  { level: 'moderate', score: 60, daysAgo: 4 },
  { level: 'good', score: 72, daysAgo: 5 },
  { level: 'high', score: 85, daysAgo: 6 },
  { level: 'good', score: 75, daysAgo: 7 },
];

// ============================================================================
// COMMITMENT TEST DATA
// ============================================================================

export interface TestCommitment {
  text: string;
  type: 'habit' | 'task' | 'promise';
  frequency?: { times: number; period: 'day' | 'week' | 'month' };
  duration?: number;
  preferredTime?: string;
}

export function createTestCommitment(overrides: Partial<TestCommitment>): TestCommitment {
  return {
    text: overrides.text ?? 'Test commitment',
    type: overrides.type ?? 'habit',
    frequency: overrides.frequency,
    duration: overrides.duration ?? 30,
    preferredTime: overrides.preferredTime,
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function setTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Date helpers
  inMinutes,
  inHours,
  inDays,
  daysAgo,
  tomorrow,
  today,
  thisWeek,
  nextWeek,
  weekday,

  // Event generators
  createTestEvent,
  createDayEvents,

  // Scenario generators
  createLightWeek,
  createHeavyWeek,
  createBurnoutScenario,
  createPackedDay,
  createBackToBackScenario,

  // Mock data
  createMockDayOverview,
  createMockTimeSlot,
  createEnergyHistory,
  createTestCommitment,

  // Constants
  BURNOUT_ENERGY_HISTORY,
  HEALTHY_ENERGY_HISTORY,
};
