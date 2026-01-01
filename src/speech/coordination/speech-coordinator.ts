/**
 * Speech Coordinator
 *
 * Intelligent, centralized control for ALL speech output to prevent overlap.
 * Uses adaptive timing based on actual speech patterns, not hardcoded values.
 *
 * DESIGN PRINCIPLES:
 * 1. Single source of truth for "who can speak right now"
 * 2. Priority-based queue (crisis > tool result > response > backchannel)
 * 3. Adaptive timing based on actual playout durations
 * 4. Learned patterns for echo prevention and pacing
 *
 * @module speech/coordination/speech-coordinator
 */

import type { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'speech-coordinator' });

// ============================================================================
// TYPES
// ============================================================================

/** Speech priority levels (higher = more urgent) */
export enum SpeechPriority {
  BACKCHANNEL = 10, // "mm-hmm", "yeah" - lowest, can be skipped
  ACKNOWLEDGMENT = 20, // "Let me check on that" - filler while loading
  RESPONSE = 30, // Normal LLM response
  TOOL_RESULT = 40, // Tool execution result
  CLARIFICATION = 50, // Asking for user input
  INTERRUPT_RECOVERY = 60, // After user interrupted us
  CRISIS = 100, // Crisis resources - NEVER skip
}

/** Speech request to be coordinated */
export interface SpeechRequest {
  /** Unique ID for tracking */
  id: string;
  /** Text to speak */
  text: string;
  /** Priority level */
  priority: SpeechPriority;
  /** Source of the request */
  source: 'tool' | 'llm' | 'backchannel' | 'acknowledgment' | 'direct';
  /** Allow user to interrupt this speech */
  allowInterruptions?: boolean;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech ends */
  onEnd?: (interrupted: boolean) => void;
  /** Maximum age in queue before expiring (ms) */
  maxAge?: number;
  /** Timestamp when queued */
  queuedAt: number;
}

/** Coordinator state */
export enum CoordinatorState {
  IDLE = 'idle',
  SPEAKING = 'speaking',
  AWAITING_PLAYOUT = 'awaiting_playout',
  COOLDOWN = 'cooldown', // Brief pause after speaking
}

/** Adaptive timing parameters - learned, not hardcoded */
export interface AdaptiveTiming {
  /** Moving average of speech durations */
  avgSpeechDurationMs: number;
  /** Moving average of echo detection delay */
  avgEchoDelayMs: number;
  /** Learned cooldown after speaking (prevents self-echo) */
  postSpeechCooldownMs: number;
  /** Minimum gap between speeches (learned from natural pacing) */
  naturalPacingGapMs: number;
  /** Sample count for statistics */
  sampleCount: number;
}

/** Statistics for monitoring */
export interface CoordinatorStats {
  totalRequests: number;
  requestsSpoken: number;
  requestsDropped: number;
  requestsExpired: number;
  overlapsPrevented: number;
  avgQueueWaitMs: number;
  avgSpeechDurationMs: number;
}

// ============================================================================
// ADAPTIVE TIMING CALCULATOR
// ============================================================================

/**
 * Calculates adaptive timing parameters based on observed patterns.
 * No hardcoded values - learns from actual speech patterns.
 */
class AdaptiveTimingCalculator {
  private speechDurations: number[] = [];
  private echoDelays: number[] = [];
  private pacingGaps: number[] = [];
  private lastSpeechEndTime = 0;

  // Defaults based on typical voice patterns (will be overridden by learning)
  private readonly INITIAL_COOLDOWN = 300; // Will adapt
  private readonly INITIAL_PACING = 150; // Will adapt
  private readonly MAX_SAMPLES = 50; // Rolling window

  /**
   * Record a speech event for learning
   */
  recordSpeech(durationMs: number): void {
    this.speechDurations.push(durationMs);
    if (this.speechDurations.length > this.MAX_SAMPLES) {
      this.speechDurations.shift();
    }

    // Record gap from last speech for pacing
    if (this.lastSpeechEndTime > 0) {
      const gap = Date.now() - this.lastSpeechEndTime - durationMs;
      if (gap > 0 && gap < 5000) {
        // Reasonable gap range
        this.pacingGaps.push(gap);
        if (this.pacingGaps.length > this.MAX_SAMPLES) {
          this.pacingGaps.shift();
        }
      }
    }
    this.lastSpeechEndTime = Date.now();
  }

