/**
 * Proactive Insights Service
 *
 * Peter (The Quant) runs periodic scans across all domains to surface
 * insights BEFORE users ask for them. This is Peter's signature capability.
 *
 * SCAN TYPES:
 * - Daily: Anomaly detection, pattern breaks
 * - Weekly: Correlation analysis, trend projections
 * - Monthly: Deep cross-domain synthesis, goal trajectory
 *
 * INTEGRATION:
 * - Receives context from Alex (calendar), Maya (spending/habits),
 *   Jordan (goals), Jack (portfolio)
 * - Uses Maya's financial store for real spending data
 * - Surfaces insights via proactive notifications
 */
export interface ProactiveInsight {
    id: string;
    type: 'warning' | 'opportunity' | 'milestone' | 'pattern' | 'anomaly' | 'correlation';
    severity: 'low' | 'medium' | 'high';
    title: string;
    insight: string;
    action?: string;
    domains: string[];
    timestamp: Date;
    userId: string;
    delivered: boolean;
}
export interface InsightScanResult {
    userId: string;
    scanType: 'daily' | 'weekly' | 'monthly';
    timestamp: Date;
    insights: ProactiveInsight[];
    metrics: {
        domainsScanned: number;
        patternsChecked: number;
        insightsFound: number;
    };
}
declare class ProactiveInsightsService {
    private isRunning;
    private scanInterval;
    private insightQueue;
    /**
     * Start the proactive insights service
     */
    start(): void;
    /**
     * Stop the proactive insights service
     */
    stop(): void;
    /**
     * Run a proactive insight scan for a specific user
     */
    runScanForUser(userId: string, scanType?: 'daily' | 'weekly' | 'monthly'): Promise<InsightScanResult>;
    /**
     * Scan spending domain for insights
     */
    private scanSpendingDomain;
    /**
     * Scan goals domain for insights
     */
    private scanGoalsDomain;
    /**
     * Scan behavioral domain for insights
     */
    private scanBehavioralDomain;
    /**
     * Find cross-domain correlations
     */
    private findCrossDomainCorrelations;
    /**
     * Get pending insights for a user
     */
    getPendingInsights(userId: string): ProactiveInsight[];
    /**
     * Mark insights as delivered
     */
    markInsightsDelivered(userId: string, insightIds: string[]): void;
    /**
     * Run scheduled scans for all active users
     */
    private runScheduledScans;
}
export declare function getProactiveInsightsService(): ProactiveInsightsService;
export default ProactiveInsightsService;
//# sourceMappingURL=proactive-insights-service.d.ts.map