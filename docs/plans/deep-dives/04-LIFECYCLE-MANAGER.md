# Deep Dive: Memory Lifecycle Manager

> **Phase 4 Core Component**

---

## Problem Statement

Current memory is **immortal and flat**—every memory stays forever with equal importance:

```
Current State:
┌─────────────────────────────────────────────────────────────┐
│  Memory Store                                                │
│                                                              │
│  [2023] [2023] [2024] [2024] [2024] [2024] [2024] [2024]    │
│  fact   fact   fact   fact   fact   fact   fact   fact      │
│                                                              │
│  All memories equally weighted, never consolidated or pruned │
└─────────────────────────────────────────────────────────────┘
```

**Problems:**
1. **Storage bloat** - Unlimited growth
2. **Noise** - Old irrelevant memories compete with important ones
3. **No consolidation** - Similar memories stay separate
4. **No protection** - Important memories can get lost in the noise
5. **No evolution** - User's current reality not distinguished from past

**Human memory works differently:**
- Important memories get **reinforced**
- Rarely accessed memories **fade**
- Similar memories **merge** into schemas
- Emotional memories are **protected**
- Recent memories are **more accessible**

---

## Solution: Memory Lifecycle Manager

```
┌─────────────────────────────────────────────────────────────┐
│                 MEMORY LIFECYCLE MANAGER                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐                                       │
│  │   CONSOLIDATION  │  Similar memories → Single schema     │
│  │   Engine         │  Duplicates → Merged                  │
│  └────────┬─────────┘  Events → Patterns                    │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │     DECAY        │  Unreinforced memories fade           │
│  │     Engine       │  Based on: age, access, emotion       │
│  └────────┬─────────┘                                       │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │  REINFORCEMENT   │  Accessed memories strengthened       │
│  │     Engine       │  Emotional weight preserved           │
│  └────────┬─────────┘                                       │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │   PROTECTION     │  Important memories immune to decay   │
│  │     Engine       │  Core identity protected              │
│  └──────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Consolidation Engine

Merges similar memories into coherent schemas:

```typescript
// src/memory/lifecycle/consolidation-engine.ts

import type { UnifiedMemoryStore, StoredMemory } from '../unified-store/types.js';
import type { MemoryGraphStore } from '../graph/graph-store.js';
import { cosineSimilarity } from '../../utils/math.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConsolidationEngine' });

export interface ConsolidationConfig {
  // Similarity threshold for considering merge
  similarityThreshold: number;
  
  // Minimum memories to form a pattern
  minPatternSize: number;
  
  // Maximum age difference (days) for temporal consolidation
  maxAgeDifferenceForMerge: number;
  
  // How often to run (ms)
  runIntervalMs: number;
  
  // Batch size per run
  batchSize: number;
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  similarityThreshold: 0.85,
  minPatternSize: 3,
  maxAgeDifferenceForMerge: 30,
  runIntervalMs: 24 * 60 * 60 * 1000, // Daily
  batchSize: 100,
};

export interface ConsolidationReport {
  userId: string;
  runAt: Date;
  
  memoriesProcessed: number;
  duplicatesMerged: number;
  patternsFormed: number;
  
  actions: ConsolidationAction[];
}

export interface ConsolidationAction {
  type: 'merge' | 'pattern' | 'archive';
  sourceIds: string[];
  resultId?: string;
  reason: string;
}

export class ConsolidationEngine {
  private config: ConsolidationConfig;
  
