/**
 * Unified Conversation Integration
 *
 * Single entry point for all conversation humanization in the voice agent.
 * This replaces the multiple scattered calls to various orchestrators.
 *
 * Usage:
 * ```typescript
 * // At session start
 * const session = createConversationSession(sessionId, userId, personaId);
 *
 * // For each turn
 * const result = await session.processTurn({
 *   userMessage,
 *   rawResponse,
 *   emotion,
 *   topic,
 * });
 *
 * // Use result.text and result.ssml for TTS
 * ```
 *
 * @module @ferni/conversation/unified-integration
 */

import { createLogger } from '../utils/safe-logger.js';

// Unified orchestrator (the single source of truth)
import {
  getConversationOrchestrator,
  resetConversationOrchestrator,
  type ConversationOrchestrator,
  type OrchestratorInput,
  type OrchestratorOutput,
} from './orchestrator/index.js';

// Session lifecycle management
import {
  onSessionStart as startHumanizationSession,
  onSessionEnd as endHumanizationSession,
  processUserMessage,
  recordComfortEvent,
  getSessionState,
  type HumanizationSessionState,
} from './humanization/voice-agent-integration.js';

// Advanced humanization (10 deep capabilities)
import {
  initAdvancedHumanization,
  cleanupAdvancedHumanization,
  getAdvancedHumanizationState,
  type SessionStartResult,
} from './advanced-humanization-integration.js';

// Signal emitter for frontend EQ
import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';

