/**
 * Peer Benchmarks
 *
 * Anonymized peer comparison data for "you're doing better than you think" insights.
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

/**
 * Peer benchmark by demographic group.
 */
export interface PeerBenchmarkData {
  ageGroup: string;
  incomeBracket: string;
  savingsRate: { median: number; p25: number; p75: number; p90: number };
  netWorth: { median: number; p25: number; p75: number; p90: number };
  behavioralScore: { median: number; topQuartile: number };
  fireProgress: { medianPercentage: number; averageYearsToFire: number };
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
 * Static benchmark data (would be updated from BigQuery in production).
 */
const BENCHMARK_DATA: Record<string, Record<string, PeerBenchmarkData>> = {
  '20s': {
    under_50k: {
      ageGroup: '20s',
      incomeBracket: 'under_50k',
      savingsRate: { median: 8, p25: 2, p75: 15, p90: 22 },
      netWorth: { median: 12000, p25: -5000, p75: 35000, p90: 65000 },
      behavioralScore: { median: 55, topQuartile: 72 },
      fireProgress: { medianPercentage: 3, averageYearsToFire: 32 },
      characteristics: {
        emergencyFundRate: 0.35,
        automatedSavingsRate: 0.42,
        budgetTrackingRate: 0.38,
        indexFundRate: 0.28,
      },
      sampleSize: 8500,
      lastUpdated: new Date(),
    },
    '50k_100k': {
      ageGroup: '20s',
      incomeBracket: '50k_100k',
      savingsRate: { median: 15, p25: 8, p75: 25, p90: 35 },
      netWorth: { median: 45000, p25: 10000, p75: 95000, p90: 150000 },
      behavioralScore: { median: 62, topQuartile: 78 },
      fireProgress: { medianPercentage: 8, averageYearsToFire: 25 },
      characteristics: {
        emergencyFundRate: 0.52,
        automatedSavingsRate: 0.58,
        budgetTrackingRate: 0.48,
        indexFundRate: 0.45,
      },
      sampleSize: 12000,
      lastUpdated: new Date(),
    },
    '100k_200k': {
      ageGroup: '20s',
      incomeBracket: '100k_200k',
      savingsRate: { median: 22, p25: 12, p75: 35, p90: 50 },
      netWorth: { median: 120000, p25: 50000, p75: 250000, p90: 400000 },
      behavioralScore: { median: 68, topQuartile: 82 },
      fireProgress: { medianPercentage: 15, averageYearsToFire: 18 },
      characteristics: {
        emergencyFundRate: 0.68,
        automatedSavingsRate: 0.72,
        budgetTrackingRate: 0.55,
        indexFundRate: 0.62,
      },
      sampleSize: 5500,
      lastUpdated: new Date(),
    },
    '200k_plus': {
      ageGroup: '20s',
      incomeBracket: '200k_plus',
      savingsRate: { median: 30, p25: 18, p75: 45, p90: 60 },
      netWorth: { median: 280000, p25: 120000, p75: 550000, p90: 850000 },
      behavioralScore: { median: 72, topQuartile: 85 },
      fireProgress: { medianPercentage: 22, averageYearsToFire: 14 },
      characteristics: {
        emergencyFundRate: 0.78,
        automatedSavingsRate: 0.80,
        budgetTrackingRate: 0.62,
        indexFundRate: 0.72,
      },
      sampleSize: 2500,
      lastUpdated: new Date(),
    },
  },
  '30s': {
    under_50k: {
      ageGroup: '30s',
      incomeBracket: 'under_50k',
      savingsRate: { median: 6, p25: 0, p75: 12, p90: 18 },
      netWorth: { median: 25000, p25: -15000, p75: 70000, p90: 120000 },
      behavioralScore: { median: 52, topQuartile: 68 },
      fireProgress: { medianPercentage: 5, averageYearsToFire: 28 },
      characteristics: {
        emergencyFundRate: 0.38,
        automatedSavingsRate: 0.40,
        budgetTrackingRate: 0.42,
        indexFundRate: 0.32,
      },
      sampleSize: 6200,
      lastUpdated: new Date(),
    },
    '50k_100k': {
      ageGroup: '30s',
      incomeBracket: '50k_100k',
      savingsRate: { median: 12, p25: 5, p75: 20, p90: 30 },
      netWorth: { median: 95000, p25: 25000, p75: 200000, p90: 350000 },
      behavioralScore: { median: 60, topQuartile: 75 },
      fireProgress: { medianPercentage: 12, averageYearsToFire: 22 },
      characteristics: {
        emergencyFundRate: 0.55,
        automatedSavingsRate: 0.60,
        budgetTrackingRate: 0.52,
        indexFundRate: 0.50,
      },
      sampleSize: 15000,
      lastUpdated: new Date(),
    },
    '100k_200k': {
      ageGroup: '30s',
      incomeBracket: '100k_200k',
      savingsRate: { median: 20, p25: 10, p75: 30, p90: 42 },
      netWorth: { median: 300000, p25: 100000, p75: 600000, p90: 950000 },
      behavioralScore: { median: 65, topQuartile: 80 },
      fireProgress: { medianPercentage: 25, averageYearsToFire: 15 },
      characteristics: {
        emergencyFundRate: 0.70,
        automatedSavingsRate: 0.75,
        budgetTrackingRate: 0.58,
        indexFundRate: 0.68,
      },
      sampleSize: 11000,
      lastUpdated: new Date(),
    },
    '200k_plus': {
      ageGroup: '30s',
      incomeBracket: '200k_plus',
      savingsRate: { median: 28, p25: 15, p75: 42, p90: 55 },
      netWorth: { median: 650000, p25: 280000, p75: 1200000, p90: 1800000 },
      behavioralScore: { median: 70, topQuartile: 84 },
      fireProgress: { medianPercentage: 40, averageYearsToFire: 10 },
      characteristics: {
        emergencyFundRate: 0.82,
        automatedSavingsRate: 0.85,
        budgetTrackingRate: 0.65,
        indexFundRate: 0.78,
      },
      sampleSize: 5000,
      lastUpdated: new Date(),
    },
  },
  '40s': {
    under_50k: {
      ageGroup: '40s',
      incomeBracket: 'under_50k',
      savingsRate: { median: 5, p25: 0, p75: 10, p90: 15 },
      netWorth: { median: 45000, p25: -10000, p75: 120000, p90: 200000 },
      behavioralScore: { median: 50, topQuartile: 65 },
      fireProgress: { medianPercentage: 8, averageYearsToFire: 25 },
      characteristics: {
        emergencyFundRate: 0.42,
        automatedSavingsRate: 0.38,
        budgetTrackingRate: 0.45,
        indexFundRate: 0.35,
      },
      sampleSize: 5000,
      lastUpdated: new Date(),
    },
    '50k_100k': {
      ageGroup: '40s',
      incomeBracket: '50k_100k',
      savingsRate: { median: 10, p25: 3, p75: 18, p90: 25 },
      netWorth: { median: 180000, p25: 50000, p75: 380000, p90: 600000 },
      behavioralScore: { median: 58, topQuartile: 73 },
      fireProgress: { medianPercentage: 20, averageYearsToFire: 18 },
      characteristics: {
        emergencyFundRate: 0.58,
        automatedSavingsRate: 0.55,
        budgetTrackingRate: 0.55,
        indexFundRate: 0.52,
      },
      sampleSize: 12000,
      lastUpdated: new Date(),
    },
    '100k_200k': {
      ageGroup: '40s',
      incomeBracket: '100k_200k',
      savingsRate: { median: 18, p25: 8, p75: 28, p90: 38 },
      netWorth: { median: 550000, p25: 200000, p75: 1000000, p90: 1500000 },
      behavioralScore: { median: 64, topQuartile: 78 },
      fireProgress: { medianPercentage: 45, averageYearsToFire: 12 },
      characteristics: {
        emergencyFundRate: 0.72,
        automatedSavingsRate: 0.70,
        budgetTrackingRate: 0.60,
        indexFundRate: 0.70,
      },
      sampleSize: 9000,
      lastUpdated: new Date(),
    },
    '200k_plus': {
      ageGroup: '40s',
      incomeBracket: '200k_plus',
      savingsRate: { median: 25, p25: 12, p75: 38, p90: 50 },
      netWorth: { median: 1200000, p25: 500000, p75: 2200000, p90: 3500000 },
      behavioralScore: { median: 68, topQuartile: 82 },
      fireProgress: { medianPercentage: 65, averageYearsToFire: 6 },
      characteristics: {
        emergencyFundRate: 0.85,
        automatedSavingsRate: 0.82,
        budgetTrackingRate: 0.68,
        indexFundRate: 0.80,
      },
      sampleSize: 4500,
      lastUpdated: new Date(),
    },
  },
  '50s': {
    under_50k: {
      ageGroup: '50s',
      incomeBracket: 'under_50k',
      savingsRate: { median: 4, p25: 0, p75: 8, p90: 12 },
      netWorth: { median: 80000, p25: 5000, p75: 200000, p90: 350000 },
      behavioralScore: { median: 48, topQuartile: 62 },
      fireProgress: { medianPercentage: 15, averageYearsToFire: 18 },
      characteristics: {
        emergencyFundRate: 0.45,
        automatedSavingsRate: 0.35,
        budgetTrackingRate: 0.48,
        indexFundRate: 0.38,
      },
      sampleSize: 4000,
      lastUpdated: new Date(),
    },
    '50k_100k': {
      ageGroup: '50s',
      incomeBracket: '50k_100k',
      savingsRate: { median: 8, p25: 2, p75: 15, p90: 22 },
      netWorth: { median: 320000, p25: 100000, p75: 650000, p90: 1000000 },
      behavioralScore: { median: 56, topQuartile: 70 },
      fireProgress: { medianPercentage: 35, averageYearsToFire: 12 },
      characteristics: {
        emergencyFundRate: 0.62,
        automatedSavingsRate: 0.52,
        budgetTrackingRate: 0.58,
        indexFundRate: 0.55,
      },
      sampleSize: 10000,
      lastUpdated: new Date(),
    },
    '100k_200k': {
      ageGroup: '50s',
      incomeBracket: '100k_200k',
      savingsRate: { median: 15, p25: 6, p75: 25, p90: 35 },
      netWorth: { median: 900000, p25: 400000, p75: 1600000, p90: 2400000 },
      behavioralScore: { median: 62, topQuartile: 76 },
      fireProgress: { medianPercentage: 70, averageYearsToFire: 6 },
      characteristics: {
        emergencyFundRate: 0.75,
        automatedSavingsRate: 0.68,
        budgetTrackingRate: 0.62,
        indexFundRate: 0.72,
      },
      sampleSize: 7500,
      lastUpdated: new Date(),
    },
    '200k_plus': {
      ageGroup: '50s',
      incomeBracket: '200k_plus',
      savingsRate: { median: 22, p25: 10, p75: 35, p90: 48 },
      netWorth: { median: 2000000, p25: 900000, p75: 3800000, p90: 6000000 },
      behavioralScore: { median: 66, topQuartile: 80 },
      fireProgress: { medianPercentage: 90, averageYearsToFire: 2 },
      characteristics: {
        emergencyFundRate: 0.88,
        automatedSavingsRate: 0.78,
        budgetTrackingRate: 0.70,
        indexFundRate: 0.82,
      },
      sampleSize: 4000,
      lastUpdated: new Date(),
    },
  },
};

/**
 * Peer Benchmarks service.
 */
export class PeerBenchmarks {
  /**
   * Get benchmark for specific demographic.
   */
  static getBenchmark(ageGroup: string, incomeBracket: string): PeerBenchmarkData | null {
    return BENCHMARK_DATA[ageGroup]?.[incomeBracket] || null;
  }

