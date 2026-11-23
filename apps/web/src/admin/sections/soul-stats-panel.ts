/**
 * The Avatar Soul counts on the Human Listening panel: how often people's
 * avatars played each soul response in the last 24 h, as their browsers reported
 * them (GET /api/v1/admin/soul/stats, behind SOUL_STATS). When the server has no
 * numbers the panel says why, and draws no number (#4069).
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
import { adminFetch } from '../admin-fetch.js';

/** What src/api/v1/admin/soul-stats.ts answers. */
export type AdminSoulStats =
  | {
      measured: true;
      windowHours: number;
      microExpressions: number;
      protectiveModes: number;
      comfortPulses: number;
      memorySparks: number;
      lastUpdated: string | null;
    }
  | { measured: false; reason: string };

export function loadSoulStats(): Promise<AdminSoulStats | Unavailable> {
  return loadJson<AdminSoulStats>(adminFetch('/api/v1/admin/soul/stats'), 'soul stats');
}

const note = (html: string): string => `<p class="soul-stats-note">${html}</p>`;

/** The four counts labelled with their window, or the reason there are none. */
export function renderSoulStats(
  stats: AdminSoulStats | Unavailable,
  formatTime: (iso: string) => string
): string {
  if (isUnavailable(stats)) return note(renderUnavailable(stats.unavailable));
  if (!stats.measured) return note(renderUnavailable(`${NOT_MEASURED}: ${stats.reason}`));
  const span = `last ${Number(stats.windowHours)} h`;
  const tiles: [string, string, number][] = [
    ['soulMicroExpressions', 'Micro-Expressions', stats.microExpressions],
    ['soulProtectiveModes', 'Protective Modes', stats.protectiveModes],
    ['soulComfortPulses', 'Comfort Pulses', stats.comfortPulses],
    ['soulMemorySparks', 'Memory Sparks', stats.memorySparks],
  ];
  const updated = stats.lastUpdated
    ? `Last report ${formatTime(stats.lastUpdated)}.`
    : `Nothing reported in the ${span}.`;
  return `${tiles
    .map(
      ([id, label, value]) => `
          <div class="soul-stat">
            <div class="soul-stat-value" id="${id}">${Number(value)}</div>
            <div class="soul-stat-label">${label} (${span})</div>
          </div>`
    )
    .join('')}
          ${note(`Counted by people's browsers when the avatar responded. ${updated}`)}`;
}
