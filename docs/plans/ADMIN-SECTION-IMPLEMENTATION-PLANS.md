# Admin Section Implementation Plans

> **Date**: 2025-12-11
> **Goal**: Fully implemented, integrated, tested, validated, on-brand admin sections

---

## Overview

Each admin section follows this standard implementation lifecycle:

### Implementation Lifecycle

```
1. AUDIT          → Current state analysis
2. DESIGN         → Token mapping, component design
3. IMPLEMENT      → Code changes, accessibility
4. INTEGRATE      → API connections, real data
5. TEST           → Unit tests, E2E tests
6. VALIDATE       → Token lint, UI audit, screen reader
7. DEPLOY         → Production verification
```

### Quality Gates (All Sections)

| Gate | Requirement | Command |
|------|-------------|---------|
| TypeScript | 0 errors | `npm run typecheck` |
| Design Tokens | 0 hardcoded values | `npm run lint:tokens` |
| Accessibility | 0 audit errors | `npm run audit:ui` |
| Unit Tests | Coverage > 60% | `npm test` |
| E2E Tests | All pass | `npm run test:e2e` |
| Screen Reader | VoiceOver pass | Manual |
| Keyboard Nav | Full support | Manual |

---

## Section 1: DashboardSection

**Status**: ~90% Complete | **Priority**: P0 (Landing page)

### Current State
- Real data from aggregated API
- Health status, quick stats, activity feed
- Uses CSS variable tokens with fallbacks

### Implementation Plan

#### 1.1 Design Token Audit
- [ ] Replace remaining hardcoded colors
- [ ] Verify all spacing uses `--space-*` tokens
- [ ] Add `--admin-*` semantic tokens for admin-specific colors

#### 1.2 Accessibility Fixes
- [ ] Add `aria-live="polite"` to activity feed
- [ ] Add `role="status"` to health indicator
- [ ] Ensure color contrast on all status badges (4.5:1 min)

#### 1.3 Integration
- [x] Connected to `/api/v1/admin/dashboard/health`
- [x] Connected to `/api/v1/admin/dashboard/stats`
- [x] Connected to `/api/v1/admin/dashboard/activity`
- [ ] Add WebSocket for real-time updates (optional)

#### 1.4 Testing
- [ ] Unit tests for `buildQuickStats()`, `formatUptime()`
- [ ] E2E test: Dashboard loads with real data
- [ ] E2E test: Activity refreshes on actions

#### 1.5 Validation Checklist
- [ ] `npm run lint:tokens` - 0 violations
- [ ] `npm run audit:ui` - 0 errors
- [ ] VoiceOver announces status changes
- [ ] Keyboard: Tab through all interactive elements

---

## Section 2: AgentsSection

**Status**: ~85% Complete | **Priority**: P0 (Core feature)

### Current State
- Lists coordinator + team members
- Template cards for creating agents
- Drag-to-reorder (visual only)

### Implementation Plan

#### 2.1 Design Token Audit
- [x] Template cards use `<button>` (fixed)
- [x] Focus-visible states (done)
- [x] Reduced-motion media query (done)
- [ ] Avatar gradient uses persona tokens

#### 2.2 Accessibility Fixes
- [x] Convert `role="button"` divs to `<button>` (fixed)
- [ ] Add keyboard drag-reorder alternative (arrow keys)
- [ ] Add `aria-pressed` for toggle states
- [ ] Screen reader announcements for reorder

#### 2.3 Integration
- [x] Connected to `/api/agents`
- [ ] POST `/api/agents` for create
- [ ] PUT `/api/agents/:id` for edit
- [ ] POST `/api/team/order` for reorder persistence

#### 2.4 Testing
- [ ] Unit tests for `renderAgentCard()`, `renderTemplate()`
- [ ] E2E test: Create agent from template
- [ ] E2E test: Toggle agent enabled/disabled
- [ ] E2E test: Reorder persists after refresh

