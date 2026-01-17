# Calendar "Better Than Human" Plan

> **Mission**: Make Ferni's calendar intelligence exceed what any human assistant could provide.

**Version**: 1.0
**Created**: December 2024
**Status**: Planning

---

## Executive Summary

The calendar system has strong foundations but operates in isolation. This plan integrates calendar deeply with superhuman services, cross-persona intelligence, and proactive interventions to deliver capabilities no human can match.

### The Vision

| Human Assistant Limitation | Ferni "Better Than Human" |
|---------------------------|---------------------------|
| Forgets your last meeting with someone | Perfect memory: "Last time with Sarah, you discussed the Denver project" |
| Can't track cumulative meeting load | "You've had 32 meeting hours this week—20% above your sustainable threshold" |
| Doesn't know your commitments | "You committed to 3 workouts but only have 2 windows available" |
| Reactive to burnout | "Your calendar pattern matches last November when you burned out" |
| One perspective | Six personas with calendar awareness appropriate to their domain |

---

## Part 1: Current State Audit

### 1.1 What Exists (✅ Working)

| Component | Location | Status | Coverage |
|-----------|----------|--------|----------|
| Google Calendar OAuth | `src/services/google-calendar-oauth.ts` | ✅ | Unit tested |
| Calendar CRUD | `src/services/calendar/calendar-service.ts` | ✅ | Unit tested |
| Calendar Intelligence | `src/services/calendar/calendar-intelligence.ts` | ✅ | Unit tested |
| Proactive Calendar | `src/services/calendar/proactive-calendar.ts` | ✅ | Unit tested |
| Natural Date Parser | `src/services/calendar/natural-date-parser.ts` | ✅ | Unit tested |
| Event Confirmation | `src/services/calendar/event-confirmation.ts` | ✅ | Unit tested |
| Google Webhooks | `src/services/calendar/webhooks/google-webhook.ts` | ✅ | Manual tested |
| Alex Calendar Tools | `src/tools/domains/calendar/alex-calendar-tools.ts` | ✅ | Integration tested |
| Calendar Awareness Context | `src/intelligence/context-builders/calendar-awareness.ts` | ✅ | Not tested |
| Practice Calendar (Habits) | `src/services/calendar/practice-calendar.ts` | ✅ | Unit tested |
| Busy Detection for Outreach | `src/services/calendar-busy-detection.ts` | ✅ | Not tested |

### 1.2 What's Missing (❌ Gaps)

| Integration | Current State | Required State | Priority |
|-------------|---------------|----------------|----------|
| Calendar → Capacity Guardian | ❌ Not connected | Calendar load in burnout risk | P0 |
| Calendar → Commitment Keeper | ❌ Not connected | Validate commitments vs availability | P0 |
| Calendar → Maya Habits | ❌ Minimal | Calendar-aware habit coaching | P1 |
| Calendar → Relationship Network | ❌ Not connected | "Haven't seen X in months" | P1 |
| Calendar → Pre-meeting Memory | ❌ Generic tips only | Memory-enriched briefings | P1 |
| Calendar → Ambient Awareness | ❌ Not implemented | "Meeting in 5 min" context | P1 |
| Calendar → Jordan Milestones | ❌ Partial | Auto-create milestone events | P2 |
| Calendar → Recovery Protection | ❌ Not implemented | Auto-suggest blocks | P2 |
| Calendar → Travel Intelligence | ❌ Not implemented | Commute-aware scheduling | P3 |

### 1.3 Test Coverage Audit

```bash
# Run to assess current coverage
pnpm test -- --coverage src/services/calendar/
pnpm test -- --coverage src/services/superhuman/
pnpm test -- --coverage src/intelligence/context-builders/
```

**Current Estimated Coverage:**
| Area | Unit | Integration | E2E |
|------|------|-------------|-----|
| Calendar Service | 75% | 40% | 0% |
| Calendar Intelligence | 60% | 20% | 0% |
| Superhuman Services | 45% | 10% | 0% |
| Context Builders | 30% | 0% | 0% |
| Cross-Persona Integration | 0% | 0% | 0% |

---

## Part 2: Testing Strategy

### 2.1 Test Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  5 critical flows
                    │   Tests     │  Real calendar, voice agent
                    ├─────────────┤
                    │ Integration │  20 cross-service tests
                    │   Tests     │  Mocked external APIs
                    ├─────────────┤
                    │    Unit     │  100+ unit tests
                    │   Tests     │  Pure functions, isolated
                    └─────────────┘
```

### 2.2 Unit Test Plan

#### Calendar Service (`src/services/calendar/__tests__/`)

```typescript
// calendar-service.test.ts
describe('Calendar Service', () => {
  describe('getDayOverview', () => {
    it('calculates total meeting minutes correctly');
    it('detects back-to-back meetings');
    it('identifies focus time blocks');
    it('handles all-day events');
    it('respects work hours boundaries');
  });

  describe('getWeekOverview', () => {
    it('aggregates daily overviews');
    it('calculates weekly meeting load');
    it('identifies busiest day');
    it('calculates focus time ratio');
  });

  describe('findFreeTimeSlots', () => {
    it('returns available slots');
    it('respects minimum duration');
    it('excludes busy periods');
    it('handles timezone correctly');
  });
});
```

#### Calendar Intelligence (`calendar-intelligence.test.ts`)

```typescript
describe('Calendar Intelligence', () => {
  describe('detectCalendarAlerts', () => {
    it('detects meeting overload (>6h/day)');
    it('detects back-to-back chains (3+ meetings)');
    it('detects no focus time (<2h/day)');
    it('detects early meetings (<8am)');
    it('detects late meetings (>6pm)');
    it('assigns correct severity levels');
  });

  describe('suggestMeetingTimes', () => {
    it('scores morning slots when preferMorning');
    it('avoids back-to-back when requested');
    it('penalizes heavy days');
    it('boosts lighter days');
    it('returns top 5 suggestions');
  });

  describe('analyzeCalendarPatterns', () => {
    it('identifies busiest day of week');
    it('calculates average meetings per day');
    it('finds peak meeting hours');
    it('calculates focus time ratio');
    it('tracks back-to-back frequency');
  });
});
```

#### Capacity Guardian Calendar Integration (NEW)

```typescript
// capacity-guardian-calendar.test.ts
describe('Capacity Guardian + Calendar', () => {
  describe('getCalendarLoadFactors', () => {
    it('calculates weekly meeting hours');
    it('calculates back-to-back percentage');
    it('identifies focus time ratio');
    it('detects meeting hour trend (increasing/decreasing)');
  });

  describe('assessBurnoutRisk with calendar', () => {
    it('adds calendar overload to risk factors');
    it('increases risk for >30h meeting weeks');
    it('increases risk for <15% focus time');
    it('increases risk for 3+ consecutive heavy days');
    it('detects pattern match with previous burnout periods');
  });

  describe('buildCapacityContext with calendar', () => {
    it('includes meeting load in context');
    it('suggests clearing calendar for high risk');
    it('warns about upcoming heavy days');
  });
});
```

#### Commitment Keeper Calendar Integration (NEW)

```typescript
// commitment-keeper-calendar.test.ts
describe('Commitment Keeper + Calendar', () => {
  describe('validateCommitmentFeasibility', () => {
    it('checks if time exists for habit commitment');
    it('suggests alternative times when conflict');
    it('returns feasibility score');
    it('handles recurring commitments');
  });

  describe('onCalendarChange', () => {
    it('detects commitment conflicts from new events');
    it('alerts user to commitment at risk');
    it('suggests rescheduling options');
  });

  describe('createCalendarBlockForCommitment', () => {
    it('creates event for commitment');
    it('sets appropriate title');
    it('adds reminder');
    it('links to commitment ID');
  });
});
```

### 2.3 Integration Test Plan

#### Cross-Service Integration (`src/tests/integration/calendar/`)

```typescript
// calendar-superhuman-integration.test.ts
describe('Calendar + Superhuman Integration', () => {
  beforeEach(async () => {
    // Setup test user with calendar events
    await setupTestCalendar(testUserId, [
      { title: 'Meeting 1', start: '9am', duration: 60 },
      { title: 'Meeting 2', start: '10am', duration: 60 },
      { title: 'Meeting 3', start: '11am', duration: 60 },
      { title: 'Meeting 4', start: '1pm', duration: 60 },
      { title: 'Meeting 5', start: '2pm', duration: 60 },
    ]);
  });

  it('Capacity Guardian reflects calendar overload', async () => {
    const context = await buildCapacityContext(testUserId);
    expect(context).toContain('Meeting Overload');
    expect(context).toContain('back-to-back');
  });

  it('Commitment Keeper warns about infeasible commitment', async () => {
    const result = await detectCommitment('I\'ll work out 3 times this week');
    const feasibility = await validateCommitmentFeasibility(testUserId, result);
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.suggestion).toContain('calendar is packed');
  });

  it('Daily briefing includes burnout warning', async () => {
    const briefing = await generateDailyBriefing(testUserId);
    expect(briefing.suggestions).toContain(expect.stringMatching(/burnout|recovery/i));
  });
});