  constructor(
    private store: UnifiedMemoryStore,
    private graphStore: MemoryGraphStore,
    config?: Partial<ConsolidationConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Run consolidation for a user
   */
  async consolidate(userId: string): Promise<ConsolidationReport> {
    const startTime = Date.now();
    const report: ConsolidationReport = {
      userId,
      runAt: new Date(),
      memoriesProcessed: 0,
      duplicatesMerged: 0,
      patternsFormed: 0,
      actions: [],
    };
    
    try {
      // 1. Get user's memories (batch)
      const { memories } = await this.store.recall({
        userId,
        limit: this.config.batchSize,
        // Prioritize older memories that haven't been consolidated
      });
      
      report.memoriesProcessed = memories.length;
      
      // 2. Find and merge duplicates
      const duplicateActions = await this.findAndMergeDuplicates(userId, memories);
      report.actions.push(...duplicateActions);
      report.duplicatesMerged = duplicateActions.length;
      
      // 3. Find and create patterns
      const patternActions = await this.findAndCreatePatterns(userId, memories);
      report.actions.push(...patternActions);
      report.patternsFormed = patternActions.length;
      
      log.info({
        userId,
        duration: Date.now() - startTime,
        ...report,
      }, 'Consolidation completed');
      
      return report;
      
    } catch (error) {
      log.error({ error: String(error), userId }, 'Consolidation failed');
      throw error;
    }
  }
  
  // ============================================
  // DUPLICATE MERGING
  // ============================================
  
  private async findAndMergeDuplicates(
    userId: string,
    memories: StoredMemory[]
  ): Promise<ConsolidationAction[]> {
    const actions: ConsolidationAction[] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < memories.length; i++) {
      const m1 = memories[i];
      if (processed.has(m1.id)) continue;
      
      const duplicates: StoredMemory[] = [m1];
      
      for (let j = i + 1; j < memories.length; j++) {
        const m2 = memories[j];
        if (processed.has(m2.id)) continue;
        
        // Check similarity
        const similarity = cosineSimilarity(m1.embedding, m2.embedding);
        
        if (similarity >= this.config.similarityThreshold) {
          // Additional check: same type?
          if (m1.type === m2.type) {
            duplicates.push(m2);
          }
        }
      }
      
      // If duplicates found, merge them
      if (duplicates.length > 1) {
        const action = await this.mergeDuplicates(userId, duplicates);
        actions.push(action);
        
        // Mark all as processed
        for (const dup of duplicates) {
          processed.add(dup.id);
        }
      }
    }
    
    return actions;
  }
  
  private async mergeDuplicates(
    userId: string,
    duplicates: StoredMemory[]
  ): Promise<ConsolidationAction> {
    // Sort by: emotional weight (desc), then access count (desc)
    duplicates.sort((a, b) => {
      if (b.emotionalWeight !== a.emotionalWeight) {
        return b.emotionalWeight - a.emotionalWeight;
      }
      return b.accessCount - a.accessCount;
    });
    
    // Keep the best one, merge metadata from others
    const primary = duplicates[0];
    const others = duplicates.slice(1);
    
    // Merge persons mentioned
    const allPersons = new Set<string>();
    for (const dup of duplicates) {
      for (const person of dup.metadata.persons ?? []) {
        allPersons.add(person);
      }
    }
    
    // Update primary with merged data
    await this.store.update(primary.id, {
      metadata: {
        ...primary.metadata,
        persons: Array.from(allPersons),
        consolidatedFrom: others.map(o => o.id),
        consolidatedAt: new Date().toISOString(),
      },
    });
    
    // Sum access counts
    const totalAccess = duplicates.reduce((sum, d) => sum + d.accessCount, 0);
    // (Would need store method to update accessCount directly)
    
    // Transfer links from others to primary
    for (const other of others) {
      await this.transferLinks(userId, other.id, primary.id);
    }
    
    // Delete duplicates (soft delete - mark as archived)
    for (const other of others) {
      await this.archiveMemory(userId, other.id, `Merged into ${primary.id}`);
    }
    
    return {
      type: 'merge',
      sourceIds: duplicates.map(d => d.id),
      resultId: primary.id,
      reason: `Merged ${duplicates.length} similar memories`,
    };
  }
  
  // ============================================
  // PATTERN FORMATION
  // ============================================
  
