# Unified Intelligence System - Master Implementation Plan

> **From data to wisdom. The full roadmap to genuine AI awareness.**

**Created:** December 30, 2024  
**Status:** Phase 2 Complete (of 10)

---

## Progress Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION PROGRESS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Core Architecture                    ████████████████████ 100%   │
│  Phase 2: Intelligence Integration             ████████████████████ 100%   │
│  Phase 3: Service Wiring (~95% remaining)      ██░░░░░░░░░░░░░░░░░░   5%   │
│  Phase 4: Data Quality & Governance            ░░░░░░░░░░░░░░░░░░░░   0%   │
│  Phase 5: Pattern Library                      ░░░░░░░░░░░░░░░░░░░░   0%   │
│  Phase 6: Cross-Domain Correlations            ██░░░░░░░░░░░░░░░░░░  10%   │
│  Phase 7: Proactive Intelligence               ██░░░░░░░░░░░░░░░░░░  10%   │
│  Phase 8: Real-Time & Sync                     ░░░░░░░░░░░░░░░░░░░░   0%   │
│  Phase 9: Observability & Analytics            █░░░░░░░░░░░░░░░░░░░   5%   │
│  Phase 10: Production Hardening                ░░░░░░░░░░░░░░░░░░░░   0%   │
├─────────────────────────────────────────────────────────────────────────────┤
│  OVERALL PROGRESS                              ████░░░░░░░░░░░░░░░░  23%   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Architecture ✅ COMPLETE

**What was built:**
- Unified Data Layer (`src/services/data-layer/`)
- 98 entity types defined (`types.ts`)
- Store hooks factory pattern (`store-hooks.ts`)
- Query router (structured/semantic/hybrid)
- Indexing policy configuration
- Session lifecycle management
- Health check infrastructure

**Key Files Created:**
```
src/services/data-layer/
├── index.ts              # Main facade
├── types.ts              # 98 entity types
├── store-hooks.ts        # Auto-indexing hooks
├── indexing-policy.ts    # What to index
├── query-router.ts       # Query routing
├── session-integration.ts
├── health.ts
└── hooks/                # Domain-specific hooks
```

---

## Phase 2: Intelligence Integration ✅ COMPLETE

**What was built:**
- Context Assembler (`src/intelligence/context-assembler.ts`)
- Cross-Domain Correlator (`src/intelligence/patterns/cross-domain-correlator.ts`)
- Proactive Intelligence Engine (`src/intelligence/proactive/proactive-engine.ts`)
- Unified Intelligence API (`src/intelligence/unified-intelligence-api.ts`)
- Voice Agent Integration (`src/agents/integrations/unified-intelligence-integration.ts`)

**Integration Points:**
- Turn handler fetches intelligence in parallel
- Session init pre-warms intelligence
- Session cleanup persists learnings
- Proactive insights injected at turn 1

---

## Phase 3: Service Wiring 🔴 5% COMPLETE

**Goal:** Wire ALL services to automatically index their data

### Current State

| Category | Wired | Total | % Complete |
|----------|-------|-------|------------|
| **Trust Systems** | 5 | 10 | 50% |
| **Superhuman Services** | 0 | 19 | 0% |
| **Domain Stores** | 3 | 3 | 100% |
| **Calendar & Contacts** | 0 | 8 | 0% |
| **Coaching Services** | 0 | 5 | 0% |
| **Health Services** | 0 | 5 | 0% |

### Services Still Needing Wiring

#### Trust Systems (5 remaining)
- [ ] `inside-joke-memory.ts` → `onInsideJokeChange()`
- [ ] `small-wins.ts` → `onSmallWinChange()`
- [ ] `growth-reflection.ts` → `onGrowthReflectionChange()`
- [ ] `thinking-of-you.ts` → `onThinkingOfYouChange()`
- [ ] `tonal-memory.ts` → `onTonalMemoryChange()`

#### Superhuman Services (19 total)
- [ ] `predictive-coaching.ts` → `onPredictiveInsightChange()`
- [ ] `commitment-keeper.ts` → `onCommitmentKeeperChange()`
- [ ] `capacity-guardian.ts` → `onCapacityStateChange()`
- [ ] `relationship-milestones.ts` → `onRelationshipMilestoneChange()`
- [ ] `seasonal-awareness.ts` → `onSeasonalPatternChange()`
- [ ] `emotional-first-aid.ts` → `onEmotionalFirstAidChange()`
- [ ] `relationship-network.ts` → `onRelationshipNetworkChange()`
- [ ] `conflict-memory.ts` → `onConflictMemoryChange()`
- [ ] `recovery-milestone.ts` → `onRecoveryMilestoneChange()`
- [ ] `silence-interpreter.ts` → `onSilenceInterpretationChange()`
- [ ] `contradiction-comfort.ts` → `onContradictionComfortChange()`
- [ ] `perfect-timing.ts` → `onPerfectTimingChange()`
- [ ] `pattern-mirror.ts` → `onPatternMirrorChange()`
- [ ] `future-self-letters.ts` → `onFutureSelfLetterChange()`
- [ ] `first-vulnerability.ts` → `onFirstVulnerabilityChange()`
- [ ] `linguistic-mirroring.ts` → `onLinguisticMirroringChange()`
- [ ] `ambient-context.ts` → `onAmbientContextChange()`
- [ ] `protective-memory.ts` → `onProtectiveMemoryChange()`
- [ ] `dream-keeper.ts` - PARTIAL (needs expansion)

