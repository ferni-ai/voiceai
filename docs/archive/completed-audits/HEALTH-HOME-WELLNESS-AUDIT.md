# Health, Home & Wellness Domains Audit

**Date:** December 24, 2025  
**Status:** ✅ COMPLETED (All Critical Issues Fixed)  

---

## Executive Summary

This audit found **significant duplication, naming confusion, and incomplete E2E work** across the health, wellness, home, and smart-home domains. The user's intuition about grouping was correct - there's overlap that needs cleanup.

### Key Problems → RESOLVED

| Problem | Severity | Status | Resolution |
|---------|----------|--------|------------|
| **Misleading Domain Names** | 🔴 High | ✅ Fixed | Added clear documentation to wellness/index.ts |
| **Semantic Router Overlap** | 🔴 High | ✅ Fixed | Removed sleepHelpTool from wellness.semantic.ts |
| **Orphaned Code** | 🟡 Medium | ✅ Fixed | Re-exported smart-home.ts functions from index.ts |
| **Missing Tests** | 🟡 Medium | ✅ Fixed | Created smart-home/__tests__/smart-home.test.ts |
| **No E2E Chain Tests** | 🟡 Medium | ✅ Fixed | Added Health→Smart Home E2E tests |

---

## Domain Inventory

### Current Structure

```
domains/
├── health/              # 12 tools - Physical fitness, nutrition, sleep, energy
│   ├── index.ts         # Domain export
│   └── __tests__/       # ✅ Good test coverage
│
├── wellness/            # 4 tools - Financial anxiety + medications (MISLEADING NAME!)
│   ├── index.ts         # Wraps legacy tools
│   ├── wellness-tools.ts # Financial/emotional wellness (Jack Bogle focused)
│   ├── medications.ts   # Medication tracking
│   └── __tests__/       # ⚠️ Minimal tests (just loading)
│
├── home/                # 8 tools - Maintenance, organization, moving, contractors
│   ├── index.ts         # Domain export
│   ├── shopping.ts      # Shopping lists
│   ├── packages.ts      # Package tracking
│   └── __tests__/       # ✅ Good test coverage
│
└── smart-home/          # ~12 tools - IoT device control
    ├── index.ts         # Only exports HA + Ecobee tools
    ├── smart-home.ts    # ⚠️ ORPHANED - Not exported!
    ├── home-assistant-tools.ts
    ├── ecobee-tools.ts
    └── __tests__/       # ❌ MISSING - No tests!
```

### Semantic Router Definitions

| File | Tool Count | Routes To |
|------|------------|-----------|
| `health.semantic.ts` | 8 tools | `domains/health` |
| `wellness.semantic.ts` | 3 tools | `domains/wellness` |
| `home.semantic.ts` | 8 tools | `domains/home` |
| `smart-home.semantic.ts` | 4 tools | `domains/smart-home` |

---

## 🔴 Critical Issue #1: Domain Naming Confusion

### The `wellness` Domain is Misnamed

**What it contains:**
- Financial anxiety support (market fear, not enough, behind peers)
- Money mindset reframing
- Medication tracking

**What users expect:** Physical/mental wellness, stress, mindfulness

**Current reality:**
- Physical wellness (exercise, sleep) → `health` domain
- Financial wellness → `wellness` domain (confusing!)
- Grounding/anxiety → routed to `wellness` but could go to `health`

### Recommendation

**Option A: Rename and Split**
```
wellness/ → emotional-wellness/    # Grounding, anxiety, mindfulness
         → financial-wellness/     # Money anxiety, beliefs (move to finance/)
medications/ → health/medications/ # Belongs with health tracking
```

**Option B: Consolidate (RECOMMENDED)**
```
# Merge medications into health domain
health/medications.ts  # From wellness/medications.ts

# Rename wellness to financial-wellness or merge into finance
finance/financial-wellness.ts  # From wellness/wellness-tools.ts

# Move grounding/anxiety to health or create new domain
health/mental-wellness.ts  # OR crisis/ domain
```

---

## 🔴 Critical Issue #2: Semantic Router Overlap

### Sleep Tools Appear in TWO Places!

**health.semantic.ts:**
```typescript
sleepAnalysisTool        // Routes to analyzeSleepPattern
sleepHygieneTool         // Routes to suggestSleepHygiene
```

**wellness.semantic.ts:**
```typescript
sleepHelpTool            // Also routes to wellness for sleep!
```