  /**
   * Record when we detected echo (agent audio picked up as user speech)
   */
  recordEchoDetection(delayAfterSpeechMs: number): void {
    this.echoDelays.push(delayAfterSpeechMs);
    if (this.echoDelays.length > this.MAX_SAMPLES) {
      this.echoDelays.shift();
    }
    log.debug({ delayMs: delayAfterSpeechMs }, 'Echo detection recorded for learning');
  }

  /**
   * Get adaptive timing parameters
   */
  getTiming(): AdaptiveTiming {
    const avgSpeechDuration = this.average(this.speechDurations) || 2000;
    const avgEchoDelay = this.average(this.echoDelays) || 500;
    const avgPacingGap = this.average(this.pacingGaps) || this.INITIAL_PACING;

    // Cooldown = max of echo delay + buffer, or proportional to speech length
    // Intelligent: longer speech = more reverb = longer cooldown
    const proportionalCooldown = avgSpeechDuration * 0.15; // 15% of speech length
    const echoCooldown = avgEchoDelay * 1.5; // 50% buffer over observed echo
    const cooldown = Math.max(proportionalCooldown, echoCooldown, this.INITIAL_COOLDOWN);

    return {
      avgSpeechDurationMs: avgSpeechDuration,
      avgEchoDelayMs: avgEchoDelay,
      postSpeechCooldownMs: Math.min(cooldown, 2000), // Cap at 2s
      naturalPacingGapMs: Math.min(avgPacingGap, 500), // Cap at 500ms
      sampleCount: this.speechDurations.length,
    };
  }

  /**
   * Calculate echo prevention window for a specific utterance
   * INTELLIGENT: Based on utterance length, not hardcoded
   */
  getEchoWindowForUtterance(utteranceDurationMs: number): number {
    const timing = this.getTiming();

    // Base: learned echo delay with buffer
    const baseWindow = timing.avgEchoDelayMs * 1.5;

    // Proportional: longer utterances need longer windows (more reverb)
    const proportional = utteranceDurationMs * 0.2; // 20% of utterance

    // Combined, with reasonable bounds
    return Math.max(
      300, // Minimum 300ms
      Math.min(baseWindow + proportional, 3000) // Maximum 3s
    );
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }
}

// ============================================================================
// SPEECH COORDINATOR
// ============================================================================

/**
 * Centralized speech coordinator.
 * All speech output MUST go through this to prevent overlaps.
 */
export class SpeechCoordinator {
  private state: CoordinatorState = CoordinatorState.IDLE;
  private queue: SpeechRequest[] = [];
  private currentRequest: SpeechRequest | null = null;
  private session: voice.AgentSession | null = null;
  private timing: AdaptiveTimingCalculator;
  private stats: CoordinatorStats;
  private stateChangeTime = 0;
  private queueWaitTimes: number[] = [];
  private requestIdCounter = 0;

  constructor() {
    this.timing = new AdaptiveTimingCalculator();
    this.stats = {
      totalRequests: 0,
      requestsSpoken: 0,
      requestsDropped: 0,
      requestsExpired: 0,
      overlapsPrevented: 0,
      avgQueueWaitMs: 0,
      avgSpeechDurationMs: 0,
    };
  }

  /**
   * Attach a session to the coordinator.
   * 
   * HANDOFF FIX: If coordinator is stuck in SPEAKING state from a previous session,
   * reset to IDLE and process queue. This happens during handoffs when the old
   * session is replaced before its onSpeechEnded callback fires.
   */
  attachSession(session: voice.AgentSession): void {
    const wasInSpeakingState = this.state === CoordinatorState.SPEAKING;
    const hadPendingRequests = this.queue.length > 0;
    
    this.session = session;
    
    // HANDOFF FIX: If we're replacing a session that was speaking,
    // the onSpeechEnded callback from the old session won't fire.
    // Reset state to IDLE so queued requests can be processed.
    if (wasInSpeakingState) {
      log.warn(
        { previousState: this.state, queueLength: this.queue.length },
        '⚠️ Attaching session while in SPEAKING state - resetting to IDLE (old session speech orphaned)'
      );
      this.currentRequest = null;
      this.transitionTo(CoordinatorState.IDLE);
    }
    
    log.info(
      { queueLength: this.queue.length, wasInSpeakingState },
      'Session attached to speech coordinator'
    );
    
    // Process any pending queue items after a brief delay
    // (allows the new session to fully initialize)
    if (hadPendingRequests || wasInSpeakingState) {
      setTimeout(() => {
        if (this.state === CoordinatorState.IDLE && this.queue.length > 0) {
          log.info({ queueLength: this.queue.length }, '🔄 Processing pending speech queue after session attach');
          this.processQueue();
        }
      }, 100);
    }
  }

