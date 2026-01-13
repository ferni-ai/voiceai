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
import { getLogger } from '../../../utils/safe-logger.js';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption.js';
const log = getLogger();
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
            databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        });
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available for Apple Calendar');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// CALDAV CLIENT
// ============================================================================
/**
 * Simple CalDAV client for Apple iCloud
 * Uses fetch API for HTTP requests
 */
class AppleCalDAVClient {
    baseUrl = 'https://caldav.icloud.com';
    credentials;
    constructor(credentials) {
        this.credentials = credentials;
    }
    getAuthHeader() {
        const encoded = Buffer.from(`${this.credentials.appleId}:${this.credentials.appSpecificPassword}`).toString('base64');
        return `Basic ${encoded}`;
    }
    async request(method, url, body, depth) {
        const headers = {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/xml; charset=utf-8',
        };
        if (depth !== undefined) {
            headers['Depth'] = String(depth);
        }
        const response = await fetch(url, {
            method,
            headers,
            body,
        });
        return response;
    }
    /**
     * Discover the user's principal URL
     */
    async discoverPrincipal() {
        const body = `<?xml version="1.0" encoding="utf-8"?>
      <d:propfind xmlns:d="DAV:">
        <d:prop>
          <d:current-user-principal/>
        </d:prop>
      </d:propfind>`;
        try {
            const response = await this.request('PROPFIND', this.baseUrl, body, 0);
            if (!response.ok) {
                log.error({ status: response.status }, 'Failed to discover principal');
                return null;
            }
            const text = await response.text();
            // Parse XML to find current-user-principal href
            const match = text.match(/<d:current-user-principal>.*?<d:href>([^<]+)<\/d:href>/s);
            if (match) {
                return match[1].startsWith('http') ? match[1] : `${this.baseUrl}${match[1]}`;
            }
            return null;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error discovering principal');
            return null;
        }
    }
    /**
     * Get calendar home URL from principal
     */
    async getCalendarHome(principalUrl) {
        const body = `<?xml version="1.0" encoding="utf-8"?>
      <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <c:calendar-home-set/>
        </d:prop>
      </d:propfind>`;
        try {
            const response = await this.request('PROPFIND', principalUrl, body, 0);
            if (!response.ok) {
                return null;
            }
            const text = await response.text();
            const match = text.match(/<c:calendar-home-set>.*?<d:href>([^<]+)<\/d:href>/s);
            if (match) {
                return match[1].startsWith('http') ? match[1] : `${this.baseUrl}${match[1]}`;
            }
            return null;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error getting calendar home');
            return null;
        }
    }
    /**
     * List all calendars
     */
    async listCalendars(calendarHomeUrl) {
        const body = `<?xml version="1.0" encoding="utf-8"?>
      <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
        <d:prop>
          <d:displayname/>
          <d:resourcetype/>
          <cs:getctag/>
        </d:prop>
      </d:propfind>`;
        try {
            const response = await this.request('PROPFIND', calendarHomeUrl, body, 1);
            if (!response.ok) {
                return [];
            }
            const text = await response.text();
            const calendars = [];
            // Parse multi-status response
            const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/g;
            let match;
            while ((match = responseRegex.exec(text)) !== null) {
                const responseBlock = match[1];
                // Check if it's a calendar (has calendar resourcetype)
                if (!responseBlock.includes('<c:calendar/>'))
                    continue;
                const hrefMatch = responseBlock.match(/<d:href>([^<]+)<\/d:href>/);
                const displayNameMatch = responseBlock.match(/<d:displayname>([^<]*)<\/d:displayname>/);
                const ctagMatch = responseBlock.match(/<cs:getctag>([^<]*)<\/cs:getctag>/);
                if (hrefMatch) {
                    const url = hrefMatch[1].startsWith('http')
                        ? hrefMatch[1]
                        : `${this.baseUrl}${hrefMatch[1]}`;
                    calendars.push({
                        url,
                        displayName: displayNameMatch?.[1] || 'Calendar',
                        ctag: ctagMatch?.[1],
                    });
                }
            }
            return calendars;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error listing calendars');
            return [];
        }
    }
    /**
     * Get events from a calendar within a time range
     */
    async getEvents(calendarUrl, startDate, endDate) {
        const startStr = startDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const endStr = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const body = `<?xml version="1.0" encoding="utf-8"?>
      <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <d:getetag/>
          <c:calendar-data/>
        </d:prop>
        <c:filter>
          <c:comp-filter name="VCALENDAR">
            <c:comp-filter name="VEVENT">
              <c:time-range start="${startStr}" end="${endStr}"/>
            </c:comp-filter>
          </c:comp-filter>
        </c:filter>
      </c:calendar-query>`;
        try {
            const response = await this.request('REPORT', calendarUrl, body, 1);
            if (!response.ok) {
                log.error({ status: response.status }, 'Failed to get events');
                return [];
            }
            const text = await response.text();
            const events = [];
            // Parse calendar-data from response
            const calDataRegex = /<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/g;
            let match;
            while ((match = calDataRegex.exec(text)) !== null) {
                const icalData = this.decodeXmlEntities(match[1]);
                const parsed = this.parseICalEvent(icalData);
                if (parsed) {
                    events.push(parsed);
                }
            }
            return events;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error getting events');
            return [];
        }
    }
    /**
     * Create an event in a calendar
     */
    async createEvent(calendarUrl, event) {
        const uid = event.uid || `${Date.now()}-${Math.random().toString(36).substring(2)}@ferni.ai`;
        const icalData = this.eventToICal(event, uid);
        const eventUrl = `${calendarUrl}${uid}.ics`;
        try {
            const response = await this.request('PUT', eventUrl, icalData);
            if (response.ok || response.status === 201) {
                return uid;
            }
            log.error({ status: response.status }, 'Failed to create event');
            return null;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error creating event');
            return null;
        }
    }
    /**
     * Update an event
     */
    async updateEvent(calendarUrl, uid, event) {
        const icalData = this.eventToICal(event, uid);
        const eventUrl = `${calendarUrl}${uid}.ics`;
        try {
            const response = await this.request('PUT', eventUrl, icalData);
            return response.ok;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error updating event');
            return false;
        }
    }
    /**
     * Delete an event
     */
    async deleteEvent(calendarUrl, uid) {
        const eventUrl = `${calendarUrl}${uid}.ics`;
        try {
            const response = await this.request('DELETE', eventUrl);
            return response.ok || response.status === 204;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error deleting event');
            return false;
        }
    }
    // ============================================================================
    // ICAL PARSING HELPERS
    // ============================================================================
    decodeXmlEntities(str) {
        return str
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }
    parseICalEvent(icalData) {
        try {
            // Simple iCal parser
            const lines = icalData.split(/\r?\n/);
            const event = { uid: '' };
            let inEvent = false;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                // Handle line folding (continuation lines start with space or tab)
                while (i + 1 < lines.length &&
                    (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
                    line += lines[++i].substring(1);
                }
                if (line === 'BEGIN:VEVENT') {
                    inEvent = true;
                    continue;
                }
                if (line === 'END:VEVENT') {
                    break;
                }
                if (!inEvent)
                    continue;
                const colonIndex = line.indexOf(':');
                if (colonIndex === -1)
                    continue;
                const keyPart = line.substring(0, colonIndex);
                const value = line.substring(colonIndex + 1);
                const key = keyPart.split(';')[0]; // Remove parameters
                switch (key) {
                    case 'UID':
                        event.uid = value;
                        break;
                    case 'SUMMARY':
                        event.summary = value;
                        break;
                    case 'DESCRIPTION':
                        event.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
                        break;
                    case 'LOCATION':
                        event.location = value.replace(/\\,/g, ',');
                        break;
                    case 'DTSTART':
                        event.dtstart = this.parseICalDate(value, keyPart);
                        break;
                    case 'DTEND':
                        event.dtend = this.parseICalDate(value, keyPart);
                        break;
                    case 'STATUS':
                        event.status = value.toLowerCase();
                        break;
                    case 'RRULE':
                        event.rrule = value;
                        break;
                }
            }
            return event.uid ? event : null;
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error parsing iCal event');
            return null;
        }
    }
    parseICalDate(value, keyPart) {
        // Check if it's a date-only value (all-day event)
        const isDateOnly = keyPart.includes('VALUE=DATE') || value.length === 8;
        if (isDateOnly) {
            // YYYYMMDD format
            const year = parseInt(value.substring(0, 4), 10);
            const month = parseInt(value.substring(4, 6), 10) - 1;
            const day = parseInt(value.substring(6, 8), 10);
            return new Date(year, month, day);
        }
        // YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ format
        const year = parseInt(value.substring(0, 4), 10);
        const month = parseInt(value.substring(4, 6), 10) - 1;
        const day = parseInt(value.substring(6, 8), 10);
        const hour = parseInt(value.substring(9, 11), 10);
        const minute = parseInt(value.substring(11, 13), 10);
        const second = parseInt(value.substring(13, 15), 10) || 0;
        if (value.endsWith('Z')) {
            return new Date(Date.UTC(year, month, day, hour, minute, second));
        }
        return new Date(year, month, day, hour, minute, second);
    }
    eventToICal(event, uid) {
        const now = new Date();
        const dtstamp = this.formatICalDate(now);
        let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Ferni//Calendar//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
`;
        if (event.summary) {
            ical += `SUMMARY:${event.summary}\n`;
        }
        if (event.description) {
            ical += `DESCRIPTION:${event.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}\n`;
        }
        if (event.location) {
            ical += `LOCATION:${event.location.replace(/,/g, '\\,')}\n`;
        }
        if (event.dtstart) {
            const start = event.dtstart instanceof Date ? event.dtstart : new Date(event.dtstart);
            ical += `DTSTART:${this.formatICalDate(start)}\n`;
        }
        if (event.dtend) {
            const end = event.dtend instanceof Date ? event.dtend : new Date(event.dtend);
            ical += `DTEND:${this.formatICalDate(end)}\n`;
        }
        if (event.status) {
            ical += `STATUS:${event.status.toUpperCase()}\n`;
        }
        if (event.rrule) {
            ical += `RRULE:${event.rrule}\n`;
        }
        ical += `END:VEVENT
END:VCALENDAR`;
        return ical;
    }
    formatICalDate(date) {
        return date
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '');
    }
}
// ============================================================================
// APPLE CALENDAR PROVIDER
// ============================================================================
/**
 * Apple Calendar Provider Adapter (CalDAV)
 */
export class AppleCalendarProvider {
    provider = 'apple';
    /**
     * Apple CalDAV doesn't require app-level OAuth
     * Each user provides their own app-specific password
     */
    isConfigured() {
        return true;
    }
    /**
     * Check if user has stored Apple credentials
     */
    async isConnected(userId) {
        const creds = await this.getCredentials(userId);
        return !!(creds?.appleId && creds?.appSpecificPassword);
    }
    /**
     * Return URL to Apple ID page for app-specific password
     */
    getAuthUrl(_userId, _redirectUri) {
        return 'https://appleid.apple.com/account/manage';
    }
    /**
     * Not used for Apple - credentials stored directly
     */
    async handleAuthCallback(_userId, _code) {
        return false;
    }
    /**
     * Disconnect by removing stored credentials
     */
    async disconnect(userId) {
        await this.deleteCredentials(userId);
        log.info({ userId }, 'Disconnected Apple Calendar');
    }
    /**
     * Fetch events from Apple Calendar
     */
    async fetchEvents(userId, startDate, endDate, calendarUrl) {
        const creds = await this.getCredentials(userId);
        if (!creds) {
            log.warn({ userId }, 'No Apple credentials found');
            return [];
        }
        const client = new AppleCalDAVClient(creds);
        const events = [];
        try {
            // Get calendars if not provided
            let calendars = creds.calendars;
            if (!calendars || calendars.length === 0) {
                const principal = await client.discoverPrincipal();
                if (!principal) {
                    log.error({ userId }, 'Could not discover Apple principal');
                    return [];
                }
                const calendarHome = await client.getCalendarHome(principal);
                if (!calendarHome) {
                    log.error({ userId }, 'Could not find Apple calendar home');
                    return [];
                }
                calendars = await client.listCalendars(calendarHome);
                // Cache calendars for future use
                await this.updateCredentials(userId, { ...creds, calendars });
            }
            // Fetch events from each calendar (or specified one)
            const calendarsToFetch = calendarUrl
                ? calendars.filter((c) => c.url === calendarUrl)
                : calendars;
            for (const calendar of calendarsToFetch) {
                const icalEvents = await client.getEvents(calendar.url, startDate, endDate);
                for (const ical of icalEvents) {
                    const event = this.icalToCalendarEvent(ical, userId, calendar.url);
                    if (event) {
                        events.push(event);
                    }
                }
            }
            log.debug({ userId, eventCount: events.length }, 'Fetched Apple Calendar events');
            return events;
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Error fetching Apple Calendar events');
            return [];
        }
    }
    /**
     * Create event in Apple Calendar
     */
    async createEvent(userId, event) {
        const creds = await this.getCredentials(userId);
        if (!creds || !creds.calendars?.length) {
            log.warn({ userId }, 'No Apple credentials or calendars');
            return null;
        }
        const client = new AppleCalDAVClient(creds);
        const calendarUrl = event.externalCalendarId || creds.calendars[0].url;
        const icalEvent = this.calendarEventToICal(event);
        const uid = await client.createEvent(calendarUrl, icalEvent);
        if (uid) {
            log.info({ userId, uid }, 'Created Apple Calendar event');
        }
        return uid;
    }
    /**
     * Update event in Apple Calendar
     */
    async updateEvent(userId, event) {
        if (!event.externalId || !event.externalCalendarId) {
            log.warn({ userId, eventId: event.id }, 'Missing external ID for Apple update');
            return false;
        }
        const creds = await this.getCredentials(userId);
        if (!creds) {
            return false;
        }
        const client = new AppleCalDAVClient(creds);
        const icalEvent = this.calendarEventToICal(event);
        const success = await client.updateEvent(event.externalCalendarId, event.externalId, icalEvent);
        if (success) {
            log.info({ userId, externalId: event.externalId }, 'Updated Apple Calendar event');
        }
        return success;
    }
    /**
     * Delete event from Apple Calendar
     */
    async deleteEvent(userId, eventId, calendarUrl) {
        const creds = await this.getCredentials(userId);
        if (!creds || !calendarUrl) {
            return false;
        }
        const client = new AppleCalDAVClient(creds);
        const success = await client.deleteEvent(calendarUrl, eventId);
        if (success) {
            log.info({ userId, eventId }, 'Deleted Apple Calendar event');
        }
        return success;
    }
    /**
     * Get user's Apple calendars
     */
    async getCalendars(userId) {
        const creds = await this.getCredentials(userId);
        if (!creds) {
            return [];
        }
        const client = new AppleCalDAVClient(creds);
        try {
            const principal = await client.discoverPrincipal();
            if (!principal)
                return [];
            const calendarHome = await client.getCalendarHome(principal);
            if (!calendarHome)
                return [];
            const calendars = await client.listCalendars(calendarHome);
            // Cache calendars
            await this.updateCredentials(userId, { ...creds, calendars });
            return calendars.map((c, i) => ({
                id: c.url,
                name: c.displayName,
                primary: i === 0,
            }));
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Error listing Apple calendars');
            return [];
        }
    }
    // ============================================================================
    // APPLE-SPECIFIC METHODS
    // ============================================================================
    /**
     * Store Apple credentials for a user
     * Password is encrypted before storage using AES-256-GCM
     */
    async storeCredentials(userId, appleId, appSpecificPassword) {
        // Validate credentials first
        const isValid = await this.validateCredentials(appleId, appSpecificPassword);
        if (!isValid) {
            return false;
        }
        // Encrypt the password before storage
        const encryptedPassword = encrypt(appSpecificPassword);
        const storedCreds = {
            appleId,
            appSpecificPassword: encryptedPassword,
            lastValidated: new Date().toISOString(),
        };
        const firestore = await getFirestore();
        if (!firestore) {
            log.error('Firestore not available');
            return false;
        }
        try {
            await firestore
                .collection(`users/${userId}/calendar_providers`)
                .doc('apple')
                .set(cleanForFirestore({
                provider: 'apple',
                connected: true,
                email: appleId,
                syncEnabled: true,
                syncDirection: 'two-way',
                credentials: storedCreds,
                lastSyncedAt: null,
            }));
            log.info({ userId }, 'Stored Apple Calendar credentials (encrypted)');
            return true;
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Error storing Apple credentials');
            return false;
        }
    }
    /**
     * Validate Apple credentials by attempting to connect
     */
    async validateCredentials(appleId, appSpecificPassword) {
        const client = new AppleCalDAVClient({ appleId, appSpecificPassword });
        try {
            const principal = await client.discoverPrincipal();
            return !!principal;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    async getCredentials(userId) {
        const firestore = await getFirestore();
        if (!firestore)
            return null;
        try {
            const doc = await firestore
                .collection(`users/${userId}/calendar_providers`)
                .doc('apple')
                .get();
            if (!doc.exists)
                return null;
            const data = doc.data();
            const storedCreds = data?.credentials;
            if (!storedCreds)
                return null;
            // Decrypt password if encrypted
            let plainPassword;
            if (isEncrypted(storedCreds.appSpecificPassword)) {
                plainPassword = decrypt(storedCreds.appSpecificPassword);
            }
            else {
                // Legacy plaintext password (migrate on next save)
                plainPassword = storedCreds.appSpecificPassword;
                log.warn({ userId }, 'Found unencrypted Apple credentials - will encrypt on next update');
            }
            return {
                appleId: storedCreds.appleId,
                appSpecificPassword: plainPassword,
                principalUrl: storedCreds.principalUrl,
                calendars: storedCreds.calendars,
                lastValidated: storedCreds.lastValidated,
            };
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Error retrieving Apple credentials');
            return null;
        }
    }
    async updateCredentials(userId, creds) {
        const firestore = await getFirestore();
        if (!firestore)
            return;
        try {
            // Encrypt password before storing
            const storedCreds = {
                ...creds,
                appSpecificPassword: encrypt(creds.appSpecificPassword),
            };
            await firestore
                .collection(`users/${userId}/calendar_providers`)
                .doc('apple')
                .update(cleanForFirestore({ credentials: storedCreds }));
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error updating Apple credentials');
        }
    }
    async deleteCredentials(userId) {
        const firestore = await getFirestore();
        if (!firestore)
            return;
        try {
            await firestore.collection(`users/${userId}/calendar_providers`).doc('apple').delete();
        }
        catch (error) {
            log.error({ error: String(error) }, 'Error deleting Apple credentials');
        }
    }
    icalToCalendarEvent(ical, userId, calendarUrl) {
        if (!ical.uid || !ical.dtstart)
            return null;
        const startTime = ical.dtstart instanceof Date ? ical.dtstart : new Date(ical.dtstart);
        const endTime = ical.dtend
            ? ical.dtend instanceof Date
                ? ical.dtend
                : new Date(ical.dtend)
            : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
        const isAllDay = typeof ical.dtstart === 'string' && ical.dtstart.length === 8;
        const reminders = (ical.valarm || []).map((alarm) => {
            const minutes = this.parseTrigger(alarm.trigger);
            return { method: 'popup', minutesBefore: minutes };
        });
        return {
            id: `apple_${ical.uid}`,
            userId,
            title: ical.summary || '(No title)',
            description: ical.description,
            location: ical.location,
            startTime,
            endTime,
            isAllDay,
            attendees: ical.attendee || [],
            status: ical.status || 'confirmed',
            source: 'apple',
            externalId: ical.uid,
            externalCalendarId: calendarUrl,
            syncStatus: 'synced',
            reminders,
            recurrence: ical.rrule,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }
    calendarEventToICal(event) {
        return {
            uid: event.externalId || '',
            summary: event.title,
            description: event.description,
            location: event.location,
            dtstart: event.startTime,
            dtend: event.endTime,
            status: event.status,
            rrule: event.recurrence,
        };
    }
    parseTrigger(trigger) {
        // Parse iCal trigger format like "-PT15M" (15 minutes before)
        const match = trigger.match(/-?P(?:T)?(\d+)([MHDS])/);
        if (!match)
            return 15;
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
            case 'M':
                return value;
            case 'H':
                return value * 60;
            case 'D':
                return value * 60 * 24;
            default:
                return 15;
        }
    }
}
export const appleCalendarProvider = new AppleCalendarProvider();
export default AppleCalendarProvider;
//# sourceMappingURL=apple-provider.js.map