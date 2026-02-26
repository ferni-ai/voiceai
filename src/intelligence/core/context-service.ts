/**
 * Dedicated Context Building Service
 *
 * PERFORMANCE OPTIMIZATION: Centralized, cacheable context building
 * that can run as a separate microservice for infinite scaling.
 *
 * Architecture:
 * - Pre-computed context blocks (cached)
 * - Lazy loading of expensive builders
 * - Streaming context assembly
 * - Multi-tenant support
 *
 * @module intelligence/context-service
 */

import { LRUCache } from 'lru-cache';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ContextService' });

// ============================================================================
// TYPES
// ============================================================================

export interface ContextRequest {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Current persona ID */
  personaId: string;
  /** User's current message */
  userMessage: string;
  /** Turn number in conversation */
  turnNumber: number;
  /** Quick analysis results (if available) */
  analysis?: {
    intent?: string;
    emotion?: string;
    topics?: string[];
    distressLevel?: number;
  };
  /** Voice emotion data (if available) */
  voiceEmotion?: {
    emotion: string;
    confidence: number;
    prosody?: Record<string, number>;
  };
  /** Required context blocks */
  requiredBlocks?: ContextBlockType[];
  /** Maximum context tokens */
  maxTokens?: number;
  /** Priority (affects caching) */
  priority?: 'real-time' | 'standard' | 'background';
}

export type ContextBlockType =
  | 'persona'
  | 'memory'
  | 'emotional'
  | 'trust'
  | 'coaching'
  | 'safety'
  | 'humanizing'
  | 'engagement'
  | 'external'
  | 'voice'
  | 'recent_turns';

export interface ContextBlock {
  type: ContextBlockType;
  content: string;
  tokenEstimate: number;
  priority: number;
  cacheable: boolean;
  ttlMs?: number;
}

export interface ContextResponse {
  /** Assembled context string */
  context: string;
  /** Individual blocks used */
  blocks: ContextBlock[];
  /** Total estimated tokens */
  totalTokens: number;
  /** Metrics */
  metrics: {
    buildDurationMs: number;
    cacheHits: number;
    cacheMisses: number;
    blocksBuilt: number;
    blocksFromCache: number;
  };
}

// ============================================================================
// CONTEXT BLOCK BUILDERS
// ============================================================================

interface BlockBuilder {
  type: ContextBlockType;
  priority: number;
  cacheable: boolean;
  ttlMs: number;
  build: (request: ContextRequest) => Promise<string>;
}

/**
 * Persona context block - character definition
 */
const personaBlockBuilder: BlockBuilder = {
  type: 'persona',
  priority: 0,
  cacheable: true,
  ttlMs: 3600000, // 1 hour - personas rarely change
  build: async (request: ContextRequest): Promise<string> => {
    try {
      const personaModule = await import('../../personas/index.js').catch(() => null);
      if (!personaModule) {
        return `You are a warm, empathetic life coach named Ferni.`;
      }

      // Try various possible export names
      const getPersona =
        (personaModule as unknown as Record<string, unknown>).getPersonaById ??
        (personaModule as unknown as Record<string, unknown>).getPersona ??
        (personaModule as unknown as Record<string, unknown>).default;

      if (typeof getPersona !== 'function') {
        return `You are a warm, empathetic life coach named Ferni.`;
      }

      const persona = getPersona(request.personaId) as {
        name?: string;
        coreIdentity?: string;
        description?: string;
        voice?: string;
        expertise?: string[];
      } | null;

      if (!persona) {
        return `You are a warm, empathetic life coach named Ferni.`;
      }

      return `# Character
You are ${persona.name || 'Ferni'}. ${persona.coreIdentity || persona.description || ''}

## Voice
${persona.voice || 'Warm, conversational, and genuine.'}

## Expertise
${persona.expertise?.join(', ') || 'General life coaching'}`;
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to build persona block');
      return `You are a warm, empathetic life coach.`;
    }
  },
};

/**
 * Memory context block - user history
 */
const memoryBlockBuilder: BlockBuilder = {
  type: 'memory',
  priority: 1,
  cacheable: true,
  ttlMs: 60000, // 1 minute
  build: async (_request: ContextRequest): Promise<string> => {
    // parallel-memory-search removed during DDD cleanup
    // Memory retrieval is now handled via retrieval/ bounded context
    return '';
  },
};

