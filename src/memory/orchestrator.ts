/**
 * Memory Orchestrator
 *
 * Single entry point for all memory operations.
 * Coordinates all memory subsystems to provide unified, deduplicated context.
 *
 * Philosophy: The brain doesn't have separate "semantic memory", "emotional memory",
 * and "episodic memory" departments that each send their own memo. It integrates
 * everything into a coherent stream of consciousness. This orchestrator does the same
 * for Ferni's memory.
 *
 * @module memory/orchestrator
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  IMemoryOrchestrator,
  OrchestratedMemory,
  RecallContext,
  ExplainedMemory,
  RetrievedMemory,
  MemoryItem,
  ConversationTurn,
  EmotionalState,
  BondState,
  EmotionalThread,
  ApproachGuidance,
  BehavioralPattern,
  SessionPrimingResult,
} from './interfaces/index.js';

// Import implementations
import { retrieveMemories, getConversationPrimingMemories, buildMemoryIndex } from './advanced-retrieval.js';
import { getRetrievalExplainer } from './retrieval-explanations.js';
import { getSessionPrimer } from './session-priming.js';
import { getUnifiedEmotionalMemory } from './emotional-memory-unified.js';
import { getAssociativeMemory, type AssociativeMemory } from './associative-memory.js';
import { getCommunicationPreferences, type CommunicationPreferences } from './communication-preferences.js';
import { getEmotionalThreading, type EmotionalThreading } from './emotional-threading.js';
import { getBehavioralPatternDetector, type BehavioralPatternDetector } from './behavioral-pattern-detector.js';
import { getNaturalReferenceGenerator } from './natural-reference-generator.js';
import { getLLMSignalExtractor } from './llm-signal-extractor.js';

const log = createLogger({ module: 'MemoryOrchestrator' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface OrchestratorConfig {
  /** Maximum primary memories to include (default: 5) */
  maxPrimaryMemories: number;
  /** Maximum callbacks to suggest (default: 3) */
  maxCallbacks: number;
  /** Minimum score for memory inclusion (default: 0.3) */
  minMemoryScore: number;
  /** Whether to include behavioral patterns (default: true) */
  includeBehavioralPatterns: boolean;
  /** Whether to include communication preferences (default: true) */
  includeCommunicationPreferences: boolean;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxPrimaryMemories: 5,
  maxCallbacks: 3,
  minMemoryScore: 0.3,
  includeBehavioralPatterns: true,
  includeCommunicationPreferences: true,
};

// ============================================================================
// MEMORY ORCHESTRATOR IMPLEMENTATION
// ============================================================================

export class MemoryOrchestrator implements IMemoryOrchestrator {
  private config: OrchestratorConfig;
  private explainer = getRetrievalExplainer();
  private sessionPrimer = getSessionPrimer();
  private referenceGenerator = getNaturalReferenceGenerator();
  private signalExtractor = getLLMSignalExtractor();

