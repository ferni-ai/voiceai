/**
 * Handoff State Manager
 *
 * Unified, session-scoped state management for handoffs.
 * Replaces the problematic global state that caused cross-session contamination.
 *
 * Key improvements:
 * - Session-scoped ONLY (no global state)
 * - Event-driven state changes (observable)
 * - Immutable state snapshots for consistency
 * - Automatic cleanup on session end
 *
 * @module handoff/handoff-state-manager
 */

import { EventEmitter } from 'events';
import type { AgentId } from '../../services/agent-bus.js';
import { normalizeAgentIdSync } from '../../personas/agent-directory.js';
import { getLogger } from '../../utils/safe-logger.js';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handoff record for history tracking.
 */
export interface HandoffRecord {
  timestamp: number;
  from: AgentId;
  to: AgentId;
  reason: string;
  duration?: number;
  success?: boolean;
  traceId?: string;
}

/**
 * Immutable state snapshot.
 */
export interface HandoffStateSnapshot {
  readonly sessionId: string;
  readonly currentAgent: AgentId;
  readonly previousAgent: AgentId | null;
  readonly isInProgress: boolean;
  readonly targetAgent: AgentId | null;
  readonly handoffStartTime: number | null;
  readonly lastHandoffTime: number;
  readonly metPersonas: ReadonlySet<string>;
  readonly handoffCount: number;
}

/**
 * State change event types.
 */
export type StateChangeType =
  | 'agent_changed'
  | 'handoff_started'
  | 'handoff_completed'
  | 'handoff_failed'
  | 'persona_met'
  | 'state_reset';

/**
 * State change event payload.
 */
export interface StateChangeEvent {
  type: StateChangeType;
  sessionId: string;
  timestamp: number;
  previousState: HandoffStateSnapshot;
  newState: HandoffStateSnapshot;
  data?: Record<string, unknown>;
}

// ============================================================================
// STATE MANAGER CLASS
// ============================================================================

/**
 * Session-scoped handoff state manager.
 *
 * Each session gets its own instance. No global state sharing.
 *
 * @example
 * ```typescript
 * // Get manager for session
 * const manager = HandoffStateManager.getForSession(sessionId);
 *
 * // Subscribe to state changes
 * manager.onChange((event) => {
 *   console.log(`State changed: ${event.type}`);
 * });
 *
 * // Start handoff
 * manager.startHandoff('peter-john', 'User wants research help');
 *
 * // Complete handoff
 * manager.completeHandoff('peter-john');
 *
 * // Get current state
 * const state = manager.getSnapshot();
 * ```
 */
export class HandoffStateManager {
  // ========================================================================
  // STATIC INSTANCE MANAGEMENT
  // ========================================================================

  private static instances = new Map<string, HandoffStateManager>();
  private static readonly MAX_INSTANCES = 100;
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Get or create state manager for a session.
   */
  static getForSession(sessionId: string): HandoffStateManager {
    let manager = this.instances.get(sessionId);

    if (!manager) {
      // Cleanup old instances if at capacity
      if (this.instances.size >= this.MAX_INSTANCES) {
        this.evictOldestInstance();
      }

      manager = new HandoffStateManager(sessionId);
      this.instances.set(sessionId, manager);

      // Start cleanup timer if not running
      if (!this.cleanupTimer) {
        this.cleanupTimer = setInterval(() => this.cleanupStale(), this.CLEANUP_INTERVAL_MS);
      }

      log.debug(
        { sessionId, totalInstances: this.instances.size },
        '📋 Created new HandoffStateManager'
      );
    }

    manager.touch();
    return manager;
  }

  /**
   * Check if manager exists for session.
   */
  static hasSession(sessionId: string): boolean {
    return this.instances.has(sessionId);
  }

  /**
   * Remove manager for a session.
   */
  static removeSession(sessionId: string): void {
    const manager = this.instances.get(sessionId);
    if (manager) {
      manager.dispose();
      this.instances.delete(sessionId);
      log.debug({ sessionId }, '🗑️ Removed HandoffStateManager');
    }
  }

  /**
   * Get all active session IDs.
   */
  static getActiveSessions(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Evict the oldest instance.
   */
  private static evictOldestInstance(): void {
    let oldestSessionId: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, manager] of this.instances) {
      if (manager.lastActivity < oldestTime) {
        oldestTime = manager.lastActivity;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      this.removeSession(oldestSessionId);
      log.debug({ sessionId: oldestSessionId }, '⏰ Evicted oldest session');
    }
  }

