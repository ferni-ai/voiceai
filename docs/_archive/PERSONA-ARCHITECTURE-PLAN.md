# Persona Architecture Refactoring Plan

## Executive Summary

This document outlines a comprehensive plan to transform the voice AI codebase into a clean, scalable architecture for deeply personalized AI agents. The goal: make deploying a persona with 100+ context files as easy as installing a package.

**Current State:**
- 322 TypeScript files, 111K+ lines
- ~7,500 lines of redundant code
- Dual architecture (legacy + new composition system)
- 1.1 MB tool directory with persona-specific bloat

**Target State:**
- Clean persona bundle system supporting 100+ context files
- Role-based tool factories (not persona-specific)
- Team packages purchasable as products
- CLI for `persona install`, `persona create`, `persona deploy`

---

## Phase 1: Foundation Cleanup (Week 1-2)

### 1.1 Delete Duplicate Behavior Files

**Files to DELETE:**
```
src/personas/jack-b/behaviors.ts              (479 lines)
src/personas/jack-bogle/behaviors.ts          (375 lines)
src/personas/comm-specialist/behaviors.ts     (241 lines)
src/personas/event-planner/behaviors.ts       (254 lines)
src/personas/spend-save/behaviors.ts          (246 lines)
src/agents/jack-bogle-utils/behaviors.ts      (397 lines)
```

**KEEP and enhance:**
```
src/personas/behaviors.ts                     (585 lines - GOLD STANDARD)
```

**Migration Steps:**
1. Update `src/intelligence/context-builders/humanizing.ts` to use generic behaviors
2. Update all imports to use `personas/behaviors.ts`
3. Delete duplicate files one by one, testing after each
4. **Savings: ~1,992 lines (77% reduction)**

### 1.2 Consolidate Team Handler Validation

**Create NEW file:**
```typescript
// src/tools/shared/team-handlers-validation.ts

export function validateEventTitle(title: unknown): ValidationResult;
export function validateEventDate(date: unknown): ValidationResult;
export function validateReminderDays(days: unknown): ValidationResult;
export function validateGoalName(name: unknown): ValidationResult;
export function validateBudgetAmount(amount: unknown): ValidationResult;
export function validateDeadline(deadline: unknown): ValidationResult;
```

**Update these files to use shared validation:**
- `src/tools/alex-team-handlers.ts`
- `src/tools/maya-team-handlers.ts`
- `src/tools/jordan-team-handlers.ts`

**Savings: ~240 lines**

### 1.3 Unified Persona Memory Factory

**Refactor:**
```
src/tools/persona-memory-tools.ts (616 lines)
```

**Into:**
```typescript
// src/tools/shared/persona-memory-factory.ts (~200 lines)

interface MemoryToolConfig {
  personaId: string;
  displayName: string;
  memoryService: string;
}

export function createPersonaMemoryTools(config: MemoryToolConfig);
```

**Savings: ~400 lines (65% reduction)**

---

## Phase 2: Persona Bundle System (Week 2-3)

### 2.1 Bundle Directory Structure

```
personas/bundles/<persona-id>/
├── persona.manifest.json          # Master manifest
├── index.ts                       # TypeScript entry point
│
├── identity/                      # WHO the persona is
│   ├── biography.md
│   ├── background.md
│   ├── relationships.md
│   └── self-reference.md
│
├── content/                       # Rich content library
│   ├── stories/
│   │   ├── personal/
│   │   ├── professional/
│   │   ├── educational/
│   │   └── _index.json           # Story catalog with triggers
│   ├── knowledge/
│   │   ├── domains/
│   │   └── _index.json
│   ├── behaviors/
│   │   ├── catchphrases.json
│   │   ├── pet-peeves.json
│   │   └── witty-remarks.json
│   └── wisdom/
│       ├── aphorisms.md
│       └── daily-wisdom.md
│
├── voice/                         # HOW the persona sounds
│   ├── speech-characteristics.json
│   ├── backchannels.json
│   ├── silence-fillers.json
│   └── greetings.json
│
├── role/                          # WHAT the persona does
│   ├── capabilities.json
│   ├── tools.json
│   └── handoff-rules.json
│
├── conditional/                   # Situational content
│   ├── seasonal/
│   ├── situational/
│   └── time-based/
│
├── prompts/                       # System prompts
│   ├── base.md
│   ├── role-specific.md
│   └── _compiled.md              # Auto-generated
│
└── rag/                           # RAG knowledge base
    ├── knowledge-base.json
    └── synonyms.json
```