  private async findAndCreatePatterns(
    userId: string,
    memories: StoredMemory[]
  ): Promise<ConsolidationAction[]> {
    const actions: ConsolidationAction[] = [];
    
    // Group by topic
    const byTopic = new Map<string, StoredMemory[]>();
    for (const memory of memories) {
      const topic = memory.metadata.topic ?? 'general';
      if (!byTopic.has(topic)) {
        byTopic.set(topic, []);
      }
      byTopic.get(topic)!.push(memory);
    }
    
    // Find topics with enough memories to form patterns
    for (const [topic, topicMemories] of byTopic) {
      // Filter to same type
      const byType = new Map<string, StoredMemory[]>();
      for (const m of topicMemories) {
        if (!byType.has(m.type)) {
          byType.set(m.type, []);
        }
        byType.get(m.type)!.push(m);
      }
      
      // Check for pattern-worthy clusters
      for (const [type, typeMemories] of byType) {
        if (typeMemories.length >= this.config.minPatternSize) {
          // Check if pattern already exists
          const existingPattern = await this.findExistingPattern(userId, topic, type);
          
          if (!existingPattern) {
            const action = await this.createPattern(userId, topic, type, typeMemories);
            if (action) {
              actions.push(action);
            }
          }
        }
      }
    }
    
    return actions;
  }
  
  private async findExistingPattern(
    userId: string,
    topic: string,
    sourceType: string
  ): Promise<StoredMemory | null> {
    const { memories } = await this.store.recall({
      userId,
      query: `pattern ${topic} ${sourceType}`,
      types: ['pattern'],
      limit: 1,
    });
    
    return memories.length > 0 ? memories[0] : null;
  }
  
  private async createPattern(
    userId: string,
    topic: string,
    sourceType: string,
    sourceMemories: StoredMemory[]
  ): Promise<ConsolidationAction | null> {
    // Synthesize pattern content
    const contents = sourceMemories.map(m => m.content);
    const synthesized = await this.synthesizePattern(contents, topic);
    
    if (!synthesized) return null;
    
    // Create pattern memory
    const patternMemory = await this.store.store({
      userId,
      content: synthesized,
      type: 'pattern',
      metadata: {
        topic,
        source: 'consolidation',
        sourceType,
        sourceMemoryIds: sourceMemories.map(m => m.id),
        sourceCount: sourceMemories.length,
      },
    });
    
    // Link pattern to source memories
    for (const source of sourceMemories) {
      await this.graphStore.createLink(
        userId,
        patternMemory.id,
        source.id,
        'narrative',
        {
          weight: 0.8,
          evidence: 'Pattern formed from similar memories',
          detectedBy: 'auto',
        }
      );
    }
    
    return {
      type: 'pattern',
      sourceIds: sourceMemories.map(m => m.id),
      resultId: patternMemory.id,
      reason: `Pattern formed from ${sourceMemories.length} ${sourceType} memories about ${topic}`,
    };
  }
  
  private async synthesizePattern(contents: string[], topic: string): Promise<string | null> {
    // Use LLM to synthesize pattern
    // For now, simple approach
    if (contents.length < 3) return null;
    
    // In production, call LLM:
    // "Synthesize these related memories into a single pattern statement: ..."
    
    // Placeholder: use most common words
    const words = contents.join(' ').toLowerCase().split(/\W+/);
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      if (word.length > 4) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }
    
    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    return `Pattern observed: ${topic} - involving ${topWords.join(', ')}`;
  }
  
  // ============================================
  // HELPERS
  // ============================================
  
  private async transferLinks(
    userId: string,
    fromId: string,
    toId: string
  ): Promise<void> {
    const links = await this.graphStore.getLinks(userId, {
      memoryId: fromId,
      direction: 'both',
    });
    
    for (const link of links) {
      // Skip if linking to itself
      const otherId = link.sourceId === fromId ? link.targetId : link.sourceId;
      if (otherId === toId) continue;
      
      // Create new link to target
      await this.graphStore.createLink(
        userId,
        toId,
        otherId,
        link.type,
        {
          weight: link.weight,
          evidence: `Transferred from merged memory ${fromId}`,
          detectedBy: 'auto',
        }
      );
    }
    
    // Delete old links
    for (const link of links) {
      await this.graphStore.deleteLink(userId, link.id);
    }
  }
  
  private async archiveMemory(
    userId: string,
    memoryId: string,
    reason: string
  ): Promise<void> {
    // Mark as archived instead of delete
    await this.store.update(memoryId, {
      metadata: {
        archived: true,
        archivedAt: new Date().toISOString(),
        archiveReason: reason,
      },
    });
  }
}
```

---

## 2. Decay Engine

Memories fade over time without reinforcement:

```typescript
// src/memory/lifecycle/decay-engine.ts

