/**
 * Maps what GET /api/team-insights sends (src/api/routes/team-insights.ts,
 * the same TeamInsight shape the team insights panel reads) onto the
 * notification shape the cross-team notifications service shows, and tells
 * the server once an insight has been shown so it is not shown again.
 */

import { TeamInsightSchema, type TeamInsight } from '../types/team-insight.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CrossTeamInsightMapper');

export type CrossTeamInsightType = 'celebration' | 'support' | 'coordination' | 'insight' | 'handoff_suggestion';
export type CrossTeamPriority = 'high' | 'medium' | 'low';

export interface CrossTeamInsight {
  id: string;
  type: CrossTeamInsightType;
  sourcePersona: string;
  targetPersona: string;
  message: string;
  priority: CrossTeamPriority;
  timestamp: Date;
  acknowledged?: boolean;
}

const TYPE_BY_CATEGORY: Record<TeamInsight['category'], CrossTeamInsightType> = {
  financial_pattern: 'insight',
  habit_pattern: 'insight',
  goal_progress: 'celebration',
  emotional_state: 'support',
  proactive_opportunity: 'coordination',
  wisdom_nugget: 'insight',
  communication_opportunity: 'coordination',
};

const PRIORITY_BY_SERVER: Record<TeamInsight['priority'], CrossTeamPriority> = {
  critical: 'high',
  high: 'high',
  normal: 'medium',
  low: 'low',
};

/** The server reads insights for Ferni (buildInsightBriefingForHandoff(userId, 'ferni')). */
const SERVER_TARGET_PERSONA = 'ferni';

export function toCrossTeamInsight(raw: TeamInsight): CrossTeamInsight {
  return {
    id: raw.id,
    type: TYPE_BY_CATEGORY[raw.category] ?? 'insight',
    sourcePersona: raw.source || 'ferni',
    targetPersona: SERVER_TARGET_PERSONA,
    message: raw.summary || raw.content || '',
    priority: PRIORITY_BY_SERVER[raw.priority] ?? 'low',
    timestamp: new Date(raw.createdAt || Date.now()),
    acknowledged: false,
  };
}

/** POST /api/team-insights/acknowledge/:id, so a shown insight is consumed server side. */
export async function acknowledgeTeamInsight(insightId: string): Promise<boolean> {
  const res = await apiPost(`/api/team-insights/acknowledge/${encodeURIComponent(insightId)}`);
  if (!res.ok) log.warn('Failed to acknowledge team insight', { insightId, status: res.status, error: res.error });
  return res.ok;
}

/**
 * Keeps the insights that match TeamInsightSchema and drops the rest with a
 * warning, so a malformed payload never reaches a card or a toast.
 */
export function parseTeamInsights(raw: unknown, origin: string): TeamInsight[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) log.warn({ origin }, 'Team insights payload was not a list; ignored');
    return [];
  }
  return raw.flatMap((item: unknown) => {
    const result = TeamInsightSchema.safeParse(item);
    if (result.success) return [result.data];
    const id = (item as { id?: unknown } | null)?.id;
    log.warn(
      { origin, id: typeof id === 'string' ? id : undefined, issues: result.error.issues.map((i) => i.path.join('.')) },
      'Dropped a malformed team insight'
    );
    return [];
  });
}
