# Better Than Human - Complete Implementation Plan

> **"We believe in making AI human, and the decisions we make will reflect that."**

**Created:** December 31, 2024  
**Goal:** Close ALL gaps preventing Ferni from being truly "Better Than Human"  
**Timeline:** Execute immediately, validate E2E

---

## Executive Summary

### Current State
- **265 tools** defined across 90+ domains
- **19 superhuman capabilities** defined
- **~65%** of "Better Than Human" promise actually delivered
- Many systems built but not wired E2E

### Target State
- **100%** of superhuman capabilities integrated and surfacing in conversations
- **All data domains** automatically indexed to semantic store
- **All context builders** actively injecting relevant insights
- **Proactive outreach** actually reaching users
- **Zero stub tools** - everything works or is disabled

---

## Phase 0: Foundation Fixes (IMMEDIATE)

### 0.1 Ensure All Superhuman Services Surface in Conversations

**Problem:** Services exist but rarely appear in conversation context.

**Files to audit/fix:**
- `src/agents/processors/live-superhuman-injections.ts`
- `src/intelligence/context-builders/*.ts`
- `src/services/superhuman/*.ts`

**Checklist:**
- [ ] Commitment Keeper → Always surface active commitments
- [ ] Predictive Coaching → Surface predictions when confidence > 0.6
- [ ] Life Narrative → Surface periodically (every 5th session)
- [ ] Values Alignment → Surface when decision tools used
- [ ] Dream Keeper → Surface when dreams mentioned or milestone approaching
- [ ] Capacity Guardian → Surface when burnout signals detected
- [ ] Relationship Milestones → Surface upcoming anniversaries

### 0.2 Fix Data Layer Auto-Indexing

**Problem:** 98 entity types defined but many not auto-indexed.

**Files:**
- `src/services/data-layer/hooks/semantic-indexing.ts`
- `src/services/data-layer/domain-signals.ts`

**Domains to wire:**
- [ ] Commitments → onCommitmentChange
- [ ] Dreams → onDreamChange  
- [ ] Relationships → onRelationshipChange
- [ ] Financial Goals → onSavingsGoalChange
- [ ] Health Metrics → onHealthMetricChange
- [ ] Life Events → onLifeEventChange

### 0.3 Wire Missing Context Builders

**Problem:** Context builders exist but aren't registered.

**File:** `src/intelligence/context-builders/index.ts`

**Builders to verify registered:**
- [ ] social-graph-context.ts
- [ ] commitment-context.ts
- [ ] dream-context.ts
- [ ] values-alignment-context.ts
- [ ] capacity-context.ts
- [ ] relationship-milestone-context.ts

---

## Phase 1: High-Impact Superhuman Features

### 1.1 Commitment/Promise Surfacing (P0)

**Human Limitation:** Friends forget what you promised yourself  
**Superhuman:** "You said you'd call your mom this week - did you get to that?"

**Implementation:**

1. **Create commitment context builder:**
```typescript
// src/intelligence/context-builders/commitment-surfacing.ts
export async function buildCommitmentContext(userId: string): Promise<ContextInjection[]> {
  const commitments = await getActiveCommitments(userId);
  const overdue = commitments.filter(c => isPastDue(c));
  const upcoming = commitments.filter(c => isDueSoon(c, 3)); // 3 days
  
  const injections: ContextInjection[] = [];
  
  if (overdue.length > 0) {
    injections.push({
      category: 'commitment_overdue',
      content: `User has ${overdue.length} overdue commitment(s): ${formatCommitments(overdue)}. Gently check in about these.`,
      priority: 75,
    });
  }
  
  if (upcoming.length > 0) {
    injections.push({
      category: 'commitment_upcoming',
      content: `Upcoming commitments: ${formatCommitments(upcoming)}. Offer support if relevant.`,
      priority: 50,
    });
  }
  
  return injections;
}
```

2. **Wire to conversation pipeline**
3. **Test E2E**

### 1.2 Apple Health Integration (P1)