// calendar-persona-integration.test.ts
describe('Calendar + Persona Integration', () => {
  describe('Alex Calendar Awareness', () => {
    it('Alex gets full calendar context');
    it('Alex can schedule events');
    it('Alex suggests meeting times');
  });

  describe('Maya Habit Awareness', () => {
    it('Maya knows about busy days');
    it('Maya suggests shorter habits on heavy days');
    it('Maya celebrates habits on busy days');
  });

  describe('Jordan Milestone Awareness', () => {
    it('Jordan can sync milestones to calendar');
    it('Jordan warns about milestone conflicts');
    it('Jordan suggests preparation time');
  });

  describe('Ferni Coordinator Awareness', () => {
    it('Ferni knows about upcoming meetings');
    it('Ferni suggests wrapping up before meetings');
    it('Ferni asks how meetings went');
  });
});

// calendar-memory-integration.test.ts
describe('Calendar + Memory Integration', () => {
  it('Pre-meeting briefing includes relationship context', async () => {
    // Setup: Previous conversation with attendee
    await storeMemory(testUserId, {
      type: 'conversation',
      person: 'sarah@example.com',
      topic: 'Denver project timeline',
      date: new Date('2024-11-15'),
    });

    // Setup: Meeting with Sarah tomorrow
    await createTestEvent(testUserId, {
      title: 'Coffee with Sarah',
      attendees: ['sarah@example.com'],
      start: tomorrow('10am'),
    });

    const briefing = await getUpcomingBriefings(testUserId, 24 * 60);
    expect(briefing[0].briefing.relevantContext).toContain('Denver project');
  });

  it('Post-meeting follow-up references commitments made', async () => {
    // Setup: Commitment from previous meeting
    await saveCommitment(testUserId, {
      text: 'Send Sarah the proposal',
      context: 'Meeting with Sarah',
      dueDate: new Date(),
    });

    const followUps = await getPostMeetingFollowUps(testUserId, 30);
    expect(followUps[0].suggestedActions).toContain(
      expect.stringMatching(/proposal|Sarah/i)
    );
  });
});
```

### 2.4 E2E Test Plan

#### Critical User Flows (`e2e/calendar/`)

```typescript
// e2e/calendar/burnout-prevention.spec.ts
describe('E2E: Burnout Prevention Flow', () => {
  it('Complete burnout prevention journey', async () => {
    // 1. User connects calendar with heavy week
    await connectGoogleCalendar(testUserId);
    await importTestWeek(testUserId, 'heavy_week_scenario');

    // 2. User starts conversation with Ferni
    const session = await startVoiceSession(testUserId, 'ferni');

    // 3. Verify burnout context is injected
    const context = await getSessionContext(session.id);
    expect(context).toContain('CAPACITY GUARDIAN');
    expect(context).toContain('Meeting Overload');

    // 4. Ferni proactively addresses it
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/packed|busy|lot on your plate/i);

    // 5. User says they're tired
    await sendUserMessage(session.id, "I'm exhausted");

    // 6. Ferni connects it to calendar
    const response2 = await getAgentResponse(session.id);
    expect(response2.text).toMatch(/calendar|meetings|clear some time/i);

    // 7. Offer to protect time
    expect(response2.suggestedActions).toContain(
      expect.objectContaining({ type: 'block_recovery_time' })
    );
  });
});

// e2e/calendar/commitment-tracking.spec.ts
describe('E2E: Commitment Tracking Flow', () => {
  it('Complete commitment feasibility flow', async () => {
    // 1. Setup busy calendar
    await setupBusyWeek(testUserId);

    // 2. User makes commitment to Ferni
    const session = await startVoiceSession(testUserId, 'ferni');
    await sendUserMessage(session.id, "I'm going to work out 5 times this week");

    // 3. Ferni validates against calendar
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/looking at your calendar|busy week/i);

    // 4. Ferni suggests realistic alternative
    expect(response.text).toMatch(/3 times|find time|schedule/i);

    // 5. User agrees to 3x
    await sendUserMessage(session.id, "OK, let's do 3 times");

    // 6. Ferni creates calendar blocks
    const events = await getCalendarEvents(testUserId, thisWeek());
    const workoutEvents = events.filter(e => e.title.includes('Workout'));
    expect(workoutEvents.length).toBe(3);

    // 7. Commitment is tracked
    const commitments = await loadUserCommitments(testUserId);
    expect(commitments).toContainEqual(
      expect.objectContaining({
        text: expect.stringMatching(/work out 3 times/i),
        calendarEventIds: expect.arrayContaining([expect.any(String)]),
      })
    );
  });
});

// e2e/calendar/pre-meeting-intelligence.spec.ts
describe('E2E: Pre-Meeting Intelligence Flow', () => {
  it('Memory-enriched pre-meeting briefing', async () => {
    // 1. Setup: Previous conversation with Sarah
    await storeConversationMemory(testUserId, {
      person: 'sarah@example.com',
      topics: ['Denver project', 'Q1 timeline', 'budget concerns'],
      commitments: ['Review the proposal'],
      date: new Date('2024-11-15'),
    });

    // 2. Setup: Meeting with Sarah in 30 minutes
    await createCalendarEvent(testUserId, {
      title: '1:1 with Sarah',
      attendees: ['sarah@example.com'],
      start: inMinutes(30),
    });

    // 3. Start conversation with Alex
    const session = await startVoiceSession(testUserId, 'alex-chen');

    // 4. Alex proactively briefs about meeting
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/Sarah in 30 minutes/i);
    expect(response.text).toMatch(/Denver project/i);
    expect(response.text).toMatch(/proposal|follow up/i);

    // 5. User asks for more detail
    await sendUserMessage(session.id, "What should I prepare?");

    // 6. Alex provides memory-enriched prep
    const response2 = await getAgentResponse(session.id);
    expect(response2.text).toMatch(/budget concerns/i);
    expect(response2.text).toMatch(/Q1 timeline/i);
  });
});

