# 🗓️ Alex Chen - Communications Excellence Plan

> **"We believe in making AI human, and the decisions we make will reflect that."**

Alex isn't just a scheduler—she's your **Chief of Staff** who:
- Manages your calendar like a protective older sibling
- Validates communications before you send them ("Are you SURE you want to send that?")
- Tracks who you need to follow up with
- Coaches you through difficult conversations
- Knows when you're overbooked and advocates for you

---

## Current State

### ✅ What Alex Can Do Now

| Capability | Status | File |
|------------|--------|------|
| Google Calendar OAuth | ✅ Implemented | `src/services/google-calendar-oauth.ts` |
| Send Email (SendGrid) | ✅ Implemented | `src/services/communication-service.ts` |
| Send SMS (Twilio) | ✅ Implemented | `src/services/communication-service.ts` |
| Draft Emails | ✅ Implemented | `src/tools/domains/communication/` |
| Schedule Reminders | ✅ Implemented | `src/services/reminder-scheduler.ts` |
| Phone Calls (Twilio) | ✅ Implemented | `src/tools/telephony.ts` |
| Communication Coaching | ✅ Basic | Persona behaviors |
| Difficult Conversations | ✅ Basic | `src/tools/domains/difficult-conversations/` |

### ❌ What's Missing

| Capability | Priority | Impact |
|------------|----------|--------|
| Read Google Calendar events | 🔴 CRITICAL | "What's on my calendar today?" |
| Create/update calendar events | 🔴 CRITICAL | "Schedule a meeting with John" |
| Smart scheduling (find free time) | 🔴 CRITICAL | "When am I free next week?" |
| Read Gmail inbox | 🟠 HIGH | "Any important emails?" |
| Email priority triage | 🟠 HIGH | "What needs my attention?" |
| Contact relationship tracking | 🟠 HIGH | "Who haven't I talked to?" |
| Communication validation | 🟠 HIGH | "Is this email too harsh?" |
| Goal-to-calendar mapping | 🟡 MEDIUM | "Block time for my goals" |
| Meeting prep briefings | 🟡 MEDIUM | "What do I need to know?" |
| Proactive calendar intelligence | 🟡 MEDIUM | "Your week looks packed" |

---

## The Vision: Alex as Chief of Staff

### Better Than Human Capabilities

| Human Limitation | Alex's Superpower |
|------------------|-------------------|
| Forgets to follow up | Tracks every conversation, nudges at right time |
| Double-books meetings | Never overlaps, protects your time |
| Sends emails when frustrated | Validates tone, asks "Sleep on it?" |
| Loses track of relationships | Tracks contact frequency, suggests check-ins |
| No time for meeting prep | Briefs you on who/what/context before every call |
| Overwhelmed by inbox | Triages, summarizes, highlights urgent |
| Forgets commitments made | Tracks promises, reminds to deliver |

---

## Phase 1: Calendar Intelligence (Week 1)

### 1.1 Full Google Calendar Integration

**New Tools:**

```typescript
// Get today's schedule
getCalendarEvents(userId, { date: 'today' | Date, view: 'day' | 'week' })

// Create new event
createCalendarEvent(userId, {
  title: string,
  startTime: Date,
  endTime: Date,
  location?: string,
  attendees?: string[],
  description?: string,
  reminder?: number // minutes before
})

// Update existing event
updateCalendarEvent(userId, eventId, updates)

// Delete/cancel event
deleteCalendarEvent(userId, eventId, { notify: boolean })

// Find free time slots
findFreeTime(userId, {
  duration: number, // minutes
  within: 'today' | 'week' | DateRange,
  preferredTimes?: 'morning' | 'afternoon' | 'evening'
})
```

**Files to Create/Modify:**

| File | Purpose |
|------|---------|
| `src/services/calendar/google-calendar-service.ts` | Core calendar operations |
| `src/services/calendar/calendar-intelligence.ts` | Smart scheduling logic |
| `src/tools/domains/calendar/calendar-tools.ts` | LLM tool definitions |
| `src/intelligence/calendar-awareness.ts` | Proactive calendar insights |

### 1.2 Smart Scheduling

```typescript
interface SchedulingIntelligence {
  // Analyze calendar for patterns
  analyzeCalendarPatterns(userId: string): Promise<CalendarPatterns>;

  // Find optimal meeting time
  suggestMeetingTime(userId: string, options: {
    attendees?: string[],
    duration: number,
    urgency: 'low' | 'normal' | 'high',
    meetingType: 'focus' | 'collaborative' | 'quick-sync'
  }): Promise<TimeSlot[]>;

  // Detect overload
  detectOverload(userId: string, week: DateRange): Promise<{
    isOverloaded: boolean;
    backToBackCount: number;
    noBreakDays: string[];
    suggestions: string[];
  }>;

  // Protect focus time
  suggestFocusBlocks(userId: string): Promise<TimeSlot[]>;
}
```

