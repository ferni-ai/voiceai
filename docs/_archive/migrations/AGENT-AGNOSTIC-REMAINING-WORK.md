# Agent-Agnostic Architecture: Remaining Work

This document tracks the remaining work needed to fully decouple the codebase from agent-specific naming.

**Last Updated:** December 4, 2024 (after major tool migration)

---

## Recent Changes

### ✅ Completed
- **Jack Bogle persona removed** - Bundle deleted
- **jack-team-handlers.ts deleted**
- **Manifests updated** - Now use `@coordinator` and `@team` instead of hardcoded agent names
- **New handoff system** - `handoff/executor.ts` and `handoff/handoff-factory.ts`
- **Team handler registry** - `services/team-handler-registry/`
- **Tool registry** - Domain-based organization
- **Handoff phrases in manifests** - All agents have `handoff` section
- **Deprecation warnings** - Added to legacy files

---

## Status Overview

| Category | Count | Priority | Status |
|----------|-------|----------|--------|
| Agent-Named Tool Files | 17 | - | ✅ All converted to re-export stubs |
| Agent-Named Directories | 3 renamed | - | ✅ Complete |
| Legacy Team Handlers | 5 | Low | ✅ Deprecated |
| Agent-Agnostic Files | 65+ | - | ✅ Complete |

## Recent Migration (December 4, 2024)

### New Agent-Agnostic Files Created

| Old File | New File | Lines |
|----------|----------|-------|
| `maya-habit-coach.ts` | `habit-coaching.ts` | 3,980 |
| `alex-appointments.ts` | `scheduling.ts` | 2,123 |
| `maya-gamification.ts` | `gamification.ts` | 1,310 |
| `jordan-tools.ts` | `event-planning.ts` | 1,206 |
| `peter-insights-tools.ts` | `insights-analysis.ts` | 1,397 |

**Total: ~10,000 lines migrated to agent-agnostic names!**

### New Export Names

```typescript
// OLD (deprecated but still works)
import { createMayaHabitCoachTools } from './maya-habit-coach.js';
import { createAlexAppointmentTools } from './alex-appointments.js';
import { createJordanTools } from './jordan-tools.js';
import { createPeterInsightsTools } from './peter-insights-tools.js';
import { createMayaGamificationTools } from './maya-gamification.js';

// NEW (preferred)
import { createHabitCoachingTools } from './habit-coaching.js';
import { createAppointmentTools } from './scheduling.js';
import { createEventPlanningTools } from './event-planning.js';
import { createInsightsAnalysisTools } from './insights-analysis.js';
import { createGamificationTools } from './gamification.js';
```

### Domain Index Updates

- `domains/habits/index.ts` → Uses `habit-coaching.ts` + `gamification.ts`
- `domains/calendar/index.ts` → Uses `scheduling.ts`
- `domains/life-planning/index.ts` → Uses `event-planning.ts`

### Additional Files Migrated (Session 2)

| Old File | New File | Lines |
|----------|----------|-------|
| `maya-tools.ts` | `financial-habits.ts` | 1,735 |
| `alex-tools.ts` | `communication-tools.ts` | 827 |
| `alex-coaching-tools.ts` | `communication-coaching.ts` | 1,294 |
| `maya-proactive-coach.ts` | `proactive-coaching.ts` | 887 |
| `peter-john-tools.ts` | `research-tools.ts` | ~400 |

### Directories Renamed

| Old Name | New Name |
|----------|----------|
| `alex-appointments/` | `appointments/` |
| `maya-habit/` | `habit-system/` |
| `maya-habits/` | `habit-types/` |

### Complete Export Name Mapping

```typescript
// Habits Domain
createHabitCoachingTools()       // was createMayaHabitCoachTools()
createGamificationTools()        // was createMayaGamificationTools()
createGamificationToolsV2()      // was createMayaGamificationToolsV2()
createFinancialHabitsTools()     // was createMayaTools()
createProactiveCoachingTools()   // was createMayaProactiveTools()
createNotificationTools()        // was createMayaNotificationTools()

// Communication Domain
createCommunicationTools()       // was createAlexTools()
createCommunicationCoachingTools() // was createAlexCoachingTools()
createAppointmentTools()         // was createAlexAppointmentTools()
createDeliveryTools()            // was createAlexDeliveryTools()
createPlacesTools()              // was createAlexPlacesTools()
createContactsTools()            // was createAlexContactsTools()

// Life Planning Domain
createEventPlanningTools()       // was createJordanTools()

// Research Domain
createInsightsAnalysisTools()    // was createPeterInsightsTools()
createResearchTools()            // was createPeterLynchTools()
```