### 2.2 Manifest Schema

```json
{
  "$schema": "https://voiceai.example.com/schemas/persona-manifest.v1.json",
  "version": "1.0.0",
  "manifest_version": 1,

  "identity": {
    "id": "jack-bogle",
    "name": "Jack",
    "display_name": "Jack Bogle",
    "description": "Sage and Personal Mentor",
    "aliases": ["jack", "bogle", "sage-mentor"],
    "self_reference": "Jack"
  },

  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:JACK_BOGLE_VOICE_ID}",
    "default_rate": "slow"
  },

  "speech_characteristics": {
    "base_speed_multiplier": 0.72,
    "pause_multiplier": 1.45,
    "thinking_sound_frequency": 0.65,
    "emphasis_style": "subtle"
  },

  "personality": {
    "warmth": 0.9,
    "humor_level": 0.4,
    "directness": 0.65,
    "energy": 0.4,
    "traits": ["wise", "patient", "humble"]
  },

  "role": {
    "id": "sage-mentor",
    "domains": ["index-investing", "market-history", "behavioral-finance"],
    "can_handoff": true,
    "handoff_targets": ["life-coach", "researcher"]
  },

  "team": {
    "membership": "ferni-team",
    "role_in_team": "sage-mentor",
    "coordinator": false
  },

  "tools": {
    "required": [],
    "optional": ["getStockQuote", "getMarketOverview"],
    "forbidden": ["sendEmail"]
  },

  "content": {
    "stories": { "directory": "content/stories", "lazy_load": true },
    "knowledge": { "directory": "content/knowledge", "lazy_load": true }
  },

  "metadata": {
    "author": "VoiceAI Team",
    "content_files_count": 47,
    "estimated_token_count": 45000
  }
}
```

### 2.3 Bundle Loader Implementation

```typescript
// src/personas/bundles/loader.ts

export interface LoadedPersonaBundle {
  config: PersonaConfig;
  manifest: PersonaBundleManifest;
  bundlePath: string;

  // Lazy content accessors
  getStory(id: string): Promise<string | null>;
  getStoriesByTrigger(trigger: string): Promise<StoryDefinition[]>;
  getKnowledge(topic: string): Promise<string | null>;
  getConditionalContent(context: ContentContext): Promise<string[]>;
  ragLookup(query: string, context?: RAGContext): Promise<string | null>;

  // Hot reload support
  reload(): Promise<void>;
  onReload(callback: () => void): () => void;
}

export async function loadBundle(
  bundleId: string,
  options?: BundleLoadOptions
): Promise<LoadedPersonaBundle>;
```

---

## Phase 3: Tool System Refactoring (Week 3-4)

### 3.1 Role-Based Tool Factories

**Transform from persona-specific:**
```typescript
// OLD: src/tools/maya-tools.ts (1647 lines)
export function createMayaFinancialTools() { ... }
```

**To configurable factories:**
```typescript
// NEW: src/tools/factories/financial-tools.ts (~400 lines)

interface FinancialToolsConfig extends ToolBehaviorConfig {
  emotionalSpendingTracking: boolean;
  milestoneIntegration: boolean;
  budgetPhilosophy: '50-30-20' | 'zero-based' | 'pay-yourself-first';
  judgmentLevel: 'none' | 'gentle-nudge' | 'direct';
}

export function createFinancialTools(config: FinancialToolsConfig) {
  return {
    analyzeSpending: llm.tool({ ... }),
    createBudget: llm.tool({ ... }),
    // Tools adapt behavior based on config
  };
}

// Persona-specific configs
export const PERSONA_FINANCIAL_CONFIGS = {
  'maya': { emotionalSpendingTracking: true, judgmentLevel: 'none' },
  'jack-bogle': { emotionalSpendingTracking: false, judgmentLevel: 'direct' },
};
```

### 3.2 Tool Filtering by Persona

