# Semantic Intelligence E2E Audit & Plan

> **We believe in making AI human, and the decisions we make will reflect that.**

This document provides a comprehensive audit of Ferni's semantic routing, semantic intelligence, data storage, superhuman context injection, and intelligent outreach systems. It identifies coverage gaps and provides an E2E implementation plan.

---

## 📊 Executive Summary

| System | Completion | Status |
|--------|------------|--------|
| **Semantic Routing** | 85% | ✅ Operational, gaps in emotion-aware routing |
| **Semantic Intelligence** | 90% | ✅ Comprehensive, v3.7 deployed |
| **Data Layer (Firestore)** | 80% | ✅ Core complete, TTL cleanup needed |
| **Vector Store** | 85% | ✅ Working, indexing policy gaps |
| **Superhuman Context Injection** | 100% | ✅ Session priming implemented |
| **Intelligent Outreach** | 90% | ✅ Comprehensive, webhook gaps |

**Overall E2E Score: 88%** - Strong foundation with specific gaps

---

## 1️⃣ SEMANTIC ROUTING SYSTEM

### Current Architecture

```
User Input
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│              SEMANTIC TOOL ROUTER (4 Layers)                  │
├───────────────────────────────────────────────────────────────┤
│ Layer 1: Fast Pattern Matching (<1ms)                         │
│   - Regex patterns, keyword scoring                           │
│ Layer 2: Embedding Similarity (~10-30ms)                      │
│   - Vector similarity with pre-computed tool embeddings       │
│ Layer 3: Context-Aware Refinement                             │
│   - Recent tools, conversation history, persona context       │
│ Layer 4: Holistic NLU Layer                                   │
│   - Intent detection, slot filling, multi-intent              │
└───────────────────────────────────────────────────────────────┘
    │
    ├── High Confidence (>0.85) → Direct Execution
    │
    └── Low Confidence → LLM Fallback
```

### Key Files

| File | Purpose | Status |
|------|---------|--------|
| `router.ts` | Main entry point | ✅ Complete |
| `matcher.ts` | Combined matching | ✅ Complete |
| `registry.ts` | Tool registration | ✅ Complete |
| `holistic-layer.ts` | NLU refinement | ✅ Complete |
| `voice-integration.ts` | Voice-specific routing | ✅ Complete |
| `i18n/multilingual.ts` | Multi-language support | ✅ Complete |

### Advanced Features

| Feature | File | Status |
|---------|------|--------|
| Active Learning | `advanced/active-learning.ts` | ✅ Complete |
| Prosody-Aware Routing | `advanced/prosody-routing-integration.ts` | ✅ Complete |
| Tool Chain Prediction | `advanced/tool-chain-predictor.ts` | ✅ Complete |
| Intelligent Orchestrator | `advanced/intelligent/orchestrator.ts` | ✅ Complete |
| Personalization | `advanced/personalization.ts` | ✅ Complete |
| Streaming Router | `advanced/streaming-router.ts` | ✅ Complete |

### Coverage Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **Voice emotion → routing** | Angry voice not boosting conflict tools | P1 |
| **New domain coverage** | New domains (shame, sobriety, etc.) need patterns | P1 |
| **Cross-domain intents** | "I'm stressed about my divorce AND job loss" | P2 |
| **Proactive tool suggestion** | Context-driven tool suggestions | P3 |

---

## 2️⃣ SEMANTIC INTELLIGENCE SYSTEM

### Current Architecture (v3.7)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SEMANTIC INTELLIGENCE v3.7                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  V3.0 CORE (6 Capabilities)              V3.2+ EXTENSIONS                   │
│  ─────────────────────────               ────────────────────                │
│  1. Correlation Mining          ───→     7. Insight Broker (proactive)      │
│  2. Emotional Trajectories      ───→     8. Open Loops (unfinished biz)     │
│  3. Relational Semantics        ───→     9. Ferni Commitments               │
│  4. Counterfactual Memory       ───→    10. Relationship Graph (v3.3)       │
│  5. Growth Fingerprint          ───→    11. Temporal Patterns (v3.4)        │
│  6. Cross-Session Threading     ───→    12. Behavioral Intelligence (v3.5)  │
│                                          13. Coaching Intelligence (v3.6)   │
│                                          14. Self-Awareness (v3.7)          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         buildSemanticIntelligenceContext()
                    │
                    ▼
              LLM Context Injection
