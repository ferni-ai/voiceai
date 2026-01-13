/**
 * Time Series Forecaster
 *
 * TRUE PREDICTIVE INTELLIGENCE: Forecast mood, energy, and engagement over time.
 *
 * Unlike simple rules like "if Sunday → anxious", this uses actual time-series
 * forecasting to predict continuous values based on historical patterns.
 *
 * Techniques:
 * - Exponential smoothing for trend detection
 * - Seasonal decomposition (weekly, monthly cycles)
 * - Anomaly detection for unusual states
 * - Confidence intervals for predictions
 *
 * @module intelligence/predictive/time-series-forecaster
 */
import { type TimeSeriesPersistenceData } from './persistence.js';
/** Time series data point */
export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
    metadata?: {
        dayOfWeek: number;
        hourOfDay: number;
        topic?: string;
        event?: string;
    };
}
/** Forecast result */
export interface Forecast {
    /** When we're forecasting for */
    targetTime: Date;
    /** Predicted value */
    predictedValue: number;
    /** Confidence interval */
    confidence: {
        lower: number;
        upper: number;
        level: number;
    };
    /** Components of the forecast */
    components: {
        level: number;
        trend: number;
        seasonality: number;
    };
    /** How reliable is this forecast */
    reliability: 'high' | 'medium' | 'low' | 'insufficient_data';
    /** Detected anomaly? */
    anomaly?: {
        detected: boolean;
        deviation: number;
        direction: 'above' | 'below';
    };
}
type SeriesType = 'mood' | 'energy' | 'engagement' | 'stress';
/**
 * Record a time series observation
 *
 * @param userId - User to record for
 * @param series - Which series (mood, energy, engagement, stress)
 * @param value - Observed value (0-1 normalized)
 * @param timestamp - When observed
 * @param metadata - Optional context
 */
export declare function recordObservation(userId: string, series: SeriesType, value: number, timestamp?: Date, metadata?: TimeSeriesPoint['metadata']): void;
/**
 * Forecast a future value
 *
 * @param userId - User to forecast for
 * @param series - Which series to forecast
 * @param targetTime - When to forecast for
 * @returns Forecast with prediction and confidence
 */
export declare function forecast(userId: string, series: SeriesType, targetTime?: Date): Forecast;
/**
 * Get best/worst predicted times for a metric
 *
 * @param userId - User to analyze
 * @param series - Which metric
 * @param daysAhead - How many days to look ahead
 * @returns Array of forecasts sorted by predicted value
 */
export declare function findOptimalTimes(userId: string, series: SeriesType, daysAhead?: number): Array<{
    time: Date;
    forecast: Forecast;
}>;
/**
 * Predict trend direction over time
 *
 * @param userId - User to analyze
 * @param series - Which metric
 * @returns Trend analysis
 */
export declare function analyzeTrend(userId: string, series: SeriesType): {
    direction: 'improving' | 'stable' | 'declining';
    magnitude: number;
    confidence: number;
    periodDays: number;
};
/**
 * Get time series data for persistence (called by persistence layer)
 */
export declare function getTimeSeriesDataForPersistence(userId: string): TimeSeriesPersistenceData | null;
declare const _default: {
    recordObservation: typeof recordObservation;
    forecast: typeof forecast;
    findOptimalTimes: typeof findOptimalTimes;
    analyzeTrend: typeof analyzeTrend;
    getTimeSeriesDataForPersistence: typeof getTimeSeriesDataForPersistence;
};
export default _default;
//# sourceMappingURL=time-series-forecaster.d.ts.map