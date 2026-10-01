/**
 * Relationship Insights data shaping: backend payload mapping and demo data.
 * Extracted from relationship-insights.ui.ts.
 */

import type {
  RelationshipInsight,
  RelationshipInsightsData,
} from './relationship-insights.types.js';

// Backend shapes (src/api/contacts-routes.ts)
export interface ContactsInsightsPayload {
  insights?: Array<{
    contactId: string;
    contactName: string;
    insightType: 'overdue' | 'strengthening' | 'weakening' | 'follow-up' | 'pattern';
    message: string;
    priority: 'high' | 'medium' | 'low';
    suggestedAction?: string;
  }>;
  needsAttention?: Array<{ id: string }>;
}

export interface ContactsListPayload {
  contacts?: Array<{
    relationship?: string;
    strengthScore?: number;
    importantDates?: Array<{ date: string }>;
  }>;
}

export const INSIGHT_TYPE_MAP: Record<string, RelationshipInsight['type']> = {
  overdue: 'nudge',
  'follow-up': 'nudge',
  strengthening: 'milestone',
  weakening: 'warning',
  pattern: 'pattern',
};

/** True if an MM-DD or YYYY-MM-DD date recurs within the next `days` days */
export function isUpcoming(date: string, days: number): boolean {
  const parts = date.split('-').map(Number);
  const [month, day] = parts.length === 3 ? parts.slice(1) : parts;
  if (!month || !day) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return next.getTime() - today.getTime() <= days * 24 * 60 * 60 * 1000;
}

/** Build the panel's view model from real contacts + insights data */
export function buildInsightsData(
  insightsPayload: ContactsInsightsPayload,
  contactsPayload: ContactsListPayload
): RelationshipInsightsData {
  const contacts = contactsPayload.contacts ?? [];
  const count = (rel: string): number => contacts.filter((c) => c.relationship === rel).length;
  const scores = contacts.map((c) => c.strengthScore ?? 0);
  const pct = (n: number): number =>
    contacts.length ? Math.round((n / contacts.length) * 100) : 0;

  return {
    stats: {
      totalPeople: contacts.length,
      familyCount: count('family'),
      friendCount: count('friend'),
      colleagueCount: count('colleague'),
      averageStrength: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0,
      upcomingDates: contacts.filter((c) =>
        (c.importantDates ?? []).some((d) => isUpcoming(d.date, 30))
      ).length,
      needsAttention: insightsPayload.needsAttention?.length ?? 0,
    },
    insights: (insightsPayload.insights ?? []).map((insight, i) => ({
      id: `${insight.contactId}_${i}`,
      type: INSIGHT_TYPE_MAP[insight.insightType] ?? 'pattern',
      title: insight.contactName,
      description: insight.message,
      actionLabel: insight.suggestedAction,
      contactId: insight.contactId,
      contactName: insight.contactName,
      priority: insight.priority,
    })),
    strengthDistribution: [
      {
        label: 'Strong',
        value: pct(scores.filter((v) => v >= 70).length),
        color: 'var(--persona-primary)',
      },
      {
        label: 'Good',
        value: pct(scores.filter((v) => v >= 40 && v < 70).length),
        color: 'var(--nayan-primary)',
      },
      {
        label: 'Needs work',
        value: pct(scores.filter((v) => v < 40).length),
        color: 'var(--color-semantic-error)',
      },
    ],
    // No per-day interaction history endpoint yet; show an empty grid rather than invent one
    recentActivity: [],
  };
}

export function getMockData(): RelationshipInsightsData {
  return {
    stats: {
      totalPeople: 12,
      familyCount: 4,
      friendCount: 5,
      colleagueCount: 3,
      averageStrength: 68,
      upcomingDates: 2,
      needsAttention: 3,
    },
    insights: [
      {
        id: '1',
        type: 'nudge',
        title: 'Reconnect with Sarah',
        description: "It's been 3 weeks since you last talked. Maybe send a quick hello?",
        contactId: 'sarah-123',
        contactName: 'Sarah Johnson',
        priority: 'high',
      },
      {
        id: '2',
        type: 'milestone',
        title: "Mom's birthday is coming up",
        description: 'In 5 days. Have you thought about what to get her?',
        contactId: 'mom-456',
        contactName: 'Mom',
        priority: 'high',
      },
      {
        id: '3',
        type: 'pattern',
        title: 'Great connection streak!',
        description: "You've been in touch with family every week this month.",
        priority: 'low',
      },
    ],
    strengthDistribution: [
      { label: 'Strong', value: 35, color: 'var(--persona-primary)' },
      { label: 'Good', value: 40, color: 'var(--nayan-primary)' },
      { label: 'Needs work', value: 25, color: 'var(--color-semantic-error)' },
    ],
    recentActivity: Array.from({ length: 28 }, (_, i) => {
      const dateStr =
        new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
      return {
        date: dateStr,
        count: Math.floor(Math.random() * 8),
      };
    }),
  };
}