**Problem:** User says "I can't sleep" → which router wins?

### Recommendation

Remove `sleepHelpTool` from `wellness.semantic.ts` - sleep belongs in `health`.

```typescript
// wellness.semantic.ts - REMOVE these:
// - sleepHelpTool (duplicate of health)

// health.semantic.ts - KEEP these:
// - sleepAnalysisTool
// - sleepHygieneTool
```

---

## 🟡 Issue #3: Orphaned Smart-Home Code

### `smart-home/smart-home.ts` is NOT EXPORTED

**Evidence:**
```typescript
// smart-home/index.ts
import { homeAssistantTools } from './home-assistant-tools.js';
import { ecobeeTools } from './ecobee-tools.js';

const smartHomeTools = [...homeAssistantTools, ...ecobeeTools];
// ⚠️ smart-home.ts is NOT imported!
```

**Contents of orphaned file:**
- Generic smart home control (Hue, LIFX, SmartThings)
- Scene/routine support
- Self-healing resilience patterns

### Recommendation

Either:
1. **Remove** `smart-home.ts` if superseded by HA tools
2. **Integrate** it as a fallback for non-HA users
3. **Export** it alongside HA/Ecobee tools

---

## 🟡 Issue #4: Missing Tests

### Smart-Home: Zero Tests ❌

```
src/tools/domains/smart-home/
├── index.ts
├── smart-home.ts          # No tests
├── home-assistant-tools.ts # No tests
├── ecobee-tools.ts        # No tests
└── __tests__/             # MISSING!
```

### Wellness: Minimal Tests ⚠️

```typescript
// wellness.test.ts - Only 98 lines
// Tests ONLY:
// - Tool loading
// - Tool creation
// No execution tests!
```

### Recommendation

Create comprehensive tests:
1. `smart-home/__tests__/smart-home.test.ts`
2. Expand `wellness/__tests__/wellness.test.ts`
3. Add E2E chain tests (see below)

---

## 🟡 Issue #5: No E2E Chain Tests

### Missing User Journeys

| Journey | Tools Involved | Status |
|---------|---------------|--------|
| Morning routine | health (exercise, energy) → smart-home (lights, thermostat) | ❌ Missing |
| Bedtime routine | health (sleep hygiene) → smart-home (lights, locks) | ❌ Missing |
| Home maintenance + smart devices | home (maintenance) → smart-home (HVAC) | ❌ Missing |
| Wellness check + medication | wellness (check-in) → medications (schedule) | ❌ Missing |

### Recommendation

Add to `__tests__/e2e-tool-chains.test.ts`:

```typescript
describe('Health + Smart-Home Journey', () => {
  it('should chain: sleepHygiene → controlLights → setThermostat', async () => {
    // User says "Help me wind down for bed"
    // 1. Get sleep hygiene tips
    // 2. Dim lights
    // 3. Set thermostat to sleep mode
  });
});
```

---

## Detailed Tool Analysis

### Health Domain (12 tools) ✅ Well-structured

| Tool | Description | Tests |
|------|-------------|-------|
| `logExercise` | Record physical activity | ✅ |
| `suggestWorkout` | Workout recommendations | ✅ |
| `trackFitnessGoal` | Fitness goal tracking | ✅ |
| `coachOnNutrition` | Nutrition guidance | ✅ |
| `trackHydration` | Water intake | ✅ |
| `analyzeSleepPattern` | Sleep analysis | ✅ |
| `suggestSleepHygiene` | Sleep tips | ✅ |
| `logSymptom` | Symptom tracking | ✅ |
| `prepareForDoctorVisit` | Doctor prep | ✅ |
| `remindPreventiveCare` | Screening reminders | ✅ |
| `assessEnergyLevel` | Energy check | ✅ |
| `suggestEnergyBoost` | Energy tips | ✅ |

### Wellness Domain (4 tools) ⚠️ Needs cleanup

| Tool | Description | Tests | Issue |
|------|-------------|-------|-------|
| `emotionalSupport` | Financial anxiety | ⚠️ | Name vs function mismatch |
| `reframeBelief` | Money beliefs | ⚠️ | Should be in finance/ |
| `manageMedication` | Medication tracking | ⚠️ | Should be in health/ |
| `medicationSchedule` | Med schedule | ⚠️ | Should be in health/ |

### Home Domain (8 tools) ✅ Well-structured

