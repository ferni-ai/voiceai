/**
 * Cognitive Broadcast Service
 *
 * Broadcasts cognitive state updates for real-time dashboards.
 * Uses EventEmitter pattern for extensibility.
 *
 * Can be consumed by:
 * - WebSocket handlers
 * - LiveKit data channels
 * - HTTP SSE endpoints
 * - Direct subscribers
 */

import { EventEmitter } from 'events';
import { getLogger } from '../utils/safe-logger.js';
import { registerCognitiveMetricsBroadcast } from '../utils/cognitive-metrics.js';
import type { ReasoningStyle } from '../personas/cognitive-types.js';

// ============================================================================
// TYPES
// ============================================================================

export type CognitiveBroadcastEventType =
  | 'cognitive_mode'
  | 'user_style'
  | 'voice_emotion'
  | 'confidence'
  | 'approach_history'
  | 'quirk_activated'
  | 'insight_generated'
  | 'metrics'
  | 'session_start'
  | 'session_end';

export interface CognitiveModeEvent {
  type: 'cognitive_mode';
  personaId: string;
  mode: ReasoningStyle;
  reason: string;
  timestamp: Date;
}

export interface UserStyleEvent {
  type: 'user_style';
  userId: string;
  style: ReasoningStyle;
  confidence: number;
  signals: Record<string, number>;
  timestamp: Date;
}

export interface VoiceEmotionEvent {
  type: 'voice_emotion';
  userId: string;
  emotion: string;
  confidence: number;
  trend: 'improving' | 'worsening' | 'stable';
  timestamp: Date;
}

export interface ConfidenceEvent {
  type: 'confidence';
  personaId: string;
  level: number;
  reason: string;
  timestamp: Date;
}

export interface ApproachHistoryEvent {
  type: 'approach_history';
  personaId: string;
  approach: ReasoningStyle;
  topic: string;
  engagementScore: number;
  timestamp: Date;
}

export interface QuirkActivatedEvent {
  type: 'quirk_activated';
  personaId: string;
  quirkName: string;
  quirkIcon: string;
  frequency: number;
  timestamp: Date;
}

export interface InsightGeneratedEvent {
  type: 'insight_generated';
  personaId: string;
  insightType: string;
  phrase: string;
  shared: boolean;
  timestamp: Date;
}

export interface MetricsEvent {
  type: 'metrics';
  avgTotalOverhead: number;
  p95TotalOverhead: number;
  maxTotalOverhead: number;
  under50msPercentage: number;
  under100msPercentage: number;
  samplesCount: number;
  timestamp: Date;
}

export interface SessionStartEvent {
  type: 'session_start';
  userId: string;
  personaId: string;
  detectedStyle?: ReasoningStyle;
  styleConfidence: number;
  timestamp: Date;
}

export interface SessionEndEvent {
  type: 'session_end';
  userId: string;
  personaId: string;
  approachesUsed: number;
  topicsExplained: number;
  duration: number;
  timestamp: Date;
}

export type CognitiveBroadcastEvent =
  | CognitiveModeEvent
  | UserStyleEvent
  | VoiceEmotionEvent
  | ConfidenceEvent
  | ApproachHistoryEvent
  | QuirkActivatedEvent
  | InsightGeneratedEvent
  | MetricsEvent
  | SessionStartEvent
  | SessionEndEvent;

// ============================================================================
// BROADCAST SERVICE
// ============================================================================

class CognitiveBroadcastService extends EventEmitter {
  private eventHistory: CognitiveBroadcastEvent[] = [];
  private readonly maxHistory = 100;
  private subscribers = new Set<(event: CognitiveBroadcastEvent) => void>();

  constructor() {
    super();
    this.setMaxListeners(50); // Allow many subscribers
  }

  /**
   * Broadcast a cognitive event
   */
  broadcast(event: CognitiveBroadcastEvent): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Emit to EventEmitter subscribers
    this.emit(event.type, event);
    this.emit('*', event); // Wildcard for all events

