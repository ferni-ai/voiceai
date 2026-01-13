/**
 * Observability Hub
 *
 * Aggregates all observability metrics into a unified view.
 * Provides a single entry point for dashboards and monitoring.
 */
import { type LLMHealthSnapshot } from './llm-health.js';
import { type ConnectionHealthSnapshot } from './connection-health.js';
import { type UXQualitySnapshot } from './ux-quality.js';
import { type MemoryHealthSnapshot } from './memory-health.js';
import { type CostSnapshot } from './cost-tracking.js';
import { type ErrorSnapshot } from './error-recovery.js';
import { type PersonaHealthSnapshot } from './persona-health.js';
import { type AggregateMetrics } from '../../tools/semantic-router/integration/metrics.js';
export interface ObservabilitySnapshot {
    timestamp: number;
    windowMinutes: number;
    overallHealth: number;
    llmHealth: number;
    connectionHealth: number;
    uxHealth: number;
    memoryHealth: number;
    costHealth: number;
    errorHealth: number;
    personaHealth: number;
    semanticRoutingHealth: number;
    alerts: Alert[];
    criticalAlerts: number;
    warningAlerts: number;
    llm: LLMHealthSnapshot;
    connection: ConnectionHealthSnapshot;
    ux: UXQualitySnapshot;
    memory: MemoryHealthSnapshot;
    cost: CostSnapshot;
    errors: ErrorSnapshot;
    persona: PersonaHealthSnapshot;
    semanticRouting: AggregateMetrics;
}
export interface Alert {
    id: string;
    timestamp: number;
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    message: string;
    metric?: string;
    value?: number;
    threshold?: number;
}
declare function getSnapshot(windowMinutes?: number): ObservabilitySnapshot;
declare function getRecentAlerts(limit?: number): Alert[];
declare function clearAlerts(): void;
export declare const observabilityHub: {
    getSnapshot: typeof getSnapshot;
    getRecentAlerts: typeof getRecentAlerts;
    clearAlerts: typeof clearAlerts;
};
export {};
//# sourceMappingURL=hub.d.ts.map