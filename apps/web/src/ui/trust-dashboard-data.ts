/**
 * Trust dashboard data: the six /api/trust routes it reads, their shapes, and
 * the parser that decides whether a response has anything to show.
 *
 * Every route answers `hasData`. With nothing recorded the server sends nulls
 * and empty lists, so the parser returns null and the tab shows its empty
 * state instead of rendering "null" as a score.
 *
 * @module TrustDashboardData
 */

export type TrustTab = 'health' | 'timeline' | 'events' | 'journal' | 'media' | 'insights';

export const TRUST_TAB_PATHS: Readonly<Record<TrustTab, string>> = {
  health: '/api/trust/health',
  timeline: '/api/trust/sentiment',
  events: '/api/trust/life-events',
  journal: '/api/trust/journaling/prompts',
  media: '/api/trust/media/suggestions',
  insights: '/api/trust/insights',
};

export interface HealthData {
  score: number;
  stage: string;
  stageName: string;
  trend: string;
  factors: Array<{ name: string; score: number; trend: string }>;
  alerts: Array<{ message: string; severity: string }>;
}

export interface TimelineData {
  currentMood: string | null;
  peaks: Array<{ type: string; date: string; valence: number }>;
  patterns: Array<{ description: string; confidence: number }>;
}

export interface UpcomingEvent {
  description: string;
  type: string;
  date: string;
  daysUntil: number;
}

export interface EventsData {
  today: UpcomingEvent[];
  thisWeek: UpcomingEvent[];
  nextWeek: UpcomingEvent[];
  thisMonth: UpcomingEvent[];
}

export interface JournalData {
  prompts: Array<{ id: string; prompt: string; category: string; difficulty: string }>;
}

export interface MediaData {
  suggestions: Array<{
    id: string;
    title: string;
    artist?: string;
    type: string;
    reason: string;
    intent: string;
  }>;
}

export interface InsightsData {
  latest: {
    summary: { headline: string; emoji: string; overallMood: string };
    conversations: { totalSessions: number; totalMinutes: number };
    wins: { totalWins: number; biggestWin?: string };
  } | null;
}

export interface TrustTabData {
  health: HealthData;
  timeline: TimelineData;
  events: EventsData;
  journal: JournalData;
  media: MediaData;
  insights: InsightsData;
}

/** The tab's data, or null when the server says there's nothing yet. */
export function parseTrustTab<T extends TrustTab>(tab: T, body: unknown): TrustTabData[T] | null {
  if (typeof body !== 'object' || body === null) return null;
  if ((body as { hasData?: unknown }).hasData !== true) return null;
  if (tab === 'health' && typeof (body as { score?: unknown }).score !== 'number') return null;
  return body as TrustTabData[T];
}

/** Escape text recorded from conversation before it goes into innerHTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
