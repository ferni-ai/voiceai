# Semantic E2E Implementation Plan

> **Closing the gaps in our "Better Than Human" system**

This plan addresses all P1 and P2 gaps identified in the [Semantic Intelligence E2E Audit](../audits/SEMANTIC-INTELLIGENCE-E2E-AUDIT.md).

---

## 📋 Implementation Phases

| Phase | Focus | Duration | Deliverables |
|-------|-------|----------|--------------|
| **Phase 1** | Critical Gaps | 5 days | New domain hooks, TTL cleanup, live injection |
| **Phase 2** | Routing Enhancement | 3 days | Emotion-aware routing, multi-intent |
| **Phase 3** | Outreach Integration | 4 days | Domain triggers, inbound SMS, webhook validation |
| **Phase 4** | Intelligence → Action | 3 days | Trajectory routing, graph timing |

---

## 🔴 Phase 1: Critical Gap Fixes

### 1.1 New Domain Indexing Hooks

**Problem:** 13 new life stage domains have no semantic indexing.

**Files to modify:**
- `src/services/data-layer/hooks/life-stage-hooks.ts` (NEW)
- `src/services/data-layer/hooks/index.ts`
- `src/services/data-layer/indexing-policy.ts`

```typescript
// src/services/data-layer/hooks/life-stage-hooks.ts

import { indexEntity, deindexEntity } from '../semantic-context-builder.js';

// New Parent
export function onNewParentChange(
  userId: string,
  entityId: string,
  data: { babyAge?: string; identityStage?: string; },
  action: 'create' | 'update' | 'delete'
): void {
  if (action === 'delete') {
    void deindexEntity(userId, entityId);
    return;
  }
  void indexEntity(userId, {
    entityType: 'new_parent',
    entityId,
    content: `New parent: Baby ${data.babyAge}. Identity stage: ${data.identityStage}`,
    priority: 'high',
  });
}

// Empty Nest
export function onEmptyNestChange(...);

// Infidelity (sensitive - high priority)
export function onInfidelityChange(
  userId: string,
  entityId: string,
  data: { phase?: string; trustLevel?: string; },
  action: 'create' | 'update' | 'delete'
): void {
  if (action === 'delete') {
    void deindexEntity(userId, entityId);
    return;
  }
  void indexEntity(userId, {
    entityType: 'infidelity_recovery',
    entityId,
    content: `Infidelity recovery: ${data.phase}. Trust rebuilding: ${data.trustLevel}`,
    priority: 'high', // Sensitive topic - high priority
  });
}

// Health Diagnosis
export function onHealthDiagnosisChange(...);

// Job Loss
export function onJobLossChange(...);

// Sobriety (sensitive)
export function onSobrietyChange(...);

// Sandwich Generation
export function onSandwichGenerationChange(...);

// Blended Family
export function onBlendedFamilyChange(...);

// Coming Out (sensitive)
export function onComingOutChange(...);

// Faith Transition
export function onFaithTransitionChange(...);

// Caregiver
export function onCaregiverStatusChange(...);

// Divorce
export function onDivorceProgressChange(...);
```

**Indexing Policy Updates:**

```typescript
// src/services/data-layer/indexing-policy.ts

// Add to ENTITY_POLICIES
export const ENTITY_POLICIES: Record<EntityType, IndexingPolicy> = {
  // ... existing ...
  
  // Life Stage Domains (all high priority when active)
  new_parent: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  empty_nest: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  infidelity_recovery: { priority: 'always', ttlDays: 0 }, // Sensitive - never auto-delete
  health_diagnosis: { priority: 'always', ttlDays: 0 }, // Health - never auto-delete
  job_loss: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 180 },
  sobriety: { priority: 'always', ttlDays: 0 }, // Recovery - never auto-delete
  sandwich_generation: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  blended_family: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  coming_out: { priority: 'always', ttlDays: 0 }, // Identity - never auto-delete
  faith_transition: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  caregiver: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
  divorce: { priority: 'active_only', conditions: { isActive: true }, ttlDays: 365 },
};
```

---