```

### Key Files

| File | Capability | Status |
|------|------------|--------|
| `correlation-mining.ts` | Connect dots across domains | ✅ Complete |
| `emotional-trajectories.ts` | See journeys, not moments | ✅ Complete |
| `relational-semantics.ts` | Know who brings joy vs. drains | ✅ Complete |
| `counterfactual-memory.ts` | Learn from paths taken/not taken | ✅ Complete |
| `growth-fingerprint.ts` | Show how they've evolved | ✅ Complete |
| `cross-session-threading.ts` | Find hidden connections | ✅ Complete |
| `insight-broker.ts` | Proactive insight surfacing | ✅ Complete |
| `open-loops.ts` | Track unfinished business | ✅ Complete |
| `ferni-commitments.ts` | Track Ferni's promises | ✅ Complete |
| `relationship-graph.ts` | Social network mapping | ✅ Complete |
| `temporal-patterns.ts` | Time-based patterns | ✅ Complete |
| `behavioral-intelligence.ts` | Behavioral baselines | ✅ Complete |
| `coaching-intelligence.ts` | Coaching strategy | ✅ Complete |
| `self-awareness.ts` | System self-monitoring | ✅ Complete |
| `integration.ts` | Turn handler bridge | ✅ Complete |

### Coverage Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **Emotion trajectory → tool routing** | Trajectories don't inform tool selection | P1 |
| **Relationship graph → outreach** | Graph doesn't drive outreach timing | P2 |
| **Growth fingerprint → celebration** | Progress not proactively celebrated | P2 |
| **Cross-session → callback prompts** | Hidden connections not surfaced as callbacks | P2 |

---

## 3️⃣ DATA LAYER (FIRESTORE + VECTOR STORE)

### Firestore Schema

```
bogle_users/{userId}/
├── profile                          # Core user profile
├── memories/                        # Semantic memory documents
├── patterns/                        # Behavioral patterns
├── commitments/                     # Promise/intention tracking
├── relationships/                   # Social network (RelationshipGraph)
├── values/                          # Core values alignment
├── dreams/                          # Long-term aspirations
├── capacity/                        # Burnout/energy tracking
├── narrative/                       # Life chapters
├── seasonal/                        # Seasonal patterns
├── preferences/                     # Communication preferences
├── sessions/                        # Session state persistence
├── tool_executions/                 # Tool usage history
├── persona_bonds/                   # Per-persona relationship depth
├── voice_profile/                   # Voice characteristics
├── intents/                         # Intent history for learning
├── superhuman_cache/                # Cached superhuman insights
├── quality_metrics/                 # Per-session quality data
├── associative_memory/              # Associative triggers
├── behavioral_patterns/             # Pattern type → pattern data
├── communication_preferences/       # Communication style
├── emotional_threads/               # Emotional threading
├── semantic_intelligence/           # V3.0-3.7 data
│   ├── correlations/
│   ├── trajectories/
│   ├── relationships/
│   ├── counterfactuals/
│   ├── growth/
│   ├── threads/
│   ├── open_loops/
│   ├── ferni_commitments/
│   ├── temporal/
│   ├── behavioral/
│   └── coaching/
├── outreach/                        # Outreach system data
│   ├── triggers/
│   ├── history/
│   ├── context/
│   ├── timing/
│   └── channel_preferences/
└── trust_profiles/                  # Trust system data
    ├── reading_between_lines/
    ├── boundary_memory/
    ├── growth_reflection/
    ├── inside_jokes/
    ├── small_wins/
    └── thinking_of_you/
