# Deep Dive: Tool & Router Integration

> **Phase 5 Core Component**

---

## Problem Statement

Memory tools and semantic router exist in isolation:

```
Current State:
┌─────────────────────────────────────────────────────────────┐
│                      TOOL LAYER                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ recallMemory │  │ rememberFact │  │ predictNeed  │      │
│  │    Tool      │  │    Tool      │  │    Tool      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│                           ▼                                 │
│                  ┌────────────────┐                         │
│                  │  Vector Store  │  ← Direct access,       │
│                  │  (Isolated)    │    no intelligence      │
│                  └────────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    SEMANTIC ROUTER                           │
│                                                              │
│  Pattern matching → Keyword scoring → Tool selection        │
│                                                              │
│  (No awareness of user history, memory, or context)         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Problems:**
1. Tools bypass intelligence layers
2. Router has no memory awareness
3. No context carries between operations
4. Tool selection doesn't consider user patterns
5. Memory operations are stateless

---

## Solution: Unified Integration Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRATED SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Memory-Aware Semantic Router               │   │
│  │                                                       │   │
│  │  • Pattern matching + keyword scoring                │   │
│  │  • User history boost                                │   │
│  │  • Recent context awareness                          │   │
│  │  • Tool success rate tracking                        │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Memory-Native Tools                      │   │
│  │                                                       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │  recall    │  │  remember  │  │  surface   │     │   │
│  │  │  Enhanced  │  │  Enhanced  │  │  Enhanced  │     │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │   │
│  │        │               │               │             │   │
│  │        └───────────────┼───────────────┘             │   │
│  │                        │                              │   │
│  └────────────────────────┼──────────────────────────────┘   │
│                           │                                   │
│                           ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Memory Intelligence Layer                   │   │
│  │                                                       │   │
│  │  Timing → Selection → Phrasing → Learning            │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Unified Memory Store                    │   │
│  │                                                       │   │
│  │  Firestore + Vector + Cache + Graph                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Memory-Native Tools

Tools that operate through the intelligence layer:

```typescript
// src/tools/domains/memory/enhanced-memory-tools.ts

import { getMemoryIntelligence } from '../../../memory/intelligence/orchestrator.js';
import { getUnifiedStore } from '../../../memory/unified-store/index.js';
import { getLifecycleManager } from '../../../memory/lifecycle/lifecycle-manager.js';
import type { ToolDefinition, ToolContext } from '../../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EnhancedMemoryTools' });

// ============================================
// ENHANCED RECALL TOOL
// ============================================

export const enhancedRecallMemory: ToolDefinition = {
  name: 'recallMemory',
  description: `
    Recall relevant memories about the user.
    Use when:
    - User asks about something they mentioned before
    - You need context about their life/preferences
    - You want to show you remember them
    
    The system will automatically:
    - Select the most relevant memories
    - Decide IF this is a good time to surface them
    - Phrase them naturally for the conversation
    - Learn from user reactions
  `,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to recall - be specific (e.g., "their career goals", "recent struggles")',
      },
      context: {
        type: 'string',
        description: 'Why you want to recall this (helps with relevance)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum memories to return (default: 3)',
        default: 3,
      },
    },
    required: ['query'],
  },
  
  handler: async (args, ctx: ToolContext) => {
    const { query, context, maxResults = 3 } = args as {
      query: string;
      context?: string;
      maxResults?: number;
    };
    
    const intelligence = getMemoryIntelligence();
    
    const response = await intelligence.getRelevantMemories({
      userId: ctx.userId,
      query,
      conversationTurn: ctx.conversationTurn ?? 0,
      recentMessages: ctx.recentMessages ?? [],
      currentTopic: context,
      emotionalState: ctx.emotionalState ?? { primary: 'neutral', confidence: 0.5 },
      emotionalIntensity: ctx.emotionalIntensity ?? 0.5,
      emotionalTrajectory: ctx.emotionalTrajectory ?? 'stable',
      personaId: ctx.personaId ?? 'ferni',
      maxResults,
    });
    
    if (response.surfaced.length === 0) {
      return {
        success: true,
        found: false,
        message: 'No relevant memories found for this query.',
      };
    }
    
    // Format for LLM consumption
    const memories = response.surfaced.map(s => ({
      content: s.memory.content,
      type: s.memory.type,
      phrase: s.phrased.text,
      relevance: s.selection.finalScore,
      timingReason: s.timing.reason,
      metadata: {
        topic: s.memory.metadata.topic,
        persons: s.memory.metadata.persons,
        createdAt: s.memory.createdAt.toISOString(),
      },
    }));
    
    return {
      success: true,
      found: true,
      count: memories.length,
      memories,
      guidance: `
        These memories were selected as relevant and appropriate to surface now.
        Use the suggested 'phrase' as inspiration for natural integration.
        The timing engine approved surfacing based on: ${response.surfaced.map(s => s.timing.reason).join(', ')}.
      `,
    };
  },
};