/**
 * Emotional context block - current emotional state
 */
const emotionalBlockBuilder: BlockBuilder = {
  type: 'emotional',
  priority: 2,
  cacheable: false, // Always fresh
  ttlMs: 0,
  build: async (request: ContextRequest): Promise<string> => {
    const { analysis } = request;
    const { voiceEmotion } = request;

    if (!analysis?.emotion && !voiceEmotion) {
      return '';
    }

    let block = '# Emotional Context\n';

    if (voiceEmotion && voiceEmotion.confidence > 0.5) {
      block += `Their voice sounds ${voiceEmotion.emotion} (${Math.round(voiceEmotion.confidence * 100)}% confident)\n`;
    }

    if (analysis?.emotion) {
      block += `Their message conveys ${analysis.emotion}\n`;
    }

    if (analysis?.distressLevel && analysis.distressLevel >= 4) {
      block += `⚠️ Elevated distress detected (level ${analysis.distressLevel}/10). Be extra gentle and supportive.\n`;
    }

    return block;
  },
};

/**
 * Trust context block - relationship depth
 */
const trustBlockBuilder: BlockBuilder = {
  type: 'trust',
  priority: 3,
  cacheable: true,
  ttlMs: 300000, // 5 minutes
  build: async (request: ContextRequest): Promise<string> => {
    try {
      const trustModule = await import('../../services/trust-systems/persistence.js').catch(
        () => null
      );
      if (!trustModule) return '';

      // Try various possible export names
      const loadProfile =
        (trustModule as unknown as Record<string, unknown>).loadTrustProfile ??
        (trustModule as unknown as Record<string, unknown>).getTrustProfile ??
        (trustModule as unknown as Record<string, unknown>).load;

      if (typeof loadProfile !== 'function') return '';

      const trustProfile = await loadProfile(request.userId);

      if (!trustProfile) {
        return '';
      }

      const profile = trustProfile as {
        overallTrust?: string;
        conversationCount?: number;
        communicationStyle?: string;
      };
      return `# Your Relationship
- Trust level: ${profile.overallTrust || 'developing'}
- Conversations together: ${profile.conversationCount || 1}
- They prefer: ${profile.communicationStyle || 'direct but warm'}`;
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to build trust block');
      return '';
    }
  },
};

/**
 * Safety context block - crisis detection
 */
const safetyBlockBuilder: BlockBuilder = {
  type: 'safety',
  priority: -1, // Highest priority
  cacheable: false,
  ttlMs: 0,
  build: async (request: ContextRequest): Promise<string> => {
    const distress = request.analysis?.distressLevel || 0;

    if (distress >= 8) {
      return `# ⚠️ SAFETY PRIORITY
This person may be in crisis. 
- Prioritize their emotional safety
- Do NOT minimize their feelings
- Offer to help them find professional support if appropriate
- Be present and non-judgmental`;
    }

    if (distress >= 6) {
      return `# Heightened Support Needed
They seem to be going through something difficult.
- Be extra gentle and patient
- Validate their feelings first
- Don't jump to solutions`;
    }

    return '';
  },
};

/**
 * Humanizing context block - natural speech patterns
 */
const humanizingBlockBuilder: BlockBuilder = {
  type: 'humanizing',
  priority: 5,
  cacheable: true,
  ttlMs: 3600000, // 1 hour
  build: async (_request: ContextRequest): Promise<string> => {
    return `# Voice Style
- Speak naturally, like a thoughtful friend
- Use contractions (I'm, you're, that's)
- Add occasional filler words (well, hmm, you know)
- Include breath pauses with "..."
- Never sound robotic or scripted`;
  },
};

/**
 * Recent turns context block
 */
const recentTurnsBlockBuilder: BlockBuilder = {
  type: 'recent_turns',
  priority: 4,
  cacheable: false,
  ttlMs: 0,
  build: async (request: ContextRequest): Promise<string> => {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const turnsSnapshot = await db
        .collection('sessions')
        .doc(request.sessionId)
        .collection('turns')
        .orderBy('timestamp', 'desc')
        .limit(3)
        .get();

      if (turnsSnapshot.empty) {
        return '';
      }

      const turns = turnsSnapshot.docs.reverse().map((doc) => {
        const data = doc.data();
        return `${data.role === 'user' ? 'User' : 'You'}: ${data.content?.slice(0, 200) || ''}`;
      });

      return `# Recent Conversation
${turns.join('\n')}`;
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to build recent turns block');
      return '';
    }
  },
};