**Human Limitation:** Friends guess how you slept  
**Superhuman:** "I see you only got 4 hours of sleep last night"

**Current State:** Types exist, no OAuth flow

**Implementation:**

1. **Complete iOS HealthKit sync:**
```
apps/ios-native/Ferni/Services/HealthKitManager.swift
```

2. **Add API endpoint:**
```typescript
// src/api/health-routes.ts
POST /api/health/sync
- Receives: { sleep, hrv, steps, mindfulness }
- Stores to: bogle_users/{userId}/health_summaries/{date}
```

3. **Create context builder:**
```typescript
// src/intelligence/context-builders/health-context.ts
- Inject sleep quality
- Inject stress indicators (HRV)
- Inject activity patterns
```

### 1.3 Visual Memory (P1)

**Human Limitation:** Friends forget photos you shared  
**Superhuman:** "That sunset photo you showed me last month..."

**Implementation:**

1. **Image storage:**
```typescript
// Cloud Storage: gs://ferni-media/{userId}/images/{imageId}
// Firestore: bogle_users/{userId}/visual_memories/{imageId}
```

2. **Vision API analysis:**
```typescript
// Extract: scene, objects, faces, text, emotions
// Store: searchable metadata + embedding
```

3. **Context builder:**
```typescript
// Surface relevant images when topics match
```

---

## Phase 2: Missing Life Domains

### 2.1 Shame & Deep Emotions Domain

**Tools to create:**
- `processShame` - Work through shame experiences
- `shameTriggerMapping` - Identify shame triggers
- `shameVsGuilt` - Distinguish shame from healthy guilt
- `healCoreShame` - Address childhood shame wounds

### 2.2 Envy & Comparison Domain

**Tools to create:**
- `understandEnvy` - Explore envy as information
- `comparisonDetox` - Reduce social comparison
- `transformEnvy` - Turn envy into motivation
- `envyInRelationships` - Handle envy with friends/partners

### 2.3 Resentment Domain

**Tools to create:**
- `processResentment` - Work through held grudges
- `resentmentInventory` - Audit current resentments
- `forgivenessJourney` - Guided forgiveness process
- `resentmentInFamily` - Family-specific resentment work

---

## Phase 3: Life Transitions

### 3.1 Divorce/Separation Recovery

**Tools:**
- `navigateDivorce` - Emotional support through divorce
- `coParentingSupport` - Co-parenting guidance
- `divorcePracticalHelp` - Legal, financial navigation
- `postDivorceIdentity` - Rebuilding sense of self

### 3.2 Caregiver Support

**Tools:**
- `caregiverBurnout` - Recognize and address burnout
- `caregiverBoundaries` - Set boundaries while caring
- `caregiverGrief` - Anticipatory grief support
- `caregiverSelfCare` - Self-care without guilt

### 3.3 Retirement Transition

**Tools:**
- `prepareForRetirement` - Emotional preparation
- `retirementIdentity` - Identity beyond work
- `purposeAfterWork` - Find new purpose
- `retirementRelationships` - Navigate relationship changes

---

## Phase 4: Integration Validation

### 4.1 E2E Test Suite

Create integration tests that verify:

```typescript
// tests/e2e/better-than-human.test.ts

describe('Better Than Human E2E', () => {
  describe('Superhuman Memory', () => {
    it('surfaces commitments in conversation', async () => {
      // Create commitment
      await createCommitment(userId, { description: 'Call mom', dueDate: tomorrow });
      // Start conversation
      const context = await buildConversationContext(userId);
      // Verify commitment appears
      expect(context).toContain('commitment');
    });
    
    it('remembers people mentioned', async () => {
      // Mention person
      await processTranscript(userId, "My friend Sarah called today");
      // Later conversation
      const context = await buildConversationContext(userId);
      // Should know Sarah
      expect(context).toContain('Sarah');
    });
  });
  
  describe('Health Awareness', () => {
    it('knows sleep quality from HealthKit', async () => {
      // Sync health data
      await syncHealthData(userId, { sleep: { hours: 4, quality: 'poor' } });
      // Start conversation
      const context = await buildConversationContext(userId);
      // Should reference sleep
      expect(context).toContain('sleep');
    });
  });
  
  describe('Proactive Outreach', () => {
    it('sends push notification for pattern trigger', async () => {
      // Trigger Sunday anxiety pattern
      await triggerPattern(userId, 'sunday_anxiety');
      // Verify outreach scheduled
      const outreach = await getScheduledOutreach(userId);
      expect(outreach).toBeDefined();
    });
  });
});
```