// ============================================
// ENHANCED REMEMBER TOOL
// ============================================

export const enhancedRememberFact: ToolDefinition = {
  name: 'rememberAboutUser',
  description: `
    Store an important fact, preference, or event about the user.
    Use when:
    - User shares something personal
    - You learn a preference
    - A significant event is mentioned
    - You want to remember something for later
    
    The system will automatically:
    - Detect duplicate/similar memories
    - Link to related memories
    - Set appropriate emotional weight
    - Protect important memories from decay
  `,
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'What to remember - be specific and include context',
      },
      type: {
        type: 'string',
        enum: ['fact', 'preference', 'event', 'emotion', 'commitment', 'relationship', 'pattern', 'insight'],
        description: 'Type of memory',
        default: 'fact',
      },
      emotionalWeight: {
        type: 'number',
        description: 'How emotionally significant (0-1)',
        default: 0.5,
      },
      persons: {
        type: 'array',
        items: { type: 'string' },
        description: 'People mentioned in this memory',
      },
      topic: {
        type: 'string',
        description: 'Topic/category (e.g., "career", "health", "family")',
      },
    },
    required: ['content'],
  },
  
  handler: async (args, ctx: ToolContext) => {
    const {
      content,
      type = 'fact',
      emotionalWeight = 0.5,
      persons,
      topic,
    } = args as {
      content: string;
      type?: string;
      emotionalWeight?: number;
      persons?: string[];
      topic?: string;
    };
    
    const store = getUnifiedStore();
    const lifecycle = getLifecycleManager();
    
    // Store with full metadata
    const memory = await store.store({
      userId: ctx.userId,
      content,
      type: type as any,
      metadata: {
        emotionalWeight,
        persons,
        topic,
        source: 'conversation',
        sessionId: ctx.sessionId,
        personaId: ctx.personaId,
      },
    });
    
    // Trigger lifecycle processing
    await lifecycle.onMemoryCreated(ctx.userId, memory);
    
    log.debug({
      memoryId: memory.id,
      userId: ctx.userId,
      type,
      topic,
    }, 'Memory stored via enhanced tool');
    
    return {
      success: true,
      memoryId: memory.id,
      type: memory.type,
      protected: memory.emotionalWeight >= 0.8,
      message: memory.emotionalWeight >= 0.8 
        ? "Got it. I'll remember this - it seems important."
        : "Noted! I'll remember this.",
    };
  },
};

// ============================================
// PROACTIVE SURFACE TOOL
// ============================================

