# Feature Completion Plan

> **Goal:** Get all 26 menu features to ✅ Working status with e2e validation  
> **Philosophy:** Ship complete features, not partial ones

---

## Current Gap Analysis

| Feature             | UI  | Backend | Integration | E2E Test | Status      |
| ------------------- | :-: | :-----: | :---------: | :------: | ----------- |
| Memory Browser      | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Contact Info        | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Voice ID            | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Household Members   | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Link Calendar       | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Wellbeing Dashboard | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Progress Analytics  | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Prediction Accuracy | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Team Huddles        | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |
| Upcoming Check-ins  | ✅  |   ✅    |     ✅      |    ✅    | ✅ Complete |

> **Updated:** Dec 10, 2025 - ALL 10 features complete with E2E tests! 🎉

---

## Feature 1: Voice Identity System

**Current State:** Beautiful UI, identity orchestrator exists but not wired to frontend

### Backend Tasks

- [ ] Wire `identity-orchestrator.ts` to voice agent
- [ ] Implement `verifyUser()` in voice pipeline
- [ ] Implement `identifySpeaker()` for household detection
- [ ] Add `saveVoiceProfile()` persistence to Firestore
- [ ] Create `/api/v1/voice/enroll` endpoint
- [ ] Create `/api/v1/voice/verify` endpoint
- [ ] Create `/api/v1/voice/profile` endpoint (get/delete)

### Frontend Tasks

- [ ] Connect `voice-enrollment.ui.ts` to enrollment API
- [ ] Connect `voice-id-badge.ui.ts` to verification status
- [ ] Connect `speaker-change-indicator.ui.ts` to identity changes

### Integration Tasks

- [ ] Voice agent sends enrollment samples to backend
- [ ] Voice agent receives identity verification results
- [ ] UI receives real-time verification status updates
- [ ] Profile persists across sessions

### E2E Tests

```typescript
// e2e/voice-identity.spec.ts
- [ ] User can start voice enrollment
- [ ] Enrollment captures 5 voice samples
- [ ] Profile is created and persisted
- [ ] Subsequent sessions auto-verify user
- [ ] Unknown voice triggers re-identification prompt
- [ ] User can delete their voice profile
```

### Definition of Done

- User enrolls voice in < 2 minutes
- Auto-identifies enrolled user on reconnect
- Graceful handling of unrecognized voices
- Profile deletion removes all voice data

---

## Feature 2: Household Management

**Current State:** Complete UI, no backend persistence

### Backend Tasks

- [ ] Create `src/services/household.service.ts`
- [ ] Create Firestore schema: `households/{householdId}`
- [ ] Create `/api/v1/household` CRUD endpoints
- [ ] Add household membership validation
- [ ] Implement role-based permissions (owner, adult, child, guest)
- [ ] Wire to voice identity for multi-user detection

### Frontend Tasks

- [ ] Connect `household-manager.ui.ts` to household API
- [ ] Persist settings (autoIdentify, guestMode, childSafeMode)
- [ ] Show member activity (lastSeen)
- [ ] Add member invite flow

### Integration Tasks

- [ ] Voice identity detects household member
- [ ] Context switches to correct user profile
- [ ] Preferences load for identified member
- [ ] Child-safe mode filters content appropriately

### E2E Tests

```typescript
// e2e/household.spec.ts
- [ ] Owner can create household
- [ ] Owner can add members
- [ ] Members can be assigned roles
- [ ] Voice identifies different household members
- [ ] Each member has isolated preferences
- [ ] Child mode restricts content appropriately
```

### Definition of Done

- Family of 4 can share one device
- Each person auto-identified by voice
- Personal preferences maintained per person
- Owner controls household settings

---

## Feature 3: Calendar Integration

**Current State:** UI exists, Google OAuth not implemented

### Backend Tasks

- [ ] Set up Google Calendar API credentials
- [ ] Create `/api/v1/integrations/calendar/connect` (OAuth start)
- [ ] Create `/api/v1/integrations/calendar/callback` (OAuth callback)
- [ ] Create `/api/v1/integrations/calendar/events` (fetch events)
- [ ] Create `/api/v1/integrations/calendar/disconnect`
- [ ] Store refresh tokens securely in Firestore
- [ ] Implement token refresh logic

### Frontend Tasks

- [ ] Connect `calendar-settings.ui.ts` to OAuth flow
- [ ] Show connection status
- [ ] Display upcoming events preview
- [ ] Add disconnect option

### Integration Tasks

- [ ] Voice agent receives calendar context
- [ ] Ferni can proactively mention upcoming events
- [ ] "What's on my calendar" tool works
- [ ] Event anticipation in conversations

### E2E Tests