// e2e/calendar/ambient-awareness.spec.ts
describe('E2E: Ambient Calendar Awareness', () => {
  it('Conversation aware of upcoming meeting', async () => {
    // 1. Setup: Meeting in 5 minutes
    await createCalendarEvent(testUserId, {
      title: 'Team Standup',
      start: inMinutes(5),
    });

    // 2. Start deep conversation with Ferni
    const session = await startVoiceSession(testUserId, 'ferni');
    await sendUserMessage(session.id, "I want to talk about my career goals...");

    // 3. Ferni acknowledges but notes time constraint
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/meeting in|standup coming up/i);
    expect(response.text).toMatch(/continue after|come back to/i);

    // 4. User continues anyway
    await sendUserMessage(session.id, "Let me quickly share what's on my mind");

    // 5. At 2 minutes, Ferni wraps up gracefully
    await advanceTime(3 * 60 * 1000); // 3 minutes
    const response2 = await getAgentResponse(session.id);
    expect(response2.text).toMatch(/2 minutes|almost time|wrap up/i);
  });

  it('Post-meeting check-in', async () => {
    // 1. Setup: Meeting just ended
    await createCalendarEvent(testUserId, {
      title: 'Performance Review',
      start: inMinutes(-65),
      duration: 60,
    });

    // 2. User starts conversation
    const session = await startVoiceSession(testUserId, 'ferni');

    // 3. Ferni asks about the meeting
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/performance review|how did it go/i);
  });
});

// e2e/calendar/habit-calendar-correlation.spec.ts
describe('E2E: Habit-Calendar Correlation', () => {
  it('Maya adapts habits to calendar load', async () => {
    // 1. Setup: Tomorrow is packed
    await setupHeavyDay(testUserId, tomorrow());

    // 2. Setup: User has workout habit
    await createHabit(testUserId, {
      name: 'Morning workout',
      duration: 45,
      frequency: 'daily',
    });

    // 3. Evening conversation with Maya
    const session = await startVoiceSession(testUserId, 'maya-santos');
    await sendUserMessage(session.id, "Planning my day tomorrow");

    // 4. Maya acknowledges busy day
    const response = await getAgentResponse(session.id);
    expect(response.text).toMatch(/packed day|busy tomorrow/i);

    // 5. Maya suggests adapted workout
    expect(response.text).toMatch(/shorter workout|15.?minute|quick session/i);

    // 6. User completes habit on busy day
    await advanceTime(24 * 60 * 60 * 1000); // next day
    await completeHabit(testUserId, 'Morning workout');

    // 7. Maya celebrates extra
    const session2 = await startVoiceSession(testUserId, 'maya-santos');
    const response2 = await getAgentResponse(session2.id);
    expect(response2.text).toMatch(/busy day|impressive|commitment/i);
  });
});
```

---

## Part 3: Implementation Roadmap

### Phase 0: Foundation & Testing Infrastructure

**Duration**: 1 week
**Goal**: Establish testing foundation

#### Tasks

- [ ] Create test utilities for calendar mocking
- [ ] Set up Firestore emulator for integration tests
- [ ] Create test data generators for calendar scenarios
- [ ] Add calendar coverage to CI pipeline
- [ ] Create E2E test infrastructure with Playwright

#### Test Utilities to Create

```typescript
// src/tests/utils/calendar-test-utils.ts
export async function setupTestCalendar(userId: string, events: TestEvent[]);
export async function clearTestCalendar(userId: string);
export function createTestEvent(overrides?: Partial<CalendarEvent>): CalendarEvent;
export function createHeavyWeek(): TestEvent[];
export function createLightWeek(): TestEvent[];
export function createBurnoutScenario(): TestEvent[];
```

---

### Phase 1: Calendar → Capacity Guardian Integration

**Duration**: 2 weeks
**Priority**: P0 - Critical

#### 1.1 Create Calendar Load Service

```typescript
// src/services/calendar/calendar-load-service.ts
export interface CalendarLoadFactors {
  // Weekly metrics
  weeklyMeetingHours: number;
  weeklyFocusTimeRatio: number; // 0-1
  weeklyBackToBackPercentage: number; // 0-100

  // Daily metrics
  todayMeetingHours: number;
  todayFocusTimeMinutes: number;
  consecutiveMeetingStreak: number; // current streak in minutes

  // Trend metrics
  meetingHoursTrend: 'increasing' | 'stable' | 'decreasing';
  previousWeekComparison: number; // +/- percentage

  // Patterns
  heaviestDayThisWeek: string;
  lightestDayThisWeek: string;
  upcomingHeavyDays: Date[];
}

export async function getCalendarLoadFactors(userId: string): Promise<CalendarLoadFactors>;
export async function getCalendarBurnoutRiskFactors(userId: string): Promise<BurnoutFactor[]>;
```

#### 1.2 Integrate with Capacity Guardian

```typescript
// src/services/superhuman/capacity-guardian.ts

// ADD: Calendar factors to burnout assessment
export async function assessBurnoutRisk(userId: string): Promise<BurnoutAssessment> {
  const readings = await loadEnergyHistory(userId, 14);
  const calendarFactors = await getCalendarBurnoutRiskFactors(userId);
  const factors: BurnoutAssessment['factors'] = [];
  let riskScore = 0;

  // EXISTING: Energy-based factors
  // ... existing code ...

  // NEW: Calendar-based factors
  for (const calFactor of calendarFactors) {
    riskScore += calFactor.riskContribution;
    factors.push({
      factor: calFactor.name,
      weight: calFactor.weight,
      description: calFactor.description,
    });
  }

  // NEW: Pattern matching with historical burnout
  const historicalMatch = await matchHistoricalBurnoutPattern(userId, calendarFactors);
  if (historicalMatch) {
    riskScore += 25;
    factors.push({
      factor: 'Historical Pattern Match',
      weight: 0.25,
      description: `Calendar pattern matches ${historicalMatch.period} when you experienced burnout`,
    });
  }

  // ... rest of assessment
}
```

#### 1.3 Tests for Phase 1

```typescript
// src/services/calendar/__tests__/calendar-load-service.test.ts
describe('Calendar Load Service', () => {
  describe('getCalendarLoadFactors', () => {
    it('calculates weekly meeting hours correctly', async () => {
      await setupTestCalendar(userId, [
        { title: 'Meeting', duration: 60, count: 5, perDay: true },
      ]);
      const factors = await getCalendarLoadFactors(userId);
      expect(factors.weeklyMeetingHours).toBe(25);
    });

    it('calculates focus time ratio', async () => {
      // 8h work day, 4h meetings = 50% focus time
      await setupTestCalendar(userId, meetingsForRatio(0.5));
      const factors = await getCalendarLoadFactors(userId);
      expect(factors.weeklyFocusTimeRatio).toBeCloseTo(0.5, 1);
    });

    it('detects back-to-back percentage', async () => {
      await setupTestCalendar(userId, backToBackScenario());
      const factors = await getCalendarLoadFactors(userId);
      expect(factors.weeklyBackToBackPercentage).toBeGreaterThan(60);
    });

    it('identifies meeting hour trend', async () => {
      // Last week: 20h, This week: 30h
      await setupTwoWeekTrend(userId, 20, 30);
      const factors = await getCalendarLoadFactors(userId);
      expect(factors.meetingHoursTrend).toBe('increasing');
      expect(factors.previousWeekComparison).toBe(50); // +50%
    });
  });
});

