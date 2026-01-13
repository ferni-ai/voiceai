/**
 * Tool A/B Testing Framework
 *
 * Enables experimentation with different tool configurations to optimize:
 * - Tool selection accuracy
 * - User satisfaction
 * - Task completion rates
 *
 * Features:
 * - Define experiments with control/variants
 * - Random assignment with consistent user bucketing
 * - Track metrics and outcomes
 * - Statistical significance calculation
 */
import type { ToolDomain } from './registry/types.js';
export interface Experiment {
    /** Unique experiment ID */
    id: string;
    /** Human-readable name */
    name: string;
    /** What we're testing */
    description: string;
    /** When the experiment started */
    startDate: Date;
    /** When the experiment ends (or null if ongoing) */
    endDate: Date | null;
    /** Is the experiment active? */
    active: boolean;
    /** Control configuration */
    control: VariantConfig;
    /** Test variants */
    variants: VariantConfig[];
    /** Traffic allocation (percentage per variant, must sum to 100) */
    trafficAllocation: number[];
    /** Success metrics to track */
    metrics: MetricDefinition[];
}
export interface VariantConfig {
    /** Variant ID (e.g., 'control', 'variant-a', 'variant-b') */
    id: string;
    /** Human-readable name */
    name: string;
    /** Tool domains to include */
    domains?: ToolDomain[];
    /** Specific tools to include */
    includeTools?: string[];
    /** Specific tools to exclude */
    excludeTools?: string[];
    /** Tool consolidation rules */
    consolidations?: ToolConsolidation[];
    /** Any custom configuration */
    config?: Record<string, unknown>;
}
export interface ToolConsolidation {
    /** New consolidated tool ID */
    newToolId: string;
    /** Tools being replaced */
    replacedTools: string[];
}
export interface MetricDefinition {
    /** Metric ID */
    id: string;
    /** Metric name */
    name: string;
    /** How to aggregate (sum, average, rate) */
    aggregation: 'sum' | 'average' | 'rate' | 'count';
    /** Higher is better? */
    higherIsBetter: boolean;
}
export interface ExperimentAssignment {
    experimentId: string;
    variantId: string;
    userId: string;
    assignedAt: Date;
}
export interface MetricEvent {
    experimentId: string;
    variantId: string;
    userId: string;
    metricId: string;
    value: number;
    timestamp: Date;
    context?: Record<string, unknown>;
}
export interface ExperimentResults {
    experimentId: string;
    totalParticipants: number;
    byVariant: Record<string, {
        participants: number;
        metrics: Record<string, {
            sum: number;
            count: number;
            average: number;
        }>;
    }>;
    recommendations: string[];
}
/**
 * Example experiments for tool optimization
 */
export declare const PREDEFINED_EXPERIMENTS: Experiment[];
export declare class ABTestingService {
    private experiments;
    private assignments;
    private metrics;
    constructor();
    /**
     * Register a new experiment
     */
    registerExperiment(experiment: Experiment): void;
    /**
     * Activate an experiment
     */
    activateExperiment(experimentId: string): boolean;
    /**
     * Deactivate an experiment
     */
    deactivateExperiment(experimentId: string): boolean;
    /**
     * Get all experiments
     */
    getExperiments(): Experiment[];
    /**
     * Get active experiments
     */
    getActiveExperiments(): Experiment[];
    /**
     * Assign a user to an experiment variant
     * Uses consistent hashing so same user always gets same variant
     */
    assignUser(userId: string, experimentId: string): ExperimentAssignment | null;
    /**
     * Get user's current assignment for an experiment
     */
    getUserAssignment(userId: string, experimentId: string): ExperimentAssignment | null;
    /**
     * Get the variant config for a user
     */
    getUserVariant(userId: string, experimentId: string): VariantConfig | null;
    /**
     * Record a metric event
     */
    recordMetric(userId: string, experimentId: string, metricId: string, value: number, context?: Record<string, unknown>): void;
    /**
     * Record tool usage for an experiment
     */
    recordToolUsage(userId: string, toolId: string, success: boolean, latencyMs: number): void;
    /**
     * Get results for an experiment
     */
    getResults(experimentId: string): ExperimentResults | null;
    /**
     * Generate recommendations based on results
     */
    private generateRecommendations;
    private hashString;
    /**
     * Export data for external analysis
     */
    exportData(): {
        experiments: Experiment[];
        assignments: ExperimentAssignment[];
        metrics: MetricEvent[];
    };
}
export declare const abTestingService: ABTestingService;
export default abTestingService;
//# sourceMappingURL=ab-testing.d.ts.map