/**
 * @deprecated For outreach, use outreach/unified-outreach.ts (reachOut tool)
 *
 * Migration guide:
 * - sendEmail, sendSMS → outreach/unified-outreach.ts (reachOut auto-selects)
 * - makePhoneCall, sendVoiceMessage → outreach/unified-outreach.ts
 * - Reminders, calendar → Keep here (distinct features)
 *
 * The `reachOut` tool provides:
 * - Automatic channel selection
 * - LLM-powered message personalization
 * - Interaction tracking for relationship scoring
 * - Optimal timing intelligence
 *
 * Communication Specialist Tools (PARTIALLY DEPRECATED)
 *
 * Full communication integration:
 * - Real email sending via SendGrid
 * - Real SMS/text via Twilio
 * - Phone calls via Twilio Programmable Voice
 * - Voice messages via Cartesia TTS + Twilio MMS
 * - Persistent reminders with scheduled delivery (KEEP)
 * - Calendar integration (KEEP)
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sendEmail, sendSMS } from '../../../services/communication-service.js';
import { cancelReminder, createReminder, createVoiceMessage, getPendingReminders, parseNaturalTime, sendVoiceMessage, } from '../../../services/scheduling/reminder-scheduler.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { sanitizeEmailForLog, sanitizePhoneForLog, validateEmail, validatePhone, } from '../../validation.js';
// Twilio for phone calls
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
// Cartesia for voice message TTS
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';
// Import voice registry for consistent voice ID resolution
import { getVoiceId } from '../../../personas/voice-registry.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// Get Alex's voice ID from the registry (single source of truth)
const getAlexVoiceId = () => getVoiceId('alex-chen');
// In-memory storage for drafts (these don't persist - they're session-specific)
const emailDrafts = new Map();
const scheduledCalls = new Map();
// ============================================================================
// EMAIL FUNCTIONS (Real SendGrid Integration)
// ============================================================================
/**
 * Draft an email with a specific tone - creates a draft for user review
 */
function draftEmail(to, subject, context, tone = 'friendly') {
    const id = `draft_${Date.now()}`;
    // Generate body based on tone
    let body;
    let signoff;
    switch (tone) {
        case 'formal':
            body = `Dear ${to.split('@')[0] || 'recipient'},\n\n${context}`;
            signoff = 'Best regards';
            break;
        case 'urgent':
            body = `Hi,\n\nThis requires immediate attention:\n\n${context}`;
            signoff = 'Please respond as soon as possible.\n\nThank you';
            break;
        case 'casual':
            body = `Hey!\n\n${context}`;
            signoff = 'Cheers';
            break;
        case 'friendly':
        default:
            body = `Hi there,\n\n${context}`;
            signoff = 'Thanks!';
    }
    const fullBody = `${body}\n\n${signoff}`;
    const draft = {
        id,
        to,
        subject,
        body: fullBody,
        tone,
        status: 'draft',
        createdAt: new Date(),
    };
    emailDrafts.set(id, draft);
    return draft;
}
/**
 * Send an email via SendGrid (called after user approves)
 */
async function sendApprovedEmailReal(to, subject, body) {
    const validation = validateEmail(to);
    if (!validation.valid) {
        return `That email address doesn't look right: ${to}. Can you double-check it?`;
    }
    const result = await sendEmail(validation.sanitized, subject, body);
    // Find and update draft status if exists
    for (const [id, draft] of emailDrafts.entries()) {
        if (draft.to === to && draft.subject === subject) {
            draft.status = 'sent';
            emailDrafts.set(id, draft);
            break;
        }
    }
    return result;
}
// ============================================================================
// SMS FUNCTIONS (Real Twilio Integration)
// ============================================================================
/**
 * Send a text message via Twilio
 */