### Final Session Cleanup

| Old File | New File |
|----------|----------|
| `maya-notification-tools.ts` | `notifications.ts` |
| `maya-gamification-v2.ts` | `gamification-v2.ts` |
| `alex/index.ts` | Updated to use new imports |
| `maya/index.ts` | Updated to use new imports |

## Migration Complete! ✅

**All agent-named files have been removed!**

### Final State

| Metric | Count |
|--------|-------|
| Agent-named files | **0** |
| Agent-agnostic files | **65** |
| Directories cleaned | 5 |
| TypeScript status | ✅ Compiles |

### Deleted Files (17)

**Maya files (6):**
- `maya-habit-coach.ts`
- `maya-gamification.ts`
- `maya-gamification-v2.ts`
- `maya-tools.ts`
- `maya-proactive-coach.ts`
- `maya-notification-tools.ts`

**Alex files (4):**
- `alex-appointments.ts`
- `alex-tools.ts`
- `alex-coaching-tools.ts`
- `alex-team-handlers.ts`

**Jordan/Peter/Ferni files (7):**
- `jordan-tools.ts`
- `jordan-team-handlers.ts`
- `peter-insights-tools.ts`
- `peter-john-tools.ts`
- `peter-team-handlers.ts`
- `ferni-team-handlers.ts`
- `maya-team-handlers.ts`

### Deleted Directories (2)
- `alex/`
- `maya/`

### Legacy Imports

Legacy function names are still available via aliases in the new files:

```typescript
// In financial-habits.ts
export const createMayaTools = createFinancialHabitsTools;

// In communication-tools.ts
export const createAlexTools = createCommunicationTools;

// etc.
```

### Team Handlers

Team handlers have been fully migrated to the registry system:
- Set `USE_NEW_TEAM_HANDLERS=true` in your environment
- See `src/services/team-handler-registry/` for the new system

---

## 1. 🔴 CRITICAL: Jack Bogle References (BROKEN)

Since `jack-bogle` was removed, these references are now broken:

### In Tools (~45 references)
| File | References | Action Needed |
|------|------------|---------------|
| `handoff.ts` | 7 | Remove jack-bogle handoff tools |
| `team-integration.ts` | 5 | Remove jack-bogle integration |
| `ferni-team-handlers.ts` | 4 | Remove jack-bogle handler |
| `handoff/state.ts` | 4 | Remove jack-bogle from state |
| `shared/persona-memory-factory.ts` | 4 | Remove jack-bogle memory |
| `wisdom.ts` | 3 | Remove jack-bogle wisdom |
| `calculators.ts` | 3 | Remove jack-bogle calcs |
| `handoff/phrases.ts` | 2 | Remove jack-to-peter phrases |
| `handoff/handoff-factory.ts` | 2 | Remove from factory |
| `jack-mentor-tools.ts` | 1 | **DELETE entire file** |
| Others | ~10 | Various cleanups |

### In Intelligence (~20+ references)
| File | Action |
|------|--------|
| `context-builders/handoff.ts` | Remove jack-bogle routing |
| `context-builders/engagement.ts` | Remove jack-bogle engagement |
| `context-builders/personal.ts` | Remove jack-bogle personal |
| `context-builders/*.ts` | ~18 more files |
| `conversation-quality.ts` | Remove jack-bogle quality |
| `memory/semantic-rag.ts` | Remove jack-bogle RAG |

---

## 2. Agent-Named Tool Files (HIGH PRIORITY)

### Files to Migrate or Rename

