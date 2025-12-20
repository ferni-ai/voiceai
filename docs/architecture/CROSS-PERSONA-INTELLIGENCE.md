# Cross-Persona Intelligence System

> **We believe in making AI human, and the decisions we make will reflect that.**

The Cross-Persona Intelligence System enables Ferni's team to collaborate like a real team of experts - sharing insights, coordinating handoffs, and providing unified support to users. This document covers the complete architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Persona Context Builders](#persona-context-builders)
4. [Superhuman Services](#superhuman-services)
5. [Cross-Persona Insights](#cross-persona-insights)
6. [Real-Time Notifications](#real-time-notifications)
7. [Performance & Caching](#performance--caching)
8. [Debug Tools](#debug-tools)
9. [Testing](#testing)
10. [API Reference](#api-reference)

---

## Overview

### What It Does

The Cross-Persona Intelligence System provides:

1. **Team Coordination** - Personas share insights with each other during handoffs
2. **Superhuman Capabilities** - 10 services that give Ferni abilities no human friend has
3. **Real-Time Updates** - WebSocket streaming of high-priority insights
4. **Proactive Discovery** - Background scanning for patterns across user data

### Key Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CROSS-PERSONA INTELLIGENCE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐        │
│  │ Peter Research │    │ Maya Coaching  │    │Jordan Milestone│        │
│  │    Insights    │───▶│    Insights    │───▶│    Insights    │        │
│  └────────────────┘    └────────────────┘    └────────────────┘        │
│          │                     │                     │                  │
│          │                     │                     │                  │
│          ▼                     ▼                     ▼                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                  SUPERHUMAN INTEGRATION                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │Commitment│ │Predictive│ │   Life   │ │  Values  │  ...     │    │
│  │  │  Keeper  │ │ Coaching │ │Narrative │ │Alignment │          │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                 CROSS-PERSONA INSIGHTS SERVICE                  │    │
│  │  • Records insights from all personas                          │    │
│  │  • Scans for patterns across domains                           │    │
│  │  • Builds handoff briefings                                    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    INSIGHTS BROADCAST (WS)                      │    │
│  │  • Real-time streaming to frontend                             │    │
│  │  • Priority-based filtering                                    │    │
│  │  • Background scanning                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### File Structure

```
src/
├── intelligence/context-builders/
│   ├── peter-research-insights.ts      # Peter's deep research briefings
│   ├── maya-coaching-insights.ts       # Maya's habit coaching insights
│   ├── jordan-milestone-insights.ts    # Jordan's milestone planning
│   ├── alex-communication-insights.ts  # Alex's communication coaching
│   ├── nayan-wisdom-insights.ts        # Nayan's life wisdom synthesis
│   ├── ferni-coordinator-intelligence.ts # Ferni's handoff suggestions
│   ├── superhuman-integration.ts       # Bridges superhuman services
│   └── shared-types.ts                 # Common interfaces
│
├── services/
│   ├── cross-persona-insights.ts       # Central insight management
│   ├── insights-broadcast.ts           # WebSocket event bus
│   ├── insights-websocket.ts           # WebSocket server
│   └── superhuman/                     # 10 superhuman services
│       ├── index.ts                    # Unified builder
│       ├── commitment-keeper.ts
│       ├── predictive-coaching.ts
│       ├── life-narrative.ts
│       ├── values-alignment.ts
│       ├── emotional-first-aid.ts
│       ├── relationship-network.ts
│       ├── capacity-guardian.ts
│       ├── dream-keeper.ts
│       ├── relationship-milestones.ts
│       ├── seasonal-awareness.ts
│       └── firestore-utils.ts
│
├── api/routes/
│   └── team-insights.ts                # REST API for insights
│
└── tests/
    ├── cross-persona-insights.test.ts
    ├── cross-persona-integration.test.ts
    └── superhuman-firestore.integration.test.ts

apps/web/src/
├── services/
│   └── cross-team-notifications.service.ts  # Frontend WebSocket client
└── ui/
    ├── team-insights.ui.ts             # Insights panel UI
    └── insights-debug-panel.ui.ts      # Debug tools
```

### Data Flow

```
User Conversation
       │
       ▼
┌─────────────────┐
│  Voice Agent    │
│  (turn-handler) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT BUILDER PIPELINE                      │
│                                                                  │
│  1. Load persona-specific builder (peter/maya/jordan/alex/nayan) │
│  2. Fetch cross-team data (habits, goals, calendar, finances)    │
│  3. Get superhuman context (commitments, predictions, etc.)      │
│  4. Build injection with insights and guidance                   │
│  5. Inject into LLM prompt                                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   LLM Response  │──────▶ User hears personalized, insightful response
└─────────────────┘
```

---

## Persona Context Builders

Each persona has a specialized context builder that runs when they become active (via handoff or direct selection).

### Peter Research Insights

**File:** `src/intelligence/context-builders/peter-research-insights.ts`

**Purpose:** Loads Peter with comprehensive research and analytical insights.

**What It Provides:**
- Cross-team data from Maya (habits), Jordan (goals), Alex (calendar)
- Financial pattern analysis (spending triggers, savings progress)
- Mood/energy intelligence for timing recommendations
- Proactive coaching trigger detection

**Activation:** First turn with Peter OR handoff to Peter

```typescript
// Example injection
[PETER'S RESEARCH BRIEFING]
Cross-Team Data Available:
- Maya: 3 active habits, 85% consistency this week
- Jordan: 2 active goals, 1 nearing completion
- Financial: Budget 65% used, 2 stress triggers detected

Mood Intelligence:
- Average mood: 7.2/10
- Best times: Morning (9-11am)
- Recent energy: Stable
```

### Maya Coaching Insights

**File:** `src/intelligence/context-builders/maya-coaching-insights.ts`

**Purpose:** Provides Maya with habit coaching context and cross-team awareness.

**What It Provides:**
- Computed habit health metrics (consistency, cascade potential, recovery speed)
- Four Tendencies detection (Upholder/Questioner/Obliger/Rebel)
- Mood-habit correlations
- Proactive triggers (celebration, support, challenge opportunities)

**Key Metrics:**
```typescript
interface HabitHealthSummary {
  consistencyIndex: number;     // 0-100, habit reliability
  cascadePotential: number;     // How much habits compound
  recoverySpeed: number;        // How fast they bounce back
  momentumScore: number;        // Current momentum
  keystonePower: number;        // Keystone habit strength
}
```

### Jordan Milestone Insights

**File:** `src/intelligence/context-builders/jordan-milestone-insights.ts`

**Purpose:** Equips Jordan with milestone planning intelligence.

**What It Provides:**
- Memory orchestrator integration (historical life events, anniversaries)
- Planning velocity metrics
- Celebration readiness assessment
- Seasonal/time pattern analysis (wedding season, graduation, holidays)

**Key Metrics:**
```typescript
interface PlanningMetrics {
  planningVelocity: number;      // Goals completed per month
  celebrationReadiness: number;  // 0-100, ready to celebrate?
  lifeStage: string;             // Current life chapter
  momentumIndicator: string;     // 'building' | 'maintaining' | 'recovering'
}
```

### Alex Communication Insights

**File:** `src/intelligence/context-builders/alex-communication-insights.ts`

**Purpose:** Gives Alex chief-of-staff communication context.

**What It Provides:**
- Calendar density analysis
- Communication pattern detection
- Response velocity tracking
- Delegation clarity assessment
- Difficult conversation preparation

**Key Metrics:**
```typescript
interface CommunicationBriefing {
  communicationReadiness: number;  // 0-100
  calendarDensity: number;         // Meetings per day
  responseVelocity: number;        // Response time trend
  delegationClarity: number;       // How clear their asks are
  contextSwitchLoad: number;       // Mental load indicator
}
```

### Nayan Wisdom Insights

**File:** `src/intelligence/context-builders/nayan-wisdom-insights.ts`

**Purpose:** Provides Nayan with holistic life wisdom synthesis.

**What It Provides:**
- Life integration score across all domains
- Values alignment tracking
- Existential context (legacy, meaning, mortality awareness)
- Life narrative (chapters, themes, transformation moments)
- Team synthesis (patterns from all other personas)

**Key Metrics:**
```typescript
interface LifeSynthesis {
  lifeIntegrationScore: number;  // How well domains work together
  meaningCoherence: number;      // Alignment of actions with meaning
  legacyReadiness: number;       // Thinking about lasting impact
  innerPeaceIndex: number;       // Internal harmony
  growthTrajectory: string;      // 'expanding' | 'integrating' | 'deepening'
}
```

### Ferni Coordinator Intelligence

**File:** `src/intelligence/context-builders/ferni-coordinator-intelligence.ts`

**Purpose:** Helps Ferni suggest smart handoffs based on team insights.

**What It Provides:**
- Team status summary
- Proactive handoff suggestions
- Cross-persona insight briefings
- User need detection

---

## Superhuman Services

10 services that give Ferni capabilities no human friend can consistently provide.

### Service Overview

| Service | Purpose | Firestore Collection |
|---------|---------|---------------------|
| **Commitment Keeper** | Tracks intentions, promises, decisions | `bogle_users/{userId}/commitments` |
| **Predictive Coaching** | Anticipates struggles from patterns | `bogle_users/{userId}/patterns` |
| **Life Narrative** | Builds coherent life story | `bogle_users/{userId}/narrative` |
| **Values Alignment** | Tracks stated vs. demonstrated values | `bogle_users/{userId}/values` |
| **Emotional First Aid** | Crisis detection and grounding | N/A (stateless) |
| **Relationship Network** | Maps social connections | `bogle_users/{userId}/relationships` |
| **Capacity Guardian** | Monitors energy and burnout risk | `bogle_users/{userId}/capacity` |
| **Dream Keeper** | Guards long-term aspirations | `bogle_users/{userId}/dreams` |
| **Relationship Milestones** | Celebrates journey with Ferni | `bogle_users/{userId}/milestones` |
| **Seasonal Awareness** | Connects to seasonal patterns | `bogle_users/{userId}/seasonal` |

### Using Superhuman Services

```typescript
import { buildSuperhumanContext, formatSuperhumanContextForPrompt } from '../services/superhuman/index.js';

// Build complete context
const context = await buildSuperhumanContext(userId, {
  crisisSignal: { type: 'text', signal: userMessage },
  relationshipStats: {
    totalConversations: 50,
    firstConversation: Date.now() - 30 * 24 * 60 * 60 * 1000,
    lastConversation: Date.now(),
  },
});

// Format for LLM injection
const formatted = formatSuperhumanContextForPrompt(context);
```

### Persona-Specific Capabilities

Different personas get different superhuman capabilities:

```typescript
const PERSONA_SUPERHUMAN_MAP = {
  peter: ['commitments', 'predictions', 'values', 'capacity'],
  maya: ['commitments', 'predictions', 'capacity', 'seasonal'],
  jordan: ['narrative', 'dreams', 'milestones', 'seasonal'],
  alex: ['commitments', 'capacity', 'network'],
  nayan: ['narrative', 'values', 'dreams', 'seasonal'],
  ferni: ['commitments', 'predictions', 'narrative', 'values', 'crisis', 'network', 'capacity', 'dreams', 'milestones', 'seasonal'],
};
```

---

## Cross-Persona Insights

### Insight Types

```typescript
type InsightSource = 'peter' | 'maya' | 'jordan' | 'nayan' | 'ferni' | 'system';
type InsightTarget = InsightSource | 'all';
type InsightPriority = 'critical' | 'high' | 'normal' | 'low';

interface CrossPersonaInsight {
  id: string;
  source: InsightSource;
  target: InsightTarget;
  priority: InsightPriority;
  content: string;
  category: string;
  proactive: boolean;
  oneTime: boolean;
  createdAt: number;
  expiresAt: number;
}
```

### Recording Insights

```typescript
import { addCrossPersonaInsight } from '../services/cross-persona-insights.js';

// Peter notices stress spending, tells Maya
addCrossPersonaInsight(userId, {
  source: 'peter',
  target: 'maya',
  priority: 'high',
  content: 'Stress spending detected - habit support might help',
  category: 'stress-spending-pattern',
  proactive: true,
  oneTime: true,
});
```

### Automatic Scanning

The system periodically scans for cross-persona insights:

```typescript
// Automatic triggers
- Peter → Maya: Stress spending detected
- Maya → Jordan: Keystone habit driving momentum
- Jordan → Nayan: Life transition detected
- Maya → All: Streak milestone celebration
- Peter → Jordan: Budget constraint for planning
- System → All: Multiple habits at risk
```

---

## Real-Time Notifications

### WebSocket Architecture

```
Backend                                    Frontend
─────────────────────────────────────────────────────────
                                          
addCrossPersonaInsight()                  
        │                                 
        ▼                                 
insightsBroadcast.publishInsight()        
        │                                 
        ▼                                 
InsightsWebSocket                         
        │                                 
        │ ──── /ws/insights ────▶        WebSocket Client
        │                                      │
        │                                      ▼
        │                                 NotificationService
        │                                      │
        │                                      ▼
        │                                 Toast/Panel UI
```

### Frontend Integration

```typescript
import { initCrossTeamNotifications } from '../services/cross-team-notifications.service.js';

// Initialize on app start
initCrossTeamNotifications(userId);

// Get state for debug panel
const state = getState();
// {
//   wsConnected: true,
//   reconnectAttempts: 0,
//   notificationCount: 5,
//   lastNotificationAgo: 30000,
//   sessionDurationMs: 300000
// }
```

### Reconnection Strategy

WebSocket uses exponential backoff with jitter:

```typescript
const BASE_DELAY = 1000;      // 1 second
const MAX_DELAY = 30000;      // 30 seconds max
const MAX_ATTEMPTS = 10;

// Delay calculation
const delay = Math.min(BASE_DELAY * Math.pow(2, attempts), MAX_DELAY);
const jitter = delay * 0.2 * Math.random();
const finalDelay = delay + jitter;
```

---

## Performance & Caching

### Tiered Caching System

Different data has different staleness tolerances:

| Tier | TTL | Capabilities | Rationale |
|------|-----|--------------|-----------|
| **STABLE** | 5 min | seasonal, narrative, values | Change slowly |
| **NORMAL** | 2 min | network, dreams, milestones | Moderate change |
| **FRESH** | 30 sec | commitments, predictions, capacity | Change frequently |

### Cache API

```typescript
import {
  getSuperhuman,
  warmupSuperhumanCache,
  clearSuperhumanCache,
  getCacheStats,
} from '../intelligence/context-builders/superhuman-integration.js';

// Pre-warm cache on session start
await warmupSuperhumanCache(userId);

// Get context (uses cache if available)
const context = await getSuperhuman(userId, 'peter');

// Force refresh
const fresh = await getSuperhuman(userId, 'peter', { forceRefresh: true });

// Get cache statistics
const stats = getCacheStats();
// {
//   fullCacheSize: 5,
//   stableCacheSize: 15,
//   normalCacheSize: 12,
//   freshCacheSize: 8
// }
```

### Performance Tracking

```typescript
import { getPerformanceStats } from '../intelligence/context-builders/superhuman-integration.js';

const stats = getPerformanceStats();
// {
//   totalCalls: 150,
//   averageDurationMs: 180,
//   cacheHitRate: 0.65,
//   slowestCall: { durationMs: 450, persona: 'ferni', ... },
//   recentCalls: [...]
// }
```

---

## Debug Tools

### Debug Panel

Access the debug panel in development:

1. Enable dev mode: `?dev` URL param or `Cmd/Ctrl+Shift+D`
2. Look for "🔍 Cross-Persona Insights" in the dev panel

**Features:**
- WebSocket connection health indicator (green/yellow/red)
- Real-time reconnection status
- Performance statistics
- Recent insights list
- Cache clear button

### Health Status Indicator

| Status | Color | Meaning |
|--------|-------|---------|
| 🟢 Healthy | Green | Connected, no issues |
| 🟡 Recovered | Yellow | Connected after reconnection |
| 🟡 Reconnecting | Yellow | Currently reconnecting |
| 🔴 Disconnected | Red | Not connected |

### API Endpoints

```bash
# Get team insights
GET /api/team-insights
Headers: x-user-id: <userId>

# Acknowledge insight
POST /api/team-insights/acknowledge/:insightId
Headers: x-user-id: <userId>

# Trigger insight scan
POST /api/team-insights/scan
Headers: x-user-id: <userId>

# Get performance stats (debug)
GET /api/team-insights/performance
Headers: x-user-id: <userId>

# Clear caches (debug)
POST /api/team-insights/performance/clear
```

---

## Testing

### Unit Tests

```bash
# Run all cross-persona tests
pnpm vitest run src/tests/cross-persona

# Run specific test file
pnpm vitest run src/tests/cross-persona-integration.test.ts
```

### Integration Tests (Firestore)

```bash
# Start emulator
firebase emulators:start --only firestore

# Run with emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run superhuman-firestore
```

### Test Coverage

| Area | Tests | Coverage |
|------|-------|----------|
| Cross-Persona Insights | 33 | Core insight flow |
| Integration Tests | 30 | Builder integration, E2E |
| Firestore Integration | 22 | Superhuman services |

---

## API Reference

### Cross-Persona Insights Service

```typescript
// Record an insight
addCrossPersonaInsight(userId: string, insight: Omit<CrossPersonaInsight, 'id' | 'createdAt' | 'expiresAt'>): CrossPersonaInsight

// Get insights for a persona
getInsightsForPersona(userId: string, persona: PersonaId): CrossPersonaInsight[]

// Get proactive insights
getProactiveInsights(userId: string): CrossPersonaInsight[]

// Consume (acknowledge) an insight
consumeInsight(userId: string, insightId: string): boolean

// Generate team status summary
generateTeamStatus(userId: string): Promise<TeamStatusSummary>

// Scan for new insights
scanForCrossPersonaInsights(userId: string): Promise<void>

// Build handoff briefing
buildInsightBriefingForHandoff(userId: string, targetPersona: PersonaId): Promise<InsightBriefing>
```

### Superhuman Integration

```typescript
// Get formatted superhuman context
getSuperhuman(userId: string, persona: PersonaSuperhuman, options?: { forceRefresh?: boolean; crisisSignal?: string }): Promise<string>

// Pre-warm cache
warmupSuperhumanCache(userId: string): Promise<void>

// Clear user's cache
clearSuperhumanCache(userId: string): void

// Clear all caches
clearAllSuperhumanCache(): void

// Get cache stats
getCacheStats(): { fullCacheSize: number; stableCacheSize: number; normalCacheSize: number; freshCacheSize: number }

// Get performance stats
getPerformanceStats(): PerformanceStats

// Clear performance log
clearPerformanceLog(): void
```

### WebSocket Events

```typescript
interface InsightBroadcastEvent {
  type: 'new_insight' | 'insight_batch' | 'scan_complete' | 'heartbeat';
  userId: string;
  insights?: CrossPersonaInsight[];
  insight?: CrossPersonaInsight;
  timestamp: number;
  scanDuration?: number;
}
```

---

## Best Practices

### Adding New Persona Insights

1. Create builder in `src/intelligence/context-builders/<persona>-<domain>-insights.ts`
2. Register in `builder-imports.ts` and `loader.ts`
3. Add superhuman capability mapping in `superhuman-integration.ts`
4. Write tests in `src/tests/cross-persona-integration.test.ts`

### Recording Insights

- Use `high` priority for actionable insights
- Use `proactive: true` for insights that should be surfaced
- Use `oneTime: true` for insights that shouldn't repeat
- Keep content concise (1-2 sentences)

### Performance Tips

- Call `warmupSuperhumanCache()` on session start
- Use appropriate cache tier for data freshness needs
- Monitor performance via debug panel
- Consider batching related operations

---

## Troubleshooting

### WebSocket Not Connecting

1. Check Vite proxy config includes `/ws` endpoint
2. Verify backend WebSocket server is initialized
3. Check browser console for connection errors

### Insights Not Appearing

1. Verify insight priority is `high` or `proactive: true`
2. Check WebSocket connection in debug panel
3. Verify user ID is passed correctly

### Slow Context Builds

1. Check cache hit rate in performance stats
2. Pre-warm cache on session start
3. Consider which capabilities are actually needed

---

*Last updated: December 2024*