### 1.2 TTL Cleanup Job

**Problem:** Old data accumulating in Firestore and vector store.

**File:** `src/services/data-layer/ttl-cleanup.ts`

```typescript
/**
 * TTL Cleanup Job
 * 
 * Runs on a schedule to purge expired documents from:
 * - Firestore (documents with ttlExpires < now)
 * - Vector store (embeddings with ttlDays exceeded)
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { ENTITY_POLICIES } from './indexing-policy.js';

const log = createLogger({ module: 'TTLCleanup' });

export async function runTTLCleanup(): Promise<CleanupResult> {
  const db = getFirestoreDb();
  if (!db) return { deleted: 0, errors: [] };
  
  const results: CleanupResult = { deleted: 0, errors: [] };
  const now = new Date();
  
  // 1. Clean up documents with explicit ttlExpires
  const usersSnapshot = await db.collection('bogle_users').get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    
    // Check each subcollection
    for (const [entityType, policy] of Object.entries(ENTITY_POLICIES)) {
      if (policy.ttlDays === 0) continue; // Never delete
      
      const cutoffDate = new Date(now.getTime() - policy.ttlDays * 24 * 60 * 60 * 1000);
      
      try {
        // Query for old documents
        const oldDocs = await db
          .collection('bogle_users')
          .doc(userId)
          .collection(entityType)
          .where('createdAt', '<', cutoffDate)
          .limit(100) // Batch size
          .get();
        
        for (const doc of oldDocs.docs) {
          await doc.ref.delete();
          results.deleted++;
        }
      } catch (error) {
        results.errors.push(`${userId}/${entityType}: ${String(error)}`);
      }
    }
  }
  
  log.info({ deleted: results.deleted }, '🧹 TTL cleanup completed');
  return results;
}

// Scheduled entry point
export async function scheduledTTLCleanup(): Promise<void> {
  log.info('Starting scheduled TTL cleanup');
  const result = await runTTLCleanup();
  
  if (result.errors.length > 0) {
    log.warn({ errors: result.errors }, 'TTL cleanup had errors');
  }
}
```

**Add to package.json:**

```json
{
  "scripts": {
    "ops:ttl-cleanup": "npx tsx src/services/data-layer/ttl-cleanup.ts",
    "ops:ttl-cleanup:dry-run": "DRY_RUN=true npx tsx src/services/data-layer/ttl-cleanup.ts"
  }
}
```

---

### 1.3 Live Superhuman Injection

**Problem:** Superhuman context only at session start, not during conversation.

**File:** `src/intelligence/context-builders/live-superhuman-injections.ts`

**Add conditional injection logic:**

```typescript
// Add to existing file

/**
 * Detect if current turn warrants superhuman context injection
 */
function shouldInjectSuperhumanContext(
  input: ContextBuilderInput,
  type: 'commitment' | 'dream' | 'capacity' | 'values' | 'seasonal'
): boolean {
  const text = input.currentTurn?.content?.toLowerCase() || '';
  
  switch (type) {
    case 'commitment':
      // Inject when user mentions promises, goals, intentions
      return /\b(promis|commit|said i would|told you|remember when i|supposed to)\b/.test(text);
    
    case 'dream':
      // Inject when user mentions future aspirations
      return /\b(dream|wish|someday|one day|bucket list|always wanted|hope to)\b/.test(text);
    
    case 'capacity':
      // Inject when user shows capacity concerns
      return /\b(exhausted|overwhelmed|too much|can't handle|burning out|stressed)\b/.test(text);
    
    case 'values':
      // Inject when user faces decisions
      return /\b(should i|deciding|torn between|not sure if|what do you think)\b/.test(text);
    
    case 'seasonal':
      // Inject near important dates (handled by date proximity check)
      return false; // Checked separately
  }
}

// Modify buildLiveSuperhumanInjections to use conditional logic
export async function buildLiveSuperhumanInjections(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userData, currentTurn } = input;
  const userId = services?.userId;
  
  if (!userId) return [];
  
  const injections: ContextInjection[] = [];
  
  // Conditional commitment injection
  if (shouldInjectSuperhumanContext(input, 'commitment')) {
    const commitments = await loadUserCommitments(userId);
    const active = commitments.filter(c => c.status === 'active');
    if (active.length > 0) {
      injections.push(createHighInjection(
        'live_commitments',
        `[BETTER THAN HUMAN: User mentioned commitments] They have ${active.length} active commitments. Most relevant: "${active[0].summary}". Consider acknowledging progress or gently checking in.`,
        { category: 'memory' }
      ));
    }
  }
  
  // Conditional capacity injection
  if (shouldInjectSuperhumanContext(input, 'capacity')) {
    const assessment = await assessBurnoutRisk(userId);
    if (assessment.risk !== 'low') {
      injections.push(createHighInjection(
        'live_capacity',
        `[BETTER THAN HUMAN: Capacity Warning] User showing capacity concern AND burnout risk is ${assessment.risk} (score: ${assessment.riskScore}). Prioritize protection over productivity.`,
        { category: 'safety' }
      ));
    }
  }
  
  // ... similar for dream, values
  
  return injections;
}
```