#### 2.5 Validation Checklist
- [ ] Keyboard: Reorder with Up/Down arrows
- [ ] Screen reader: "Agent moved to position 2"
- [ ] Focus trap in create/edit modals

---

## Section 3: FlagsSection

**Status**: ~80% Complete | **Priority**: P1

### Current State
- Lists feature flags by category
- Toggle enable/disable
- Percentage rollout inputs

### Implementation Plan

#### 3.1 Design Token Audit
- [x] Percentage input labels (fixed)
- [ ] Search input focus ring enhancement
- [ ] Category icons use semantic tokens

#### 3.2 Accessibility Fixes
- [x] `<label for="">` on percentage inputs (fixed)
- [ ] Add search input clear button
- [ ] `aria-expanded` on category sections
- [ ] Live region for flag toggle confirmation

#### 3.3 Integration
- [x] GET `/api/v1/admin/flags`
- [ ] PUT `/api/v1/admin/flags/:id`
- [ ] POST `/api/v1/admin/flags/:id/toggle`
- [ ] Toast notifications on success/error

#### 3.4 Testing
- [ ] Unit tests for `groupByCategory()`, `getCategoryIcon()`
- [ ] E2E test: Toggle flag updates state
- [ ] E2E test: Percentage change persists
- [ ] E2E test: Search filters flags

#### 3.5 Validation Checklist
- [ ] Keyboard: Tab through flags, Space to toggle
- [ ] Screen reader: "Voice flag enabled"

---

## Section 4: ApiDocsSection

**Status**: ~85% Complete | **Priority**: P2

### Current State
- API endpoint listing by category
- Quick links to common endpoints
- API tester with request/response

### Implementation Plan

#### 4.1 Design Token Audit
- [x] HTTP method colors use tokens (fixed)
- [x] Endpoint buttons are semantic (fixed)
- [ ] Response syntax highlighting colors

#### 4.2 Accessibility Fixes
- [x] Endpoint `<button>` elements (fixed)
- [x] `aria-label` on endpoints (fixed)
- [ ] Code response needs `aria-label="API response"`
- [ ] Loading state announcement

#### 4.3 Integration
- [x] Endpoint list is static (OK)
- [ ] API tester makes real requests
- [ ] Response formatting (JSON pretty-print)
- [ ] Error handling with status codes

#### 4.4 Testing
- [ ] Unit tests for `renderEndpoint()`, `renderCategory()`
- [ ] E2E test: Click endpoint populates tester
- [ ] E2E test: Send request, view response
- [ ] E2E test: Error response displays correctly

#### 4.5 Validation Checklist
- [ ] Keyboard: Tab to endpoint, Enter to select
- [ ] Screen reader: "GET /api/health: System health check"

---

## Section 5: AvatarSoulSection

**Status**: ~70% Complete | **Priority**: P1 (Demo feature)

### Current State
- Avatar preview with emotion controls
- Animation playground
- Soul Lab testing interface

### Implementation Plan

#### 5.1 Design Token Audit
- [x] Emojis removed (fixed)
- [x] Focus-visible states (done)
- [x] Reduced-motion query (done)
- [ ] Canvas colors need programmatic tokens
- [ ] Gradient animations use CSS variables

#### 5.2 Accessibility Fixes
- [ ] Emotion buttons need `aria-label`
- [ ] Animation speed slider needs label
- [ ] Canvas needs `aria-label="Avatar preview"`
- [ ] Color picker needs keyboard support

#### 5.3 Integration
- [ ] Connect to avatar renderer API
- [ ] Save/load soul configurations
- [ ] Export animation presets

#### 5.4 Testing
- [ ] Unit tests for emotion state machine
- [ ] E2E test: Trigger emotion, see animation
- [ ] E2E test: Adjust speed, see change
- [ ] Visual regression tests for avatar states

#### 5.5 Validation Checklist
- [ ] Reduced motion: Animations disabled
- [ ] High contrast: Avatar visible

---

## Section 6: EvalOpsSection

**Status**: ~75% Complete | **Priority**: P1

### Current State
- Evaluation metrics display
- Flagged responses list
- Test suite runner