export const proactiveSurface: ToolDefinition = {
  name: 'surfaceRelevantMemory',
  description: `
    Proactively surface a memory without explicit user request.
    Use when:
    - You notice a pattern that would be helpful to mention
    - User might benefit from remembering something
    - There's a natural connection to past conversation
    
    The system will check if this is a good time to surface
    and may decline if user is overwhelmed or not receptive.
  `,
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why you want to surface a memory now',
      },
      memoryType: {
        type: 'string',
        enum: ['commitment', 'pattern', 'relationship', 'event', 'any'],
        description: 'Type of memory to surface',
        default: 'any',
      },
    },
    required: ['reason'],
  },
  
  handler: async (args, ctx: ToolContext) => {
    const { reason, memoryType = 'any' } = args as {
      reason: string;
      memoryType?: string;
    };
    
    const intelligence = getMemoryIntelligence();
    
    const response = await intelligence.getRelevantMemories({
      userId: ctx.userId,
      query: reason,
      conversationTurn: ctx.conversationTurn ?? 0,
      recentMessages: ctx.recentMessages ?? [],
      emotionalState: ctx.emotionalState ?? { primary: 'neutral', confidence: 0.5 },
      emotionalIntensity: ctx.emotionalIntensity ?? 0.5,
      emotionalTrajectory: ctx.emotionalTrajectory ?? 'stable',
      personaId: ctx.personaId ?? 'ferni',
      maxResults: 1,
    });
    
    if (response.surfaced.length === 0) {
      // Check if we have deferred memories
      if (response.deferred.length > 0) {
        return {
          success: true,
          surfaced: false,
          reason: 'Memory found but not a good time to surface',
          deferReason: response.deferred[0].deferReason,
          suggestion: 'Try again in a few turns',
        };
      }
      
      return {
        success: true,
        surfaced: false,
        reason: 'No relevant memories found',
      };
    }
    
    const memory = response.surfaced[0];
    
    return {
      success: true,
      surfaced: true,
      memory: {
        content: memory.memory.content,
        phrase: memory.phrased.text,
        leadIn: memory.phrased.leadIn,
        followUp: memory.phrased.followUp,
      },
      timing: {
        approved: true,
        reason: memory.timing.reason,
        confidence: memory.timing.confidence,
      },
      guidance: `
        This memory has been approved for surfacing.
        Use the phrase naturally in conversation.
        ${memory.phrased.followUp ? `Consider following up with: "${memory.phrased.followUp}"` : ''}
      `,
    };
  },
};

// ============================================
// PREDICT USER NEED TOOL
// ============================================