// src/services/superhuman/__tests__/capacity-guardian-calendar.test.ts
describe('Capacity Guardian with Calendar', () => {
  it('adds calendar overload to burnout risk', async () => {
    await setupHeavyCalendarWeek(userId); // 35h meetings

    const assessment = await assessBurnoutRisk(userId);

    expect(assessment.factors).toContainEqual(
      expect.objectContaining({
        factor: expect.stringMatching(/meeting|calendar|overload/i),
      })
    );
    expect(assessment.riskScore).toBeGreaterThan(50);
  });

  it('increases risk for no focus time', async () => {
    await setupNoFocusTimeWeek(userId); // <10% focus

    const assessment = await assessBurnoutRisk(userId);

    expect(assessment.factors).toContainEqual(
      expect.objectContaining({
        factor: expect.stringMatching(/focus time/i),
      })
    );
  });

  it('matches historical burnout patterns', async () => {
    // Setup: User had burnout in November with same pattern
    await recordHistoricalBurnout(userId, {
      period: 'November 2024',
      pattern: { weeklyMeetingHours: 35, focusTimeRatio: 0.1 },
    });

    // Current week matches pattern
    await setupPatternMatch(userId, { weeklyMeetingHours: 36, focusTimeRatio: 0.12 });

    const assessment = await assessBurnoutRisk(userId);

    expect(assessment.factors).toContainEqual(
      expect.objectContaining({
        factor: 'Historical Pattern Match',
        description: expect.stringContaining('November 2024'),
      })
    );
  });

  it('includes calendar in context output', async () => {
    await setupHeavyCalendarWeek(userId);

    const context = await buildCapacityContext(userId);

    expect(context).toContain('Meeting Overload');
    expect(context).toMatch(/\d+ hours of meetings/);
    expect(context).toContain('clear your calendar');
  });
});
```

#### 1.4 Deliverables

- [ ] `src/services/calendar/calendar-load-service.ts`
- [ ] Updated `src/services/superhuman/capacity-guardian.ts`
- [ ] `src/services/calendar/__tests__/calendar-load-service.test.ts`
- [ ] `src/services/superhuman/__tests__/capacity-guardian-calendar.test.ts`
- [ ] Integration test: `src/tests/integration/calendar-capacity-guardian.test.ts`
- [ ] E2E test: `e2e/calendar/burnout-prevention.spec.ts`

---

### Phase 2: Calendar → Commitment Keeper Integration

**Duration**: 2 weeks
**Priority**: P0 - Critical

#### 2.1 Add Feasibility Checking

```typescript
// src/services/superhuman/commitment-calendar-integration.ts

export interface CommitmentFeasibility {
  feasible: boolean;
  score: number; // 0-100
  conflicts: string[];
  suggestedSlots: TimeSlot[];
  suggestion: string | null;
}

export async function validateCommitmentFeasibility(
  userId: string,
  commitment: Commitment
): Promise<CommitmentFeasibility>;

export async function findTimeForCommitment(
  userId: string,
  commitment: Commitment
): Promise<TimeSlot[]>;

export async function createCalendarBlockForCommitment(
  userId: string,
  commitment: Commitment,
  slots: TimeSlot[]
): Promise<string[]>; // Returns event IDs
```

#### 2.2 Add Calendar Change Listener

```typescript
// src/services/calendar/commitment-conflict-detector.ts

export interface CommitmentConflict {
  commitmentId: string;
  commitmentText: string;
  conflictingEvent: CalendarEvent;
  severity: 'blocked' | 'reduced' | 'at_risk';
  suggestion: string;
}

export async function checkCommitmentConflicts(
  userId: string,
  newEvent: CalendarEvent
): Promise<CommitmentConflict[]>;

export async function onCalendarChange(
  userId: string,
  change: CalendarChange
): Promise<void>;
```

#### 2.3 Update Commitment Keeper

```typescript
// src/services/superhuman/commitment-keeper.ts

// ADD: Calendar validation when commitment detected
export async function detectAndValidateCommitment(
  userId: string,
  transcript: string
): Promise<{
  commitment: Commitment | null;
  feasibility: CommitmentFeasibility | null;
}> {
  const commitment = detectCommitment(transcript);
  if (!commitment) return { commitment: null, feasibility: null };

  const feasibility = await validateCommitmentFeasibility(userId, commitment);

  return { commitment, feasibility };
}

// ADD: Calendar block creation
export async function saveCommitmentWithCalendarBlock(
  userId: string,
  commitment: Commitment,
  createCalendarBlocks: boolean
): Promise<{ commitment: Commitment; calendarEventIds: string[] }>;
```

#### 2.4 Tests for Phase 2

```typescript
// src/services/superhuman/__tests__/commitment-calendar.test.ts
describe('Commitment + Calendar Integration', () => {
  describe('validateCommitmentFeasibility', () => {
    it('returns feasible for clear calendar', async () => {
      await setupLightCalendarWeek(userId);

      const commitment = createTestCommitment({
        text: 'Work out 3 times',
        type: 'habit',
        frequency: { times: 3, period: 'week' },
      });

      const result = await validateCommitmentFeasibility(userId, commitment);

      expect(result.feasible).toBe(true);
      expect(result.score).toBeGreaterThan(80);
      expect(result.suggestedSlots.length).toBeGreaterThanOrEqual(3);
    });

    it('returns not feasible for packed calendar', async () => {
      await setupPackedCalendarWeek(userId); // 40h meetings

      const commitment = createTestCommitment({
        text: 'Work out 5 times',
        type: 'habit',
        frequency: { times: 5, period: 'week' },
        duration: 60,
      });

      const result = await validateCommitmentFeasibility(userId, commitment);

      expect(result.feasible).toBe(false);
      expect(result.suggestion).toMatch(/packed|busy|3 times|fewer/i);
    });

    it('suggests alternative times', async () => {
      await setupModeratCalendarWeek(userId);

      const commitment = createTestCommitment({
        text: 'Morning meditation',
        type: 'habit',
        preferredTime: 'morning',
      });

      const result = await validateCommitmentFeasibility(userId, commitment);

      expect(result.suggestedSlots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            start: expect.any(Date),
            end: expect.any(Date),
          }),
        ])
      );
    });
  });

  describe('checkCommitmentConflicts', () => {
    it('detects when new event blocks commitment', async () => {
      // Setup: Commitment to workout Mon/Wed/Fri 7am
      await saveCommitment(userId, {
        text: 'Workout',
        calendarEventIds: ['workout_mon', 'workout_wed', 'workout_fri'],
      });

      // New event overlaps Wednesday
      const newEvent = createTestEvent({
        title: 'Early client call',
        start: wednesday('6:30am'),
        duration: 90,
      });

      const conflicts = await checkCommitmentConflicts(userId, newEvent);

      expect(conflicts).toContainEqual(
        expect.objectContaining({
          commitmentText: 'Workout',
          severity: 'blocked',
          suggestion: expect.stringMatching(/reschedule|move/i),
        })
      );
    });
  });

  describe('createCalendarBlockForCommitment', () => {
    it('creates calendar events for commitment', async () => {
      const commitment = createTestCommitment({
        text: 'Exercise 3x/week',
        duration: 45,
      });

      const slots = await findTimeForCommitment(userId, commitment);
      const eventIds = await createCalendarBlockForCommitment(userId, commitment, slots);

      expect(eventIds.length).toBe(3);

      const events = await getCalendarEvents(userId, thisWeek());
      const exerciseEvents = events.filter(e => e.title.includes('Exercise'));
      expect(exerciseEvents.length).toBe(3);
    });
  });
});
```

#### 2.5 Deliverables

- [ ] `src/services/superhuman/commitment-calendar-integration.ts`
- [ ] `src/services/calendar/commitment-conflict-detector.ts`
- [ ] Updated `src/services/superhuman/commitment-keeper.ts`
- [ ] `src/services/superhuman/__tests__/commitment-calendar.test.ts`
- [ ] Integration test: `src/tests/integration/commitment-calendar.test.ts`
- [ ] E2E test: `e2e/calendar/commitment-tracking.spec.ts`

---

### Phase 3: Ambient Calendar Awareness

**Duration**: 1.5 weeks
**Priority**: P1

#### 3.1 Create Ambient Awareness Service

```typescript
// src/services/calendar/ambient-calendar-awareness.ts