import type { UnifiedMemoryStore, StoredMemory } from '../unified-store/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DecayEngine' });

export interface DecayConfig {
  // Base decay rate per day (0-1)
  baseDecayRate: number;
  
  // Factors that reduce decay
  emotionalProtectionFactor: number;  // High emotion = slower decay
  accessBoostFactor: number;          // High access = slower decay
  recentAccessWindow: number;         // Days - recent access = no decay
  
  // Protection rules
  protectedTypes: string[];           // Memory types that never decay
  minEmotionalWeightForProtection: number;
  
  // Archival threshold
  archiveThreshold: number;           // Decay score above this = archive
  
  // Batch processing
  batchSize: number;
}

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  baseDecayRate: 0.02,               // 2% per day base
  emotionalProtectionFactor: 0.5,    // High emotion = 50% slower
  accessBoostFactor: 0.3,            // Frequent access = 30% slower
  recentAccessWindow: 7,             // No decay for 7 days after access
  protectedTypes: ['commitment', 'relationship'],
  minEmotionalWeightForProtection: 0.8,
  archiveThreshold: 0.9,             // Archive at 90% decay
  batchSize: 100,
};

export interface DecayReport {
  userId: string;
  runAt: Date;
  
  memoriesProcessed: number;
  memoriesDecayed: number;
  memoriesArchived: number;
  memoriesProtected: number;
  
  avgDecayApplied: number;
}

export class DecayEngine {
  private config: DecayConfig;
  
  constructor(
    private store: UnifiedMemoryStore,
    config?: Partial<DecayConfig>
  ) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }
  
  /**
   * Apply decay to a user's memories
   */
  async applyDecay(userId: string): Promise<DecayReport> {
    const report: DecayReport = {
      userId,
      runAt: new Date(),
      memoriesProcessed: 0,
      memoriesDecayed: 0,
      memoriesArchived: 0,
      memoriesProtected: 0,
      avgDecayApplied: 0,
    };
    
    let totalDecay = 0;
    let offset = 0;
    
    while (true) {
      // Get batch of memories
      const { memories } = await this.store.recall({
        userId,
        limit: this.config.batchSize,
        // Would need offset support
      });
      
      if (memories.length === 0) break;
      
      for (const memory of memories) {
        report.memoriesProcessed++;
        
        // Check if protected
        if (this.isProtected(memory)) {
          report.memoriesProtected++;
          continue;
        }
        
        // Calculate decay
        const decayAmount = this.calculateDecay(memory);
        
        if (decayAmount > 0) {
          const newDecayScore = Math.min(1.0, memory.decayScore + decayAmount);
          totalDecay += decayAmount;
          report.memoriesDecayed++;
          
          // Check if should archive
          if (newDecayScore >= this.config.archiveThreshold) {
            await this.archiveDecayed(userId, memory.id, newDecayScore);
            report.memoriesArchived++;
          } else {
            // Update decay score
            await this.store.update(memory.id, {
              // decayScore: newDecayScore, // Would need this field
            });
          }
        }
      }
      
      offset += this.config.batchSize;
      
      // Prevent infinite loop - in practice, use cursor-based pagination
      if (offset > 10000) break;
    }
    
    report.avgDecayApplied = report.memoriesDecayed > 0 
      ? totalDecay / report.memoriesDecayed 
      : 0;
    
    log.info(report, 'Decay run completed');
    
    return report;
  }
  
  /**
   * Check if memory is protected from decay
   */
  private isProtected(memory: StoredMemory): boolean {
    // Protected types
    if (this.config.protectedTypes.includes(memory.type)) {
      return true;
    }
    
    // High emotional weight
    if (memory.emotionalWeight >= this.config.minEmotionalWeightForProtection) {
      return true;
    }
    
    // Recent access
    const daysSinceAccess = this.daysSince(memory.lastAccessedAt);
    if (daysSinceAccess <= this.config.recentAccessWindow) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate decay amount for a memory
   */
  private calculateDecay(memory: StoredMemory): number {
    const daysSinceCreation = this.daysSince(memory.createdAt);
    const daysSinceAccess = this.daysSince(memory.lastAccessedAt);
    
    // Start with base decay
    let decay = this.config.baseDecayRate;
    
    // Reduce decay based on emotional weight
    decay *= (1 - memory.emotionalWeight * this.config.emotionalProtectionFactor);
    
    // Reduce decay based on access frequency
    const accessRate = memory.accessCount / Math.max(1, daysSinceCreation);
    decay *= (1 - Math.min(1, accessRate * 10) * this.config.accessBoostFactor);
    
    // Scale by days since last access
    decay *= Math.max(0, daysSinceAccess - this.config.recentAccessWindow) / 30;
    
    return Math.max(0, decay);
  }
  
  private async archiveDecayed(
    userId: string,
    memoryId: string,
    finalDecayScore: number
  ): Promise<void> {
    await this.store.update(memoryId, {
      metadata: {
        archived: true,
        archivedAt: new Date().toISOString(),
        archiveReason: `Decayed to ${(finalDecayScore * 100).toFixed(0)}%`,
      },
    });
  }
  
  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }
}
```

---

## 3. Reinforcement Engine

Strengthen memories on access:

```typescript
// src/memory/lifecycle/reinforcement-engine.ts