---

## 🟡 Phase 2: Routing Enhancement

### 2.1 Emotion-Aware Routing

**Problem:** Voice emotion not boosting relevant tool confidence.

**File:** `src/tools/semantic-router/voice-integration.ts`

```typescript
// Add emotion → domain mapping
const EMOTION_DOMAIN_BOOST: Record<string, { domains: string[]; boost: number }> = {
  angry: { domains: ['anger', 'conflict', 'resentment'], boost: 0.15 },
  sad: { domains: ['grief', 'depression', 'loss', 'breakup-recovery'], boost: 0.15 },
  anxious: { domains: ['anxiety', 'worry', 'stress', 'panic'], boost: 0.15 },
  fearful: { domains: ['fear', 'anxiety', 'safety'], boost: 0.15 },
  overwhelmed: { domains: ['burnout', 'capacity', 'sandwich-generation'], boost: 0.20 },
  hopeless: { domains: ['depression', 'crisis', 'suicidal-ideation'], boost: 0.25 },
  exhausted: { domains: ['burnout', 'capacity', 'sleep', 'new-parent'], boost: 0.15 },
  ashamed: { domains: ['shame', 'guilt', 'self-esteem'], boost: 0.20 },
  jealous: { domains: ['envy', 'relationships', 'comparison'], boost: 0.15 },
  resentful: { domains: ['resentment', 'forgiveness', 'boundaries'], boost: 0.15 },
};

// Modify routeVoiceInput to apply emotion boost
export async function routeVoiceInput(
  inputText: string,
  context: VoiceRouterContext
): Promise<VoiceRouterResult> {
  // ... existing routing logic ...
  
  // Apply emotion-based confidence boost
  if (context.voiceEmotion && matchResult.matches.length > 0) {
    const boostConfig = EMOTION_DOMAIN_BOOST[context.voiceEmotion.primary];
    if (boostConfig) {
      for (const match of matchResult.matches) {
        if (boostConfig.domains.includes(match.toolDefinition.domain)) {
          match.score += boostConfig.boost;
          log.debug({
            tool: match.toolId,
            emotion: context.voiceEmotion.primary,
            boost: boostConfig.boost,
          }, '🎭 Emotion boost applied');
        }
      }
      
      // Re-sort by boosted scores
      matchResult.matches.sort((a, b) => b.score - a.score);
    }
  }
  
  // ... rest of routing ...
}
```

### 2.2 Multi-Intent Handling

**Problem:** "I'm stressed about my divorce AND losing my job" only routes to one tool.

**File:** `src/tools/semantic-router/multi-intent.ts`

