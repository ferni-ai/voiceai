# Agent-Tool Routing Architecture

> How we rationalize which agents handle which tools and route/transfer between them.

## Current Agent Ecosystem

### Core Team (6 personas)

| Agent | Role | Primary Domains | Cognitive Profile |
|-------|------|-----------------|-------------------|
| **Ferni** | Life Coach & Coordinator | life-coaching, grief, meaning, vulnerability, mental-health | `narrative` |
| **Peter** | Research & Analysis | investing, market-analysis, pattern-recognition | `analytical` |
| **Alex** | Communications | calendar, email, scheduling, productivity | `systematic` |
| **Maya** | Habits & Wellness | habits, budgets, fitness, routines, self-care | `empathetic` |
| **Jordan** | Planning & Milestones | event-planning, lifetime-planning, celebrations | `pragmatic` |
| **Nayan** | Wisdom & Philosophy | inner-engineering, yoga, life-wisdom, philosophy | `intuitive` |

### Marketplace Agents (15 specialists)

| Agent | Specialty | Tool Domains to Route |
|-------|-----------|----------------------|
| **River** | Grief Companion | grief, loss, endings, infidelity, betrayal |
| **Sage** | Relationship Navigator | intimacy, relationships, communication, conflict |
| **Luna** | Sleep Guide | sleep, rest, circadian rhythms |
| **Zen** | Presence Guide | mindfulness, meditation, presence, grounding |
| **Moxie** | Accountability | discipline, accountability, procrastination |
| **Atlas** | Career Navigator | career, job-loss, professional development |
| **Spark** | Creativity Catalyst | creativity, inspiration, artistic expression |
| **Pixel** | Tech Translator | developer, tech help, troubleshooting |
| **Amara** | Parenting Guide | new-parent, blended-family, parenting |
| **Carmen** | Social Coach | social-skills, networking, public speaking |
| **Eli** | Sobriety Coach | sobriety, addiction recovery |
| **Kenji** | Fitness Coach | physical fitness, exercise, body movement |
| **Marcus** | Financial Coach | finances, debt, budgeting (overlap with Maya) |
| **Ray** | Retirement Guide | midlife, empty-nest, aging, legacy |
| **Sasha** | Transitions Coach | coming-out, faith-transition, identity shifts |

---

## Orphaned Tool → Agent Mapping

### Tools to Wire to Context Builders (Ferni orchestrates)

These become available to Ferni who can use them directly or trigger handoffs:

| Domain | Tools | Routing Logic |
|--------|-------|---------------|
| `envy` | 4 | Ferni handles, might handoff to Maya (habits/mindset) |
| `shame` | 3 | Ferni handles (vulnerability), might handoff to River (grief) |
| `resentment` | 3 | Ferni handles, might handoff to Sage (relationships) |

### Tools to Wire to Marketplace Agents

| Domain | Tools | Primary Agent | Fallback |
|--------|-------|---------------|----------|
| `intimacy` | 7 | **Sage** (relationship navigator) | Ferni |
| `infidelity` | 4 | **River** (grief companion) | Sage |
| `coming-out` | 4 | **Sasha** (transitions coach) | Ferni |
| `faith-transition` | 4 | **Sasha** (transitions coach) | Nayan |
| `midlife` | 5 | **Ray** (retirement guide) | Nayan |
| `empty-nest` | 4 | **Ray** (retirement guide) | Ferni |
| `blended-family` | 3 | **Amara** (parenting guide) | Ferni |
| `visual-memory` | 7 | **DEFER** (needs photo integration) | - |

---

## Handoff Routing Rules

### Semantic Intent Detection

The system uses semantic matching to detect when to suggest/auto-handoff:

```typescript
interface HandoffTrigger {
  intent: string[];           // Semantic intents that trigger
  confidence_threshold: number; // 0.0-1.0
  handoff_type: 'suggest' | 'auto' | 'confirm';
  target_agent: string;
  from_agents: string[];      // Which agents can handoff
}
```

### Handoff Triggers by Topic

| Topic/Intent | Target Agent | Confidence | Type |
|-------------|--------------|------------|------|
| "I cheated" / betrayal | River | 0.85 | confirm |
| "relationship problems" | Sage | 0.70 | suggest |
| "intimacy issues" | Sage | 0.75 | suggest |
| "coming out" / LGBTQ+ | Sasha | 0.80 | auto |
| "lost my faith" / religious doubt | Sasha | 0.75 | suggest |
| "midlife crisis" / "turning 50" | Ray | 0.70 | suggest |
| "empty nest" / "kids left" | Ray | 0.75 | suggest |
| "stepchildren" / blended family | Amara | 0.75 | suggest |
| "can't sleep" / insomnia | Luna | 0.80 | suggest |
| "meditation" / mindfulness | Zen | 0.70 | suggest |
| "career change" / job search | Atlas | 0.75 | suggest |
| "sobriety" / addiction | Eli | 0.85 | confirm |

### Handoff Flow