  // Per-user subsystems (accessed via getters)
  private associativeMemories: Map<string, AssociativeMemory> = new Map();
  private commPreferences: Map<string, CommunicationPreferences> = new Map();
  private emotionalThreading: Map<string, EmotionalThreading> = new Map();
  private patternDetectors: Map<string, BehavioralPatternDetector> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main recall function - coordinates all memory subsystems
   */
  async recall(context: RecallContext): Promise<OrchestratedMemory> {
    const {
      userId,
      profile,
      query,
      currentTopic,
      currentEmotion,
      personaId,
      conversationTurn,
      isSessionStart,
      recentSummaries,
    } = context;

    log.debug({ userId, isSessionStart, turn: conversationTurn }, 'Memory recall started');

    // 1. Get raw memories from different sources
    const rawMemories = await this.gatherMemories(context);

    // 2. Explain and enhance memories
    const explainedMemories = this.explainer.explainAll(rawMemories, context);

    // 3. Deduplicate and rank
    const rankedMemories = this.rankAndDeduplicate(explainedMemories);

    // 4. Get session priming if session start
    let priming: SessionPrimingResult | null = null;
    if (isSessionStart && profile && recentSummaries) {
      try {
        const memoryItems = rawMemories.map((m) => m.item);
        priming = await this.sessionPrimer.generatePrimingContext(
          profile,
          memoryItems,
          recentSummaries
        );
      } catch (error) {
        log.warn({ error: String(error) }, 'Session priming failed');
      }
    }

    // 5. Get emotional context
    const emotional = await this.getEmotionalContext(userId, personaId);

    // 6. Get behavioral patterns
    let activePatterns: BehavioralPattern[] = [];
    if (this.config.includeBehavioralPatterns) {
      const detector = this.getPatternDetector(userId);
      activePatterns = await detector.getPatterns(userId);
      // Filter to high-confidence patterns
      activePatterns = activePatterns.filter((p) => p.confidence > 0.4);
    }

    // 7. Separate primary memories from callback suggestions
    const { primary, callbacks } = this.categorizeMemories(
      rankedMemories,
      context,
      conversationTurn || 0
    );

    // 8. Generate natural references for callbacks
    const callbacksWithReferences = callbacks.map((memory) => {
      const ref = this.referenceGenerator.generate(memory, {
        userMood: currentEmotion || 'neutral',
        relationshipStage: profile?.relationshipStage || 'building',
        personaId: personaId || 'ferni',
        conversationTone: 'neutral',
      });
      return {
        memory,
        suggestedReference: ref.reference,
        timing: this.determineCallbackTiming(memory, conversationTurn || 0),
        priority: memory.score,
      };
    });

    // 9. Format for prompt injection
    const formattedContext = this.formatForPrompt(
      primary,
      callbacksWithReferences,
      emotional,
      activePatterns,
      priming
    );

    log.info(
      {
        userId,
        primaryCount: primary.length,
        callbackCount: callbacks.length,
        hasEmotionalContext: !!emotional.threads.length,
        patternCount: activePatterns.length,
      },
      'Memory recall complete'
    );

    return {
      primaryMemories: primary,
      callbacks: callbacksWithReferences,
      priming,
      emotional,
      activePatterns,
      formattedContext,
    };
  }

  /**
   * Record an interaction for memory learning
   */
  async recordInteraction(context: {
    userId: string;
    turns: ConversationTurn[];
    sessionEmotion?: string;
    personaId: string;
    sessionId?: string;
    sessionEndState?: 'positive' | 'neutral' | 'heavy' | 'unresolved' | 'hopeful';
  }): Promise<void> {
    const { userId, turns, sessionEmotion, personaId, sessionId, sessionEndState } = context;

    // 1. Extract signals from conversation
    try {
      const signals = await this.signalExtractor.extractSignals(turns, {
        userId,
        personaId,
        sessionEmotion,
      });
      log.debug(
        {
          userId,
          dates: signals.importantDates.length,
          values: signals.values.length,
        },
        'Extracted signals from conversation'
      );
    } catch (error) {
      log.warn({ error: String(error) }, 'Signal extraction failed');
    }

    // 2. Update associative memory
    const associative = this.getAssociativeMemory(userId);
    // Register triggers from conversation content
    for (const turn of turns.filter((t) => t.role === 'user')) {
      // This is handled internally by associative memory
    }

    // 3. Update behavioral patterns
    const detector = this.getPatternDetector(userId);
    const existingPatterns = await detector.getPatterns(userId);
    const updatedPatterns = await detector.analyzeForPatterns(turns, existingPatterns);
    await detector.savePatterns(userId, updatedPatterns);

    // 4. Record emotional threading
    if (sessionId && sessionEndState) {
      const threading = this.getEmotionalThreading(userId);
      const unresolvedTopics = this.extractUnresolvedTopics(turns);
      await threading.recordSessionEnd({
        userId,
        sessionId,
        dominantEmotion: sessionEmotion || 'neutral',
        endState: sessionEndState,
        unresolvedTopics,
      });
    }

    log.info({ userId, turnCount: turns.length }, 'Recorded interaction');
  }

  /**
   * Get memory health stats
   */
  async getMemoryHealth(userId: string): Promise<{
    totalMemories: number;
    recentMemories: number;
    strongMemories: number;
    emotionalMemories: number;
    commitments: number;
  }> {
    // This would query the actual memory stores
    // For now, return placeholders
    return {
      totalMemories: 0,
      recentMemories: 0,
      strongMemories: 0,
      emotionalMemories: 0,
      commitments: 0,
    };
  }