```typescript
// e2e/calendar.spec.ts
- [ ] User can initiate Google OAuth
- [ ] OAuth callback stores credentials
- [ ] Calendar events display in settings
- [ ] Voice agent mentions upcoming events
- [ ] User can disconnect calendar
- [ ] Tokens refresh automatically
```

### Definition of Done

- One-click Google Calendar connection
- Ferni knows about upcoming events
- "What's on my calendar today?" works
- Proactive: "I see you have a meeting in 30 minutes"

---

## Feature 4: Wellbeing Dashboard

**Current State:** Beautiful UI, needs data aggregation backend

### Backend Tasks

- [ ] Create `src/services/wellbeing-aggregator.service.ts`
- [ ] Aggregate mood data from conversations
- [ ] Calculate dimension scores (mood, energy, worry, etc.)
- [ ] Generate sparkline data (30-day trends)
- [ ] Create `/api/v1/wellbeing/dashboard` endpoint
- [ ] Implement achievement detection
- [ ] Generate predictions from patterns

### Frontend Tasks

- [ ] Connect `wellbeing-dashboard.ui.ts` to dashboard API
- [ ] Implement mood calendar rendering
- [ ] Implement dimension card sparklines
- [ ] Show achievements earned
- [ ] Display prediction insights

### Integration Tasks

- [ ] Mood tracking during conversations populates data
- [ ] Dashboard updates after each session
- [ ] Achievements trigger celebrations
- [ ] Predictions inform proactive outreach

### E2E Tests

```typescript
// e2e/wellbeing.spec.ts
- [ ] Dashboard loads with user data
- [ ] Mood calendar shows 30-day history
- [ ] Dimension cards show trends
- [ ] Sparklines render correctly
- [ ] Achievements display when earned
- [ ] Empty state shows for new users
```

### Definition of Done

- Dashboard shows personalized wellbeing data
- 30-day mood calendar works
- All 6 dimension cards populated
- Achievements earn and display

---

## Feature 5: Memory Browser

**Current State:** UI complete, memory service needs completion

### Backend Tasks

- [ ] Complete `src/memory/` service implementation
- [ ] Ensure all memory types persist correctly
- [ ] Create `/api/v1/memories/search` endpoint
- [ ] Create `/api/v1/memories/context` endpoint
- [ ] Implement topic extraction from conversations
- [ ] Store conversation summaries

### Frontend Tasks

- [ ] Connect `conversation-memory.ui.ts` to memories API
- [ ] Implement search functionality
- [ ] Show remembered details
- [ ] Display topic clusters
- [ ] Show unfinished threads

### Integration Tasks

- [ ] Voice agent stores memories after conversations
- [ ] Memory browser shows what Ferni remembers
- [ ] Search finds specific memories
- [ ] Context endpoint provides conversation priming

### E2E Tests

```typescript
// e2e/memory.spec.ts
- [ ] Memories persist after conversation
- [ ] Memory browser shows conversation history
- [ ] Search finds memories by content
- [ ] Topics cluster correctly
- [ ] Remembered details display
- [ ] Conversation context loads for new sessions
```

### Definition of Done

- User can browse everything Ferni remembers
- Search finds specific conversations
- Topics show conversation themes
- "Unfinished threads" prompts follow-ups

---

## Feature 6: Progress Analytics

**Current State:** UI complete, needs more data sources

### Backend Tasks

- [ ] Create `/api/v1/analytics/dashboard` endpoint
- [ ] Aggregate streak data from rituals
- [ ] Aggregate mood trends from wellbeing
- [ ] Calculate prediction accuracy over time
- [ ] Generate insights (best day, most consistent)

### Frontend Tasks

- [ ] Connect `analytics-dashboard.ui.ts` to analytics API
- [ ] Render streak trend chart
- [ ] Render mood trend visualization
- [ ] Show prediction accuracy graph
- [ ] Display personalized insights

### E2E Tests

```typescript
// e2e/analytics.spec.ts
- [ ] Dashboard loads analytics data
- [ ] Streak chart shows 30-day history
- [ ] Mood trends display correctly
- [ ] Insights are personalized
- [ ] Export button works
```

### Definition of Done

- Dashboard shows real user analytics
- All charts render with data
- Insights are meaningful and personalized

---

## Feature 7: Team Huddles

**Current State:** UI exists, multi-persona coordination needs refinement

### Backend Tasks

- [ ] Implement team huddle orchestration in voice agent
- [ ] Create `/api/v1/team/huddle/start` endpoint
- [ ] Create `/api/v1/team/huddle/participants` endpoint
- [ ] Store huddle transcripts and outcomes
- [ ] Implement persona coordination logic

### Frontend Tasks

