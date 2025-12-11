# Admin Dashboard Implementation Plan

> **Goal**: Get all 15 admin dashboard sections fully implemented, integrated, tested, and aligned to the Ferni design system and brand language.

## Current Status Summary

| Section | Current Status | Priority |
|---------|---------------|----------|
| Dashboard | REAL (partial) | P1 |
| Business Metrics | STUB | P0 |
| Agents | REAL | P2 |
| EvalOps | REAL (in-memory) | P1 |
| Trust | REAL | P2 |
| Human Listening | PARTIAL | P1 |
| Experiments | REAL | P2 |
| Feature Flags | REAL (Firestore) | DONE |
| Operations | PARTIAL | P1 |
| Builder Metrics | PARTIAL | P1 |
| Diagnostics | PARTIAL | P2 |
| API Docs | PARTIAL | P2 |
| Avatar Soul | REAL | P2 |
| Design System | REAL | DONE |
| More Dashboards | HUB | P2 |

---

## Priority Tier Definitions

- **P0 (Critical)**: Core business visibility, currently completely broken
- **P1 (High)**: Important operational insights, partially working but data not persisted
- **P2 (Medium)**: Nice-to-have or mostly working, needs polish

---

## Implementation Pattern (Reference)

Every dashboard should follow this proven pattern from Feature Flags:

### Frontend Pattern (FlagsSection.ts)
```typescript
export function init(portal: AdminPortal): void {
  // Setup event listeners via admin-events.ts delegation
}

export async function render(): Promise<string> {
  const data = await adminFetch('/api/v1/admin/{section}');
  return `<section class="admin-section">...</section>`;
}

export function cleanup(): void {
  // Remove event listeners
}
```

### Backend Pattern (flags.ts)
```typescript
// routes/api/v1/admin/{section}.ts
export function registerRoutes(app: Express): void {
  app.get('/api/v1/admin/{section}', authMiddleware, rateLimiter, async (req, res) => {
    const data = await firestoreCollection.get();
    res.json({ success: true, data });
  });

  app.post('/api/v1/admin/{section}', authMiddleware, rateLimiter, async (req, res) => {
    await firestoreCollection.add(req.body);
    res.json({ success: true });
  });
}
```

### Persistence Pattern
- **Firestore** for persistent data (flags, metrics, configs)
- **Redis** for real-time session data (agent status, active calls)
- **BigQuery** for analytics/time-series (optional, for scale)

---

## P0 - Critical (Business Metrics)

### 1. Business Metrics Section

**Current State**: Complete STUB - has UI but calls non-existent `/api/analytics/summary`

**Backend Work**:
- [ ] Create `src/api/v1/admin/business-metrics.ts`
- [ ] Implement Firestore collection `admin_business_metrics`
- [ ] Track: daily active users, total conversations, subscription conversions
- [ ] Aggregate from: session-manager, stripe-subscription, user profiles
- [ ] Historical data: store daily snapshots for trend charts

**Frontend Work**:
- [ ] Connect to real `/api/v1/admin/business-metrics` endpoint
- [ ] Add real-time refresh (30s interval)
- [ ] Add date range picker for historical data
- [ ] Charts for: DAU trend, conversation volume, conversion funnel

**Data Schema**:
```typescript
interface BusinessMetrics {
  date: string; // YYYY-MM-DD
  activeUsers: number;
  newUsers: number;
  totalConversations: number;
  avgConversationLength: number;
  subscriptionConversions: number;
  churnRate: number;
  revenue: number;
}
```

**Persistence**: Firestore `admin_business_metrics/{date}`

**Testing**:
- [ ] Unit test: metric aggregation logic
- [ ] Integration test: API returns valid data structure
- [ ] E2E test: dashboard displays real data

**Brand Compliance**:
- [ ] Use `--color-midnight-*` for dark theme
- [ ] Use `--color-success`, `--color-warning` for trend indicators
- [ ] Lucide icons for metric cards
- [ ] WCAG AA contrast ratios

---

## P1 - High Priority

### 2. Dashboard (Main)

**Current State**: REAL but uses in-memory activity log (200 events max, lost on restart)

**Backend Work**:
- [ ] Create Firestore collection `admin_activity_log`
- [ ] Persist activity events with TTL (7 days)
- [ ] Add pagination for activity log API
- [ ] Real agent count from Redis session registry

**Frontend Work**:
- [ ] Add pagination controls for activity log
- [ ] Real-time WebSocket for live agent count
- [ ] Add "clear old entries" admin action