import type { UnifiedMemoryStore, StoredMemory } from '../unified-store/types.js';
import type { MemoryGraphStore } from '../graph/graph-store.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReinforcementEngine' });

export interface ReinforcementConfig {
  // How much decay is removed on access
  decayReductionOnAccess: number;
  
  // Minimum time between reinforcements (prevents spam)
  minReinforcementIntervalMs: number;
  
  // Boost for linked memories (spread reinforcement)
  linkedMemoryBoost: number;
  
  // Emotional boost
  emotionalBoostFactor: number;
}

const DEFAULT_REINFORCEMENT_CONFIG: ReinforcementConfig = {
  decayReductionOnAccess: 0.2,    // Remove 20% decay on access
  minReinforcementIntervalMs: 60 * 1000,  // Max once per minute
  linkedMemoryBoost: 0.5,         // Linked memories get 50% of boost
  emotionalBoostFactor: 1.5,      // Emotional memories get 50% more boost
};

export class ReinforcementEngine {
  private config: ReinforcementConfig;
  private recentReinforcements = new Map<string, number>();
  
  constructor(
    private store: UnifiedMemoryStore,
    private graphStore: MemoryGraphStore,
    config?: Partial<ReinforcementConfig>
  ) {
    this.config = { ...DEFAULT_REINFORCEMENT_CONFIG, ...config };
  }
  
  /**
   * Reinforce a memory (called when accessed/recalled)
   */
  async reinforce(userId: string, memoryId: string): Promise<void> {
    // Check rate limit
    const lastReinforcement = this.recentReinforcements.get(memoryId);
    if (lastReinforcement && 
        Date.now() - lastReinforcement < this.config.minReinforcementIntervalMs) {
      return;
    }
    
    // Get memory
    const memory = await this.store.get(memoryId);
    if (!memory) return;
    
    // Calculate reinforcement strength
    let reduction = this.config.decayReductionOnAccess;
    
    // Boost for emotional memories
    if (memory.emotionalWeight > 0.5) {
      reduction *= this.config.emotionalBoostFactor;
    }
    
    // Apply reduction
    const newDecayScore = Math.max(0, memory.decayScore - reduction);
    
    // Update memory
    await this.store.update(memoryId, {
      // lastAccessedAt: new Date(),
      // accessCount: memory.accessCount + 1,
      // decayScore: newDecayScore,
    });
    
    // Also reinforce directly linked memories (weaker)
    await this.reinforceLinked(userId, memoryId, reduction * this.config.linkedMemoryBoost);
    
    // Track reinforcement
    this.recentReinforcements.set(memoryId, Date.now());
    
    log.debug({
      memoryId,
      userId,
      decayReduction: reduction,
      newDecayScore,
    }, 'Memory reinforced');
  }
  