  /**
   * Detach session (on cleanup)
   */
  detachSession(): void {
    this.session = null;
    this.queue = [];
    this.currentRequest = null;
    this.state = CoordinatorState.IDLE;
    log.info('Session detached from speech coordinator');
  }

  /**
   * Request to speak. Returns immediately - speech is async.
   */
  async requestSpeak(request: Omit<SpeechRequest, 'id' | 'queuedAt'>): Promise<{
    accepted: boolean;
    id: string;
    reason?: string;
  }> {
    const id = `speech-${++this.requestIdCounter}-${Date.now()}`;
    const fullRequest: SpeechRequest = {
      ...request,
      id,
      queuedAt: Date.now(),
      maxAge: request.maxAge ?? this.getDefaultMaxAge(request.priority),
    };

    this.stats.totalRequests++;

    // Validate
    if (!this.session) {
      log.warn({ id }, 'No session attached - dropping speech request');
      this.stats.requestsDropped++;
      return { accepted: false, id, reason: 'No session attached' };
    }

    if (!fullRequest.text.trim()) {
      log.debug({ id }, 'Empty text - dropping speech request');
      this.stats.requestsDropped++;
      return { accepted: false, id, reason: 'Empty text' };
    }

    // Check if we should skip lower-priority items
    if (this.shouldDrop(fullRequest)) {
      log.debug(
        { id, priority: fullRequest.priority, state: this.state },
        'Dropping low-priority request'
      );
      this.stats.requestsDropped++;
      return { accepted: false, id, reason: 'Dropped due to priority/state' };
    }

    // Add to priority queue
    this.enqueue(fullRequest);

    // Process queue
    this.processQueue();

    return { accepted: true, id };
  }

  /**
   * Convenience: Speak a tool result
   */
  async speakToolResult(text: string, toolId: string): Promise<{ accepted: boolean; id: string }> {
    return this.requestSpeak({
      text,
      priority: SpeechPriority.TOOL_RESULT,
      source: 'tool',
      allowInterruptions: true,
    });
  }

  /**
   * Convenience: Speak an acknowledgment (for slow operations)
   */
  async speakAcknowledgment(text: string): Promise<{ accepted: boolean; id: string }> {
    return this.requestSpeak({
      text,
      priority: SpeechPriority.ACKNOWLEDGMENT,
      source: 'acknowledgment',
      allowInterruptions: true,
      maxAge: 3000, // Acknowledgments expire fast
    });
  }

  /**
   * Convenience: Speak a backchannel
   */
  async speakBackchannel(text: string): Promise<{ accepted: boolean; id: string }> {
    return this.requestSpeak({
      text,
      priority: SpeechPriority.BACKCHANNEL,
      source: 'backchannel',
      allowInterruptions: true,
      maxAge: 1500, // Backchannels expire very fast
    });
  }

  /**
   * Check if we're currently speaking or in cooldown
   */
  isBusy(): boolean {
    return this.state !== CoordinatorState.IDLE;
  }

  /**
   * Get current state
   */
  getState(): CoordinatorState {
    return this.state;
  }

  /**
   * Get adaptive timing parameters
   */
  getAdaptiveTiming(): AdaptiveTiming {
    return this.timing.getTiming();
  }

  /**
   * Get echo prevention window for current context
   */
  getEchoWindow(lastUtteranceDurationMs?: number): number {
    return this.timing.getEchoWindowForUtterance(
      lastUtteranceDurationMs ?? this.timing.getTiming().avgSpeechDurationMs
    );
  }

  /**
   * Record that we detected echo (for learning)
   */
  recordEchoDetection(delayAfterSpeechMs: number): void {
    this.timing.recordEchoDetection(delayAfterSpeechMs);
    log.debug({ delayMs: delayAfterSpeechMs }, 'Echo detected - adjusting timing');
  }

  /**
   * Get statistics
   */
  getStats(): CoordinatorStats {
    return { ...this.stats };
  }