  // ============================================================================
  // PRIVATE: MEMORY GATHERING
  // ============================================================================

  /**
   * Gather memories from all sources
   */
  private async gatherMemories(context: RecallContext): Promise<RetrievedMemory[]> {
    const { userId, query, isSessionStart, personaId } = context;
    const memories: RetrievedMemory[] = [];

    // 1. Semantic retrieval (main memory system)
    try {
      const semanticMemories = await retrieveMemories(userId, context);
      memories.push(...semanticMemories);
    } catch (error) {
      log.warn({ error: String(error) }, 'Semantic retrieval failed');
    }

    // 2. Associative memory triggers
    if (query) {
      try {
        const associative = this.getAssociativeMemory(userId);
        const triggered = await associative.getTriggeredMemories(query, context);
        for (const t of triggered) {
          // Convert to RetrievedMemory format
          memories.push({
            item: t.memory,
            score: t.activationStrength,
            scoreBreakdown: {
              semantic: 0,
              temporal: 0.5,
              emotional: t.memory.emotionalWeight,
              contextual: 0.5,
              associative: t.activationStrength,
            },
            reason: `Triggered by: ${t.trigger.triggerValue}`,
            triggerType: 'associative',
          });
        }
      } catch (error) {
        log.debug({ error: String(error) }, 'Associative retrieval failed');
      }
    }

    // 3. Priming memories (for session start)
    if (isSessionStart) {
      try {
        const primingMemories = await getConversationPrimingMemories(
          userId,
          personaId || 'ferni',
          { maxMemories: 3, sessionCount: context.sessionCount || 0 }
        );
        for (const item of primingMemories) {
          // Avoid duplicates
          if (!memories.some((m) => m.item.id === item.id)) {
            memories.push({
              item,
              score: 0.7, // Priming memories get good score
              scoreBreakdown: {
                semantic: 0.5,
                temporal: 0.7,
                emotional: item.emotionalWeight,
                contextual: 0.6,
              },
              reason: 'Session priming',
            });
          }
        }
      } catch (error) {
        log.debug({ error: String(error) }, 'Priming retrieval failed');
      }
    }

    return memories;
  }

  // ============================================================================
  // PRIVATE: RANKING AND DEDUPLICATION
  // ============================================================================

  /**
   * Rank and deduplicate memories
   */
  private rankAndDeduplicate(memories: ExplainedMemory[]): ExplainedMemory[] {
    // Group by content similarity
    const seen = new Set<string>();
    const unique: ExplainedMemory[] = [];

    // Sort by score first
    const sorted = [...memories].sort((a, b) => b.score - a.score);

    for (const memory of sorted) {
      // Create a simple hash of content
      const contentKey = memory.item.content.toLowerCase().slice(0, 100);

      if (!seen.has(contentKey)) {
        seen.add(contentKey);
        unique.push(memory);
      }
    }

    return unique;
  }

  /**
   * Categorize memories into primary and callbacks
   */
  private categorizeMemories(
    memories: ExplainedMemory[],
    context: RecallContext,
    turnCount: number
  ): { primary: ExplainedMemory[]; callbacks: ExplainedMemory[] } {
    const primary: ExplainedMemory[] = [];
    const callbacks: ExplainedMemory[] = [];

    for (const memory of memories) {
      if (memory.score < this.config.minMemoryScore) continue;

      // High-score, direct relevance -> primary
      if (memory.score > 0.6 || memory.connectionStrength === 'strong') {
        if (primary.length < this.config.maxPrimaryMemories) {
          primary.push(memory);
        } else if (callbacks.length < this.config.maxCallbacks) {
          callbacks.push(memory);
        }
      }
      // Lower relevance -> callback candidate
      else if (callbacks.length < this.config.maxCallbacks) {
        callbacks.push(memory);
      }
    }

    // Only suggest callbacks after turn 3
    if (turnCount < 3) {
      return { primary, callbacks: [] };
    }

    return { primary, callbacks };
  }