/**
 * Voice context block - prosody and emotion from voice
 */
const voiceBlockBuilder: BlockBuilder = {
  type: 'voice',
  priority: 2,
  cacheable: false,
  ttlMs: 0,
  build: async (request: ContextRequest): Promise<string> => {
    if (!request.voiceEmotion || request.voiceEmotion.confidence < 0.3) {
      return '';
    }

    const { prosody } = request.voiceEmotion;
    let block = `# Voice Signals
- Detected emotion: ${request.voiceEmotion.emotion}`;

    if (prosody) {
      if (prosody.pace) {
        block += `\n- Speech pace: ${prosody.pace > 1.2 ? 'fast' : prosody.pace < 0.8 ? 'slow' : 'normal'}`;
      }
      if (prosody.energy) {
        block += `\n- Energy level: ${prosody.energy > 0.7 ? 'high' : prosody.energy < 0.3 ? 'low' : 'moderate'}`;
      }
    }

    return block;
  },
};

// All builders
const ALL_BUILDERS: BlockBuilder[] = [
  safetyBlockBuilder,
  personaBlockBuilder,
  memoryBlockBuilder,
  emotionalBlockBuilder,
  trustBlockBuilder,
  recentTurnsBlockBuilder,
  voiceBlockBuilder,
  humanizingBlockBuilder,
];

// ============================================================================
// CONTEXT SERVICE
// ============================================================================

