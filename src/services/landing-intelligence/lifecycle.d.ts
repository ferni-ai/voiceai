/**
 * Landing Intelligence Lifecycle
 *
 * Initialization and shutdown for landing intelligence services.
 *
 * @module services/landing-intelligence/lifecycle
 */
export declare function initLandingIntelligence(): Promise<boolean>;
export declare function shutdownLandingIntelligence(): Promise<void>;
export interface LandingIntelligenceHealth {
    initialized: boolean;
    geminiHealthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
}
export declare function getLandingIntelligenceHealth(): LandingIntelligenceHealth;
export interface LandingIntelligenceFlags {
    enableAIVariants: boolean;
    enableIntentDetection: boolean;
    enableLayoutOptimization: boolean;
    enableChatWidget: boolean;
    enableTimeAware: boolean;
    enableReturningVisitor: boolean;
}
export declare function setLandingIntelligenceFlags(flags: Partial<LandingIntelligenceFlags>): void;
export declare function getLandingIntelligenceFlags(): LandingIntelligenceFlags;
export declare function isFeatureEnabled(feature: keyof LandingIntelligenceFlags): boolean;
//# sourceMappingURL=lifecycle.d.ts.map