  /**
   * Determine when a callback should be used
   */
  private determineCallbackTiming(
    memory: ExplainedMemory,
    turnCount: number
  ): 'opening' | 'when_relevant' | 'closing' {
    // Commitments are good for opening
    if (memory.item.commitment) {
      return 'opening';
    }

    // Emotional memories are good when relevant
    if (memory.item.emotionalWeight > 0.6) {
      return 'when_relevant';
    }

    // Topic matches are good when relevant
    if (memory.connectionType === 'topic_match') {
      return 'when_relevant';
    }

    // Default
    return 'when_relevant';
  }

  // ============================================================================
  // PRIVATE: EMOTIONAL CONTEXT
  // ============================================================================

  /**
   * Get unified emotional context
   */
  private async getEmotionalContext(
    userId: string,
    personaId?: string
  ): Promise<OrchestratedMemory['emotional']> {
    // Get emotional memory
    const emotionalMemory = getUnifiedEmotionalMemory({
      userId,
      personaId: personaId || 'ferni',
    });
    const state = emotionalMemory.getState();

    // Get emotional threading
    const threading = this.getEmotionalThreading(userId);
    const sessionContext = await threading.getSessionContext(userId);

    // Get communication preferences
    let approachGuidance: ApproachGuidance | null = null;
    if (this.config.includeCommunicationPreferences) {
      const prefs = getCommunicationPreferences();
      approachGuidance = await prefs.getApproachGuidance(userId, {
        emotion: state.user.recentEmotions[0],
      });
    }

    return {
      userState: {
        recentEmotions: state.user.recentEmotions,
        unresolvedConcerns: state.user.unresolvedConcerns,
        celebratableWins: state.user.celebratableWins,
        emotionalTrend: state.user.patterns[0]?.trend || 'unknown',
      },
      bondState: {
        warmth: state.bond.warmth,
        trust: state.bond.trust,
        protectiveness: state.bond.protectiveness,
        admiration: state.bond.admiration,
        concern: state.bond.concern,
        sessionCount: state.bond.sessionCount,
        stage: this.mapRelationshipStage(state.bond.stage),
      },
      threads: sessionContext.activeThreads,
      approachGuidance,
    };
  }

  // ============================================================================
  // PRIVATE: FORMATTING
  // ============================================================================