```typescript
// src/tools/registry/persona-manifests.ts

export const PERSONA_TOOL_MANIFESTS = {
  'maya': {
    personaId: 'maya',
    primaryRole: 'habits-coach',
    includedCategories: ['universal', 'financial', 'memory'],
    explicitExcludes: ['analyzeStock', 'calculatePEGRatio'],
    maxTools: 25, // Token optimization
  },
  'jack-bogle': {
    personaId: 'jack-bogle',
    primaryRole: 'sage-mentor',
    includedCategories: ['universal', 'wisdom', 'financial', 'memory'],
    maxTools: 25,
  },
  // ... other personas
};

// Runtime filtering
export function getToolsForPersona(personaId: string): Record<string, unknown>;
```

**Expected Improvements:**
| Metric | Before | After |
|--------|--------|-------|
| Tool file size | 28,432 lines | ~15,000 lines |
| Tools per persona | 125+ | 20-35 |
| Token usage | High | 70-85% reduction |

---

## Phase 4: Team Package System (Week 4-5)

### 4.1 Team Manifest

```json
{
  "id": "financial-wellness-team",
  "version": "1.0.0",
  "name": "Financial Wellness Team",
  "description": "Complete team for personal finance management",

  "members": [
    { "characterId": "ferni", "roleId": "life-coach", "required": true },
    { "characterId": "jack-bogle", "roleId": "sage-mentor", "required": true },
    { "characterId": "peter-lynch", "roleId": "researcher", "required": true },
    { "characterId": "alex-chen", "roleId": "communicator", "required": false },
    { "characterId": "maya-santos", "roleId": "habits-coach", "required": true },
    { "characterId": "jordan-taylor", "roleId": "event-planner", "required": false }
  ],

  "coordinator": "ferni",

  "pricing": {
    "model": "subscription",
    "basePrice": 2999,
    "tiers": [
      { "id": "basic", "name": "Basic", "price": 1999, "features": ["Core team"] },
      { "id": "pro", "name": "Professional", "price": 2999, "features": ["Full team"] }
    ]
  },

  "routing": {
    "topicRouting": [
      { "topics": ["budget", "spending"], "targetRole": "habits-coach" },
      { "topics": ["investing", "portfolio"], "targetRole": "sage-mentor" },
      { "topics": ["stocks", "analysis"], "targetRole": "researcher" }
    ]
  }
}
```

### 4.2 Team Manager Service

```typescript
// src/services/team-manager.ts

export class TeamManager {
  registerPackage(pkg: TeamPackage): void;

  activateTeam(
    packageId: string,
    license: TeamLicense,
    overrides?: TeamConfigOverrides
  ): Promise<TeamInstance>;

  handleHandoff(
    instanceId: string,
    context: TeamHandoffContext
  ): Promise<void>;

  routeRequest(
    instanceId: string,
    userInput: string,
    context: TeamSharedContext
  ): Promise<{ targetMember: string; confidence: number }>;
}
```

---

## Phase 5: Plugin CLI (Week 5-6)

### 5.1 CLI Commands

```bash
# Installation
persona install @org/maya-santos-persona
persona install git+https://github.com/org/persona.git
persona link ./my-persona

# Creation
persona create my-advisor --template starter
persona create financial-team --template team
persona create deep-persona --template advanced

# Development
persona dev maya-santos --hot
persona preview maya-santos --scenario first-user
persona validate ./my-persona
persona lint . --fix
persona test . --coverage

# Deployment
persona build ./my-persona
persona deploy maya-santos --env production
persona publish --tag beta
```

### 5.2 Plugin Discovery Order

1. `PERSONA_PATHS` environment variable
2. `./personas/` (project-level)
3. `~/.voiceai/personas/` (user-level)
4. `node_modules/@*/` with persona manifest
5. `/usr/local/share/voiceai/personas/` (system-level)
6. Built-in personas

### 5.3 Hot Reload for Development

```bash
# Start with hot reload
persona dev maya-santos --hot

# File change behavior:
# - Character changes: Hot swap (no restart)
# - Voice changes: Hot swap TTS config
# - Role changes: Full reload required
# - Behavior changes: Hot swap
```

---

## Migration Strategy

### Step-by-Step Migration

**Week 1: Foundation**
1. Create `src/tools/shared/` directory
2. Extract team handler validation
3. Create persona memory factory
4. Delete duplicate behavior files

