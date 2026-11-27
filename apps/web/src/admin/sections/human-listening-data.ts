/**
 * Human Listening Data
 *
 * Loads what the Human Listening section shows, and says plainly when there is
 * nothing to show. A failed request reads "unavailable (HTTP <status>)"; a server
 * that holds no listening signal answers `measured: false` with its reason; a
 * body of the wrong shape is never drawn. None of them is ever shown as a zero,
 * "Low" or "No active sessions" (#4069).
 *
 * @module HumanListeningData
 */

import {
  isUnavailable,
  loadJson,
  NOT_MEASURED,
  renderUnavailable,
  type Unavailable,
} from '../../utils/unavailable.js';
import { adminFetch } from '../admin-fetch.js';

const COUNT_KEYS = [
  'totalSessions',
  'distressDetections',
  'selfSoothingDetections',
  'hedgingDetections',
  'tremorDetections',
  'energyFadeDetections',
] as const;

/** A count the metrics route sends. */
export type CountKey = (typeof COUNT_KEYS)[number];

/** What src/api/v1/admin/human-listening.ts answers when it holds events. */
export type MeasuredListening = { measured: true; windowHours: number } & Record<
  (typeof COUNT_KEYS)[number],
  number
> & { avgCognitiveLoad: number | null; avgEngagement: number | null };

export type ListeningMetrics = MeasuredListening | { measured: false; reason: string };

export interface RecentSignal {
  sessionId: string;
  timestamp: string;
  signalType: string;
  severity: 'low' | 'medium' | 'high';
  details: string;
  actionTaken?: string;
}

export interface LiveSession {
  sessionId: string;
  userId?: string;
  cognitiveLoad: 'low' | 'medium' | 'high' | 'overloaded';
  engagement: 'high' | 'medium' | 'low' | 'distracted';
  emotionalUndercurrent?: string;
  lastSignal?: string;
  duration: number;
}

export interface ListeningData {
  metrics: ListeningMetrics | Unavailable;
  signals: RecentSignal[] | Unavailable;
  live: LiveSession[] | Unavailable;
}

/** A list to draw, or the reason there is none. */
export type ListState<T> = { items: T[] } | { gap: string };

const BASE = '/api/v1/admin/human-listening';
const NO_METRICS: ListeningMetrics = { measured: false, reason: 'the server sent no metrics' };

type Fields = Record<string, unknown>;
const isFields = (v: unknown): v is Fields =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isRatioOrNull = (v: unknown): boolean => v === null || (isCount(v) && v <= 1);
const isText = (v: unknown): v is string => typeof v === 'string';

/** The route's answer, or NO_METRICS when the body is not its shape; never throws on a body. */
export function metricsFrom(body: unknown): ListeningMetrics {
  if (!isFields(body)) return NO_METRICS;
  if (body.measured === false) return isText(body.reason) ? (body as ListeningMetrics) : NO_METRICS;
  const whole =
    body.measured === true &&
    isCount(body.windowHours) &&
    COUNT_KEYS.every((key) => isCount(body[key])) &&
    isRatioOrNull(body.avgCognitiveLoad) &&
    isRatioOrNull(body.avgEngagement);
  return whole ? (body as MeasuredListening) : NO_METRICS;
}

const isSignal = (v: unknown): boolean =>
  isFields(v) && [v.timestamp, v.signalType, v.severity, v.details].every(isText);
const isLive = (v: unknown): boolean =>
  isFields(v) &&
  isText(v.sessionId) &&
  isText(v.cognitiveLoad) &&
  isText(v.engagement) &&
  isCount(v.duration);

/** A list whose every entry can be drawn, or why it can't be shown. */
function listFrom<T>(
  body: unknown,
  isEntry: (v: unknown) => boolean,
  what: string
): T[] | Unavailable {
  if (isUnavailable(body)) return body;
  return Array.isArray(body) && body.every(isEntry)
    ? (body as T[])
    : { unavailable: `unavailable: the server sent ${what} it could not read` };
}

/** The three listening routes, read together; never throws. */
export async function loadListening(): Promise<ListeningData> {
  const [metrics, signals, live] = await Promise.all([
    loadJson<unknown>(adminFetch(`${BASE}/metrics`), 'listening metrics'),
    loadJson<unknown>(adminFetch(`${BASE}/signals`), 'listening signals'),
    loadJson<unknown>(adminFetch(`${BASE}/live`), 'live listening sessions'),
  ]);
  return {
    metrics: isUnavailable(metrics) ? metrics : metricsFrom(metrics),
    signals: listFrom<RecentSignal>(signals, isSignal, 'signals'),
    live: listFrom<LiveSession>(live, isLive, 'live sessions'),
  };
}

/** Why no metric can be shown, or null when they are measured. */
function metricsGap(metrics: ListeningMetrics | Unavailable): string | null {
  if (isUnavailable(metrics)) return metrics.unavailable;
  return metrics.measured ? null : `${NOT_MEASURED}: ${metrics.reason}`;
}

/** One line above the tiles giving the reason they are empty, or nothing. */
export function metricsNote(metrics: ListeningMetrics | Unavailable): string {
  const gap = metricsGap(metrics);
  return gap ? `<p class="listening-note">${renderUnavailable(gap)}</p>` : '';
}

/** One tile's value, formatted, or a short word for why it is missing. */
export function metricValue(
  metrics: ListeningMetrics | Unavailable,
  pick: (m: MeasuredListening) => number | null,
  format: (v: number) => string
): string {
  if (isUnavailable(metrics)) return renderUnavailable('unavailable');
  if (!metrics.measured) return renderUnavailable(NOT_MEASURED);
  const value = pick(metrics);
  return value === null
    ? renderUnavailable(`${NOT_MEASURED}: no reading in the window`)
    : format(value);
}

/**
 * A list to draw, or its reason. An empty list from a server that holds no event
 * at all shares the metrics' reason: it means nothing was recorded, not "none".
 */
export function listState<T>(
  list: T[] | Unavailable,
  metrics: ListeningMetrics | Unavailable
): ListState<T> {
  if (isUnavailable(list)) return { gap: list.unavailable };
  const gap = metricsGap(metrics);
  return list.length === 0 && gap && !isUnavailable(metrics) ? { gap } : { items: list };
}

/** A table row spanning the signals table's five columns. */
export const tableNote = (html: string): string => `<tr><td colspan="5">${html}</td></tr>`;
