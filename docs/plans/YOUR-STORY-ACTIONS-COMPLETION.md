# Your Story Actions Integration - Completion Plan

**Status: ✅ COMPLETED** (2026-01-25)

## Executive Summary

The "What I've Done for You" feature integrates actions (calls, texts, reminders) into the Your Story Dashboard as a narrative of care. All implementation tasks are now complete, including testing and localization.

## Status Overview

| Component                    | Status      | Notes                                        |
| ---------------------------- | ----------- | -------------------------------------------- |
| Backend API (`/api/story/*`) | ✅ Complete | `story-routes.ts` created and registered     |
| Actions Visualization        | ✅ Complete | `actions-taken.ts` builder                   |
| Dashboard Section            | ✅ Complete | Added to `your-story-dashboard.ui.ts`        |
| i18n (en-US)                 | ✅ Complete | Keys added                                   |
| Activity Deprecation         | ✅ Complete | All functions redirect to Your Story         |
| API Tests                    | ✅ Complete | 12 tests in `story-routes.test.ts`           |
| E2E Tests                    | ✅ Complete | 17 tests in `your-story-actions-e2e.test.ts` |
| Frontend Data Wiring         | ✅ Complete | Dashboard fetches independently              |
| Other Locales                | ✅ Complete | All 11 locale files updated                  |

---

## Task Breakdown

### Phase 1: Critical Fixes (Must Complete)

#### 1.1 Update `showActivity()` to Redirect to Your Story

**File:** `apps/web/src/ui/activity.ui.ts`

The `showActivity()` function is still called from `app.ts` but shows the broken UI. Update it to redirect:

```typescript
export function showActivity(): void {
  // DEPRECATED: Redirect to Your Story dashboard
  console.warn('[Activity] Activity is deprecated - opening Your Story instead');
  import('../app/panel-methods.js').then(({ showYourStoryDashboard }) => {
    void showYourStoryDashboard();
  });
}
```

#### 1.2 Skip Activity UI Initialization (Optional)

**File:** `apps/web/src/app.ts`

Consider removing or conditionalizing the Activity UI init:

```typescript
// Line ~1747: Consider removing
// this.safeInit('ActivityUI', () => initActivityUI());
```

#### 1.3 Wire Actions Data into Your Story Service

**File:** `apps/web/src/services/your-story.service.ts`

The service fetches from `/api/your-story/full` but doesn't include actions. Add parallel fetch:

```typescript
// In fetchYourStory(), after getting main data:
const actionsPromise = fetch('/api/story/actions', { headers })
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);

const [mainData, actionsData] = await Promise.all([mainPromise, actionsPromise]);

// Merge actionsData into the response
```

---

### Phase 2: Testing (Required for Confidence)

#### 2.1 Create API Unit Tests

**File:** `src/api/__tests__/story-routes.test.ts`

```typescript
describe('Story Routes', () => {
  describe('GET /api/story/actions', () => {
    it('should return care moments for authenticated user');
    it('should return 401 for unauthenticated request');
    it('should include summary stats');
    it('should include commitment progress');
    it('should limit results based on query param');
  });

  describe('GET /api/story/summary', () => {
    it('should return aggregated stats');
    it('should handle users with no actions');
  });

  describe('GET /api/story/stream', () => {
    it('should establish SSE connection');
    it('should require authentication');
    it('should emit events on action changes');
  });
});
```

#### 2.2 Create Frontend Integration Test

**File:** `apps/web/src/ui/__tests__/your-story-actions.test.ts`

```typescript
describe('Your Story - Actions Section', () => {
  it('should render loading state initially');
  it('should fetch from /api/story/actions');
  it('should render care moments when data loads');
  it('should show empty state for new users');
  it('should handle API errors gracefully');
});
```

#### 2.3 Add E2E Test Scenario

**File:** `src/tests/synthetic/your-story-e2e.test.ts`

```typescript
describe('Your Story E2E', () => {
  it('should show actions after making a call', async () => {
    // 1. Create test user
    // 2. Trigger a call action via tool executor
    // 3. Verify action appears in /api/story/actions
    // 4. Verify Firestore persistence
  });
});
```

---

### Phase 3: Polish (Nice to Have)

#### 3.1 Add Remaining Locale Translations

**Files:** `apps/web/src/i18n/locales/*.json`

Add these keys to all locales:

- `yourStory.sections.care`
- `yourStory.care.loading`
- `yourStory.insights.care`
- `visualizations.actionsTaken.*`

#### 3.2 Add SSE Reconnection Logic

**File:** `apps/web/src/ui/your-story-dashboard.ui.ts`

The SSE stream may disconnect. Add reconnection:

