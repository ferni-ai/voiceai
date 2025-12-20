/**
 * Proactive Outreach Nudges
 *
 * "Better Than Human" proactive outreach that surfaces opportunities:
 * - Upcoming birthdays, anniversaries, memorials
 * - People you communicate with frequently
 * - Seasonal/holiday opportunities
 * - Contacts that need attention (haven't talked in a while)
 *
 * Ferni uses these nudges to naturally suggest outreach:
 * "Hey, your mom's birthday is in 3 days. Want me to send her something?"
 *
 * @module services/contacts/outreach-nudges
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import type {
  EnhancedContact,
  ContactImportantDate,
  OutreachOccasion,
  ChannelType,
} from './types.js';
import { getContacts, getContactsNeedingAttention } from './contact-relationship-service.js';
import { getGroups } from './contact-groups.js';
import { getTimingRecommendation } from './optimal-timing.js';

const log = createLogger({ module: 'outreach-nudges' });

// ============================================================================
// TYPES
// ============================================================================

export type NudgeType =
  | 'upcoming_birthday' // Birthday in next 7 days
  | 'upcoming_anniversary' // Anniversary in next 7 days
  | 'upcoming_memorial' // Memorial date approaching
  | 'holiday_opportunity' // Seasonal holiday coming up
  | 'frequent_contact' // Someone you talk to often, haven't recently
  | 'needs_attention' // Relationship strength declining
  | 'check_in'; // General check-in opportunity

export type NudgePriority = 'high' | 'medium' | 'low';

export interface OutreachNudge {
  id: string;
  type: NudgeType;
  priority: NudgePriority;

  // Who to reach out to
  contactId: string;
  contactName: string;
  relationship: string;

  // Why this nudge
  reason: string;
  daysUntilEvent?: number; // For date-based nudges

  // Suggested action
  suggestedChannel: ChannelType;
  suggestedOccasion: OutreachOccasion;
  suggestedMessage?: string; // Optional pre-written suggestion

  // Timing
  bestTimeToSend?: string;
  expiresAt: Date; // When this nudge becomes stale

  // Context for personalization
  context: {
    recentTopics?: string[];
    sharedMemories?: string[];
    theirInterests?: string[];
  };
}

export interface NudgeContext {
  /** Current nudges ready to surface */
  nudges: OutreachNudge[];

  /** Summary for Ferni's context */
  summary: string;

  /** Upcoming dates in the next 2 weeks */
  upcomingDates: Array<{
    contactName: string;
    dateType: string;
    date: string;
    daysAway: number;
  }>;

  /** Contacts that could use attention */
  needsAttention: Array<{
    contactName: string;
    daysSinceContact: number;
    relationship: string;
  }>;

  /** Holiday opportunities */
  upcomingHolidays: Array<{
    name: string;
    date: string;
    daysAway: number;
  }>;
}

// ============================================================================
// HOLIDAY CALENDAR
// ============================================================================

interface Holiday {
  name: string;
  month: number; // 1-12
  day: number;
  occasion: OutreachOccasion;
  leadTimeDays: number; // How many days ahead to nudge
}

const HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", month: 1, day: 1, occasion: 'new_year', leadTimeDays: 7 },
  { name: "Valentine's Day", month: 2, day: 14, occasion: 'thinking_of_you', leadTimeDays: 7 },
  { name: "Mother's Day", month: 5, day: 12, occasion: 'thinking_of_you', leadTimeDays: 14 }, // 2nd Sunday May (approx)
  { name: "Father's Day", month: 6, day: 16, occasion: 'thinking_of_you', leadTimeDays: 14 }, // 3rd Sunday June (approx)
  { name: 'Thanksgiving', month: 11, day: 28, occasion: 'thanksgiving', leadTimeDays: 7 },
  { name: 'Christmas', month: 12, day: 25, occasion: 'christmas', leadTimeDays: 14 },
];

// ============================================================================
// NUDGE GENERATION
// ============================================================================

/**
 * Generate all current outreach nudges for a user
 */
