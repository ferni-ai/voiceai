/**
 * Relationship Insights types. Extracted from relationship-insights.ui.ts.
 */

export interface RelationshipInsight {
  id: string;
  type: 'nudge' | 'pattern' | 'milestone' | 'warning';
  title: string;
  description: string;
  actionLabel?: string;
  contactId?: string;
  contactName?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RelationshipStats {
  totalPeople: number;
  familyCount: number;
  friendCount: number;
  colleagueCount: number;
  averageStrength: number;
  upcomingDates: number;
  needsAttention: number;
}

export interface RelationshipInsightsData {
  stats: RelationshipStats;
  insights: RelationshipInsight[];
  strengthDistribution: { label: string; value: number; color: string }[];
  recentActivity: { date: string; count: number }[];
}

export interface RelationshipInsightsOptions {
  onSelectPerson?: (contactId: string) => void;
  onClose?: () => void;
}