- [ ] Connect `team-huddle.ui.ts` to huddle API
- [ ] Show active huddle participants
- [ ] Display huddle progress/phases
- [ ] Show recommendations from huddle

### E2E Tests

```typescript
// e2e/team-huddle.spec.ts
- [ ] User can request team huddle
- [ ] Multiple personas participate
- [ ] Huddle produces actionable recommendations
- [ ] Transcript is saved
```

### Definition of Done

- "Can I get the team's input?" triggers huddle
- 2-3 personas discuss the topic
- User receives synthesized recommendations

---

## Feature 8: Contact Settings

**Current State:** Basic, needs completion

### Backend Tasks

- [ ] Create `/api/v1/user/contacts` endpoint
- [ ] Store contact preferences (email, phone)
- [ ] Validate contact info formats
- [ ] Enable contact info for outreach

### Frontend Tasks

- [ ] Complete `contact-settings.ui.ts` form
- [ ] Add validation feedback
- [ ] Show saved confirmation

### E2E Tests

```typescript
// e2e/contact-settings.spec.ts
- [ ] User can save email
- [ ] User can save phone
- [ ] Validation rejects bad formats
- [ ] Settings persist
```

---

## Feature 9: Prediction Accuracy Tracker

**Current State:** Mostly working, needs better integration

### Backend Tasks

- [ ] Ensure predictions save to Firestore
- [ ] Create outcome tracking mechanism
- [ ] Calculate accuracy by category

### Frontend Tasks

- [ ] Connect tracker to real prediction data
- [ ] Show accuracy breakdowns
- [ ] Display prediction history

### E2E Tests

```typescript
// e2e/prediction-tracker.spec.ts
- [ ] Predictions display in tracker
- [ ] Outcomes can be recorded
- [ ] Accuracy calculates correctly
```

---

## Feature 10: Upcoming Check-ins

**Current State:** Shows scheduled, needs better connection

### Backend Tasks

- [ ] Ensure outreach schedule persists
- [ ] Create `/api/v1/outreach/upcoming` endpoint
- [ ] Enable rescheduling

### Frontend Tasks

- [ ] Show all upcoming check-ins
- [ ] Allow reschedule/cancel
- [ ] Show check-in history

### E2E Tests

```typescript
// e2e/outreach.spec.ts
- [ ] Scheduled check-ins display
- [ ] User can reschedule
- [ ] User can cancel
```

---

## Implementation Order

Based on dependencies and user value:

### Phase 1: Foundation (Week 1-2)

1. **Memory Browser** - Foundation for many features
2. **Contact Settings** - Simple win, enables outreach

### Phase 2: Core Identity (Week 2-3)

3. **Voice Identity** - Critical for household
4. **Household Members** - Depends on voice identity

### Phase 3: Integrations (Week 3-4)

5. **Calendar Integration** - Google OAuth
6. **Wellbeing Dashboard** - Depends on memory/analytics

### Phase 4: Polish (Week 4-5)

7. **Progress Analytics** - Aggregates other data
8. **Prediction Accuracy** - Minor gaps
9. **Team Huddles** - Complex, lower priority
10. **Upcoming Check-ins** - Minor gaps

---

## E2E Test Infrastructure

### Required Test Files

```
e2e/
├── voice-identity.spec.ts      # NEW
├── household.spec.ts           # NEW
├── calendar.spec.ts            # NEW
├── wellbeing.spec.ts           # NEW
├── memory.spec.ts              # NEW
├── analytics.spec.ts           # NEW
├── team-huddle.spec.ts         # NEW
├── contact-settings.spec.ts    # NEW
├── prediction-tracker.spec.ts  # NEW
├── outreach.spec.ts            # NEW
└── human-listening.spec.ts     # EXISTS
```

### Test Data Requirements

- Test user with conversation history
- Test user with rituals/streaks
- Test user with predictions
- Test household with multiple members
- Mock Google Calendar API
- Mock voice samples

---

## Success Metrics

| Feature   | Metric                | Target  |
| --------- | --------------------- | ------- |
| Voice ID  | Enrollment completion | > 90%   |
| Voice ID  | Recognition accuracy  | > 95%   |
| Household | Multi-user adoption   | Track   |
| Calendar  | Connection rate       | > 50%   |
| Wellbeing | Dashboard views/user  | 2+/week |
| Memory    | Search usage          | Track   |
| Analytics | Export usage          | Track   |

---

## Next Steps

1. **Pick Feature 1**: Memory Browser (foundation)
2. **Audit existing code**: What's actually there?
3. **Identify gaps**: What's missing?
4. **Implement**: Backend → Integration → E2E
5. **Validate**: Manual test → E2E passes
6. **Ship**: Mark as ✅ Working

Want me to deep-dive into any specific feature first?
