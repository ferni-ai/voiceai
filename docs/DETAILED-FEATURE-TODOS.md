# Detailed Feature Todo Lists

> Generated from comprehensive audit of each feature's UI, backend, and integration status.
> **Last Updated:** December 13, 2024

---

## Feature 3: Voice Identity System

**Status:** ✅ **WIRED** - Needs E2E testing only

> **UPDATE Dec 13:** This system is FULLY WIRED! The integration code was found in multiple handlers.

### Current State

| Component    | Status       | File                                                |
| ------------ | ------------ | --------------------------------------------------- |
| UI           | ✅ Complete  | `frontend-typescript/src/ui/voice-enrollment.ui.ts` |
| Backend APIs | ✅ Exist     | `src/api/voice-auth-handler.ts`                     |
| Service      | ✅ Exist     | `src/services/voice-enrollment.ts`                  |
| Orchestrator | ✅ Complete  | `src/services/trust-and-identity/identity-orchestrator.ts` |
| Integration  | ✅ **WIRED** | `src/services/trust-and-identity/voice-agent-integration.ts` |
| Firestore    | ✅ Ready     | Voice profiles persist                              |
| Voice Agent  | ✅ **WIRED** | See integration points below                        |

### ✅ Integration Points Found (Dec 13 Audit)

| Handler | Function Called | Purpose |
|---------|-----------------|---------|
| `user-identification-handler.ts` | `onSessionStart()` | Initialize identity session |
| `turn-processor.ts` | `onUserMessage()` | Process identity on each turn |
| `transcript-handler.ts` | `onUserMessage()` | Voice identity from transcripts |
| `turn-handler.ts` | `getResponseModification()` | Phone ask injection |
| `cleanup-handler.ts` | `onSessionEnd()` | Cleanup identity session |

### Remaining Tasks

- [x] ~~Wire identity orchestrator to voice agent~~ ✅ DONE
- [x] ~~Add profile recovery on session reconnect~~ ✅ DONE
- [ ] E2E test the complete flow
- [ ] Verify frontend enrollment UI works end-to-end
- [ ] Load test voice verification performance

### E2E Test (Still Needed)

```typescript
// e2e/voice-identity.spec.ts
- [ ] POST /api/voice/enroll/start returns session
- [ ] POST /api/voice/enroll/sample accepts samples
- [ ] POST /api/voice/enroll/complete creates profile
- [ ] GET /api/voice/profile returns enrolled profile
- [ ] DELETE /api/voice/profile removes profile
- [ ] UI enrollment flow works end-to-end
```

### Definition of Done

- [x] ~~Identity orchestrator integrated~~ ✅ DONE
- [ ] E2E tests pass
- [ ] Frontend enrollment verified working

---

## Feature 4: Household Management

**Status:** 🟡 Backend exists, frontend not wired

### Current State

| Component      | Status       | File                                                 |
| -------------- | ------------ | ---------------------------------------------------- |
| UI             | ✅ Complete  | `frontend-typescript/src/ui/household-manager.ui.ts` |
| Backend API    | ✅ Exists    | `src/api/household-routes.ts`                        |
| Firestore      | ✅ Ready     | `households/{userId}` collection                     |
| Voice Identity | 🔄 Dependent | Needs Voice ID for multi-user                        |

### Backend Tasks

- [ ] Verify GET `/api/household/:userId` returns data
- [ ] Verify POST `/api/household/:userId` saves data
- [ ] Add member validation (max members, roles)
- [ ] Wire household detection to voice identity

### Frontend Tasks

- [ ] Connect `household-manager.ui.ts` to `/api/household/*`
- [ ] Load existing household on modal open
- [ ] Save changes when user modifies settings
- [ ] Show member voice enrollment status
- [ ] Add member invite/remove functionality

### Integration Tasks

- [ ] Voice identifies which household member is speaking
- [ ] User preferences load for identified member
- [ ] Child-safe mode filters content when child detected
- [ ] Owner can manage all household settings