```typescript
/**
 * Multi-Intent Router
 * 
 * Detects and splits compound intents into multiple tool calls.
 */

const COMPOUND_PATTERNS = [
  /\b(and|also|plus|as well as|in addition|on top of)\b/i,
  /\b(but also|not just.*but)\b/i,
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  divorce: ['divorce', 'separation', 'custody', 'ex-spouse'],
  'job-loss': ['job loss', 'laid off', 'fired', 'unemployed', 'job search'],
  'health-diagnosis': ['diagnosis', 'chronic', 'illness', 'disease'],
  'new-parent': ['baby', 'newborn', 'postpartum', 'parenting'],
  // ... etc
};

export function detectMultipleIntents(text: string): DetectedIntent[] {
  const intents: DetectedIntent[] = [];
  const lowerText = text.toLowerCase();
  
  // Check for compound markers
  const hasCompound = COMPOUND_PATTERNS.some(p => p.test(text));
  if (!hasCompound) return []; // Single intent, let normal routing handle
  
  // Split on compound markers
  const segments = text.split(/\b(and|also|plus|but also)\b/i);
  
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length < 10) continue;
    
    // Detect domain for each segment
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      if (keywords.some(kw => trimmed.toLowerCase().includes(kw))) {
        intents.push({
          domain,
          text: trimmed,
          confidence: 0.7,
        });
        break;
      }
    }
  }
  
  return intents;
}

// Use in router to potentially split calls
export async function routeWithMultiIntent(
  inputText: string,
  context: VoiceRouterContext
): Promise<VoiceRouterResult[]> {
  const intents = detectMultipleIntents(inputText);
  
  if (intents.length <= 1) {
    // Single intent - normal routing
    return [await routeVoiceInput(inputText, context)];
  }
  
  // Multiple intents - route each
  const results: VoiceRouterResult[] = [];
  for (const intent of intents) {
    const result = await routeVoiceInput(intent.text, {
      ...context,
      detectedDomain: intent.domain,
    });
    results.push(result);
  }
  
  return results;
}
```

---

## 🟢 Phase 3: Outreach Integration

### 3.1 Domain Outreach Triggers

**Problem:** New life stage domains not triggering proactive outreach.

**File:** `src/services/outreach/domain-outreach-triggers.ts` (NEW)

```typescript
/**
 * Domain-Specific Outreach Triggers
 * 
 * Publishes outreach triggers when life stage domains are engaged.
 */

import { publishOutreachTrigger, publishEmotionalSupportTrigger } from './trigger-publisher.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DomainOutreachTriggers' });

// Domain → Trigger mapping
const DOMAIN_TRIGGERS: Record<string, DomainTriggerConfig> = {
  'new-parent': {
    type: 'emotional_support',
    followUpDays: 3,
    message: 'Checking in on how parenthood is going',
    persona: 'ferni',
  },
  'job-loss': {
    type: 'commitment_check',
    followUpDays: 5,
    message: 'Following up on your job search',
    persona: 'ferni',
  },
  'sobriety': {
    type: 'emotional_support',
    followUpDays: 1, // More frequent for recovery
    message: 'Recovery check-in',
    persona: 'ferni',
  },
  'infidelity': {
    type: 'emotional_support',
    followUpDays: 7,
    message: 'Checking in after our conversation',
    persona: 'ferni',
  },
  'health-diagnosis': {
    type: 'emotional_support',
    followUpDays: 7,
    message: 'Thinking about you and your health journey',
    persona: 'ferni',
  },
  // ... etc
};

/**
 * Called when a domain tool is executed
 */
export async function onDomainToolExecuted(
  userId: string,
  domain: string,
  toolId: string,
  sessionId: string
): Promise<void> {
  const config = DOMAIN_TRIGGERS[domain];
  if (!config) return;
  
  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + config.followUpDays);
  
  try {
    await publishOutreachTrigger({
      userId,
      type: config.type as 'emotional_support' | 'commitment_check',
      priority: 'medium',
      reason: config.message,
      scheduledFor: scheduledFor.toISOString(),
      sessionId,
      personaId: config.persona,
      metadata: {
        triggerDomain: domain,
        triggerTool: toolId,
      },
    });
    
    log.info({ userId, domain, followUpDays: config.followUpDays }, '📅 Domain follow-up scheduled');
  } catch (error) {
    log.warn({ error: String(error), domain }, 'Failed to schedule domain outreach');
  }
}
```

