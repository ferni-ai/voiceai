/**
 * Web Experiments Service
 *
 * A/B testing for web properties (landing pages, UI variants, CTAs).
 * Separate from persona experiments - these are simpler, web-focused tests.
 *
 * Features:
 * - Deterministic variant assignment (same user always sees same variant)
 * - Percentage-based traffic allocation
 * - Conversion tracking with funnels
 * - Statistical significance calculation
 * - Real-time metrics
 *
 * @module services/experiments/web-experiments
 */
export interface WebExperimentVariant {
    id: string;
    name: string;
    weight: number;
    description?: string;
}
export interface WebExperiment {
    id: string;
    name: string;
    description?: string;
    status: 'draft' | 'running' | 'paused' | 'completed';
    variants: WebExperimentVariant[];
    targetAudience?: {
        percentOfTraffic?: number;
        newUsersOnly?: boolean;
        countries?: string[];
        devices?: ('mobile' | 'tablet' | 'desktop')[];
        sources?: string[];
    };
    primaryGoal: string;
    secondaryGoals?: string[];
    createdAt: Date;
    startedAt?: Date;
    endedAt?: Date;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    minimumSamples: number;
    winner?: string;
    winnerConfidence?: number;
}
export interface WebExperimentMetrics {
    experimentId: string;
    variantId: string;
    exposures: number;
    conversions: Record<string, number>;
    conversionRates: Record<string, number>;
    updatedAt: Date;
}
export interface ExperimentEvent {
    experimentId: string;
    variantId: string;
    userId: string;
    sessionId?: string;
    eventType: 'exposure' | 'conversion';
    goalId?: string;
    value?: number;
    metadata?: Record<string, unknown>;
    timestamp: Date;
    userAgent?: string;
    country?: string;
    device?: string;
    source?: string;
}
export interface VariantAssignment {
    experimentId: string;
    variantId: string;
    assignedAt: Date;
    isNewAssignment: boolean;
}
export interface ExperimentAnalysis {
    experimentId: string;
    variants: Array<{
        id: string;
        name: string;
        exposures: number;
        conversions: number;
        conversionRate: number;
        improvement?: number;
    }>;
    winner: string | null;
    confidence: number;
    isSignificant: boolean;
    recommendation: string;
    sampleSize: number;
    minimumSamples: number;
    progress: number;
}
/**
 * Initialize the web experiments cache from Firestore
 */
export declare function initWebExperiments(): Promise<void>;
/**
 * Deterministically assign a user to a variant
 * Same user always gets same variant for same experiment
 */
export declare function assignVariant(experimentId: string, userId: string, context?: {
    isNewUser?: boolean;
    country?: string;
    device?: 'mobile' | 'tablet' | 'desktop';
    source?: string;
}): Promise<VariantAssignment | null>;
/**
 * Track an exposure event (user saw the variant)
 */
export declare function trackExposure(experimentId: string, variantId: string, userId: string, metadata?: Record<string, unknown>): Promise<void>;
/**
 * Track a conversion event
 */
export declare function trackConversion(experimentId: string, variantId: string, userId: string, goalId: string, value?: number, metadata?: Record<string, unknown>): Promise<void>;
/**
 * Analyze experiment results
 */
export declare function analyzeExperiment(experimentId: string): Promise<ExperimentAnalysis | null>;
/**
 * Create a new web experiment
 */
export declare function createWebExperiment(config: {
    name: string;
    description?: string;
    variants: WebExperimentVariant[];
    primaryGoal: string;
    secondaryGoals?: string[];
    targetAudience?: WebExperiment['targetAudience'];
    minimumSamples?: number;
}): Promise<WebExperiment>;
/**
 * Start an experiment
 */
export declare function startWebExperiment(experimentId: string): Promise<void>;
/**
 * Pause an experiment
 */
export declare function pauseWebExperiment(experimentId: string): Promise<void>;
/**
 * Complete an experiment with a winner
 */
export declare function completeWebExperiment(experimentId: string, winner: string, confidence: number): Promise<void>;
/**
 * Get all web experiments
 */
export declare function getWebExperiments(): Promise<WebExperiment[]>;
/**
 * Get a single experiment
 */
export declare function getWebExperiment(experimentId: string): Promise<WebExperiment | null>;
/**
 * Get running experiments only
 */
export declare function getRunningWebExperiments(): Promise<WebExperiment[]>;
declare const _default: {
    initWebExperiments: typeof initWebExperiments;
    assignVariant: typeof assignVariant;
    trackExposure: typeof trackExposure;
    trackConversion: typeof trackConversion;
    analyzeExperiment: typeof analyzeExperiment;
    createWebExperiment: typeof createWebExperiment;
    startWebExperiment: typeof startWebExperiment;
    pauseWebExperiment: typeof pauseWebExperiment;
    completeWebExperiment: typeof completeWebExperiment;
    getWebExperiments: typeof getWebExperiments;
    getWebExperiment: typeof getWebExperiment;
    getRunningWebExperiments: typeof getRunningWebExperiments;
};
export default _default;
//# sourceMappingURL=web-experiments.d.ts.map