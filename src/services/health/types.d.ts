/**
 * Health Data Types
 *
 * > "Better than human means knowing, not guessing."
 *
 * Types for health data integration from Apple HealthKit, Google Fit, etc.
 * Privacy-first: we store insights, not raw health records.
 *
 * @module services/health/types
 */
/**
 * Daily health summary - what we store in Firestore
 * Privacy-first: summaries only, not raw health data
 */
export interface HealthSummary {
    /** User ID */
    userId: string;
    /** Date (YYYY-MM-DD) */
    date: string;
    /** Timestamp when synced */
    syncedAt: string;
    /** Data source */
    source: 'apple_health' | 'google_fit' | 'manual';
    /** Total hours of sleep */
    sleepHours?: number;
    /** Sleep quality assessment */
    sleepQuality?: 'poor' | 'fair' | 'good' | 'excellent';
    /** Time went to bed (HH:MM) */
    bedtime?: string;
    /** Time woke up (HH:MM) */
    wakeTime?: string;
    /** Sleep consistency (compared to usual) */
    sleepConsistency?: 'earlier' | 'normal' | 'later';
    /** Heart rate variability (SDNN in ms) */
    hrvValue?: number;
    /** HRV trend over past 7 days */
    hrvTrend?: 'declining' | 'stable' | 'improving';
    /** HRV is significantly lower than baseline */
    hrvAnomalyDetected?: boolean;
    /** Resting heart rate */
    restingHeartRate?: number;
    /** Steps today */
    stepsToday?: number;
    /** Steps compared to 7-day average */
    activityTrend?: 'less_active' | 'normal' | 'more_active';
    /** Active energy burned (kcal) */
    activeCalories?: number;
    /** Exercise minutes today */
    exerciseMinutes?: number;
    /** Last workout type */
    lastWorkoutType?: string;
    /** Last workout date (ISO) */
    lastWorkoutDate?: string;
    /** Last meditation date (ISO) */
    lastMeditationDate?: string;
    /** Mindful minutes today */
    mindfulMinutes?: number;
    /** Mindfulness streak (days) */
    mindfulnessStreak?: number;
    /** Menstrual cycle day (if tracking enabled) */
    cycleDay?: number;
    /** Cycle phase */
    cyclePhase?: 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
    /** Overall wellbeing score (1-10) */
    wellbeingScore?: number;
    /** Generated insights for this day */
    insights?: string[];
}
/**
 * Context injection for LLM based on health data
 */
export interface HealthContext {
    /** Whether any health data is available */
    hasHealthData: boolean;
    /** Sleep insight to surface */
    sleepInsight?: string;
    /** Stress/HRV insight */
    stressInsight?: string;
    /** Activity insight */
    activityInsight?: string;
    /** Wellness insight */
    wellnessInsight?: string;
    /** Cycle awareness (if enabled) */
    cycleInsight?: string;
    /** Overall insight summary */
    summary?: string;
    /** Confidence level in insights */
    confidence: 'low' | 'medium' | 'high';
    /** Days of data available */
    dataAvailableDays: number;
}
/**
 * Request from mobile app to sync health data
 */
export interface HealthSyncRequest {
    /** User ID */
    userId: string;
    /** Device type */
    deviceType: 'ios' | 'android';
    /** Summary data to sync */
    summary: Partial<HealthSummary>;
    /** Sync timestamp */
    timestamp: string;
    /** App version */
    appVersion?: string;
}
/**
 * Response to health sync request
 */
export interface HealthSyncResponse {
    /** Whether sync was successful */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Next suggested sync time (ISO) */
    nextSyncSuggested?: string;
}
/**
 * User preferences for health data integration
 */
export interface HealthPreferences {
    /** Health integration enabled */
    enabled: boolean;
    /** Share sleep data */
    shareSleep: boolean;
    /** Share HRV/stress data */
    shareStress: boolean;
    /** Share activity data */
    shareActivity: boolean;
    /** Share wellness/mindfulness data */
    shareWellness: boolean;
    /** Share cycle data (very sensitive) */
    shareCycle: boolean;
    /** Proactive health mentions */
    proactiveHealthMentions: boolean;
    /** Last updated */
    updatedAt: string;
}
/**
 * Health-based proactive alert
 */
export interface HealthAlert {
    /** Alert type */
    type: 'poor_sleep' | 'stress_elevated' | 'inactivity' | 'meditation_lapse' | 'cycle_awareness';
    /** Severity */
    severity: 'low' | 'medium' | 'high';
    /** Alert message */
    message: string;
    /** Suggested action */
    suggestedAction?: string;
    /** Should we mention this proactively? */
    shouldMention: boolean;
    /** Generated at */
    generatedAt: string;
}
/**
 * Weekly health trend analysis
 */
export interface HealthTrends {
    /** User ID */
    userId: string;
    /** Week start date (YYYY-MM-DD) */
    weekStart: string;
    /** Average sleep hours */
    avgSleepHours?: number;
    /** Sleep trend */
    sleepTrend?: 'declining' | 'stable' | 'improving';
    /** Average HRV */
    avgHrv?: number;
    /** Stress trend */
    stressTrend?: 'increasing' | 'stable' | 'decreasing';
    /** Average daily steps */
    avgSteps?: number;
    /** Activity trend */
    activityTrend?: 'declining' | 'stable' | 'improving';
    /** Total mindful minutes */
    totalMindfulMinutes?: number;
    /** Days with exercise */
    exerciseDays?: number;
    /** Notable patterns */
    patterns?: string[];
    /** Generated at */
    generatedAt: string;
}
//# sourceMappingURL=types.d.ts.map