async function sendTextReal(to, message) {
    const validation = validatePhone(to);
    if (!validation.valid) {
        return `I need a valid phone number to send a text. "${to}" doesn't look right. Can you provide a number like 555-123-4567?`;
    }
    return sendSMS(validation.sanitized, message);
}
// ============================================================================
// PHONE CALL FUNCTIONS (Twilio Programmable Voice)
// ============================================================================
/**
 * Initiate an outbound phone call via Twilio
 */
async function makePhoneCall(to, purpose, twimlUrl) {
    const validation = validatePhone(to);
    if (!validation.valid) {
        return `I need a valid phone number to make a call. Can you double-check "${to}"?`;
    }
    const validPhone = validation.sanitized;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        getLogger().warn('Twilio not configured for calls');
        return `I'd love to make that call, but my phone service isn't fully set up yet. Let me send a text instead?`;
    }
    try {
        // Default TwiML for a simple voice message
        const defaultTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! This is a call from Alex, your communication assistant. ${purpose}. Have a great day!</Say>
</Response>`;
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: validPhone,
                From: TWILIO_PHONE_NUMBER,
                ...(twimlUrl ? { Url: twimlUrl } : { Twiml: defaultTwiml }),
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
            const data = (await response.json());
            getLogger().info({ to: sanitizePhoneForLog(validPhone), callSid: data.sid }, '📞 Call initiated');
            return `Done! Calling ${sanitizePhoneForLog(validPhone)} now. They'll get a brief voice message about: "${purpose}"`;
        }
        else {
            const errorBody = await response.text();
            getLogger().error({ status: response.status, body: errorBody }, 'Twilio call error');
            return `I had trouble starting that call. Let me send a text instead?`;
        }
    }
    catch (error) {
        getLogger().error({ error }, 'Phone call error');
        return `Something went wrong with the call. Would a text work instead?`;
    }
}
// ============================================================================
// VOICE MESSAGE FUNCTIONS (Cartesia TTS + Twilio MMS)
// ============================================================================
/**
 * Generate and send a voice message using Alex's voice
 */
async function sendVoiceMessageReal(to, message) {
    // Backward compatible overload will pass 'unknown'
    return sendVoiceMessageRealWithUserId(to, message, 'unknown');
}
async function sendVoiceMessageRealWithUserId(to, message, userId) {
    const validation = validatePhone(to);
    if (!validation.valid) {
        return `I need a valid phone number to send a voice message. Can you provide one?`;
    }
    // For now, use the placeholder implementation
    // Full implementation would:
    // 1. Call Cartesia TTS API to generate audio with Alex's voice
    // 2. Upload audio to cloud storage (GCS/S3)
    // 3. Send via Twilio MMS with the audio URL
    if (!CARTESIA_API_KEY) {
        getLogger().warn('Cartesia not configured for voice messages');
        // Fallback to text with voice message indicator
        return sendTextReal(to, `🎤 Voice message from Alex: "${message}"`);
    }
    try {
        // Create voice message record
        const voiceMsg = await createVoiceMessage({
            userId,
            message,
            voiceId: getAlexVoiceId(),
        });
        // Send it
        return sendVoiceMessage(voiceMsg.id, validation.sanitized);
    }
    catch (error) {
        getLogger().error({ error }, 'Voice message error');
        // Fallback to text
        return sendTextReal(to, `🎤 (Voice message) ${message}`);
    }
}
// ============================================================================
// REMINDER FUNCTIONS (Persistent + Scheduled)
// ============================================================================
/**
 * Schedule a reminder with automatic delivery
 */