### Implementation Plan

#### 6.1 Design Token Audit
- [ ] Metric card colors use semantic tokens
- [ ] Status badges use `--color-semantic-*`
- [ ] Chart colors use theme tokens

#### 6.2 Accessibility Fixes
- [ ] Data tables need `scope="col"` headers
- [ ] Charts need text alternatives
- [ ] Progress indicators need `aria-valuenow`

#### 6.3 Integration
- [ ] GET `/api/evalops/metrics`
- [ ] GET `/api/evalops/evaluations/flagged`
- [ ] POST `/api/evalops/run-suite`
- [ ] Real-time progress updates

#### 6.4 Testing
- [ ] Unit tests for metric calculations
- [ ] E2E test: Run suite, see progress
- [ ] E2E test: View flagged response details

#### 6.5 Validation Checklist
- [ ] Screen reader: "Pass rate 95 percent"
- [ ] Keyboard: Navigate through flagged items

---

## Section 7: TrustSection

**Status**: ~70% Complete | **Priority**: P1

### Current State
- Trust journey visualization
- User relationship metrics
- Export functionality

### Implementation Plan

#### 7.1 Design Token Audit
- [ ] Trust level colors use semantic tokens
- [ ] Chart gradients use CSS variables
- [ ] Card borders use `--color-border-*`

#### 7.2 Accessibility Fixes
- [ ] Trust level chart needs text description
- [ ] Data export needs confirmation modal
- [ ] Timeline needs keyboard navigation

#### 7.3 Integration
- [ ] GET `/api/trust-journey/summary`
- [ ] GET `/api/trust/analytics/metrics`
- [ ] POST `/api/trust-export/export`

#### 7.4 Testing
- [ ] Unit tests for trust score calculations
- [ ] E2E test: View trust timeline
- [ ] E2E test: Export trust data

#### 7.5 Validation Checklist
- [ ] Screen reader: Trust level announcements
- [ ] Keyboard: Navigate timeline events

---

## Section 8: HumanListeningSection

**Status**: ~65% Complete | **Priority**: P2

### Current State
- Active listening sessions
- Audio quality metrics
- Manual review queue

### Implementation Plan

#### 8.1 Design Token Audit
- [ ] Status indicators use semantic colors
- [ ] Audio waveform colors match theme
- [ ] Quality score badges use tokens

#### 8.2 Accessibility Fixes
- [ ] Status SVG needs `<title>` element
- [ ] Audio player needs keyboard controls
- [ ] Review actions need confirmation

#### 8.3 Integration
- [ ] GET `/api/v1/admin/human-listening/sessions`
- [ ] POST `/api/v1/admin/human-listening/review`
- [ ] WebSocket for live session updates

#### 8.4 Testing
- [ ] Unit tests for session filtering
- [ ] E2E test: View active session
- [ ] E2E test: Complete review action

#### 8.5 Validation Checklist
- [ ] Screen reader: Session status announcements
- [ ] Keyboard: Play/pause with Space

---

## Section 9: ExperimentsSection

**Status**: ~60% Complete | **Priority**: P2

### Current State
- A/B test management
- Variant configuration
- Results visualization

### Implementation Plan

#### 9.1 Design Token Audit
- [ ] Variant colors use persona tokens
- [ ] Result charts use theme colors
- [ ] Status badges use semantic tokens

#### 9.2 Accessibility Fixes
- [ ] Variant selector needs `role="radiogroup"`
- [ ] Charts need data tables alternative
- [ ] Start/stop buttons need confirmation

#### 9.3 Integration
- [ ] GET `/api/experiments`
- [ ] POST `/api/experiments` (create)
- [ ] POST `/api/experiments/:id/start`
- [ ] GET `/api/experiments/:id/results`

#### 9.4 Testing
- [ ] Unit tests for variant allocation
- [ ] E2E test: Create experiment
- [ ] E2E test: View results

#### 9.5 Validation Checklist
- [ ] Keyboard: Full experiment management
- [ ] Screen reader: Result announcements

