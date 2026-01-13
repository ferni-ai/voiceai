/**
 * Insights Broadcast Service
 *
 * Real-time broadcast of cross-persona insights to connected clients.
 * Similar to CognitiveBroadcast but focused on team intelligence.
 *
 * Provides:
 * - Real-time notification when new high-priority insights are detected
 * - WebSocket streaming to connected frontend clients
 * - Background scanning and detection of new patterns
 *
 * @module services/insights-broadcast
 */
import { EventEmitter } from 'events';
import { type CrossPersonaInsight } from './cross-persona-insights.js';
export interface InsightBroadcastEvent {
    type: 'new_insight' | 'insight_batch' | 'scan_complete' | 'heartbeat';
    userId: string;
    insights?: CrossPersonaInsight[];
    insight?: CrossPersonaInsight;
    timestamp: number;
    scanDuration?: number;
}
export type InsightBroadcastListener = (event: InsightBroadcastEvent) => void;
declare class InsightsBroadcast extends EventEmitter {
    private userLastScan;
    private userKnownInsights;
    private activeUsers;
    private readonly scanIntervalMs;
    private readonly minScanGapMs;
    private getIntervalName;
    constructor();
    /**
     * Subscribe to insight broadcasts
     */
    subscribe(listener: InsightBroadcastListener): () => void;
    /**
     * Start real-time monitoring for a user
     */
    startMonitoring(userId: string): void;
    /**
     * Stop real-time monitoring for a user
     */
    stopMonitoring(userId: string): void;
    /**
     * Manually trigger a scan for a user
     */
    triggerScan(userId: string): Promise<CrossPersonaInsight[]>;
    /**
     * Internal: Scan for new insights and broadcast if found
     */
    private scanUserInsights;
    /**
     * Emit a broadcast event
     */
    private broadcast;
    /**
     * Notify about a new insight (called by cross-persona-insights when insights are recorded)
     */
    notifyNewInsight(userId: string, insight: CrossPersonaInsight): void;
    /**
     * Publish an insight to connected WebSocket clients
     * Alias for notifyNewInsight for use by cross-persona-insights
     */
    publishInsight(userId: string, insight: CrossPersonaInsight): void;
    /**
     * Get monitoring status for a user
     */
    isMonitoring(userId: string): boolean;
    /**
     * Shutdown all monitoring
     */
    shutdown(): void;
}
export declare const insightsBroadcast: InsightsBroadcast;
export declare function startInsightMonitoring(userId: string): void;
export declare function stopInsightMonitoring(userId: string): void;
export declare function triggerInsightScan(userId: string): Promise<CrossPersonaInsight[]>;
export declare function subscribeToInsights(listener: InsightBroadcastListener): () => void;
export {};
//# sourceMappingURL=insights-broadcast.d.ts.map