#### Calendar & Contacts (8 services)
- [ ] `unified-calendar.service.ts` → `onCalendarEventChange()`
- [ ] `meeting-memory.service.ts` → `onMeetingMemoryChange()`
- [ ] `contact-memory.service.ts` → `onContactChange()`
- [ ] `relationship-notes.service.ts` → `onRelationshipNoteChange()`
- [ ] `gift-ideas.service.ts` → `onGiftIdeaChange()`
- [ ] `important-dates.service.ts` → `onImportantDateChange()`
- [ ] `communication-prefs.service.ts` → `onCommunicationPrefChange()`
- [ ] `professional-network.service.ts` → `onProfessionalContactChange()`

#### Coaching Services (5 services)
- [ ] `insight-broker.ts` → `onCoachingInsightChange()`
- [ ] `breakthrough-tracker.ts` → `onBreakthroughMomentChange()`
- [ ] `stuck-pattern-detector.ts` → `onStuckPatternChange()`
- [ ] `strength-identifier.ts` → `onStrengthIdentifiedChange()`
- [ ] `accountability-tracker.ts` → `onAccountabilityItemChange()`

### Estimated Effort
- **Per service:** ~15-30 minutes each
- **Total services:** ~40
- **Total effort:** ~15-20 hours

---

## Phase 4: Data Quality & Governance 🔴 NOT STARTED

**Goal:** Ensure data is clean, consistent, and properly managed

### 4.1 TTL Enforcement
- [ ] Create `ttl-cleanup-job.ts` in Cloud Functions
- [ ] Schedule to run daily at 3 AM
- [ ] Query documents by `indexedAt` timestamp
- [ ] Delete documents exceeding their TTL
- [ ] Log cleanup metrics

### 4.2 Document Limits (maxPerUser)
- [ ] Implement `enforceDocumentLimits()` in store-hooks.ts
- [ ] Before indexing, check count per user per entity type
- [ ] If over limit, delete oldest documents
- [ ] Track limit enforcement metrics

### 4.3 Data Deduplication
- [ ] Create `deduplication-service.ts`
- [ ] Content similarity detection (threshold: 0.95)
- [ ] Merge duplicate entities
- [ ] Scheduled weekly cleanup

### 4.4 Data Validation
- [ ] Schema validation before indexing
- [ ] Content sanitization (remove PII patterns)
- [ ] Entity reference validation

### Estimated Effort: ~20 hours

---

## Phase 5: Pattern Library 🔴 NOT STARTED

**Goal:** Build a comprehensive library of cross-domain patterns

### 5.1 Life Pattern Templates
```typescript
// Example patterns to implement
const PATTERN_TEMPLATES = [
  // Health → Productivity
  { name: 'sleep-productivity', domains: ['health', 'productivity'], threshold: 0.7 },
  
  // Emotional → Financial
  { name: 'stress-spending', domains: ['emotional', 'financial'], threshold: 0.6 },
  
  // Social → Wellness
  { name: 'isolation-mood', domains: ['contacts', 'health'], threshold: 0.65 },
  
  // Work → Relationships
  { name: 'overwork-neglect', domains: ['career', 'contacts'], threshold: 0.7 },
  
  // Seasonal → Everything
  { name: 'seasonal-variation', domains: ['seasonal', '*'], threshold: 0.5 },
];
```

### 5.2 Pattern Categories
- [ ] **Health-Behavior Correlations** (15 patterns)
- [ ] **Financial-Emotional Correlations** (10 patterns)
- [ ] **Work-Life Correlations** (12 patterns)
- [ ] **Relationship-Wellness Correlations** (10 patterns)
- [ ] **Seasonal-Behavioral Correlations** (8 patterns)
- [ ] **Energy-Activity Correlations** (10 patterns)

### 5.3 Pattern Detection Rules
- [ ] Create `pattern-rules-engine.ts`
- [ ] Define rule syntax (conditions, thresholds, windows)
- [ ] Implement rule evaluation
- [ ] Pattern confidence scoring

