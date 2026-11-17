/**
 * The relationship's numbers as the server keeps them: conversations, days together, day
 * streaks and stage, read from GET /api/relationship/progress. The server counts them from
 * the stored calls (src/services/stores/sessions-together.ts), the one count of sessions
 * together.
 *
 * relationshipStageService takes these and every surface reads that service: the home
 * journey card, the journey dialog, Our Story So Far and What I'm Noticing. Before this, each
 * surface had its own source (a device-only count that started at 0 and "New Friends", the
 * relationship arc, the memory profile), so one person saw 0, 59 and 777 conversations at
 * once. Until the server answers, nothing shows a number: no device count, no default.
 *
 * @module services/relationship-facts
 */

import { apiGet } from '../utils/api.js';

/**
 * The stages the server names, in order (the same union as relationship-stage.service's
 * RelationshipStage; spelled here so this module imports nothing from the service).
 */
const STAGES = [
  'first-meeting',
  'getting-started',
  'building-trust',
  'established',
  'deep-partnership',
] as const;
type RelationshipStage = (typeof STAGES)[number];

export interface RelationshipFacts {
  stage: RelationshipStage;
  conversations: number;
  daysTogether: number;
  currentStreak: number;
  longestStreak: number;
  /** ISO date of the first session together, or null when there has been none */
  firstMeetingDate: string | null;
}

/** Where the facts are: still on their way, here, or the server could not give them. */
export type RelationshipFactsStatus = 'loading' | 'known' | 'unavailable';

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The facts in a /api/relationship/progress body, or null when any of them is missing or
 * malformed. A partial answer is not filled in: a missing count is unknown, never 0.
 */
export function parseRelationshipFacts(body: unknown): RelationshipFacts | null {
  if (!body || typeof body !== 'object') return null;
  const { stage, metrics, firstMeetingDate } = body as {
    stage?: unknown;
    metrics?: Record<string, unknown> | null;
    firstMeetingDate?: unknown;
  };
  if (!STAGES.includes(stage as RelationshipStage) || !metrics) return null;
  const conversations = count(metrics.totalConversations);
  const daysTogether = count(metrics.daysSinceFirstMeeting);
  const currentStreak = count(metrics.currentStreak);
  const longestStreak = count(metrics.longestStreak);
  if (conversations === null || daysTogether === null) return null;
  if (currentStreak === null || longestStreak === null) return null;
  return {
    stage: stage as RelationshipStage,
    conversations,
    daysTogether,
    currentStreak,
    longestStreak,
    firstMeetingDate: typeof firstMeetingDate === 'string' ? firstMeetingDate : null,
  };
}

/** Ask the server for the facts. Null when it can't say (signed out, offline, an error). */
export async function fetchRelationshipFacts(): Promise<RelationshipFacts | null> {
  const response = await apiGet<unknown>('/api/relationship/progress');
  return response.ok ? parseRelationshipFacts(response.data) : null;
}