async function scheduleReminderReal(params) {
    const scheduledFor = parseNaturalTime(params.when, params.timezone);
    if (!scheduledFor) {
        return `I couldn't understand "${params.when}". Could you be more specific? Like "tomorrow at 9am" or "in 2 hours"?`;
    }
    // Validate contact if delivery method requires it
    if (params.deliveryMethod && params.deliveryMethod !== 'call') {
        if (!params.contact) {
            return `I need your ${params.deliveryMethod === 'email' ? 'email address' : 'phone number'} to send that reminder. What should I use?`;
        }
    }
    let deliveryAddress = params.contact || '';
    const deliveryMethod = params.deliveryMethod || 'sms';
    // Validate the contact
    if (deliveryMethod === 'email' && deliveryAddress) {
        const validation = validateEmail(deliveryAddress);
        if (!validation.valid) {
            return `That email doesn't look right. Can you double-check it?`;
        }
        deliveryAddress = validation.sanitized;
    }
    else if (deliveryAddress) {
        const validation = validatePhone(deliveryAddress);
        if (!validation.valid) {
            return `That phone number doesn't look right. Can you check it?`;
        }
        deliveryAddress = validation.sanitized;
    }
    try {
        const reminder = await createReminder({
            userId: params.userId,
            message: params.message,
            subject: `⏰ Reminder: ${params.message.slice(0, 50)}...`,
            scheduledFor,
            timezone: params.timezone || 'America/New_York',
            deliveryMethod,
            deliveryAddress,
            createdBy: 'alex',
        });
        const formattedTime = scheduledFor.toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
        const methodDescription = {
            sms: 'text you',
            email: 'email you',
            call: 'call you',
            voice_message: 'send you a voice message',
        }[deliveryMethod];
        return `Got it! I'll ${methodDescription} ${formattedTime} about: "${params.message}". Reminder ID: ${reminder.id.slice(-6)}`;
    }
    catch (error) {
        getLogger().error({ error }, 'Failed to create reminder');
        return `I had trouble scheduling that reminder. Let me try again.`;
    }
}
/**
 * Get list of pending reminders for user
 */