### Estimated Effort: ~30 hours

---

## Phase 6: Cross-Domain Correlations 🟡 10% COMPLETE

**Goal:** Detect meaningful connections across life domains

### Current State
- Basic correlator structure exists
- 2 sample patterns (sleep-productivity, stress-spending)
- No real-time correlation processing

### 6.1 Correlation Engine Enhancement
- [ ] Historical correlation analysis (look back 30/60/90 days)
- [ ] Real-time signal processing
- [ ] Statistical significance testing
- [ ] False positive filtering

### 6.2 Correlation Types to Implement
- [ ] **Temporal correlations** (A happens → B follows)
- [ ] **Inverse correlations** (A increases → B decreases)
- [ ] **Threshold correlations** (when A > X, B changes)
- [ ] **Cyclic correlations** (weekly/monthly patterns)
- [ ] **Cascade correlations** (A → B → C)

### 6.3 Correlation Storage
- [ ] Create `correlation_history` Firestore collection
- [ ] Store discovered correlations per user
- [ ] Track correlation strength over time
- [ ] Correlation decay (weaken over time without reinforcement)

### 6.4 Persona-Specific Correlations
- [ ] Maya sees habit-financial correlations
- [ ] Peter sees research-insight correlations
- [ ] Jordan sees planning-milestone correlations
- [ ] Nayan sees values-behavior correlations

### Estimated Effort: ~25 hours

---

## Phase 7: Proactive Intelligence 🟡 10% COMPLETE

**Goal:** Surface the right insight at the right moment

### Current State
- Basic proactive engine exists
- Timing consideration implemented
- No real insight generation

### 7.1 Insight Generation
- [ ] **Pattern-based insights** (from correlations)
- [ ] **Milestone-based insights** (approaching achievements)
- [ ] **Risk-based insights** (burnout, overcommitment)
- [ ] **Opportunity-based insights** (windows for action)
- [ ] **Celebration-based insights** (wins to acknowledge)

