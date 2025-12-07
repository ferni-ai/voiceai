# Life Coach Tools - Audit & Improvements Needed

## ✅ Issues Fixed

### 1. Registry Type System
**Status: FIXED**

The new domains were not in the `ToolDomain` type or `ALL_TOOL_DOMAINS` array.

**Fixed in:** `src/tools/registry/types.ts`
- Added 10 new domains to `ToolDomain` type union
- Added 10 new domains to `ALL_TOOL_DOMAINS` array
- Added 10 new domains to `DOMAIN_TO_CATEGORY` mapping

### 2. TypeScript Errors
**Status: FIXED**

Several TypeScript errors in the new domain files:

**career/index.ts:**
- Fixed: Enum used `sleep-issues` but object key was `sleep_issues` → standardized to underscores

**crisis/index.ts:**
- Fixed: CRISIS_RESOURCES had inconsistent shapes → added proper TypeScript interface
- Fixed: `additional` array had inconsistent properties → made url/contact/description optional

**family/index.ts:**
- Fixed: DEVELOPMENTAL_STAGES used `youngAdult` but enum used `young-adult` → changed key to `'young-adult'`
- Fixed: Implicit `any` type in `forEach` callback → added explicit `: string` type

---

## ⚠️ Issues to Address

### 3. Data Persistence Not Implemented
**Priority: MEDIUM**
**Effort: High**

Most tools just return text guidance - they don't actually store user data to Firestore.

**Tools that SHOULD persist data:**

| Domain | Tool | What to Store |
|--------|------|---------------|
| health | `logExercise` | Exercise logs with date, type, duration |
| health | `trackFitnessGoal` | Fitness goals with progress |
| health | `logSymptom` | Symptom entries for pattern tracking |
| health | `trackHydration` | Hydration logs |
| career | `trackJobApplication` | Job applications with status |
| family | `trackChildMilestone` | Child milestones with dates |
| family | `celebrateFamilyMoment` | Family memories |
| learning | `setLearningGoal` | Learning goals |
| learning | `trackLearningProgress` | Progress entries |
| learning | `trackBooksRead` | Books read with takeaways |
| creativity | `trackCreativeProject` | Creative projects |
| community | `trackVolunteerHours` | Volunteer hours log |
| community | `trackImpact` | Impact summary |

**How to fix:**
```typescript
// Pattern from memory/tools.ts
execute: async ({ fact, category }, { ctx: toolCtx }) => {
  const userData = toolCtx.userData as UserData;
  const { services } = userData;
  
  if (services?.learningEngine) {
    services.learningEngine.captureExternalKeyMoment({
      id: `health_exercise_${Date.now()}`,
      timestamp: new Date(),
      type: 'milestone',
      summary: `Exercise: ${activityType} for ${durationMinutes} minutes`,
      emotionalWeight: 'light',
      topics: ['health', 'fitness'],
    });
  }
  // Return acknowledgment
}
```

**Recommendation:** Phase this in gradually. The guidance/coaching tools work fine without persistence - prioritize tracking tools.

---

### 3. Execute Callback Signature
**Priority: HIGH**
**Effort: Medium**

Our tools use the simple signature:
```typescript
execute: async ({ param1, param2 }) => { ... }
```

But to access user data and services, they need:
```typescript
execute: async ({ param1, param2 }, { ctx: toolCtx }) => {
  const userData = toolCtx.userData;
  const { services } = userData;
  // ...
}
```

**Files affected:** All 10 new domain files

**How to fix:** Update tools that need data access to use the full callback signature.

---

### 4. Missing Tool Category Mapping
**Priority: LOW**
**Effort: Low**

The `DOMAIN_TO_CATEGORY` mapping in `src/tools/registry/types.ts` doesn't include our new domains.

**Fix:** Add new domains to the category mapping:
```typescript
crisis: 'lifestyle',
health: 'lifestyle',
career: 'productivity', 
decisions: 'core',
family: 'lifestyle',
home: 'productivity',
learning: 'productivity',
creativity: 'lifestyle',
community: 'lifestyle',
'legal-admin': 'productivity',
```

---

### 5. Agent Manifest Integration
**Priority: MEDIUM**
**Effort: Medium**

The persona manifests need to be updated to include the new domains they should have access to.

**Example for Ferni (life coach):**
```typescript
tools: {
  domains: [
    // Existing...
    'crisis',      // Safety-critical
    'health',
    'career',
    'decisions',
    'family',
    'home',
    'learning',
    'creativity',
    'community',
    'legal-admin',
  ]
}
```

**File to update:** Agent manifest files in `src/personas/`

---

### 6. Some Tools Missing User Context
**Priority: LOW**
**Effort: Low**

Tools don't leverage `ctx.userId` for personalization. This is fine for most guidance tools, but tracking tools should eventually query user's historical data.

---

## 📋 Implementation Priorities

### Phase 1: Critical (Do Now)
1. ✅ Fix ToolDomain type - **DONE**
2. ✅ Fix ALL_TOOL_DOMAINS array - **DONE**
3. Add DOMAIN_TO_CATEGORY mapping
4. Verify TypeScript compiles

### Phase 2: Integration (Soon)
1. Update Ferni's agent manifest with new domains
2. Update other personas that should have specific domains
3. Test domain loading works

### Phase 3: Data Persistence (Later)
1. Update tracking tools to persist data
2. Update signature to access `toolCtx.userData`
3. Implement Firestore collections for new data types

### Phase 4: Enhancement (Future)
1. Add historical data queries to relevant tools
2. Add cross-domain insights (e.g., exercise affecting sleep)
3. Add proactive notifications for health/career goals

---

## 🧪 Testing Checklist

- [ ] TypeScript compiles without errors
- [ ] `getAllDomainToolDefinitions()` loads new domains
- [ ] `loadToolDomain('crisis')` works
- [ ] Tools appear in agent's available tools
- [ ] Tools execute and return guidance
- [ ] No runtime errors in logs

---

## 📁 Files Reference

**New Domain Files Created:**
- `src/tools/domains/crisis/index.ts`
- `src/tools/domains/health/index.ts`
- `src/tools/domains/career/index.ts`
- `src/tools/domains/decisions/index.ts`
- `src/tools/domains/family/index.ts`
- `src/tools/domains/home/index.ts`
- `src/tools/domains/learning/index.ts`
- `src/tools/domains/creativity/index.ts`
- `src/tools/domains/community/index.ts`
- `src/tools/domains/legal-admin/index.ts`

**Files Modified:**
- `src/tools/registry/types.ts` - Added new domains
- `src/tools/domains/index.ts` - Added exports and metadata

