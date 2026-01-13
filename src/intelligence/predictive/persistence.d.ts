/**
 * Predictive Intelligence Persistence Layer
 *
 * Stores learned ML model state to Firestore so patterns survive restarts.
 *
 * WHAT GETS PERSISTED:
 * - Markov chain transition counts
 * - Time-series historical data
 * - Reinforcement learning weights
 * - Signal accuracy scores
 *
 * ARCHITECTURE:
 * - In-memory for fast reads during conversation
 * - Periodic flush to Firestore (batched for efficiency)
 * - Load on first access per user
 * - Shared community patterns stored separately
 *
 * @module intelligence/predictive/persistence
 */
export interface MarkovPersistenceData {
    firstOrder: Record<string, Record<string, TransitionData>>;
    secondOrder: Record<string, Record<string, TransitionData>>;
    totalObservations: number;
    lastUpdated: number;
}
interface TransitionData {
    probability: number;
    observations: number;
    lastSeen: number;
    confidence: 'low' | 'medium' | 'high' | 'very_high';
}
export interface TimeSeriesPersistenceData {
    mood: TimeSeriesPointData[];
    energy: TimeSeriesPointData[];
    engagement: TimeSeriesPointData[];
    stress: TimeSeriesPointData[];
    seasonality: SeasonalityData;
    lastUpdated: number;
}
interface TimeSeriesPointData {
    timestamp: number;
    value: number;
    dayOfWeek?: number;
    hourOfDay?: number;
    topic?: string;
}
interface SeasonalityData {
    mood: {
        dayOfWeek: number[];
        hourOfDay: number[];
    };
    energy: {
        dayOfWeek: number[];
        hourOfDay: number[];
    };
    engagement: {
        dayOfWeek: number[];
        hourOfDay: number[];
    };
    stress: {
        dayOfWeek: number[];
        hourOfDay: number[];
    };
}
export interface ReinforcementPersistenceData {
    predictions: Record<string, PredictionTrackingData>;
    calibration: CalibrationBucket[];
    signalAccuracy: Record<string, SignalAccuracyData>;
    outreachHistory: OutreachHistoryEntry[];
    lastUpdated: number;
}
interface PredictionTrackingData {
    prediction: string;
    confidence: number;
    timestamp: number;
    resolved: boolean;
    outcome?: string;
    actualHappened?: boolean;
}
interface CalibrationBucket {
    binStart: number;
    binEnd: number;
    actualRate: number;
    count: number;
}
interface SignalAccuracyData {
    signal: string;
    correctPredictions: number;
    totalPredictions: number;
    accuracy: number;
}
interface OutreachHistoryEntry {
    timestamp: number;
    hour: number;
    dayOfWeek: number;
    outcome: 'positive' | 'negative' | 'neutral';
}
/**
 * Save Markov model state to Firestore
 */
export declare function saveMarkovState(userId: string, data: MarkovPersistenceData): Promise<void>;
/**
 * Load Markov model state from Firestore
 */
export declare function loadMarkovState(userId: string): Promise<MarkovPersistenceData | null>;
/**
 * Save time series model state to Firestore
 */
export declare function saveTimeSeriesState(userId: string, data: TimeSeriesPersistenceData): Promise<void>;
/**
 * Load time series model state from Firestore
 */
export declare function loadTimeSeriesState(userId: string): Promise<TimeSeriesPersistenceData | null>;
/**
 * Save reinforcement learning state to Firestore
 */
export declare function saveReinforcementState(userId: string, data: ReinforcementPersistenceData): Promise<void>;
/**
 * Load reinforcement learning state from Firestore
 */
export declare function loadReinforcementState(userId: string): Promise<ReinforcementPersistenceData | null>;
/**
 * Save community-wide patterns (aggregated, anonymous)
 */
export declare function saveCommunityPatterns(data: MarkovPersistenceData): Promise<void>;
/**
 * Load community-wide patterns
 */
export declare function loadCommunityPatterns(): Promise<MarkovPersistenceData | null>;
/**
 * Mark a user's ML state as dirty (needs persistence)
 */
export declare function markDirty(userId: string): void;
/**
 * Check if user is loaded
 */
export declare function isUserLoaded(userId: string): boolean;
/**
 * Mark user as loaded
 */
export declare function markUserLoaded(userId: string): void;
/**
 * Flush all dirty users to Firestore
 *
 * Called periodically by scheduled job or on shutdown.
 */
export declare function flushDirtyUsers(getMarkovData: (userId: string) => MarkovPersistenceData | null, getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null, getReinforcementData: (userId: string) => ReinforcementPersistenceData | null): Promise<{
    flushed: number;
    errors: number;
}>;
/**
 * Force flush a specific user (e.g., on session end)
 * Uses lock to prevent concurrent writes to the same user's data.
 */
export declare function forceFlushUser(userId: string, getMarkovData: (userId: string) => MarkovPersistenceData | null, getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null, getReinforcementData: (userId: string) => ReinforcementPersistenceData | null): Promise<void>;
/**
 * Initialize persistence layer with periodic flushing
 */
export declare function initializePersistence(getMarkovData: (userId: string) => MarkovPersistenceData | null, getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null, getReinforcementData: (userId: string) => ReinforcementPersistenceData | null): void;
/**
 * Shutdown persistence layer (flush remaining data)
 */
export declare function shutdownPersistence(getMarkovData: (userId: string) => MarkovPersistenceData | null, getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null, getReinforcementData: (userId: string) => ReinforcementPersistenceData | null): Promise<void>;
export declare const predictiveMLPersistence: {
    saveMarkov: typeof saveMarkovState;
    loadMarkov: typeof loadMarkovState;
    saveTimeSeries: typeof saveTimeSeriesState;
    loadTimeSeries: typeof loadTimeSeriesState;
    saveReinforcement: typeof saveReinforcementState;
    loadReinforcement: typeof loadReinforcementState;
    saveCommunity: typeof saveCommunityPatterns;
    loadCommunity: typeof loadCommunityPatterns;
    markDirty: typeof markDirty;
    flushDirty: typeof flushDirtyUsers;
    forceFlush: typeof forceFlushUser;
    initialize: typeof initializePersistence;
    shutdown: typeof shutdownPersistence;
    isUserLoaded: typeof isUserLoaded;
    markUserLoaded: typeof markUserLoaded;
};
export default predictiveMLPersistence;
//# sourceMappingURL=persistence.d.ts.map