/**
 * Google Calendar OAuth types. Extracted from google-calendar-oauth.ts.
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
  attendees?: Array<{ email: string; displayName?: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
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
export class TokenPermanentlyInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenPermanentlyInvalidError';
  }
}
