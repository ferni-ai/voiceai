import { z } from 'zod';

const Text = z.string().trim().min(1);

/**
 * A team insight as the server sends it: GET /api/team-insights and the
 * /ws/insights 'new_insight' event (both shaped by
 * src/services/cross-persona/insight-wire-format.ts). Parse with
 * parseTeamInsights() in services/cross-team-insight-mapper.ts.
 */
export const TeamInsightSchema = z.object({
  id: Text,
  // Persona ids and categories are open sets on the server (categories such as
  // 'burnout-warning' are minted per rule), so only their presence is checked.
  source: Text,
  category: Text,
  summary: Text,
  content: Text,
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  createdAt: z.number(),
  isNew: z.boolean().optional(),
});

export type TeamInsight = z.infer<typeof TeamInsightSchema>;