### E2E Test

```typescript
// e2e/household.spec.ts
- [ ] GET /api/household/:userId returns household
- [ ] POST /api/household/:userId creates/updates
- [ ] UI can add/remove members
- [ ] Settings persist across sessions
- [ ] Each member has separate preferences
```

### Definition of Done

- [ ] Household CRUD operations work
- [ ] Members displayed in UI
- [ ] Settings persist to Firestore
- [ ] (Stretch) Voice identifies different members

---

## Feature 5: Calendar Integration

**Status:** 🟡 Backend exists, needs OAuth setup

### Current State

| Component    | Status         | File                                                  |
| ------------ | -------------- | ----------------------------------------------------- |
| UI           | ✅ Exists      | `frontend-typescript/src/ui/calendar-settings.ui.ts`  |
| Backend APIs | ✅ Exist       | `src/api/v1/integrations/calendar.ts`                 |
| OAuth Flow   | 🔄 Code exists | Needs Google credentials                              |
| Service      | ✅ Exists      | `src/services/context-awareness/location-calendar.js` |

### Backend Tasks

- [ ] Set up Google Cloud project for OAuth
- [ ] Add GOOGLE_CALENDAR_CLIENT_ID to env
- [ ] Add GOOGLE_CALENDAR_CLIENT_SECRET to env
- [ ] Configure OAuth redirect URI
- [ ] Test token refresh logic
- [ ] Implement secure token storage in Firestore

### Frontend Tasks

- [ ] Connect `calendar-settings.ui.ts` to `/api/v1/integrations/calendar/*`
- [ ] Implement "Connect Google Calendar" button
- [ ] Handle OAuth redirect callback
- [ ] Show connection status
- [ ] Display upcoming events preview
- [ ] Implement disconnect functionality

### Integration Tasks

- [ ] Voice agent receives calendar context
- [ ] "What's on my calendar?" tool uses real data
- [ ] Proactive mentions of upcoming events
- [ ] Event reminders work

### E2E Test

```typescript
// e2e/calendar.spec.ts
- [ ] GET /api/v1/integrations/calendar/status works
- [ ] GET /api/v1/integrations/calendar/connect returns auth URL
- [ ] Calendar events endpoint returns data (mock)
- [ ] UI shows connection status
- [ ] Disconnect removes stored tokens
```

### Definition of Done

- [ ] Google OAuth flow works end-to-end
- [ ] Calendar events display in UI
- [ ] Voice agent knows about events
- [ ] Tokens refresh automatically

---

## Feature 6: Wellbeing Dashboard

**Status:** 🟡 Backend exists, needs data aggregation

### Current State

| Component        | Status      | File                                                          |
| ---------------- | ----------- | ------------------------------------------------------------- |
| UI               | ✅ Complete | `frontend-typescript/src/ui/wellbeing-dashboard.ui.ts`        |
| Backend APIs     | ✅ Exist    | `src/api/wellbeing-handler.ts`, `src/api/wellbeing-routes.ts` |
| Tracking Service | ✅ Exists   | `src/services/wellbeing-tracking/`                            |
| Data Aggregation | 🔄 Partial  | Needs conversation→wellbeing pipeline                         |

### Backend Tasks

- [ ] Verify `/api/wellbeing/dashboard` returns real data
- [ ] Implement mood extraction from conversations
- [ ] Calculate dimension scores (mood, energy, anxiety, etc.)
- [ ] Generate 30-day trend data
- [ ] Implement achievement detection
- [ ] Create prediction/insight generation

### Frontend Tasks

- [ ] Connect `wellbeing-dashboard.ui.ts` to `/api/wellbeing/dashboard`
- [ ] Render mood calendar with real data
- [ ] Render dimension cards with sparklines
- [ ] Show achievements when earned
- [ ] Display insights and predictions
- [ ] Handle empty state for new users

### Integration Tasks

