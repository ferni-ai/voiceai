/**
 * Location & Calendar Intelligence Service
 *
 * Provides context-aware anticipation from location and calendar data.
 * "Better than Human" - know where you're going and prepare you for it.
 *
 * Superhuman Capabilities:
 * - Location awareness (home, work, travel)
 * - Upcoming event preparation
 * - Traffic-aware suggestions
 * - Historical pattern detection (Monday anxiety, Friday energy)
 *
 * @module services/context-awareness/location-calendar
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getUserTokens,
  refreshAccessToken,
  isCalendarConfigured,
  getEvents,
  generateAuthUrl,
  exchangeCodeForTokens,
  type CalendarEvent as GoogleCalendarEvent,
} from '../identity/google-calendar-oauth.js';

const log = createLogger({ module: 'LocationCalendar' });

// ============================================================================
// TYPES
// ============================================================================

export type LocationType = 'home' | 'work' | 'gym' | 'social' | 'travel' | 'unknown';

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  type: LocationType;
  name?: string;
  address?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  isRecurring: boolean;
  recurringPattern?: string;
  eventType: 'meeting' | 'appointment' | 'personal' | 'travel' | 'reminder' | 'other';
  /** Emotional weight - some events are more stressful */
  stressWeight?: number;
}

export interface TravelEvent {
  destination: string;
  departureTime: Date;
  arrivalTime: Date;
  travelTimeMinutes: number;
  trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe';
  delayMinutes: number;
  mode: 'driving' | 'transit' | 'walking' | 'cycling';
}

export interface LocationPattern {
  dayOfWeek: number;
  hourOfDay: number;
  expectedLocation: LocationType;
  confidence: number;
  historicalMood?: string;
}

export interface EventPattern {
  eventType: string;
  dayOfWeek: number;
  averageStressLevel: number;
  averageMoodAfter: string;
  occurrenceCount: number;
  lastOccurrence: Date;
}

export interface StressTrigger {
  eventPattern: string;
  dayTime: string;
  stressLevel: number;
  suggestion: string;
}

export interface AnticipationInsight {
  type: 'preparation' | 'travel' | 'pattern' | 'stress';
  event?: CalendarEvent;
  insight: string;
  suggestion?: string;
  urgency: 'low' | 'medium' | 'high';
  timeUntil?: number; // minutes
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  maps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  },
};

// ============================================================================
// STATE - Location and context only (OAuth handled by google-calendar-oauth.ts)
// ============================================================================

interface UserContextState {
  userId: string;
  currentLocation: Location | null;
  savedLocations: Map<string, Location>; // home, work, etc.
  upcomingEvents: CalendarEvent[];
  locationPatterns: LocationPattern[];
  eventPatterns: EventPattern[];
  stressTriggers: StressTrigger[];
  lastSync: Date;
}

const userStates = new Map<string, UserContextState>();

/**
 * Get or create context state for a user
 */
function getOrCreateState(userId: string): UserContextState {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      userId,
      currentLocation: null,
      savedLocations: new Map(),
      upcomingEvents: [],
      locationPatterns: [],
      eventPatterns: [],
      stressTriggers: [],
      lastSync: new Date(0),
    };
    userStates.set(userId, state);
  }
  return state;
}

// ============================================================================
// OAUTH - Delegated to google-calendar-oauth.ts
// ============================================================================

/**
 * Get Google Calendar OAuth authorization URL
 * @deprecated Use generateAuthUrl() from google-calendar-oauth.ts instead
 */
export { generateAuthUrl as getCalendarAuthUrl } from '../identity/google-calendar-oauth.js';

/**
 * Exchange authorization code for tokens
 * @deprecated Use exchangeCodeForTokens() from google-calendar-oauth.ts instead
 */
export { exchangeCodeForTokens as exchangeCalendarCode } from '../identity/google-calendar-oauth.js';