```

### Vector Store

```
vector_embeddings/{userId}/
├── {documentId}
│   ├── embedding: Float32Array[1536]    # Text-embedding-004
│   ├── content: string                   # Original text
│   ├── metadata: {
│   │     entityType: string,             # habit, goal, memory, etc.
│   │     domain: string,                 # productivity, financial, etc.
│   │     priority: 'high' | 'normal',
│   │     createdAt: Timestamp,
│   │     ttlDays?: number
│   │   }
│   └── score?: number                    # Relevance score (transient)
```

### Data Layer Hooks

| Hook | Domain | Triggers Indexing |
|------|--------|-------------------|
| `onCommitmentKeeperChange` | Trust | ✅ Yes |
| `onDreamChange` | Superhuman | ✅ Yes |
| `onLifeChapterChange` | Superhuman | ✅ Yes |
| `onValuesAlignmentChange` | Superhuman | ✅ Yes |
| `onCapacityStateChange` | Superhuman | ✅ Yes |
| `onSeasonalPatternChange` | Superhuman | ✅ Yes |
| `onVoiceBiomarkerChange` | Better Than Human | ✅ Yes |
| `onSessionSummaryChange` | Better Than Human | ✅ Yes |
| `onHabitChange` | Productivity | ✅ Yes |
| `onSavingsGoalChange` | Financial | ✅ Yes |
| `onContactChange` | Contacts | ✅ Yes |
| `onCalendarEventChange` | Calendar | ✅ Yes |

### Coverage Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **TTL cleanup job** | Old data not auto-purged | P1 |
| **New domain indexing** | New life stage domains not indexed | P1 |
| **Cross-collection queries** | Complex queries require multiple fetches | P2 |
| **Embedding cache warming** | Cold start latency on first query | P2 |
| **Vector store deduplication** | Similar memories may duplicate | P3 |

---

## 4️⃣ SUPERHUMAN CONTEXT INJECTION

### Current Flow

```
Session Start
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│            CONTEXT BUILDER PIPELINE (Priority-Ordered)        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  P20: Crisis Detection (immediate safety)                     │
│  P25: Superhuman Session Priming ← NEW! (all services)       │
│  P30: Voice-Text Mismatch Critical                           │
│  P35: Commitment Follow-Up                                    │
│  P40: Prediction Surfacing                                    │
│  P50: Trust Context                                           │
│  P55: Emotional Context                                       │
│  P60: Persona Intelligence                                    │
│  P65: Unified Data Context                                    │
│  P70: Semantic Intelligence Context (V3.0-3.7)               │
│  P75: Memory Orchestrator                                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
 LLM System Prompt Injection