export async function generateNudges(userId: string): Promise<OutreachNudge[]> {
  const nudges: OutreachNudge[] = [];

  try {
    const contacts = await getContacts(userId);
    const now = new Date();

    // 1. Check for upcoming important dates
    for (const contact of contacts) {
      if (!contact.importantDates) continue;

      for (const date of contact.importantDates) {
        const daysUntil = getDaysUntilDate(date.date, now);

        // Only nudge for dates within the next 14 days
        if (daysUntil >= 0 && daysUntil <= 14) {
          const nudge = createDateNudge(contact, date, daysUntil);
          if (nudge) nudges.push(nudge);
        }
      }
    }

    // 2. Check for contacts needing attention
    const needsAttention = await getContactsNeedingAttention(userId, 5);
    for (const contact of needsAttention) {
      const daysSince = Math.floor(
        (now.getTime() - new Date(contact.lastInteraction).getTime()) / (1000 * 60 * 60 * 24)
      );

      nudges.push({
        id: `nudge_attention_${contact.id}_${now.getTime()}`,
        type: 'needs_attention',
        priority: daysSince > 60 ? 'high' : daysSince > 30 ? 'medium' : 'low',
        contactId: contact.id,
        contactName: contact.name,
        relationship: contact.relationship || 'contact',
        reason: `You haven't connected with ${contact.name} in ${daysSince} days`,
        suggestedChannel: (contact.preferredChannel as ChannelType) || 'sms',
        suggestedOccasion: 'check_in',
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        context: {
          recentTopics: contact.topics?.map((t) => t.topic).slice(0, 3),
        },
      });
    }

    // 3. Check for upcoming holidays
    for (const holiday of HOLIDAYS) {
      const daysUntil = getDaysUntilHoliday(holiday, now);

      if (daysUntil >= 0 && daysUntil <= holiday.leadTimeDays) {
        // Find groups that want greetings for this occasion
        const groups = await getGroups(userId);
        const relevantGroups = groups.filter((g) => {
          const prefs = g.occasionPreferences || {};
          if (holiday.occasion === 'christmas') return prefs.christmas !== false;
          if (holiday.occasion === 'thanksgiving') return prefs.thanksgiving !== false;
          if (holiday.occasion === 'new_year') return prefs.newYear !== false;
          return false;
        });

        if (relevantGroups.length > 0) {
          const groupNames = relevantGroups.map((g) => g.name).join(', ');
          nudges.push({
            id: `nudge_holiday_${holiday.name.replace(/\s/g, '_')}_${now.getTime()}`,
            type: 'holiday_opportunity',
            priority: daysUntil <= 3 ? 'high' : 'medium',
            contactId: 'group', // Special marker for group outreach
            contactName: groupNames,
            relationship: 'groups',
            reason: `${holiday.name} is in ${daysUntil} days. Want to send greetings to your ${groupNames}?`,
            daysUntilEvent: daysUntil,
            suggestedChannel: 'email',
            suggestedOccasion: holiday.occasion,
            expiresAt: getHolidayDate(holiday, now),
            context: {},
          });
        }
      }
    }

    // Sort by priority (high first) then by days until event
    nudges.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.daysUntilEvent ?? 999) - (b.daysUntilEvent ?? 999);
    });

    log.debug({ userId, nudgeCount: nudges.length }, 'Generated outreach nudges');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate nudges');
  }

  return nudges;
}

function createDateNudge(
  contact: { id: string; name: string; relationship?: string; preferredChannel?: string },
  date: ContactImportantDate,
  daysUntil: number
): OutreachNudge | null {
  const now = new Date();

  // Map date type to nudge type and occasion
  let type: NudgeType;
  let occasion: OutreachOccasion;
  let priority: NudgePriority;

  switch (date.type) {
    case 'birthday':
      type = 'upcoming_birthday';
      occasion = 'birthday';
      priority = daysUntil <= 3 ? 'high' : daysUntil <= 7 ? 'medium' : 'low';
      break;
    case 'anniversary':
      type = 'upcoming_anniversary';
      occasion = 'anniversary';
      priority = daysUntil <= 3 ? 'high' : 'medium';
      break;
    case 'memorial':
      type = 'upcoming_memorial';
      occasion = 'memorial';
      priority = daysUntil <= 3 ? 'high' : 'medium';
      break;
    default:
      type = 'check_in';
      occasion = 'thinking_of_you';
      priority = 'low';
  }

  const dayText = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

  return {
    id: `nudge_${type}_${contact.id}_${now.getTime()}`,
    type,
    priority,
    contactId: contact.id,
    contactName: contact.name,
    relationship: contact.relationship || 'contact',
    reason: `${contact.name}'s ${date.label || date.type} is ${dayText}`,
    daysUntilEvent: daysUntil,
    suggestedChannel: (contact.preferredChannel as ChannelType) || 'email',
    suggestedOccasion: occasion,
    expiresAt: new Date(now.getTime() + (daysUntil + 1) * 24 * 60 * 60 * 1000),
    context: {},
  };
}