**Integration with tool execution:**

```typescript
// src/tools/semantic-router/integration/turn-processor-integration.ts

import { onDomainToolExecuted } from '../../../services/outreach/domain-outreach-triggers.js';

// After tool execution
async function afterToolExecution(
  userId: string,
  toolId: string,
  domain: string,
  sessionId: string
): Promise<void> {
  // ... existing logic ...
  
  // Schedule domain-specific outreach
  void onDomainToolExecuted(userId, domain, toolId, sessionId);
}
```

### 3.2 Superhuman → Outreach Bridge

**Problem:** Dream/capacity/values changes not triggering outreach.

**File:** `src/services/outreach/superhuman-outreach-bridge.ts` (NEW)

```typescript
/**
 * Superhuman → Outreach Bridge
 * 
 * Connects superhuman service changes to outreach triggers.
 */

import { publishOutreachTrigger } from './trigger-publisher.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SuperhumanOutreachBridge' });

// Call from dream-keeper.ts when dream goes dormant
export async function onDreamBecameDormant(
  userId: string,
  dream: { id: string; title: string; dormantDays: number }
): Promise<void> {
  if (dream.dormantDays < 30) return; // Wait at least 30 days
  
  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + 7);
  
  await publishOutreachTrigger({
    userId,
    type: 'thinking_of_you',
    priority: 'low',
    reason: `Dream "${dream.title}" hasn't been mentioned in ${dream.dormantDays} days`,
    scheduledFor: scheduledFor.toISOString(),
    personaId: 'ferni',
    metadata: { dreamId: dream.id, dreamTitle: dream.title },
  });
  
  log.info({ userId, dream: dream.title }, '💭 Dream revival outreach scheduled');
}

// Call from capacity-guardian.ts when burnout risk rises
export async function onBurnoutRiskElevated(
  userId: string,
  assessment: { risk: string; riskScore: number; recommendations: string[] }
): Promise<void> {
  if (assessment.risk !== 'high' && assessment.risk !== 'critical') return;
  
  await publishOutreachTrigger({
    userId,
    type: 'emotional_support',
    priority: assessment.risk === 'critical' ? 'urgent' : 'high',
    reason: `Burnout risk elevated to ${assessment.risk} (score: ${assessment.riskScore})`,
    scheduledFor: new Date().toISOString(), // Immediate
    personaId: 'ferni',
    metadata: { burnoutRisk: assessment.risk, recommendations: assessment.recommendations },
  });
  
  log.info({ userId, risk: assessment.risk }, '🔥 Burnout outreach triggered');
}

// Call from values-alignment.ts when values conflict detected
export async function onValuesConflictDetected(
  userId: string,
  conflict: { values: string[]; situation: string }
): Promise<void> {
  const scheduledFor = new Date();
  scheduledFor.setHours(scheduledFor.getHours() + 24); // Next day
  
  await publishOutreachTrigger({
    userId,
    type: 'thinking_of_you',
    priority: 'medium',
    reason: `Values conflict detected: ${conflict.values.join(' vs ')}`,
    scheduledFor: scheduledFor.toISOString(),
    personaId: 'nayan', // Wisdom persona for values
    metadata: { conflictingValues: conflict.values, situation: conflict.situation },
  });
  
  log.info({ userId, values: conflict.values }, '⚖️ Values reflection outreach scheduled');
}
```

---

## 🔵 Phase 4: Intelligence → Action

### 4.1 Emotion Trajectory → Tool Routing

**Problem:** Emotional trajectories not informing tool selection.

**File:** `src/tools/semantic-router/trajectory-boost.ts` (NEW)

```typescript
/**
 * Trajectory-Aware Routing Boost
 * 
 * Uses emotional trajectory data to boost relevant tools.
 */

import { getActiveArcs } from '../../services/superhuman/semantic-intelligence/emotional-trajectories.js';