export interface AmbientCalendarContext {
  // Upcoming meeting awareness
  nextMeeting: {
    event: CalendarEvent | null;
    minutesUntil: number | null;
    shouldWarnUser: boolean;
    wrapUpSuggestion: string | null;
  };

  // Recent meeting awareness
  justEndedMeeting: {
    event: CalendarEvent | null;
    minutesSince: number | null;
    followUpPrompt: string | null;
  };

  // Current state
  currentlyInMeeting: boolean;
  currentMeeting: CalendarEvent | null;

  // Day context
  remainingMeetingsToday: number;
  nextBreakDuration: number | null;
}

export async function getAmbientCalendarContext(userId: string): Promise<AmbientCalendarContext>;

export function generateAmbientContextInjection(context: AmbientCalendarContext): string | null;
```

#### 3.2 Integrate with Turn Handler

```typescript
// src/agents/realtime/turn-handler.ts

// ADD: Ambient calendar check at turn start
async function buildTurnContext(userId: string, personaId: string): Promise<TurnContext> {
  const existingContext = await buildExistingContext(userId, personaId);

  // NEW: Ambient calendar awareness
  const ambientCalendar = await getAmbientCalendarContext(userId);
  const calendarInjection = generateAmbientContextInjection(ambientCalendar);

  if (calendarInjection) {
    existingContext.hints.push(calendarInjection);
  }

  // If meeting soon, add urgency
  if (ambientCalendar.nextMeeting.shouldWarnUser) {
    existingContext.urgency = 'meeting_soon';
    existingContext.hints.push(
      `User has "${ambientCalendar.nextMeeting.event?.title}" in ${ambientCalendar.nextMeeting.minutesUntil} minutes. Be concise or offer to continue later.`
    );
  }

  // If just ended meeting, add check-in opportunity
  if (ambientCalendar.justEndedMeeting.event) {
    existingContext.hints.push(
      `User just finished "${ambientCalendar.justEndedMeeting.event.title}". Consider asking how it went if appropriate.`
    );
  }

  return existingContext;
}
```

#### 3.3 Tests for Phase 3

```typescript
// src/services/calendar/__tests__/ambient-calendar-awareness.test.ts
describe('Ambient Calendar Awareness', () => {
  describe('getAmbientCalendarContext', () => {
    it('detects meeting starting in 5 minutes', async () => {
      await createTestEvent(userId, {
        title: 'Team Standup',
        start: inMinutes(5),
      });

      const context = await getAmbientCalendarContext(userId);

      expect(context.nextMeeting.event?.title).toBe('Team Standup');
      expect(context.nextMeeting.minutesUntil).toBe(5);
      expect(context.nextMeeting.shouldWarnUser).toBe(true);
    });

    it('detects meeting just ended', async () => {
      await createTestEvent(userId, {
        title: 'Performance Review',
        start: inMinutes(-65),
        duration: 60,
      });

      const context = await getAmbientCalendarContext(userId);

      expect(context.justEndedMeeting.event?.title).toBe('Performance Review');
      expect(context.justEndedMeeting.minutesSince).toBeLessThan(10);
      expect(context.justEndedMeeting.followUpPrompt).toMatch(/how did it go/i);
    });

    it('detects currently in meeting', async () => {
      await createTestEvent(userId, {
        title: 'Client Call',
        start: inMinutes(-30),
        duration: 60,
      });

      const context = await getAmbientCalendarContext(userId);

      expect(context.currentlyInMeeting).toBe(true);
      expect(context.currentMeeting?.title).toBe('Client Call');
    });
  });

  describe('generateAmbientContextInjection', () => {
    it('generates wrap-up suggestion for imminent meeting', () => {
      const context: AmbientCalendarContext = {
        nextMeeting: {
          event: { title: 'Standup' } as CalendarEvent,
          minutesUntil: 3,
          shouldWarnUser: true,
          wrapUpSuggestion: 'Wrap up and prepare for standup',
        },
        // ... other fields
      };

      const injection = generateAmbientContextInjection(context);

      expect(injection).toContain('meeting in 3 minutes');
      expect(injection).toContain('wrap up');
    });

    it('generates post-meeting check-in for high-stakes meeting', () => {
      const context: AmbientCalendarContext = {
        justEndedMeeting: {
          event: { title: 'Performance Review' } as CalendarEvent,
          minutesSince: 5,
          followUpPrompt: 'Ask how the performance review went',
        },
        // ... other fields
      };

      const injection = generateAmbientContextInjection(context);

      expect(injection).toContain('Performance Review');
      expect(injection).toContain('how it went');
    });
  });
});
```

#### 3.4 Deliverables

- [ ] `src/services/calendar/ambient-calendar-awareness.ts`
- [ ] Updated turn handler with ambient awareness
- [ ] `src/services/calendar/__tests__/ambient-calendar-awareness.test.ts`
- [ ] E2E test: `e2e/calendar/ambient-awareness.spec.ts`

---

### Phase 4: Memory-Enriched Meeting Intelligence

**Duration**: 2 weeks
**Priority**: P1

#### 4.1 Create Meeting Memory Service

```typescript
// src/services/calendar/meeting-memory-service.ts

export interface MeetingMemoryContext {
  attendee: string;
  relationship: {
    type: string; // 'colleague', 'client', 'friend', etc.
    sentiment: 'positive' | 'neutral' | 'complex';
    interactionCount: number;
  };
  lastInteraction: {
    date: Date;
    topics: string[];
    commitmentsMade: string[];
    openItems: string[];
  } | null;
  patterns: {
    typicalMeetingTopics: string[];
    averageDuration: number;
    typicalOutcomes: string[];
  };
  personalNotes: string[];
}

