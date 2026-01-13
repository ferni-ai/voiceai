/**
 * Apple Calendar Provider
 *
 * Adapter for Apple Calendar (iCloud) via CalDAV protocol.
 *
 * Implementation:
 * - Uses CalDAV protocol for calendar access
 * - Requires app-specific password from appleid.apple.com
 * - CalDAV endpoint: caldav.icloud.com
 * - Uses tsdav library for CalDAV operations
 * - Uses ical.js for iCal parsing
 *
 * Setup Instructions for Users:
 * 1. Go to appleid.apple.com
 * 2. Sign in and go to "App-Specific Passwords"
 * 3. Generate a new password for "Ferni Calendar"
 * 4. Enter Apple ID email and app-specific password in Ferni
 *
 * @module calendar/providers/apple-provider
 */
import type { CalendarProviderAdapter, CalendarEvent, CalendarProvider } from '../types.js';
/**
 * Apple Calendar Provider Adapter (CalDAV)
 */
export declare class AppleCalendarProvider implements CalendarProviderAdapter {
    readonly provider: CalendarProvider;
    /**
     * Apple CalDAV doesn't require app-level OAuth
     * Each user provides their own app-specific password
     */
    isConfigured(): boolean;
    /**
     * Check if user has stored Apple credentials
     */
    isConnected(userId: string): Promise<boolean>;
    /**
     * Return URL to Apple ID page for app-specific password
     */
    getAuthUrl(_userId: string, _redirectUri: string): string;
    /**
     * Not used for Apple - credentials stored directly
     */
    handleAuthCallback(_userId: string, _code: string): Promise<boolean>;
    /**
     * Disconnect by removing stored credentials
     */
    disconnect(userId: string): Promise<void>;
    /**
     * Fetch events from Apple Calendar
     */
    fetchEvents(userId: string, startDate: Date, endDate: Date, calendarUrl?: string): Promise<CalendarEvent[]>;
    /**
     * Create event in Apple Calendar
     */
    createEvent(userId: string, event: CalendarEvent): Promise<string | null>;
    /**
     * Update event in Apple Calendar
     */
    updateEvent(userId: string, event: CalendarEvent): Promise<boolean>;
    /**
     * Delete event from Apple Calendar
     */
    deleteEvent(userId: string, eventId: string, calendarUrl?: string): Promise<boolean>;
    /**
     * Get user's Apple calendars
     */
    getCalendars(userId: string): Promise<Array<{
        id: string;
        name: string;
        primary: boolean;
    }>>;
    /**
     * Store Apple credentials for a user
     * Password is encrypted before storage using AES-256-GCM
     */
    storeCredentials(userId: string, appleId: string, appSpecificPassword: string): Promise<boolean>;
    /**
     * Validate Apple credentials by attempting to connect
     */
    validateCredentials(appleId: string, appSpecificPassword: string): Promise<boolean>;
    private getCredentials;
    private updateCredentials;
    private deleteCredentials;
    private icalToCalendarEvent;
    private calendarEventToICal;
    private parseTrigger;
}
export declare const appleCalendarProvider: AppleCalendarProvider;
export default AppleCalendarProvider;
//# sourceMappingURL=apple-provider.d.ts.map