function getDaysUntilDate(dateStr: string, now: Date): number {
  // Parse MM-DD or YYYY-MM-DD format
  let month: number;
  let day: number;

  if (dateStr.length === 5) {
    // MM-DD format
    [month, day] = dateStr.split('-').map(Number);
  } else {
    // YYYY-MM-DD format
    const parts = dateStr.split('-').map(Number);
    month = parts[1];
    day = parts[2];
  }

  const thisYear = now.getFullYear();
  let targetDate = new Date(thisYear, month - 1, day);

  // If the date has passed this year, check next year
  if (targetDate < now) {
    targetDate = new Date(thisYear + 1, month - 1, day);
  }

  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDaysUntilHoliday(holiday: Holiday, now: Date): number {
  const thisYear = now.getFullYear();
  let targetDate = new Date(thisYear, holiday.month - 1, holiday.day);

  // If the date has passed this year, check next year
  if (targetDate < now) {
    targetDate = new Date(thisYear + 1, holiday.month - 1, holiday.day);
  }

  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getHolidayDate(holiday: Holiday, now: Date): Date {
  const thisYear = now.getFullYear();
  let targetDate = new Date(thisYear, holiday.month - 1, holiday.day);

  if (targetDate < now) {
    targetDate = new Date(thisYear + 1, holiday.month - 1, holiday.day);
  }

  return targetDate;
}

// ============================================================================
// CONTEXT BUILDING FOR FERNI
// ============================================================================

/**
 * Build nudge context for Ferni to use in conversations
 * This gets injected into the system prompt or context
 */
export async function buildNudgeContext(userId: string): Promise<NudgeContext> {
  const nudges = await generateNudges(userId);
  const contacts = await getContacts(userId);
  const now = new Date();

  // Build upcoming dates list
  const upcomingDates: NudgeContext['upcomingDates'] = [];
  for (const contact of contacts) {
    if (!contact.importantDates) continue;
    for (const date of contact.importantDates) {
      const daysAway = getDaysUntilDate(date.date, now);
      if (daysAway >= 0 && daysAway <= 14) {
        upcomingDates.push({
          contactName: contact.name,
          dateType: date.label || date.type,
          date: date.date,
          daysAway,
        });
      }
    }
  }
  upcomingDates.sort((a, b) => a.daysAway - b.daysAway);

  // Build needs attention list
  const needsAttention: NudgeContext['needsAttention'] = [];
  const attentionContacts = await getContactsNeedingAttention(userId, 5);
  for (const contact of attentionContacts) {
    const daysSince = Math.floor(
      (now.getTime() - new Date(contact.lastInteraction).getTime()) / (1000 * 60 * 60 * 24)
    );
    needsAttention.push({
      contactName: contact.name,
      daysSinceContact: daysSince,
      relationship: contact.relationship || 'contact',
    });
  }

  // Build upcoming holidays
  const upcomingHolidays: NudgeContext['upcomingHolidays'] = [];
  for (const holiday of HOLIDAYS) {
    const daysAway = getDaysUntilHoliday(holiday, now);
    if (daysAway >= 0 && daysAway <= 21) {
      const date = getHolidayDate(holiday, now);
      upcomingHolidays.push({
        name: holiday.name,
        date: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        daysAway,
      });
    }
  }

  // Build summary for Ferni
  let summary = '';

  if (upcomingDates.length > 0) {
    const urgent = upcomingDates.filter((d) => d.daysAway <= 3);
    if (urgent.length > 0) {
      summary += `IMPORTANT: ${urgent.map((d) => `${d.contactName}'s ${d.dateType} is ${d.daysAway === 0 ? 'today' : d.daysAway === 1 ? 'tomorrow' : `in ${d.daysAway} days`}`).join('; ')}. `;
    }
  }

  if (needsAttention.length > 0) {
    summary += `You haven't talked to ${needsAttention.slice(0, 2).map((c) => c.contactName).join(' or ')} in a while. `;
  }

  if (upcomingHolidays.length > 0 && upcomingHolidays[0].daysAway <= 7) {
    summary += `${upcomingHolidays[0].name} is coming up in ${upcomingHolidays[0].daysAway} days. `;
  }

  return {
    nudges,
    summary: summary.trim() || 'No urgent outreach opportunities right now.',
    upcomingDates,
    needsAttention,
    upcomingHolidays,
  };
}

/**
 * Format a nudge as a natural suggestion from Ferni
 * This is what Ferni might say during a conversation
 */
export function formatNudgeAsSuggestion(nudge: OutreachNudge): string {
  switch (nudge.type) {
    case 'upcoming_birthday':
      if (nudge.daysUntilEvent === 0) {
        return `Hey, it's ${nudge.contactName}'s birthday today. Want me to send them something?`;
      } else if (nudge.daysUntilEvent === 1) {
        return `${nudge.contactName}'s birthday is tomorrow. Should we send them a message?`;
      }
      return `${nudge.contactName}'s birthday is coming up in ${nudge.daysUntilEvent} days. Want me to send them something via ${nudge.suggestedChannel}?`;

    case 'upcoming_anniversary':
      return `${nudge.contactName}'s anniversary is ${nudge.daysUntilEvent === 0 ? 'today' : nudge.daysUntilEvent === 1 ? 'tomorrow' : `in ${nudge.daysUntilEvent} days`}. Should I help you send them a message?`;

    case 'upcoming_memorial':
      return `I noticed ${nudge.contactName} has a memorial date coming up. Would you like to reach out to them?`;

    case 'holiday_opportunity':
      return `${nudge.reason}`;

    case 'needs_attention':
      return `You haven't connected with ${nudge.contactName} in a while. Want me to help you check in on them?`;

    case 'frequent_contact':
      return `I noticed you usually talk to ${nudge.contactName} more often. Should we send them a quick note?`;

    default:
      return nudge.reason;
  }
}

/**
 * Get the top nudge that Ferni should mention
 * Returns null if there's nothing urgent enough to mention
 */
export async function getTopNudgeForMention(userId: string): Promise<{
  nudge: OutreachNudge;
  suggestion: string;
} | null> {
  const nudges = await generateNudges(userId);

  // Only mention high priority nudges or medium ones that are time-sensitive
  const mentionWorthy = nudges.filter(
    (n) =>
      n.priority === 'high' ||
      (n.priority === 'medium' && n.daysUntilEvent !== undefined && n.daysUntilEvent <= 3)
  );

  if (mentionWorthy.length === 0) return null;

  const topNudge = mentionWorthy[0];
  return {
    nudge: topNudge,
    suggestion: formatNudgeAsSuggestion(topNudge),
  };
}

// ============================================================================
// FREQUENT CONTACTS TRACKING
// ============================================================================

interface FrequentContactData {
  contactId: string;
  contactName: string;
  avgDaysBetweenContact: number;
  lastContactDate: Date;
  daysSinceLastContact: number;
  isOverdue: boolean;
}

/**
 * Identify contacts that the user communicates with frequently
 * but hasn't contacted recently
 */
export async function getOverdueFrequentContacts(
  userId: string
): Promise<FrequentContactData[]> {
  const contacts = await getContacts(userId);
  const now = new Date();
  const overdue: FrequentContactData[] = [];

  for (const contact of contacts) {
    // Need enough interaction history
    if (contact.interactionCount < 5) continue;

    const firstDate = new Date(contact.firstInteraction);
    const lastDate = new Date(contact.lastInteraction);

    // Calculate average days between contacts
    const totalDays = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgDaysBetween = totalDays / contact.interactionCount;

    // How long since last contact
    const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

    // If it's been 2x the average, they're overdue
    const isOverdue = daysSinceLast > avgDaysBetween * 2;

    if (isOverdue && avgDaysBetween < 30) {
      // Only track frequent contacts (avg < 30 days)
      overdue.push({
        contactId: contact.id,
        contactName: contact.name,
        avgDaysBetweenContact: Math.round(avgDaysBetween),
        lastContactDate: lastDate,
        daysSinceLastContact: Math.round(daysSinceLast),
        isOverdue: true,
      });
    }
  }

  // Sort by most overdue first
  overdue.sort(
    (a, b) =>
      b.daysSinceLastContact / b.avgDaysBetweenContact -
      a.daysSinceLastContact / a.avgDaysBetweenContact
  );

  return overdue.slice(0, 5);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachNudges = {
  generateNudges,
  buildNudgeContext,
  formatNudgeAsSuggestion,
  getTopNudgeForMention,
  getOverdueFrequentContacts,
};

export default outreachNudges;

