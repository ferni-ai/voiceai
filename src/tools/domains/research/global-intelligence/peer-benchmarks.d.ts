/**
 * Peer Benchmarks
 *
 * Anonymized peer comparison data for "you're doing better than you think" insights.
 */
/**
 * Peer benchmark by demographic group.
 */
export interface PeerBenchmarkData {
    ageGroup: string;
    incomeBracket: string;
    savingsRate: {
        median: number;
        p25: number;
        p75: number;
        p90: number;
    };
    netWorth: {
        median: number;
        p25: number;
        p75: number;
        p90: number;
    };
    behavioralScore: {
        median: number;
        topQuartile: number;
    };
    fireProgress: {
        medianPercentage: number;
        averageYearsToFire: number;
    };
    characteristics: {
        emergencyFundRate: number;
        automatedSavingsRate: number;
        budgetTrackingRate: number;
        indexFundRate: number;
    };
    sampleSize: number;
    lastUpdated: Date;
}
/**
 * Peer Benchmarks service.
 */
export declare class PeerBenchmarks {
    /**
     * Get benchmark for specific demographic.
     */
    static getBenchmark(ageGroup: string, incomeBracket: string): PeerBenchmarkData | null;
    /**
     * Get closest benchmark based on age and income.
     */
    static getClosestBenchmark(age: number, annualIncome: number): PeerBenchmarkData;
    /**
     * Calculate percentile for a value against a metric.
     */
    static calculatePercentile(value: number, metric: {
        median: number;
        p25: number;
        p75: number;
        p90: number;
    }): number;
    /**
     * Get comprehensive peer comparison.
     */
    static getPeerComparison(userProfile: {
        age: number;
        annualIncome: number;
        savingsRate: number;
        netWorth: number;
        behavioralScore: number;
        fireProgress: number;
        hasEmergencyFund: boolean;
        hasAutomatedSavings: boolean;
        tracksbudget: boolean;
        hasIndexFunds: boolean;
    }): {
        benchmark: PeerBenchmarkData;
        percentiles: {
            savingsRate: number;
            netWorth: number;
            behavioralScore: number;
            fireProgress: number;
            overall: number;
        };
        comparisons: {
            savingsRate: 'below' | 'median' | 'above' | 'top';
            netWorth: 'below' | 'median' | 'above' | 'top';
            behavioralScore: 'below' | 'median' | 'above' | 'top';
        };
        characteristics: {
            emergencyFund: 'below' | 'above';
            automatedSavings: 'below' | 'above';
            budgetTracking: 'below' | 'above';
            indexFunds: 'below' | 'above';
        };
        insights: string[];
    };
    /**
     * Get age group from age.
     */
    private static getAgeGroup;
    /**
     * Get income bracket from annual income.
     */
    private static getIncomeBracket;
}
//# sourceMappingURL=peer-benchmarks.d.ts.map