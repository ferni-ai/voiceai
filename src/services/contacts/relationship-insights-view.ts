/**
 * The Relationship Insights dashboard's data, built from the user's real
 * contacts and computed insights.
 *
 * GET /api/contacts/insights used to send only `{ insights, needsAttention,
 * overdueFrequent }` while the web dashboard (apps/web/src/ui/
 * relationship-insights.ui.ts) reads `stats`, `strengthDistribution` and
 * `recentActivity` and a differently shaped insight. Rendering the real
 * response threw, and the dashboard's catch then showed made-up people
 * ("Reconnect with Sarah") to every user. This builds exactly what the
 * dashboard reads, from data we actually have; nothing is estimated.
 *
 * @module services/contacts/relationship-insights-view
 */

import type { ContactInsight, ContactRelationship } from './contact-relationship-service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 30;
const ACTIVITY_DAYS = 28;

export interface RelationshipInsightView {
  id: string;
  type: 'nudge' | 'pattern' | 'milestone' | 'warning';
  title: string;
  description: string;
  actionLabel?: string;
  contactId: string;
  contactName: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RelationshipInsightsView {
  stats: {
    totalPeople: number;
    familyCount: number;
    friendCount: number;
    colleagueCount: number;
    averageStrength: number;
    upcomingDates: number;
    needsAttention: number;
  };
  insights: RelationshipInsightView[];
  strengthDistribution: Array<{ label: string; value: number; color: string }>;
  /** Per day, newest first: how many contacts were last reached that day. */
  recentActivity: Array<{ date: string; count: number }>;
}

const INSIGHT_TYPE: Record<ContactInsight['insightType'], RelationshipInsightView['type']> = {
  'follow-up': 'nudge',
  overdue: 'nudge',
  weakening: 'warning',
  strengthening: 'milestone',
  pattern: 'pattern',
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Days from `now` until the next occurrence of an MM-DD or YYYY-MM-DD date. */
function daysUntil(date: string, now: Date): number | null {
  const match = /(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), Number(match[1]) - 1, Number(match[2]));
  if (next < today)
    next = Date.UTC(now.getUTCFullYear() + 1, Number(match[1]) - 1, Number(match[2]));
  return Math.round((next - today) / DAY_MS);
}

function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function buildRelationshipInsightsView(
  contacts: ContactRelationship[],
  insights: ContactInsight[],
  now: Date = new Date()
): RelationshipInsightsView {
  const total = contacts.length;
  const count = (test: (c: ContactRelationship) => boolean) => contacts.filter(test).length;
  const strengthSum = contacts.reduce((sum, c) => sum + (c.strengthScore || 0), 0);

  const lastReached = new Map<string, number>();
  for (const contact of contacts) {
    const at = new Date(contact.lastInteraction);
    if (Number.isNaN(at.getTime())) continue;
    lastReached.set(dayKey(at), (lastReached.get(dayKey(at)) ?? 0) + 1);
  }

  return {
    stats: {
      totalPeople: total,
      familyCount: count((c) => c.relationship === 'family'),
      friendCount: count((c) => c.relationship === 'friend'),
      colleagueCount: count(
        (c) => c.relationship === 'colleague' || c.relationship === 'professional'
      ),
      averageStrength: total > 0 ? Math.round(strengthSum / total) : 0,
      upcomingDates: contacts.reduce(
        (sum, c) =>
          sum +
          (c.importantDates ?? []).filter((d) => {
            const days = daysUntil(d.date, now);
            return days !== null && days <= UPCOMING_DAYS;
          }).length,
        0
      ),
      // People with at least one insight asking for action.
      needsAttention: new Set(insights.filter((i) => i.priority !== 'low').map((i) => i.contactId))
        .size,
    },
    insights: insights.map((insight) => ({
      id: `${insight.contactId}:${insight.insightType}`,
      type: INSIGHT_TYPE[insight.insightType],
      title: insight.contactName,
      description: insight.message,
      ...(insight.suggestedAction ? { actionLabel: insight.suggestedAction } : {}),
      contactId: insight.contactId,
      contactName: insight.contactName,
      priority: insight.priority,
    })),
    strengthDistribution:
      total === 0
        ? []
        : [
            {
              label: 'Strong',
              value: percentOf(
                count((c) => c.strengthScore >= 70),
                total
              ),
              color: 'var(--persona-primary)',
            },
            {
              label: 'Good',
              value: percentOf(
                count((c) => c.strengthScore >= 40 && c.strengthScore < 70),
                total
              ),
              color: 'var(--nayan-primary)',
            },
            {
              label: 'Needs work',
              value: percentOf(
                count((c) => c.strengthScore < 40),
                total
              ),
              color: 'var(--color-semantic-error)',
            },
          ],
    recentActivity: Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const date = dayKey(new Date(now.getTime() - i * DAY_MS));
      return { date, count: lastReached.get(date) ?? 0 };
    }),
  };
}