  /**
   * Get closest benchmark based on age and income.
   */
  static getClosestBenchmark(age: number, annualIncome: number): PeerBenchmarkData {
    const ageGroup = PeerBenchmarks.getAgeGroup(age);
    const incomeBracket = PeerBenchmarks.getIncomeBracket(annualIncome);

    const benchmark = BENCHMARK_DATA[ageGroup]?.[incomeBracket];
    if (benchmark) {
      return benchmark;
    }

    // Fall back to 30s/50k_100k as median
    return BENCHMARK_DATA['30s']['50k_100k'];
  }

  /**
   * Calculate percentile for a value against a metric.
   */
  static calculatePercentile(
    value: number,
    metric: { median: number; p25: number; p75: number; p90: number }
  ): number {
    if (value <= metric.p25) {
      // 0-25th percentile
      return Math.round((value / metric.p25) * 25);
    } else if (value <= metric.median) {
      // 25-50th percentile
      return Math.round(25 + ((value - metric.p25) / (metric.median - metric.p25)) * 25);
    } else if (value <= metric.p75) {
      // 50-75th percentile
      return Math.round(50 + ((value - metric.median) / (metric.p75 - metric.median)) * 25);
    } else if (value <= metric.p90) {
      // 75-90th percentile
      return Math.round(75 + ((value - metric.p75) / (metric.p90 - metric.p75)) * 15);
    } else {
      // 90-99th percentile
      const excessRatio = Math.min((value - metric.p90) / metric.p90, 1);
      return Math.min(Math.round(90 + excessRatio * 9), 99);
    }
  }

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
  } {
    const benchmark = PeerBenchmarks.getClosestBenchmark(userProfile.age, userProfile.annualIncome);

    const savingsPercentile = PeerBenchmarks.calculatePercentile(
      userProfile.savingsRate,
      benchmark.savingsRate
    );
    const netWorthPercentile = PeerBenchmarks.calculatePercentile(
      userProfile.netWorth,
      benchmark.netWorth
    );
    const behavioralPercentile =
      userProfile.behavioralScore >= benchmark.behavioralScore.topQuartile
        ? 85
        : userProfile.behavioralScore >= benchmark.behavioralScore.median
          ? 55
          : 30;
    const firePercentile = Math.min(
      Math.round((userProfile.fireProgress / benchmark.fireProgress.medianPercentage) * 50),
      95
    );

    const overallPercentile = Math.round(
      (savingsPercentile + netWorthPercentile + behavioralPercentile + firePercentile) / 4
    );

    const getComparison = (
      percentile: number
    ): 'below' | 'median' | 'above' | 'top' => {
      if (percentile >= 75) return 'top';
      if (percentile >= 50) return 'above';
      if (percentile >= 25) return 'median';
      return 'below';
    };

    const insights: string[] = [];

    // Generate insights
    if (savingsPercentile >= 75) {
      insights.push(
        `Your ${userProfile.savingsRate}% savings rate puts you in the top quartile of your peers!`
      );
    } else if (savingsPercentile < 25) {
      insights.push(
        `Most peers in your demographic save around ${benchmark.savingsRate.median}% - there's room to grow.`
      );
    }

    if (netWorthPercentile >= 75) {
      insights.push(`Your net worth is in the top 25% for your age and income group.`);
    }

    if (userProfile.hasEmergencyFund && benchmark.characteristics.emergencyFundRate < 0.5) {
      insights.push(
        `Having an emergency fund puts you ahead of ${Math.round((1 - benchmark.characteristics.emergencyFundRate) * 100)}% of your peers.`
      );
    }

    if (userProfile.hasAutomatedSavings) {
      insights.push(
        `Automating savings is a key habit - only ${Math.round(benchmark.characteristics.automatedSavingsRate * 100)}% of your peers do this.`
      );
    }

    if (userProfile.hasIndexFunds) {
      insights.push(
        `Using index funds puts you ahead in cost efficiency.`
      );
    }

    return {
      benchmark,
      percentiles: {
        savingsRate: savingsPercentile,
        netWorth: netWorthPercentile,
        behavioralScore: behavioralPercentile,
        fireProgress: firePercentile,
        overall: overallPercentile,
      },
      comparisons: {
        savingsRate: getComparison(savingsPercentile),
        netWorth: getComparison(netWorthPercentile),
        behavioralScore: getComparison(behavioralPercentile),
      },
      characteristics: {
        emergencyFund: userProfile.hasEmergencyFund ? 'above' : 'below',
        automatedSavings: userProfile.hasAutomatedSavings ? 'above' : 'below',
        budgetTracking: userProfile.tracksbudget ? 'above' : 'below',
        indexFunds: userProfile.hasIndexFunds ? 'above' : 'below',
      },
      insights,
    };
  }

  /**
   * Get age group from age.
   */
  private static getAgeGroup(age: number): string {
    if (age < 30) return '20s';
    if (age < 40) return '30s';
    if (age < 50) return '40s';
    return '50s';
  }

  /**
   * Get income bracket from annual income.
   */
  private static getIncomeBracket(annualIncome: number): string {
    if (annualIncome < 50000) return 'under_50k';
    if (annualIncome < 100000) return '50k_100k';
    if (annualIncome < 200000) return '100k_200k';
    return '200k_plus';
  }
}