```

### Superhuman Services Integrated

| Service | Context Builder | Injection Point |
|---------|-----------------|-----------------|
| **Commitment Keeper** | `superhuman-session-priming.ts` | Session start |
| **Dream Keeper** | `superhuman-session-priming.ts` | Session start |
| **Capacity Guardian** | `superhuman-session-priming.ts` | Session start |
| **Values Alignment** | `superhuman-session-priming.ts` | Session start |
| **Seasonal Awareness** | `superhuman-session-priming.ts` | Session start |
| **Life Narrative** | `semantic-intelligence/index.ts` | Per-turn |
| **Predictive Coaching** | `prediction-surfacing.ts` | Per-turn |
| **Emotional First Aid** | `crisis.ts` | Per-turn (high priority) |
| **Relationship Network** | `relational-semantics.ts` | Per-turn |

### Coverage Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **Live injection during conversation** | Session priming only at start | P1 |
| **Emotion-triggered escalation** | Crisis not escalating to Ferni handoff | P2 |
| **Commitment surfacing timing** | Always at start, not when relevant | P2 |
| **Values alignment during decisions** | Not triggered by decision language | P3 |

---

## 5️⃣ INTELLIGENT OUTREACH SYSTEM

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTELLIGENT OUTREACH                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRIGGERS                    DECISION ENGINE              DELIVERY           │
│  ────────                    ───────────────              ────────           │
│  • Session-extracted  ──→   • Rate limiting      ──→    • SMS (Twilio)      │
│  • ML prediction      ──→   • Timing intelligence ──→   • Email (SendGrid)  │
│  • Trust-based        ──→   • Channel selection   ──→   • Push (FCM)        │
│  • Pattern-triggered  ──→   • Persona selection   ──→   • Voice Call (SIP)  │
│  • Superhuman         ──→   • A/B testing         ──→   • Voice Message     │
│                              • Message generation                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Trigger Types

| Trigger | Source | Auto-Generated |
|---------|--------|----------------|
| `commitment_check` | Session extraction | ✅ Yes |
| `emotional_support` | Emotion detection | ✅ Yes |
| `celebration` | Win detection | ✅ Yes |
| `habit_check` | Maya session | ✅ Yes |
| `milestone_approaching` | Calendar awareness | ✅ Yes |
| `reengagement` | Low activity | ✅ Yes |
| `thinking_of_you` | Trust systems | ✅ Yes |
| `content_share` | Relevant content | ⚠️ Partial |
| `ml_prediction` | Predictive coaching | ✅ Yes |
| `streak_protection` | Habit streaks | ✅ Yes |
| `concern_followup` | Concern detection | ✅ Yes |

### Coverage Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **New domain triggers** | Life stage domains not triggering outreach | P1 |
| **Superhuman → outreach bridge** | Dream/capacity/values not triggering | P1 |
| **Inbound reply processing** | SMS replies not routed to agents | P2 |
| **Webhook verification** | Missing signature validation | P2 |
| **A/B test result analysis** | Tests not auto-learning | P3 |

---

## 6️⃣ E2E FLOW ANALYSIS

### Complete Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           E2E DATA FLOW                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. USER EXPERIENCE LAYER                                                     │
│  ─────────────────────────                                                    │
│  User speaks → WebRTC → LiveKit → Voice Agent                                │
│                                                                               │
│  2. SEMANTIC ROUTING LAYER                                                    │
│  ────────────────────────                                                     │
│  Voice Input → STT → SemanticRouter.route() → Tool Selection                 │
│       ↓                                                                       │
│  [Pattern Match + Embedding + Context + Holistic] → Confidence Score         │
│                                                                               │
│  3. CONTEXT INJECTION LAYER                                                   │
│  ──────────────────────────                                                   │
│  buildContextInjections() → All Context Builders → System Prompt             │
│       ↓                                                                       │
│  [Superhuman Priming + Trust + Emotion + Memory + Semantic Intelligence]     │
│                                                                               │
│  4. LLM PROCESSING LAYER                                                      │
│  ──────────────────────                                                       │
│  Gemini/OpenAI → Response Generation → Tool Execution (if needed)            │
│                                                                               │
│  5. DATA CAPTURE LAYER                                                        │
│  ────────────────────                                                         │
│  processSemanticIntelligence() → All 14 Intelligence Systems                 │
│       ↓                                                                       │
│  [Correlations, Trajectories, Relationships, Growth, Temporal, etc.]         │
│                                                                               │
│  6. STORAGE LAYER                                                             │
│  ─────────────                                                                │
│  Domain Hooks → Firestore Collections                                         │
│  Semantic Indexing → Vector Store                                            │
│       ↓                                                                       │
│  Auto-debounced (2s) → Batched writes                                        │
│                                                                               │
│  7. OUTREACH LAYER                                                            │
│  ────────────────                                                             │
│  analyzeSessionForOutreach() → Trigger Publisher → Pub/Sub                   │
│       ↓                                                                       │
│  Outreach Worker → Decision Engine → Delivery                                │
│                                                                               │
│  8. FEEDBACK LOOP                                                             │
│  ─────────────                                                                │
│  Webhooks → Outcome Recording → ML Learning → Improved Future Outreach       │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Verified E2E Integrations

| From | To | Status | Validation |
|------|-----|--------|------------|
| Voice Input | Semantic Router | ✅ | `voice-integration.ts` |
| Router | Tool Execution | ✅ | `turn-processor-integration.ts` |
| Turn | Semantic Intelligence | ✅ | `integration.ts` |
| Intelligence | Firestore | ✅ | Direct writes in each module |
| Tool Execution | Data Hooks | ✅ | `store-hooks.ts` |
| Data Hooks | Vector Store | ✅ | `indexing-policy.ts` |
| Session End | Outreach Triggers | ✅ | `session-integration.ts` |
| Triggers | Pub/Sub | ✅ | `trigger-publisher.ts` |
| Decision Engine | Delivery | ✅ | `unified-delivery.ts` |
| Webhooks | Learning | ⚠️ Partial | Needs signature validation |

---

## 7️⃣ COVERAGE GAPS (PRIORITIZED)

### P1 - Critical (Affects Core Experience)

| Gap | System | Impact | Fix |
|-----|--------|--------|-----|
| New domain indexing hooks | Data Layer | New domains not searchable | Add hooks to new domain tools |
| Voice emotion → routing | Routing | Emotional context ignored | Add prosody signals to router |
| Live superhuman injection | Context | Session-only, not per-turn | Add conditional injection |
| Domain → outreach triggers | Outreach | Life events not triggering | Add trigger publishers |
| TTL cleanup job | Data | Old data accumulating | Implement scheduled cleanup |

### P2 - Important (Enhances Experience)

| Gap | System | Impact | Fix |
|-----|--------|--------|-----|
| Emotion trajectory → tools | Intelligence | Trajectories not actionable | Route "rising stress" to capacity tools |
| Relationship graph → timing | Outreach | Graph not informing timing | Use relationship health for timing |
| Inbound SMS routing | Outreach | Replies not reaching agents | Implement reply handler |
| Embedding cache warming | Data | Cold start latency | Pre-warm on session start |
| Cross-domain intent handling | Routing | Multi-intent not split | Add multi-intent router |

### P3 - Nice to Have (Polish)

| Gap | System | Impact | Fix |
|-----|--------|--------|-----|
| Vector deduplication | Data | Similar memories duplicate | Add LSH deduplication |
| A/B auto-learning | Outreach | Manual analysis needed | Add winner promotion |
| Proactive tool suggestion | Routing | No context-driven suggestions | Add suggestion layer |
| Values alignment triggers | Context | Values not surfaced on decisions | Add decision language detection |

---

## 8️⃣ IMPLEMENTATION PLAN

### Phase 1: Critical Gap Fixes (Week 1-2)

```bash
# 1. Add indexing hooks to new domains
pnpm tsx scripts/generate-domain-hooks.ts

