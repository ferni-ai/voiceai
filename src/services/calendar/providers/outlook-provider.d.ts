/**
 * Outlook Calendar Provider
 *
 * Adapter for Microsoft Outlook/Office 365 Calendar via Microsoft Graph API.
 *
 * Implementation:
 * - Uses Microsoft Graph API (v1.0)
 * - OAuth 2.0 with Azure AD / Microsoft Entra ID
 * - Supports both personal Microsoft accounts and work/school accounts
 * - Rich feature set including Teams meetings
 *
 * Setup:
 * 1. Register app in Azure portal (portal.azure.com)
 * 2. Configure OAuth redirect URIs
 * 3. Grant Calendars.ReadWrite and User.Read permissions
 * 4. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars
 *
 * @module calendar/providers/outlook-provider
 */
import type { CalendarProviderAdapter, CalendarEvent, CalendarProvider } from '../types.js';
/**
 * Outlook Calendar Provider Adapter (Microsoft Graph)
 */
export declare class OutlookCalendarProvider implements CalendarProviderAdapter {
    readonly provider: CalendarProvider;
    /**
     * Check if Microsoft OAuth is configured
     */
    isConfigured(): boolean;
    /**
     * Check if user has connected their Microsoft account
     */
    isConnected(userId: string): Promise<boolean>;
    /**
     * Get Microsoft OAuth authorization URL
     */
    getAuthUrl(userId: string, redirectUri: string): string;
    /**
     * Handle Microsoft OAuth callback
     */
    handleAuthCallback(userId: string, code: string, redirectUri?: string): Promise<boolean>;
    /**
     * Disconnect user's Microsoft account
     */
    disconnect(userId: string): Promise<void>;
    /**
     * Fetch events from Outlook Calendar
     */
    fetchEvents(userId: string, startDate: Date, endDate: Date, calendarId?: string): Promise<CalendarEvent[]>;
    /**
     * Create event in Outlook Calendar
     */
    createEvent(userId: string, event: CalendarEvent): Promise<string | null>;
    /**
     * Update event in Outlook Calendar
     */
    updateEvent(userId: string, event: CalendarEvent): Promise<boolean>;
    /**
     * Delete event from Outlook Calendar
     */
    deleteEvent(userId: string, eventId: string, _calendarId?: string): Promise<boolean>;
    /**
     * Get user's Outlook calendars
     */
    getCalendars(userId: string): Promise<Array<{
        id: string;
        name: string;
        primary: boolean;
    }>>;
    /**
     * Create a Teams meeting link for an event
     */
    createTeamsMeeting(userId: string, eventId: string): Promise<string | null>;
    /**
     * Get free/busy information
     */
    getFreeBusy(userId: string, attendees: string[], startDate: Date, endDate: Date): Promise<Array<{
        email: string;
        busy: Array<{
            start: Date;
            end: Date;
        }>;
    }>>;
    private getTokens;
    private storeTokens;
    private deleteTokens;
    private graphToCalendarEvent;
    private calendarEventToGraph;
}
export declare const outlookCalendarProvider: OutlookCalendarProvider;
export default OutlookCalendarProvider;
//# sourceMappingURL=outlook-provider.d.ts.map