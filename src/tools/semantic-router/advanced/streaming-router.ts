/**
 * Streaming Semantic Router
 *
 * Routes tool calls AS USER SPEAKS, not after they finish.
 * This enables:
 * - Early tool preparation (pre-fetch data)
 * - Confidence buildup visualization
 * - Interrupt handling (user changes mind mid-sentence)
 *
 * How it works:
 * 1. Receive partial transcripts as user speaks
 * 2. Incrementally build confidence for each tool
 * 3. Emit "likely", "probable", "certain" signals
 * 4. Pre-execute when certain (before user finishes)
 *
 * @module semantic-router/advanced/streaming-router
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticToolDefinition, SemanticRouterResult } from '../types.js';

const log = createLogger({ module: 'SemanticRouter.Streaming' });

// ============================================================================
// TYPES
// ============================================================================

export interface StreamingState {
  sessionId: string;
  startTime: number;

  // Accumulated transcript
  partialTranscript: string;
  wordCount: number;
  lastUpdateTime: number;

  // Confidence tracking per tool
  toolConfidences: Map<
    string,
    {
      confidence: number;
      trajectory: 'rising' | 'stable' | 'falling';
      firstDetectedAt: number;
      peakConfidence: number;
      wordAtPeak: number;
    }
  >;

  // Current best guess
  currentBest: {
    toolId: string | null;
    confidence: number;
    stableForMs: number;
  };

  // Signals emitted
  emittedSignals: Array<{
    type: 'likely' | 'probable' | 'certain' | 'changed' | 'cancelled';
    toolId: string | null;
    confidence: number;
    timestamp: number;
    wordCount: number;
  }>;

  // Final result (set when user stops speaking)
  finalResult?: SemanticRouterResult;
}

export interface StreamingSignal {
  type: 'likely' | 'probable' | 'certain' | 'changed' | 'cancelled';
  toolId: string | null;
  confidence: number;
  partialTranscript: string;
  wordCount: number;
  timeElapsedMs: number;

  // For "certain" signals, include args if we can extract them
  extractedArgs?: Record<string, unknown>;

  // Trajectory info
  trajectory?: 'rising' | 'stable' | 'falling';
  confidenceHistory?: number[];
}

export interface StreamingConfig {
  // Confidence thresholds
  likelyThreshold: number; // Emit "likely" signal (default: 0.4)
  probableThreshold: number; // Emit "probable" signal (default: 0.6)
  certainThreshold: number; // Emit "certain" signal (default: 0.85)

  // Stability requirements
  stableTimeMs: number; // How long confidence must be stable (default: 300ms)
  stableWordCount: number; // Min words before emitting "certain" (default: 3)

  // Early execution
  enableEarlyExecution: boolean; // Pre-execute on "certain" (default: true)
  earlyExecutionMinConfidence: number; // Min confidence for early exec (default: 0.9)

  // Debouncing
  debounceMs: number; // Debounce rapid updates (default: 50ms)
}

export type SignalCallback = (signal: StreamingSignal) => void;

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: StreamingConfig = {
  likelyThreshold: 0.4,
  probableThreshold: 0.6,
  certainThreshold: 0.85,
  stableTimeMs: 300,
  stableWordCount: 3,
  enableEarlyExecution: true,
  earlyExecutionMinConfidence: 0.9,
  debounceMs: 50,
};

// ============================================================================
// STREAMING ROUTER CLASS
// ============================================================================

export class StreamingRouter {
  private states: Map<string, StreamingState> = new Map();
  private config: StreamingConfig;
  private callbacks: Map<string, SignalCallback[]> = new Map();
  private tools: SemanticToolDefinition[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: Partial<StreamingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set available tools for routing
   */
  setTools(tools: SemanticToolDefinition[]): void {
    this.tools = tools;
  }

  /**
   * Start a streaming session
   */
  startSession(sessionId: string): StreamingState {
    const state: StreamingState = {
      sessionId,
      startTime: Date.now(),
      partialTranscript: '',
      wordCount: 0,
      lastUpdateTime: Date.now(),
      toolConfidences: new Map(),
      currentBest: {
        toolId: null,
        confidence: 0,
        stableForMs: 0,
      },
      emittedSignals: [],
    };

    this.states.set(sessionId, state);
    log.debug({ sessionId }, 'Streaming session started');

    return state;
  }

  /**
   * End a streaming session
   */
  endSession(sessionId: string): StreamingState | undefined {
    const state = this.states.get(sessionId);
    this.states.delete(sessionId);
    this.callbacks.delete(sessionId);

    // Clear any pending debounce timers
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }

    if (state) {
      log.debug(
        {
          sessionId,
          duration: Date.now() - state.startTime,
          signalsEmitted: state.emittedSignals.length,
          finalTool: state.currentBest.toolId,
        },
        'Streaming session ended'
      );
    }

    return state;
  }

  /**
   * Subscribe to signals for a session
   */
  onSignal(sessionId: string, callback: SignalCallback): () => void {
    const existing = this.callbacks.get(sessionId) || [];
    existing.push(callback);
    this.callbacks.set(sessionId, existing);

    // Return unsubscribe function
    return () => {
      const cbs = this.callbacks.get(sessionId) || [];
      const index = cbs.indexOf(callback);
      if (index >= 0) {
        cbs.splice(index, 1);
      }
    };
  }

  /**
   * Process a partial transcript update
   *
   * Call this every time ASR emits a new partial transcript.
   */
  async processPartial(
    sessionId: string,
    partialTranscript: string
  ): Promise<StreamingSignal | null> {
    let state = this.states.get(sessionId);

    if (!state) {
      state = this.startSession(sessionId);
    }

    // Update state
    state.partialTranscript = partialTranscript;
    state.wordCount = partialTranscript.trim().split(/\s+/).filter(Boolean).length;
    state.lastUpdateTime = Date.now();

    // Debounce rapid updates
    return new Promise((resolve) => {
      // Clear existing timer
      const existingTimer = this.debounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(sessionId);
        const signal = await this.computeAndEmitSignal(state!);
        resolve(signal);
      }, this.config.debounceMs);

      this.debounceTimers.set(sessionId, timer);
    });
  }

  /**
   * Process final transcript (user stopped speaking)
   */
  async processFinal(
    sessionId: string,
    finalTranscript: string
  ): Promise<StreamingState | undefined> {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.partialTranscript = finalTranscript;
    state.wordCount = finalTranscript.trim().split(/\s+/).filter(Boolean).length;

    // Compute final confidences
    await this.computeAndEmitSignal(state);

    return this.endSession(sessionId);
  }

  /**
   * Get current state for a session
   */
  getState(sessionId: string): StreamingState | undefined {
    return this.states.get(sessionId);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async computeAndEmitSignal(state: StreamingState): Promise<StreamingSignal | null> {
    const now = Date.now();
    const text = state.partialTranscript.toLowerCase();

    // Skip if no text
    if (!text.trim()) return null;

    // Compute confidence for each tool
    for (const tool of this.tools) {
      const confidence = this.computeToolConfidence(text, tool);
      const existing = state.toolConfidences.get(tool.id);

      if (existing) {
        // Update trajectory
        const trajectory =
          confidence > existing.confidence + 0.05
            ? 'rising'
            : confidence < existing.confidence - 0.05
              ? 'falling'
              : 'stable';

        existing.confidence = confidence;
        existing.trajectory = trajectory;

        if (confidence > existing.peakConfidence) {
          existing.peakConfidence = confidence;
          existing.wordAtPeak = state.wordCount;
        }
      } else {
        // First detection
        state.toolConfidences.set(tool.id, {
          confidence,
          trajectory: 'rising',
          firstDetectedAt: now,
          peakConfidence: confidence,
          wordAtPeak: state.wordCount,
        });
      }
    }

    // Find best tool
    let bestToolId: string | null = null;
    let bestConfidence = 0;

    for (const [toolId, data] of state.toolConfidences) {
      if (data.confidence > bestConfidence) {
        bestConfidence = data.confidence;
        bestToolId = toolId;
      }
    }

    // Check if best tool changed
    const toolChanged = bestToolId !== state.currentBest.toolId;

    if (toolChanged) {
      // Reset stability counter
      state.currentBest = {
        toolId: bestToolId,
        confidence: bestConfidence,
        stableForMs: 0,
      };

      // Emit "changed" signal if we had a previous guess
      if (state.emittedSignals.length > 0) {
        return this.emitSignal(state, 'changed', bestToolId, bestConfidence);
      }
    } else {
      // Update stability
      state.currentBest.confidence = bestConfidence;
      state.currentBest.stableForMs = now - (state.lastUpdateTime - this.config.debounceMs);
    }

    // Determine which signal to emit (if any)
    const lastSignal = state.emittedSignals[state.emittedSignals.length - 1];
    const lastSignalType = lastSignal?.type;

    // Check thresholds
    if (
      bestConfidence >= this.config.certainThreshold &&
      state.wordCount >= this.config.stableWordCount &&
      lastSignalType !== 'certain'
    ) {
      return this.emitSignal(state, 'certain', bestToolId, bestConfidence);
    }

    if (
      bestConfidence >= this.config.probableThreshold &&
      lastSignalType !== 'probable' &&
      lastSignalType !== 'certain'
    ) {
      return this.emitSignal(state, 'probable', bestToolId, bestConfidence);
    }

    if (
      bestConfidence >= this.config.likelyThreshold &&
      !lastSignalType // Only emit "likely" once
    ) {
      return this.emitSignal(state, 'likely', bestToolId, bestConfidence);
    }

    return null;
  }

  private computeToolConfidence(text: string, tool: SemanticToolDefinition): number {
    let score = 0;
    const words = text.split(/\s+/);

    // Check phrases (highest weight)
    for (const phrase of tool.triggers.phrases || []) {
      if (text.includes(phrase.toLowerCase())) {
        score += 0.5;
        break;
      }
    }

    // Check patterns
    for (const pattern of tool.triggers.patterns || []) {
      if (pattern.test(text)) {
        score += 0.3;
        break;
      }
    }

    // Check keywords
    for (const keyword of tool.triggers.keywords || []) {
      if (words.some((w) => w.includes(keyword.word.toLowerCase()))) {
        score += keyword.weight * 0.2;
      }
    }

    // Check anti-keywords (reduce score)
    for (const antiWord of tool.triggers.antiKeywords || []) {
      if (text.includes(antiWord.toLowerCase())) {
        score -= 0.3;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  private emitSignal(
    state: StreamingState,
    type: StreamingSignal['type'],
    toolId: string | null,
    confidence: number
  ): StreamingSignal {
    const signal: StreamingSignal = {
      type,
      toolId,
      confidence,
      partialTranscript: state.partialTranscript,
      wordCount: state.wordCount,
      timeElapsedMs: Date.now() - state.startTime,
    };

    // Add trajectory for certain signals
    if (toolId) {
      const toolData = state.toolConfidences.get(toolId);
      if (toolData) {
        signal.trajectory = toolData.trajectory;
      }
    }

    // Record signal
    state.emittedSignals.push({
      type,
      toolId,
      confidence,
      timestamp: Date.now(),
      wordCount: state.wordCount,
    });

    // Emit to callbacks
    const callbacks = this.callbacks.get(state.sessionId) || [];
    for (const cb of callbacks) {
      try {
        cb(signal);
      } catch (err) {
        log.warn({ error: String(err) }, 'Signal callback error');
      }
    }

    log.debug(
      {
        sessionId: state.sessionId,
        type,
        toolId,
        confidence: confidence.toFixed(2),
        wordCount: state.wordCount,
      },
      `Streaming signal: ${type}`
    );

    return signal;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let streamingRouterInstance: StreamingRouter | null = null;

/**
 * Get the singleton streaming router instance
 */
export function getStreamingRouter(config?: Partial<StreamingConfig>): StreamingRouter {
  if (!streamingRouterInstance) {
    streamingRouterInstance = new StreamingRouter(config);
  }
  return streamingRouterInstance;
}

/**
 * Initialize the streaming router with tools
 */
export function initializeStreamingRouter(
  tools: SemanticToolDefinition[],
  config?: Partial<StreamingConfig>
): StreamingRouter {
  const router = getStreamingRouter(config);
  router.setTools(tools);
  log.info({ toolCount: tools.length }, 'Streaming router initialized');
  return router;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if streaming detected a tool
 */
export function hasStreamingDetection(sessionId: string): boolean {
  const router = getStreamingRouter();
  const state = router.getState(sessionId);
  return (
    state?.currentBest.toolId !== null && (state?.currentBest.confidence ?? 0) > 0.5
  );
}

/**
 * Get current best tool prediction
 */
export function getCurrentPrediction(
  sessionId: string
): { toolId: string; confidence: number } | null {
  const router = getStreamingRouter();
  const state = router.getState(sessionId);

  if (!state || !state.currentBest.toolId) return null;

  return {
    toolId: state.currentBest.toolId,
    confidence: state.currentBest.confidence ?? 0,
  };
}

