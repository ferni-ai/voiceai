/**
 * Wearable Integration Service
 *
 * Foundation for integrating data from wearable devices:
 * - Apple Watch / HealthKit
 * - Eight Sleep (smart mattress)
 * - Fitbit
 * - Garmin
 * - Oura Ring
 * - Whoop
 *
 * This data enables Ferni to:
 * - Detect stress patterns from HRV
 * - Correlate sleep quality with mood
 * - Provide activity-aware coaching
 * - Trigger proactive outreach based on health signals
 *
 * @module WearableIntegration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  ActivityData,
  HealthMetrics,
  HeartRateData,
  SleepData,
  StressIndicators,
  WearableConfig,
  WearableData,
  WearableProvider,
} from './types.js';

const log = createLogger({ module: 'WearableIntegration' });

// ============================================================================
// WEARABLE INTEGRATION SERVICE
// ============================================================================

export class WearableIntegrationService {
  private userId: string;
  private config: WearableConfig;
  private latestData: Map<WearableProvider, WearableData> = new Map();
  private connectionStatus: Map<WearableProvider, 'connected' | 'disconnected' | 'pending'> =
    new Map();

  constructor(userId: string, config?: Partial<WearableConfig>) {
    this.userId = userId;
    this.config = {
      enabledProviders: [],
      syncIntervalMinutes: 15,
      enableStressDetection: true,
      enableSleepAnalysis: true,
      enableActivityTracking: true,
      privacyMode: 'aggregated', // Only share aggregated insights, not raw data
      ...config,
    };
  }

  // ==========================================================================
  // PROVIDER MANAGEMENT
  // ==========================================================================

  /**
   * Connect a wearable provider
   */
  async connectProvider(provider: WearableProvider): Promise<{
    success: boolean;
    authUrl?: string;
    error?: string;
  }> {
    try {
      this.connectionStatus.set(provider, 'pending');

      // In production, this would initiate OAuth flow for the provider
      // For now, we simulate the connection

      log.info({ userId: this.userId, provider }, 'Initiating wearable connection');

      // Return OAuth URL for the provider
      const authUrls: Record<WearableProvider, string> = {
        apple_health: 'ferniapp://healthkit/authorize', // Deep link for iOS app
        eight_sleep: `https://client-api.8slp.net/oauth/authorize?client_id=${process.env.EIGHT_SLEEP_CLIENT_ID}`,
        fitbit: `https://www.fitbit.com/oauth2/authorize?client_id=${process.env.FITBIT_CLIENT_ID}`,
        garmin: `https://connect.garmin.com/oauth2/authorize?client_id=${process.env.GARMIN_CLIENT_ID}`,
        oura: `https://cloud.ouraring.com/oauth/authorize?client_id=${process.env.OURA_CLIENT_ID}`,
        whoop: `https://api.prod.whoop.com/oauth/authorize?client_id=${process.env.WHOOP_CLIENT_ID}`,
      };

      return {
        success: true,
        authUrl: authUrls[provider],
      };
    } catch (error) {
      log.error({ error, userId: this.userId, provider }, 'Failed to connect wearable');
      this.connectionStatus.set(provider, 'disconnected');
      return { success: false, error: 'Failed to initiate connection' };
    }
  }

  /**
   * Complete OAuth callback for a provider
   */
  async completeConnection(
    provider: WearableProvider,
    authCode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // In production, exchange auth code for tokens and store them
      // For now, we simulate successful connection

      this.connectionStatus.set(provider, 'connected');

      if (!this.config.enabledProviders.includes(provider)) {
        this.config.enabledProviders.push(provider);
      }

      log.info({ userId: this.userId, provider }, 'Wearable connected successfully');

      return { success: true };
    } catch (error) {
      log.error({ error, userId: this.userId, provider }, 'Failed to complete wearable connection');
      this.connectionStatus.set(provider, 'disconnected');
      return { success: false, error: 'Failed to complete connection' };
    }
  }

  /**
   * Disconnect a wearable provider
   */
  async disconnectProvider(provider: WearableProvider): Promise<void> {
    this.connectionStatus.set(provider, 'disconnected');
    this.config.enabledProviders = this.config.enabledProviders.filter((p) => p !== provider);
    this.latestData.delete(provider);

    log.info({ userId: this.userId, provider }, 'Wearable disconnected');
  }

  /**
   * Get connection status for all providers
   */
  getConnectionStatus(): Map<WearableProvider, 'connected' | 'disconnected' | 'pending'> {
    return new Map(this.connectionStatus);
  }

  // ==========================================================================
  // DATA SYNC
  // ==========================================================================

  /**
   * Sync data from all connected providers
   */
  async syncAll(): Promise<Map<WearableProvider, WearableData>> {
    const results = new Map<WearableProvider, WearableData>();

    for (const provider of this.config.enabledProviders) {
      if (this.connectionStatus.get(provider) === 'connected') {
        const data = await this.syncProvider(provider);
        if (data) {
          results.set(provider, data);
        }
      }
    }

    return results;
  }

  /**
   * Sync data from a specific provider
   */
  async syncProvider(provider: WearableProvider): Promise<WearableData | null> {
    try {
      // In production, this would call the provider's API
      // For now, we return simulated data

      const data: WearableData = {
        provider,
        syncedAt: new Date(),
        healthMetrics: this.generateSampleMetrics(),
        sleepData: this.config.enableSleepAnalysis ? this.generateSampleSleep() : undefined,
        activityData: this.config.enableActivityTracking
          ? this.generateSampleActivity()
          : undefined,
        heartRateData: this.generateSampleHeartRate(),
      };

      this.latestData.set(provider, data);

      log.debug({ userId: this.userId, provider }, 'Wearable data synced');

      return data;
    } catch (error) {
      log.error({ error, userId: this.userId, provider }, 'Failed to sync wearable data');
      return null;
    }
  }

  // ==========================================================================
  // HEALTH INSIGHTS
  // ==========================================================================

  /**
   * Get aggregated health metrics from all connected wearables
   */
  getAggregatedMetrics(): HealthMetrics | null {
    if (this.latestData.size === 0) {
      return null;
    }

    // Aggregate data from all sources
    const allMetrics = Array.from(this.latestData.values()).map((d) => d.healthMetrics);

    // Average the metrics
    return {
      restingHeartRate: this.average(allMetrics.map((m) => m.restingHeartRate)),
      heartRateVariability: this.average(allMetrics.map((m) => m.heartRateVariability)),
      respiratoryRate: this.average(allMetrics.map((m) => m.respiratoryRate)),
      bloodOxygenLevel: this.average(allMetrics.map((m) => m.bloodOxygenLevel)),
      bodyTemperature: this.average(allMetrics.map((m) => m.bodyTemperature)),
    };
  }

  /**
   * Detect stress indicators from wearable data
   */
  detectStressIndicators(): StressIndicators | null {
    if (!this.config.enableStressDetection) {
      return null;
    }

    const metrics = this.getAggregatedMetrics();
    if (!metrics) {
      return null;
    }

    // Calculate stress level based on HRV and other indicators
    // Lower HRV generally indicates higher stress
    const hrvBaseline = 50; // ms - this would be personalized in production
    const hrvDeviation = ((hrvBaseline - metrics.heartRateVariability) / hrvBaseline) * 100;

    const stressLevel = Math.min(100, Math.max(0, hrvDeviation));
    const isElevated = stressLevel > 40;

    return {
      stressLevel,
      isElevated,
      primaryIndicator: 'heart_rate_variability',
      secondaryIndicators: metrics.restingHeartRate > 80 ? ['elevated_resting_hr'] : [],
      suggestedAction: isElevated ? 'Consider a breathing exercise or short walk' : undefined,
      detectedAt: new Date(),
    };
  }

  /**
   * Get sleep quality analysis
   */
  getSleepAnalysis(): {
    quality: 'poor' | 'fair' | 'good' | 'excellent';
    score: number;
    insights: string[];
  } | null {
    if (!this.config.enableSleepAnalysis) {
      return null;
    }

    // Get the most recent sleep data
    const sleepData = Array.from(this.latestData.values())
      .map((d) => d.sleepData)
      .filter((s): s is SleepData => s !== undefined)
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())[0];

    if (!sleepData) {
      return null;
    }

    // Calculate sleep score
    const durationHours = sleepData.totalMinutes / 60;
    const efficiency = sleepData.efficiency;
    const deepSleepRatio = sleepData.deepSleepMinutes / sleepData.totalMinutes;

    const score = Math.round(
      durationHours >= 7 && durationHours <= 9
        ? 25
        : 15 + efficiency * 0.4 + deepSleepRatio * 100 * 0.35
    );

    const quality =
      score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';

    const insights: string[] = [];
    if (durationHours < 7) {
      insights.push(`You slept ${durationHours.toFixed(1)} hours - aim for 7-9 hours`);
    }
    if (efficiency < 0.85) {
      insights.push('Your sleep efficiency could improve - try consistent sleep times');
    }
    if (deepSleepRatio < 0.15) {
      insights.push('Low deep sleep - consider reducing evening screen time');
    }

    return { quality, score, insights };
  }

  /**
   * Get activity summary
   */
  getActivitySummary(): {
    steps: number;
    activeMinutes: number;
    caloriesBurned: number;
    isGoalMet: boolean;
    insights: string[];
  } | null {
    if (!this.config.enableActivityTracking) {
      return null;
    }

    const activityData = Array.from(this.latestData.values())
      .map((d) => d.activityData)
      .filter((a): a is ActivityData => a !== undefined)[0];

    if (!activityData) {
      return null;
    }

    const stepGoal = 10000;
    const activeMinuteGoal = 30;

    const isGoalMet =
      activityData.steps >= stepGoal || activityData.activeMinutes >= activeMinuteGoal;

    const insights: string[] = [];
    if (activityData.steps < stepGoal * 0.5) {
      insights.push('Try to move more today - even a short walk helps');
    }
    if (activityData.activeMinutes >= activeMinuteGoal) {
      insights.push('Great job staying active today!');
    }

    return {
      steps: activityData.steps,
      activeMinutes: activityData.activeMinutes,
      caloriesBurned: activityData.caloriesBurned,
      isGoalMet,
      insights,
    };
  }

  // ==========================================================================
  // COACHING INTEGRATION
  // ==========================================================================

  /**
   * Get context for coaching based on wearable data
   */
  getCoachingContext(): {
    hasWearableData: boolean;
    stressLevel?: number;
    sleepQuality?: string;
    activityLevel?: string;
    suggestedTopics: string[];
  } {
    const stress = this.detectStressIndicators();
    const sleep = this.getSleepAnalysis();
    const activity = this.getActivitySummary();

    const suggestedTopics: string[] = [];

    if (stress?.isElevated) {
      suggestedTopics.push('stress management', 'breathing exercises', 'taking breaks');
    }

    if (sleep?.quality === 'poor' || sleep?.quality === 'fair') {
      suggestedTopics.push('sleep hygiene', 'bedtime routine', 'energy management');
    }

    if (activity && !activity.isGoalMet) {
      suggestedTopics.push('movement', 'incorporating exercise', 'energy through activity');
    }

    return {
      hasWearableData: this.latestData.size > 0,
      stressLevel: stress?.stressLevel,
      sleepQuality: sleep?.quality,
      activityLevel: activity?.isGoalMet ? 'active' : 'sedentary',
      suggestedTopics,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private average(numbers: (number | undefined)[]): number {
    const valid = numbers.filter((n): n is number => n !== undefined);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }

  // Sample data generators (would be replaced by actual API calls in production)
  private generateSampleMetrics(): HealthMetrics {
    return {
      restingHeartRate: 65 + Math.random() * 15,
      heartRateVariability: 40 + Math.random() * 30,
      respiratoryRate: 14 + Math.random() * 4,
      bloodOxygenLevel: 96 + Math.random() * 3,
      bodyTemperature: 97.5 + Math.random() * 1.5,
    };
  }

  private generateSampleSleep(): SleepData {
    return {
      startTime: new Date(Date.now() - 8 * 60 * 60 * 1000),
      endTime: new Date(),
      totalMinutes: 400 + Math.random() * 100,
      deepSleepMinutes: 60 + Math.random() * 40,
      remSleepMinutes: 80 + Math.random() * 40,
      lightSleepMinutes: 200 + Math.random() * 60,
      awakeMinutes: 10 + Math.random() * 20,
      efficiency: 0.8 + Math.random() * 0.15,
    };
  }

  private generateSampleActivity(): ActivityData {
    return {
      steps: Math.floor(5000 + Math.random() * 10000),
      distance: 3 + Math.random() * 5,
      caloriesBurned: 1800 + Math.random() * 800,
      activeMinutes: 20 + Math.random() * 60,
      standHours: 8 + Math.random() * 6,
      exerciseMinutes: Math.random() * 45,
    };
  }

  private generateSampleHeartRate(): HeartRateData {
    return {
      current: 70 + Math.random() * 20,
      min: 55 + Math.random() * 10,
      max: 120 + Math.random() * 40,
      average: 75 + Math.random() * 15,
      zones: {
        resting: 400,
        fatBurn: 120,
        cardio: 30,
        peak: 10,
      },
    };
  }

  /**
   * Get configuration
   */
  getConfig(): WearableConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WearableConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const services = new Map<string, WearableIntegrationService>();

/**
 * Get or create a wearable integration service for a user
 */
export function getWearableIntegration(
  userId: string,
  config?: Partial<WearableConfig>
): WearableIntegrationService {
  if (!services.has(userId)) {
    services.set(userId, new WearableIntegrationService(userId, config));
  }
  return services.get(userId)!;
}

/**
 * Remove a wearable integration service
 */
export function removeWearableIntegration(userId: string): void {
  services.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export * from './types.js';

export default {
  getWearableIntegration,
  removeWearableIntegration,
  WearableIntegrationService,
};
