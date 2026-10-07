import { apiGet } from '../utils/api.js';

export interface CapabilityStats {
  capability: string;
  totalUsage: number;
  appliedCount: number;
  positiveReactions: number;
  neutralReactions: number;
  negativeReactions: number;
  effectivenessScore: number;
}

export interface TrendPoint {
  date: string;
  effectiveness: number;
  usageCount: number;
}

export interface DashboardData {
  stats: CapabilityStats[];
  topCapabilities: Array<{ capability: string; score: number }>;
  trend: TrendPoint[];
  trendCapability: string | null;
}

interface CapabilityRow {
  capability: string;
  usage: number;
  applied: number;
  positive: number;
  neutral: number;
  negative: number;
  effectivenessRate: number;
}

interface TopCapability {
  capability: string;
  effectivenessRate: number;
}

interface TrendDay {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

function toCapabilityStats(row: CapabilityRow): CapabilityStats {
  return {
    capability: row.capability,
    totalUsage: row.usage,
    appliedCount: row.applied,
    positiveReactions: row.positive,
    neutralReactions: row.neutral,
    negativeReactions: row.negative,
    effectivenessScore: row.effectivenessRate / 100,
  };
}

function toTrendPoint(day: TrendDay): TrendPoint {
  const usageCount = day.positive + day.neutral + day.negative;
  return {
    date: day.date,
    effectiveness: usageCount > 0 ? day.positive / usageCount : 0,
    usageCount,
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [statsRes, topRes] = await Promise.all([
    apiGet<{ all?: CapabilityRow[] }>('/api/v1/admin/bth/capabilities'),
    apiGet<{ recommended?: TopCapability[] }>('/api/v1/admin/bth/top'),
  ]);

  if (!statsRes.ok || !topRes.ok) {
    throw new Error('Failed to fetch analytics data');
  }

  const top = (topRes.data?.recommended || []).slice(0, 5);
  const trendCapability = top[0]?.capability ?? null;
  let trend: TrendPoint[] = [];
  if (trendCapability) {
    const trendRes = await apiGet<{ trends?: TrendDay[] }>(
      `/api/v1/admin/bth/trends/${encodeURIComponent(trendCapability)}`
    );
    trend = trendRes.ok ? (trendRes.data?.trends || []).map(toTrendPoint) : [];
  }

  return {
    stats: (statsRes.data?.all || []).map(toCapabilityStats),
    topCapabilities: top.map((c) => ({ capability: c.capability, score: c.effectivenessRate })),
    trend,
    trendCapability,
  };
}