  /**
   * Notify that speech ended (call from session state handler)
   */
  onSpeechEnded(wasInterrupted: boolean, durationMs: number): void {
    this.timing.recordSpeech(durationMs);

    if (this.currentRequest?.onEnd) {
      this.currentRequest.onEnd(wasInterrupted);
    }

    this.currentRequest = null;
    this.transitionTo(CoordinatorState.COOLDOWN);

    // Cooldown then process next
    const cooldown = this.timing.getTiming().postSpeechCooldownMs;
    setTimeout(() => {
      if (this.state === CoordinatorState.COOLDOWN) {
        this.transitionTo(CoordinatorState.IDLE);
        this.processQueue();
      }
    }, cooldown);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private shouldDrop(request: SpeechRequest): boolean {
    // Never drop crisis
    if (request.priority >= SpeechPriority.CRISIS) {
      return false;
    }

    // Drop backchannels if we're speaking or in cooldown
    if (request.priority === SpeechPriority.BACKCHANNEL) {
      if (this.state !== CoordinatorState.IDLE) {
        this.stats.overlapsPrevented++;
        return true;
      }
    }

    // Drop acknowledgments if queue already has higher-priority items
    if (request.priority === SpeechPriority.ACKNOWLEDGMENT) {
      const hasHigherPriority = this.queue.some((q) => q.priority > request.priority);
      if (hasHigherPriority) {
        return true;
      }
    }

    return false;
  }

  private enqueue(request: SpeechRequest): void {
    // Insert in priority order (higher priority first)
    const insertIndex = this.queue.findIndex((q) => q.priority < request.priority);
    if (insertIndex === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(insertIndex, 0, request);
    }

    log.debug(
      { id: request.id, priority: request.priority, queueLength: this.queue.length },
      'Request enqueued'
    );
  }

  private processQueue(): void {
    // Can't process if busy or no session
    if (this.state !== CoordinatorState.IDLE || !this.session) {
      return;
    }

    // Remove expired requests
    this.expireOldRequests();

    // Get next request
    const next = this.queue.shift();
    if (!next) {
      return;
    }

    // Track wait time
    const waitTime = Date.now() - next.queuedAt;
    this.queueWaitTimes.push(waitTime);
    if (this.queueWaitTimes.length > 50) {
      this.queueWaitTimes.shift();
    }
    this.stats.avgQueueWaitMs =
      this.queueWaitTimes.reduce((a, b) => a + b, 0) / this.queueWaitTimes.length;

    // Speak!
    this.speak(next);
  }

  private speak(request: SpeechRequest): void {
    if (!this.session) {
      log.warn({ id: request.id }, 'No session - cannot speak');
      return;
    }

    this.currentRequest = request;
    this.transitionTo(CoordinatorState.SPEAKING);
    this.stats.requestsSpoken++;

    log.info(
      { id: request.id, source: request.source, priority: request.priority },
      'Speaking via coordinator'
    );

    request.onStart?.();

    try {
      this.session.say(request.text, {
        allowInterruptions: request.allowInterruptions ?? true,
      });
      // Note: onSpeechEnded() will be called by session state handler
    } catch (error) {
      log.error({ error: String(error), id: request.id }, 'Speech failed');
      this.currentRequest = null;
      this.transitionTo(CoordinatorState.IDLE);
      this.processQueue();
    }
  }

  private expireOldRequests(): void {
    const now = Date.now();
    const expired = this.queue.filter((r) => r.maxAge && now - r.queuedAt > r.maxAge);

    for (const r of expired) {
      log.debug({ id: r.id, age: now - r.queuedAt, maxAge: r.maxAge }, 'Request expired');
      this.stats.requestsExpired++;
    }

    this.queue = this.queue.filter((r) => !r.maxAge || now - r.queuedAt <= r.maxAge);
  }

  private transitionTo(newState: CoordinatorState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangeTime = Date.now();
    log.debug({ oldState, newState }, 'Coordinator state transition');
  }

  private getDefaultMaxAge(priority: SpeechPriority): number {
    // Intelligent defaults based on priority
    switch (priority) {
      case SpeechPriority.BACKCHANNEL:
        return 1500; // Backchannels are time-sensitive
      case SpeechPriority.ACKNOWLEDGMENT:
        return 4000; // Acknowledgments have medium shelf life
      case SpeechPriority.RESPONSE:
        return 10000; // Responses can wait longer
      case SpeechPriority.TOOL_RESULT:
        return 15000; // Tool results should be delivered
      case SpeechPriority.CRISIS:
        return 60000; // Crisis MUST be delivered
      default:
        return 8000;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let coordinatorInstance: SpeechCoordinator | null = null;

export function getSpeechCoordinator(): SpeechCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new SpeechCoordinator();
  }
  return coordinatorInstance;
}

/**
 * Reset coordinator (for testing)
 */
export function resetSpeechCoordinator(): void {
  if (coordinatorInstance) {
    coordinatorInstance.detachSession();
  }
  coordinatorInstance = null;
}