### 7.2 Timing Intelligence
- [ ] **Time-of-day optimization** (morning vs evening topics)
- [ ] **User state awareness** (stressed? reflective? rushed?)
- [ ] **Conversation flow** (don't interrupt deep discussions)
- [ ] **Topic fatigue** (don't repeat recent insights)
- [ ] **Trust level gating** (sensitive insights need high trust)

### 7.3 Delivery Mechanisms
- [ ] **Conversational weave** (naturally introduce)
- [ ] **Gentle prompt** ("I noticed something...")
- [ ] **Direct observation** ("You've been crushing it...")
- [ ] **Question format** ("Have you noticed...")
- [ ] **Story format** ("Remember when...")

### 7.4 Feedback Loop
- [ ] Track insight reception (positive/negative/ignored)
- [ ] Adjust timing preferences
- [ ] Refine insight relevance
- [ ] Learn user preferences

### Estimated Effort: ~30 hours

---

## Phase 8: Real-Time & Sync 🔴 NOT STARTED

**Goal:** Keep everything in sync across devices and sessions

### 8.1 Real-Time Firestore Listeners
- [ ] WebSocket connection for data changes
- [ ] Selective subscription (only relevant collections)
- [ ] Offline support with sync on reconnect
- [ ] Conflict resolution

### 8.2 Cross-Session State
- [ ] Persist context assembly between sessions
- [ ] Resume intelligence where left off
- [ ] Cross-device state sync
- [ ] Session handoff (web → mobile)

### 8.3 Live Intelligence Updates
- [ ] Push proactive insights when discovered (not just at turn start)
- [ ] Real-time correlation notifications
- [ ] Background pattern detection
- [ ] Async insight delivery

### 8.4 Offline Intelligence
- [ ] Local correlation cache
- [ ] Offline insight queue
- [ ] Sync on reconnect

### Estimated Effort: ~35 hours

---

## Phase 9: Observability & Analytics 🟡 5% COMPLETE

**Goal:** Full visibility into intelligence system behavior

### Current State
- Basic health checks exist
- Observability module defined but not wired
- No API routes

### 9.1 API Routes
- [ ] `GET /api/intelligence/health` - System health
- [ ] `GET /api/intelligence/metrics` - Performance metrics
- [ ] `GET /api/intelligence/correlations/:userId` - User correlations
- [ ] `GET /api/intelligence/insights/:userId` - Recent insights
- [ ] `GET /api/semantic-store/health` - Semantic store health

### 9.2 Dashboard Data
- [ ] Index operations per hour/day
- [ ] Query latency percentiles (p50, p95, p99)
- [ ] Correlation detection rate
- [ ] Insight surfacing rate
- [ ] Cache hit rates
- [ ] Error rates by component

### 9.3 Alerting
- [ ] Index failure alerts
- [ ] High latency alerts
- [ ] Error rate threshold alerts
- [ ] Capacity alerts (approaching limits)

### 9.4 Debug Tools
- [ ] User intelligence inspector (what does Ferni know?)
- [ ] Correlation debugger (why was this detected?)
- [ ] Insight trace (why was this surfaced?)
- [ ] Index viewer (what's in semantic memory?)

### Estimated Effort: ~20 hours

---

## Phase 10: Production Hardening 🔴 NOT STARTED

**Goal:** Make it bulletproof for real users

### 10.1 Performance Optimization
- [ ] Index batch processing optimization
- [ ] Query caching improvements
- [ ] Embedding generation batching
- [ ] Memory footprint reduction

### 10.2 Error Handling
- [ ] Graceful degradation (if semantic fails, use structured)
- [ ] Circuit breakers for external services
- [ ] Retry logic with exponential backoff
- [ ] Error isolation (one user's error doesn't affect others)

### 10.3 Scale Testing
- [ ] Load test with 10K concurrent users
- [ ] Stress test indexing pipeline
- [ ] Query performance at scale
- [ ] Memory leak detection

### 10.4 Security Audit
- [ ] Cross-user data access prevention
- [ ] PII detection and filtering
- [ ] Audit logging
- [ ] Rate limiting

### 10.5 Integration Testing
- [ ] E2E test with Firestore emulator
- [ ] Full pipeline test (store → index → query)
- [ ] Multi-persona test
- [ ] Session lifecycle test

### 10.6 Documentation
- [ ] API documentation
- [ ] Architecture diagrams
- [ ] Runbook for common issues
- [ ] On-call playbook

### Estimated Effort: ~40 hours

---

## Summary: Remaining Work

| Phase | Status | Effort | Priority |
|-------|--------|--------|----------|
| Phase 3: Service Wiring | 5% | 20 hrs | P0 - Critical |
| Phase 4: Data Quality | 0% | 20 hrs | P1 - High |
| Phase 5: Pattern Library | 0% | 30 hrs | P1 - High |
| Phase 6: Correlations | 10% | 25 hrs | P1 - High |
| Phase 7: Proactive | 10% | 30 hrs | P1 - High |
| Phase 8: Real-Time | 0% | 35 hrs | P2 - Medium |
| Phase 9: Observability | 5% | 20 hrs | P2 - Medium |
| Phase 10: Hardening | 0% | 40 hrs | P2 - Medium |
| **TOTAL** | | **~220 hrs** | |

---

## Next Immediate Steps

### This Week (Phase 3 Priority)
1. **Wire superhuman services** - Start with predictive-coaching, capacity-guardian
2. **Wire trust system gaps** - inside-jokes, small-wins, growth-reflection
3. **Wire calendar services** - unified-calendar, meeting-memory

### Next Week (Phase 4 + 6)
4. **Implement TTL cleanup job**
5. **Implement document limits**
6. **Build 10 more correlation patterns**
7. **Test correlations with real data**

### Following Weeks
8. **Complete pattern library** (Phase 5)
9. **Enhance proactive engine** (Phase 7)
10. **Build observability routes** (Phase 9)
11. **Performance testing** (Phase 10)

---

## Architecture Diagram (Target State)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER EXPERIENCE                                    │
│   Ferni understands context, detects patterns, surfaces insights proactively    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PROACTIVE INTELLIGENCE                                │
│   - Right insight at right moment                                               │
│   - Trust-gated delivery                                                        │
│   - Feedback learning                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CROSS-DOMAIN CORRELATIONS                                │
│   - 65+ pattern templates                                                       │
│   - Real-time signal processing                                                 │
│   - Historical analysis                                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CONTEXT ASSEMBLY                                      │
│   - 98 entity types                                                             │
│   - Persona-aware prioritization                                                │
│   - Session continuity                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────────┐
│      DOMAIN STORES (CRUD)         │   │        SEMANTIC MEMORY (RAG)          │
│   - productivity-store            │   │   - firestore-vector-store            │
│   - financial-store               │◄──│   - semantic-rag                      │
│   - life-data-store               │   │   - embedding-cache                   │
│   - trust stores                  │   │   - advanced-retrieval                │
│   - superhuman stores             │   │                                       │
│   - calendar stores               │   │   Auto-indexed via hooks              │
│   - contact stores                │   │                                       │
└───────────────────────────────────┘   └───────────────────────────────────────┘
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FIRESTORE                                          │
│   bogle_users/{userId}/...                                                      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

*This plan is a living document. Update as phases complete.*

_Last updated: December 30, 2024_
