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

export type Trend = 'improving' | 'stable' | 'declining';

/** One factor of "how we're doing together"; `tone` picks its sentence. */
export interface HealthFactor {
  name: string;
  tone: string;
  score: number;
  trend: Trend | null;
  detail: Record<string, number>;
}

/** 'getting-started' has history but no score yet. */
export interface HealthData {
  state: 'getting-started' | 'ready';
  score: number | null;
  stage: string | null;
  stageName: string | null;
  trend: Trend | null;
  daysTalked: number;
  factors: HealthFactor[];
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

export type NoticedPeriod = 'week' | 'month';

/** One thing Ferni noticed, with the records it rests on. */
export interface NoticedInsight {
  kind: string;
  variant: string;
  params: Record<string, string | number>;
  evidence: string[];
}

export interface InsightsData {
  period: NoticedPeriod;
  latest: { period: NoticedPeriod; daysTalked: number; insights: NoticedInsight[] } | null;
}

export interface TrustTabData {
  health: HealthData;
  timeline: TimelineData;
  events: EventsData;
  journal: JournalData;
  media: MediaData;
  insights: InsightsData;
}

/** Where a tab's data lives; health and insights are read in the user's time zone. */
export function trustTabUrl(
  tab: TrustTab,
  opts: { tz?: string; period?: NoticedPeriod } = {}
): string {
  const query = new URLSearchParams();
  if (tab === 'insights' && opts.period) query.set('period', opts.period);
  if ((tab === 'health' || tab === 'insights') && opts.tz) query.set('tz', opts.tz);
  const qs = query.toString();
  return qs ? `${TRUST_TAB_PATHS[tab]}?${qs}` : TRUST_TAB_PATHS[tab];
}

function isHealth(body: { state?: unknown; score?: unknown; factors?: unknown }): boolean {
  if (!Array.isArray(body.factors)) return false;
  if (body.state === 'getting-started') return true;
  return body.state === 'ready' && typeof body.score === 'number';
}

/** The tab's data, or null when the server says there's nothing yet. */
export function parseTrustTab<T extends TrustTab>(tab: T, body: unknown): TrustTabData[T] | null {
  if (typeof body !== 'object' || body === null) return null;
  if ((body as { hasData?: unknown }).hasData !== true) return null;
  if (tab === 'health' && !isHealth(body as Record<string, unknown>)) return null;
  if (tab === 'insights') {
    const latest = (body as { latest?: { insights?: unknown } | null }).latest;
    if (latest && !Array.isArray(latest.insights)) return null;
  }
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
