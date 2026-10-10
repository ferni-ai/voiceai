/**
 * Wellbeing API contract (web side).
 *
 * Mirrors src/api/wellbeing-data.ts. A dimension the user never mentioned is
 * null, and a user with no wellbeing data gets `hasData: false` with
 * `currentState: null`, so the dashboard can show its empty state instead of
 * placeholder 50% scores.
 *
 * @module ui/wellbeing-api
 */

export interface ApiCurrentState {
  mood: number | null;
  energy: number | null;
  anxiety: number | null;
  connection: number | null;
  purpose: number | null;
  sleep: number | null;
  lastUpdated: string;
}

/** API response format from /api/wellbeing/dashboard */
export interface ApiDashboardResponse {
  userId: string;
  /** Absent on servers older than this contract. */
  hasData?: boolean;
  currentState: ApiCurrentState | null;
  trends: {
    period: 'week' | 'month';
    direction: 'improving' | 'stable' | 'declining';
    changedDimensions: string[];
  };
  insights: Array<{
    type: 'pattern' | 'suggestion' | 'celebration';
    message: string;
    dimension?: string;
  }>;
  warnings: Array<{
    type: string;
    severity: 'watch' | 'concern' | 'urgent';
    message: string;
  }>;
  streaks: {
    currentDays: number;
    bestDays: number;
    lastCheckIn: string;
  };
}

/** API response format from /api/wellbeing/trends */
export interface ApiTrendsResponse {
  userId: string;
  period: 'week' | 'month' | 'quarter';
  dataPoints: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    connection: number | null;
    purpose: number | null;
    sleep: number | null;
  }>;
  averages: {
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    connection: number | null;
    purpose: number | null;
    sleep: number | null;
  };
}

export type ApiDashboardWithData = ApiDashboardResponse & { currentState: ApiCurrentState };

/**
 * Whether the user has any real wellbeing data. Older servers sent neutral
 * 0.5 scores with no `hasData` flag; for them, a real check-in is the only
 * honest signal.
 */
export function hasWellbeingData(res: ApiDashboardResponse): res is ApiDashboardWithData {
  if (!res.currentState) return false;
  if (typeof res.hasData === 'boolean') return res.hasData;
  return res.streaks.lastCheckIn !== '';
}