# 2. Wire voice emotion to router
# File: src/tools/semantic-router/voice-integration.ts
# Add: voiceEmotion.primary → confidence boost for matching domains

# 3. Add superhuman live injection
# File: src/intelligence/context-builders/live-superhuman-injections.ts
# Add: conditional injection when commitment/dream keywords detected

# 4. Add outreach triggers for new domains
# File: src/services/outreach/domain-outreach-triggers.ts
# Add: life stage events → outreach trigger publishing

# 5. Implement TTL cleanup
# File: src/services/data-layer/ttl-cleanup.ts
# Add: scheduled job to purge expired documents
```

### Phase 2: Experience Enhancement (Week 3-4)

```bash
# 1. Emotion trajectory → tool routing
# When "rising stress" detected → boost capacity/burnout tools

# 2. Relationship graph → outreach timing
# Use relationship health score in timing intelligence

# 3. Implement inbound SMS handler
# Route SMS replies to appropriate agent session

# 4. Add embedding cache warming
# Pre-compute embeddings for active users on session start

# 5. Multi-intent handling
# Split "I'm stressed about divorce AND job" into two tool calls
```

### Phase 3: Polish (Week 5-6)

```bash
# 1. Vector deduplication
# Add LSH-based near-duplicate detection

# 2. A/B test auto-learning
# Promote winning variants automatically

# 3. Proactive tool suggestions
# Surface relevant tools based on context

# 4. Values alignment triggers
# Detect decision language and surface values
```

---

## 9️⃣ MONITORING & VALIDATION

### Health Checks

```bash
# Data layer health
pnpm ops:data-layer-health

# Semantic intelligence health
pnpm audit:bth

# Outreach system health
curl https://app.ferni.ai/api/outreach/health

# Vector store health
pnpm ops:vector-store-health
```

### Key Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Routing accuracy | >90% | ~85% |
| Context build time | <200ms | ~180ms |
| Vector search latency | <100ms | ~80ms |
| Outreach delivery rate | >95% | ~92% |
| Webhook success rate | >99% | ~97% |

### Dashboards

- **GCP Monitoring**: Latency, errors, throughput
- **Firestore Console**: Collection sizes, read/write ops
- **Custom Dashboard**: `/api/observability`

---

## 🔟 NEXT STEPS

### Immediate Actions

1. **Run audit script**: `pnpm audit:bth`
2. **Check indexing policy**: Review `indexing-policy.ts` for new domains
3. **Verify hooks wiring**: Check new domains call appropriate hooks
4. **Test E2E flow**: Manual test of new domain → storage → retrieval

### Weekly Cadence

- **Monday**: Review webhook delivery rates
- **Wednesday**: Check vector store growth
- **Friday**: Analyze outreach effectiveness

### Monthly Cadence

- **Semantic intelligence review**: Are all 14 systems capturing data?
- **TTL cleanup audit**: Are old documents being purged?
- **Routing accuracy review**: Are tools being selected correctly?

---

*Last updated: December 2024*
*Author: Ferni Engineering*