**Testing**:
- [ ] Verify activity persists across server restarts
- [ ] Load test: 10K events don't degrade performance

---

### 3. EvalOps Section

**Current State**: REAL but in-memory storage (500 evaluations max)

**Backend Work**:
- [ ] Create Firestore collection `evalops_evaluations`
- [ ] Create Firestore collection `evalops_scenarios`
- [ ] Migrate in-memory storage to Firestore
- [ ] Add batch evaluation job scheduling

**Frontend Work**:
- [ ] Add scenario management UI (CRUD)
- [ ] Add evaluation history with filters
- [ ] Add export to CSV functionality
- [ ] Charts for evaluation trends

**Testing**:
- [ ] Unit test: evaluation scoring logic
- [ ] Integration test: scenarios persist correctly
- [ ] E2E test: run evaluation and see results

---

### 4. Human Listening Section

**Current State**: PARTIAL - has session display but limited controls

**Backend Work**:
- [ ] Ensure `/api/v1/admin/human-listening` returns live session data
- [ ] Add ability to join/leave listening sessions
- [ ] Add session recording toggle
- [ ] Privacy controls and audit logging

**Frontend Work**:
- [ ] Live audio waveform visualization
- [ ] Session transcript real-time updates
- [ ] Admin notes/annotations feature
- [ ] Session export functionality

**Testing**:
- [ ] Privacy test: verify only authorized access
- [ ] Real-time test: WebSocket updates work

---

### 5. Operations Section

**Current State**: PARTIAL - shows server health but limited metrics

**Backend Work**:
- [ ] Create `/api/v1/admin/operations` endpoint
- [ ] Aggregate: memory usage, CPU, active connections
- [ ] Error rate tracking from logs
- [ ] Deployment history from Cloud Run API

**Frontend Work**:
- [ ] Server health cards with real metrics
- [ ] Error log viewer with filtering
- [ ] Deployment history timeline
- [ ] Restart/scale controls (if applicable)

**Testing**:
- [ ] Health check endpoint responds correctly
- [ ] Metrics update in real-time

---

### 6. Builder Metrics Section

**Current State**: PARTIAL - has charts but may use mock data

**Backend Work**:
- [ ] Create Firestore collection `builder_metrics`
- [ ] Track: context builder execution time, injection counts
- [ ] Aggregate from intelligence/context-builders usage
- [ ] Historical trending data

**Frontend Work**:
- [ ] Real-time charts for builder performance
- [ ] Per-builder breakdown table
- [ ] Alert thresholds configuration
- [ ] Export functionality

**Testing**:
- [ ] Verify metrics match actual builder usage
- [ ] Performance: large dataset rendering

---

## P2 - Medium Priority

### 7. Agents Section

**Current State**: REAL - shows agent status from AgentRegistry

**Backend Work**:
- [ ] Add historical agent performance data
- [ ] Track: response times, error rates per agent
- [ ] Agent configuration management

**Frontend Work**:
- [ ] Agent performance history charts
- [ ] Configuration edit UI
- [ ] Agent restart/pause controls

**Testing**:
- [ ] Agent status reflects reality
- [ ] Config changes apply correctly

---

### 8. Trust Section

**Current State**: REAL - basic trust score display

**Backend Work**:
- [ ] Ensure all trust signals are tracked
- [ ] Add trust score history per user
- [ ] Export trust reports

**Frontend Work**:
- [ ] User trust score search
- [ ] Trust signal breakdown visualization
- [ ] Manual trust adjustment UI

**Testing**:
- [ ] Trust calculations are accurate
- [ ] History persists correctly

---

### 9. Experiments Section

**Current State**: REAL - basic A/B test management

**Backend Work**:
- [ ] Add experiment result aggregation
- [ ] Statistical significance calculations
- [ ] Automated winner selection

**Frontend Work**:
- [ ] Results visualization with confidence intervals
- [ ] Experiment lifecycle management
- [ ] Audience targeting UI

**Testing**:
- [ ] Experiment assignment is deterministic
- [ ] Results match actual outcomes

---

### 10. Diagnostics Section

**Current State**: PARTIAL - basic system checks

**Backend Work**:
- [ ] Create comprehensive health check endpoint
- [ ] Check: Firestore, Redis, LiveKit, OpenAI, Stripe
- [ ] Latency measurements for each service

