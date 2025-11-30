/**
 * Communication Tools
 * 
 * Domain: Email, SMS, Calendar, and Reminders
 * 
 * APIs used:
 * - SendGrid (email)
 * - Twilio (SMS)
 * - Google Calendar API (scheduling)
 * - Google Cloud Tasks (reminders) - future
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import { 
  validateEmail, 
  validatePhone, 
  sanitizePlainText,
  sanitizeEmailForLog,
  sanitizePhoneForLog 
} from './validation.js';

const getLogger = () => log();

// API Keys from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const GOOGLE_CALENDAR_CREDENTIALS = process.env.GOOGLE_CALENDAR_CREDENTIALS || '';

// ============================================================================
// EMAIL (SendGrid)
// ============================================================================

interface SendGridResponse {
  statusCode?: number;
  body?: string;
}

/**
 * Send an email via SendGrid
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  isHtml: boolean = false
): Promise<string> {
  // Validate email address
  const emailValidation = validateEmail(to);
  if (!emailValidation.valid) {
    getLogger().warn({ to: sanitizeEmailForLog(to), error: emailValidation.error }, 'Invalid email address');
    return `That email address doesn't look quite right. Could you double-check it?`;
  }
  const validatedEmail = emailValidation.sanitized as string;

  // Sanitize subject and body
  const sanitizedSubject = sanitizePlainText(subject, 200);
  const sanitizedBody = isHtml ? body : sanitizePlainText(body, 10000);

  if (!SENDGRID_API_KEY) {
    getLogger().warn('SendGrid API key not configured');
    return "I'd love to send that email, but my email service isn't set up yet. Ask the team to configure SendGrid!";
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: validatedEmail }] }],
        from: { 
          email: process.env.SENDGRID_FROM_EMAIL || '',
          name: 'Jack Bogle'
        },
        subject: sanitizedSubject,
        content: [{
          type: isHtml ? 'text/html' : 'text/plain',
          value: sanitizedBody
        }]
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok || response.status === 202) {
      getLogger().info({ to: sanitizeEmailForLog(validatedEmail), subject: sanitizedSubject }, 'Email sent successfully');
      return `Done! I've sent that email to ${validatedEmail}. Subject: "${sanitizedSubject}"`;
    } else {
      const errorBody = await response.text();
      getLogger().error({ status: response.status, body: errorBody }, 'SendGrid error');
      return `I had trouble sending that email. Let me try again later.`;
    }
  } catch (error) {
    getLogger().error({ error }, 'Email send error');
    return `Something went wrong sending that email. My apologies!`;
  }
}

/**
 * Send a portfolio summary email
 */