export async function getMeetingAttendeeContext(
  userId: string,
  attendeeEmail: string
): Promise<MeetingMemoryContext | null>;

export async function enrichPreMeetingBriefing(
  userId: string,
  event: CalendarEvent
): Promise<EnrichedBriefing>;
```

#### 4.2 Update Proactive Calendar

```typescript
// src/services/calendar/proactive-calendar.ts

// ENHANCE: generateBriefing with memory context
async function generateBriefing(
  userId: string,
  event: CalendarEvent,
  minutesUntil: number
): Promise<PreMeetingBriefing['briefing']> {
  const prepTips: string[] = [];

  // EXISTING: Time-based tips
  // ... existing code ...

  // NEW: Memory-enriched context
  if (event.attendees?.length) {
    for (const attendee of event.attendees.slice(0, 3)) { // Top 3 attendees
      const memoryContext = await getMeetingAttendeeContext(userId, attendee);

      if (memoryContext?.lastInteraction) {
        prepTips.push(
          `Last time with ${memoryContext.relationship.type === 'client' ? attendee.split('@')[0] : attendee.split('@')[0]}, you discussed: ${memoryContext.lastInteraction.topics.slice(0, 2).join(', ')}`
        );

        if (memoryContext.lastInteraction.commitmentsMade.length > 0) {
          prepTips.push(
            `You mentioned you'd: ${memoryContext.lastInteraction.commitmentsMade[0]}`
          );
        }
      }
    }
  }

  return {
    summary,
    prepTips: prepTips.slice(0, 5),
    relevantContext: memoryContext?.lastInteraction?.topics.join(', '),
    attendeeInfo: event.attendees?.join(', '),
  };
}
```

#### 4.3 Tests for Phase 4

```typescript
// src/services/calendar/__tests__/meeting-memory.test.ts
describe('Meeting Memory Service', () => {
  describe('getMeetingAttendeeContext', () => {
    it('retrieves last interaction topics', async () => {
      await storeConversationMemory(userId, {
        person: 'sarah@company.com',
        topics: ['Q4 planning', 'Budget review'],
        date: daysAgo(7),
      });

      const context = await getMeetingAttendeeContext(userId, 'sarah@company.com');

      expect(context?.lastInteraction?.topics).toContain('Q4 planning');
      expect(context?.lastInteraction?.topics).toContain('Budget review');
    });

    it('retrieves open commitments', async () => {
      await saveCommitment(userId, {
        text: 'Send proposal to Sarah',
        person: 'sarah@company.com',
        status: 'pending',
      });

      const context = await getMeetingAttendeeContext(userId, 'sarah@company.com');

      expect(context?.lastInteraction?.commitmentsMade).toContain('Send proposal to Sarah');
    });

    it('calculates relationship patterns', async () => {
      // Multiple past meetings
      await storeMultipleInteractions(userId, 'sarah@company.com', 10);

      const context = await getMeetingAttendeeContext(userId, 'sarah@company.com');

      expect(context?.relationship.interactionCount).toBe(10);
      expect(context?.patterns.typicalMeetingTopics.length).toBeGreaterThan(0);
    });
  });

  describe('enrichPreMeetingBriefing', () => {
    it('includes memory context in briefing', async () => {
      await setupRelationshipHistory(userId, 'client@company.com');

      const event = createTestEvent({
        title: 'Client Review',
        attendees: ['client@company.com'],
        start: inMinutes(30),
      });

      const briefing = await enrichPreMeetingBriefing(userId, event);

      expect(briefing.prepTips).toContainEqual(
        expect.stringMatching(/last time.*discussed/i)
      );
    });
  });
});
```

#### 4.4 Deliverables

- [ ] `src/services/calendar/meeting-memory-service.ts`
- [ ] Updated `src/services/calendar/proactive-calendar.ts`
- [ ] `src/services/calendar/__tests__/meeting-memory.test.ts`
- [ ] E2E test: `e2e/calendar/pre-meeting-intelligence.spec.ts`

---

### Phase 5: Maya Habit-Calendar Integration

**Duration**: 1.5 weeks
**Priority**: P1

#### 5.1 Create Habit-Calendar Service

```typescript
// src/services/habits/habit-calendar-integration.ts

export interface HabitCalendarInsight {
  habitId: string;
  habitName: string;

  // Calendar correlation
  missedOnHeavyDays: boolean;
  completionRateOnHeavyDays: number;
  completionRateOnLightDays: number;

  // Suggestions
  suggestedAdaptation: {
    type: 'shorter_version' | 'different_time' | 'reschedule';
    description: string;
    alternativeSlots?: TimeSlot[];
  } | null;

  // Celebration context
  celebrationContext: {
    wasOnBusyDay: boolean;
    meetingsAroundHabit: number;
    extraPraiseDeserved: boolean;
  } | null;
}

export async function getHabitCalendarInsights(
  userId: string,
  habitId: string
): Promise<HabitCalendarInsight>;

export async function getTomorrowHabitRecommendations(
  userId: string
): Promise<HabitRecommendation[]>;
```

#### 5.2 Integrate with Maya's Context Builder

```typescript
// src/intelligence/context-builders/maya-coaching-insights.ts