  /**
   * Reinforce multiple memories at once
   */
  async reinforceBatch(userId: string, memoryIds: string[]): Promise<void> {
    await Promise.all(
      memoryIds.map(id => this.reinforce(userId, id))
    );
  }
  
  /**
   * Spread reinforcement to linked memories
   */
  private async reinforceLinked(
    userId: string,
    memoryId: string,
    boostAmount: number
  ): Promise<void> {
    if (boostAmount < 0.01) return;  // Too small to matter
    
    // Get directly linked memories
    const links = await this.graphStore.getLinks(userId, {
      memoryId,
      direction: 'both',
      limit: 5,  // Limit spread
    });
    
    for (const link of links) {
      const linkedId = link.sourceId === memoryId ? link.targetId : link.sourceId;
      
      // Weight boost by link strength
      const weightedBoost = boostAmount * link.weight;
      
      if (weightedBoost >= 0.01) {
        const linkedMemory = await this.store.get(linkedId);
        if (linkedMemory) {
          const newDecayScore = Math.max(0, linkedMemory.decayScore - weightedBoost);
          await this.store.update(linkedId, {
            // decayScore: newDecayScore,
          });
        }
      }
    }
  }
}
```

---

## 4. Protection Engine

Mark important memories as protected:

```typescript
// src/memory/lifecycle/protection-engine.ts

import type { UnifiedMemoryStore, StoredMemory } from '../unified-store/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ProtectionEngine' });

export type ProtectionLevel = 'none' | 'standard' | 'important' | 'core';

export interface ProtectionRules {
  // Auto-protection rules
  autoProtectHighEmotion: boolean;
  emotionThreshold: number;
  
  autoProtectCommitments: boolean;
  autoProtectRelationships: boolean;
  autoProtectMilestones: boolean;
  
  // Manual protection
  maxManualProtected: number;
  
  // Core identity
  coreIdentityKeywords: string[];
}

const DEFAULT_RULES: ProtectionRules = {
  autoProtectHighEmotion: true,
  emotionThreshold: 0.85,
  autoProtectCommitments: true,
  autoProtectRelationships: true,
  autoProtectMilestones: true,
  maxManualProtected: 100,
  coreIdentityKeywords: [
    'identity', 'values', 'beliefs', 'who i am',
    'important to me', 'never forget', 'core',
  ],
};

export class ProtectionEngine {
  private rules: ProtectionRules;
  
  constructor(
    private store: UnifiedMemoryStore,
    rules?: Partial<ProtectionRules>
  ) {
    this.rules = { ...DEFAULT_RULES, ...rules };
  }
  
  /**
   * Determine protection level for a memory
   */
  determineProtection(memory: StoredMemory): ProtectionLevel {
    // Core identity (highest protection)
    if (this.isCoreIdentity(memory)) {
      return 'core';
    }
    
    // Important memories
    if (this.isImportant(memory)) {
      return 'important';
    }
    
    // Standard protection
    if (this.shouldProtect(memory)) {
      return 'standard';
    }
    
    return 'none';
  }
  
  /**
   * Apply protection to a memory
   */
  async protect(memoryId: string, level: ProtectionLevel): Promise<void> {
    await this.store.update(memoryId, {
      metadata: {
        protectionLevel: level,
        protectedAt: new Date().toISOString(),
      },
    });
    
    log.debug({ memoryId, level }, 'Memory protection applied');
  }
  
  /**
   * Scan and auto-protect memories
   */
  async scanAndProtect(userId: string): Promise<{ protected: number; byLevel: Record<ProtectionLevel, number> }> {
    const { memories } = await this.store.recall({
      userId,
      limit: 500, // Batch size
    });
    
    const stats = {
      protected: 0,
      byLevel: {
        none: 0,
        standard: 0,
        important: 0,
        core: 0,
      } as Record<ProtectionLevel, number>,
    };
    
    for (const memory of memories) {
      const level = this.determineProtection(memory);
      stats.byLevel[level]++;
      
      if (level !== 'none') {
        await this.protect(memory.id, level);
        stats.protected++;
      }
    }
    
    return stats;
  }
  