// Re-import for default export
const getCalendarAuthUrl = generateAuthUrl;
const exchangeCalendarCode = exchangeCodeForTokens;

/**
 * Get a valid access token for calendar API calls
 */
async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await getUserTokens(userId);
  if (!tokens) return null;

  // Check if token needs refresh
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    if (!tokens.refresh_token) return null;
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      return refreshed?.access_token || null;
    } catch (error) {
      log.debug({ error, userId }, 'Failed to refresh calendar token');
      return null;
    }
  }

  return tokens.access_token;
}

// ============================================================================
// CALENDAR DATA
// ============================================================================

/**
 * Fetch upcoming calendar events using shared OAuth service
 */
export async function fetchUpcomingEvents(
  userId: string,
  hoursAhead = 24
): Promise<CalendarEvent[]> {
  // Check if calendar is connected via shared OAuth service
  if (!(await isCalendarConfigured(userId))) {
    log.debug({ userId }, 'Calendar not configured');
    return [];
  }

  // Get valid access token
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    log.debug({ userId }, 'No valid calendar token');
    return [];
  }

  try {
    const now = new Date();
    const later = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Use the shared getEvents function from google-calendar-oauth
    const googleEvents = await getEvents(accessToken, 'primary', now, later);

    // Transform to our CalendarEvent type with stress analysis
    const events: CalendarEvent[] = googleEvents.map((item) => ({
      id: item.id || crypto.randomUUID(),
      title: item.summary,
      description: item.description,
      startTime: new Date(item.start.dateTime || item.start.date || now.toISOString()),
      endTime: new Date(item.end.dateTime || item.end.date || now.toISOString()),
      location: item.location,
      attendees: item.attendees?.map((a) => a.displayName || a.email),
      isRecurring: false, // getEvents returns singleEvents, so all are false
      eventType: classifyEventType(item.summary, item.description),
      stressWeight: estimateStressWeight(item.summary, item.attendees?.length || 0),
    }));

    // Update local state cache
    const state = getOrCreateState(userId);
    state.upcomingEvents = events;
    state.lastSync = new Date();

    log.debug({ userId, eventCount: events.length }, 'Calendar events fetched');
    return events;
  } catch (error) {
    log.error({ error: String(error) }, 'Calendar fetch error');
    return [];
  }
}

function classifyEventType(title: string, description?: string): CalendarEvent['eventType'] {
  const text = `${title} ${description || ''}`.toLowerCase();

  if (/meet|call|sync|standup|review|interview/.test(text)) return 'meeting';
  if (/doctor|dentist|appointment|therapy|haircut/.test(text)) return 'appointment';
  if (/flight|hotel|travel|trip|vacation/.test(text)) return 'travel';
  if (/remind|todo|task/.test(text)) return 'reminder';
  if (/birthday|dinner|party|date|gym|workout/.test(text)) return 'personal';

  return 'other';
}

function estimateStressWeight(title: string, attendeeCount: number): number {
  let weight = 0;

  // Keywords that increase stress
  if (/interview|presentation|review|deadline|urgent/.test(title.toLowerCase())) {
    weight += 0.3;
  }

  // More attendees = potentially more stressful
  if (attendeeCount > 5) weight += 0.2;
  if (attendeeCount > 10) weight += 0.1;

  // Keywords that decrease stress
  if (/lunch|coffee|1:1|one on one|catch up/.test(title.toLowerCase())) {
    weight -= 0.2;
  }

  return Math.max(0, Math.min(1, weight + 0.3)); // Base 0.3
}

// ============================================================================
// LOCATION DATA
// ============================================================================

/**
 * Update user's current location
 */
export function updateLocation(
  userId: string,
  latitude: number,
  longitude: number,
  accuracy: number
): void {
  const state = getOrCreateState(userId);
  const locationType = classifyLocation(userId, latitude, longitude);

  state.currentLocation = {
    latitude,
    longitude,
    accuracy,
    timestamp: new Date(),
    type: locationType,
  };

  log.debug({ userId, type: locationType }, 'Location updated');
}