---

## Section 10: DesignSystemSection

**Status**: ~80% Complete | **Priority**: P2

### Current State
- Token showcase
- Component preview
- Color palette display

### Implementation Plan

#### 10.1 Design Token Audit
- [ ] Self-referential (displays tokens correctly)
- [ ] Emotion buttons need aria-labels

#### 10.2 Accessibility Fixes
- [ ] Emotion buttons need `aria-label`
- [ ] Color swatches need text labels
- [ ] Copy button needs feedback

#### 10.3 Integration
- [ ] Dynamic token loading from CSS
- [ ] Component state demonstrations
- [ ] Live theme switching

#### 10.4 Testing
- [ ] Visual regression tests
- [ ] E2E test: Copy token value
- [ ] E2E test: Preview component states

#### 10.5 Validation Checklist
- [ ] All token values accessible
- [ ] Copy feedback announced

---

## Section 11: DiagnosticsSection

**Status**: ~60% Complete | **Priority**: P3

### Current State
- System diagnostics
- Error logs
- Performance metrics

### Implementation Plan

#### 11.1 Design Token Audit
- [ ] Log level colors use semantic tokens
- [ ] Metric cards use consistent styling

#### 11.2 Accessibility Fixes
- [ ] Log entries need timestamps read
- [ ] Filter controls need labels

#### 11.3 Integration
- [ ] GET `/api/diagnostics/health`
- [ ] GET `/api/diagnostics/logs`
- [ ] GET `/api/diagnostics/metrics`

#### 11.4 Testing
- [ ] E2E test: View logs
- [ ] E2E test: Filter by level

#### 11.5 Validation Checklist
- [ ] Keyboard: Filter and navigate logs

---

## Section 12: OperationsSection

**Status**: ~55% Complete | **Priority**: P3

### Current State
- Deployment status
- Service health
- Manual operations

### Implementation Plan

#### 12.1 Design Token Audit
- [ ] Service status colors
- [ ] Action button styling

#### 12.2 Accessibility Fixes
- [ ] Dangerous actions need confirmation
- [ ] Status updates need live region

#### 12.3 Integration
- [ ] GET `/api/operations/status`
- [ ] POST `/api/operations/restart`
- [ ] POST `/api/operations/clear-cache`

#### 12.4 Testing
- [ ] E2E test: View service status
- [ ] E2E test: Execute safe operation

#### 12.5 Validation Checklist
- [ ] Confirmation modals trap focus

---

## Section 13: BuilderMetricsSection

**Status**: ~50% Complete | **Priority**: P3

### Current State
- Persona builder analytics
- Usage metrics

### Implementation Plan

#### 13.1 Design Token Audit
- [ ] Table headers need scope
- [ ] Metric values use mono font

#### 13.2 Accessibility Fixes
- [ ] Table headers: `scope="col"`
- [ ] Sortable columns: `aria-sort`

#### 13.3 Integration
- [ ] GET `/api/builder/metrics`

#### 13.4 Testing
- [ ] E2E test: View metrics table

#### 13.5 Validation Checklist
- [ ] Table navigable with screen reader

---

## Section 14: BusinessMetricsSection

**Status**: ~50% Complete | **Priority**: P3

### Current State
- Revenue metrics
- Subscription analytics

### Implementation Plan

#### 14.1 Design Token Audit
- [ ] Currency formatting
- [ ] Chart colors

#### 14.2 Accessibility Fixes
- [ ] Charts need data table alternative
- [ ] Trend indicators need text

#### 14.3 Integration
- [ ] GET `/api/business/metrics`
- [ ] GET `/api/subscriptions/analytics`

#### 14.4 Testing
- [ ] E2E test: View revenue charts

#### 14.5 Validation Checklist
- [ ] Numbers announced correctly

---

## Section 15: MoreDashboardsSection

**Status**: ~40% Complete | **Priority**: P4

### Current State
- Links to additional dashboards
- Quick access cards

### Implementation Plan