  private isCoreIdentity(memory: StoredMemory): boolean {
    const content = memory.content.toLowerCase();
    
    return this.rules.coreIdentityKeywords.some(keyword => 
      content.includes(keyword)
    );
  }
  
  private isImportant(memory: StoredMemory): boolean {
    // High emotional weight
    if (this.rules.autoProtectHighEmotion && 
        memory.emotionalWeight >= this.rules.emotionThreshold) {
      return true;
    }
    
    // Frequently accessed
    if (memory.accessCount >= 10) {
      return true;
    }
    
    return false;
  }
  
  private shouldProtect(memory: StoredMemory): boolean {
    // Commitments
    if (this.rules.autoProtectCommitments && memory.type === 'commitment') {
      return true;
    }
    
    // Relationships
    if (this.rules.autoProtectRelationships && memory.type === 'relationship') {
      return true;
    }
    
    // Milestones/events with high emotion
    if (this.rules.autoProtectMilestones && 
        memory.type === 'event' && 
        memory.emotionalWeight >= 0.6) {
      return true;
    }
    
    return false;
  }
}
```

---

## 5. Lifecycle Manager (Orchestrator)

Coordinates all lifecycle operations:

```typescript
// src/memory/lifecycle/lifecycle-manager.ts

import { ConsolidationEngine, ConsolidationReport } from './consolidation-engine.js';
import { DecayEngine, DecayReport } from './decay-engine.js';
import { ReinforcementEngine } from './reinforcement-engine.js';
import { ProtectionEngine, ProtectionLevel } from './protection-engine.js';
import type { UnifiedMemoryStore, StoredMemory } from '../unified-store/types.js';
import type { MemoryGraphStore } from '../graph/graph-store.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LifecycleManager' });

export interface LifecycleConfig {
  // Run schedules (cron-like)
  consolidationSchedule: string;  // e.g., "0 2 * * *" (2 AM daily)
  decaySchedule: string;          // e.g., "0 3 * * *" (3 AM daily)
  protectionScanSchedule: string; // e.g., "0 4 * * 0" (4 AM weekly)
  
  // Feature flags
  enableConsolidation: boolean;
  enableDecay: boolean;
  enableProtection: boolean;
}

const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  consolidationSchedule: '0 2 * * *',
  decaySchedule: '0 3 * * *',
  protectionScanSchedule: '0 4 * * 0',
  enableConsolidation: true,
  enableDecay: true,
  enableProtection: true,
};

export interface LifecycleReport {
  userId: string;
  runAt: Date;
  duration: number;
  
  consolidation?: ConsolidationReport;
  decay?: DecayReport;
  protection?: { protected: number };
}

export class MemoryLifecycleManager {
  private consolidation: ConsolidationEngine;
  private decay: DecayEngine;
  private reinforcement: ReinforcementEngine;
  private protection: ProtectionEngine;
  private config: LifecycleConfig;
  