  /**
   * Format everything for prompt injection
   */
  private formatForPrompt(
    primary: ExplainedMemory[],
    callbacks: OrchestratedMemory['callbacks'],
    emotional: OrchestratedMemory['emotional'],
    patterns: BehavioralPattern[],
    priming: SessionPrimingResult | null
  ): string {
    const sections: string[] = [];

    // Primary memories
    if (primary.length > 0) {
      const memoryLines = primary.map((m) => `- ${m.suggestedReference}`);
      sections.push(`[RELEVANT MEMORIES]\n${memoryLines.join('\n')}`);
    }

    // Callback suggestions
    if (callbacks.length > 0) {
      const callbackLines = callbacks.map((c) => `- ${c.suggestedReference}`);
      sections.push(
        `[MEMORY CALLBACKS - Use naturally if appropriate]\n${callbackLines.join('\n')}`
      );
    }

    // Emotional context
    if (emotional.threads.length > 0 || emotional.userState.unresolvedConcerns.length > 0) {
      const emotionalLines: string[] = [];
      if (emotional.threads.length > 0) {
        const thread = emotional.threads[0];
        emotionalLines.push(`- Unresolved emotional topic: ${thread.topic} (${thread.emotion})`);
      }
      if (emotional.userState.unresolvedConcerns.length > 0) {
        emotionalLines.push(`- Concerns to be aware of: ${emotional.userState.unresolvedConcerns.join(', ')}`);
      }
      if (emotional.userState.celebratableWins.length > 0) {
        emotionalLines.push(`- Wins to potentially celebrate: ${emotional.userState.celebratableWins.join(', ')}`);
      }
      sections.push(`[EMOTIONAL CONTEXT]\n${emotionalLines.join('\n')}`);
    }

    // Behavioral patterns
    if (patterns.length > 0) {
      const patternLines = patterns
        .slice(0, 2)
        .map((p) => `- Pattern: "${p.description}" → ${p.suggestedResponse}`);
      sections.push(`[BEHAVIORAL AWARENESS]\n${patternLines.join('\n')}`);
    }

    // Approach guidance
    if (emotional.approachGuidance) {
      const guidance = emotional.approachGuidance;
      const guidanceLines: string[] = [];
      if (guidance.embrace.length > 0) {
        guidanceLines.push(`Do: ${guidance.embrace.slice(0, 2).join('; ')}`);
      }
      if (guidance.avoid.length > 0) {
        guidanceLines.push(`Avoid: ${guidance.avoid.slice(0, 2).join('; ')}`);
      }
      if (guidanceLines.length > 0) {
        sections.push(`[APPROACH GUIDANCE]\n${guidanceLines.join('\n')}`);
      }
    }

    // Session priming (opening suggestions)
    if (priming) {
      if (priming.suggestedOpener) {
        sections.push(`[SUGGESTED OPENER]\n${priming.suggestedOpener}`);
      }
      if (priming.sensitiveTopics.length > 0) {
        sections.push(`[SENSITIVE - Be careful with]\n${priming.sensitiveTopics.join(', ')}`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Map relationship stage from unified emotional memory to our interface type
   */
  private mapRelationshipStage(
    stage: string
  ): 'new' | 'building' | 'established' | 'deep' {
    const stageMap: Record<string, 'new' | 'building' | 'established' | 'deep'> = {
      new_acquaintance: 'new',
      new: 'new',
      acquaintance: 'building',
      building: 'building',
      friend: 'established',
      established: 'established',
      close_friend: 'deep',
      deep: 'deep',
      confidant: 'deep',
    };
    return stageMap[stage] || 'building';
  }

  // ============================================================================
  // PRIVATE: HELPERS
  // ============================================================================

  /**
   * Extract topics that seem unresolved
   */
  private extractUnresolvedTopics(turns: ConversationTurn[]): string[] {
    const topics: string[] = [];

    // Look for questions that weren't answered
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.role === 'user' && turn.content.includes('?')) {
        // Check if next turn addresses it
        const nextTurn = turns[i + 1];
        if (!nextTurn) {
          // No response - definitely unresolved
          const question = turn.content.match(/[^.!?]*\?/)?.[0];
          if (question) topics.push(question.slice(0, 50));
        }
      }
    }

    // Look for heavy emotional content
    const heavyIndicators = ['worried', 'scared', 'anxious', 'stressed', 'overwhelmed', 'sad'];
    for (const turn of turns.filter((t) => t.role === 'user')) {
      for (const indicator of heavyIndicators) {
        if (turn.content.toLowerCase().includes(indicator)) {
          // Extract context
          const match = turn.content.match(new RegExp(`\\b\\w+\\s+${indicator}\\s+(?:about\\s+)?([^.!?]+)`, 'i'));
          if (match) {
            topics.push(match[1].slice(0, 50));
          }
        }
      }
    }

    return [...new Set(topics)].slice(0, 3);
  }

  // Subsystem getters
  private getAssociativeMemory(userId: string): AssociativeMemory {
    if (!this.associativeMemories.has(userId)) {
      this.associativeMemories.set(userId, getAssociativeMemory(userId));
    }
    return this.associativeMemories.get(userId)!;
  }

  private getEmotionalThreading(userId: string): EmotionalThreading {
    if (!this.emotionalThreading.has(userId)) {
      this.emotionalThreading.set(userId, getEmotionalThreading());
    }
    return this.emotionalThreading.get(userId)!;
  }

  private getPatternDetector(userId: string): BehavioralPatternDetector {
    if (!this.patternDetectors.has(userId)) {
      this.patternDetectors.set(userId, getBehavioralPatternDetector());
    }
    return this.patternDetectors.get(userId)!;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultOrchestrator: MemoryOrchestrator | null = null;

export function getMemoryOrchestrator(): MemoryOrchestrator {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new MemoryOrchestrator();
  }
  return defaultOrchestrator;
}

export function resetMemoryOrchestrator(): void {
  defaultOrchestrator = null;
}

export default {
  MemoryOrchestrator,
  getMemoryOrchestrator,
  resetMemoryOrchestrator,
};