- [ ] Conversations update wellbeing data
- [ ] Dashboard refreshes after sessions
- [ ] Achievements trigger celebrations
- [ ] Early warning system works

### E2E Test

```typescript
// e2e/wellbeing.spec.ts
- [ ] GET /api/wellbeing/dashboard returns data
- [ ] GET /api/wellbeing/trends returns trends
- [ ] POST /api/wellbeing/snapshot saves check-in
- [ ] UI displays dashboard correctly
- [ ] Empty state shows for new users
```

### Definition of Done

- [ ] Dashboard shows personalized data
- [ ] Mood calendar displays 30 days
- [ ] All 6 dimension cards work
- [ ] Insights are meaningful

---

## Feature 7: Progress Analytics

**Status:** 🟡 Backend exists, needs frontend wiring

### Current State

| Component    | Status      | File                                                   |
| ------------ | ----------- | ------------------------------------------------------ |
| UI           | ✅ Complete | `frontend-typescript/src/ui/analytics-dashboard.ui.ts` |
| Backend API  | ✅ Exists   | `src/api/routes/analytics.ts`                          |
| Data Sources | 🔄 Partial  | Needs aggregation from multiple sources                |

### Backend Tasks

- [ ] Verify `/api/analytics/user` returns complete data
- [ ] Aggregate streak data from rituals
- [ ] Aggregate mood trends from wellbeing
- [ ] Calculate prediction accuracy over time
- [ ] Generate personalized insights

### Frontend Tasks

- [ ] Connect `analytics-dashboard.ui.ts` to `/api/analytics/user`
- [ ] Render streak trend chart
- [ ] Render mood trend visualization
- [ ] Show prediction accuracy graph
- [ ] Display personalized insights
- [ ] Implement data export

### E2E Test

```typescript
// e2e/analytics.spec.ts
- [ ] GET /api/analytics/user returns data
- [ ] UI displays all charts
- [ ] Export button generates download
- [ ] Empty state for new users
```

### Definition of Done

- [ ] Dashboard shows real analytics
- [ ] All charts render with data
- [ ] Insights are personalized
- [ ] Export works

---

## Feature 8: Prediction Accuracy Tracker

**Status:** 🟢 Mostly complete, needs minor integration

### Current State

| Component          | Status    | File                                |
| ------------------ | --------- | ----------------------------------- |
| Backend APIs       | ✅ Exist  | `src/api/routes/predictions.ts`     |
| Prediction Storage | ✅ Works  | Firestore persistence               |
| Outcome Tracking   | ✅ Exists | `POST /api/predictions/:id/actuals` |

### Backend Tasks

- [ ] Verify predictions save to Firestore
- [ ] Verify outcome tracking updates accuracy
- [ ] Calculate accuracy by category

### Frontend Tasks

- [ ] Display prediction history in UI
- [ ] Allow recording outcomes
- [ ] Show accuracy breakdown by type

### E2E Test

```typescript
// e2e/prediction-tracker.spec.ts
- [ ] GET /api/predictions returns predictions
- [ ] POST /api/predictions/:id/actuals updates outcome
- [ ] Accuracy calculates correctly
```

### Definition of Done

- [ ] Predictions display correctly
- [ ] Outcomes can be recorded
- [ ] Accuracy metrics shown

---

## Feature 9: Team Huddles

**Status:** 🔴 Needs significant work

### Current State

| Component     | Status     | File                            |
| ------------- | ---------- | ------------------------------- |
| UI            | 🔄 Partial | Needs dedicated huddle UI       |
| Backend       | 🔄 Limited | `src/api/routes/team.ts` exists |
| Multi-Persona | 🔄 Complex | Orchestration logic needed      |

### Backend Tasks

- [ ] Design team huddle orchestration flow
- [ ] Create `/api/v1/team/huddle/start` endpoint
- [ ] Create `/api/v1/team/huddle/participants` endpoint
- [ ] Implement persona coordination logic
- [ ] Store huddle transcripts and outcomes