export const predictUserNeed: ToolDefinition = {
  name: 'predictUserNeed',
  description: `
    Predict what the user might need based on patterns and history.
    Use when:
    - Starting a new session
    - User seems uncertain
    - You want to proactively help
    
    Returns predictions about:
    - Topics they might want to discuss
    - Commitments that might be relevant
    - Patterns that might be emerging
  `,
  parameters: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description: 'Current conversation context',
      },
    },
    required: [],
  },
  
  handler: async (args, ctx: ToolContext) => {
    const { context } = args as { context?: string };
    
    const store = getUnifiedStore();
    const intelligence = getMemoryIntelligence();
    
    // Get user's patterns
    const { memories: patterns } = await store.recall({
      userId: ctx.userId,
      types: ['pattern'],
      limit: 5,
      boostRecent: true,
    });
    
    // Get recent commitments
    const { memories: commitments } = await store.recall({
      userId: ctx.userId,
      types: ['commitment'],
      limit: 5,
      boostRecent: true,
    });
    
    // Get emotional history
    const { memories: emotional } = await store.recall({
      userId: ctx.userId,
      types: ['emotion'],
      limit: 3,
      boostRecent: true,
    });
    
    // Build predictions
    const predictions = {
      likelyTopics: patterns.map(p => p.metadata.topic).filter(Boolean),
      activeCommitments: commitments.map(c => ({
        content: c.content,
        age: Math.floor((Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      emotionalContext: emotional.length > 0 
        ? emotional[0].content 
        : 'No recent emotional context',
      suggestions: [] as string[],
    };
    
    // Generate suggestions
    if (commitments.length > 0) {
      predictions.suggestions.push(`Check in about: "${commitments[0].content}"`);
    }
    if (patterns.length > 0) {
      predictions.suggestions.push(`Pattern detected: ${patterns[0].content}`);
    }
    
    return {
      success: true,
      predictions,
      guidance: `
        Use these predictions to guide the conversation.
        Don't mention predictions directly - weave them naturally.
      `,
    };
  },
};

// ============================================
// TOOL DEFINITIONS EXPORT
// ============================================

export function getEnhancedMemoryToolDefinitions(): ToolDefinition[] {
  return [
    enhancedRecallMemory,
    enhancedRememberFact,
    proactiveSurface,
    predictUserNeed,
  ];
}
```

---

## 2. Memory-Aware Semantic Router

Enhance the router to consider user history:

```typescript
// src/tools/semantic-router/memory-aware-router.ts

import type { SemanticRouter, ToolMatch, RoutingContext } from './types.js';
import type { UnifiedMemoryStore } from '../../memory/unified-store/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryAwareRouter' });

export interface UserToolHistory {
  toolId: string;
  useCount: number;
  lastUsed: Date;
  successRate: number;
  avgLatency: number;
}

export interface MemoryAwareRoutingContext extends RoutingContext {
  userId: string;
  recentTopics?: string[];
  userPreferences?: {
    preferredTools?: string[];
    avoidedTools?: string[];
  };
}

export class MemoryAwareSemanticRouter {
  private baseRouter: SemanticRouter;
  private store: UnifiedMemoryStore;
  private toolHistoryCache = new Map<string, UserToolHistory[]>();
  
  constructor(baseRouter: SemanticRouter, store: UnifiedMemoryStore) {
    this.baseRouter = baseRouter;
    this.store = store;
  }
  
  /**
   * Route with memory awareness
   */
  async route(
    input: string,
    ctx: MemoryAwareRoutingContext
  ): Promise<ToolMatch[]> {
    // 1. Get base routing results
    const baseMatches = await this.baseRouter.route(input, ctx);
    
    // 2. Get user's tool history
    const toolHistory = await this.getToolHistory(ctx.userId);
    
    // 3. Get user's recent memories for context boost
    const recentMemories = await this.getRecentMemoryContext(ctx.userId);
    
    // 4. Adjust scores based on history
    const adjusted = this.adjustScores(baseMatches, toolHistory, recentMemories, ctx);
    
    // 5. Re-sort by adjusted score
    adjusted.sort((a, b) => b.score - a.score);
    
    log.debug({
      userId: ctx.userId,
      input: input.slice(0, 50),
      topMatch: adjusted[0]?.toolId,
      adjustments: adjusted.slice(0, 3).map(m => ({
        tool: m.toolId,
        baseScore: baseMatches.find(b => b.toolId === m.toolId)?.score ?? 0,
        adjustedScore: m.score,
      })),
    }, 'Memory-aware routing completed');
    
    return adjusted;
  }
  
  // ============================================
  // SCORE ADJUSTMENTS
  // ============================================
  
  private adjustScores(
    matches: ToolMatch[],
    history: UserToolHistory[],
    recentMemories: { topic: string; weight: number }[],
    ctx: MemoryAwareRoutingContext
  ): ToolMatch[] {
    const historyMap = new Map(history.map(h => [h.toolId, h]));
    const topicMap = new Map(recentMemories.map(m => [m.topic, m.weight]));
    
    return matches.map(match => {
      let score = match.score;
      const reasons: string[] = [];
      
      // History boost: tools user has used successfully
      const toolHistory = historyMap.get(match.toolId);
      if (toolHistory) {
        const historyBoost = this.calculateHistoryBoost(toolHistory);
        if (historyBoost > 0) {
          score *= (1 + historyBoost);
          reasons.push(`history_boost:${historyBoost.toFixed(2)}`);
        }
      }
      
      // Topic boost: tools related to recent memory topics
      const toolTopics = this.getToolTopics(match.toolId);
      for (const topic of toolTopics) {
        const topicWeight = topicMap.get(topic);
        if (topicWeight) {
          const topicBoost = topicWeight * 0.1;  // Up to 10% boost
          score *= (1 + topicBoost);
          reasons.push(`topic_boost:${topic}`);
        }
      }
      
      // Preference boost/penalty
      if (ctx.userPreferences?.preferredTools?.includes(match.toolId)) {
        score *= 1.15;  // 15% boost
        reasons.push('user_preferred');
      }
      if (ctx.userPreferences?.avoidedTools?.includes(match.toolId)) {
        score *= 0.5;  // 50% penalty
        reasons.push('user_avoided');
      }
      
      return {
        ...match,
        score,
        metadata: {
          ...match.metadata,
          adjustmentReasons: reasons,
        },
      };
    });
  }
  
  private calculateHistoryBoost(history: UserToolHistory): number {
    // Consider: recency, frequency, success rate
    const daysSinceUse = (Date.now() - history.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.max(0, 1 - daysSinceUse / 30);  // Decays over 30 days
    
    const frequencyFactor = Math.min(1, history.useCount / 10);  // Max at 10 uses
    
    const successFactor = history.successRate;  // 0-1
    
    // Weighted combination
    return (recencyFactor * 0.3 + frequencyFactor * 0.3 + successFactor * 0.4) * 0.2;  // Max 20% boost
  }
  
  private getToolTopics(toolId: string): string[] {
    // Map tools to topics
    const toolTopicMap: Record<string, string[]> = {
      'recallMemory': ['memory', 'past', 'remember'],
      'playMusic': ['music', 'mood', 'entertainment'],
      'setReminder': ['tasks', 'commitments', 'planning'],
      'processGrief': ['grief', 'loss', 'emotions'],
      'clarifyCareerGoals': ['career', 'work', 'goals'],
      // ... more mappings
    };
    
    return toolTopicMap[toolId] ?? [];
  }
  
  // ============================================
  // DATA ACCESS
  // ============================================
  
  private async getToolHistory(userId: string): Promise<UserToolHistory[]> {
    // Check cache
    const cached = this.toolHistoryCache.get(userId);
    if (cached) return cached;
    
    // Fetch from store
    const { memories } = await this.store.recall({
      userId,
      query: 'tool usage history',
      types: ['fact'],  // Tool history stored as facts
      limit: 50,
    });
    
    // Parse into history objects
    // In practice, would have dedicated tool history storage
    const history: UserToolHistory[] = [];
    
    // Cache for 5 minutes
    this.toolHistoryCache.set(userId, history);
    setTimeout(() => this.toolHistoryCache.delete(userId), 5 * 60 * 1000);
    
    return history;
  }
  
  private async getRecentMemoryContext(userId: string): Promise<{ topic: string; weight: number }[]> {
    const { memories } = await this.store.recall({
      userId,
      limit: 20,
      boostRecent: true,
    });
    
    // Aggregate topics
    const topicWeights = new Map<string, number>();
    
    for (const memory of memories) {
      const topic = memory.metadata.topic;
      if (topic) {
        const current = topicWeights.get(topic) ?? 0;
        topicWeights.set(topic, current + memory.emotionalWeight);
      }
    }
    
    // Normalize
    const total = Array.from(topicWeights.values()).reduce((a, b) => a + b, 0);
    
    return Array.from(topicWeights.entries()).map(([topic, weight]) => ({
      topic,
      weight: total > 0 ? weight / total : 0,
    }));
  }
  
  // ============================================
  // LEARNING
  // ============================================
  
  /**
   * Record tool usage for learning
   */
  async recordToolUsage(
    userId: string,
    toolId: string,
    success: boolean,
    latencyMs: number
  ): Promise<void> {
    // Store as memory for future routing decisions
    await this.store.store({
      userId,
      content: `Used tool ${toolId}: ${success ? 'success' : 'failure'}`,
      type: 'fact',
      metadata: {
        topic: 'tool_usage',
        source: 'system',
      },
    });
    
    // Invalidate cache
    this.toolHistoryCache.delete(userId);
    
    log.debug({ userId, toolId, success, latencyMs }, 'Tool usage recorded');
  }
}
```

---

## 3. Context Carrier

Maintains context across tool calls:

```typescript
// src/tools/context/context-carrier.ts

import type { StoredMemory } from '../../memory/unified-store/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ContextCarrier' });

export interface ToolContext {
  // Session info
  userId: string;
  sessionId: string;
  personaId: string;
  
  // Conversation state
  conversationTurn: number;
  recentMessages: string[];
  
  // Emotional state
  emotionalState: { primary: string; confidence: number };
  emotionalIntensity: number;
  emotionalTrajectory: 'improving' | 'stable' | 'declining';
  
  // Memory context
  recentlyAccessedMemories: string[];  // IDs
  recentlySurfacedMemories: string[];
  
  // Tool context
  previousToolCalls: Array<{
    toolId: string;
    timestamp: number;
    success: boolean;
  }>;
}

export class ContextCarrier {
  private contexts = new Map<string, ToolContext>();
  
  /**
   * Get or create context for a session
   */
  getContext(sessionId: string, userId: string, personaId: string): ToolContext {
    let ctx = this.contexts.get(sessionId);
    
    if (!ctx) {
      ctx = {
        userId,
        sessionId,
        personaId,
        conversationTurn: 0,
        recentMessages: [],
        emotionalState: { primary: 'neutral', confidence: 0.5 },
        emotionalIntensity: 0.5,
        emotionalTrajectory: 'stable',
        recentlyAccessedMemories: [],
        recentlySurfacedMemories: [],
        previousToolCalls: [],
      };
      this.contexts.set(sessionId, ctx);
    }
    
    return ctx;
  }
  
  /**
   * Update context after a user message
   */
  updateForMessage(sessionId: string, message: string): void {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return;
    
    ctx.conversationTurn++;
    ctx.recentMessages.push(message);
    
    // Keep last 10 messages
    if (ctx.recentMessages.length > 10) {
      ctx.recentMessages.shift();
    }
  }
  
  /**
   * Update emotional state
   */
  updateEmotionalState(
    sessionId: string,
    state: { primary: string; confidence: number },
    intensity: number,
    trajectory: 'improving' | 'stable' | 'declining'
  ): void {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return;
    
    ctx.emotionalState = state;
    ctx.emotionalIntensity = intensity;
    ctx.emotionalTrajectory = trajectory;
  }
  
  /**
   * Record memory access
   */
  recordMemoryAccess(sessionId: string, memoryId: string): void {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return;
    
    ctx.recentlyAccessedMemories.push(memoryId);
    
    // Keep last 20
    if (ctx.recentlyAccessedMemories.length > 20) {
      ctx.recentlyAccessedMemories.shift();
    }
  }
  
  /**
   * Record memory surfacing
   */
  recordMemorySurfaced(sessionId: string, memoryId: string): void {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return;
    
    ctx.recentlySurfacedMemories.push(memoryId);
    
    // Keep last 10
    if (ctx.recentlySurfacedMemories.length > 10) {
      ctx.recentlySurfacedMemories.shift();
    }
  }
  
  /**
   * Record tool call
   */
  recordToolCall(sessionId: string, toolId: string, success: boolean): void {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return;
    
    ctx.previousToolCalls.push({
      toolId,
      timestamp: Date.now(),
      success,
    });
    
    // Keep last 20
    if (ctx.previousToolCalls.length > 20) {
      ctx.previousToolCalls.shift();
    }
  }
  
  /**
   * Clear context for a session
   */
  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
  }
  
  /**
   * Get summary for context builder
   */
  getSummary(sessionId: string): string {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return '';
    
    const lines: string[] = [];
    
    // Recent tool usage
    const recentTools = ctx.previousToolCalls.slice(-5);
    if (recentTools.length > 0) {
      lines.push(`Recent tools: ${recentTools.map(t => t.toolId).join(', ')}`);
    }
    
    // Surfaced memories
    if (ctx.recentlySurfacedMemories.length > 0) {
      lines.push(`Memories surfaced this session: ${ctx.recentlySurfacedMemories.length}`);
    }
    
    // Emotional context
    lines.push(`Emotional state: ${ctx.emotionalState.primary} (${ctx.emotionalTrajectory})`);
    
    return lines.join('\n');
  }
}