**Frontend Work**:
- [ ] Service status cards with latency
- [ ] Historical uptime charts
- [ ] Incident log viewer
- [ ] Manual service test triggers

**Testing**:
- [ ] All services report correctly
- [ ] Alerts trigger on failures

---

### 11. API Docs Section

**Current State**: PARTIAL - basic Swagger/OpenAPI display

**Backend Work**:
- [ ] Generate OpenAPI spec from route definitions
- [ ] Add authentication examples
- [ ] Add rate limit documentation

**Frontend Work**:
- [ ] Interactive API explorer
- [ ] Code samples in multiple languages
- [ ] Authentication playground

**Testing**:
- [ ] All endpoints documented
- [ ] Examples are runnable

---

### 12. Avatar Soul Section

**Current State**: REAL - micro-expression testing

**Backend Work**:
- [ ] Track avatar performance metrics
- [ ] A/B test different expression timings

**Frontend Work**:
- [ ] Expression timing visualizer
- [ ] Performance impact charts
- [ ] Live preview improvements

**Testing**:
- [ ] Expressions render correctly
- [ ] Timing metrics are accurate

---

### 13. More Dashboards (Hub)

**Current State**: HUB - links to external dashboards

**Backend Work**:
- [ ] None needed (static links)

**Frontend Work**:
- [ ] Improve card layout
- [ ] Add status indicators for external services
- [ ] Deep links where possible

**Testing**:
- [ ] All links work
- [ ] Status indicators are accurate

---

## Brand & Design System Compliance Checklist

Apply to ALL sections:

### Colors (from design-system/tokens/colors.json)
- [ ] Dark backgrounds: `--color-midnight-900` (#0D0F17)
- [ ] Cards: `--color-midnight-800` (#141821)
- [ ] Borders: `--color-midnight-700` (#1E222D)
- [ ] Primary text: `--color-zen-100` (#F4F4F5)
- [ ] Secondary text: `--color-zen-400` (#A1A1AA)
- [ ] Accent (Ferni): `--color-ferni` (#4A6741)
- [ ] Success: `--color-success` (#22C55E)
- [ ] Warning: `--color-warning` (#F59E0B)
- [ ] Error: `--color-error` (#EF4444)

### Typography
- [ ] Headers: `font-family: var(--font-display)` (Space Grotesk)
- [ ] Body: `font-family: var(--font-body)` (Inter)
- [ ] Code: `font-family: var(--font-mono)` (JetBrains Mono)

### Components
- [ ] Use Lucide icons consistently
- [ ] Cards have `border-radius: 8px`
- [ ] Buttons follow design system patterns
- [ ] Forms use consistent input styling
- [ ] Loading states use skeleton pattern

### Accessibility
- [ ] WCAG AA contrast ratios (4.5:1 for text)
- [ ] Focus visible indicators
- [ ] Keyboard navigation support
- [ ] Screen reader labels

---

## Testing Strategy

### Unit Tests
Each section needs:
- [ ] Data transformation functions
- [ ] Validation logic
- [ ] Aggregation calculations

### Integration Tests
- [ ] API endpoints return correct structure
- [ ] Firestore persistence works
- [ ] Authentication/authorization enforced

### E2E Tests
- [ ] Dashboard loads and displays real data
- [ ] CRUD operations work through UI
- [ ] Real-time updates function correctly

### Test Files Location
```
src/tests/admin/
├── business-metrics.test.ts
├── evalops.test.ts
├── human-listening.test.ts
├── operations.test.ts
├── builder-metrics.test.ts
└── integration/
    └── admin-e2e.test.ts
```

---

## Implementation Order

### Phase 1: Foundation (Week 1)
1. Business Metrics backend + persistence
2. Dashboard activity log persistence
3. Shared admin testing utilities

### Phase 2: Core Operations (Week 2)
4. EvalOps Firestore migration
5. Operations real metrics
6. Builder Metrics persistence

### Phase 3: User Features (Week 3)
7. Human Listening enhancements
8. Trust score improvements
9. Experiments results

### Phase 4: Polish (Week 4)
10. Diagnostics comprehensive checks
11. API Docs interactive explorer
12. Brand compliance audit for all sections

---

## Success Criteria

Each section is "DONE" when:
1. Backend API exists and returns real data
2. Data persists to Firestore (not in-memory)
3. Frontend displays real data with refresh
4. Unit + integration tests pass
5. Brand compliance checklist complete
6. No TypeScript errors
7. Documented in API docs section