// ADD: Calendar awareness to Maya's context
export async function buildMayaCoachingContext(
  userId: string
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // EXISTING: Habit insights
  // ... existing code ...

  // NEW: Calendar-correlated insights
  const tomorrowOverview = await getDayOverview(userId, tomorrow());
  const habits = await getUserHabits(userId);

  if (tomorrowOverview.isOverloaded) {
    const adaptations = await getTomorrowHabitRecommendations(userId);

    injections.push(createHighInjection({
      label: 'Calendar-Aware Habit Coaching',
      content: `Tomorrow is packed (${tomorrowOverview.totalMeetings} meetings, ${Math.round(tomorrowOverview.freeTimeMinutes / 60)}h free). Consider suggesting:
${adaptations.map(a => `• ${a.habitName}: ${a.suggestion}`).join('\n')}`,
    }));
  }

  // Celebration context for completed habits on busy days
  const todayCompletions = await getTodayCompletedHabits(userId);
  const todayOverview = await getDayOverview(userId, new Date());

  if (todayOverview.isOverloaded && todayCompletions.length > 0) {
    injections.push(createHighInjection({
      label: 'Extra Celebration Deserved',
      content: `User completed ${todayCompletions.length} habit(s) on a day with ${todayOverview.totalMeetings} meetings. This shows serious commitment—celebrate extra!`,
    }));
  }

  return injections;
}
```

#### 5.3 Tests for Phase 5

```typescript
// src/services/habits/__tests__/habit-calendar.test.ts
describe('Habit-Calendar Integration', () => {
  describe('getHabitCalendarInsights', () => {
    it('detects correlation between busy days and missed habits', async () => {
      // Setup: Heavy calendar days overlap with missed workout days
      await setupWeeksOfData(userId, {
        heavyDays: [monday, wednesday, friday],
        missedHabitDays: [monday, wednesday, friday],
        completedHabitDays: [tuesday, thursday],
      });

      const insights = await getHabitCalendarInsights(userId, 'workout');

      expect(insights.missedOnHeavyDays).toBe(true);
      expect(insights.completionRateOnHeavyDays).toBeLessThan(0.2);
      expect(insights.completionRateOnLightDays).toBeGreaterThan(0.8);
    });

    it('suggests shorter version for heavy days', async () => {
      await setupHeavyCalendarTomorrow(userId);

      const habits = await getUserHabits(userId);
      const workoutHabit = habits.find(h => h.name === 'Morning Workout');

      const insights = await getHabitCalendarInsights(userId, workoutHabit.id);

      expect(insights.suggestedAdaptation?.type).toBe('shorter_version');
      expect(insights.suggestedAdaptation?.description).toMatch(/15.?minute|quick/i);
    });
  });

  describe('getTomorrowHabitRecommendations', () => {
    it('returns adapted recommendations for busy day', async () => {
      await setupHeavyCalendarTomorrow(userId);
      await setupHabits(userId, ['Morning Workout', 'Meditation', 'Reading']);

      const recommendations = await getTomorrowHabitRecommendations(userId);

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          habitName: 'Morning Workout',
          suggestion: expect.stringMatching(/shorter|15 minute|quick/i),
        })
      );
    });
  });

  describe('celebration context', () => {
    it('marks extra praise deserved on busy days', async () => {
      await setupHeavyCalendarToday(userId);
      await completeHabit(userId, 'workout');

      const insights = await getHabitCalendarInsights(userId, 'workout');

      expect(insights.celebrationContext?.wasOnBusyDay).toBe(true);
      expect(insights.celebrationContext?.extraPraiseDeserved).toBe(true);
    });
  });
});
```

#### 5.4 Deliverables

- [ ] `src/services/habits/habit-calendar-integration.ts`
- [ ] Updated `src/intelligence/context-builders/maya-coaching-insights.ts`
- [ ] `src/services/habits/__tests__/habit-calendar.test.ts`
- [ ] E2E test: `e2e/calendar/habit-calendar-correlation.spec.ts`

---

### Phase 6: Jordan Milestone Calendar Sync

**Duration**: 1 week
**Priority**: P2

#### 6.1 Create Milestone Calendar Service

```typescript
// src/services/milestones/milestone-calendar-sync.ts

export interface MilestoneCalendarSync {
  milestoneId: string;
  calendarEventId: string | null;
  countdownReminders: Date[];
  prepTimeBlocked: boolean;
}

export async function syncMilestoneToCalendar(
  userId: string,
  milestoneId: string
): Promise<MilestoneCalendarSync>;

export async function createMilestoneCountdown(
  userId: string,
  milestoneId: string,
  reminderSchedule: number[] // days before
): Promise<string[]>; // reminder event IDs

export async function injectMilestoneCountdownToDaily(
  userId: string
): Promise<string | null>;
```

#### 6.2 Tests for Phase 6

```typescript
describe('Milestone Calendar Sync', () => {
  it('creates calendar event for milestone', async () => {
    const milestone = await createMilestone(userId, {
      name: 'Product Launch',
      date: inDays(30),
    });

    const sync = await syncMilestoneToCalendar(userId, milestone.id);

    expect(sync.calendarEventId).not.toBeNull();

    const events = await getCalendarEvents(userId);
    expect(events).toContainEqual(
      expect.objectContaining({ title: 'Product Launch' })
    );
  });

  it('creates countdown reminders', async () => {
    const milestone = await createMilestone(userId, {
      name: 'Wedding',
      date: inDays(60),
    });

    const reminderIds = await createMilestoneCountdown(
      userId,
      milestone.id,
      [30, 14, 7, 1]
    );

    expect(reminderIds.length).toBe(4);
  });

  it('injects countdown to daily briefing', async () => {
    await createMilestone(userId, {
      name: 'Marathon',
      date: inDays(3),
    });

    const injection = await injectMilestoneCountdownToDaily(userId);

    expect(injection).toContain('Marathon');
    expect(injection).toContain('3 days');
  });
});
```

#### 6.3 Deliverables

- [ ] `src/services/milestones/milestone-calendar-sync.ts`
- [ ] Updated Jordan milestone tools
- [ ] `src/services/milestones/__tests__/milestone-calendar.test.ts`

---

### Phase 7: Recovery Protection

**Duration**: 1 week
**Priority**: P2

#### 7.1 Create Recovery Protection Service

```typescript
// src/services/calendar/recovery-protection.ts

export interface RecoveryRecommendation {
  type: 'block_time' | 'decline_meeting' | 'delegate' | 'reschedule';
  reason: string;
  suggestedAction: {
    eventToCreate?: Partial<CalendarEvent>;
    eventToDecline?: string;
    message?: string;
  };
  urgency: 'immediate' | 'today' | 'this_week';
}

export async function detectRecoveryNeeds(userId: string): Promise<RecoveryRecommendation[]>;

export async function autoBlockRecoveryTime(
  userId: string,
  afterMeetingStreak: number // minutes of consecutive meetings
): Promise<CalendarEvent | null>;
```

#### 7.2 Tests for Phase 7

```typescript
describe('Recovery Protection', () => {
  it('suggests blocking time after 3h meeting streak', async () => {
    // Setup: User in back-to-back meetings for 3 hours
    await setupConsecutiveMeetings(userId, 3 * 60);

    const recommendations = await detectRecoveryNeeds(userId);

    expect(recommendations).toContainEqual(
      expect.objectContaining({
        type: 'block_time',
        reason: expect.stringMatching(/3 hours|consecutive/i),
        urgency: 'immediate',
      })
    );
  });

  it('auto-blocks recovery time when enabled', async () => {
    await enableAutoRecovery(userId, { afterMinutes: 180 });
    await setupConsecutiveMeetings(userId, 180);

    const event = await autoBlockRecoveryTime(userId, 180);

    expect(event).not.toBeNull();
    expect(event?.title).toMatch(/recovery|break|rest/i);
  });
});
```

#### 7.3 Deliverables

- [ ] `src/services/calendar/recovery-protection.ts`
- [ ] `src/services/calendar/__tests__/recovery-protection.test.ts`

---

## Part 4: Success Metrics

### 4.1 Test Coverage Targets

| Area | Current | Phase 1 | Phase 3 | Phase 5 | Final |
|------|---------|---------|---------|---------|-------|
| Calendar Service | 75% | 85% | 90% | 90% | 95% |
| Calendar Intelligence | 60% | 80% | 85% | 90% | 95% |
| Capacity Guardian | 45% | 80% | 85% | 90% | 95% |
| Commitment Keeper | 50% | 80% | 85% | 90% | 95% |
| Maya Insights | 40% | 40% | 60% | 80% | 90% |
| Integration Tests | 10% | 40% | 60% | 70% | 80% |
| E2E Tests | 0% | 20% | 40% | 60% | 80% |

### 4.2 "Better Than Human" Feature Verification

| Feature | Verification Method | Success Criteria |
|---------|---------------------|------------------|
| Calendar → Burnout Risk | Unit + E2E test | Meeting hours affect risk score |
| Commitment Feasibility | Unit + E2E test | Warns when calendar too packed |
| Ambient Awareness | E2E test | Conversation adapts to meeting time |
| Memory-Enriched Briefings | E2E test | Past topics appear in briefing |
| Habit-Calendar Correlation | Unit test | Detects pattern with 90%+ accuracy |
| Recovery Protection | Unit test | Suggests block after 3h meetings |

### 4.3 Quality Gates

Before each phase merge:

```bash
# Must pass
pnpm typecheck
pnpm lint
pnpm test -- --coverage --threshold=80
pnpm test:integration
pnpm test:e2e

