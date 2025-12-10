# Persona Behavior Audit Report

**Generated:** December 2024
**Purpose:** Identify gaps and inconsistencies in persona behaviors to improve humanization

---

## Executive Summary

The audit reveals that **rich personality data exists** but is **not being used** in critical moments like handoff entrances. The main issues are:

1. **Entrances are static arrays** - not context-aware
2. **Inconsistent behavior files** across personas
3. **Quirks data exists but isn't used** in entrances/handoffs
4. **No mood adaptation** - entrances don't react to user state

---

## Behavior Files Comparison

### Core Behaviors (Should exist for ALL personas)

| File | Ferni | Alex | Jack | Peter | Maya | Jordan |
|------|-------|------|------|-------|------|--------|
| entrances.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| greetings.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| goodbyes.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| backchannels.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| catchphrases.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| quirks.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| celebrations.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| relationship-stages.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| conflict-handling.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| thinking-sounds.json | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

### Extended Behaviors (Persona-specific, optional)

| File | Ferni | Alex | Jack | Peter | Maya | Jordan |
|------|-------|------|------|-------|------|--------|
| vulnerability.json | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| sensory-moments.json | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| off-duty-[name].json | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| witty-remarks.json | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| cultural-moments.json | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| micro-moments.json | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| pet-peeves.json | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| age-patterns.json | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| calming-presence.json | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| contextual-nuances.json | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| memory-patterns.json | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Quirks Completeness Audit

### Required Fields in quirks.json

| Field | Ferni | Alex | Jack | Peter | Maya | Jordan |
|-------|-------|------|------|-------|------|--------|
| habits | ✅ 7 | ✅ 10 | ✅ 7 | ✅ 9 | ✅ 12 | ✅ 7 |
| guilty_pleasures | ✅ 7 | ✅ 9 | ✅ 6 | ✅ 8 | ✅ 10 | ✅ 7 |
| strong_opinions | ✅ 7 | ✅ 9 | ✅ 7 | ✅ 8 | ✅ 11 | ✅ 7 |
| not_good_at | ✅ 6 | ✅ 8 | ✅ 6 | ✅ 6 | ✅ 9 | ✅ 6 |
| caught_doing | ✅ 9 | ✅ 12 | ✅ 9 | ✅ 10 | ✅ 12 | ✅ 9 |
| physical_moments | ✅ 6 | ✅ 10 | ✅ 7 | ✅ 8 | ✅ 10 | ✅ 6 |

### Optional Fields (Enhance humanization)

| Field | Ferni | Alex | Jack | Peter | Maya | Jordan |
|-------|-------|------|------|-------|------|--------|
| endearing_contradictions | ❌ | ✅ 8 | ❌ | ❌ | ❌ | ❌ |
| simple_joys / things_that_make_me_happy | ❌ | ✅ 8 | ❌ | ❌ | ❌ | ❌ |
| pet_peeves / things_that_annoy | ❌ | ✅ 8 | ❌ | ❌ | ❌ | ❌ |
| relationship_moments | ❌ | ❌ | ❌ | ❌ | ✅ 7 | ❌ |
| growth_edges | ❌ | ❌ | ❌ | ❌ | ✅ 5 | ❌ |

**Leader:** Alex has the most complete quirks with `endearing_contradictions`, `simple_joys`, and `pet_peeves`.

**Runner-up:** Maya has unique `relationship_moments` and `growth_edges` that show vulnerability.

---

## Entrance Analysis

### Current State (Static Arrays)

All personas currently have entrances like:
```json
{
  "entrances": [
    "Static string 1",
    "Static string 2",
    ...
  ],
  "style": "enthusiastic",
  "description": "..."
}
```

### Problems

1. **No mood adaptation** - Jordan bursts in excited even if user is stressed
2. **No time awareness** - Same energy at 11pm as 10am
3. **No relationship memory** - Same intro for 1st meeting as 10th
4. **No use of caught_doing** - Rich data exists but isn't used
5. **No self-aware humor** - Never acknowledges their own patterns

### Solution: Context-Aware Schema (v2)