### Frontend Tasks

- [ ] Create or enhance team huddle UI component
- [ ] Show huddle participants
- [ ] Display huddle progress/phases
- [ ] Show synthesized recommendations

### Integration Tasks

- [ ] "Can I get the team's input?" triggers huddle
- [ ] Multiple personas participate in discussion
- [ ] Synthesized recommendation delivered to user
- [ ] Transcript saved for reference

### E2E Test

```typescript
// e2e/team-huddle.spec.ts
- [ ] POST /api/v1/team/huddle/start initiates huddle
- [ ] Huddle produces recommendations
- [ ] Transcript is saved
```

### Definition of Done

- [ ] Team huddle can be requested
- [ ] Multiple personas discuss topic
- [ ] User receives synthesized advice

---

## Feature 10: Upcoming Check-ins

**Status:** 🟢 Mostly complete, needs verification

### Current State

| Component   | Status    | File                                                     |
| ----------- | --------- | -------------------------------------------------------- |
| UI          | ✅ Exists | `frontend-typescript/src/ui/outreach-schedule.ui.ts`     |
| Backend API | ✅ Exists | `src/api/outreach-handler.ts` → `/api/outreach/upcoming` |
| Scheduling  | ✅ Works  | Proactive outreach system                                |

### Backend Tasks

- [ ] Verify `/api/outreach/upcoming` returns scheduled items
- [ ] Ensure reschedule endpoint works
- [ ] Ensure cancel endpoint works

### Frontend Tasks

- [ ] Connect UI to `/api/outreach/upcoming`
- [ ] Display upcoming check-ins list
- [ ] Allow reschedule/cancel actions
- [ ] Show check-in history

### E2E Test

```typescript
// e2e/outreach.spec.ts
- [ ] GET /api/outreach/upcoming returns items
- [ ] Reschedule updates schedule
- [ ] Cancel removes item
```

### Definition of Done

- [ ] Scheduled check-ins display
- [ ] User can reschedule
- [ ] User can cancel

---

## Implementation Priority (UPDATED Dec 13)

Based on December 2024 audit - many items are already complete:

| Priority | Feature              | Status | Remaining Work |
| -------- | -------------------- | ------ | -------------- |
| ✅ Done  | Voice Identity       | **WIRED** | E2E testing only |
| ✅ Done  | Upcoming Check-ins   | Working | Minor verification |
| ✅ Done  | Prediction Accuracy  | Working | Minor verification |
| ✅ Done  | Progress Analytics   | Working | Connected |
| ✅ Done  | Wellbeing Dashboard  | Working | Connected Dec 10 |
| 1        | Calendar Integration | **Blocked** | Google OAuth credentials |
| 2        | Household Management | 80% done | Frontend wiring |
| 3        | Team Huddles         | 50% done | Multi-persona orchestration |

---

## What's Actually Needed Now

### Quick Wins (< 1 hour each)

1. **E2E test Voice Identity** - Wiring exists, just verify
2. **Verify Household API** - Test `/api/household/:userId`
3. **Test Outreach endpoints** - May already work

### Medium Effort (2-4 hours)

4. **Complete Household frontend wiring** - Connect to API
5. **Team Huddle orchestration** - Multi-persona coordination

### Blocked (Needs External Action)

6. **Calendar Integration** - Requires Google OAuth credentials setup in GCP console

---

## E2E Test Files Needed

```
e2e/
├── memory-browser.spec.ts     ✅ EXISTS
├── contact-settings.spec.ts   ✅ EXISTS
├── voice-identity.spec.ts     # NEW
├── household.spec.ts          # NEW
├── calendar.spec.ts           # NEW
├── wellbeing.spec.ts          # NEW
├── analytics.spec.ts          # NEW
├── prediction-tracker.spec.ts # NEW
├── team-huddle.spec.ts        # NEW
├── outreach.spec.ts           # NEW
└── human-listening.spec.ts    ✅ EXISTS
```