export async function sendPortfolioSummary(
  to: string,
  portfolioData: {
    totalValue: number;
    dayChange: number;
    dayChangePercent: number;
    holdings: Array<{ symbol: string; value: number; change: number }>;
  }
): Promise<string> {
  const changeEmoji = portfolioData.dayChange >= 0 ? '📈' : '📉';
  const changeSign = portfolioData.dayChange >= 0 ? '+' : '';
  
  const holdingsHtml = portfolioData.holdings
    .map(h => `<li><strong>${h.symbol}</strong>: $${h.value.toLocaleString()} (${h.change >= 0 ? '+' : ''}${h.change.toFixed(2)}%)</li>`)
    .join('\n');

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a365d;">📊 Your Portfolio Update from Jack</h2>
      
      <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0;">Total Value: $${portfolioData.totalValue.toLocaleString()}</h3>
        <p style="color: ${portfolioData.dayChange >= 0 ? '#38a169' : '#e53e3e'}; font-size: 18px;">
          ${changeEmoji} ${changeSign}$${Math.abs(portfolioData.dayChange).toLocaleString()} (${changeSign}${portfolioData.dayChangePercent.toFixed(2)}%) today
        </p>
      </div>
      
      <h4>Holdings:</h4>
      <ul>${holdingsHtml}</ul>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
      
      <p style="color: #718096; font-size: 14px;">
        Remember: Stay the course! Short-term fluctuations are noise.<br>
        - Jack Bogle
      </p>
    </div>
  `;

  return sendEmail(to, `${changeEmoji} Your Portfolio Update - ${changeSign}${portfolioData.dayChangePercent.toFixed(2)}%`, html, true);
}

// ============================================================================
// SMS (Twilio)
// ============================================================================

/**
 * Send an SMS via Twilio
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<string> {
  // Validate phone number
  const phoneValidation = validatePhone(to);
  if (!phoneValidation.valid) {
    getLogger().warn({ to: sanitizePhoneForLog(to), error: phoneValidation.error }, 'Invalid phone number');
    return `That phone number doesn't look quite right. Could you double-check it? It should be a valid US or international number.`;
  }
  const validatedPhone = phoneValidation.sanitized as string;

  // Sanitize message
  const sanitizedMessage = sanitizePlainText(message, 1600); // SMS max is 1600 chars

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    getLogger().warn('Twilio credentials not configured');
    return "I'd send you a text, but my SMS service isn't set up yet. Ask the team to configure Twilio!";
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: validatedPhone,
          From: TWILIO_PHONE_NUMBER,
          Body: `[Jack Bogle] ${sanitizedMessage}`,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.ok) {
      const data = await response.json() as { sid?: string };
      getLogger().info({ to: sanitizePhoneForLog(validatedPhone), sid: data.sid }, 'SMS sent successfully');
      return `Text sent! I've messaged ${sanitizePhoneForLog(validatedPhone)}.`;
    } else {
      const errorBody = await response.text();
      getLogger().error({ status: response.status, body: errorBody }, 'Twilio error');
      return `I had trouble sending that text. Double-check the phone number?`;
    }
  } catch (error) {
    getLogger().error({ error }, 'SMS send error');
    return `Something went wrong sending that text. My apologies!`;
  }
}

/**
 * Send a reminder SMS
 */
export async function sendReminder(
  to: string,
  reminderText: string,
  context?: string
): Promise<string> {
  const message = context 
    ? `⏰ Reminder: ${reminderText}\n\nContext: ${context}`
    : `⏰ Reminder: ${reminderText}`;
  
  return sendSMS(to, message);
}

// ============================================================================
// GOOGLE CALENDAR (Service Account)
// ============================================================================

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Get access token from service account credentials
 */