**Week 2: Bundles**
1. Create `src/personas/bundles/` structure
2. Implement manifest schema
3. Create bundle loader
4. Migrate Jack Bogle as first bundle

**Week 3: Tools**
1. Create `src/tools/registry/` system
2. Create `src/tools/factories/` pattern
3. Implement tool filtering
4. Refactor maya-tools.ts first (largest)

**Week 4: Teams**
1. Create team manifest schema
2. Implement TeamManager service
3. Extend agent-bus for teams
4. Create team routing system

**Week 5: CLI**
1. Create `persona` CLI package
2. Implement install/create/validate commands
3. Add hot reload dev server
4. Create scaffold templates

**Week 6: Polish**
1. Complete migration of all personas
2. Delete legacy code
3. Update documentation
4. Performance testing

---

## Expected Results

### Code Reduction

| Area | Before | After | Savings |
|------|--------|-------|---------|
| Behavior files | 2,577 lines | 585 lines | 77% |
| Memory tools | 616 lines | 200 lines | 68% |
| Team handlers | 1,800 lines | 600 lines | 67% |
| Tool files | 28,432 lines | 15,000 lines | 47% |
| **Total** | ~33,000 lines | ~16,000 lines | **51%** |

### Developer Experience

| Task | Before | After |
|------|--------|-------|
| Create new persona | Copy 15+ files, modify each | `persona create name --template` |
| Deploy persona | Manual configuration | `persona deploy name` |
| Add 100 context files | Scattered across codebase | Single bundle directory |
| Test persona | Run full agent | `persona preview name` |
| Update persona | Find/replace across files | Edit bundle, hot reload |

### Runtime Performance

| Metric | Before | After |
|--------|--------|-------|
| Tools loaded per persona | 125+ | 20-35 |
| Token usage (tools) | ~50K | ~15K |
| Persona load time | All content eager | Lazy loading |
| Memory footprint | All personas loaded | On-demand |

---

## Key Files to Create

### New Files

```
src/
├── personas/
│   └── bundles/
│       ├── types.ts                    # Bundle type definitions
│       ├── loader.ts                   # Bundle loader
│       ├── cache.ts                    # Caching strategy
│       ├── hot-reload.ts               # Dev hot reload
│       └── migration.ts                # Legacy migration helper
│
├── tools/
│   ├── registry/
│   │   ├── types.ts                    # Tool capability types
│   │   ├── registry.ts                 # Central registry
│   │   ├── persona-manifests.ts        # Per-persona tool configs
│   │   └── tool-filter.ts              # Runtime filtering
│   │
│   ├── factories/
│   │   ├── financial-tools.ts          # Configurable financial tools
│   │   ├── communication-tools.ts      # Configurable comms tools
│   │   ├── planning-tools.ts           # Configurable planning tools
│   │   └── universal-tools.ts          # Shared tools
│   │
│   ├── shared/
│   │   ├── team-handlers-validation.ts # Extracted validation
│   │   └── persona-memory-factory.ts   # Unified memory tools
│   │
│   └── team/
│       └── generic-handler.ts          # Generic team handler framework
│
├── services/
│   └── team-manager.ts                 # Team package management
│
└── types/
    ├── team-package.ts                 # Team package types
    ├── team-instance.ts                # Active team instances
    ├── team-coordination.ts            # Team coordination
    └── marketplace.ts                  # Marketplace types
```

### Files to Delete (After Migration)

```
DELETE:
src/personas/jack-b/behaviors.ts
src/personas/jack-bogle/behaviors.ts
src/personas/comm-specialist/behaviors.ts
src/personas/event-planner/behaviors.ts
src/personas/spend-save/behaviors.ts
src/agents/jack-bogle-utils/behaviors.ts
src/persona/                             # Entire legacy directory (after migration)
```

---

## Next Steps

1. **Review this plan** - Any changes to priorities or scope?
2. **Create Phase 1 branch** - Start with foundation cleanup
3. **Set up bundle structure** - Create first persona bundle (Jack Bogle)
4. **Iterate** - Each phase builds on the previous

This architecture will enable:
- Rich personas with 100+ context files
- Easy packaging and deployment
- Team-based purchasing model
- Claude Code plugin simplicity