```json
{
  "schema_version": 2,
  "entrances": {
    "static_fallback": ["existing strings"],
    "dynamic": {
      "use_caught_doing": true,
      "adapt_to_user_emotion": true,
      "track_meeting_count": true
    },
    "contextual": {
      "user_distressed": ["calm versions"],
      "user_excited": ["matching energy"],
      "quiet_hours": ["softer versions"],
      "self_aware": ["humor for repeat visitors"]
    }
  }
}
```

---

## Per-Persona Recommendations

### Ferni (Life Coach / Coordinator)
- ✅ Most complete behavior set
- ⚠️ Missing `endearing_contradictions`
- ⚠️ Missing `thinking-sounds.json` for Jordan
- 🔧 Add self-aware humor for repeat visitors

### Alex (Communications Specialist)
- ✅ **Best-in-class quirks** - model for others
- ✅ Has `endearing_contradictions`
- ⚠️ Missing `vulnerability.json` content (has file, check content)
- 🔧 Upgrade entrances to schema v2

### Jack Bogle (Financial Sage)
- ✅ Good core behaviors
- ✅ Has `age-patterns.json` (unique and appropriate)
- ⚠️ Missing `vulnerability.json`
- ⚠️ Missing `sensory-moments.json`
- 🔧 Add `endearing_contradictions` (e.g., "I tell people not to check the market, but I check it every morning")

### Peter Lynch (Research Analyst)
- ✅ Good quirks with research focus
- ⚠️ Missing `vulnerability.json`
- ⚠️ Missing `sensory-moments.json`
- 🔧 Add self-aware research humor

### Maya Santos (Habits & Budgeting)
- ✅ **Most human quirks** - relationship moments are excellent
- ✅ Has `growth_edges` showing vulnerability
- ⚠️ Could add `endearing_contradictions`
- 🔧 Model for other personas

### Jordan Taylor (Life Events Planner)
- ⚠️ Missing `thinking-sounds.json`
- ⚠️ Missing `vulnerability.json`
- ⚠️ Missing `sensory-moments.json`
- ⚠️ Entrances are too uniformly excited
- 🔧 **Priority:** Add calm versions for stressed users

---

## Action Items

### Immediate (High Impact)

1. **Integrate `alive-entrances.ts`** into handoff-handler
   - Uses quirks data for "caught doing" moments
   - Adapts to user mood
   - Tracks meeting count for self-awareness

2. **Add calm entrance variants** for all personas
   - When user is stressed, don't burst in excited
   - Especially important for Jordan

3. **Add self-aware humor** for repeat visitors
   - "I know, I know... I always come in too excited"
   - Makes personas feel like real people who know themselves

### Medium Term

4. **Upgrade all entrances.json to schema v2**
   - Add `contextual` variants
   - Enable `dynamic` features

5. **Standardize optional quirks fields**
   - Add `endearing_contradictions` to all personas
   - Add `simple_joys` / `pet_peeves` to all

6. **Add Jordan's missing files**
   - thinking-sounds.json
   - vulnerability.json
   - sensory-moments.json

### Long Term

7. **Create behavior generation system**
   - Move from static arrays to composable elements
   - Allow runtime generation based on context

8. **Cross-persona consistency audit**
   - Ensure all personas follow same schema
   - Document required vs optional behaviors

---

## Files Created/Updated

| File | Purpose |
|------|---------|
| `src/personas/alive-entrances.ts` | Context-aware entrance generator |
| `src/personas/bundles/behavior-schema.ts` | Type definitions for v2 schema |
| `docs/audits/BEHAVIOR-AUDIT.md` | This document |

---

## Completed Work

1. ✅ Phase 1: Create `alive-entrances.ts` - DONE
2. ✅ Phase 2: Design behavior schema - DONE
3. ✅ Phase 3: Audit all personas - DONE (this document)
4. ✅ Phase 4: Update ALL entrances.json to v2 schema - DONE
   - Ferni, Alex, Jack, Peter, Maya, Jordan all upgraded
5. ✅ Phase 5: Integrate into handoff-handler - DONE
   - All handoffs now use alive entrances
6. ✅ Added endearing_contradictions, simple_joys, pet_peeves to all personas
7. ✅ Created Jordan's missing files (thinking-sounds.json, vulnerability.json)

## Remaining

- ⏳ Testing: Verify all handoffs work with new alive entrances

