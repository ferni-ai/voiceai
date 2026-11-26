/**
 * The Avatar Soul counts: how often people's avatars played each moment in the
 * last 24 h, as their browsers reported them (GET /api/v1/admin/soul/stats,
 * behind SOUL_STATS). When the server has no numbers the panel says why, and
 * draws no number; a count the server did not send says "not measured" (#4069).
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

export function loadSoulStats(): Promise<AdminSoulStats | Unavailable> {
  return loadJson<AdminSoulStats>(adminFetch('/api/v1/admin/soul/stats'), 'soul stats');
}

const note = (html: string): string => `<p class="soul-stats-note">${html}</p>`;

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
    const shown = typeof value === 'number' && Number.isFinite(value) ? value : NOT_MEASURED;
    return `
          <div class="soul-stat">
            <div class="soul-stat-value" id="${id}">${shown}</div>
            <div class="soul-stat-label">${label} (${span})</div>
          </div>`;
  }).join('')}
          ${note(`Counted by people's browsers when the avatar responded. ${updated}`)}`;
}