// Singleton
let instance: ContextCarrier | null = null;

export function getContextCarrier(): ContextCarrier {
  if (!instance) {
    instance = new ContextCarrier();
  }
  return instance;
}
```

---

## 4. Integration with Context Builders

```typescript
// src/intelligence/context-builders/unified-memory-context.ts

import { getMemoryIntelligence } from '../../memory/intelligence/orchestrator.js';
import { getContextCarrier } from '../../tools/context/context-carrier.js';
import type { ContextBuilder, ConversationContext } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'UnifiedMemoryContext' });

/**
 * Single unified context builder that replaces all memory-related builders:
 * - advanced-memory.ts
 * - proactive-memory.ts  
 * - human-memory.ts
 * - persona-memory.ts
 * - unified-memory-orchestrator.ts
 */
export const unifiedMemoryContextBuilder: ContextBuilder = {
  name: 'unified-memory',
  priority: 75,  // High priority - memory is important
  
  async build(ctx: ConversationContext): Promise<string> {
    const sessionId = ctx.sessionId ?? `session_${ctx.userId}`;
    
    // Update context carrier
    const carrier = getContextCarrier();
    carrier.updateForMessage(sessionId, ctx.currentMessage);
    carrier.updateEmotionalState(
      sessionId,
      ctx.emotionalState,
      ctx.emotionalIntensity,
      ctx.emotionalTrajectory
    );
    
    // Get intelligent memory context
    const intelligence = getMemoryIntelligence();
    
    const response = await intelligence.getRelevantMemories({
      userId: ctx.userId,
      query: ctx.currentMessage,
      conversationTurn: ctx.turnCount,
      recentMessages: ctx.recentMessages,
      currentTopic: ctx.detectedTopic,
      persons: ctx.mentionedPersons,
      emotionalState: ctx.emotionalState,
      emotionalIntensity: ctx.emotionalIntensity,
      emotionalTrajectory: ctx.emotionalTrajectory,
      personaId: ctx.persona.id,
      maxResults: 3,
    });
    
    // Record surfaced memories
    for (const surfaced of response.surfaced) {
      carrier.recordMemorySurfaced(sessionId, surfaced.memory.id);
    }
    
    // Build context string
    const sections: string[] = [];
    
    // Section 1: Relevant memories
    if (response.surfaced.length > 0) {
      sections.push('## Relevant Memories');
      sections.push('');
      
      for (const mem of response.surfaced) {
        sections.push(`### Memory: ${mem.memory.type}`);
        sections.push(`**Phrase naturally:** "${mem.phrased.text}"`);
        sections.push(`_Context: ${mem.timing.reason} (confidence: ${mem.timing.confidence.toFixed(2)})_`);
        if (mem.phrased.followUp) {
          sections.push(`_Follow-up: "${mem.phrased.followUp}"_`);
        }
        sections.push('');
      }
    }
    
    // Section 2: Deferred memories (for awareness)
    if (response.deferred.length > 0) {
      sections.push('## Deferred Memories (Don\'t Surface Now)');
      sections.push('');
      
      for (const def of response.deferred) {
        sections.push(`- "${def.memory.content.slice(0, 50)}..." (${def.deferReason})`);
      }
      sections.push('');
    }
    
    // Section 3: Session context
    const sessionSummary = carrier.getSummary(sessionId);
    if (sessionSummary) {
      sections.push('## Session Context');
      sections.push(sessionSummary);
      sections.push('');
    }
    
    // Guidance
    if (sections.length > 0) {
      sections.push('## Guidelines');
      sections.push('- Weave memories naturally - don\'t announce them');
      sections.push('- Use suggested phrasings as inspiration, not scripts');
      sections.push('- Honor deferred memories - they\'re not ready yet');
      sections.push('- The user\'s emotional state is: ' + ctx.emotionalState.primary);
    }
    
    return sections.join('\n');
  },
};
```

---

## 5. Tool Registration

```typescript
// src/tools/domains/memory/index.ts

