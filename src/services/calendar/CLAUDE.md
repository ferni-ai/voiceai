# Calendar Service

> **We believe in making AI human, and the decisions we make will reflect that.**

The calendar service handles all calendar integration, scheduling intelligence, and time-aware features. It's a core "Better than Human" capability that helps users manage their time proactively.

---

## Architecture Level

Calendar is at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/calendar/    ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
calendar/
├── index.ts                       # Main exports
├── types.ts                       # Shared calendar types
│
├── # Core Operations
├── calendar-service.ts            # Core calendar operations
├── calendar-intelligence.ts       # Smart scheduling insights
├── calendar-selection.ts          # Calendar picker UI logic
├── calendar-load-service.ts       # Efficient calendar loading
├── calendar-bridge.ts             # Bridge between calendar systems
├── local-calendar-store.ts        # In-memory calendar cache
├── unified-calendar-store.ts      # Unified calendar data store
├── sync-engine.ts                 # Calendar sync orchestration
├── natural-date-parser.ts         # "Next Tuesday" parsing
│
├── # Proactive Intelligence
├── ambient-calendar-awareness.ts  # Context injection for calls
├── better-than-human.ts           # Proactive calendar features
├── proactive-calendar.ts          # Proactive calendar awareness
├── proactive-calendar-outreach.ts # Proactive scheduling suggestions
├── relationship-calendar-awareness.ts # Relationship-aware scheduling
├── meeting-pattern-learning.ts    # Learn from meeting patterns
├── smart-decline.ts               # Smart meeting decline suggestions
│
├── # Event Management
├── conflict-resolver.ts           # Scheduling conflict detection
├── event-confirmation.ts          # Event confirmation flow
├── meeting-followup-automation.ts # Auto follow-up after meetings
├── meeting-memory-service.ts      # Remember meeting context
├── pre-meeting-notifications.ts   # Pre-meeting prep reminders
├── notification-preferences.ts   # Calendar notification preferences
├── recovery-protection.ts         # Protect recovery time
├── weekly-calendar-digest.ts      # Weekly summary generation
├── practice-calendar.ts           # Demo/practice calendar
│
├── # Providers
├── providers/
│   ├── index.ts                   # Provider registry exports
│   ├── provider-registry.ts       # Provider registration
│   ├── google-provider.ts         # Google Calendar provider
│   ├── apple-provider.ts          # Apple Calendar provider
│   └── outlook-provider.ts        # Outlook Calendar provider
│
├── # Subdirectories
├── polling/
│   └── apple-polling.ts           # Apple Calendar polling
├── utils/
│   ├── encryption.ts              # Calendar data encryption
│   └── rate-limiter.ts            # API rate limiting
├── webhooks/
│   ├── google-webhook.ts          # Google Calendar webhooks
│   └── outlook-webhook.ts         # Outlook Calendar webhooks
│
└── __tests__/                     # Calendar tests
```

---

## Core Concepts

### Calendar Providers

We support multiple calendar providers:

```typescript
type CalendarProvider = 'google' | 'outlook' | 'apple' | 'practice';
```

### Event Types

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  description?: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
}
```

---

## Key Services

### Calendar Service (Core)

```typescript
import { CalendarService } from './calendar-service.js';

const calendar = new CalendarService(userId, provider);

// Get events
const events = await calendar.getEvents(startDate, endDate);

// Create event
await calendar.createEvent({
  title: 'Coffee with Alex',
  start: new Date('2024-12-20T10:00:00'),
  end: new Date('2024-12-20T10:30:00'),
});

// Find free slots
const slots = await calendar.findFreeSlots(duration, dateRange);
```

### Calendar Intelligence

```typescript
import { CalendarIntelligence } from './calendar-intelligence.js';

const intelligence = new CalendarIntelligence(userId);

// Analyze calendar patterns
const insights = await intelligence.analyzePatterns();
// { busyDays: ['Monday', 'Thursday'], peakHours: [9, 14] }

// Get scheduling recommendations
const suggestions = await intelligence.getSuggestions();
// "You have 3 meetings back-to-back on Tuesday. Consider adding buffers."
```

### Ambient Calendar Awareness

Injects calendar context into voice conversations:

```typescript
import { getCalendarAwareness } from './ambient-calendar-awareness.js';

// Called during context building
const awareness = await getCalendarAwareness(userId);
// Returns: upcoming meetings, conflicts, prep reminders
```

### Better Than Human Features

```typescript
import { BetterThanHumanCalendar } from './better-than-human.ts';

const bth = new BetterThanHumanCalendar(userId);

// Proactive conflict detection
const conflicts = await bth.detectUpcomingConflicts();

// Recovery time protection
const protected = await bth.protectRecoveryTime();

// Meeting prep automation
await bth.generateMeetingPrep(eventId);
```

---

## Integration Points

### OAuth Setup

Calendar access requires OAuth. See `docs/setup/CALENDAR-OAUTH-SETUP.md`.

### API Routes

```
GET  /api/calendar/events        - List events
POST /api/calendar/events        - Create event
PUT  /api/calendar/events/:id    - Update event
DELETE /api/calendar/events/:id  - Delete event
GET  /api/calendar/free-slots    - Find available time
POST /api/calendar/connect       - Connect calendar provider
```

### Context Builders

Calendar context is injected via:
- `src/intelligence/context-builders/calendar-awareness.ts`

---

## Testing

```bash
# Unit tests
pnpm vitest run src/services/calendar/__tests__/

# Integration tests (requires calendar connected)
CALENDAR_TEST_USER=xxx pnpm vitest run src/services/calendar/__tests__/integration
```

---

## Rules

### Do
- Use `CalendarService` for all calendar operations
- Cache events in `LocalCalendarStore`
- Parse natural dates with `NaturalDateParser`
- Inject context via `ambient-calendar-awareness.ts`

### Don't
- Make direct API calls to Google/Outlook
- Store calendar data in Firestore (use local cache)
- Assume timezone (always use user's timezone)
- Create events without confirmation

---

*Last updated: January 2026*
