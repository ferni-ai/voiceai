/**
 * Relationship-Calendar Awareness
 *
 * Connects relationship tracking with calendar context for "better than human" insights:
 * - Detects when you're meeting with people in your relationship network
 * - Provides relationship context before meetings
 * - Tracks interaction patterns across calendar and conversations
 * - Identifies relationships that need attention
 *
 * No human assistant tracks both your conversations AND calendar to provide
 * this level of relationship intelligence.
 *
 * @module calendar/relationship-calendar-awareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEventsForDay, getWeekOverview, type CalendarEvent } from './calendar-service.js';
import type { RelationshipPerson } from '../superhuman/relationship-network.js';

const log = createLogger({ module: 'relationship-calendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipMeetingContext {
  event: CalendarEvent;
  relatedPeople: RelationshipMeetingPerson[];
  relationshipInsights: string[];
  suggestedTopics: string[];
  pendingFollowUps: string[];
  meetingPriority: 'high' | 'medium' | 'low';
}

export interface RelationshipMeetingPerson {
  email: string;
  name: string | null;
  matchedPerson: RelationshipPerson | null;
  lastMentioned: Date | null;
  sentiment: string | null;
  themes: string[];
}

export interface RelationshipCalendarGap {
  personId: string;
  personName: string;
  relationship: string;
  daysSinceLastMeeting: number;
  daysSinceLastMention: number;
  importance: number;
  suggestion: string;
}

export interface RelationshipCalendarSummary {
  // Upcoming relationship-significant meetings
  upcomingRelationshipMeetings: RelationshipMeetingContext[];

  // Relationships with no scheduled contact
  neglectedRelationships: RelationshipCalendarGap[];

  // Relationship health indicators from calendar patterns
  meetingFrequencyInsights: string[];

  // Proactive suggestions
  suggestions: string[];
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get relationship context for an upcoming calendar event
 *
 * This enriches a calendar event with relationship data from Ferni's memory.
 */
export async function getRelationshipMeetingContext(
  userId: string,
  event: CalendarEvent
): Promise<RelationshipMeetingContext> {
  try {
    // Load the user's relationship network
    const { loadNetwork } = await import('../superhuman/relationship-network.js');
    const network = await loadNetwork(userId);

    // Match attendees to relationship network
    const relatedPeople: RelationshipMeetingPerson[] = [];

    for (const attendeeEmail of event.attendees) {
      const attendeeName = extractNameFromEmail(attendeeEmail);

      // Try to find this person in the relationship network
      const matchedPerson = findPersonByEmailOrName(network, attendeeEmail, attendeeName);

      relatedPeople.push({
        email: attendeeEmail,
        name: matchedPerson?.name || attendeeName,
        matchedPerson,
        lastMentioned: matchedPerson ? new Date(matchedPerson.lastMentioned) : null,
        sentiment: matchedPerson?.sentiment || null,
        themes: matchedPerson?.themes || [],
      });
    }

    // Generate relationship insights
    const relationshipInsights: string[] = [];
    const suggestedTopics: string[] = [];
    const pendingFollowUps: string[] = [];

    for (const person of relatedPeople) {
      if (!person.matchedPerson) continue;

      const mp = person.matchedPerson;
      const daysSinceLastMention = Math.floor(
        (Date.now() - mp.lastMentioned) / (24 * 60 * 60 * 1000)
      );

      // Generate insights based on relationship data
      if (daysSinceLastMention > 30) {
        relationshipInsights.push(
          `You haven't mentioned ${mp.name} in ${daysSinceLastMention} days - might be nice to catch up!`
        );
      }

      if (mp.sentiment === 'tense' || mp.sentiment === 'negative') {
        relationshipInsights.push(
          `Recent conversations about ${mp.name} have been ${mp.sentiment}. Tread thoughtfully.`
        );
      }

      // Add recent themes as suggested topics
      if (mp.themes.length > 0) {
        suggestedTopics.push(...mp.themes.slice(0, 2));
      }

      // Check recent mentions for follow-ups
      const recentMention = mp.recentMentions[mp.recentMentions.length - 1];
      if (
        recentMention?.context.includes('follow up') ||
        recentMention?.context.includes('remind')
      ) {
        pendingFollowUps.push(
          `You mentioned following up with ${mp.name} about something recently`
        );
      }

      // Pain points worth addressing
      if (mp.painPoints.length > 0) {
        relationshipInsights.push(
          `Previous conversations noted some challenges with ${mp.name}: ${mp.painPoints[0]}`
        );
      }
    }

    // Determine meeting priority based on relationship importance
    const highImportancePeople = relatedPeople.filter(
      (p) => p.matchedPerson && p.matchedPerson.importance > 0.7
    );
    const tensePeople = relatedPeople.filter(
      (p) => p.matchedPerson?.sentiment === 'tense' || p.matchedPerson?.sentiment === 'negative'
    );

    let meetingPriority: 'high' | 'medium' | 'low' = 'low';
    if (highImportancePeople.length > 0 || tensePeople.length > 0) {
      meetingPriority = 'high';
    } else if (relatedPeople.some((p) => p.matchedPerson)) {
      meetingPriority = 'medium';
    }

    return {
      event,
      relatedPeople,
      relationshipInsights,
      suggestedTopics: [...new Set(suggestedTopics)].slice(0, 5),
      pendingFollowUps,
      meetingPriority,
    };
  } catch (error) {
    log.error(
      { error: String(error), userId, eventId: event.id },
      'Failed to get relationship meeting context'
    );
    return {
      event,
      relatedPeople: [],
      relationshipInsights: [],
      suggestedTopics: [],
      pendingFollowUps: [],
      meetingPriority: 'low',
    };
  }
}