export async function getTrajectoryBoosts(userId: string): Promise<TrajectoryBoost[]> {
  const arcs = await getActiveArcs(userId);
  const boosts: TrajectoryBoost[] = [];
  
  for (const arc of arcs) {
    // Rising stress → boost capacity/burnout tools
    if (arc.type === 'stress' && arc.direction === 'rising') {
      boosts.push({
        domains: ['burnout', 'capacity', 'stress', 'anxiety'],
        boost: 0.15,
        reason: `Rising stress trajectory (${arc.intensity} intensity)`,
      });
    }
    
    // Falling mood → boost depression/support tools
    if (arc.type === 'mood' && arc.direction === 'falling') {
      boosts.push({
        domains: ['depression', 'emotional-support', 'grief'],
        boost: 0.15,
        reason: `Falling mood trajectory`,
      });
    }
    
    // Recovery momentum → boost sobriety celebration tools
    if (arc.type === 'recovery' && arc.direction === 'rising') {
      boosts.push({
        domains: ['sobriety', 'celebration', 'milestones'],
        boost: 0.10,
        reason: `Positive recovery momentum`,
      });
    }
  }
  
  return boosts;
}
```

### 4.2 Relationship Graph → Outreach Timing

**Problem:** Relationship health not informing outreach timing.

**File:** `src/services/outreach/graph-timing-intelligence.ts` (NEW)

```typescript
/**
 * Graph-Aware Timing Intelligence
 * 
 * Uses relationship graph data to optimize outreach timing.
 */

import { getRelationshipGraph } from '../../services/superhuman/semantic-intelligence/relationship-graph.js';

export async function getGraphAwareTimingAdjustment(
  userId: string,
  trigger: OutreachTrigger
): Promise<TimingAdjustment> {
  const graph = await getRelationshipGraph(userId);
  
  // If outreach is about a specific person, check relationship health
  if (trigger.metadata?.personMentioned) {
    const person = graph.nodes.find(n => n.name === trigger.metadata.personMentioned);
    
    if (person) {
      // Strained relationship → more urgent outreach
      if (person.health === 'strained' || person.health === 'declining') {
        return {
          urgencyMultiplier: 1.5,
          reason: `Relationship with ${person.name} is ${person.health}`,
        };
      }
      
      // Thriving relationship → can wait
      if (person.health === 'thriving') {
        return {
          urgencyMultiplier: 0.8,
          reason: `Relationship with ${person.name} is healthy`,
        };
      }
    }
  }
  
  // Check overall social health
  const averageHealth = calculateAverageRelationshipHealth(graph);
  if (averageHealth < 0.4) {
    // User may be isolating - reach out sooner
    return {
      urgencyMultiplier: 1.3,
      reason: 'Overall relationship network health is low',
    };
  }
  
  return { urgencyMultiplier: 1.0, reason: 'Standard timing' };
}
```

---

## ✅ Validation Checklist

### Phase 1 Completion

- [ ] New domain hooks created and exported
- [ ] Indexing policy updated for all domains
- [ ] TTL cleanup job runs without errors
- [ ] Live superhuman injection detects keywords
- [ ] `pnpm audit:bth` passes

### Phase 2 Completion

- [ ] Voice emotion boosts correct domains
- [ ] Multi-intent detection splits compound requests
- [ ] Routing accuracy improved on test set

### Phase 3 Completion

- [ ] Domain tools trigger outreach
- [ ] Superhuman changes bridge to outreach
- [ ] Inbound SMS routes to agents
- [ ] Webhook signatures validated

### Phase 4 Completion

- [ ] Trajectories boost relevant tools
- [ ] Graph health affects timing
- [ ] E2E flow works for new domains

---

## 📅 Timeline

| Week | Focus | Key Deliverable |
|------|-------|-----------------|
| 1 | Phase 1 (Critical) | Domain hooks + TTL cleanup |
| 2 | Phase 1 (Critical) | Live injection |
| 3 | Phase 2 (Routing) | Emotion + multi-intent |
| 4 | Phase 3 (Outreach) | Domain triggers + bridge |
| 5 | Phase 4 (Intelligence) | Trajectory + graph timing |
| 6 | Validation | Full E2E testing |

---

*Last updated: December 2024*
