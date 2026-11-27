/**
 * The Avatar Soul counts: how often people's avatars played each moment in the
 * last 24 h, as their browsers reported them (GET /api/v1/admin/soul/stats,
 * behind SOUL_STATS). When the server has no numbers the panel says why, and
 * draws no number; a count the server did not send says "not measured" and why (#4069).
 *
 * @module admin/sections/soul-stats-panel
 */

import {
  isUnavailable,
  loadJson,
  NOT_MEASURED,
  renderUnavailable,
  type Unavailable,
} from '../../utils/unavailable.js';
import { SOUL_COUNT_KEYS, type SoulCountKey } from '../../services/soul-stats.service.js';
import { adminFetch } from '../admin-fetch.js';

/** What src/api/v1/admin/soul-stats.ts answers. */
export type AdminSoulStats =
  | {
      measured: true;
      windowHours: number;
      counts?: Partial<Record<SoulCountKey, number>>;
      lastUpdated: string | null;
    }
  | { measured: false; reason: string };

/** Each tile's element id and label, in SOUL_COUNT_KEYS order. */
const TILES: Record<SoulCountKey, [id: string, label: string]> = {
  micro_expression: ['soulMicroExpressions', 'Micro-Expressions'],
  protective_mode: ['soulProtectiveModes', 'Protective Modes'],
  comfort_pulse: ['soulComfortPulses', 'Comfort Pulses'],
  memory_spark: ['soulMemorySparks', 'Memory Sparks'],
  warmth_bloom: ['soulWarmthBlooms', 'Warmth Blooms'],
  celebrate_growth: ['soulGrowthCelebrations', 'Growth Celebrations'],
  cameo_arrival: ['soulCameoArrivals', 'Cameo Arrivals'],
  crisis_hold: ['soulCrisisHolds', 'Crisis Holds'],
  name_lift_brighten: ['soulNameLiftsBrighten', 'Name Lifts, Brighten'],
  name_lift_attentive: ['soulNameLiftsAttentive', 'Name Lifts, Attentive'],
  name_lift_comfort: ['soulNameLiftsComfort', 'Name Lifts, Comfort'],
};

/** What the panel shows for a body that is not the route's shape (null, an array, a string). */
const NO_COUNTS: AdminSoulStats = { measured: false, reason: 'the server sent no counts' };

/** The route's answer, or NO_COUNTS when the body is not its shape; never throws on a body. */
function soulStatsFrom(body: unknown): AdminSoulStats {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return NO_COUNTS;
  const fields = body as Record<string, unknown>;
  const hours = fields.windowHours;
  const measured = fields.measured === true && typeof hours === 'number' && Number.isFinite(hours);
  const refused = fields.measured === false && typeof fields.reason === 'string';
  return measured || refused ? (body as AdminSoulStats) : NO_COUNTS;
}

export async function loadSoulStats(): Promise<AdminSoulStats | Unavailable> {
  const body = await loadJson<unknown>(adminFetch('/api/v1/admin/soul/stats'), 'soul stats');
  return isUnavailable(body) ? body : soulStatsFrom(body);
}

const note = (html: string): string => `<p class="soul-stats-note">${html}</p>`;

/** A tile the server sent no count for: the reason, never a stand-in number. */
const MISSING_COUNT = `${NOT_MEASURED}: the server sent no count for this moment`;

/** Some moments play others, so the eleven tiles are not eleven separate moments. */
const OVERLAP =
  'The tiles overlap: a cameo arrival and a brighten or comfort name lift can also count a warmth bloom ' +
  '(a brighten and a first cameo can also count a memory spark), so they are not 11 separate moments.';

/** The eleven counts labelled with their window, or the reason there are none. */
export function renderSoulStats(
  stats: AdminSoulStats | Unavailable,
  formatTime: (iso: string) => string
): string {
  if (isUnavailable(stats)) return note(renderUnavailable(stats.unavailable));
  if (!stats.measured) return note(renderUnavailable(`${NOT_MEASURED}: ${stats.reason}`));
  const { counts } = stats;
  if (!counts) return note(renderUnavailable(`${NOT_MEASURED}: the server sent no counts`));
  const span = `last ${Number(stats.windowHours)} h`;
  const updated = stats.lastUpdated
    ? `Last report ${formatTime(stats.lastUpdated)}.`
    : `Nothing reported in the ${span}.`;
  return `${SOUL_COUNT_KEYS.map((key) => {
    const [id, label] = TILES[key];
    const value = counts[key];
    const shown =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : renderUnavailable(MISSING_COUNT);
    return `
          <div class="soul-stat">
            <div class="soul-stat-value" id="${id}">${shown}</div>
            <div class="soul-stat-label">${label} (${span})</div>
          </div>`;
  }).join('')}
          ${note(`Counted by people's browsers when the avatar responded. ${OVERLAP} ${updated}`)}`;
}
