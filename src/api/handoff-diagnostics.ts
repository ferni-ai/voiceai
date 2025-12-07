/**
 * Handoff Diagnostics API
 * 
 * Provides endpoints for viewing handoff metrics and diagnostics.
 * 
 * Endpoints:
 *   GET /api/diagnostics/handoffs - Get handoff metrics summary
 *   GET /api/diagnostics/handoffs/recent - Get recent handoff traces
 *   GET /api/diagnostics/handoffs/failures - Get recent failures
 *   GET /api/diagnostics/handoffs/in-progress - Get in-progress handoffs
 *   GET /api/diagnostics/handoffs/:traceId - Get specific trace
 */

import type { Request, Response } from 'express';
import { handoffMetrics, type HandoffMetricsSummary } from '../services/handoff-metrics.js';
import { getLogger } from '../utils/safe-logger.js';

const logger = getLogger();

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/diagnostics/handoffs
 * Returns handoff metrics summary for the specified time window.
 */
export async function getHandoffMetrics(req: Request, res: Response): Promise<void> {
  try {
    const windowMinutes = parseInt(req.query['window'] as string) || 60;
    const summary = handoffMetrics.getSummary(windowMinutes);
    
    res.json({
      success: true,
      data: summary,
      meta: {
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get handoff metrics');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff metrics',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/recent
 * Returns recent handoff traces (both successful and failed).
 */
export async function getRecentHandoffs(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
    const windowMinutes = parseInt(req.query['window'] as string) || 60;
    
    const summary = handoffMetrics.getSummary(windowMinutes);
    
    // Combine successes and failures, sort by time
    const traces = [...summary.recentFailures]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
    
    res.json({
      success: true,
      data: {
        traces,
        total: summary.totalAttempts,
        successRate: summary.successRate,
      },
      meta: {
        limit,
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get recent handoffs');
    res.status(500).json({
      success: false,
      error: 'Failed to get recent handoffs',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/failures
 * Returns recent handoff failures with detailed error information.
 */
export async function getHandoffFailures(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
    const windowMinutes = parseInt(req.query['window'] as string) || 60;
    
    const summary = handoffMetrics.getSummary(windowMinutes);
    const failures = summary.recentFailures.slice(0, limit);
    
    res.json({
      success: true,
      data: {
        failures,
        totalFailures: summary.totalFailures,
        failureRate: 1 - summary.successRate,
        byReason: summary.byFailureReason,
      },
      meta: {
        limit,
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get handoff failures');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff failures',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/in-progress
 * Returns currently in-progress handoffs.
 */
export async function getInProgressHandoffs(req: Request, res: Response): Promise<void> {
  try {
    const inProgress = handoffMetrics.getInProgressHandoffs();
    
    res.json({
      success: true,
      data: {
        inProgress,
        count: inProgress.length,
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get in-progress handoffs');
    res.status(500).json({
      success: false,
      error: 'Failed to get in-progress handoffs',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/:traceId
 * Returns a specific handoff trace by ID.
 */
export async function getHandoffTrace(req: Request, res: Response): Promise<void> {
  try {
    const traceId = req.params['traceId'];
    if (!traceId) {
      res.status(400).json({
        success: false,
        error: 'traceId is required',
      });
      return;
    }
    
    const trace = handoffMetrics.getTrace(traceId);
    
    if (!trace) {
      res.status(404).json({
        success: false,
        error: `Trace ${traceId} not found`,
      });
      return;
    }
    
    res.json({
      success: true,
      data: trace,
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get handoff trace');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff trace',
    });
  }
}

// ============================================================================
// ROUTE SETUP HELPER
// ============================================================================

/**
 * Set up handoff diagnostics routes on an Express app/router.
 */
export function setupHandoffDiagnosticsRoutes(app: {
  get: (path: string, handler: (req: Request, res: Response) => void | Promise<void>) => void;
}): void {
  app.get('/api/diagnostics/handoffs', getHandoffMetrics);
  app.get('/api/diagnostics/handoffs/recent', getRecentHandoffs);
  app.get('/api/diagnostics/handoffs/failures', getHandoffFailures);
  app.get('/api/diagnostics/handoffs/in-progress', getInProgressHandoffs);
  app.get('/api/diagnostics/handoffs/:traceId', getHandoffTrace);
  
  logger.info('📊 Handoff diagnostics routes registered');
}

// ============================================================================
// DASHBOARD HTML
// ============================================================================

/**
 * Generate a simple HTML dashboard for handoff diagnostics.
 */
export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Handoff Diagnostics - Ferni</title>
  <style>
    :root {
      --color-bg: #1a1612;
      --color-surface: #2c2520;
      --color-surface-elevated: #3d3530;
      --color-text: #faf6f0;
      --color-text-muted: #a8a29e;
      --color-success: #4a6741;
      --color-error: #c44536;
      --color-warning: #d4a84b;
      --color-accent: #7a6f63;
      --font-mono: 'SF Mono', 'Menlo', monospace;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      padding: 2rem;
      line-height: 1.6;
    }
    
    h1 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      color: var(--color-text);
    }
    
    .subtitle {
      color: var(--color-text-muted);
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--color-surface);
      border-radius: 12px;
      padding: 1.5rem;
    }
    
    .stat-card {
      text-align: center;
    }
    
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      font-family: var(--font-mono);
    }
    
    .stat-value.success { color: var(--color-success); }
    .stat-value.error { color: var(--color-error); }
    .stat-value.warning { color: var(--color-warning); }
    .stat-value.neutral { color: var(--color-accent); }
    
    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-top: 0.25rem;
    }
    
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--color-text);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    
    th, td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid var(--color-surface-elevated);
    }
    
    th {
      color: var(--color-text-muted);
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .badge-success { background: rgba(74, 103, 65, 0.2); color: #8bc285; }
    .badge-error { background: rgba(196, 69, 54, 0.2); color: #e88c84; }
    .badge-warning { background: rgba(212, 168, 75, 0.2); color: #f0d48a; }
    
    .mono { font-family: var(--font-mono); font-size: 0.8125rem; }
    
    .error-message {
      color: var(--color-error);
      font-size: 0.75rem;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .refresh-btn {
      background: var(--color-accent);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    
    .refresh-btn:hover {
      opacity: 0.9;
    }
    
    .loading {
      color: var(--color-text-muted);
      font-style: italic;
    }
    
    .bar-chart {
      display: flex;
      gap: 0.5rem;
      align-items: end;
      height: 100px;
      padding: 1rem 0;
    }
    
    .bar {
      flex: 1;
      background: var(--color-accent);
      min-height: 4px;
      border-radius: 2px 2px 0 0;
      position: relative;
    }
    
    .bar-label {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.625rem;
      color: var(--color-text-muted);
      white-space: nowrap;
    }
    
    .auto-refresh {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }
    
    .auto-refresh input {
      accent-color: var(--color-accent);
    }
  </style>
</head>
<body>
  <h1>🔄 Handoff Diagnostics</h1>
  <p class="subtitle">Real-time monitoring of agent transfers</p>
  
  <div class="auto-refresh">
    <input type="checkbox" id="autoRefresh" checked>
    <label for="autoRefresh">Auto-refresh every 5 seconds</label>
    <button class="refresh-btn" onclick="loadData()">Refresh Now</button>
  </div>
  
  <div class="grid" id="stats">
    <div class="card stat-card">
      <div class="stat-value neutral" id="totalAttempts">-</div>
      <div class="stat-label">Total Attempts</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value success" id="totalSuccesses">-</div>
      <div class="stat-label">Successes</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value error" id="totalFailures">-</div>
      <div class="stat-label">Failures</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value" id="successRate">-</div>
      <div class="stat-label">Success Rate</div>
    </div>
  </div>
  
  <div class="grid">
    <div class="card">
      <h3 class="section-title">⏱️ Timing (ms)</h3>
      <table>
        <tr><td>Average</td><td class="mono" id="avgDuration">-</td></tr>
        <tr><td>P50</td><td class="mono" id="p50Duration">-</td></tr>
        <tr><td>P95</td><td class="mono" id="p95Duration">-</td></tr>
        <tr><td>Max</td><td class="mono" id="maxDuration">-</td></tr>
      </table>
    </div>
    
    <div class="card">
      <h3 class="section-title">❌ Failure Reasons</h3>
      <table id="failureReasons">
        <tr><td colspan="2" class="loading">Loading...</td></tr>
      </table>
    </div>
    
    <div class="card">
      <h3 class="section-title">🔄 In Progress</h3>
      <div id="inProgress" class="loading">Loading...</div>
    </div>
  </div>
  
  <div class="card" style="margin-bottom: 2rem;">
    <h3 class="section-title">📊 Transfers by Agent</h3>
    <table id="agentStats">
      <thead>
        <tr>
          <th>Agent</th>
          <th>Outgoing</th>
          <th>Incoming</th>
          <th>Success Rate</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="4" class="loading">Loading...</td></tr>
      </tbody>
    </table>
  </div>
  
  <div class="card">
    <h3 class="section-title">🚨 Recent Failures</h3>
    <table id="recentFailures">
      <thead>
        <tr>
          <th>Time</th>
          <th>From</th>
          <th>To</th>
          <th>Reason</th>
          <th>Phase</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="6" class="loading">Loading...</td></tr>
      </tbody>
    </table>
  </div>
  
  <script>
    let refreshInterval;
    
    async function loadData() {
      try {
        const [metricsRes, inProgressRes] = await Promise.all([
          fetch('/api/diagnostics/handoffs?window=60'),
          fetch('/api/diagnostics/handoffs/in-progress'),
        ]);
        
        const metrics = await metricsRes.json();
        const inProgress = await inProgressRes.json();
        
        if (metrics.success) {
          updateMetrics(metrics.data);
        }
        
        if (inProgress.success) {
          updateInProgress(inProgress.data);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }
    
    function updateMetrics(data) {
      // Stats
      document.getElementById('totalAttempts').textContent = data.totalAttempts;
      document.getElementById('totalSuccesses').textContent = data.totalSuccesses;
      document.getElementById('totalFailures').textContent = data.totalFailures;
      
      const rate = (data.successRate * 100).toFixed(1) + '%';
      const rateEl = document.getElementById('successRate');
      rateEl.textContent = rate;
      rateEl.className = 'stat-value ' + (data.successRate >= 0.95 ? 'success' : data.successRate >= 0.8 ? 'warning' : 'error');
      
      // Timing
      document.getElementById('avgDuration').textContent = Math.round(data.avgDurationMs);
      document.getElementById('p50Duration').textContent = Math.round(data.p50DurationMs);
      document.getElementById('p95Duration').textContent = Math.round(data.p95DurationMs);
      document.getElementById('maxDuration').textContent = Math.round(data.maxDurationMs);
      
      // Failure reasons
      const reasonsTable = document.getElementById('failureReasons');
      const reasons = Object.entries(data.byFailureReason);
      if (reasons.length === 0) {
        reasonsTable.innerHTML = '<tr><td colspan="2" style="color: var(--color-text-muted);">No failures 🎉</td></tr>';
      } else {
        reasonsTable.innerHTML = reasons
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => \`<tr><td>\${formatReason(reason)}</td><td class="mono">\${count}</td></tr>\`)
          .join('');
      }
      
      // Agent stats
      const agentStats = document.getElementById('agentStats').querySelector('tbody');
      const agents = new Set([...Object.keys(data.byFromAgent), ...Object.keys(data.byToAgent)]);
      if (agents.size === 0) {
        agentStats.innerHTML = '<tr><td colspan="4" style="color: var(--color-text-muted);">No data</td></tr>';
      } else {
        agentStats.innerHTML = Array.from(agents).map(agent => {
          const from = data.byFromAgent[agent] || { attempts: 0, successes: 0 };
          const to = data.byToAgent[agent] || { attempts: 0, successes: 0 };
          const total = from.attempts + to.attempts;
          const successes = from.successes + to.successes;
          const rate = total > 0 ? ((successes / total) * 100).toFixed(0) + '%' : '-';
          return \`<tr>
            <td>\${formatAgent(agent)}</td>
            <td class="mono">\${from.attempts}</td>
            <td class="mono">\${to.attempts}</td>
            <td><span class="badge \${rate === '100%' ? 'badge-success' : rate === '-' ? '' : 'badge-warning'}">\${rate}</span></td>
          </tr>\`;
        }).join('');
      }
      
      // Recent failures
      const failuresTable = document.getElementById('recentFailures').querySelector('tbody');
      if (data.recentFailures.length === 0) {
        failuresTable.innerHTML = '<tr><td colspan="6" style="color: var(--color-text-muted);">No recent failures 🎉</td></tr>';
      } else {
        failuresTable.innerHTML = data.recentFailures.slice(0, 20).map(trace => \`<tr>
          <td class="mono">\${formatTime(trace.startTime)}</td>
          <td>\${formatAgent(trace.fromAgent)}</td>
          <td>\${formatAgent(trace.toAgent)}</td>
          <td><span class="badge badge-error">\${formatReason(trace.failureReason)}</span></td>
          <td class="mono">\${trace.currentPhase}</td>
          <td class="error-message" title="\${trace.errorMessage || ''}">\${trace.errorMessage || '-'}</td>
        </tr>\`).join('');
      }
    }
    
    function updateInProgress(data) {
      const container = document.getElementById('inProgress');
      if (data.count === 0) {
        container.innerHTML = '<span style="color: var(--color-text-muted);">None</span>';
      } else {
        container.innerHTML = data.inProgress.map(trace => \`
          <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--color-surface-elevated); border-radius: 6px;">
            <strong>\${formatAgent(trace.fromAgent)} → \${formatAgent(trace.toAgent)}</strong>
            <div class="mono" style="font-size: 0.75rem; color: var(--color-text-muted);">
              Phase: \${trace.currentPhase} • \${Date.now() - trace.startTime}ms
            </div>
          </div>
        \`).join('');
      }
    }
    
    function formatAgent(id) {
      const names = {
        'ferni': '🌿 Ferni',
        'peter-john': '📊 Peter',
        'alex-chen': '✉️ Alex',
        'maya-santos': '💰 Maya',
        'jordan-taylor': '🎉 Jordan',
        'nayan-patel': '🧘 Nayan',
      };
      return names[id] || id;
    }
    
    function formatReason(reason) {
      const labels = {
        'tool_not_found': 'Tool not found',
        'persona_not_found': 'Persona not found',
        'no_listeners': 'No listeners',
        'rate_limited': 'Rate limited',
        'already_with_agent': 'Already with agent',
        'connection_lost': 'Connection lost',
        'voice_switch_failed': 'Voice switch failed',
        'timeout': 'Timeout',
        'validation_failed': 'Validation failed',
        'unknown': 'Unknown',
      };
      return labels[reason] || reason;
    }
    
    function formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    }
    
    // Auto-refresh
    document.getElementById('autoRefresh').addEventListener('change', (e) => {
      if (e.target.checked) {
        refreshInterval = setInterval(loadData, 5000);
      } else {
        clearInterval(refreshInterval);
      }
    });
    
    // Initial load
    loadData();
    refreshInterval = setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}

/**
 * Handler for the dashboard page.
 */
export function getDashboardPage(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/html');
  res.send(generateDashboardHtml());
}