const log = createLogger({ module: 'UnifiedConversation' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSessionConfig {
  personaId: string;
  sessionId: string;
  userId: string;
  sessionCount?: number;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

export interface TurnInput {
  userMessage: string;
  rawResponse: string;
  userEmotion?: string;
  topic?: string;
  wasPersonalSharing?: boolean;
  isSeriousContext?: boolean;
  sessionData?: Record<string, unknown>;
}

export interface TurnResult {
  // Final humanized output
  text: string;
  ssml: string;

  // What was applied
  appliedFeatures: string[];

  // Guidance for delivery
  pacing: 'faster' | 'normal' | 'slower';
  emotionalTone?: string;

  // Optional additions
  memoryCallback?: { text: string; ssml: string };
  followUpQuestion?: { text: string; ssml: string };

  // Meta
  confidence: number;
  timing: { total: number; analysis: number; intelligence: number; humanization: number };
}

export interface ConversationSession {
  // Session info
  sessionId: string;
  userId: string;
  personaId: string;

  // State accessors
  getState: () => SessionState;
  getTurnCount: () => number;
  getComfortLevel: () => number;

  // Main processing
  processTurn: (input: TurnInput) => Promise<TurnResult>;

  // Event recording
  recordVulnerability: () => void;
  recordLaughter: () => void;
  recordBreakthrough: () => void;

  // Lifecycle
  end: () => void;
}

interface SessionState {
  turnCount: number;
  sessionMinutes: number;
  comfortLevel: number;
  relationshipStage: string;
  recentTopics: string[];
  mood: {
    energy: number;
    engagement: number;
    emotionalLoad: number;
  };
}

// ============================================================================
// SESSION FACTORY
// ============================================================================

const activeSessions = new Map<string, ConversationSessionImpl>();

class ConversationSessionImpl implements ConversationSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly personaId: string;

  private orchestrator: ConversationOrchestrator;
  private startTime: number;
  private turnCount = 0;
  private comfortLevel = 0.25;
  private recentTopics: string[] = [];
  private sessionCount: number;
  private relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  constructor(config: ConversationSessionConfig) {
    this.sessionId = config.sessionId;
    this.userId = config.userId;
    this.personaId = config.personaId;
    this.sessionCount = config.sessionCount ?? 0;
    this.relationshipStage = config.relationshipStage ?? 'acquaintance';
    this.startTime = Date.now();

    // Initialize the unified orchestrator
    this.orchestrator = getConversationOrchestrator(this.sessionId);
    this.orchestrator.setPersona(this.personaId);

    // Initialize humanization session
    startHumanizationSession(this.sessionId, this.userId, this.personaId, {
      relationshipStage: this.relationshipStage,
      enableAdvancedHumanization: true,
    });

    // Initialize advanced humanization
    initAdvancedHumanization({
      sessionId: this.sessionId,
      userId: this.userId,
      relationshipDepth: this.mapRelationshipDepth(this.relationshipStage),
    });

    log.info(
      { sessionId: this.sessionId, userId: this.userId, personaId: this.personaId },
      '🎭 Unified conversation session started'
    );
  }

  getState(): SessionState {
    const humanizationState = getSessionState(this.sessionId);
    const advancedState = getAdvancedHumanizationState(this.sessionId);

    // Safely access aftercare from orchestratorState if it exists
    const orchestratorState = advancedState?.orchestratorState;
    const emotionalDebt = orchestratorState?.aftercare?.emotionalDebt ?? 0;

    return {
      turnCount: this.turnCount,
      sessionMinutes: Math.floor((Date.now() - this.startTime) / 60000),
      comfortLevel: humanizationState?.comfortLevel ?? this.comfortLevel,
      relationshipStage: this.relationshipStage,
      recentTopics: this.recentTopics,
      mood: {
        energy: 1 - emotionalDebt, // High debt = low energy
        engagement: 0.7,
        emotionalLoad: emotionalDebt,
      },
    };
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  getComfortLevel(): number {
    return getSessionState(this.sessionId)?.comfortLevel ?? this.comfortLevel;
  }

  async processTurn(input: TurnInput): Promise<TurnResult> {
    this.turnCount++;

    // Update topics
    if (input.topic) {
      this.recentTopics.unshift(input.topic);
      if (this.recentTopics.length > 5) {
        this.recentTopics.pop();
      }
    }

    // Process user message through humanization subsystems
    processUserMessage(this.sessionId, input.userMessage, {
      voiceEmotion: input.userEmotion ? { primary: input.userEmotion, confidence: 0.8 } : undefined,
      topic: input.topic,
    });

    // Build orchestrator input
    const orchestratorInput: OrchestratorInput = {
      personaId: this.personaId,
      sessionId: this.sessionId,
      userId: this.userId,
      turnNumber: this.turnCount,
      sessionMinutes: Math.floor((Date.now() - this.startTime) / 60000),
      sessionCount: this.sessionCount,
      userMessage: input.userMessage,
      userEmotion: input.userEmotion,
      topic: input.topic,
      rawResponse: input.rawResponse,
      wasPersonalSharing: input.wasPersonalSharing,
      isSeriousContext: input.isSeriousContext,
      relationshipStage: this.relationshipStage,
      sessionData: input.sessionData,
    };

    // Run unified orchestration
    const output = await this.orchestrator.orchestrate(orchestratorInput);

    // Map to result
    return this.mapToResult(output);
  }

  recordVulnerability(): void {
    recordComfortEvent(this.sessionId, 'user_shared_vulnerability');
    void humanizationSignalEmitter.vulnerability(0.8);
  }

  recordLaughter(): void {
    recordComfortEvent(this.sessionId, 'shared_laughter');
  }

  recordBreakthrough(): void {
    void humanizationSignalEmitter.breakthrough(0.9);
  }

  end(): void {
    // Cleanup
    endHumanizationSession(this.sessionId);
    cleanupAdvancedHumanization(this.sessionId);
    resetConversationOrchestrator(this.sessionId);
    activeSessions.delete(this.sessionId);

    log.info({ sessionId: this.sessionId, turns: this.turnCount }, '🎭 Session ended');
  }

  private mapToResult(output: OrchestratorOutput): TurnResult {
    // Extract confidence from metadata
    const confidence = output.metadata?.confidence?.overall ?? 0.5;

    return {
      text: output.text,
      ssml: output.ssml,
      // appliedFeatures is string[] in OrchestratorOutput
      appliedFeatures: output.appliedFeatures ?? [],
      // pacing is at top level
      pacing: output.pacing ?? 'normal',
      // emotionalGuidance is at top level
      emotionalTone: output.emotionalGuidance?.suggestedTone,
      // Additions are at top level
      memoryCallback: output.memoryCallback,
      followUpQuestion: output.followUpQuestion,
      confidence,
      timing: output.metadata?.timing ?? {
        total: 0,
        analysis: 0,
        intelligence: 0,
        humanization: 0,
      },
    };
  }

  private mapRelationshipDepth(stage: string): 'new' | 'developing' | 'established' | 'deep' {
    const map: Record<string, 'new' | 'developing' | 'established' | 'deep'> = {
      stranger: 'new',
      acquaintance: 'developing',
      friend: 'established',
      trusted_advisor: 'deep',
    };
    return map[stage] ?? 'developing';
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a new conversation session
 * This is the SINGLE entry point for all conversation humanization
 */
export function createConversationSession(config: ConversationSessionConfig): ConversationSession {
  // Check for existing session
  if (activeSessions.has(config.sessionId)) {
    log.warn({ sessionId: config.sessionId }, 'Session already exists, returning existing');
    return activeSessions.get(config.sessionId)!;
  }

  const session = new ConversationSessionImpl(config);
  activeSessions.set(config.sessionId, session);
  return session;
}

/**
 * Get an existing session
 */
export function getConversationSession(sessionId: string): ConversationSession | null {
  return activeSessions.get(sessionId) ?? null;
}

/**
 * End and cleanup a session
 */
export function endConversationSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.end();
  }
}

/**
 * Get all active sessions (for debugging)
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}

// ============================================================================
// CONVENIENCE: Quick humanization without session management
// ============================================================================

/**
 * Quick one-shot humanization (for testing or simple use cases)
 * Prefer createConversationSession for production use
 */
export async function quickHumanize(
  rawResponse: string,
  context: {
    personaId: string;
    userMessage: string;
    userEmotion?: string;
    topic?: string;
    turnNumber?: number;
  }
): Promise<{ text: string; ssml: string }> {
  const orchestrator = getConversationOrchestrator('quick-session');
  orchestrator.setPersona(context.personaId);

  const output = await orchestrator.orchestrate({
    personaId: context.personaId,
    sessionId: 'quick-session',
    turnNumber: context.turnNumber ?? 1,
    sessionMinutes: 0,
    userMessage: context.userMessage,
    userEmotion: context.userEmotion,
    topic: context.topic,
    rawResponse,
  });

  return { text: output.text, ssml: output.ssml };
}
