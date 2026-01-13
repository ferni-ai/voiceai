/**
 * Google Calendar Provider
 *
 * Adapter for Google Calendar API integration.
 * Wraps the existing google-calendar-oauth.ts service.
 *
 * @module calendar/providers/google-provider
 */
import type { CalendarProviderAdapter, CalendarEvent, CalendarProvider } from '../types.js';
/**
 * Google Calendar Provider Adapter
 */
export declare class GoogleCalendarProvider implements CalendarProviderAdapter {
    readonly provider: CalendarProvider;
    /**
     * Check if Google Calendar is configured (has OAuth credentials)
     */
    isConfigured(): boolean;
    /**
     * Check if user has connected their Google account
     */
    isConnected(userId: string): Promise<boolean>;
    /**
     * Get Google OAuth authorization URL
     */
    getAuthUrl(userId: string, redirectUri: string): string;
    /**
     * Handle OAuth callback (delegated to google-calendar-oauth.ts)
     */
    handleAuthCallback(userId: string, code: string): Promise<boolean>;
    /**
     * Disconnect user's Google Calendar
     */
    disconnect(userId: string): Promise<void>;
    /**
     * Fetch events from Google Calendar
     */
    fetchEvents(userId: string, startDate: Date, endDate: Date, calendarId?: string): Promise<CalendarEvent[]>;
    /**
     * Create event in Google Calendar
     */
    createEvent(userId: string, event: CalendarEvent): Promise<string | null>;
    /**
     * Update event in Google Calendar
     */
    updateEvent(userId: string, event: CalendarEvent): Promise<boolean>;
    /**
     * Delete event from Google Calendar
     */
    deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<boolean>;
    /**
     * Get list of user's calendars
     */
    getCalendars(userId: string): Promise<Array<{
        id: string;
        name: string;
        primary: boolean;
    }>>;
}
export declare const googleCalendarProvider: GoogleCalendarProvider;
export default GoogleCalendarProvider;
//# sourceMappingURL=google-provider.d.ts.map