  /**
   * Cleanup stale sessions.
   */
  private static cleanupStale(): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [sessionId, manager] of this.instances) {
      if (now - manager.lastActivity > this.SESSION_TTL_MS) {
        stale.push(sessionId);
      }
    }

    for (const sessionId of stale) {
      this.removeSession(sessionId);
    }

    if (stale.length > 0) {
      log.info({ count: stale.length }, '🧹 Cleaned up stale sessions');
    }
  }

  // ========================================================================
  // INSTANCE STATE
  // ========================================================================

  private readonly sessionId: string;
  private events = new EventEmitter();
  private lastActivity: number = Date.now();

  // Core state
  private currentAgent: AgentId = 'ferni';
  private previousAgent: AgentId | null = null;
  private isInProgress: boolean = false;
  private targetAgent: AgentId | null = null;
  private handoffStartTime: number | null = null;
  private lastHandoffTime: number = 0;
  private metPersonas = new Set<string>(['ferni']);
  private handoffHistory: HandoffRecord[] = [];

  // Rate limiting
  private readonly debounceMs = HANDOFF_TIMING.DEBOUNCE_MS;

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

  private constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.events.setMaxListeners(20);
  }

  // ========================================================================
  // STATE ACCESS
  // ========================================================================

  /**
   * Get immutable state snapshot.
   */
  getSnapshot(): HandoffStateSnapshot {
    return {
      sessionId: this.sessionId,
      currentAgent: this.currentAgent,
      previousAgent: this.previousAgent,
      isInProgress: this.isInProgress,
      targetAgent: this.targetAgent,
      handoffStartTime: this.handoffStartTime,
      lastHandoffTime: this.lastHandoffTime,
      metPersonas: new Set(this.metPersonas),
      handoffCount: this.handoffHistory.length,
    };
  }

  /**
   * Get current agent.
   */
  getCurrentAgent(): AgentId {
    return this.currentAgent;
  }

  /**
   * Check if handoff is in progress.
   */
  isHandoffInProgress(): boolean {
    return this.isInProgress;
  }

  /**
   * Get target agent (if handoff in progress).
   */
  getTargetAgent(): AgentId | null {
    return this.targetAgent;
  }

  /**
   * Check if persona has been met this session.
   */
  hasMetPersona(personaId: string): boolean {
    const canonical = normalizeAgentIdSync(personaId);
    return this.metPersonas.has(canonical);
  }

  /**
   * Get handoff history.
   */
  getHistory(): readonly HandoffRecord[] {
    return this.handoffHistory;
  }

  // ========================================================================
  // STATE MUTATIONS
  // ========================================================================

  /**
   * Start a handoff.
   */
  startHandoff(targetAgent: string, reason: string): { allowed: boolean; error?: string } {
    this.touch();
    const canonical = normalizeAgentIdSync(targetAgent) as AgentId;
    const previousState = this.getSnapshot();

    // Check if already with this agent
    if (this.currentAgent === canonical) {
      return { allowed: false, error: `Already with ${canonical}` };
    }

    // Check rate limiting
    const now = Date.now();
    if (now - this.lastHandoffTime < this.debounceMs) {
      return { allowed: false, error: 'Rate limited' };
    }

    // Check if already in progress
    if (this.isInProgress) {
      return { allowed: false, error: `Handoff already in progress to ${this.targetAgent}` };
    }

    // Update state
    this.previousAgent = this.currentAgent;
    this.targetAgent = canonical;
    this.isInProgress = true;
    this.handoffStartTime = now;

    // Emit event
    this.emitChange('handoff_started', previousState, { targetAgent: canonical, reason });

    log.info(
      { sessionId: this.sessionId, from: this.previousAgent, to: canonical, reason },
      '🔄 Handoff started'
    );

    return { allowed: true };
  }

  /**
   * Complete a handoff successfully.
   */
  completeHandoff(targetAgent: string, traceId?: string): void {
    this.touch();
    const canonical = normalizeAgentIdSync(targetAgent) as AgentId;
    const previousState = this.getSnapshot();
    const now = Date.now();

    // Verify this is the expected target
    if (this.targetAgent !== canonical) {
      log.warn(
        { expected: this.targetAgent, received: canonical },
        '⚠️ Completing handoff with unexpected target'
      );
    }

    // Record in history
    const record: HandoffRecord = {
      timestamp: now,
      from: this.previousAgent || this.currentAgent,
      to: canonical,
      reason: 'completed',
      duration: this.handoffStartTime ? now - this.handoffStartTime : undefined,
      success: true,
      traceId,
    };
    this.handoffHistory.push(record);

    // Update state
    this.currentAgent = canonical;
    this.isInProgress = false;
    this.targetAgent = null;
    this.handoffStartTime = null;
    this.lastHandoffTime = now;
    this.metPersonas.add(canonical);

    // Emit event
    this.emitChange('handoff_completed', previousState, { record });

    log.info(
      { sessionId: this.sessionId, to: canonical, durationMs: record.duration },
      '✅ Handoff completed'
    );
  }

  /**
   * Fail a handoff.
   */
  failHandoff(error: string, traceId?: string): void {
    this.touch();
    const previousState = this.getSnapshot();
    const now = Date.now();

    // Record in history
    const record: HandoffRecord = {
      timestamp: now,
      from: this.previousAgent || this.currentAgent,
      to: this.targetAgent || ('unknown' as AgentId),
      reason: error,
      duration: this.handoffStartTime ? now - this.handoffStartTime : undefined,
      success: false,
      traceId,
    };
    this.handoffHistory.push(record);

    // Reset state (stay with current agent)
    this.isInProgress = false;
    this.targetAgent = null;
    this.handoffStartTime = null;

    // Emit event
    this.emitChange('handoff_failed', previousState, { error, record });

    log.error(
      { sessionId: this.sessionId, error, from: this.currentAgent },
      '❌ Handoff failed'
    );
  }

  /**
   * Set current agent directly (for recovery/sync).
   */
  setCurrentAgent(agent: string): void {
    this.touch();
    const canonical = normalizeAgentIdSync(agent) as AgentId;
    const previousState = this.getSnapshot();

    if (this.currentAgent !== canonical) {
      this.previousAgent = this.currentAgent;
      this.currentAgent = canonical;
      this.metPersonas.add(canonical);

      this.emitChange('agent_changed', previousState, { agent: canonical });

      log.debug(
        { sessionId: this.sessionId, agent: canonical },
        '📋 Current agent set directly'
      );
    }
  }

  /**
   * Mark a persona as met.
   */
  markPersonaAsMet(personaId: string): void {
    this.touch();
    const canonical = normalizeAgentIdSync(personaId);
    const previousState = this.getSnapshot();

    if (!this.metPersonas.has(canonical)) {
      this.metPersonas.add(canonical);
      this.emitChange('persona_met', previousState, { personaId: canonical });
    }
  }

  /**
   * Reset state for new conversation.
   */
  reset(startingAgent: AgentId = 'ferni'): void {
    this.touch();
    const previousState = this.getSnapshot();

    this.currentAgent = startingAgent;
    this.previousAgent = null;
    this.isInProgress = false;
    this.targetAgent = null;
    this.handoffStartTime = null;
    this.lastHandoffTime = 0;
    this.metPersonas = new Set([startingAgent]);
    this.handoffHistory = [];

    this.emitChange('state_reset', previousState, { startingAgent });

    log.info({ sessionId: this.sessionId, startingAgent }, '🔄 State reset');
  }

  // ========================================================================
  // EVENT SUBSCRIPTION
  // ========================================================================

  /**
   * Subscribe to state changes.
   */
  onChange(callback: (event: StateChangeEvent) => void): () => void {
    this.events.on('change', callback);
    return () => this.events.off('change', callback);
  }

  /**
   * Subscribe to specific state change type.
   */
  on(type: StateChangeType, callback: (event: StateChangeEvent) => void): () => void {
    const handler = (event: StateChangeEvent) => {
      if (event.type === type) {
        callback(event);
      }
    };
    this.events.on('change', handler);
    return () => this.events.off('change', handler);
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  /**
   * Update last activity time.
   */
  private touch(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Emit a state change event.
   */
  private emitChange(
    type: StateChangeType,
    previousState: HandoffStateSnapshot,
    data?: Record<string, unknown>
  ): void {
    const event: StateChangeEvent = {
      type,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      previousState,
      newState: this.getSnapshot(),
      data,
    };

    this.events.emit('change', event);
  }

  /**
   * Dispose manager and clean up resources.
   */
  private dispose(): void {
    this.events.removeAllListeners();
    this.handoffHistory = [];
    this.metPersonas.clear();
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get state manager for session (alias for getForSession).
 */
export function getHandoffManager(sessionId: string): HandoffStateManager {
  return HandoffStateManager.getForSession(sessionId);
}

/**
 * Check if session has state manager.
 */
export function hasHandoffManager(sessionId: string): boolean {
  return HandoffStateManager.hasSession(sessionId);
}

/**
 * Remove state manager for session.
 */
export function removeHandoffManager(sessionId: string): void {
  HandoffStateManager.removeSession(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HandoffStateManager;