/**
 * Identify relationships that might need more calendar time
 *
 * Compares relationship importance with meeting frequency to find gaps.
 */
export async function findNeglectedRelationships(
  userId: string,
  daysToLookBack = 30
): Promise<RelationshipCalendarGap[]> {
  try {
    // Load relationship network
    const { loadNetwork } = await import('../superhuman/relationship-network.js');
    const network = await loadNetwork(userId);

    if (network.length === 0) {
      return [];
    }

    // Get calendar events for the past N days
    const calendarAttendees = new Map<string, Date>(); // email -> last meeting date

    // Check each day
    for (let i = 0; i < daysToLookBack; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      const events = await getEventsForDay(userId, date);
      for (const event of events) {
        for (const email of event.attendees) {
          const existing = calendarAttendees.get(email.toLowerCase());
          if (!existing || event.startTime > existing) {
            calendarAttendees.set(email.toLowerCase(), event.startTime);
          }
        }
      }
    }

    // Find important relationships without recent calendar contact
    const gaps: RelationshipCalendarGap[] = [];

    for (const person of network) {
      // Only check moderately important people
      if (person.importance < 0.4) continue;

      // Calculate days since last mention in conversations
      const daysSinceLastMention = Math.floor(
        (Date.now() - person.lastMentioned) / (24 * 60 * 60 * 1000)
      );

      // Try to find them in calendar by name matching
      let lastMeetingDate: Date | null = null;
      for (const [email, date] of calendarAttendees) {
        const emailName = extractNameFromEmail(email).toLowerCase();
        if (
          person.name.toLowerCase().includes(emailName) ||
          emailName.includes(person.name.toLowerCase().split(' ')[0])
        ) {
          if (!lastMeetingDate || date > lastMeetingDate) {
            lastMeetingDate = date;
          }
        }
      }

      const daysSinceLastMeeting = lastMeetingDate
        ? Math.floor((Date.now() - lastMeetingDate.getTime()) / (24 * 60 * 60 * 1000))
        : daysToLookBack + 1;

      // Generate suggestion if there's a gap
      if (daysSinceLastMeeting > 14 && person.importance > 0.5) {
        let suggestion: string;

        if (person.type === 'family') {
          suggestion = `You haven't had scheduled time with ${person.name} in ${daysSinceLastMeeting} days. Family time matters.`;
        } else if (person.type === 'partner') {
          suggestion = `No date night scheduled with ${person.name}? Consider blocking some quality time.`;
        } else if (person.type === 'friend') {
          suggestion = `Haven't met up with ${person.name} in a while. Maybe schedule a catch-up?`;
        } else if (person.type === 'colleague') {
          suggestion = `Consider scheduling a 1:1 with ${person.name} - it's been ${daysSinceLastMeeting} days.`;
        } else {
          suggestion = `It's been ${daysSinceLastMeeting} days since you met with ${person.name}.`;
        }

        gaps.push({
          personId: person.id,
          personName: person.name,
          relationship: person.type,
          daysSinceLastMeeting,
          daysSinceLastMention,
          importance: person.importance,
          suggestion,
        });
      }
    }

    // Sort by importance and gap length
    gaps.sort((a, b) => {
      const scoreA = a.importance * a.daysSinceLastMeeting;
      const scoreB = b.importance * b.daysSinceLastMeeting;
      return scoreB - scoreA;
    });

    log.debug({ userId, gapsFound: gaps.length }, 'Found neglected relationships');

    return gaps.slice(0, 10); // Top 10 most in need of attention
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to find neglected relationships');
    return [];
  }
}