import { getEnhancedMemoryToolDefinitions } from './enhanced-memory-tools.js';
import type { ToolDefinition } from '../../types.js';

/**
 * Memory domain tools - all operating through intelligence layer
 */
export function getToolDefinitions(): ToolDefinition[] {
  return getEnhancedMemoryToolDefinitions();
}

export const definitions = getToolDefinitions();
```

---

## Testing Strategy

### Integration Tests

```typescript
// src/tools/domains/memory/__tests__/enhanced-tools.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { enhancedRecallMemory, enhancedRememberFact } from '../enhanced-memory-tools.js';
import { initializeTestMemory } from '../../../../memory/__tests__/test-utils.js';

describe('Enhanced Memory Tools', () => {
  beforeEach(async () => {
    await initializeTestMemory();
  });
  
  describe('enhancedRememberFact', () => {
    it('should store memory with full metadata', async () => {
      const result = await enhancedRememberFact.handler({
        content: 'User wants to learn Spanish',
        type: 'commitment',
        topic: 'learning',
        emotionalWeight: 0.7,
      }, {
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
      });
      
      expect(result.success).toBe(true);
      expect(result.memoryId).toBeDefined();
    });
  });
  
  describe('enhancedRecallMemory', () => {
    it('should recall through intelligence layer', async () => {
      // First store
      await enhancedRememberFact.handler({
        content: 'User enjoys hiking',
        type: 'preference',
      }, {
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
      });
      
      // Then recall
      const result = await enhancedRecallMemory.handler({
        query: 'outdoor activities',
      }, {
        userId: 'test-user',
        conversationTurn: 5,
        recentMessages: ['I want to do something active this weekend'],
        emotionalState: { primary: 'positive', confidence: 0.8 },
        emotionalIntensity: 0.6,
        emotionalTrajectory: 'stable',
        personaId: 'ferni',
      });
      
      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.memories[0].phrase).toBeDefined();
    });
  });
});
```

### End-to-End Tests

```typescript
// e2e/memory-integration.test.ts

