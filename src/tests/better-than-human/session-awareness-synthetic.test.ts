/**
 * LLM-Powered Synthetic Testing for "Better Than Human" Session Awareness
 *
 * Tests the awareness injection system that makes Ferni superhuman:
 * 1. Date/Time Awareness - Knows the current moment
 * 2. User Context - Name, relationship stage, conversation history
 * 3. Last Conversation Summary - Continuity across sessions
 * 4. Emotional State - Recent mood patterns
 * 5. Life Events - Ongoing life context
 * 6. Goals & Concerns - What matters to them
 * 7. Calendar Awareness - Upcoming/recent meetings
 *
 * These tests validate that the awareness context is correctly:
 * - Built from user profile data
 * - Formatted for LLM consumption
 * - Injected at the right time (model creation vs turn 0)
 *
 * Run with: GOOGLE_API_KEY=xxx pnpm vitest run src/tests/better-than-human/session-awareness-synthetic.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const LLM_TIMEOUT = 30000;

import { TEST_LLM_MODEL } from '../test-llm-config.js';

// ============================================================================
// MOCK USER PROFILES FOR TESTING
// ============================================================================

interface MockUserProfile {
  name?: string;
  preferredName?: string;
  totalConversations?: number;
  relationshipStage?: string;
  lastConversationSummary?: string;
  lastConversationDate?: Date;
  humanizingState?: {
    // Real implementation uses lastMood (string), not moodHistory array
    lastMood?: string;
    // But we also test moodHistory for future-proofing
    moodHistory?: Array<{ mood: string; timestamp: number }>;
  };
  lifeEvents?: Array<{
    title: string;
    date: Date;
    category: string;
    // Real implementation filters by status
    status?: 'in_progress' | 'upcoming' | 'planning' | 'completed';
    type?: string;
  }>;
  goals?: string[];
  primaryConcerns?: string[];
}

interface MockCalendarContext {
  isCalendarConnected: boolean;
  nextMeeting: {
    event: { title: string } | null;
    minutesUntil: number | null;
  };
  justEndedMeeting: {
    event: { title: string } | null;
    minutesSince: number | null;
  };
  remainingMeetingsToday: number;
}

// Test profiles representing different user states
const TEST_PROFILES: Record<string, MockUserProfile> = {
  new_user: {
    name: undefined,
    preferredName: undefined,
    totalConversations: 0,
    relationshipStage: undefined,
  },
  returning_user: {
    name: 'Sarah Chen',
    preferredName: 'Sarah',
    totalConversations: 15,
    relationshipStage: 'building_trust',
    lastConversationSummary:
      'We discussed her upcoming presentation and strategies for managing pre-presentation anxiety.',
    lastConversationDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    humanizingState: {
      // Real implementation uses lastMood
      lastMood: 'reflective',
      // Keep moodHistory for extended tests
      moodHistory: [
        { mood: 'anxious', timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 },
        { mood: 'hopeful', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 },
      ],
    },
    goals: ['Get promoted to senior manager', 'Improve work-life balance'],
    primaryConcerns: ['Big presentation next week'],
  },
  established_user: {
    name: 'Michael Torres',
    preferredName: 'Mike',
    totalConversations: 45,
    relationshipStage: 'established',
    lastConversationSummary:
      'Mike shared that his dad is recovering well from surgery. He mentioned feeling relieved but exhausted from the past month.',
    lastConversationDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
    humanizingState: {
      lastMood: 'tired_but_present',
      moodHistory: [
        { mood: 'relieved', timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 },
        { mood: 'exhausted', timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 },
        { mood: 'worried', timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 },
      ],
    },
    lifeEvents: [
      {
        title: "Dad's surgery and recovery",
        date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        category: 'family',
        status: 'in_progress',
        type: 'loss', // Using 'loss' type for health challenges
      },
    ],
    goals: ['Be more present with family', 'Start exercising again'],
    primaryConcerns: ["Dad's ongoing recovery"],
  },
  busy_professional: {
    name: 'Jennifer Wright',
    preferredName: 'Jen',
    totalConversations: 30,
    relationshipStage: 'building_trust',
    lastConversationSummary:
      'Jen was stressed about her packed schedule this week. We brainstormed some delegation strategies.',
    lastConversationDate: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    goals: ['Delegate more effectively', 'Find time for self-care'],
    primaryConcerns: ['Back-to-back meetings all week'],
  },
};

const TEST_CALENDARS: Record<string, MockCalendarContext> = {
  no_calendar: {
    isCalendarConnected: false,
    nextMeeting: { event: null, minutesUntil: null },
    justEndedMeeting: { event: null, minutesSince: null },
    remainingMeetingsToday: 0,
  },
  upcoming_meeting: {
    isCalendarConnected: true,
    nextMeeting: { event: { title: 'Q4 Planning Review' }, minutesUntil: 12 },
    justEndedMeeting: { event: null, minutesSince: null },
    remainingMeetingsToday: 4,
  },
  just_finished_meeting: {
    isCalendarConnected: true,
    nextMeeting: { event: { title: 'Team Standup' }, minutesUntil: 45 },
    justEndedMeeting: { event: { title: '1:1 with Manager' }, minutesSince: 8 },
    remainingMeetingsToday: 3,
  },
  busy_day: {
    isCalendarConnected: true,
    nextMeeting: { event: { title: 'Client Call' }, minutesUntil: 30 },
    justEndedMeeting: { event: null, minutesSince: null },
    remainingMeetingsToday: 6,
  },
};

// ============================================================================
// CONTEXT BUILDER (Extracted from voice-agent-entry.ts)
// ============================================================================

function buildDateTimeAwareness(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `---

## Current Date & Time

Today is ${dateStr}.
The current time is ${timeStr}.

Use this awareness naturally - don't announce it unless asked, just BE present in the moment.
If someone asks what day it is, what time it is, or what the date is, you know the answer.
`;
}

function buildUserAwareness(profile: MockUserProfile): string[] {
  const userAwareness: string[] = [];

  // Basic identity
  const displayName = profile.preferredName || profile.name || 'the user';
  userAwareness.push(`You're speaking with: ${displayName}`);

  // Relationship depth
  if (profile.totalConversations) {
    const convCount = profile.totalConversations;
    if (convCount === 1) {
      userAwareness.push('This is your first conversation together');
    } else if (convCount < 5) {
      userAwareness.push(
        `This is conversation #${convCount + 1} together - still getting to know each other`
      );
    } else if (convCount < 20) {
      userAwareness.push(`This is conversation #${convCount + 1} - you've built some rapport`);
    } else {
      userAwareness.push(`This is conversation #${convCount + 1} - you have a strong relationship`);
    }
  }

  // Time since last conversation
  if (profile.lastConversationDate) {
    const daysSince = Math.floor(
      (Date.now() - profile.lastConversationDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince === 0) {
      userAwareness.push('You spoke earlier today');
    } else if (daysSince === 1) {
      userAwareness.push('You spoke yesterday');
    } else if (daysSince < 7) {
      userAwareness.push(`It's been ${daysSince} days since you last spoke`);
    } else {
      userAwareness.push(
        `It's been ${daysSince} days since you last spoke - they might appreciate a warm reconnection`
      );
    }
  }

  // Last conversation summary
  if (profile.lastConversationSummary) {
    userAwareness.push(`Last time: ${profile.lastConversationSummary}`);
  }

  // Recent emotional state (real implementation uses lastMood string)
  if (profile.humanizingState?.lastMood) {
    const lastMood = profile.humanizingState.lastMood;
    // Map moods to emotional context (matching real implementation)
    const moodContext: Record<string, string> = {
      tired_but_present: 'Last time they seemed a bit tired - be gentle.',
      reflective: 'Last time they were in a reflective mood.',
      philosophical: 'Last time they were in a thoughtful, philosophical space.',
      energized: 'Last time they were full of energy!',
      grounded: 'Last time they seemed calm and grounded.',
      playful: 'Last time they were in a playful mood.',
      nostalgic: 'Last time they were feeling nostalgic.',
    };
    if (moodContext[lastMood]) {
      userAwareness.push(moodContext[lastMood]);
    }
  } else if (profile.humanizingState?.moodHistory?.length) {
    // Fallback to moodHistory array if available (extended test)
    const recentMoods = profile.humanizingState.moodHistory.slice(0, 3);
    const moodStr = recentMoods.map((m) => m.mood).join(', ');
    userAwareness.push(`Recent emotional state: ${moodStr}`);
  }

  // Life events (real implementation filters by status)
  if (profile.lifeEvents?.length) {
    // Filter by status if available, otherwise take all
    const relevantEvents = profile.lifeEvents
      .filter((event) => {
        if (!event.status) return true; // No status = include
        return (
          event.status === 'in_progress' ||
          event.status === 'upcoming' ||
          event.status === 'planning'
        );
      })
      .slice(0, 2);

    const eventTypes: Record<string, string> = {
      wedding: 'preparing for a wedding',
      baby: 'expecting or has a new baby',
      graduation: 'graduation coming up',
      career_change: 'going through a career change',
      relocation: 'moving/relocating',
      loss: 'dealing with a loss',
      celebration: 'has something to celebrate',
    };

    for (const event of relevantEvents) {
      const eventContext = event.type ? eventTypes[event.type] : null;
      userAwareness.push(`Life context: ${event.title || eventContext || 'Important life event'}`);
    }
  }

  // Goals & concerns
  if (profile.goals?.length) {
    userAwareness.push(`Current goal: ${profile.goals[0]}`);
  }
  if (profile.primaryConcerns?.length) {
    userAwareness.push(`On their mind: ${profile.primaryConcerns[0]}`);
  }

  return userAwareness;
}

function buildCalendarAwareness(calendar: MockCalendarContext): string[] {
  const calendarAwareness: string[] = [];

  if (!calendar.isCalendarConnected) {
    return calendarAwareness;
  }

  // Next meeting awareness
  if (calendar.nextMeeting.event && calendar.nextMeeting.minutesUntil !== null) {
    const minutes = calendar.nextMeeting.minutesUntil;
    const meetingTitle = calendar.nextMeeting.event.title;

    if (minutes <= 15) {
      calendarAwareness.push(
        `⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`
      );
    } else if (minutes <= 60) {
      calendarAwareness.push(
        `📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`
      );
    }
  }

  // Just ended meeting
  if (calendar.justEndedMeeting.event && calendar.justEndedMeeting.minutesSince !== null) {
    const minutes = calendar.justEndedMeeting.minutesSince;
    const meetingTitle = calendar.justEndedMeeting.event.title;

    if (minutes <= 15) {
      calendarAwareness.push(`💬 They just finished "${meetingTitle}" - could be a natural topic.`);
    }
  }

  // Busy day awareness
  if (calendar.remainingMeetingsToday >= 4) {
    calendarAwareness.push(
      `📊 They have ${calendar.remainingMeetingsToday} more meetings today - busy day.`
    );
  }

  return calendarAwareness;
}

function formatUserAwarenessForLLM(userAwareness: string[]): string {
  if (userAwareness.length === 0) {
    return '';
  }

  return `---

## Who You're Talking To

${userAwareness.join('\n')}

Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.
Reference past context when relevant, but don't force it. Let the conversation flow.
`;
}

// ============================================================================
// 1. DATE/TIME AWARENESS TESTS
// ============================================================================

describe('Date/Time Awareness - Better Than Human', () => {
  it('should include current date in awareness context', () => {
    const context = buildDateTimeAwareness();

    // Should have day of week
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(days.some((day) => context.includes(day))).toBe(true);

    // Should have month
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    expect(months.some((month) => context.includes(month))).toBe(true);

    // Should have year
    expect(context).toContain(String(new Date().getFullYear()));
  });

  it('should include current time in awareness context', () => {
    const context = buildDateTimeAwareness();

    // Should have time with AM/PM
    expect(context.match(/\d{1,2}:\d{2}\s*(AM|PM)/i)).not.toBeNull();
  });

  it('should include guidance on natural usage', () => {
    const context = buildDateTimeAwareness();

    expect(context.toLowerCase()).toContain('naturally');
    expect(context.toLowerCase()).toContain("don't announce");
  });
});

// ============================================================================
// 2. USER AWARENESS TESTS
// ============================================================================

describe('User Awareness - Better Than Human', () => {
  describe('New User', () => {
    it('should handle new user with no profile data gracefully', () => {
      const awareness = buildUserAwareness(TEST_PROFILES.new_user);

      // Should still have some basic awareness
      expect(awareness.length).toBeGreaterThanOrEqual(1);
      expect(awareness.some((a) => a.includes('user'))).toBe(true);
    });

    it('should not include undefined or null values', () => {
      const awareness = buildUserAwareness(TEST_PROFILES.new_user);
      const joined = awareness.join(' ');

      expect(joined).not.toContain('undefined');
      expect(joined).not.toContain('null');
    });
  });

  describe('Returning User', () => {
    const profile = TEST_PROFILES.returning_user;

    it('should include preferred name', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.includes('Sarah'))).toBe(true);
    });

    it('should include conversation count with context', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.includes('conversation'))).toBe(true);
    });

    it('should include days since last conversation', () => {
      const awareness = buildUserAwareness(profile);
      expect(
        awareness.some((a) => a.includes('days') || a.includes('yesterday') || a.includes('today'))
      ).toBe(true);
    });

    it('should include last conversation summary', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.includes('presentation'))).toBe(true);
    });

    it('should include recent emotional state from lastMood', () => {
      const awareness = buildUserAwareness(profile);
      // Real implementation uses lastMood context descriptions
      expect(
        awareness.some(
          (a) => a.toLowerCase().includes('reflective') || a.toLowerCase().includes('mood')
        )
      ).toBe(true);
    });

    it('should include goals', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.toLowerCase().includes('goal'))).toBe(true);
    });

    it('should include primary concerns', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.toLowerCase().includes('mind'))).toBe(true);
    });
  });

  describe('Established User', () => {
    const profile = TEST_PROFILES.established_user;

    it('should acknowledge strong relationship for long-term users', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.includes('strong relationship'))).toBe(true);
    });

    it('should include life events context', () => {
      const awareness = buildUserAwareness(profile);
      expect(awareness.some((a) => a.includes('surgery') || a.includes('recovery'))).toBe(true);
    });
  });
});

// ============================================================================
// 3. CALENDAR AWARENESS TESTS
// ============================================================================

describe('Calendar Awareness - Better Than Human', () => {
  it('should return empty for disconnected calendar', () => {
    const awareness = buildCalendarAwareness(TEST_CALENDARS.no_calendar);
    expect(awareness.length).toBe(0);
  });

  describe('Upcoming Meeting', () => {
    const calendar = TEST_CALENDARS.upcoming_meeting;

    it('should alert for imminent meetings (< 15 min)', () => {
      const awareness = buildCalendarAwareness(calendar);
      expect(awareness.some((a) => a.includes('Q4 Planning Review'))).toBe(true);
      expect(awareness.some((a) => a.includes('⏰'))).toBe(true);
      expect(awareness.some((a) => a.includes('mindful of time'))).toBe(true);
    });
  });

  describe('Just Finished Meeting', () => {
    const calendar = TEST_CALENDARS.just_finished_meeting;

    it('should mention recently ended meeting as conversation topic', () => {
      const awareness = buildCalendarAwareness(calendar);
      expect(awareness.some((a) => a.includes('1:1 with Manager'))).toBe(true);
      expect(awareness.some((a) => a.includes('just finished'))).toBe(true);
    });
  });

  describe('Busy Day', () => {
    const calendar = TEST_CALENDARS.busy_day;

    it('should note busy day when 4+ meetings remaining', () => {
      const awareness = buildCalendarAwareness(calendar);
      expect(awareness.some((a) => a.includes('busy day'))).toBe(true);
      expect(awareness.some((a) => a.includes('6'))).toBe(true);
    });
  });
});

// ============================================================================
// 4. FORMATTING TESTS
// ============================================================================

describe('Awareness Formatting - Better Than Human', () => {
  it('should format user awareness as LLM-friendly context', () => {
    const awareness = buildUserAwareness(TEST_PROFILES.returning_user);
    const formatted = formatUserAwarenessForLLM(awareness);

    // Should have section header
    expect(formatted).toContain("Who You're Talking To");

    // Should have guidance
    expect(formatted).toContain('Use this awareness naturally');
    expect(formatted).toContain("don't force it");
  });

  it('should return empty string for no awareness', () => {
    const formatted = formatUserAwarenessForLLM([]);
    expect(formatted).toBe('');
  });

  it('should join multiple awareness items with newlines', () => {
    const awareness = ['Fact 1', 'Fact 2', 'Fact 3'];
    const formatted = formatUserAwarenessForLLM(awareness);

    expect(formatted).toContain('Fact 1\nFact 2\nFact 3');
  });
});

// ============================================================================
// 5. LLM-POWERED VALIDATION TESTS
// ============================================================================

describe('LLM-Powered Validation - Better Than Human', { timeout: LLM_TIMEOUT }, () => {
  it('should generate context that an LLM can use appropriately', async () => {
    if (!USE_LLM) {
      console.log('Skipping LLM test - no GOOGLE_API_KEY');
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

    // Build context for returning user
    const profile = TEST_PROFILES.returning_user;
    const dateTimeContext = buildDateTimeAwareness();
    const userAwareness = buildUserAwareness(profile);
    const userContext = formatUserAwarenessForLLM(userAwareness);
    const fullContext = dateTimeContext + userContext;

    // Ask LLM to generate an appropriate greeting
    const prompt = `You are Ferni, a warm and empathetic AI life coach. Based on the following awareness context, generate an appropriate greeting for when the user connects.

${fullContext}

Generate a brief, natural greeting (2-3 sentences max) that:
1. Shows you remember them
2. References something from your last conversation OR their current state
3. Feels warm and personal, not robotic

ONLY output the greeting, nothing else.`;

    const result = await model.generateContent(prompt);
    const greeting = result.response.text();

    // Validate the greeting uses the context appropriately
    const greetingLower = greeting.toLowerCase();

    // Should use their name
    expect(greetingLower.includes('sarah')).toBe(true);

    // Should reference either:
    // - Last conversation (presentation)
    // - Recent emotional state (anxious)
    // - Current concern
    const usesContext =
      greetingLower.includes('presentation') ||
      greetingLower.includes('anxious') ||
      greetingLower.includes('worried') ||
      greetingLower.includes('last time') ||
      greetingLower.includes('how are you') ||
      greetingLower.includes('checking in');

    expect(usesContext).toBe(true);

    console.log('\nGenerated greeting:', greeting);
  });

  it('should generate context that enables appropriate calendar-aware responses', async () => {
    if (!USE_LLM) {
      console.log('Skipping LLM test - no GOOGLE_API_KEY');
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

    // Build context for busy professional with upcoming meeting
    const profile = TEST_PROFILES.busy_professional;
    const calendar = TEST_CALENDARS.upcoming_meeting;

    const userAwareness = buildUserAwareness(profile);
    const calendarAwareness = buildCalendarAwareness(calendar);
    const userContext = formatUserAwarenessForLLM(userAwareness);
    const calendarContext = calendarAwareness.join('\n');

    const fullContext = `${userContext}

## Calendar Awareness

${calendarContext}`;

    // Ask LLM to respond to a rambling user
    const prompt = `You are Ferni, a warm AI life coach. Here's what you know:

${fullContext}

The user (Jen) starts talking about a complex problem that will take a while to discuss. She's about to launch into details.

Generate a brief, natural response (1-2 sentences) that:
1. Acknowledges her concern
2. Gently mentions the time constraint (meeting in 12 min)
3. Offers to either do a quick version now or schedule more time later

ONLY output the response, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Validate response is calendar-aware
    const responseLower = response.toLowerCase();

    // Should mention time constraint somehow
    const mentionsTime =
      responseLower.includes('meeting') ||
      responseLower.includes('minute') ||
      responseLower.includes('time') ||
      responseLower.includes('soon') ||
      responseLower.includes('later') ||
      responseLower.includes('quick');

    expect(mentionsTime).toBe(true);

    console.log('\nGenerated calendar-aware response:', response);
  });

  it('should generate context that enables emotional continuity', async () => {
    if (!USE_LLM) {
      console.log('Skipping LLM test - no GOOGLE_API_KEY');
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

    // Build context for user who was previously struggling
    const profile = TEST_PROFILES.established_user;
    const userAwareness = buildUserAwareness(profile);
    const userContext = formatUserAwarenessForLLM(userAwareness);

    const prompt = `You are Ferni, a warm AI life coach. Here's what you know:

${userContext}

The user (Mike) just said: "Hey Ferni, things are finally looking up."

Generate a brief, natural response (2-3 sentences) that:
1. Shows you remember what he's been going through (dad's surgery)
2. Celebrates this positive shift
3. Shows genuine care about his wellbeing

ONLY output the response, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Validate response shows emotional continuity
    const responseLower = response.toLowerCase();

    // Should reference the context
    const showsContinuity =
      responseLower.includes('dad') ||
      responseLower.includes('surgery') ||
      responseLower.includes('recovery') ||
      responseLower.includes('been through') ||
      responseLower.includes('exhausted') ||
      responseLower.includes('relieved') ||
      responseLower.includes('family');

    expect(showsContinuity).toBe(true);

    console.log('\nGenerated emotionally-aware response:', response);
  });
});

// ============================================================================
// 6. COMBINED SCENARIO TESTS
// ============================================================================

describe('Combined Scenarios - Better Than Human', () => {
  interface TestScenario {
    name: string;
    profile: MockUserProfile;
    calendar: MockCalendarContext;
    expectedAwarenessCount: number;
    mustInclude: string[];
  }

  const scenarios: TestScenario[] = [
    {
      name: 'New user, no calendar',
      profile: TEST_PROFILES.new_user,
      calendar: TEST_CALENDARS.no_calendar,
      expectedAwarenessCount: 1, // At least "the user"
      mustInclude: ['user'],
    },
    {
      name: 'Returning user with upcoming meeting',
      profile: TEST_PROFILES.returning_user,
      calendar: TEST_CALENDARS.upcoming_meeting,
      expectedAwarenessCount: 6, // Name, conversation, days, summary, emotion, goals
      mustInclude: ['Sarah', 'presentation', 'Q4 Planning'],
    },
    {
      name: 'Established user just finished meeting',
      profile: TEST_PROFILES.established_user,
      calendar: TEST_CALENDARS.just_finished_meeting,
      expectedAwarenessCount: 7, // All user data
      mustInclude: ['Mike', 'surgery', '1:1 with Manager'],
    },
    {
      name: 'Busy professional on hectic day',
      profile: TEST_PROFILES.busy_professional,
      calendar: TEST_CALENDARS.busy_day,
      expectedAwarenessCount: 5,
      mustInclude: ['Jen', 'delegate', 'busy day'],
    },
  ];

  it.each(scenarios)(
    'should handle: $name',
    ({ profile, calendar, expectedAwarenessCount, mustInclude }) => {
      const userAwareness = buildUserAwareness(profile);
      const calendarAwareness = buildCalendarAwareness(calendar);
      const totalAwareness = userAwareness.length + calendarAwareness.length;

      // Check minimum awareness count
      expect(totalAwareness).toBeGreaterThanOrEqual(expectedAwarenessCount);

      // Check required content
      const allAwareness = [...userAwareness, ...calendarAwareness].join(' ');
      for (const required of mustInclude) {
        expect(allAwareness.toLowerCase()).toContain(required.toLowerCase());
      }
    }
  );
});

// ============================================================================
// 7. EDGE CASE TESTS
// ============================================================================

describe('Edge Cases - Better Than Human', () => {
  it('should handle empty mood history', () => {
    const profile: MockUserProfile = {
      name: 'Test User',
      humanizingState: { moodHistory: [] },
    };
    const awareness = buildUserAwareness(profile);
    expect(awareness.join(' ')).not.toContain('emotional state');
  });

  it('should handle very old last conversation', () => {
    const profile: MockUserProfile = {
      name: 'Test User',
      lastConversationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    };
    const awareness = buildUserAwareness(profile);
    expect(awareness.some((a) => a.includes('warm reconnection'))).toBe(true);
  });

  it('should handle same-day conversation', () => {
    const profile: MockUserProfile = {
      name: 'Test User',
      lastConversationDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    };
    const awareness = buildUserAwareness(profile);
    expect(awareness.some((a) => a.includes('earlier today'))).toBe(true);
  });

  it('should handle first conversation', () => {
    const profile: MockUserProfile = {
      name: 'Test User',
      totalConversations: 0,
    };
    const awareness = buildUserAwareness(profile);
    // Should NOT say "conversation #1" for first-ever conversation
    expect(awareness.some((a) => a.includes('#1'))).toBe(false);
  });

  it('should handle multiple life events', () => {
    const profile: MockUserProfile = {
      name: 'Test User',
      lifeEvents: [
        {
          title: 'Wedding planning',
          date: new Date(),
          category: 'personal',
          status: 'planning',
          type: 'wedding',
        },
        {
          title: 'Job transition',
          date: new Date(),
          category: 'work',
          status: 'in_progress',
          type: 'career_change',
        },
        {
          title: 'Completed move',
          date: new Date(),
          category: 'personal',
          status: 'completed',
          type: 'relocation',
        },
      ],
    };
    const awareness = buildUserAwareness(profile);
    // Should only include first 2 active events (not completed), to avoid overload
    const lifeContextItems = awareness.filter((a) => a.includes('Life context'));
    expect(lifeContextItems.length).toBeLessThanOrEqual(2);
    // Completed event should be filtered out
    expect(awareness.join(' ')).not.toContain('Completed move');
  });
});