### 1.3 Calendar Context for All Conversations

```typescript
// Add to turn processor context
interface CalendarContext {
  todayEvents: CalendarEvent[];
  upcomingInHour: CalendarEvent | null;
  isInMeeting: boolean;
  dayBusyness: 'light' | 'moderate' | 'packed';
  weekOverview: {
    totalMeetings: number;
    focusTimeAvailable: number;
    backToBackDays: string[];
  };
}
```

---

## Phase 2: Gmail Integration (Week 2)

### 2.1 Gmail OAuth Setup

**New Scopes:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.labels
https://www.googleapis.com/auth/gmail.compose
```

**Files to Create:**

| File | Purpose |
|------|---------|
| `src/services/email/gmail-service.ts` | Gmail API integration |
| `src/services/email/email-intelligence.ts` | Email triage logic |
| `src/tools/domains/communication/email-tools.ts` | LLM tool definitions |

### 2.2 Email Intelligence Tools

```typescript
// Check inbox
getInboxSummary(userId, {
  unreadOnly?: boolean,
  priority?: 'high' | 'normal' | 'low',
  since?: Date
}): Promise<InboxSummary>

// Search emails
searchEmails(userId, {
  query: string,
  from?: string,
  subject?: string,
  hasAttachment?: boolean,
  dateRange?: DateRange
}): Promise<EmailSearchResult[]>

// Get specific email
getEmail(userId, emailId): Promise<EmailDetails>

// Categorize emails
triageInbox(userId): Promise<{
  urgent: EmailSummary[],
  actionRequired: EmailSummary[],
  fyi: EmailSummary[],
  promotional: EmailSummary[],
  canWait: EmailSummary[]
}>
```

### 2.3 Email Priority Intelligence

```typescript
interface EmailIntelligence {
  // Analyze email importance
  assessPriority(email: Email): Promise<{
    priority: 'urgent' | 'high' | 'normal' | 'low';
    reasons: string[];
    suggestedAction: string;
    deadline?: Date;
  }>;

  // Detect sentiment
  analyzeSentiment(email: Email): Promise<{
    tone: 'positive' | 'neutral' | 'negative' | 'urgent';
    isEscalation: boolean;
    needsCarefulResponse: boolean;
  }>;

  // Extract action items
  extractActionItems(email: Email): Promise<ActionItem[]>;
}
```

---

## Phase 3: Contact Relationship Tracking (Week 3)

### 3.1 Relationship Memory

**Firestore Schema:**

```typescript
// Collection: bogle_users/{userId}/contacts/{contactId}
interface ContactRelationship {
  id: string;
  userId: string;
  
  // Contact info
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  
  // Relationship tracking
  lastContact: Date;
  contactFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  preferredChannel: 'email' | 'phone' | 'text';
  timezone?: string;
  
  // History
  interactions: ContactInteraction[];
  pendingFollowUps: FollowUp[];
  
  // Context
  relationship: 'family' | 'friend' | 'colleague' | 'client' | 'vendor' | 'acquaintance';
  tags: string[];
  notes: string;
  
  // Ferni-specific
  communicationStyle?: string;
  sensitivities?: string[];
  importantDates?: { name: string; date: string }[];
}

interface ContactInteraction {
  date: Date;
  type: 'email' | 'call' | 'text' | 'meeting';
  direction: 'inbound' | 'outbound';
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface FollowUp {
  id: string;
  contactId: string;
  reason: string;
  dueDate: Date;
  priority: 'high' | 'normal' | 'low';
  completed: boolean;
}
```

### 3.2 Relationship Tools

```typescript
// Track a contact
addContact(userId, contact: ContactInput): Promise<Contact>

// Log an interaction
logInteraction(userId, contactId, interaction: InteractionInput): Promise<void>

// Get relationship status
getContactHealth(userId): Promise<{
  needsAttention: Contact[];  // Haven't talked in a while
  overdueFollowUps: FollowUp[];
  upcomingBirthdays: Contact[];
  recentlyConnected: Contact[];
}>

// Find contact
findContact(userId, query: string): Promise<Contact[]>

// Suggest who to reach out to
suggestOutreach(userId): Promise<{
  contact: Contact;
  reason: string;
  suggestedMessage?: string;
  lastInteraction: Date;
}[]>
```

---

## Phase 4: Communication Validation (Week 4)

### 4.1 Message Review System

Alex validates messages before sending with:

```typescript
interface MessageReview {
  // Analyze draft
  reviewMessage(draft: {
    type: 'email' | 'text' | 'slack';
    to: string;
    content: string;
    context?: string;
  }): Promise<{
    tone: 'professional' | 'friendly' | 'harsh' | 'passive-aggressive';
    clarity: number; // 0-1
    issues: MessageIssue[];
    suggestions: string[];
    shouldSleep: boolean; // "Maybe sleep on this one?"
    alternativeVersions?: string[];
  }>;