    // Notify direct subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (err) {
        getLogger().warn({ err }, 'Cognitive broadcast subscriber error');
      }
    }

    getLogger().debug(
      {
        type: event.type,
        personaId: 'personaId' in event ? event.personaId : undefined,
      },
      '📡 Cognitive event broadcast'
    );
  }

  /**
   * Subscribe to all cognitive events
   */
  subscribe(callback: (event: CognitiveBroadcastEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get recent event history
   */
  getHistory(limit = 50): CognitiveBroadcastEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Get latest event of a specific type
   */
  getLatest<T extends CognitiveBroadcastEventType>(type: T): CognitiveBroadcastEvent | null {
    for (let i = this.eventHistory.length - 1; i >= 0; i--) {
      if (this.eventHistory[i].type === type) {
        return this.eventHistory[i];
      }
    }
    return null;
  }

  /**
   * Get current cognitive state snapshot
   */
  getCurrentState(): {
    cognitiveMode?: CognitiveModeEvent;
    userStyle?: UserStyleEvent;
    voiceEmotion?: VoiceEmotionEvent;
    confidence?: ConfidenceEvent;
    metrics?: MetricsEvent;
    recentApproaches: ApproachHistoryEvent[];
    activeQuirks: QuirkActivatedEvent[];
  } {
    return {
      cognitiveMode: this.getLatest('cognitive_mode') as CognitiveModeEvent | undefined,
      userStyle: this.getLatest('user_style') as UserStyleEvent | undefined,
      voiceEmotion: this.getLatest('voice_emotion') as VoiceEmotionEvent | undefined,
      confidence: this.getLatest('confidence') as ConfidenceEvent | undefined,
      metrics: this.getLatest('metrics') as MetricsEvent | undefined,
      recentApproaches: this.eventHistory
        .filter((e): e is ApproachHistoryEvent => e.type === 'approach_history')
        .slice(-10),
      activeQuirks: this.eventHistory
        .filter((e): e is QuirkActivatedEvent => e.type === 'quirk_activated')
        .slice(-5),
    };
  }

  /**
   * Clear history (for testing)
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

// Singleton instance
export const cognitiveBroadcast = new CognitiveBroadcastService();

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Broadcast cognitive mode change
 */
export function broadcastCognitiveMode(
  personaId: string,
  mode: ReasoningStyle,
  reason: string
): void {
  cognitiveBroadcast.broadcast({
    type: 'cognitive_mode',
    personaId,
    mode,
    reason,
    timestamp: new Date(),
  });
}

/**
 * Broadcast detected user style
 */
export function broadcastUserStyle(
  userId: string,
  style: ReasoningStyle,
  confidence: number,
  signals: Record<string, number> = {}
): void {
  cognitiveBroadcast.broadcast({
    type: 'user_style',
    userId,
    style,
    confidence,
    signals,
    timestamp: new Date(),
  });
}

/**
 * Broadcast voice emotion detection
 */
export function broadcastVoiceEmotion(
  userId: string,
  emotion: string,
  confidence: number,
  trend: 'improving' | 'worsening' | 'stable' = 'stable'
): void {
  cognitiveBroadcast.broadcast({
    type: 'voice_emotion',
    userId,
    emotion,
    confidence,
    trend,
    timestamp: new Date(),
  });
}

/**
 * Broadcast confidence level
 */
export function broadcastConfidence(personaId: string, level: number, reason: string): void {
  cognitiveBroadcast.broadcast({
    type: 'confidence',
    personaId,
    level,
    reason,
    timestamp: new Date(),
  });
}

/**
 * Broadcast approach used
 */
export function broadcastApproachUsed(
  personaId: string,
  approach: ReasoningStyle,
  topic: string,
  engagementScore: number
): void {
  cognitiveBroadcast.broadcast({
    type: 'approach_history',
    personaId,
    approach,
    topic,
    engagementScore,
    timestamp: new Date(),
  });
}

/**
 * Broadcast quirk activation
 */
export function broadcastQuirkActivated(
  personaId: string,
  quirkName: string,
  quirkIcon: string,
  frequency: number
): void {
  cognitiveBroadcast.broadcast({
    type: 'quirk_activated',
    personaId,
    quirkName,
    quirkIcon,
    frequency,
    timestamp: new Date(),
  });
}

/**
 * Broadcast insight generation
 */
export function broadcastInsightGenerated(
  personaId: string,
  insightType: string,
  phrase: string,
  shared: boolean
): void {
  cognitiveBroadcast.broadcast({
    type: 'insight_generated',
    personaId,
    insightType,
    phrase,
    shared,
    timestamp: new Date(),
  });
}

/**
 * Broadcast performance metrics
 */
export function broadcastMetrics(metrics: Omit<MetricsEvent, 'type' | 'timestamp'>): void {
  cognitiveBroadcast.broadcast({
    type: 'metrics',
    ...metrics,
    timestamp: new Date(),
  });
}

// ============================================================================
// REGISTER WITH UTILS LAYER
// ============================================================================

// Register callback to receive cognitive metrics broadcasts from utils layer
// This follows proper architecture: services layer registers with utils layer
registerCognitiveMetricsBroadcast((metrics) => {
  broadcastMetrics(metrics);
});

export default cognitiveBroadcast;