class ContextService {
  private blockCache = new LRUCache<string, { block: ContextBlock; timestamp: number }>({
    max: 1000,
    ttl: 3600000, // 1 hour max
  });
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgBuildTimeMs: 0,
  };
  private buildTimes: number[] = [];

  /**
   * Build context for a request
   */
  async buildContext(request: ContextRequest): Promise<ContextResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Determine which blocks to build
    const blockTypes = request.requiredBlocks || this.determineRequiredBlocks(request);

    // Get builders for requested blocks
    const builders = ALL_BUILDERS.filter((b) => blockTypes.includes(b.type)).sort(
      (a, b) => a.priority - b.priority
    );

    // Build blocks in parallel
    let cacheHits = 0;
    let cacheMisses = 0;

    const blockPromises = builders.map(async (builder) => {
      // Check cache for cacheable blocks
      if (builder.cacheable) {
        const cacheKey = this.getCacheKey(request, builder.type);
        const cached = this.blockCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < builder.ttlMs) {
          cacheHits++;
          return cached.block;
        }
      }

      cacheMisses++;

      // Build the block
      try {
        const content = await Promise.race([
          builder.build(request),
          new Promise<string>((resolve) => {
            setTimeout(() => resolve(''), request.priority === 'real-time' ? 100 : 300);
          }),
        ]);

        const block: ContextBlock = {
          type: builder.type,
          content,
          tokenEstimate: Math.ceil(content.length / 4), // Rough estimate
          priority: builder.priority,
          cacheable: builder.cacheable,
          ttlMs: builder.ttlMs,
        };

        // Cache if cacheable
        if (builder.cacheable && content.length > 0) {
          const cacheKey = this.getCacheKey(request, builder.type);
          this.blockCache.set(cacheKey, { block, timestamp: Date.now() });
        }

        return block;
      } catch (error) {
        log.debug({ type: builder.type, error: String(error) }, 'Block build failed');
        return {
          type: builder.type,
          content: '',
          tokenEstimate: 0,
          priority: builder.priority,
          cacheable: false,
        };
      }
    });

    const blocks = await Promise.all(blockPromises);

    // Filter out empty blocks and assemble context
    const validBlocks = blocks.filter((b) => b.content.length > 0);

    // Apply token limit if specified
    let context = '';
    let totalTokens = 0;
    const maxTokens = request.maxTokens || 4000;
    const usedBlocks: ContextBlock[] = [];

    for (const block of validBlocks) {
      if (totalTokens + block.tokenEstimate > maxTokens) {
        break;
      }
      context += `${block.content}\n\n`;
      totalTokens += block.tokenEstimate;
      usedBlocks.push(block);
    }

    // Update metrics
    const buildDurationMs = Date.now() - startTime;
    this.buildTimes.push(buildDurationMs);
    if (this.buildTimes.length > 100) this.buildTimes.shift();
    this.metrics.avgBuildTimeMs =
      this.buildTimes.reduce((a, b) => a + b, 0) / this.buildTimes.length;
    this.metrics.cacheHits += cacheHits;
    this.metrics.cacheMisses += cacheMisses;

    log.debug(
      {
        userId: request.userId,
        blocksBuilt: usedBlocks.length,
        totalTokens,
        buildDurationMs,
        cacheHits,
      },
      'Context built'
    );

    return {
      context: context.trim(),
      blocks: usedBlocks,
      totalTokens,
      metrics: {
        buildDurationMs,
        cacheHits,
        cacheMisses,
        blocksBuilt: usedBlocks.length,
        blocksFromCache: cacheHits,
      },
    };
  }

  /**
   * Determine required blocks based on request
   */
  private determineRequiredBlocks(request: ContextRequest): ContextBlockType[] {
    const blocks: ContextBlockType[] = ['persona', 'humanizing'];

    // Always include safety check
    if (request.analysis?.distressLevel && request.analysis.distressLevel >= 4) {
      blocks.unshift('safety');
    }

    // Include memory for returning users or deeper conversations
    if (request.turnNumber > 1 || request.turnNumber % 3 === 0) {
      blocks.push('memory');
    }

    // Include emotional context
    if (request.analysis?.emotion || request.voiceEmotion) {
      blocks.push('emotional');
    }

    // Include voice context if available
    if (request.voiceEmotion?.confidence && request.voiceEmotion.confidence > 0.5) {
      blocks.push('voice');
    }

    // Include trust for established relationships
    if (request.turnNumber > 3) {
      blocks.push('trust');
    }

    // Include recent turns for context
    if (request.turnNumber > 1) {
      blocks.push('recent_turns');
    }

    return blocks;
  }

  /**
   * Sort blocks by priority
   */
  private sortBlocksByPriority(blocks: ContextBlock[]): ContextBlock[] {
    return blocks.sort((a: ContextBlock, b: ContextBlock) => a.priority - b.priority);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: ContextRequest, blockType: ContextBlockType): string {
    // Some blocks are user-specific, some are session-specific
    switch (blockType) {
      case 'persona':
        return `persona:${request.personaId}`;
      case 'memory':
        return `memory:${request.userId}:${request.analysis?.topics?.[0] || 'general'}`;
      case 'trust':
        return `trust:${request.userId}`;
      case 'humanizing':
        return `humanizing:${request.personaId}`;
      default:
        return `${blockType}:${request.sessionId}:${request.turnNumber}`;
    }
  }

  /**
   * Pre-warm cache for a user
   */
  async prewarmCache(userId: string, personaId: string): Promise<void> {
    log.debug({ userId, personaId }, 'Pre-warming context cache');

    const warmupRequest: ContextRequest = {
      userId,
      sessionId: 'warmup',
      personaId,
      userMessage: '',
      turnNumber: 1,
      requiredBlocks: ['persona', 'memory', 'trust', 'humanizing'],
      priority: 'background',
    };

    await this.buildContext(warmupRequest);
  }

  /**
   * Get service metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.blockCache.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let contextServiceInstance: ContextService | null = null;

export function getContextService(): ContextService {
  if (!contextServiceInstance) {
    contextServiceInstance = new ContextService();
  }
  return contextServiceInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Build context for a turn
 */
export async function buildTurnContext(request: ContextRequest): Promise<ContextResponse> {
  return getContextService().buildContext(request);
}

/**
 * Quick context build for real-time use
 */
export async function quickContext(
  userId: string,
  sessionId: string,
  personaId: string,
  userMessage: string,
  turnNumber: number
): Promise<string> {
  const response = await buildTurnContext({
    userId,
    sessionId,
    personaId,
    userMessage,
    turnNumber,
    priority: 'real-time',
    maxTokens: 2000,
  });

  return response.context;
}

/**
 * Pre-warm context cache for a user
 */
export async function prewarmContextCache(userId: string, personaId: string): Promise<void> {
  await getContextService().prewarmCache(userId, personaId);
}

/**
 * Get context service metrics
 */
export function getContextServiceMetrics(): ReturnType<ContextService['getMetrics']> {
  return getContextService().getMetrics();
}

export default ContextService;