/**
 * Get a comprehensive relationship-calendar summary
 *
 * This is the main entry point for context builders.
 */
export async function getRelationshipCalendarSummary(
  userId: string
): Promise<RelationshipCalendarSummary> {
  try {
    // Get today's and tomorrow's events
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayEvents = await getEventsForDay(userId, today);
    const tomorrowEvents = await getEventsForDay(userId, tomorrow);

    // Get relationship context for upcoming meetings
    const upcomingRelationshipMeetings: RelationshipMeetingContext[] = [];

    for (const event of [...todayEvents, ...tomorrowEvents].slice(0, 5)) {
      if (event.attendees.length > 0) {
        const context = await getRelationshipMeetingContext(userId, event);
        if (context.relatedPeople.some((p) => p.matchedPerson)) {
          upcomingRelationshipMeetings.push(context);
        }
      }
    }

    // Find neglected relationships
    const neglectedRelationships = await findNeglectedRelationships(userId, 30);

    // Generate meeting frequency insights
    const meetingFrequencyInsights: string[] = [];

    // Get week overview for pattern detection
    const weekOverview = await getWeekOverview(userId);
    if (weekOverview.days.some((d) => d.isOverloaded)) {
      meetingFrequencyInsights.push(
        'Heavy meeting week - important relationships might get less personal attention'
      );
    }

    // Generate suggestions
    const suggestions: string[] = [];

    if (neglectedRelationships.length > 0) {
      const top = neglectedRelationships[0];
      suggestions.push(top.suggestion);
    }

    if (upcomingRelationshipMeetings.some((m) => m.meetingPriority === 'high')) {
      suggestions.push(
        'You have an important relationship meeting coming up - I can brief you on context when ready'
      );
    }

    return {
      upcomingRelationshipMeetings,
      neglectedRelationships,
      meetingFrequencyInsights,
      suggestions,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate relationship calendar summary');
    return {
      upcomingRelationshipMeetings: [],
      neglectedRelationships: [],
      meetingFrequencyInsights: [],
      suggestions: [],
    };
  }
}

/**
 * Build context string for LLM injection
 */
export async function buildRelationshipCalendarContext(userId: string): Promise<string | null> {
  try {
    const summary = await getRelationshipCalendarSummary(userId);

    if (
      summary.upcomingRelationshipMeetings.length === 0 &&
      summary.neglectedRelationships.length === 0
    ) {
      return null;
    }

    const lines: string[] = ['[RELATIONSHIP-CALENDAR AWARENESS]'];

    // Upcoming meetings with relationship context
    if (summary.upcomingRelationshipMeetings.length > 0) {
      lines.push('\n📅 **Meetings with people you know:**');
      for (const meeting of summary.upcomingRelationshipMeetings.slice(0, 3)) {
        const knownPeople = meeting.relatedPeople.filter((p) => p.matchedPerson);
        lines.push(
          `• ${meeting.event.title} - includes ${knownPeople.map((p) => p.name).join(', ')}`
        );

        if (meeting.relationshipInsights.length > 0) {
          lines.push(`  → ${meeting.relationshipInsights[0]}`);
        }
      }
    }

    // Neglected relationships
    if (summary.neglectedRelationships.length > 0) {
      lines.push('\n💭 **People who might appreciate some time:**');
      for (const gap of summary.neglectedRelationships.slice(0, 3)) {
        lines.push(`• ${gap.personName} (${gap.relationship}) - ${gap.daysSinceLastMeeting} days`);
      }
    }

    return lines.join('\n');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build relationship calendar context');
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractNameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  return localPart
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function findPersonByEmailOrName(
  network: RelationshipPerson[],
  email: string,
  name: string
): RelationshipPerson | null {
  const emailName = extractNameFromEmail(email).toLowerCase();
  const searchName = name.toLowerCase();

  for (const person of network) {
    const personNameLower = person.name.toLowerCase();

    // Check direct name match
    if (
      personNameLower.includes(searchName) ||
      searchName.includes(personNameLower.split(' ')[0])
    ) {
      return person;
    }

    // Check email-derived name match
    if (personNameLower.includes(emailName) || emailName.includes(personNameLower.split(' ')[0])) {
      return person;
    }

    // Check aliases
    for (const alias of person.aliases) {
      if (alias.includes(searchName) || searchName.includes(alias)) {
        return person;
      }
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipCalendarAwareness = {
  getMeetingContext: getRelationshipMeetingContext,
  findNeglected: findNeglectedRelationships,
  getSummary: getRelationshipCalendarSummary,
  buildContext: buildRelationshipCalendarContext,
};

export default relationshipCalendarAwareness;