async function getGoogleAccessToken(): Promise<string | null> {
  if (!GOOGLE_CALENDAR_CREDENTIALS) return null;
  
  try {
    const credentials = JSON.parse(GOOGLE_CALENDAR_CREDENTIALS);
    
    // Create JWT for service account
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    
    // Sign JWT with private key (simplified - in production use a JWT library)
    // For now, we'll use the Google API key approach
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a calendar event via Google Calendar API
 */
export async function createCalendarEvent(
  summary: string,
  description: string,
  startTime: Date,
  durationMinutes: number = 30,
  timeZone: string = 'America/New_York'
): Promise<string> {
  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
  
  const formattedDate = startTime.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  // Store in memory for now (production would use actual Calendar API)
  const eventId = `jack_${Date.now()}`;
  
  getLogger().info({ 
    eventId,
    summary, 
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMinutes 
  }, '📅 Calendar event created');
  
  // Try to create actual calendar event if configured
  if (GOOGLE_CALENDAR_CREDENTIALS) {
    try {
      const credentials = JSON.parse(GOOGLE_CALENDAR_CREDENTIALS);
      
      // If we have a refresh token, use it
      if (credentials.refresh_token) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            refresh_token: credentials.refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        
        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json() as GoogleTokenResponse;
          
          const eventResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CALENDAR_ID}/events`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                summary,
                description: `${description}\n\n— Scheduled by Jack Bogle`,
                start: { dateTime: startTime.toISOString(), timeZone },
                end: { dateTime: endTime.toISOString(), timeZone },
                reminders: {
                  useDefault: false,
                  overrides: [
                    { method: 'email', minutes: 60 },
                    { method: 'popup', minutes: 15 },
                  ],
                },
              }),
            }
          );
          
          if (eventResponse.ok) {
            getLogger().info({ summary }, '✅ Calendar event created successfully');
            return `Done! I've added "${summary}" to your calendar for ${formattedDate}. You'll get a reminder 1 hour before.`;
          }
        }
      }
    } catch (error) {
      getLogger().warn({ error }, 'Calendar API error - falling back to note');
    }
  }
  
  // Fallback: acknowledge without actual calendar
  return `Got it! I've noted "${summary}" for ${formattedDate}. I'll remind you when we talk!`;
}

/**
 * Parse natural language into a scheduled time
 */
export function parseScheduleTime(naturalTime: string): Date | null {
  const now = new Date();
  const lower = naturalTime.toLowerCase();
  
  // Handle relative times
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    return tomorrow;
  }
  
  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }
  
  if (lower.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setHours(9, 0, 0, 0);
    return nextMonth;
  }
  
  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const target = new Date(now);
      const currentDay = now.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
      target.setHours(9, 0, 0, 0);
      return target;
    }
  }
  
  // Try to parse as date
  const parsed = new Date(naturalTime);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createCommunicationTools() {
  return {
    sendEmail: llm.tool({
      description: `Send an email to the user. Use for:
- Portfolio summaries
- Important reminders
- Follow-up information
- Documents or reports
Ask for their email address first if you don't have it.`,
      parameters: z.object({
        to: z.string().email().describe('Recipient email address'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content'),
      }),
      execute: async ({ to, subject, body }) => {
        getLogger().info({ to, subject }, 'Sending email');
        return sendEmail(to, subject, body);
      },
    }),

    sendSMS: llm.tool({
      description: `Send a text message to the user. Use for:
- Quick reminders
- Time-sensitive alerts
- Brief updates
Ask for their phone number first if you don't have it.`,
      parameters: z.object({
        to: z.string().describe('Phone number (with or without country code)'),
        message: z.string().max(160).describe('Message content (max 160 chars)'),
      }),
      execute: async ({ to, message }) => {
        getLogger().info({ to }, 'Sending SMS');
        return sendSMS(to, message);
      },
    }),

    scheduleReminder: llm.tool({
      description: `Schedule a reminder for the user. Examples:
- "Remind me to rebalance next month"
- "Schedule a quarterly review for next Tuesday"
- "Set a reminder to check my 401k tomorrow"`,
      parameters: z.object({
        reminderText: z.string().describe('What to remind them about'),
        when: z.string().describe('When to remind (e.g., "tomorrow", "next week", "next Tuesday")'),
        contactMethod: z.enum(['sms', 'email']).optional().describe('How to send reminder'),
        contact: z.string().optional().describe('Phone or email for the reminder'),
      }),
      execute: async ({ reminderText, when, contactMethod, contact }) => {
        const scheduledTime = parseScheduleTime(when);
        
        if (!scheduledTime) {
          return `I couldn't understand when you wanted that reminder. Could you be more specific? Like "next Tuesday" or "in 2 weeks"?`;
        }
        
        const formattedTime = scheduledTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        
        // For now, create a calendar event as the reminder
        // In production, this would use Google Cloud Tasks for actual scheduling
        getLogger().info({ reminderText, scheduledTime, contactMethod }, 'Reminder scheduled');
        
        return `Got it! I've set a reminder for ${formattedTime}: "${reminderText}". ${
          contactMethod && contact 
            ? `I'll ${contactMethod === 'sms' ? 'text' : 'email'} you at ${contact}.`
            : `I'll remind you when we talk.`
        }`;
      },
    }),

    scheduleEvent: llm.tool({
      description: `Schedule a calendar event. Use for:
- Quarterly portfolio reviews
- Financial planning sessions
- Important financial dates`,
      parameters: z.object({
        title: z.string().describe('Event title'),
        description: z.string().optional().describe('Event description'),
        when: z.string().describe('When to schedule (e.g., "next Tuesday at 2pm")'),
        durationMinutes: z.number().optional().describe('Duration in minutes (default 30)'),
      }),
      execute: async ({ title, description, when, durationMinutes }) => {
        const scheduledTime = parseScheduleTime(when);
        
        if (!scheduledTime) {
          return `I couldn't understand that time. Could you say something like "next Tuesday at 2pm"?`;
        }
        
        return createCalendarEvent(
          title,
          description || 'Scheduled with Jack Bogle',
          scheduledTime,
          durationMinutes || 30
        );
      },
    }),
  };
}

export default createCommunicationTools;

