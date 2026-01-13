/**
 * Google Calendar OAuth Service
 *
 * Handles OAuth 2.0 authentication flow for Google Calendar:
 * - Generate authorization URL
 * - Exchange code for tokens
 * - Refresh access tokens
 * - Calendar CRUD operations
 *
 * Supports both:
 * - User OAuth flow (for personal calendars)
 * - Service Account (for shared/team calendars)
 */
export interface GoogleTokens {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
    expiry_date?: number;
}
export interface CalendarEvent {
    id?: string;
    summary: string;
    description?: string;
    location?: string;
    start: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    attendees?: Array<{
        email: string;
        displayName?: string;
    }>;
    reminders?: {
        useDefault: boolean;
        overrides?: Array<{
            method: 'email' | 'popup';
            minutes: number;
        }>;
    };
    colorId?: string;
    status?: 'confirmed' | 'tentative' | 'cancelled';
}
export interface CalendarListEntry {
    id: string;
    summary: string;
    primary?: boolean;
    accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
}
/**
 * Error thrown when an OAuth token is permanently invalid (e.g., user revoked access).
 * These errors should NOT be retried - the user needs to re-authenticate.
 */
export declare class TokenPermanentlyInvalidError extends Error {
    constructor(message: string);
}
/**
 * Check if a user's token recently failed with a permanent error
 */
export declare function isTokenPermanentlyFailed(userId: string): boolean;
/**
 * Mark a token as permanently failed (e.g., invalid_grant)
 */
export declare function markTokenAsFailed(userId: string): void;
/**
 * Clear the failed token status for a user (e.g., after successful re-auth)
 */
export declare function clearFailedTokenStatus(userId: string): void;
/**
 * Store tokens for a user
 */
export declare function storeUserTokens(userId: string, tokens: GoogleTokens): Promise<void>;
/**
 * Get tokens for a user
 */
export declare function getUserTokens(userId: string): Promise<GoogleTokens | undefined>;
/**
 * Get tokens synchronously (returns cached value only)
 * Use getUserTokens for guaranteed data
 */
export declare function getUserTokensSync(userId: string): GoogleTokens | undefined;
/**
 * Check if tokens are expired
 */
export declare function areTokensExpired(tokens: GoogleTokens): boolean;
/**
 * Generate OAuth authorization URL
 */
export declare function generateAuthUrl(state?: string): string;
/**
 * Exchange authorization code for tokens
 */
export declare function exchangeCodeForTokens(code: string): Promise<GoogleTokens>;
/**
 * Refresh access token using refresh token
 */
export declare function refreshAccessToken(refreshToken: string): Promise<GoogleTokens>;
/**
 * Get valid access token for a user (refreshes if needed)
 */
export declare function getValidAccessToken(userId: string): Promise<string | null>;
/**
 * List user's calendars (with rate limiting and circuit breaker protection)
 */
export declare function listCalendars(accessToken: string): Promise<CalendarListEntry[]>;
/**
 * Create a calendar event (with rate limiting and circuit breaker protection)
 */
export declare function createEvent(accessToken: string, calendarId: string, event: CalendarEvent): Promise<CalendarEvent>;
/**
 * Update a calendar event (with rate limiting)
 */
export declare function updateEvent(accessToken: string, calendarId: string, eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent>;
/**
 * Delete a calendar event (with rate limiting)
 */
export declare function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
/**
 * Get events in a time range (with rate limiting)
 */
export declare function getEvents(accessToken: string, calendarId: string, timeMin: Date, timeMax: Date, maxResults?: number): Promise<CalendarEvent[]>;
/**
 * Find free/busy times
 */
export declare function getFreeBusy(accessToken: string, calendarIds: string[], timeMin: Date, timeMax: Date): Promise<Record<string, Array<{
    start: string;
    end: string;
}>>>;
/**
 * Create an appointment event with reminders
 */
export declare function createAppointmentEvent(userId: string, options: {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    durationMinutes?: number;
    calendarId?: string;
    reminders?: Array<{
        method: 'email' | 'popup';
        minutes: number;
    }>;
}): Promise<CalendarEvent | null>;
/**
 * Check if calendar is configured for a user
 */
export declare function isCalendarConfigured(userId: string): Promise<boolean>;
/**
 * Check if calendar is configured (sync version, may return false until loaded)
 */
export declare function isCalendarConfiguredSync(userId: string): boolean;
/**
 * Check if OAuth is configured (for the application)
 */
export declare function isOAuthConfigured(): boolean;
/**
 * Delete user tokens (for disconnect)
 */
export declare function deleteUserTokens(userId: string): Promise<void>;
/**
 * Get all users with connected Google Calendar
 *
 * Used by maintenance scheduler to sync calendar events for outreach timing.
 */
export declare function getAllCalendarUsers(): Promise<string[]>;
/**
 * Get access token using service account credentials
 */
export declare function getServiceAccountToken(credentials: {
    client_email: string;
    private_key: string;
}): Promise<string | null>;
declare const _default: {
    generateAuthUrl: typeof generateAuthUrl;
    exchangeCodeForTokens: typeof exchangeCodeForTokens;
    refreshAccessToken: typeof refreshAccessToken;
    getValidAccessToken: typeof getValidAccessToken;
    storeUserTokens: typeof storeUserTokens;
    getUserTokens: typeof getUserTokens;
    deleteUserTokens: typeof deleteUserTokens;
    getAllCalendarUsers: typeof getAllCalendarUsers;
    listCalendars: typeof listCalendars;
    createEvent: typeof createEvent;
    updateEvent: typeof updateEvent;
    deleteEvent: typeof deleteEvent;
    getEvents: typeof getEvents;
    getFreeBusy: typeof getFreeBusy;
    createAppointmentEvent: typeof createAppointmentEvent;
    isCalendarConfigured: typeof isCalendarConfigured;
    isOAuthConfigured: typeof isOAuthConfigured;
    getServiceAccountToken: typeof getServiceAccountToken;
    isTokenPermanentlyFailed: typeof isTokenPermanentlyFailed;
    markTokenAsFailed: typeof markTokenAsFailed;
    clearFailedTokenStatus: typeof clearFailedTokenStatus;
    TokenPermanentlyInvalidError: typeof TokenPermanentlyInvalidError;
};
export default _default;
//# sourceMappingURL=google-calendar-oauth.d.ts.map