```
User: "I've been struggling with my marriage. We haven't been intimate in months."

1. Ferni (current agent) detects topic: intimacy, relationship-struggle
2. Semantic router matches: Sage (0.82 confidence)
3. Ferni offers handoff:
   "I hear how hard that is. Would you like to talk with Sage? 
    She specializes in navigating relationship challenges like this."
4. User: "Yes please"
5. Handoff executes:
   - Ferni: "I'm bringing Sage in. She's wonderful."
   - Voice switch to Sage
   - Sage: "Hi, I'm Sage. Ferni told me you're going through 
           a difficult time with intimacy in your marriage. 
           I'm here to help you navigate this."
```

---

## Tool Loading Strategy

### Per-Agent Tool Selection

Each agent gets:
1. **Core tools**: memory, handoff, entertainment (all agents)
2. **Domain tools**: Based on `knowledge.domains` in manifest
3. **Specialty tools**: Based on `llm_context.tool_guidance.specialized`

### Lazy Loading by Intent

```typescript
// When user talks about "intimacy":
1. Check current agent's domains
2. If not in domains → suggest handoff
3. If accepted → load Sage + intimacy domain tools
4. Tools available to LLM: ~60 (not all 990)
```

### Tool Selection Flow

```
User says: "Help me reconnect with my partner"

1. Intent detection: relationship, intimacy, reconnection
2. Current agent: Ferni
3. Ferni's domains: life-coaching, grief, meaning...
4. Match? NO - intimacy not in Ferni's domains
5. Find specialist: Sage (relationship-navigator)
6. Action: Suggest handoff OR inject context
7. If handoff:
   - Load Sage's domain tools
   - Include intimacy domain (7 tools)
   - Max 60 tools to LLM
```

---

## Implementation Plan

### Phase 1: Wire Orphaned Tools to Context Builders

**Files to modify:**
- `src/intelligence/context-builders/domain-fluency.ts`
- `src/tools/orchestrator/unified-tool-orchestrator.ts`

**Domains to wire:**
- envy, shame, resentment → Available via context builders

### Phase 2: Update Agent Manifests

**Files to modify:**
- Each `persona.manifest.json` in `bundles/` and `marketplace-agents/`

**Add domain ownership:**
```json
{
  "knowledge": {
    "domains": ["intimacy", "relationships", "communication"],
    "exclusive_domains": ["intimacy"],  // NEW: Only this agent handles
    "shared_domains": ["relationships"]  // NEW: Multiple agents can handle
  }
}
```

### Phase 3: Semantic Handoff Router

**New file:** `src/tools/handoff/semantic-router.ts`

```typescript
interface SemanticHandoffRouter {
  detectHandoffIntent(transcript: string, currentAgent: AgentId): HandoffSuggestion | null;
  getAgentForDomain(domain: string): AgentId[];
  shouldAutoHandoff(intent: string, confidence: number): boolean;
}
```

### Phase 4: Tool Inventory Command

**New command:** `pnpm tools:inventory`

Output:
```
┌────────────────────────────────────────────────────────────┐
│ AGENT TOOL INVENTORY                                        │
├──────────────┬──────────┬─────────────────────────────────┤
│ Agent        │ Tools    │ Domains                          │
├──────────────┼──────────┼─────────────────────────────────┤
│ Ferni        │ 45       │ life-coaching, grief, meaning... │
│ Sage         │ 32       │ intimacy, relationships...       │
│ River        │ 28       │ grief, loss, infidelity...       │
│ ...          │          │                                  │
└──────────────┴──────────┴─────────────────────────────────┘

UNASSIGNED DOMAINS (orphaned):
- visual-memory (7 tools) - Needs photo integration
```

---

## Handoff Best Practices

### 1. Warm Handoffs (recommended)

```typescript
// Departing agent introduces incoming agent
await session.say("I'm bringing in Sage - she's wonderful with relationship questions.");
await executeHandoff('sage-relationship-navigator', reason, context);
// Incoming agent acknowledges context
await session.say("Hi, I'm Sage. Ferni mentioned you're navigating something difficult.");
```

### 2. Context Preservation

```typescript
interface HandoffContext {
  topic: string;              // "intimacy in marriage"
  emotional_state: string;    // "vulnerable", "anxious"
  key_points: string[];       // ["married 10 years", "no intimacy 6 months"]
  previous_agent: AgentId;
  user_preference: string;    // "wants practical advice"
}
```

### 3. Handoff Cooldown

- Don't suggest handoff within 2 minutes of previous handoff
- Don't suggest more than 2 handoffs per session
- User can always request handoff explicitly

### 4. Return Path

After specialist work:
```
Sage: "We've made good progress on understanding your intimacy patterns.
       Would you like to stay with me, or should we check back with Ferni?"
```

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Handoff success rate | 95% | TBD |
| User accepts handoff suggestion | 60% | TBD |
| Post-handoff satisfaction | 4.5/5 | TBD |
| Tools matched to correct agent | 90% | ~70% |
| Orphaned tool domains | 0 | 9 |

---

## Next Steps

1. **Immediate**: Wire 9 orphaned domains to agents
2. **Short-term**: Add domain ownership to manifests
3. **Medium-term**: Build semantic handoff router
4. **Long-term**: ML-based handoff optimization