describe('Memory Integration E2E', () => {
  it('should flow from tool → intelligence → store → graph', async () => {
    // 1. Store via tool
    // 2. Verify intelligence layer processed
    // 3. Verify graph links created
    // 4. Verify recall uses intelligence
    // 5. Verify lifecycle hooks fired
  });
});
```

---

## Migration Path

### Phase 5a: Parallel Tools (Week 1)

```typescript
// Keep old tools working, add new tools alongside
export const legacyRecallMemory = { ... };  // Old
export const enhancedRecallMemory = { ... };  // New

// Feature flag controls which is used
const USE_ENHANCED = process.env.ENHANCED_MEMORY_TOOLS === 'true';
```

### Phase 5b: Context Builder Consolidation (Week 2)

```typescript
// Replace 5 context builders with 1 unified builder
// Old: advanced-memory, proactive-memory, human-memory, persona-memory, unified-memory-orchestrator
// New: unified-memory-context
```

### Phase 5c: Router Enhancement (Week 2)

```typescript
// Wrap existing router with memory-aware layer
const router = new MemoryAwareSemanticRouter(
  existingRouter,
  unifiedStore
);
```

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Tool success rate | ~75% | >90% |
| Memory recall relevance | ~60% | >85% |
| Tool selection accuracy | ~70% | >85% |
| Context builder overhead | 5 builders | 1 builder |
| Memory tool latency | ~300ms | <150ms |

---

## Summary: Complete Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SUPERHUMAN MEMORY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Memory-Aware Semantic Router               │   │
│  │           (History boost, topic awareness)               │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │                 Memory-Native Tools                       │   │
│  │     recallMemory | rememberFact | surfaceRelevant        │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              Memory Intelligence Layer                    │   │
│  │        Timing → Selection → Phrasing → Learning          │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │                Associative Cortex (Graph)                 │   │
│  │          causal | temporal | person | narrative          │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              Memory Lifecycle Manager                     │   │
│  │    Consolidation | Decay | Reinforcement | Protection    │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │                Unified Memory Store                       │   │
│  │         Firestore + Vector + Cache (Facade)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Back to: [Phase 1 - Unified Memory Store](./01-UNIFIED-MEMORY-STORE.md)*