```typescript
private connectToActionsStream(): void {
  const es = new EventSource('/api/story/stream');
  es.onmessage = (event) => this.handleActionEvent(JSON.parse(event.data));
  es.onerror = () => {
    es.close();
    setTimeout(() => this.connectToActionsStream(), 5000); // Retry
  };
}
```

#### 3.3 Add Action Tracker Integration Test

**File:** `src/services/action-tracker/__tests__/integration.test.ts`

Test the full flow:

- Tool execution → Action tracked → API returns it → Dashboard displays it

---

## File Manifest

| Action   | File                                                   | Purpose                 |
| -------- | ------------------------------------------------------ | ----------------------- |
| CREATE   | `src/api/__tests__/story-routes.test.ts`               | API unit tests          |
| CREATE   | `apps/web/src/ui/__tests__/your-story-actions.test.ts` | Frontend tests          |
| CREATE   | `src/tests/synthetic/your-story-e2e.test.ts`           | E2E integration test    |
| MODIFY   | `apps/web/src/ui/activity.ui.ts`                       | Redirect showActivity() |
| MODIFY   | `apps/web/src/services/your-story.service.ts`          | Fetch actions data      |
| MODIFY   | `apps/web/src/i18n/locales/*.json`                     | Add translations        |
| OPTIONAL | `apps/web/src/app.ts`                                  | Remove Activity init    |

---

## Testing Commands

```bash
# Run the new API tests
pnpm vitest run src/api/__tests__/story-routes.test.ts

# Run the action tracker tests
pnpm vitest run src/services/action-tracker/__tests__/

# Run frontend tests
cd apps/web && pnpm test

# Full E2E
pnpm test:e2e

# Manual testing
ferni dev start
# Then: Open app → Make a call → Open Your Story → Verify "What I've Done for You" appears
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  settings-menu.ui.ts                                            │
│        │                                                         │
│        ▼                                                         │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │ Your Story Click │────▶│ showYourStory()  │                 │
│  └──────────────────┘     └────────┬─────────┘                 │
│                                    │                            │
│  ┌──────────────────┐              │                            │
│  │ Activity Click   │──┐           ▼                            │
│  │ (deprecated)     │  │  ┌──────────────────────────┐         │
│  └──────────────────┘  └─▶│ your-story-dashboard.ui  │         │
│                           │                          │         │
│                           │  ┌────────────────────┐  │         │
│                           │  │ buildCareSection() │  │         │
│                           │  └─────────┬──────────┘  │         │
│                           └────────────┼─────────────┘         │
│                                        │                        │
│                                        ▼                        │
│                           ┌──────────────────────┐              │
│                           │ fetchActionsData()   │              │
│                           │ GET /api/story/actions│              │
│                           └──────────┬───────────┘              │
└──────────────────────────────────────┼──────────────────────────┘
                                       │
                          ═════════════╪═════════════
                                       │
┌──────────────────────────────────────┼──────────────────────────┐
│                         BACKEND      │                           │
├──────────────────────────────────────┼──────────────────────────┤
│                                      ▼                           │
│                           ┌──────────────────────┐              │
│                           │ story-routes.ts      │              │
│                           │ /api/story/*         │              │
│                           └──────────┬───────────┘              │
│                                      │                           │
│                    ┌─────────────────┼─────────────────┐        │
│                    ▼                 ▼                 ▼        │
│        ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐  │
│        │ Action Tracker  │ │ Commitment      │ │ Superhuman │  │
│        │ Service         │ │ Keeper          │ │ Services   │  │
│        └────────┬────────┘ └────────┬────────┘ └────────────┘  │
│                 │                    │                          │
│                 ▼                    ▼                          │
│        ┌────────────────────────────────────────────────────┐  │
│        │              FIRESTORE                              │  │
│        │  bogle_users/{userId}/ferni_actions/*               │  │
│        │  bogle_users/{userId}/commitments/*                 │  │
│        └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

1. **Functional**: User can see recent actions in Your Story Dashboard
2. **Tested**: API and frontend have unit tests, E2E test passes
3. **Deprecated**: Activity UI redirects to Your Story
4. **Localized**: At least en-US has all translations
5. **Documented**: This plan serves as documentation

---

## Priority Order

1. ⚡ **Critical**: Fix `showActivity()` redirect (prevents confusion)
2. ⚡ **Critical**: Create API tests (ensures reliability)
3. 🔶 **High**: Wire actions into your-story.service.ts (full integration)
4. 🔶 **High**: Create E2E test (validates full flow)
5. 🔷 **Medium**: Add other locale translations
6. 🔷 **Medium**: Add SSE reconnection logic
7. ⚪ **Low**: Remove Activity UI initialization from app.ts