  constructor(
    private store: UnifiedMemoryStore,
    private graphStore: MemoryGraphStore,
    config?: Partial<LifecycleConfig>
  ) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    
    this.consolidation = new ConsolidationEngine(store, graphStore);
    this.decay = new DecayEngine(store);
    this.reinforcement = new ReinforcementEngine(store, graphStore);
    this.protection = new ProtectionEngine(store);
  }
  
  // ============================================
  // MAIN ENTRY POINTS
  // ============================================
  
  /**
   * Run full lifecycle maintenance for a user
   */
  async runMaintenance(userId: string): Promise<LifecycleReport> {
    const startTime = Date.now();
    const report: LifecycleReport = {
      userId,
      runAt: new Date(),
      duration: 0,
    };
    
    try {
      // 1. Run protection scan first (protects memories from decay)
      if (this.config.enableProtection) {
        const protectionResult = await this.protection.scanAndProtect(userId);
        report.protection = { protected: protectionResult.protected };
      }
      
      // 2. Run decay (respects protection)
      if (this.config.enableDecay) {
        report.decay = await this.decay.applyDecay(userId);
      }
      
      // 3. Run consolidation
      if (this.config.enableConsolidation) {
        report.consolidation = await this.consolidation.consolidate(userId);
      }
      
      report.duration = Date.now() - startTime;
      
      log.info(report, 'Lifecycle maintenance completed');
      
      return report;
      
    } catch (error) {
      log.error({ error: String(error), userId }, 'Lifecycle maintenance failed');
      report.duration = Date.now() - startTime;
      return report;
    }
  }
  
  /**
   * Called when a memory is accessed
   */
  async onMemoryAccess(userId: string, memoryId: string): Promise<void> {
    await this.reinforcement.reinforce(userId, memoryId);
  }
  
  /**
   * Called when a new memory is created
   */
  async onMemoryCreated(userId: string, memory: StoredMemory): Promise<void> {
    // Determine initial protection level
    const level = this.protection.determineProtection(memory);
    
    if (level !== 'none') {
      await this.protection.protect(memory.id, level);
    }
  }
  
  /**
   * Manual protection request from user
   */
  async protectMemory(
    memoryId: string,
    level: ProtectionLevel = 'important'
  ): Promise<void> {
    await this.protection.protect(memoryId, level);
  }
  
  // ============================================
  // SCHEDULED JOBS
  // ============================================
  
  /**
   * Start scheduled maintenance jobs
   */
  startScheduler(): void {
    // In production, use node-cron or similar
    // This is a simplified version
    
    log.info('Lifecycle scheduler started');
    
    // Run decay daily at 3 AM
    setInterval(() => {
      const hour = new Date().getHours();
      if (hour === 3 && this.config.enableDecay) {
        this.runGlobalDecay();
      }
    }, 60 * 60 * 1000);  // Check hourly
    
    // Run consolidation daily at 2 AM
    setInterval(() => {
      const hour = new Date().getHours();
      if (hour === 2 && this.config.enableConsolidation) {
        this.runGlobalConsolidation();
      }
    }, 60 * 60 * 1000);
  }
  
  private async runGlobalDecay(): Promise<void> {
    // Would need to iterate over all users
    log.info('Starting global decay run');
    // Implementation depends on user enumeration capability
  }
  
  private async runGlobalConsolidation(): Promise<void> {
    log.info('Starting global consolidation run');
    // Implementation depends on user enumeration capability
  }
}

// ============================================
// FACTORY
// ============================================

let instance: MemoryLifecycleManager | null = null;

export function getLifecycleManager(
  store?: UnifiedMemoryStore,
  graphStore?: MemoryGraphStore
): MemoryLifecycleManager {
  if (!instance && store && graphStore) {
    instance = new MemoryLifecycleManager(store, graphStore);
  }
  if (!instance) {
    throw new Error('LifecycleManager not initialized');
  }
  return instance;
}
```

---

## Integration Points

### With Memory Intelligence Layer

```typescript
// In memory intelligence - after surfacing memories
const surfacedIds = response.surfaced.map(s => s.memory.id);
await lifecycleManager.onMemoryAccess(userId, surfacedIds);
```

### With Store Operations

```typescript
// In unified store - after creating memory
const memory = await this.storeInternal(input);
await lifecycleManager.onMemoryCreated(userId, memory);
return memory;
```

### With Tools

```typescript
// In memory tools
export const protectMemory: ToolDefinition = {
  name: 'protectMemory',
  description: 'Mark a memory as important so it won\'t be forgotten',
  handler: async ({ memoryId, level }) => {
    await lifecycleManager.protectMemory(memoryId, level);
    return { success: true };
  },
};
```

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Storage growth rate | Unbounded | <5% monthly |
| Duplicate memories | ~20% | <5% |
| Patterns identified | 0 | >1 per 50 memories |
| Protected memories | 0% | 10-20% |
| Archived (decayed) | 0% | 5-15% annually |
| User memory satisfaction | N/A | >4.0/5 |

---

*Next: [05-TOOL-INTEGRATION.md](./05-TOOL-INTEGRATION.md)*
