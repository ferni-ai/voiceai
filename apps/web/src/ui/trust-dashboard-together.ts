/**
 * The Trust dashboard's two "us" tabs: how we're doing together (Health) and
 * the things Ferni noticed (Insights).
 *
 * The server sends factor ids, tones and insight kinds with their numbers; the
 * words come from the locale files here, so every sentence is in the user's
 * language. Anything user-said (a topic, a life event) is escaped.
 *
 * @module TrustDashboardTogether
 */

import { formatDate, t } from '../i18n/index.js';
import {
  escapeHtml as esc,
  type HealthData,
  type HealthFactor,
  type InsightsData,
  type NoticedInsight,
  type NoticedPeriod,
} from './trust-dashboard-data.js';

const T = 'trustDashboard.together';
const N = 'trustDashboard.noticed';
const ARROWS: Record<string, string> = { improving: '↑', declining: '↓', stable: '→' };

/** A 'YYYY-MM-DD' day as the user would say it ("September 28"). */
function dayLabel(key: unknown): string {
  const d = new Date(`${String(key)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ''
    : formatDate(d, { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function weekdayLabel(weekday: unknown): string {
  // 2024-01-07 was a Sunday, so day 0 + n is weekday n.
  const d = new Date(Date.UTC(2024, 0, 7 + Number(weekday)));
  return formatDate(d, { weekday: 'long', timeZone: 'UTC' });
}

/** A number or word the server sent; missing reads as empty, never as a made-up value. */
function val(record: Record<string, string | number>, key: string): string | number {
  return record[key] ?? '';
}

function factorDetail(f: HealthFactor): string {
  const d = (key: string): string | number => val(f.detail, key);
  switch (f.name) {
    case 'rhythm':
      if (d('days') === 0) return t(`${T}.rhythm.detailNone`);
      return d('days') === 1
        ? t(`${T}.rhythm.detailOne`)
        : t(`${T}.rhythm.detailOther`, { n: d('days') });
    case 'promises':
      return t(`${T}.promises.detail`, { kept: d('kept'), total: d('total') });
    case 'lift':
      return t(`${T}.lift.detail`, { lifted: d('lifted'), days: d('days') });
    case 'mood':
      return t(`${T}.mood.detail`);
    default:
      return '';
  }
}

export function renderHealthTab(data: HealthData | null): string {
  if (!data) return `<p class="empty-state">${esc(t(`${T}.empty`))}</p>`;
  if (data.state === 'getting-started' || data.score === null) {
    return `
      <div class="together-starting">
        <h3>${esc(t(`${T}.startingTitle`))}</h3>
        <p>${esc(t(`${T}.startingMessage`))}</p>
      </div>`;
  }

  const factors = data.factors
    .map(
      (f) => `
      <div class="factor-row" data-factor="${esc(f.name)}">
        <div class="factor-text">
          <span class="factor-name">${esc(t(`${T}.${f.name}.${f.tone}`))}</span>
          <span class="factor-detail">${esc(factorDetail(f))}</span>
        </div>
        <div class="factor-bar"><div class="factor-fill" style="width: ${Math.max(0, Math.min(100, f.score))}%"></div></div>
        <span class="factor-trend ${esc(f.trend ?? '')}">${f.trend ? (ARROWS[f.trend] ?? '') : ''}</span>
      </div>`
    )
    .join('');

  return `
    <div class="health-content">
      <div class="health-score-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-border)" stroke-width="8"/>
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--persona-primary)" stroke-width="8"
            stroke-dasharray="${data.score * 2.83} 283"
            stroke-linecap="round" transform="rotate(-90 50 50)"/>
        </svg>
        <div class="score-text">
          <span class="score-number">${data.score}</span>
          <span class="score-label">${esc(t(`${T}.scoreLabel`))}</span>
        </div>
      </div>
      <div class="health-stage">
        <h3>${esc(data.stage ? t(`${T}.stages.${data.stage}`, data.stageName ?? '') : '')}</h3>
      </div>
      <div class="health-factors">${factors}</div>
    </div>
  `;
}

/** One noticed thing in words, or '' for a kind this build doesn't know. */
export function insightText(i: NoticedInsight, period: NoticedPeriod): string {
  const p = (key: string): string | number => val(i.params, key);
  switch (i.kind) {
    case 'moodShift':
      return t(`${N}.moodShift.${i.variant}.${period}`);
    case 'bounceBack':
      return t(`${N}.bounceBack.${i.variant}`, { date: dayLabel(p('date')), days: p('days') });
    case 'liftTopic':
      return t(`${N}.liftTopic`, { topic: p('topic') });
    case 'brightest':
      return t(`${N}.brightest`, { date: dayLabel(p('date')) });
    case 'timeOfDay':
      return t(`${N}.timeOfDay.${i.variant}`);
    case 'favoriteDay':
      return t(`${N}.favoriteDay`, { day: weekdayLabel(p('weekday')) });
    case 'cameUp':
      return t(`${N}.cameUp.${i.variant}`, { n: p('n'), example: p('example') });
    case 'promisesKept':
      return t(`${N}.promisesKept.${i.variant}`, { kept: p('kept'), total: p('total') });
    default:
      return '';
  }
}

function periodToggle(active: NoticedPeriod): string {
  return (['week', 'month'] as const)
    .map(
      (p) =>
        `<button type="button" class="noticed-period-btn" data-period="${p}" aria-pressed="${p === active}">${esc(t(`${N}.tabs.${p}`))}</button>`
    )
    .join('');
}

export function renderInsightsTab(data: InsightsData | null): string {
  if (!data?.latest) return `<p class="empty-state">${esc(t(`${N}.empty`))}</p>`;
  const { latest } = data;
  const period = latest.period;
  const lines = latest.insights
    .map((i) => insightText(i, period))
    .filter((text) => text !== '')
    .map((text) => `<li>${esc(text)}</li>`)
    .join('');

  const body =
    latest.daysTalked === 0
      ? `<p class="noticed-quiet">${esc(t(`${N}.quiet.${period}`))}</p>`
      : `
        <p class="noticed-days"><span class="stat-number">${esc(latest.daysTalked)}</span>
          <span class="stat-label">${esc(t(`${N}.daysTalked`))}</span></p>
        ${lines ? `<ul class="noticed-list">${lines}</ul>` : `<p class="noticed-quiet">${esc(t(`${N}.notYet`))}</p>`}`;

  return `
    <div class="insights-content">
      <div class="noticed-period" role="group">${periodToggle(period)}</div>
      <h3 class="noticed-title">${esc(t(`${N}.title.${period}`))}</h3>
      ${body}
    </div>
  `;
}

export const TOGETHER_STYLES = `
    .health-content, .insights-content { display: flex; flex-direction: column; gap: var(--space-6); }
    .health-score-ring { position: relative; width: min(150px, 100%); height: 150px; margin: 0 auto; }
    .health-score-ring svg { width: 100%; height: 100%; }
    .score-text {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .score-number, .stat-number { font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); }
    .score-label, .stat-label { font-size: 0.8rem; color: var(--color-text-muted); }
    .health-stage { text-align: center; }
    .health-stage h3, .together-starting h3, .noticed-title { margin: 0; color: var(--color-text-primary); }
    .together-starting { text-align: center; padding: var(--space-8) var(--space-4); }
    .together-starting p, .noticed-quiet { color: var(--color-text-secondary); line-height: 1.5; }
    .factor-row {
      display: grid; grid-template-columns: 1fr 30% 20px; align-items: center;
      gap: var(--space-3); margin-bottom: var(--space-4);
    }
    .factor-text { display: flex; flex-direction: column; gap: var(--space-1); }
    .factor-name { font-size: 0.95rem; color: var(--color-text-primary); }
    .factor-detail { font-size: 0.8rem; color: var(--color-text-muted); }
    .factor-bar { height: 6px; background: var(--color-border); border-radius: var(--radius-full); overflow: hidden; }
    .factor-fill { height: 100%; background: var(--persona-primary); border-radius: var(--radius-full); }
    .factor-trend { text-align: center; color: var(--color-text-muted); }
    .factor-trend.improving { color: var(--color-success); }
    .noticed-period { display: flex; gap: var(--space-2); justify-content: center; }
    .noticed-period-btn {
      padding: var(--space-1) var(--space-3); border: 1px solid var(--color-border);
      border-radius: var(--radius-full); background: none; color: var(--color-text-secondary);
      cursor: pointer; font-size: 0.85rem;
    }
    .noticed-period-btn[aria-pressed='true'] { background: var(--persona-tint); color: var(--color-text-primary); }
    .noticed-period-btn:hover, .noticed-period-btn:focus-visible { background: var(--color-background-hover); }
    .noticed-period-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
    .noticed-title { text-align: center; }
    .noticed-days { display: flex; flex-direction: column; align-items: center; margin: 0; }
    .noticed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
    .noticed-list li {
      padding: var(--space-4); background: var(--color-background-hover);
      border-radius: var(--radius-lg); color: var(--color-text-primary); line-height: 1.5;
    }
`;