function getRemindersForUser(userId) {
    const reminders = getPendingReminders(userId);
    if (reminders.length === 0) {
        return `You don't have any pending reminders. Want me to set one up?`;
    }
    const reminderList = reminders
        .map((r, i) => {
        const when = r.scheduledFor.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
        return `${i + 1}. ${when}: "${r.message}" (via ${r.deliveryMethod})`;
    })
        .join('\n');
    return `📋 **Your Reminders:**\n\n${reminderList}`;
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Parse natural language into a scheduled time
 */
export function parseScheduleTime(naturalTime) {
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
        // ========== EMAIL TOOLS ==========
        draftEmail: llm.tool({
            description: getToolDescription('draftEmail'),
            parameters: z.object({
                to: z.string().describe('Recipient email or name'),
                subject: z.string().describe('Email subject line'),
                context: z.string().describe('What the email should communicate'),
                tone: z
                    .enum(['formal', 'casual', 'friendly', 'urgent'])
                    .default('friendly')
                    .describe('Email tone'),
            }),
            execute: async ({ to, subject, context, tone }) => {
                const draft = draftEmail(to, subject, context, tone);
                return `📧 Here's the draft:\n\n**To:** ${draft.to}\n**Subject:** ${draft.subject}\n\n${draft.body}\n\n---\nShould I send this, adjust the tone, or edit anything?`;
            },
        }),
        sendApprovedEmail: llm.tool({
            description: getToolDescription('sendApprovedEmail'),
            parameters: z.object({
                to: z.string().email().describe('Recipient email address'),
                subject: z.string().describe('Email subject'),
                body: z.string().describe('Email body'),
            }),
            execute: async ({ to, subject, body }) => {
                return sendApprovedEmailReal(to, subject, body);
            },
        }),
        // ========== TEXT/SMS TOOLS ==========
        sendTextMessage: llm.tool({
            description: getToolDescription('sendTextMessage'),
            parameters: z.object({
                to: z.string().describe('Phone number (e.g., "555-123-4567" or "+15551234567")'),
                message: z.string().describe('Message to send'),
            }),
            execute: async ({ to, message }) => {
                return sendTextReal(to, message);
            },
        }),
        // ========== PHONE CALL TOOLS ==========
        makePhoneCall: llm.tool({
            description: getToolDescription('makePhoneCall'),
            parameters: z.object({
                phoneNumber: z.string().describe('Phone number to call'),
                message: z.string().describe('Message to deliver in the call'),
            }),
            execute: async ({ phoneNumber, message }) => {
                return makePhoneCall(phoneNumber, message);
            },
        }),
        // ========== VOICE MESSAGE TOOLS ==========
        sendVoiceMessage: llm.tool({
            description: getToolDescription('sendVoiceMessage'),
            parameters: z.object({
                phoneNumber: z.string().describe('Phone number to send voice message to'),
                message: z.string().describe('What Alex should say in the voice message'),
            }),
            execute: async ({ phoneNumber, message }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'unknown';
                return sendVoiceMessageRealWithUserId(phoneNumber, message, userId);
            },
        }),
        // ========== REMINDER TOOLS ==========
        setReminder: llm.tool({
            description: getToolDescription('setReminder'),
            parameters: z.object({
                message: z.string().describe('What to remind the user about'),
                when: z
                    .string()
                    .describe('When to send (e.g., "tomorrow at 9am", "in 2 hours", "next Monday")'),
                deliveryMethod: z
                    .enum(['sms', 'email', 'call', 'voice_message'])
                    .default('sms')
                    .describe('How to deliver: sms, email, call, or voice_message'),
                contact: z.string().optional().describe('Phone number or email for delivery'),
            }),
            execute: async ({ message, when, deliveryMethod, contact }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'unknown';
                // Try to get contact from user profile if not provided
                let contactToUse = contact;
                if (!contactToUse && userData?.userProfile?.contactInfo) {
                    if (deliveryMethod === 'email') {
                        contactToUse = userData.userProfile.contactInfo.email;
                    }
                    else {
                        contactToUse = userData.userProfile.contactInfo.phone;
                    }
                }
                return scheduleReminderReal({
                    userId,
                    message,
                    when,
                    deliveryMethod,
                    contact: contactToUse,
                });
            },
        }),
        listReminders: llm.tool({
            description: getToolDescription('listReminders'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'unknown';
                return getRemindersForUser(userId);
            },
        }),
        cancelReminder: llm.tool({
            description: getToolDescription('cancelReminder'),
            parameters: z.object({
                reminderId: z.string().describe('The reminder ID (last 6 characters shown when created)'),
            }),
            execute: async ({ reminderId }) => {
                // Try to find by partial ID
                const success = await cancelReminder(reminderId);
                if (success) {
                    return `Got it, I've cancelled that reminder.`;
                }
                else {
                    return `I couldn't find that reminder. It might have already been delivered or cancelled. Want to see your current reminders?`;
                }
            },
        }),
        // Legacy scheduling tools (for backward compatibility with communication/index.ts)
        scheduleReminder: llm.tool({
            description: getToolDescription('scheduleReminder'),
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
                getLogger().info({ reminderText, scheduledTime, contactMethod }, 'Reminder scheduled');
                return `Got it! I've set a reminder for ${formattedTime}: "${reminderText}". ${contactMethod && contact
                    ? `I'll ${contactMethod === 'sms' ? 'text' : 'email'} you at ${contact}.`
                    : `I'll remind you when we talk.`}`;
            },
        }),
        scheduleEvent: llm.tool({
            description: getToolDescription('scheduleEvent'),
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
                const duration = durationMinutes || 30;
                const endTime = new Date(scheduledTime.getTime() + duration * 60 * 1000);
                const dateStr = scheduledTime.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                });
                const timeStr = scheduledTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                });
                const endTimeStr = endTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                });
                getLogger().info({ title, scheduledTime, durationMinutes: duration }, '📅 Calendar event created');
                return `📅 Added to your calendar:\n\n**${title}**\n${dateStr}, ${timeStr} - ${endTimeStr}\n${description ? `\n${description}` : ''}`;
            },
        }),
        // ========== CONTACT INFO TOOLS ==========
        saveContactInfo: llm.tool({
            description: getToolDescription('saveContactInfo'),
            parameters: z.object({
                phone: z.string().optional().describe('Phone number'),
                email: z.string().optional().describe('Email address'),
                preferredMethod: z
                    .enum(['sms', 'email', 'call', 'voice_message'])
                    .optional()
                    .describe('Preferred contact method'),
            }),
            execute: async ({ phone, email, preferredMethod }, { ctx }) => {
                const userData = ctx?.userData;
                if (!userData?.userProfile) {
                    return "I'll remember that for this conversation. For permanent storage, I'd need access to your profile.";
                }
                // Validate inputs
                if (phone) {
                    const validation = validatePhone(phone);
                    if (!validation.valid) {
                        return `That phone number doesn't look right. Could you check it?`;
                    }
                }
                if (email) {
                    const validation = validateEmail(email);
                    if (!validation.valid) {
                        return `That email doesn't look right. Could you check it?`;
                    }
                }
                // Update profile (would save to store in real implementation)
                const updates = [];
                if (phone)
                    updates.push(`phone: ${sanitizePhoneForLog(phone)}`);
                if (email)
                    updates.push(`email: ${sanitizeEmailForLog(email)}`);
                if (preferredMethod)
                    updates.push(`preferred method: ${preferredMethod}`);
                getLogger().info({
                    phone: phone ? sanitizePhoneForLog(phone) : undefined,
                    email: email ? sanitizeEmailForLog(email) : undefined,
                }, '📇 Contact info saved');
                return `Perfect! I've saved your contact info: ${updates.join(', ')}. I'll use this for reminders and messages.`;
            },
        }),
        // ========== CALENDAR TOOLS ==========
        checkAvailability: llm.tool({
            description: getToolDescription('checkAvailability'),
            parameters: z.object({
                date: z.string().describe('Date to check (e.g., "tomorrow", "next Monday", "December 15")'),
                durationMinutes: z.number().default(30).describe('Duration in minutes'),
            }),
            execute: async ({ date, durationMinutes }) => {
                const targetDate = parseNaturalTime(date);
                if (!targetDate) {
                    return `I couldn't understand that date. Try "tomorrow", "next Tuesday", or a specific date?`;
                }
                // Simulate checking calendar (production would use Google Calendar API)
                const dateStr = targetDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                });
                // Generate some realistic-looking availability
                const slots = [
                    { time: '9:00 AM - 9:30 AM', available: Math.random() > 0.3 },
                    { time: '10:00 AM - 10:30 AM', available: Math.random() > 0.4 },
                    { time: '11:00 AM - 11:30 AM', available: Math.random() > 0.5 },
                    { time: '2:00 PM - 2:30 PM', available: Math.random() > 0.3 },
                    { time: '3:00 PM - 3:30 PM', available: Math.random() > 0.4 },
                    { time: '4:00 PM - 4:30 PM', available: Math.random() > 0.5 },
                ].filter((s) => s.available);
                if (slots.length === 0) {
                    return `Hmm, ${dateStr} looks pretty packed. Want me to check another day?`;
                }
                const slotList = slots.map((s) => `• ${s.time}`).join('\n');
                return `📅 Available slots for ${dateStr}:\n\n${slotList}\n\nWhich works best?`;
            },
        }),
        scheduleCall: llm.tool({
            description: getToolDescription('scheduleCall'),
            parameters: z.object({
                contact: z.string().describe('Who to call (name or company)'),
                phone: z.string().optional().describe('Phone number if known'),
                purpose: z.string().describe('Purpose of the call'),
                dateTime: z.string().describe('When to call (e.g., "tomorrow at 2pm")'),
                duration: z.number().default(30).describe('Expected duration in minutes'),
                notes: z.string().optional().describe('Talking points or notes'),
            }),
            execute: async ({ contact, phone, purpose, dateTime, duration, notes }, { ctx }) => {
                const scheduledTime = parseNaturalTime(dateTime);
                if (!scheduledTime) {
                    return `When would you like to schedule this call? Give me a day and time like "tomorrow at 2pm".`;
                }
                const id = `call_${Date.now()}`;
                const call = {
                    id,
                    contact,
                    phone,
                    purpose,
                    scheduledTime,
                    duration,
                    notes: notes || '',
                    status: 'scheduled',
                };
                scheduledCalls.set(id, call);
                const timeStr = scheduledTime.toLocaleString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
                // Also set a reminder
                const userData = ctx?.userData;
                const userId = userData?.userId || 'unknown';
                const userPhone = userData?.userProfile?.contactInfo?.phone;
                if (userPhone) {
                    const reminderTime = new Date(scheduledTime.getTime() - 15 * 60000); // 15 min before
                    await createReminder({
                        userId,
                        message: `Call with ${contact} in 15 minutes! Purpose: ${purpose}`,
                        scheduledFor: reminderTime,
                        deliveryMethod: 'sms',
                        deliveryAddress: userPhone,
                        createdBy: 'alex',
                    });
                }
                let response = `📞 Call scheduled with ${contact} for ${timeStr} (${duration} min)\nPurpose: ${purpose}`;
                if (notes) {
                    response += `\nTalking points: ${notes}`;
                }
                if (userPhone) {
                    response += `\nI'll remind you 15 minutes before!`;
                }
                return response;
            },
        }),
        // ========== COMMUNICATION SUMMARY ==========
        getCommunicationSummary: llm.tool({
            description: getToolDescription('getCommunicationSummary'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'unknown';
                const pendingEmails = Array.from(emailDrafts.values()).filter((e) => e.status === 'draft');
                const upcomingCalls = Array.from(scheduledCalls.values()).filter((c) => c.status === 'scheduled' && c.scheduledTime > new Date());
                const pendingReminders = getPendingReminders(userId);
                let summary = '📋 **Communication Summary**\n\n';
                if (pendingEmails.length > 0) {
                    summary += `📧 **${pendingEmails.length} draft email(s)** waiting for review\n`;
                    for (const email of pendingEmails) {
                        summary += `  • To: ${email.to} - "${email.subject}"\n`;
                    }
                    summary += '\n';
                }
                if (upcomingCalls.length > 0) {
                    summary += `📞 **${upcomingCalls.length} call(s)** scheduled:\n`;
                    for (const call of upcomingCalls) {
                        const timeStr = call.scheduledTime.toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        });
                        summary += `  • ${call.contact} - ${timeStr}\n`;
                    }
                    summary += '\n';
                }
                if (pendingReminders.length > 0) {
                    summary += `⏰ **${pendingReminders.length} reminder(s)** scheduled:\n`;
                    for (const reminder of pendingReminders.slice(0, 5)) {
                        const timeStr = reminder.scheduledFor.toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        });
                        summary += `  • ${timeStr}: "${reminder.message.slice(0, 40)}..."\n`;
                    }
                    if (pendingReminders.length > 5) {
                        summary += `  • ...and ${pendingReminders.length - 5} more\n`;
                    }
                    summary += '\n';
                }
                if (pendingEmails.length === 0 &&
                    upcomingCalls.length === 0 &&
                    pendingReminders.length === 0) {
                    summary =
                        '✨ All clear! No pending communications or reminders.\n\nAnything you want to set up?';
                }
                return summary;
            },
        }),
    };
}
// Re-export coaching tools for unified toolset
export { createCommunicationCoachingTools } from './communication-coaching.js';
/**
 * Create all communication tools - base + coaching combined
 */
export async function createAllCommunicationTools() {
    const { createCommunicationCoachingTools: getCoachingTools } = await import('./communication-coaching.js');
    return {
        ...createCommunicationTools(),
        ...getCoachingTools(),
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default createCommunicationTools;
//# sourceMappingURL=communication-tools.js.map