# Semantic Router Audit Report

**Date:** December 23, 2024
**Status:** 29 categories routed, ~47 domains need routing
**Phase 1 COMPLETE:** books, health, connection (23 new tools routed)

---

## Executive Summary

The semantic router enables **pre-LLM tool invocation** - when a user says common phrases like "play music" or "add a contact", the router can match directly to tools without LLM reasoning. This reduces latency and improves reliability.

**Current state:**
- **26 semantic categories** are routed (~84 tools)
- **~50 domains** have tools but NO semantic routing
- **~300+ tools** exist but are only accessible via LLM reasoning

---

## What's Currently Routed

| Category | Tools | Status |
|----------|-------|--------|
| calendar | 3 | ✅ Complete |
| career | 5 | ✅ Complete |
| commitments | 4 | ✅ Complete |
| **contacts** | 9 | ✅ **NEW** |
| crisis | 2 | ✅ Complete (SAFETY-CRITICAL) |
| dating | 4 | ✅ Complete |
| decisions | 4 | ✅ Complete |
| entertainment | 3 | ✅ Complete |
| finance | 4 | ✅ Complete |
| games | 3 | ✅ Complete |
| grief | 3 | ✅ Complete |
| habits | 4 | ✅ Complete |
| handoff | 2 | ✅ Complete |
| information | 4 | ✅ Complete |
| learning | 4 | ✅ Complete |
| life-coaching | 7 | ✅ Complete |
| memory | 3 | ✅ Complete |
| music | 3 | ✅ Complete |
| productivity | 4 | ✅ Complete |
| recommendations | 4 | ✅ Complete |
| relationships | 4 | ✅ Complete |
| reminders | 3 | ✅ Complete |
| smart-home | 4 | ✅ Complete |
| telephony | 3 | ✅ Complete |
| weather | 2 | ✅ Complete |
| wellness | 3 | ✅ Complete |
| **books** | 8 | ✅ **Phase 1 NEW** |
| **health** | 8 | ✅ **Phase 1 NEW** |
| **connection** | 7 | ✅ **Phase 1 NEW** |

---

## Priority 1: High-Impact Missing Routes (UPDATED)

These domains have commonly-used features that should route directly:

### Books & Media (22 tools total)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| ~~books~~ | ~~10~~ | ✅ **DONE** - 8 tools routed (search, recommendations, reading list CRUD, stats) |
| podcasts | 4 | "podcast recommendations", "find podcasts about X" |
| video | 4 | "recommend a video", "what's trending on YouTube" |

**Impact:** Media recommendations are very common voice requests.

### Health & Wellness (17 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| ~~health~~ | ~~12~~ | ✅ **DONE** - 8 tools routed (exercise, workout, hydration, sleep, energy, nutrition) |
| presence | 12 | "grounding exercise", "breathing exercise", "help me be present" |

**Impact:** Health tracking and grounding exercises are core wellness features.

### Connection & Social (22 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| ~~connection~~ | ~~13~~ | ✅ **DONE** - 7 tools routed (loneliness, friendship, belonging, connection health) |
| social-skills | 9 | "how to start a conversation", "networking tips" |

**Impact:** Loneliness/connection is a key emotional support area.

### Self-Development (31 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| self-compassion | 12 | "be kind to myself", "I'm being too hard on myself" |
| dreams | 8 | "record my dream", "bucket list", "what are my dreams" |
| meaning | 12 | "find purpose", "what's my life about", "clarify my values" |

**Impact:** These are core "Better Than Human" emotional intelligence features.

---

## Priority 2: Safety & Support Routes

These need careful routing with appropriate sensitivity:

### Emotional Regulation (15 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| anger | 8 | "I'm angry", "help me calm down", "anger management" |
| burnout-recovery | 5 | "I'm burned out", "exhausted from work" |

**Impact:** Crisis-adjacent - users in emotional distress need quick routing.

