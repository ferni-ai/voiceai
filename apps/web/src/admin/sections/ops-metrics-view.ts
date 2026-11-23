/**
 * The Operations section's request metrics: each value as the server read it, or
 * the server's reason it has none ("unavailable: ...", "not measured: ..."). Never a
 * 0 or a constant in place of a missing value (#4069).
 *
 * @module OpsMetricsView
 */

import { createLogger } from '../../utils/logger.js';
import { NOT_MEASURED, renderUnavailable } from '../../utils/unavailable.js';

const log = createLogger('OpsMetricsView');

/** One service's metrics from /api/v1/admin/operations; `missing` says why each null is null. */
export interface ServiceMetrics {
  latencyMs: { p50: number | null; p95: number | null; p99: number | null };
  errorRate: number | null;
  requestCount: number | null;
  instances: number | null;
  missing: Partial<Record<'latencyMs' | 'errorRate' | 'requestCount' | 'instances', string>>;
}

const why = (metrics: ServiceMetrics, key: keyof ServiceMetrics['missing']): string =>
  renderUnavailable(metrics.missing[key] ?? NOT_MEASURED);

/** p50/p95/p99 latency, then requests and instances, for one service. */
export function renderServiceMetrics(
  label: string,
  metrics: ServiceMetrics,
  windowMinutes: number
): string {
  const { p50, p95, p99 } = metrics.latencyMs;
  const item = (name: string, ms: number | null) => `
    <div class="ops-latency-item">
      <span class="ops-latency-percentile">${name}</span>
      <span class="ops-latency-value">${ms === null ? why(metrics, 'latencyMs') : `${Math.round(ms)}ms`}</span>
    </div>`;
  const latency =
    p50 === null
      ? why(metrics, 'latencyMs')
      : `<div class="ops-latency-values">${item('p50', p50)}${item('p95', p95)}${item('p99', p99)}</div>`;
  const requests =
    metrics.requestCount === null
      ? why(metrics, 'requestCount')
      : `${metrics.requestCount.toLocaleString('en-US')} requests in the last ${windowMinutes} min`;
  const instances =
    metrics.instances === null
      ? why(metrics, 'instances')
      : `${metrics.instances} instance${metrics.instances === 1 ? '' : 's'} now`;
  return `
    <div class="ops-latency-service">
      <div class="ops-latency-label">${label}</div>
      ${latency}
      <div class="ops-service-meta"><span>${requests}</span><span>${instances}</span></div>
    </div>
  `;
}

/** The share of 5xx answers, colored by how bad it is, or why there is none. */
export function renderErrorRate(label: string, metrics: ServiceMetrics): string {
  const rate = metrics.errorRate;
  const value =
    rate === null
      ? why(metrics, 'errorRate')
      : `<span class="ops-error-value ops-error-value--${rate < 0.01 ? 'good' : rate < 0.05 ? 'warning' : 'bad'}">${(rate * 100).toFixed(2)}%</span>`;
  return `
    <div class="ops-error-item">
      <span class="ops-error-label">${label}</span>
      ${value}
    </div>
  `;
}

/**
 * Wire the section's Refresh: it reads the operations data again, skipping the server's
 * cache, and draws the section again in place. The click stops here, so the portal's
 * delegated [data-action] handlers (which know no "refresh-ops") never see it.
 */
export function setupOpsRefresh(
  root: HTMLElement,
  render: (fresh: boolean) => Promise<string>
): void {
  const button = root.querySelector<HTMLButtonElement>('[data-action="refresh-ops"]');
  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    const section = root.querySelector('.ops-section');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const updated = root.querySelector('.ops-updated');
    if (updated) updated.textContent = 'Refreshing';
    render(true)
      .then((html) => {
        if (!section?.isConnected) return; // the portal moved to another section meanwhile
        root.innerHTML = html;
        setupOpsRefresh(root, render);
      })
      .catch((error: unknown) => {
        log.error({ error }, 'Operations refresh failed');
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (updated) updated.textContent = 'Refresh failed';
      });
  });
}
