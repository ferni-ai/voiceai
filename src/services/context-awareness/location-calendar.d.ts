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
import { generateAuthUrl, exchangeCodeForTokens } from '../identity/google-calendar-oauth.js';
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
    timeUntil?: number;
}
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
/**
 * Fetch upcoming calendar events using shared OAuth service
 */
export declare function fetchUpcomingEvents(userId: string, hoursAhead?: number): Promise<CalendarEvent[]>;
/**
 * Update user's current location
 */
export declare function updateLocation(userId: string, latitude: number, longitude: number, accuracy: number): void;
/**
 * Save a named location (home, work, etc.)
 */
export declare function saveLocation(userId: string, name: string, type: LocationType, latitude: number, longitude: number): void;
/**
 * Get travel time to an event location
 */
export declare function getTravelTime(userId: string, destinationAddress: string): Promise<TravelEvent | null>;
/**
 * Detect stress patterns from calendar history
 */
export declare function detectStressPatterns(userId: string): Promise<StressTrigger[]>;
/**
 * Generate anticipation insights for context injection
 */
export declare function generateAnticipationInsights(userId: string): Promise<AnticipationInsight[]>;
/**
 * Generate superhuman anticipation moment
 */
export declare function generateSuperhumanMoment(userId: string): string | null;
/**
 * Check if user has calendar connected (delegates to shared OAuth service)
 */
export declare function hasCalendarConnected(userId: string): Promise<boolean>;
export declare function getCurrentLocation(userId: string): Location | null;
export declare function getUpcomingEvents(userId: string): CalendarEvent[];
export declare function disconnectCalendar(userId: string): void;
declare const _default: {
    getCalendarAuthUrl: typeof generateAuthUrl;
    exchangeCalendarCode: typeof exchangeCodeForTokens;
    fetchUpcomingEvents: typeof fetchUpcomingEvents;
    updateLocation: typeof updateLocation;
    saveLocation: typeof saveLocation;
    getTravelTime: typeof getTravelTime;
    detectStressPatterns: typeof detectStressPatterns;
    generateAnticipationInsights: typeof generateAnticipationInsights;
    generateSuperhumanMoment: typeof generateSuperhumanMoment;
    hasCalendarConnected: typeof hasCalendarConnected;
    getCurrentLocation: typeof getCurrentLocation;
    getUpcomingEvents: typeof getUpcomingEvents;
    disconnectCalendar: typeof disconnectCalendar;
};
export default _default;
//# sourceMappingURL=location-calendar.d.ts.map