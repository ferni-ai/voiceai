/**
 * Prediction data shapes shared by the prediction services, event types, and their UI.
 *
 * @module types/predictions
 */

/** One predicted metric: the stored name, the guess, and the actual once recorded. */
export interface PredictionMetric {
  key: string;
  predicted: number;
  actual?: number;
}

export interface PredictionData {
  id: string;
  category: string;
  question: string;
  /** The first metric's guess (shown when only one number fits). */
  userPrediction: number;
  /** The first metric's actual value, once recorded. */
  actualOutcome?: number;
  /** Every predicted metric, by the name the server stored it under. */
  metrics?: PredictionMetric[];
  /** The server's score (0-100), present only for a scored resolution. */
  accuracy?: number;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

export interface CategoryAccuracy {
  category: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface PredictionTrackerData {
  overallAccuracy: number;
  totalPredictions: number;
  correctPredictions: number;
  byCategory: CategoryAccuracy[];
  recentTrend: number[];
  bestStreak: number;
  currentStreak: number;
}
