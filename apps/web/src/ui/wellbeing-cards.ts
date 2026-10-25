/**
 * The wellbeing dashboard's per-field cards (wellbeing-dashboard.ui.ts): the
 * score, a direction only when the server has one, "as of <date> · came up N
 * times", and the fields nobody has talked about lately, named but never scored.
 *
 * @module ui/wellbeing-cards
 */
import { formatDate, t } from '../i18n/index.js';
import type { ApiCurrentState } from './wellbeing-api.js';

export interface DimensionCard {
  dimension: string;
  displayNameKey: string;
  currentScore: number; // 0-1
  /** null: not enough history for a direction yet */
  trend: 'up' | 'stable' | 'down' | null;
  /** When it last came up and how often (servers with the recency-weighted estimate) */
  asOf?: string;
  observations?: number;
  sparkline: number[] | null; // Last 30 days; null when the trend failed to load
  insight: string;
  color: string;
}

/**
 * The fields the server says never came up, as name keys. Only a server that sends
 * per-field info can tell "never came up" from "not sent", so none without it.
 */
export function quietFieldKeys(fields: ApiCurrentState['fields']): string[] {
  if (!fields) return [];
  return (['mood', 'energy', 'anxiety', 'connection', 'purpose', 'sleep'] as const)
    .filter((k) => !fields[k])
    .map((k) => `wellbeing.${k}`);
}

/** The dimensions nobody has talked about lately: said kindly, never scored. */
export function renderQuiet(nameKeys: string[]): string {
  if (nameKeys.length === 0) return '';
  const names = nameKeys.map((k) => `<span class="wellbeing-quiet__name">${t(k)}</span>`).join(' ');
  return `<p class="wellbeing-quiet">${t('wellbeing.notTalkedLately')} ${names}</p>`;
}

export function renderDimensionCard(dim: DimensionCard): string {
  const score = Math.round(dim.currentScore * 100);
  const trendClass = dim.trend === 'up' ? 'up' : dim.trend === 'down' ? 'down' : 'stable';
  const trendLabel = dim.trend === 'up' ? '↑' : dim.trend === 'down' ? '↓' : '→';
  const trendTextKey = {
    up: 'wellbeing.trendUp',
    down: 'wellbeing.trendDown',
    stable: 'wellbeing.trendStable',
  }[trendClass];
  const trendChip = dim.trend
    ? `<span class="wellbeing-dimension-card__trend wellbeing-dimension-card__trend--${trendClass}">
            ${trendLabel} ${t(trendTextKey)}
          </span>`
    : '';
  const asOf = dim.asOf
    ? t(dim.observations === 1 ? 'wellbeing.asOfOnce' : 'wellbeing.asOfCount', {
        date: formatDate(new Date(dim.asOf)),
        count: String(dim.observations ?? 0),
      })
    : '';

  return `
    <div class="wellbeing-dimension-card">
      <div class="wellbeing-dimension-card__header">
        <div>
          <div class="wellbeing-dimension-card__name">${t(dim.displayNameKey)}</div>
          ${trendChip}
        </div>
        <div class="wellbeing-dimension-card__score" style="color: ${dim.color}">${score}</div>
      </div>
      <div class="wellbeing-dimension-card__sparkline">
        ${dim.sparkline ? renderSparkline(dim.sparkline, dim.color) : t('wellbeing.trendUnavailable')}
      </div>
      <div class="wellbeing-dimension-card__insight">${dim.insight}</div>
      ${asOf ? `<div class="wellbeing-dimension-card__as-of">${asOf}</div>` : ''}
    </div>
  `;
}

function renderSparkline(data: number[], color: string): string {
  const width = 180;
  const height = 40;
  const padding = 4;

  // Handle edge case of single data point
  if (data.length === 0) return '';
  if (data.length === 1) {
    // Single point: draw a horizontal line at that value
    const y = height / 2;
    return `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}"
          stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4" />
      </svg>
    `;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const divisor = data.length - 1; // Safe: we know data.length >= 2 here
  const points = data
    .map((value, index) => {
      const x = padding + (index / divisor) * (width - 2 * padding);
      const y = height - padding - ((value - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(' ');

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline
        points="${points}"
        fill="none"
        stroke="${color}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}