### Trauma & Recovery (12 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| trauma-support | 7 | "triggered", "trauma response", "PTSD support" |
| breakup-recovery | 5 | "going through a breakup", "heartbroken" |

**Impact:** Safety-sensitive, needs careful anti-pattern design.

---

## Priority 3: Life Management Routes

### Family & Home (19 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| family | 11 | "parenting advice", "family conflict", "kids activity ideas" |
| home | 8 | "home maintenance", "plan a move", "declutter help" |

### Legal & Admin (7 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| legal-admin | 7 | "organize documents", "estate planning", "tax prep" |

---

## Priority 4: Growth & Creativity Routes

### Creative & Play (20 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| creativity | 8 | "start a hobby", "creative block", "find inspiration" |
| play | 12 | "I want to have fun", "joy", "be playful" |

### Life Transitions (13 tools)
| Domain | Tools | Example Triggers Missing |
|--------|-------|-------------------------|
| life-transitions | 13 | "going through a change", "who am I becoming" |

---

## CRUD Gap Analysis

Several existing semantic routes are missing full CRUD operations:

### Calendar (needs expansion)
- ✅ list calendar
- ✅ create event
- ✅ check availability
- ❌ **update event** - missing
- ❌ **delete event** - missing

### Habits (needs expansion)
- ✅ track habit
- ✅ list habits
- ✅ create habit
- ✅ habit coaching
- ❌ **delete habit** - missing
- ❌ **update habit** - missing

### Memory (needs expansion)
- ✅ remember (save)
- ✅ recall (read)
- ✅ people memory
- ❌ **forget/delete** - missing
- ❌ **update memory** - missing

### Reminders (needs expansion)
- ✅ set reminder
- ✅ get reminders
- ✅ cancel reminder
- ❌ **update reminder** - missing

### Smart Home (needs expansion)
- ✅ lights control
- ✅ thermostat control
- ✅ locks control
- ✅ device control
- ❌ **scene management** - missing
- ❌ **device status** - missing

---

## Implementation Recommendations

### Phase 1 (Immediate - High Impact)
1. **books.semantic.ts** - reading list CRUD
2. **health.semantic.ts** - exercise/sleep tracking
3. **connection.semantic.ts** - loneliness support

### Phase 2 (Safety-Critical)
1. **anger.semantic.ts** - with careful trigger patterns
2. **trauma-support.semantic.ts** - with safety protocols
3. **burnout-recovery.semantic.ts** - career overlap

### Phase 3 (Growth Features)
1. **self-compassion.semantic.ts** - inner critic work
2. **dreams.semantic.ts** - bucket list, aspirations
3. **meaning.semantic.ts** - purpose, values

### Phase 4 (Life Management)
1. **family.semantic.ts** - parenting, family dynamics
2. **home.semantic.ts** - maintenance, organization
3. **legal-admin.semantic.ts** - documents, planning

---

## Technical Notes

### Adding a New Semantic Route

1. Create `{domain}.semantic.ts` in `tool-definitions/`
2. Follow pattern from `memory.semantic.ts` or `contacts.semantic.ts`
3. Add to exports in `index.ts`
4. Add to `allToolDefinitions` array
5. Add to `toolsByCategory` object
6. Run `pnpm typecheck` to verify

### Category Type

If adding a new category, update `types.ts` → `ToolCategory` union type.
Current categories use `'communication'` for contact-related tools.

### Confidence Tuning

```typescript
confidence: {
  baseScore: 0.85,        // Start here
  patternMatchBonus: 0.1, // Reward exact matches
  keywordDensityMultiplier: 1.2,
  negativeKeywordPenalty: 0.4,  // Avoid false positives
}
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total domains | ~70 |
| Domains with semantic routing | **29** (+3 from Phase 1) |
| Domains needing routing | ~47 |
| Total tools | ~350+ |
| Tools with semantic routing | **~107** (+23 from Phase 1) |
| Tools needing routing | ~250+ |

**Coverage:** ~31% of tools are semantically routable (+7% from Phase 1).

---

*Last updated: December 23, 2024*