| Tool | Description | Tests |
|------|-------------|-------|
| `remindHomeMaintenance` | Seasonal tasks | ✅ |
| `trackRepair` | Repair tracking | ✅ |
| `coachDecluttering` | Decluttering help | ✅ |
| `organizeSpace` | Space organization | ✅ |
| `planMove` | Moving planning | ✅ |
| `assessEmergencyPreparedness` | Emergency prep | ✅ |
| `planHomeProject` | DIY projects | ✅ |
| `manageContractor` | Contractor help | ✅ |

### Smart-Home Domain (~12 tools) ❌ Needs work

| Tool | Source | Tests |
|------|--------|-------|
| `controlLight` | home-assistant-tools.ts | ❌ |
| `setThermostat` | home-assistant-tools.ts | ❌ |
| `activateScene` | home-assistant-tools.ts | ❌ |
| `controlLock` | home-assistant-tools.ts | ❌ |
| `getHomeStatus` | home-assistant-tools.ts | ❌ |
| `getThermostatStatus` | ecobee-tools.ts | ❌ |
| `setThermostatTemperature` | ecobee-tools.ts | ❌ |
| `setClimateMode` | ecobee-tools.ts | ❌ |
| `setHvacMode` | ecobee-tools.ts | ❌ |
| `getSensorReadings` | ecobee-tools.ts | ❌ |
| `resumeThermostatSchedule` | ecobee-tools.ts | ❌ |

---

## Should Health + Home Be Grouped?

**User's question:** "Maybe we Group Health and Home together?"

### Analysis

| Aspect | Health | Home |
|--------|--------|------|
| **Focus** | Body wellness | Living space |
| **User need** | Personal health | Property management |
| **Tools** | Exercise, nutrition, sleep | Maintenance, organization |
| **Overlaps** | Energy (can relate to home temp) | Smart-home (HVAC, air quality) |

### Recommendation: **Don't merge. But do:**

1. **Create clear cross-domain hooks:**
   - Health (sleep) → Smart-Home (bedroom temp, lights)
   - Health (energy) → Home (workspace organization)
   - Home (maintenance) → Smart-Home (HVAC service)

2. **Better naming:**
   - `health` → `physical-health`
   - `home` → `home-management`
   - `smart-home` → keep as is (clear)

3. **Instead, merge wellness INTO other domains:**
   ```
   wellness/medications.ts → health/medications.ts
   wellness/wellness-tools.ts → finance/financial-wellness.ts
   ```

---

## Recommended Action Plan

### Phase 1: Fix Critical Issues (This Week)

1. **Remove sleep duplicate from wellness.semantic.ts**
   - File: `src/tools/semantic-router/tool-definitions/wellness.semantic.ts`
   - Remove: `sleepHelpTool`

2. **Export or remove orphaned smart-home.ts**
   - File: `src/tools/domains/smart-home/index.ts`
   - Decision: Export as fallback or delete

3. **Add smart-home tests**
   - Create: `src/tools/domains/smart-home/__tests__/smart-home.test.ts`

### Phase 2: Restructure (Next Sprint)

1. **Move medications to health domain**
   ```bash
   mv src/tools/domains/wellness/medications.ts src/tools/domains/health/medications.ts
   ```

2. **Rename/relocate financial wellness**
   - Option A: Rename domain to `emotional-wellness`
   - Option B: Move to `finance/financial-wellness.ts`

3. **Update semantic routers to match**

### Phase 3: Add E2E Tests

1. Create cross-domain journey tests
2. Add health → smart-home chains
3. Add medication → calendar reminders chains

---

## Files to Modify

| File | Change |
|------|--------|
| `semantic-router/tool-definitions/wellness.semantic.ts` | Remove sleep duplicate |
| `domains/smart-home/index.ts` | Export or remove smart-home.ts |
| `domains/wellness/index.ts` | Rename or restructure |
| `domains/health/index.ts` | Add medications import |
| `__tests__/e2e-tool-chains.test.ts` | Add health/home chains |
| New: `domains/smart-home/__tests__/smart-home.test.ts` | Create tests |

---

## Metrics to Track

After cleanup:
- [ ] Zero duplicate tool IDs across semantic routers
- [ ] 100% test coverage for smart-home domain
- [ ] All domains properly named (no misleading names)
- [ ] E2E tests for 5+ cross-domain journeys
- [ ] No orphaned code files

---

*Generated by Ferni Audit Tool*

