/** A team insight as the /api/team-insights endpoint returns it. */
export interface TeamInsight {
  id: string;
  source: 'peter' | 'maya' | 'jordan' | 'nayan' | 'alex' | 'ferni' | 'system';
  category:
    | 'financial_pattern'
    | 'habit_pattern'
    | 'goal_progress'
    | 'emotional_state'
    | 'proactive_opportunity'
    | 'wisdom_nugget'
    | 'communication_opportunity';
  summary: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: number;
  isNew?: boolean;
}