/**
 * Classify location based on saved places
 */
function classifyLocation(userId: string, lat: number, lng: number): LocationType {
  const state = userStates.get(userId);
  if (!state) return 'unknown';

  // Check against saved locations
  for (const [name, loc] of state.savedLocations) {
    const distance = haversineDistance(lat, lng, loc.latitude, loc.longitude);
    if (distance < 0.1) {
      // Within 100 meters
      return loc.type;
    }
  }

  return 'unknown';
}

/**
 * Save a named location (home, work, etc.)
 */
export function saveLocation(
  userId: string,
  name: string,
  type: LocationType,
  latitude: number,
  longitude: number
): void {
  const state = getOrCreateState(userId);

  state.savedLocations.set(name, {
    latitude,
    longitude,
    accuracy: 0,
    timestamp: new Date(),
    type,
    name,
  });

  log.info({ userId, name, type }, 'Location saved');
}

/**
 * Haversine distance between two points in km
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// TRAVEL TIME
// ============================================================================

/**
 * Get travel time to an event location
 */
export async function getTravelTime(
  userId: string,
  destinationAddress: string
): Promise<TravelEvent | null> {
  const state = userStates.get(userId);
  if (!state?.currentLocation || !config.maps.apiKey) return null;

  try {
    const origin = `${state.currentLocation.latitude},${state.currentLocation.longitude}`;
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?` +
        `origin=${encodeURIComponent(origin)}&` +
        `destination=${encodeURIComponent(destinationAddress)}&` +
        `departure_time=now&` +
        `key=${config.maps.apiKey}`
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      routes: Array<{
        legs: Array<{
          duration: { value: number };
          duration_in_traffic?: { value: number };
        }>;
      }>;
    };

    const leg = data.routes[0]?.legs[0];
    if (!leg) return null;

    const normalTime = leg.duration.value / 60;
    const trafficTime = (leg.duration_in_traffic?.value || leg.duration.value) / 60;
    const delay = trafficTime - normalTime;

    return {
      destination: destinationAddress,
      departureTime: new Date(),
      arrivalTime: new Date(Date.now() + trafficTime * 60 * 1000),
      travelTimeMinutes: Math.round(trafficTime),
      trafficCondition:
        delay > 20 ? 'severe' : delay > 10 ? 'heavy' : delay > 5 ? 'moderate' : 'light',
      delayMinutes: Math.round(delay),
      mode: 'driving',
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Travel time fetch failed');
    return null;
  }
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect stress patterns from calendar history
 */
export async function detectStressPatterns(userId: string): Promise<StressTrigger[]> {
  const state = userStates.get(userId);
  if (!state) return [];

  const triggers: StressTrigger[] = [];

  // Analyze event patterns
  for (const pattern of state.eventPatterns) {
    if (pattern.averageStressLevel > 0.6) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][pattern.dayOfWeek];
      triggers.push({
        eventPattern: pattern.eventType,
        dayTime: dayName,
        stressLevel: pattern.averageStressLevel,
        suggestion: `${pattern.eventType} events on ${dayName}s tend to be stressful. Want to prepare?`,
      });
    }
  }

  state.stressTriggers = triggers;
  return triggers;
}

// ============================================================================
// ANTICIPATION INSIGHTS
// ============================================================================

/**
 * Generate anticipation insights for context injection
 */
export async function generateAnticipationInsights(userId: string): Promise<AnticipationInsight[]> {
  const state = userStates.get(userId);
  if (!state) return [];

  const insights: AnticipationInsight[] = [];
  const now = new Date();

  // Check upcoming events
  for (const event of state.upcomingEvents) {
    const minutesUntil = (event.startTime.getTime() - now.getTime()) / (1000 * 60);

    // Event in next 30 minutes with location - offer travel check
    if (minutesUntil > 0 && minutesUntil <= 30 && event.location) {
      const travel = await getTravelTime(userId, event.location);
      if (travel && travel.delayMinutes > 10) {
        insights.push({
          type: 'travel',
          event,
          insight: `Traffic is ${travel.trafficCondition} - you might be ${travel.delayMinutes} minutes late to ${event.title}`,
          suggestion: 'Should I help you reschedule or send a heads up?',
          urgency: 'high',
          timeUntil: minutesUntil,
        });
      }
    }

    // Stressful event coming up - offer preparation
    if (minutesUntil > 30 && minutesUntil <= 120 && (event.stressWeight || 0) > 0.5) {
      insights.push({
        type: 'preparation',
        event,
        insight: `You have "${event.title}" in ${Math.round(minutesUntil)} minutes`,
        suggestion: 'Want to rehearse or do a quick grounding exercise before?',
        urgency: 'medium',
        timeUntil: minutesUntil,
      });
    }
  }

  // Check location patterns for stress
  const dayOfWeek = now.getDay();
  const hourOfDay = now.getHours();

  for (const trigger of state.stressTriggers) {
    const [triggerDay] = trigger.dayTime.split(' ');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dayNames[dayOfWeek] === triggerDay) {
      insights.push({
        type: 'pattern',
        insight: trigger.suggestion,
        urgency: trigger.stressLevel > 0.7 ? 'high' : 'medium',
      });
    }
  }

  return insights;
}

// ============================================================================
// SUPERHUMAN MOMENTS
// ============================================================================

/**
 * Generate superhuman anticipation moment
 */
export function generateSuperhumanMoment(userId: string): string | null {
  const state = userStates.get(userId);
  if (!state) return null;

  const moments: string[] = [];
  const now = new Date();

  // Upcoming stressful event
  for (const event of state.upcomingEvents) {
    const minutesUntil = (event.startTime.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntil > 0 && minutesUntil <= 60 && (event.stressWeight || 0) > 0.5) {
      moments.push(
        `You're heading to ${event.title} in ${Math.round(minutesUntil)} mins - want to rehearse that boundary conversation?`
      );
    }
  }

  // Extra time due to cancelled event
  const cancelledTime = state.upcomingEvents.find((e) =>
    e.title.toLowerCase().includes('cancelled')
  );
  if (cancelledTime) {
    moments.push(`Looks like you have some unexpected free time - grounding exercise?`);
  }

  // Pattern-based insight
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 1) {
    // Monday
    moments.push(
      `It's Monday - you sometimes seem stressed at the start of the week. How are you feeling?`
    );
  } else if (dayOfWeek === 5 && now.getHours() >= 16) {
    // Friday afternoon
    moments.push(
      `It's Friday afternoon - how was your week? Anything you want to process before the weekend?`
    );
  }

  return moments.length > 0 ? moments[Math.floor(Math.random() * moments.length)] : null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if user has calendar connected (delegates to shared OAuth service)
 */
export async function hasCalendarConnected(userId: string): Promise<boolean> {
  return isCalendarConfigured(userId);
}

export function getCurrentLocation(userId: string): Location | null {
  return userStates.get(userId)?.currentLocation ?? null;
}

export function getUpcomingEvents(userId: string): CalendarEvent[] {
  return userStates.get(userId)?.upcomingEvents ?? [];
}

export function disconnectCalendar(userId: string): void {
  userStates.delete(userId);
  log.info({ userId }, 'Calendar disconnected');
}

export default {
  getCalendarAuthUrl,
  exchangeCalendarCode,
  fetchUpcomingEvents,
  updateLocation,
  saveLocation,
  getTravelTime,
  detectStressPatterns,
  generateAnticipationInsights,
  generateSuperhumanMoment,
  hasCalendarConnected,
  getCurrentLocation,
  getUpcomingEvents,
  disconnectCalendar,
};