#### 15.1 Design Token Audit
- [ ] Card styling consistency
- [ ] Icon colors

#### 15.2 Accessibility Fixes
- [ ] External link indicators
- [ ] Card descriptions

#### 15.3 Integration
- [ ] Dynamic dashboard registry
- [ ] Permission-based visibility

#### 15.4 Testing
- [ ] E2E test: Navigate to dashboard

#### 15.5 Validation Checklist
- [ ] External links announced

---

## Shared Infrastructure

### Admin Token System

Define in `design-system/tokens/admin.json`:

```json
{
  "admin": {
    "bg": {
      "primary": "var(--color-bg-primary)",
      "card": "var(--color-bg-elevated)",
      "surface": {
        "subtle": "rgba(255, 255, 255, 0.03)",
        "hover": "rgba(255, 255, 255, 0.06)",
        "active": "rgba(255, 255, 255, 0.08)"
      }
    },
    "border": {
      "subtle": "rgba(255, 255, 255, 0.05)",
      "default": "rgba(255, 255, 255, 0.1)",
      "hover": "rgba(255, 255, 255, 0.2)"
    },
    "status": {
      "healthy": "var(--color-semantic-success)",
      "degraded": "var(--color-semantic-warning)",
      "down": "var(--color-semantic-error)"
    }
  }
}
```

### Shared Test Utilities

Create `apps/web/src/admin/__tests__/test-utils.ts`:

```typescript
export const renderAdminSection = async (section: string) => {
  // Setup admin context
  // Render section
  // Return testing utilities
};

export const mockAdminApi = (endpoint: string, response: unknown) => {
  // Mock fetch for admin APIs
};
```

### E2E Test Suite

Create `apps/web/tests/admin-e2e.test.ts`:

```typescript
describe('Admin Portal E2E', () => {
  beforeEach(async () => {
    await page.goto('/admin');
    await authenticate();
  });

  // Section-specific tests
});
```

---

## Implementation Order

### Phase 1: Foundation (Week 1)
1. DashboardSection - Landing page, must be solid
2. AgentsSection - Core feature
3. FlagsSection - Critical for ops

### Phase 2: Features (Week 2)
4. AvatarSoulSection - Demo showcase
5. EvalOpsSection - Quality assurance
6. TrustSection - Analytics

### Phase 3: Operations (Week 3)
7. ApiDocsSection - Developer tool
8. HumanListeningSection - QA tool
9. DesignSystemSection - Brand consistency

### Phase 4: Analytics (Week 4)
10. ExperimentsSection - A/B testing
11. DiagnosticsSection - Debugging
12. OperationsSection - DevOps

### Phase 5: Polish (Week 5)
13. BuilderMetricsSection
14. BusinessMetricsSection
15. MoreDashboardsSection

---

## Success Criteria

### Per Section
- [ ] 0 TypeScript errors
- [ ] 0 design token violations
- [ ] 0 accessibility audit errors
- [ ] Unit test coverage > 60%
- [ ] E2E tests passing
- [ ] VoiceOver pass
- [ ] Keyboard navigation complete

### Overall
- [ ] All 15 sections complete
- [ ] Consistent visual language
- [ ] Full API integration
- [ ] Comprehensive test suite
- [ ] Production deployed
- [ ] Stakeholder sign-off

---

## Appendix: Token Reference

### Colors
```css
--color-text-primary: #faf6f0
--color-text-secondary: #d4ccc4
--color-text-muted: #a89a8c
--color-bg-primary: #1a1612
--color-bg-elevated: #2c2520
--color-semantic-success: #4a6741
--color-semantic-warning: #d4a84b
--color-semantic-error: #c44536
```

### Spacing
```css
--space-1: 0.25rem
--space-2: 0.5rem
--space-3: 0.75rem
--space-4: 1rem
--space-5: 1.25rem
--space-6: 1.5rem
```

### Z-Index
```css
--z-base: 0
--z-dropdown: 1000
--z-modal-backdrop: 2000
--z-modal: 2100
--z-notification: 3000
```