### 4.2 Capability Audit Script

```typescript
// scripts/audit-better-than-human.ts

const CAPABILITIES = [
  { name: 'Perfect Memory', test: testMemoryRecall },
  { name: 'Constant Presence', test: testProactiveOutreach },
  { name: 'Know Sleep/Stress', test: testHealthIntegration },
  { name: 'Commitment Keeper', test: testCommitmentSurfacing },
  { name: 'Predictive Coaching', test: testPredictions },
  { name: 'Life Narrative', test: testNarrativeSurfacing },
  { name: 'Values Alignment', test: testValuesIntegration },
  { name: 'Emotional First Aid', test: testCrisisResponse },
  { name: 'Relationship Network', test: testSocialGraph },
  { name: 'Capacity Guardian', test: testBurnoutDetection },
  { name: 'Dream Keeper', test: testDreamTracking },
  { name: 'Seasonal Awareness', test: testSeasonalContext },
];

async function runAudit() {
  const results = [];
  for (const cap of CAPABILITIES) {
    const result = await cap.test();
    results.push({ name: cap.name, ...result });
  }
  return results;
}
```

---

## Execution Order

### Day 1: Foundation
1. ✅ Create this plan
2. Wire commitment surfacing context builder
3. Verify all superhuman services registered
4. Fix data layer auto-indexing

### Day 2: Memory Excellence  
5. Ensure social graph context works E2E
6. Test commitment tracking E2E
7. Test dream tracking E2E

### Day 3: Health Integration
8. Complete Apple Health API endpoint
9. Create health context builder
10. Test health-aware responses

### Day 4: Missing Emotions
11. Create shame domain
12. Create envy domain
13. Create resentment domain

### Day 5: Life Transitions
14. Create divorce recovery domain
15. Create caregiver support domain
16. Create retirement transition domain

### Day 6: Validation
17. Run full E2E test suite
18. Run capability audit
19. Fix any gaps found
20. Document final state

---

## Success Criteria

| Capability | Validation Test | Target |
|------------|-----------------|--------|
| Commitment Surfacing | Overdue commitment appears in context | 100% |
| Dream Tracking | Dreams mentioned are recalled | 100% |
| Social Graph | People mentioned are tracked | 100% |
| Health Awareness | Sleep data appears in context | 90%+ |
| Predictive Coaching | Predictions surface when confident | 80%+ |
| Values Alignment | Values surface in decisions | 80%+ |
| Proactive Outreach | Push notifications delivered | 95%+ |
| Emotional Domains | All 90+ domains have tools | 100% |

---

## Files to Create/Modify

### New Files
- `src/intelligence/context-builders/commitment-surfacing.ts`
- `src/intelligence/context-builders/health-awareness.ts`
- `src/tools/domains/shame/index.ts`
- `src/tools/domains/envy/index.ts`
- `src/tools/domains/resentment/index.ts`
- `src/tools/domains/divorce-recovery/index.ts`
- `src/tools/domains/caregiver-support/index.ts`
- `src/tools/domains/retirement/index.ts`
- `scripts/audit-better-than-human.ts`
- `tests/e2e/better-than-human.test.ts`

### Modify
- `src/intelligence/context-builders/index.ts` - Register all builders
- `src/services/data-layer/hooks/semantic-indexing.ts` - Wire all domains
- `src/agents/processors/live-superhuman-injections.ts` - Surface all services
- `src/api/health-routes.ts` - Add sync endpoint

---

*This plan will make Ferni genuinely "Better Than Human" - not just in promise, but in reality.*