  // Issue types
  issues: Array<{
    type: 'tone' | 'clarity' | 'length' | 'timing' | 'missing-info';
    severity: 'warning' | 'suggestion';
    message: string;
    fix?: string;
  }>;
}
```

### 4.2 Validation Conversation Flows

```
User: "Send this to my boss: I need a raise or I'm quitting"

Alex: "Okay, I have that ready to send. But... can I share something first?

This reads pretty abrupt. Your boss might get defensive before hearing your actual reasons.

Would you like to:
1. Talk through what's really going on first?
2. Let me help you draft something stronger?
3. Send it as is - I'll shut up [laughter]

No judgment either way. This is your call."
```

### 4.3 "Sleep On It" Logic

```typescript
interface SleepOnItAnalysis {
  shouldSuggestWaiting: boolean;
  reasons: string[];
  suggestedWaitTime: number; // hours
  prompt: string; // Alex's gentle suggestion
}

function analyzeForSleepOnIt(
  message: string,
  context: {
    recipientRelationship: string;
    userEmotionalState?: string;
    timeOfDay: number;
    previousInteractions?: Interaction[];
  }
): SleepOnItAnalysis;
```

---

## Phase 5: Proactive Intelligence (Week 5)

### 5.1 Daily Briefing

```typescript
interface DailyBriefing {
  // Generate morning briefing
  generateBriefing(userId: string): Promise<{
    calendar: {
      meetingsToday: number;
      firstMeeting: CalendarEvent | null;
      biggestGap: TimeSlot;
      warnings: string[]; // "Back-to-back all afternoon"
    };
    
    communications: {
      urgentEmails: number;
      pendingFollowUps: FollowUp[];
      contactsToReachOut: Contact[];
    };
    
    prep: {
      meetingsNeedingPrep: CalendarEvent[];
      upcomingDeadlines: Deadline[];
    };
    
    // Alex's summary
    summary: string;
    topPriority: string;
  }>;
}
```

### 5.2 Meeting Prep

```typescript
interface MeetingPrep {
  // Generate prep for upcoming meeting
  prepareForMeeting(userId: string, eventId: string): Promise<{
    meeting: CalendarEvent;
    
    // Attendee context
    attendees: Array<{
      name: string;
      relationship: string;
      lastInteraction?: Date;
      recentTopics?: string[];
      notes?: string;
    }>;
    
    // Relevant history
    previousMeetings?: CalendarEvent[];
    relatedEmails?: EmailSummary[];
    
    // Action items from last meeting
    pendingItems?: ActionItem[];
    
    // Alex's brief
    brief: string;
    suggestedTalkingPoints: string[];
    questionsToAsk: string[];
  }>;
}
```

### 5.3 Proactive Nudges

```typescript
interface ProactiveNudge {
  type: 'follow_up' | 'birthday' | 'overload' | 'deadline' | 'relationship' | 'calendar_conflict';
  priority: 'high' | 'normal' | 'low';
  message: string;
  suggestedAction?: string;
  contact?: Contact;
  event?: CalendarEvent;
}

// Generate nudges for proactive outreach
function generateNudges(userId: string): Promise<ProactiveNudge[]>;
```

---

## Phase 6: Goal-Calendar Integration (Week 6)

### 6.1 Goal Time Blocking

Connect life goals to calendar time:

```typescript
interface GoalCalendarIntegration {
  // Block time for a goal
  blockTimeForGoal(userId: string, goal: {
    name: string;
    hoursPerWeek: number;
    preferredTimes: ('morning' | 'afternoon' | 'evening')[];
    recurring: boolean;
  }): Promise<CalendarEvent[]>;

  // Track goal progress via calendar
  trackGoalTime(userId: string, goalId: string, dateRange: DateRange): Promise<{
    targetHours: number;
    actualHours: number;
    percentComplete: number;
    trend: 'improving' | 'declining' | 'stable';
  }>;