| File | Lines | Suggested Action |
|------|-------|------------------|
| **Maya Files** | | |
| `maya-tools.ts` | 1,735 | Migrate to `domains/habits/`, `domains/finance/` |
| `maya-habit-coach.ts` | 3,980 | Migrate to `domains/habits/` |
| `maya-gamification.ts` | 1,310 | Migrate to `domains/habits/` |
| `maya-gamification-v2.ts` | ~500 | Merge with above |
| `maya-proactive-coach.ts` | 887 | Migrate to `domains/habits/` |
| `maya-notification-tools.ts` | ~300 | Migrate to `domains/communication/` |
| `maya-team-handlers.ts` | 806 | ✅ Deprecated |
| **Alex Files** | | |
| `alex-tools.ts` | 827 | Migrate to `domains/communication/` |
| `alex-appointments.ts` | 2,123 | Migrate to `domains/calendar/` |
| `alex-coaching-tools.ts` | 1,294 | Migrate to `domains/communication/` |
| `alex-team-handlers.ts` | 1,200 | ✅ Deprecated |
| **Jordan Files** | | |
| `jordan-tools.ts` | 1,206 | Migrate to `domains/life-planning/` |
| `jordan-team-handlers.ts` | 919 | ✅ Deprecated |
| **Peter Files** | | |
| `peter-lynch-tools.ts` | ~400 | Migrate to `domains/research/` |
| `peter-insights-tools.ts` | 1,397 | Migrate to `domains/research/` |
| `peter-team-handlers.ts` | 939 | ✅ Deprecated |
| **Ferni Files** | | |
| `ferni-team-handlers.ts` | ~600 | ✅ Deprecated |
| **Jack Files** | | |
| `jack-mentor-tools.ts` | ~200 | **DELETE** (persona removed) |

---

## 3. Agent-Named Directories (MEDIUM PRIORITY)

| Directory | Files | Suggested Rename |
|-----------|-------|-----------------|
| `alex/` | 2 | Delete or merge to `domains/communication/` |
| `alex-appointments/` | 8 | Rename to `scheduling/` |
| `maya/` | 1 | Delete or merge to `domains/habits/` |
| `maya-habit/` | 5 | Rename to `habit-tracking/` |
| `maya-habits/` | 4 | Merge with `maya-habit/` |

---

## 4. Current Agent Roster

After Jack Bogle removal:

| Agent | Bundle | Role |
|-------|--------|------|
| **Ferni** | `ferni/` | Coordinator / Life Coach |
| **Peter Lynch** | `peter-lynch/` | Research & Insights |
| **Maya Santos** | `maya-santos/` | Financial Habits |
| **Alex Chen** | `alex-chen/` | Communication |
| **Jordan Taylor** | `jordan-taylor/` | Life Planning |
| **Jaggi Vasudev** | `jaggi-vasudev/` | Wisdom (optional) |

---

## 5. Manifest Updates ✅ COMPLETE

All manifests now use abstract references:

```json
{
  "handoff_targets": ["@coordinator", "@team"],
  "can_handoff_to": ["@team"]
}
```

This allows dynamic team composition without code changes.

---

## Recommended Next Steps

### Immediate (Fix Broken Code)
1. 🔴 **Remove jack-mentor-tools.ts** - File references deleted persona
2. 🔴 **Clean up jack-bogle references** in:
   - `handoff.ts`
   - `handoff/phrases.ts`
   - `handoff/state.ts`
   - `team-integration.ts`
   - `wisdom.ts`
   - `calculators.ts`

### Short Term
3. 🟡 **Clean up intelligence/context-builders** - Remove jack-bogle routing
4. 🟡 **Update handoff system** - Remove jack-bogle tools

### Medium Term
5. 🔴 **Migrate maya-habit-coach.ts** (~4k lines) - Biggest file
6. 🔴 **Migrate alex-appointments.ts** (~2k lines)
7. 🔴 **Rename directories** - Remove agent names

---

## Environment Variables

```bash
# Enable new systems
USE_NEW_TOOL_SYSTEM=true
USE_NEW_TEAM_HANDLERS=true
USE_NEW_HANDOFF_TOOLS=true
```

---

## Definition of Done

| Requirement | Status |
|-------------|--------|
| No broken jack-bogle references | 🔴 Broken |
| No tool files named after agents | 🟡 In progress |
| All tools registered by domain | ✅ Done |
| Agent capabilities in manifests | ✅ Done |
| Handoff phrases in manifests | ✅ Done |
| Abstract handoff targets (@team) | ✅ Done |
| Handoffs use registry lookups | ✅ Done (new system) |
| New agents without code changes | ✅ Done |
| Legacy code deprecated | ✅ Done |
| Legacy code removed | 🔴 Pending |
