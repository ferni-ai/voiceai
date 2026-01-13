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
import type { ReasoningStyle } from '../personas/cognitive-types.js';
export type CognitiveBroadcastEventType = 'cognitive_mode' | 'user_style' | 'voice_emotion' | 'confidence' | 'approach_history' | 'quirk_activated' | 'insight_generated' | 'metrics' | 'session_start' | 'session_end';
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
export type CognitiveBroadcastEvent = CognitiveModeEvent | UserStyleEvent | VoiceEmotionEvent | ConfidenceEvent | ApproachHistoryEvent | QuirkActivatedEvent | InsightGeneratedEvent | MetricsEvent | SessionStartEvent | SessionEndEvent;
declare class CognitiveBroadcastService extends EventEmitter {
    private eventHistory;
    private readonly maxHistory;
    private subscribers;
    constructor();
    /**
     * Broadcast a cognitive event
     */
    broadcast(event: CognitiveBroadcastEvent): void;
    /**
     * Subscribe to all cognitive events
     */
    subscribe(callback: (event: CognitiveBroadcastEvent) => void): () => void;
    /**
     * Get recent event history
     */
    getHistory(limit?: number): CognitiveBroadcastEvent[];
    /**
     * Get latest event of a specific type
     */
    getLatest<T extends CognitiveBroadcastEventType>(type: T): CognitiveBroadcastEvent | null;
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
    };
    /**
     * Clear history (for testing)
     */
    clearHistory(): void;
}
export declare const cognitiveBroadcast: CognitiveBroadcastService;
/**
 * Broadcast cognitive mode change
 */
export declare function broadcastCognitiveMode(personaId: string, mode: ReasoningStyle, reason: string): void;
/**
 * Broadcast detected user style
 */
export declare function broadcastUserStyle(userId: string, style: ReasoningStyle, confidence: number, signals?: Record<string, number>): void;
/**
 * Broadcast voice emotion detection
 */
export declare function broadcastVoiceEmotion(userId: string, emotion: string, confidence: number, trend?: 'improving' | 'worsening' | 'stable'): void;
/**
 * Broadcast confidence level
 */
export declare function broadcastConfidence(personaId: string, level: number, reason: string): void;
/**
 * Broadcast approach used
 */
export declare function broadcastApproachUsed(personaId: string, approach: ReasoningStyle, topic: string, engagementScore: number): void;
/**
 * Broadcast quirk activation
 */
export declare function broadcastQuirkActivated(personaId: string, quirkName: string, quirkIcon: string, frequency: number): void;
/**
 * Broadcast insight generation
 */
export declare function broadcastInsightGenerated(personaId: string, insightType: string, phrase: string, shared: boolean): void;
/**
 * Broadcast performance metrics
 */
export declare function broadcastMetrics(metrics: Omit<MetricsEvent, 'type' | 'timestamp'>): void;
export default cognitiveBroadcast;
//# sourceMappingURL=cognitive-broadcast.d.ts.map