# Quality metrics
pnpm quality:check  # No regressions
pnpm quality:arch   # No layer violations
```

---

## Part 5: Implementation Timeline

```
Week 1: Phase 0 - Foundation
├── Test infrastructure
├── Calendar mocking utilities
└── CI pipeline updates

Week 2-3: Phase 1 - Capacity Guardian
├── Calendar Load Service
├── Burnout risk integration
└── Unit + Integration tests

Week 4-5: Phase 2 - Commitment Keeper
├── Feasibility validation
├── Calendar block creation
└── Conflict detection

Week 6: Phase 3 - Ambient Awareness
├── Meeting proximity detection
├── Turn handler integration
└── E2E tests

Week 7-8: Phase 4 - Memory Enrichment
├── Meeting memory service
├── Briefing enhancement
└── E2E tests

Week 9: Phase 5 - Maya Integration
├── Habit-calendar correlation
├── Maya context updates
└── E2E tests

Week 10: Phase 6 & 7 - Milestone & Recovery
├── Jordan milestone sync
├── Recovery protection
└── Final integration tests
```

---

## Part 6: File Structure

```
src/
├── services/
│   ├── calendar/
│   │   ├── __tests__/
│   │   │   ├── calendar-load-service.test.ts      [NEW Phase 1]
│   │   │   ├── ambient-calendar-awareness.test.ts [NEW Phase 3]
│   │   │   ├── meeting-memory.test.ts             [NEW Phase 4]
│   │   │   ├── recovery-protection.test.ts        [NEW Phase 7]
│   │   │   └── ... (existing tests)
│   │   ├── calendar-load-service.ts               [NEW Phase 1]
│   │   ├── ambient-calendar-awareness.ts          [NEW Phase 3]
│   │   ├── meeting-memory-service.ts              [NEW Phase 4]
│   │   ├── recovery-protection.ts                 [NEW Phase 7]
│   │   ├── commitment-conflict-detector.ts        [NEW Phase 2]
│   │   └── ... (existing files)
│   ├── superhuman/
│   │   ├── __tests__/
│   │   │   ├── capacity-guardian-calendar.test.ts [NEW Phase 1]
│   │   │   └── commitment-calendar.test.ts        [NEW Phase 2]
│   │   ├── commitment-calendar-integration.ts     [NEW Phase 2]
│   │   ├── capacity-guardian.ts                   [UPDATED Phase 1]
│   │   └── commitment-keeper.ts                   [UPDATED Phase 2]
│   ├── habits/
│   │   ├── __tests__/
│   │   │   └── habit-calendar.test.ts             [NEW Phase 5]
│   │   └── habit-calendar-integration.ts          [NEW Phase 5]
│   └── milestones/
│       ├── __tests__/
│       │   └── milestone-calendar.test.ts         [NEW Phase 6]
│       └── milestone-calendar-sync.ts             [NEW Phase 6]
├── intelligence/
│   └── context-builders/
│       ├── calendar-awareness.ts                  [UPDATED]
│       └── maya-coaching-insights.ts              [UPDATED Phase 5]
├── tests/
│   ├── utils/
│   │   └── calendar-test-utils.ts                 [NEW Phase 0]
│   └── integration/
│       ├── calendar-capacity-guardian.test.ts     [NEW Phase 1]
│       ├── commitment-calendar.test.ts            [NEW Phase 2]
│       └── calendar-persona.test.ts               [NEW Phase 3]
└── e2e/
    └── calendar/
        ├── burnout-prevention.spec.ts             [NEW Phase 1]
        ├── commitment-tracking.spec.ts            [NEW Phase 2]
        ├── ambient-awareness.spec.ts              [NEW Phase 3]
        ├── pre-meeting-intelligence.spec.ts       [NEW Phase 4]
        └── habit-calendar-correlation.spec.ts     [NEW Phase 5]
```

---

## Part 7: Quick Start Checklist

### Before Starting

- [ ] Read `BETTER-THAN-HUMAN.md` for philosophy
- [ ] Run existing calendar tests: `pnpm test -- src/services/calendar/`
- [ ] Review current coverage: `pnpm test -- --coverage src/services/calendar/`
- [ ] Set up Firestore emulator for integration tests

### Phase 0 Kickoff

- [ ] Create `src/tests/utils/calendar-test-utils.ts`
- [ ] Add calendar coverage to CI
- [ ] Create E2E test infrastructure

### Each Phase Completion Criteria

- [ ] All new unit tests pass
- [ ] Integration test passes
- [ ] E2E test passes (where applicable)
- [ ] Coverage target met
- [ ] Code reviewed
- [ ] Documentation updated

---

## Appendix A: Test Data Scenarios

### Burnout Scenario

```typescript
export const BURNOUT_SCENARIO = {
  weeklyMeetingHours: 38,
  focusTimeRatio: 0.08,
  backToBackPercentage: 75,
  consecutiveDaysOverloaded: 4,
  energyReadings: [
    { level: 'low', day: -3 },
    { level: 'low', day: -2 },
    { level: 'depleted', day: -1 },
    { level: 'depleted', day: 0 },
  ],
};
```

### Healthy Week Scenario

```typescript
export const HEALTHY_WEEK = {
  weeklyMeetingHours: 15,
  focusTimeRatio: 0.55,
  backToBackPercentage: 10,
  consecutiveDaysOverloaded: 0,
};
```

### Packed Day Scenario

```typescript
export const PACKED_DAY = {
  meetings: [
    { start: '8:00', duration: 60 },
    { start: '9:00', duration: 60 },
    { start: '10:00', duration: 60 },
    { start: '11:00', duration: 30 },
    { start: '12:00', duration: 60 },
    { start: '13:30', duration: 90 },
    { start: '15:30', duration: 60 },
    { start: '16:30', duration: 60 },
  ],
  totalMeetingMinutes: 480,
  freeTimeMinutes: 0,
};
```

---

## Appendix B: "Better Than Human" Verification Matrix

| Capability | Human Limitation | Ferni Capability | Test File |
|------------|-----------------|------------------|-----------|
| Perfect Calendar Memory | Forgets meeting history | Remembers all past meetings with person | `meeting-memory.test.ts` |
| Burnout Pattern Recognition | Doesn't track cumulative load | Detects 32h week + declining energy | `capacity-guardian-calendar.test.ts` |
| Commitment Validation | Doesn't check calendar | Warns if commitment conflicts | `commitment-calendar.test.ts` |
| Ambient Awareness | Gets distracted | Knows meeting in 5 min, wraps up | `ambient-awareness.spec.ts` |
| Habit-Calendar Correlation | Doesn't connect patterns | Knows busy days = skip days | `habit-calendar.test.ts` |
| Recovery Protection | Forgets to suggest breaks | Auto-suggests after 3h meetings | `recovery-protection.test.ts` |

---

*"Better than human" means knowing what they need before they do.*