  // Suggest optimal goal time
  suggestGoalTime(userId: string, goalId: string): Promise<TimeSlot[]>;
}
```

### 6.2 Calendar-Habit Connection

```typescript
// When Maya creates a habit, Alex can schedule it
interface HabitScheduling {
  scheduleHabit(userId: string, habit: {
    name: string;
    frequency: 'daily' | 'weekly' | 'custom';
    duration: number;
    preferredTime?: string;
  }): Promise<{
    events: CalendarEvent[];
    reminders: Reminder[];
  }>;
}
```

---

## Implementation Order

| Phase | Focus | Deliverables | Time |
|-------|-------|--------------|------|
| **1** | Calendar | Read/write events, find free time | Week 1 |
| **2** | Email | Gmail integration, inbox triage | Week 2 |
| **3** | Contacts | Relationship tracking, follow-ups | Week 3 |
| **4** | Validation | Message review, "sleep on it" | Week 4 |
| **5** | Proactive | Daily briefing, meeting prep | Week 5 |
| **6** | Goals | Goal-calendar integration | Week 6 |

---

## New Tool Summary

### Calendar Tools (12 tools)

| Tool | Description |
|------|-------------|
| `getCalendarToday` | What's on my calendar today? |
| `getCalendarWeek` | Show me my week |
| `createCalendarEvent` | Schedule a meeting |
| `updateCalendarEvent` | Move/change an event |
| `deleteCalendarEvent` | Cancel an event |
| `findFreeTime` | When am I free? |
| `checkAvailability` | Am I free at X time? |
| `scheduleRecurring` | Set up a recurring event |
| `addMeetingNotes` | Add notes to an event |
| `getUpcoming` | What's next on my calendar? |
| `blockFocusTime` | Protect time for deep work |
| `analyzeWeek` | How busy is my week? |

### Email Tools (8 tools)

| Tool | Description |
|------|-------------|
| `getInboxSummary` | What's in my inbox? |
| `searchEmails` | Find emails about X |
| `getEmailDetails` | Read me that email |
| `triageInbox` | What needs my attention? |
| `draftEmail` | Help me write an email |
| `reviewEmail` | Is this email okay? |
| `sendEmail` | Send this email |
| `archiveEmail` | Archive these emails |

### Contact Tools (6 tools)

| Tool | Description |
|------|-------------|
| `addContact` | Save this contact |
| `findContact` | Who was that person? |
| `logInteraction` | I just talked to X |
| `getPendingFollowUps` | Who do I need to follow up with? |
| `suggestOutreach` | Who should I reach out to? |
| `getContactHistory` | When did I last talk to X? |

### Communication Tools (6 tools)

| Tool | Description |
|------|-------------|
| `reviewMessage` | Is this too harsh? |
| `suggestRewrite` | Help me reword this |
| `analyzeResponse` | What should I say back? |
| `rolePlayConversation` | Practice this conversation |
| `buildAssertiveness` | Help me be more assertive |
| `planFollowUp` | Set up a follow-up |

### Intelligence Tools (4 tools)

| Tool | Description |
|------|-------------|
| `getDailyBriefing` | Brief me on today |
| `getMeetingPrep` | Prep me for this meeting |
| `getProactiveNudges` | What should I not forget? |
| `analyzeCalendarLoad` | Am I overbooked? |

**Total: 36 new/enhanced tools**

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Calendar events created via Alex | 50/week | Tool usage |
| Follow-ups completed | 80% completion | Follow-up tracking |
| "Sleep on it" accepted | 60% acceptance | Validation tracking |
| Meeting prep used | 70% of meetings | Tool usage |
| Daily briefing engagement | 50% of mornings | Usage tracking |

---

## Alex's Voice in These Features

### Calendar Awareness

```
"Heads up - you've got back-to-back meetings all afternoon. 
Want me to move something so you can actually eat?"
```

### Email Validation

```
"I'll send it. But... this sounds frustrated. Which is valid!
But do you want them to know you're frustrated? 
Sometimes the most powerful thing is sounding calm when you're not."
```

### Follow-up Nudges

```
"You mentioned following up with Sarah about the project proposal.
That was 5 days ago. Want me to draft something?"
```

### Meeting Prep

```
"Your call with the investors is in an hour. Quick brief:
- Last time you talked about Series A timeline
- They asked about customer acquisition costs
- You promised to send the updated deck (did you?)
Want me to dig up those numbers?"
```

---

## Technical Requirements

### APIs to Integrate

| API | Purpose | Auth |
|-----|---------|------|
| Google Calendar | Events CRUD | OAuth 2.0 |
| Gmail | Email read/send | OAuth 2.0 |
| SendGrid | Reliable email delivery | API Key |
| Twilio | SMS, Calls | API Key |

### New Environment Variables

```bash
# Gmail (add to existing Google OAuth)
GOOGLE_GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.compose

# No new APIs needed - extend existing Google OAuth
```

### Firestore Collections

```
bogle_users/{userId}/
├── calendar_preferences/
│   └── default
├── contacts/
│   └── {contactId}
├── interactions/
│   └── {interactionId}
├── follow_ups/
│   └── {followUpId}
└── communication_drafts/
    └── {draftId}
```

---

## Next Steps

1. **Phase 1 Start**: Implement full Google Calendar read/write
2. **Test Calendar OAuth**: Verify existing OAuth flow works
3. **Create calendar-service.ts**: Core calendar operations
4. **Add calendar tools**: LLM-callable tools
5. **Wire into turn processor**: Calendar context injection

Ready to build this? Let's start with Phase 1! 🗓️

