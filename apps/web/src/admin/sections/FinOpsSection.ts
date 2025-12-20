/**
 * FinOps Dashboard Section
 *
 * Financial operations dashboard showing:
 * - Real-time cost tracking
 * - Unit economics
 * - Burn rate and runway
 * - Margin analysis
 * - Cost alerts
 *
 * @module admin/sections/FinOpsSection
 */

import { createLogger } from '../../utils/logger.js';
import { ICONS } from '../icons.js';

const log = createLogger('FinOpsSection');

// ============================================================================
// TYPES
// ============================================================================

interface LTVCACMetrics {
  cac: number;
  ltv: number;
  ltvCACRatio: number;
  paybackMonths: number;
  roiPercent: number;
  confidence: 'low' | 'medium' | 'high';
}

interface UnitEconomics {
  costPerFreeSession: number;
  costPerPaidSession: number;
  revenuePerPaidSession: number;
  marginPerPaidSession: number;
  breakEvenSessionsToConvert: number;
  projectedCostAtFullConversion: number;
}

interface PowerUser {
  userId: string;
  tier: 'free' | 'friend' | 'partner';
  monthSessions: number;
  monthCost: number;
  avgCostPerSession: number;
  isUnprofitable: boolean;
  costEquivalentTier: 'friend' | 'partner' | 'whale';
}

interface FinOpsSnapshot {
  timestamp: number;
  activeSessionCount: number;
  currentBurnRatePerHour: number;
  costLast24h: number;
  costThisMonth: number;
  projectedMonthCost: number;
  avgCostPerConversation: number;
  avgCostPerFreeUser: number;
  avgCostPerPaidUser: number;
  avgRevenuePerPaidUser: number;
  grossMargin: number;
  contributionMargin: number;
  costByTier: {
    free: { cost: number; sessions: number; users: number };
    friend: { cost: number; sessions: number; users: number };
    partner: { cost: number; sessions: number; users: number };
  };
  costByService: {
    llm: number;
    tts: number;
    stt: number;
    livekit: number;
    infra: number;
  };
  monthlyRecurringRevenue: number;
  runwayMonths: number | null;
  // NEW: LTV:CAC and power users
  ltvCac: LTVCACMetrics;
  unitEconomics: UnitEconomics;
  powerUsers: PowerUser[];
  freeTierCostPercent: number;
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'critical';
    type: string;
    message: string;
  }>;
}

interface Thresholds {
  maxCostPerFreeSession: number;
  maxMonthlyBurn: number;
  minGrossMargin: number;
  maxUnprofitableUsers: number;
}

// ============================================================================
// STATE
// ============================================================================

let snapshot: FinOpsSnapshot | null = null;
let thresholds: Thresholds | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let isLoading = false;

// ============================================================================
// API
// ============================================================================

async function fetchSnapshot(): Promise<FinOpsSnapshot> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  const response = await fetch(`/api/finops/snapshot?admin_key=${adminKey}`);
  if (!response.ok) throw new Error('Failed to fetch FinOps data');
  return response.json();
}

async function fetchThresholds(): Promise<Thresholds> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  const response = await fetch(`/api/finops/thresholds?admin_key=${adminKey}`);
  if (!response.ok) throw new Error('Failed to fetch thresholds');
  return response.json();
}

async function updateThreshold(key: string, value: number): Promise<void> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  await fetch(`/api/finops/thresholds?admin_key=${adminKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  });
}

async function setMRR(mrr: number): Promise<void> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  await fetch(`/api/finops/revenue?admin_key=${adminKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrr }),
  });
}

async function setCash(amount: number): Promise<void> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  await fetch(`/api/finops/cash?admin_key=${adminKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

async function syncMRRFromStripe(): Promise<{ mrr: number; subscriptionCount: number; success: boolean }> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  const response = await fetch(`/api/finops/sync-mrr?admin_key=${adminKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

async function setLTVCACConfig(cac?: number, churnRate?: number): Promise<void> {
  const adminKey = localStorage.getItem('admin_key') || 'dev-mode';
  const body: Record<string, number> = {};
  if (cac !== undefined) body.cac = cac;
  if (churnRate !== undefined) body.churnRate = churnRate / 100; // Convert % to decimal

  await fetch(`/api/finops/ltv-cac?admin_key=${adminKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function formatCurrency(value: number, decimals = 2): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(decimals)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getHealthStatus(margin: number, alerts: FinOpsSnapshot['alerts']): { class: string; text: string } {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  
  if (criticalAlerts > 0 || margin < 0) {
    return { class: 'status-critical', text: 'Critical' };
  }
  if (margin < 0.2 || alerts.some(a => a.severity === 'warning')) {
    return { class: 'status-warning', text: 'Warning' };
  }
  return { class: 'status-healthy', text: 'Healthy' };
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'alert-critical';
    case 'warning': return 'alert-warning';
    default: return 'alert-info';
  }
}

function getAlertIcon(severity: string): string {
  // Using Lucide-style SVG icons (24x24, 2px stroke)
  const attrs = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  switch (severity) {
    case 'critical':
      // X Circle icon
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`;
    case 'warning':
      // Alert Triangle icon
      return `<svg ${attrs}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
    default:
      // Info icon
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
  }
}

// ============================================================================
// RENDER
// ============================================================================

export async function render(): Promise<string> {
  return `
    <div class="admin-section finops-section" role="region" aria-label="FinOps Dashboard">
      <div class="section-header">
        <h2><span aria-hidden="true">${ICONS.chart}</span> FinOps Dashboard</h2>
        <div class="header-actions">
          <span class="live-indicator" role="status">
            <span class="live-dot"></span>
            <span id="finops-active-sessions">0</span> active sessions
          </span>
          <button class="btn-secondary" id="finops-refresh" aria-label="Refresh data">
            <span aria-hidden="true">${ICONS.refresh}</span> Refresh
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div id="finops-loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading FinOps data...</p>
      </div>

      <!-- Main Content (hidden until loaded) -->
      <div id="finops-content" style="display: none;">
        
        <!-- Health Status Banner -->
        <div id="finops-health-banner" class="health-banner">
          <div class="health-status">
            <span class="health-indicator"></span>
            <span class="health-text">Loading...</span>
          </div>
          <div class="burn-rate">
            Burn: <span id="burn-rate-value">$0</span>/hr
          </div>
        </div>

        <!-- Alerts -->
        <div id="finops-alerts" class="alerts-container"></div>

        <!-- Key Metrics Grid -->
        <div class="metrics-grid" role="region" aria-label="Key financial metrics">
          <article class="metric-card highlight">
            <div class="metric-icon">${ICONS.chart}</div>
            <div class="metric-content">
              <div class="metric-value" id="metric-month-cost">--</div>
              <div class="metric-label">Month-to-Date Cost</div>
              <div class="metric-sub" id="metric-projected">Projected: --</div>
            </div>
          </article>

          <article class="metric-card">
            <div class="metric-icon">${ICONS.sparkles}</div>
            <div class="metric-content">
              <div class="metric-value" id="metric-mrr">--</div>
              <div class="metric-label">MRR</div>
              <div class="metric-sub" id="metric-margin">Margin: --</div>
            </div>
          </article>

          <article class="metric-card">
            <div class="metric-icon">${ICONS.team}</div>
            <div class="metric-content">
              <div class="metric-value" id="metric-cost-per-convo">--</div>
              <div class="metric-label">Cost per Conversation</div>
              <div class="metric-sub">All tiers avg</div>
            </div>
          </article>

          <article class="metric-card">
            <div class="metric-icon">${ICONS.history}</div>
            <div class="metric-content">
              <div class="metric-value" id="metric-runway">--</div>
              <div class="metric-label">Runway</div>
              <div class="metric-sub">months at current burn</div>
            </div>
          </article>
        </div>

        <!-- LTV:CAC Section (NEW) -->
        <section class="subsection ltv-cac-section">
          <h3><span aria-hidden="true">${ICONS.chart}</span> LTV:CAC Analysis</h3>
          <div class="ltv-cac-grid">
            <div class="ltv-card">
              <div class="ltv-ratio" id="ltv-cac-ratio">--</div>
              <div class="ltv-label">LTV:CAC Ratio</div>
              <div class="ltv-status" id="ltv-cac-status">Loading...</div>
            </div>
            <div class="ltv-details">
              <div class="ltv-row">
                <span>Customer Acquisition Cost:</span>
                <span id="ltv-cac" class="ltv-value">--</span>
              </div>
              <div class="ltv-row">
                <span>Lifetime Value:</span>
                <span id="ltv-ltv" class="ltv-value">--</span>
              </div>
              <div class="ltv-row">
                <span>Payback Period:</span>
                <span id="ltv-payback" class="ltv-value">-- months</span>
              </div>
              <div class="ltv-row">
                <span>ROI:</span>
                <span id="ltv-roi" class="ltv-value">--%</span>
              </div>
              <div class="ltv-row confidence">
                <span>Data Confidence:</span>
                <span id="ltv-confidence" class="ltv-value badge">Low</span>
              </div>
            </div>
          </div>
          <div class="ltv-config">
            <div class="config-item">
              <label for="config-cac">CAC ($)</label>
              <input type="number" id="config-cac" placeholder="Marketing spend / new users" min="0" step="1">
            </div>
            <div class="config-item">
              <label for="config-churn">Monthly Churn Rate (%)</label>
              <input type="number" id="config-churn" placeholder="e.g. 5" min="0" max="100" step="0.1">
            </div>
            <button class="btn-small" id="save-ltv-config">Update LTV:CAC</button>
          </div>
        </section>

        <!-- Power Users Section (NEW) -->
        <section class="subsection power-users-section">
          <h3><span aria-hidden="true">${ICONS.team}</span> Power Users & Conversion Targets</h3>
          <div class="power-users-summary">
            <div class="pu-stat pu-whale">
              <span class="pu-count" id="pu-whales">0</span>
              <span class="pu-label">High-Cost Free</span>
              <span class="pu-hint">Free users costing &gt;$40/mo</span>
            </div>
            <div class="pu-stat pu-convert">
              <span class="pu-count" id="pu-convert">0</span>
              <span class="pu-label">Conversion Targets</span>
              <span class="pu-hint">High-value free users</span>
            </div>
            <div class="pu-stat pu-unprofitable">
              <span class="pu-count" id="pu-unprofitable">0</span>
              <span class="pu-label">Unprofitable Paid</span>
              <span class="pu-hint">Cost exceeds revenue</span>
            </div>
          </div>
          <div class="power-users-table" id="power-users-table">
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Tier</th>
                  <th>Sessions</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="power-users-tbody">
                <tr><td colspan="5">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Unit Economics Section -->
        <section class="subsection">
          <h3><span aria-hidden="true">${ICONS.chart}</span> Unit Economics</h3>
          <div class="unit-economics-summary">
            <div class="ue-card">
              <div class="ue-value" id="ue-free-session">--</div>
              <div class="ue-label">Cost / Free Session</div>
            </div>
            <div class="ue-card">
              <div class="ue-value" id="ue-paid-session">--</div>
              <div class="ue-label">Cost / Paid Session</div>
            </div>
            <div class="ue-card">
              <div class="ue-value" id="ue-margin-session">--</div>
              <div class="ue-label">Margin / Paid Session</div>
            </div>
            <div class="ue-card">
              <div class="ue-value" id="ue-breakeven">--</div>
              <div class="ue-label">Break-even Sessions</div>
              <div class="ue-hint">Free sessions before conversion pays off</div>
            </div>
          </div>
          <div class="economics-grid">
            <div class="economics-card free-tier">
              <h4>Free Tier</h4>
              <div class="econ-row">
                <span>Cost this month:</span>
                <span id="free-cost" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>Sessions:</span>
                <span id="free-sessions" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>Users:</span>
                <span id="free-users" class="econ-value">--</span>
              </div>
              <div class="econ-row highlight">
                <span>Avg cost/user:</span>
                <span id="free-cost-per-user" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>% of total cost:</span>
                <span id="free-cost-percent" class="econ-value">--</span>
              </div>
            </div>

            <div class="economics-card paid-tier">
              <h4>Paid Tiers</h4>
              <div class="econ-row">
                <span>Cost this month:</span>
                <span id="paid-cost" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>Sessions:</span>
                <span id="paid-sessions" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>Users:</span>
                <span id="paid-users" class="econ-value">--</span>
              </div>
              <div class="econ-row">
                <span>Avg cost/user:</span>
                <span id="paid-cost-per-user" class="econ-value">--</span>
              </div>
              <div class="econ-row highlight">
                <span>Avg revenue/user:</span>
                <span id="paid-revenue-per-user" class="econ-value">--</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Cost by Service -->
        <section class="subsection">
          <h3><span aria-hidden="true">${ICONS.settings}</span> Cost by Service</h3>
          <div class="service-breakdown" id="service-breakdown">
            <!-- Filled by JS -->
          </div>
        </section>

        <!-- Configuration -->
        <section class="subsection">
          <h3><span aria-hidden="true">${ICONS.settings}</span> Configuration</h3>
          <div class="config-grid">
            <div class="config-item">
              <label for="config-mrr">Monthly Recurring Revenue ($)</label>
              <input type="number" id="config-mrr" placeholder="Enter MRR" min="0" step="100">
              <button class="btn-small" id="save-mrr">Save</button>
              <button class="btn-small btn-secondary" id="sync-mrr">Sync from Stripe</button>
            </div>
            <div class="config-item">
              <label for="config-cash">Cash Reserve ($)</label>
              <input type="number" id="config-cash" placeholder="Enter cash reserve" min="0" step="1000">
              <button class="btn-small" id="save-cash">Save</button>
            </div>
          </div>
        </section>

        <!-- Thresholds -->
        <section class="subsection">
          <h3><span aria-hidden="true">${ICONS.warning}</span> Alert Thresholds</h3>
          <div class="threshold-grid" id="threshold-grid">
            <!-- Filled by JS -->
          </div>
        </section>

      </div>
    </div>

    <style>
      .finops-section {
        /* Ferni Design System tokens */
        --card-bg: var(--color-background-elevated, var(--color-bg-elevated, #2a2a3e));
        --text-primary: var(--color-text-primary, #faf6f0);
        --text-secondary: var(--color-text-secondary, #e8e2da);
        --text-muted: var(--color-text-muted, #ddd6cc);
        --accent: var(--color-ferni, var(--color-accent-primary, #4a6741));
        --warning: var(--color-semantic-warning, #c4856a);
        --critical: var(--color-semantic-error, #b54a4a);
        --success: var(--color-semantic-success, #4a6741);
        --border-subtle: rgba(255, 255, 255, 0.08);
        --font-mono: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
      }

      .health-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-md, 1rem);
        background: var(--card-bg);
        border-radius: var(--radius-lg, 8px);
        margin-bottom: var(--space-md, 1rem);
      }

      .health-status {
        display: flex;
        align-items: center;
        gap: var(--space-sm, 0.5rem);
      }

      .health-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--success);
      }

      .status-warning .health-indicator { background: var(--warning); }
      .status-critical .health-indicator { background: var(--critical); animation: pulse 1s infinite; }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .alerts-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm, 0.5rem);
        margin-bottom: var(--space-md, 1rem);
      }

      .alert-item {
        padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
        border-radius: var(--radius-md, 6px);
        display: flex;
        align-items: center;
        gap: var(--space-sm, 0.5rem);
      }

      .alert-critical {
        background: rgba(217, 83, 79, 0.2);
        border: 1px solid var(--critical);
      }

      .alert-warning {
        background: rgba(240, 173, 78, 0.2);
        border: 1px solid var(--warning);
      }

      .alert-info {
        background: rgba(91, 192, 222, 0.2);
        border: 1px solid #5bc0de;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-md, 1rem);
        margin-bottom: var(--space-lg, 1.5rem);
      }

      .metric-card {
        background: var(--card-bg);
        padding: var(--space-md, 1rem);
        border-radius: var(--radius-lg, 8px);
        display: flex;
        gap: var(--space-md, 1rem);
      }

      .metric-card.highlight {
        border: 2px solid var(--accent);
      }

      .metric-icon {
        font-size: 1.5rem;
        opacity: 0.7;
      }

      .metric-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .metric-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .metric-sub {
        font-size: 0.75rem;
        color: var(--text-secondary);
        opacity: 0.7;
      }

      .subsection {
        margin-bottom: var(--space-lg, 1.5rem);
      }

      .subsection h3 {
        display: flex;
        align-items: center;
        gap: var(--space-sm, 0.5rem);
        margin-bottom: var(--space-md, 1rem);
        color: var(--text-primary);
      }

      .economics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--space-md, 1rem);
      }

      .economics-card {
        background: var(--card-bg);
        padding: var(--space-md, 1rem);
        border-radius: var(--radius-lg, 8px);
      }

      .economics-card h4 {
        margin-bottom: var(--space-sm, 0.5rem);
        color: var(--text-primary);
      }

      .econ-row {
        display: flex;
        justify-content: space-between;
        padding: var(--space-xs, 0.25rem) 0;
        color: var(--text-secondary);
      }

      .econ-row.highlight {
        color: var(--text-primary);
        font-weight: 600;
        border-top: 1px solid rgba(255,255,255,0.1);
        margin-top: var(--space-sm, 0.5rem);
        padding-top: var(--space-sm, 0.5rem);
      }

      .econ-value {
        font-family: var(--font-mono, monospace);
      }

      .free-tier {
        border-left: 3px solid var(--accent);
      }

      .paid-tier {
        border-left: 3px solid var(--success);
      }

      .service-breakdown {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm, 0.5rem);
      }

      .service-row {
        display: flex;
        align-items: center;
        gap: var(--space-md, 1rem);
        padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
        background: var(--card-bg);
        border-radius: var(--radius-md, 6px);
      }

      .service-name {
        width: 80px;
        color: var(--text-secondary);
        text-transform: uppercase;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .service-bar-container {
        flex: 1;
        height: 20px;
        background: rgba(255,255,255,0.1);
        border-radius: var(--radius-sm, 4px);
        overflow: hidden;
      }

      .service-bar {
        height: 100%;
        background: var(--accent);
        border-radius: var(--radius-sm, 4px);
        transition: width var(--duration-normal, 200ms) ease;
      }

      .service-value {
        width: 80px;
        text-align: right;
        font-family: var(--font-mono, monospace);
        color: var(--text-primary);
      }

      .config-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: var(--space-md, 1rem);
      }

      .config-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs, 0.25rem);
      }

      .config-item label {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .config-item input {
        padding: var(--space-sm, 0.5rem);
        background: var(--card-bg);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: var(--radius-md, 6px);
        color: var(--text-primary);
        font-family: var(--font-mono, monospace);
      }

      .btn-small {
        padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
        background: var(--accent);
        color: white;
        border: none;
        border-radius: var(--radius-md, 6px);
        cursor: pointer;
        font-size: 0.85rem;
      }

      .btn-small:hover {
        opacity: 0.9;
      }

      .threshold-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-md, 1rem);
      }

      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-xl, 2rem);
        color: var(--text-secondary);
      }

      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255,255,255,0.1);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* ============== LTV:CAC Section ============== */
      .ltv-cac-section {
        border: 1px solid var(--accent);
        border-radius: var(--radius-lg, 8px);
        padding: var(--space-md, 1rem);
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.08) 0%, transparent 100%);
      }

      .ltv-cac-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--space-lg, 1.5rem);
        margin-bottom: var(--space-md, 1rem);
      }

      .ltv-card {
        text-align: center;
        padding: var(--space-md, 1rem);
        background: var(--card-bg);
        border-radius: var(--radius-lg, 8px);
        min-width: 150px;
      }

      .ltv-ratio {
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--accent);
      }

      .ltv-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin-top: var(--space-xs, 0.25rem);
      }

      .ltv-status {
        font-size: 0.75rem;
        padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
        border-radius: var(--radius-sm, 4px);
        margin-top: var(--space-sm, 0.5rem);
        display: inline-block;
      }

      .ltv-status.healthy { background: var(--success); color: white; }
      .ltv-status.warning { background: var(--warning); color: black; }
      .ltv-status.critical { background: var(--critical); color: white; }

      .ltv-details {
        padding: var(--space-sm, 0.5rem);
      }

      .ltv-row {
        display: flex;
        justify-content: space-between;
        padding: var(--space-xs, 0.25rem) 0;
        color: var(--text-secondary);
      }

      .ltv-row.confidence {
        margin-top: var(--space-sm, 0.5rem);
        padding-top: var(--space-sm, 0.5rem);
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .ltv-value {
        font-family: var(--font-mono, monospace);
        color: var(--text-primary);
      }

      .ltv-value.badge {
        padding: 2px 8px;
        border-radius: var(--radius-sm, 4px);
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        background: var(--border-subtle);
      }

      .ltv-value.badge.high { background: var(--success); color: white; }
      .ltv-value.badge.medium { background: var(--warning); color: var(--text-primary); }
      .ltv-value.badge.low { background: var(--critical); color: white; }

      .ltv-config {
        display: flex;
        gap: var(--space-md, 1rem);
        align-items: flex-end;
        flex-wrap: wrap;
      }

      .ltv-config .config-item {
        flex: 1;
        min-width: 150px;
      }

      /* ============== Power Users Section ============== */
      .power-users-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-md, 1rem);
        margin-bottom: var(--space-md, 1rem);
      }

      .pu-stat {
        text-align: center;
        padding: var(--space-md, 1rem);
        background: var(--card-bg);
        border-radius: var(--radius-lg, 8px);
      }

      .pu-count {
        display: block;
        font-size: 2rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .pu-label {
        display: block;
        font-size: 0.9rem;
        color: var(--text-primary);
        margin: var(--space-xs, 0.25rem) 0;
      }

      .pu-hint {
        display: block;
        font-size: 0.75rem;
        color: var(--text-secondary);
      }

      .power-users-table {
        overflow-x: auto;
      }

      .power-users-table table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card-bg);
        border-radius: var(--radius-lg, 8px);
        overflow: hidden;
      }

      .power-users-table th,
      .power-users-table td {
        padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
        text-align: left;
      }

      .power-users-table th {
        background: rgba(255,255,255,0.05);
        color: var(--text-secondary);
        font-size: 0.75rem;
        text-transform: uppercase;
        font-weight: 600;
      }

      .power-users-table td {
        border-top: 1px solid rgba(255,255,255,0.05);
        color: var(--text-primary);
        font-family: var(--font-mono, monospace);
        font-size: 0.85rem;
      }

      .power-users-table tr:hover {
        background: rgba(255,255,255,0.02);
      }

      .status-badge {
        padding: 2px 8px;
        border-radius: var(--radius-sm, 4px);
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }

      .status-badge.whale { background: var(--color-persona-peter, #3a6b73); color: white; }
      .status-badge.convert { background: var(--accent); color: white; }
      .status-badge.unprofitable { background: var(--critical); color: white; }
      .status-badge.profitable { background: var(--success); color: white; }

      /* Power user stat card accents */
      .pu-stat.pu-whale { border-left: 3px solid var(--color-persona-peter, #3a6b73); }
      .pu-stat.pu-convert { border-left: 3px solid var(--accent); }
      .pu-stat.pu-unprofitable { border-left: 3px solid var(--critical); }

      /* ============== Unit Economics Summary ============== */
      .unit-economics-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--space-md, 1rem);
        margin-bottom: var(--space-md, 1rem);
      }

      .ue-card {
        text-align: center;
        padding: var(--space-md, 1rem);
        background: var(--card-bg);
        border-radius: var(--radius-lg, 8px);
      }

      .ue-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        font-family: var(--font-mono, monospace);
      }

      .ue-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-top: var(--space-xs, 0.25rem);
      }

      .ue-hint {
        font-size: 0.65rem;
        color: var(--text-secondary);
        opacity: 0.7;
        margin-top: 2px;
      }
    </style>
  `;
}

// ============================================================================
// SETUP & EVENTS
// ============================================================================

export async function setupEvents(): Promise<void> {
  log.info('Setting up FinOps events');

  // Initial load
  await refreshData();

  // Auto-refresh every 30 seconds
  refreshInterval = setInterval(refreshData, 30000);

  // Refresh button
  const refreshBtn = document.getElementById('finops-refresh');
  refreshBtn?.addEventListener('click', () => {
    void refreshData();
  });

  // Save MRR
  const saveMrrBtn = document.getElementById('save-mrr');
  saveMrrBtn?.addEventListener('click', async () => {
    const input = document.getElementById('config-mrr') as HTMLInputElement;
    const mrr = parseFloat(input.value);
    if (!isNaN(mrr)) {
      await setMRR(mrr);
      await refreshData();
    }
  });

  // Save Cash
  const saveCashBtn = document.getElementById('save-cash');
  saveCashBtn?.addEventListener('click', async () => {
    const input = document.getElementById('config-cash') as HTMLInputElement;
    const cash = parseFloat(input.value);
    if (!isNaN(cash)) {
      await setCash(cash);
      await refreshData();
    }
  });

  // Sync MRR from Stripe
  const syncMrrBtn = document.getElementById('sync-mrr');
  syncMrrBtn?.addEventListener('click', async () => {
    const btn = syncMrrBtn as HTMLButtonElement;
    const originalText = btn.textContent;
    btn.textContent = 'Syncing...';
    btn.disabled = true;
    
    try {
      const result = await syncMRRFromStripe();
      if (result.success) {
        const mrrInput = document.getElementById('config-mrr') as HTMLInputElement;
        if (mrrInput) {
          mrrInput.value = result.mrr.toFixed(2);
        }
        await refreshData();
      }
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  // Save LTV:CAC Config
  const saveLtvBtn = document.getElementById('save-ltv-config');
  saveLtvBtn?.addEventListener('click', async () => {
    const cacInput = document.getElementById('config-cac') as HTMLInputElement;
    const churnInput = document.getElementById('config-churn') as HTMLInputElement;

    const cac = cacInput?.value ? parseFloat(cacInput.value) : undefined;
    const churn = churnInput?.value ? parseFloat(churnInput.value) : undefined;

    if (cac !== undefined || churn !== undefined) {
      await setLTVCACConfig(cac, churn);
      await refreshData();
    }
  });
}

async function refreshData(): Promise<void> {
  if (isLoading) return;
  isLoading = true;

  try {
    [snapshot, thresholds] = await Promise.all([fetchSnapshot(), fetchThresholds()]);
    updateUI();
  } catch (error) {
    log.error({ error }, 'Failed to refresh FinOps data');
  } finally {
    isLoading = false;
  }
}

function updateUI(): void {
  if (!snapshot) return;

  // Hide loading, show content
  const loading = document.getElementById('finops-loading');
  const content = document.getElementById('finops-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  // Active sessions
  const activeSessions = document.getElementById('finops-active-sessions');
  if (activeSessions) activeSessions.textContent = String(snapshot.activeSessionCount);

  // Health banner
  const healthBanner = document.getElementById('finops-health-banner');
  const healthStatus = getHealthStatus(snapshot.grossMargin, snapshot.alerts);
  if (healthBanner) {
    healthBanner.className = `health-banner ${healthStatus.class}`;
    const healthText = healthBanner.querySelector('.health-text');
    if (healthText) healthText.textContent = healthStatus.text;
  }

  // Burn rate
  const burnRate = document.getElementById('burn-rate-value');
  if (burnRate) burnRate.textContent = formatCurrency(snapshot.currentBurnRatePerHour);

  // Alerts
  const alertsContainer = document.getElementById('finops-alerts');
  if (alertsContainer) {
    alertsContainer.innerHTML = snapshot.alerts.map(alert => `
      <div class="alert-item ${getSeverityClass(alert.severity)}">
        <span class="alert-icon">${getAlertIcon(alert.severity)}</span>
        <span class="alert-message">${alert.message}</span>
      </div>
    `).join('');
  }

  // Key metrics
  setText('metric-month-cost', formatCurrency(snapshot.costThisMonth));
  setText('metric-projected', `Projected: ${formatCurrency(snapshot.projectedMonthCost)}`);
  setText('metric-mrr', formatCurrency(snapshot.monthlyRecurringRevenue));
  setText('metric-margin', `Margin: ${formatPercent(snapshot.grossMargin)}`);
  setText('metric-cost-per-convo', formatCurrency(snapshot.avgCostPerConversation, 3));
  setText('metric-runway', snapshot.runwayMonths ? `${snapshot.runwayMonths.toFixed(1)} mo` : 'N/A');

  // Unit economics - Free tier
  setText('free-cost', formatCurrency(snapshot.costByTier.free.cost));
  setText('free-sessions', String(snapshot.costByTier.free.sessions));
  setText('free-users', String(snapshot.costByTier.free.users));
  setText('free-cost-per-user', formatCurrency(snapshot.avgCostPerFreeUser));

  // Unit economics - Paid tier
  const paidCost = snapshot.costByTier.friend.cost + snapshot.costByTier.partner.cost;
  const paidSessions = snapshot.costByTier.friend.sessions + snapshot.costByTier.partner.sessions;
  const paidUsers = snapshot.costByTier.friend.users + snapshot.costByTier.partner.users;
  setText('paid-cost', formatCurrency(paidCost));
  setText('paid-sessions', String(paidSessions));
  setText('paid-users', String(paidUsers));
  setText('paid-cost-per-user', formatCurrency(snapshot.avgCostPerPaidUser));
  setText('paid-revenue-per-user', formatCurrency(snapshot.avgRevenuePerPaidUser));

  // Service breakdown
  const serviceBreakdown = document.getElementById('service-breakdown');
  if (serviceBreakdown) {
    const total = Object.values(snapshot.costByService).reduce((a, b) => a + b, 0) || 1;
    const services = [
      { name: 'LLM', key: 'llm' },
      { name: 'TTS', key: 'tts' },
      { name: 'STT', key: 'stt' },
      { name: 'LiveKit', key: 'livekit' },
      { name: 'Infra', key: 'infra' },
    ];

    serviceBreakdown.innerHTML = services.map(({ name, key }) => {
      const cost = snapshot.costByService[key as keyof typeof snapshot.costByService];
      const percent = (cost / total) * 100;
      return `
        <div class="service-row">
          <span class="service-name">${name}</span>
          <div class="service-bar-container">
            <div class="service-bar" style="width: ${percent}%"></div>
          </div>
          <span class="service-value">${formatCurrency(cost)}</span>
        </div>
      `;
    }).join('');
  }

  // Config inputs
  const mrrInput = document.getElementById('config-mrr') as HTMLInputElement;
  if (mrrInput && !document.activeElement?.isSameNode(mrrInput)) {
    mrrInput.value = String(snapshot.monthlyRecurringRevenue || '');
  }

  // Threshold grid
  if (thresholds) {
    const thresholdGrid = document.getElementById('threshold-grid');
    if (thresholdGrid) {
      const items = [
        { key: 'maxCostPerFreeSession', label: 'Max Free Session Cost', format: formatCurrency },
        { key: 'maxMonthlyBurn', label: 'Max Monthly Burn', format: formatCurrency },
        { key: 'minGrossMargin', label: 'Min Gross Margin', format: formatPercent },
        { key: 'maxUnprofitableUsers', label: 'Max Unprofitable Users', format: (v: number) => String(v) },
      ];

      thresholdGrid.innerHTML = items.map(({ key, label, format }) => `
        <div class="config-item">
          <label>${label}</label>
          <span class="threshold-value">${format(thresholds[key as keyof Thresholds])}</span>
        </div>
      `).join('');
    }
  }

  // ============== LTV:CAC Section ==============
  if (snapshot.ltvCac) {
    const ltv = snapshot.ltvCac;

    // Main ratio display
    setText('ltv-cac-ratio', ltv.ltvCACRatio > 0 ? ltv.ltvCACRatio.toFixed(2) : '--');

    // Status indicator
    const statusEl = document.getElementById('ltv-cac-status');
    if (statusEl) {
      let statusClass = 'healthy';
      let statusText = 'Healthy (>3.0)';
      if (ltv.ltvCACRatio < 1.5) {
        statusClass = 'critical';
        statusText = 'Critical (<1.5)';
      } else if (ltv.ltvCACRatio < 3.0) {
        statusClass = 'warning';
        statusText = 'Needs improvement';
      }
      statusEl.className = `ltv-status ${statusClass}`;
      statusEl.textContent = statusText;
    }

    // Detail rows
    setText('ltv-cac', ltv.cac > 0 ? formatCurrency(ltv.cac) : 'Not set');
    setText('ltv-ltv', ltv.ltv > 0 ? formatCurrency(ltv.ltv) : '--');
    setText('ltv-payback', ltv.paybackMonths > 0 ? `${ltv.paybackMonths.toFixed(1)} months` : '--');
    setText('ltv-roi', ltv.roiPercent > 0 ? `${ltv.roiPercent.toFixed(0)}%` : '--');

    // Confidence badge
    const confEl = document.getElementById('ltv-confidence');
    if (confEl) {
      confEl.textContent = ltv.confidence.charAt(0).toUpperCase() + ltv.confidence.slice(1);
      confEl.className = `ltv-value badge ${ltv.confidence}`;
    }
  }

  // ============== Power Users Section ==============
  if (snapshot.powerUsers) {
    const users = snapshot.powerUsers;

    // Summary counts
    const whales = users.filter(u => u.tier === 'free' && u.costEquivalentTier === 'whale');
    const converts = users.filter(u => u.tier === 'free' && u.costEquivalentTier !== 'whale');
    const unprofitable = users.filter(u => u.isUnprofitable);

    setText('pu-whales', String(whales.length));
    setText('pu-convert', String(converts.length));
    setText('pu-unprofitable', String(unprofitable.length));

    // Table
    const tbody = document.getElementById('power-users-tbody');
    if (tbody) {
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No power users detected yet</td></tr>';
      } else {
        tbody.innerHTML = users.slice(0, 10).map(user => {
          let statusBadge = '';
          if (user.tier === 'free' && user.costEquivalentTier === 'whale') {
            statusBadge = '<span class="status-badge whale">High-Cost</span>';
          } else if (user.tier === 'free') {
            statusBadge = '<span class="status-badge convert">Convert</span>';
          } else if (user.isUnprofitable) {
            statusBadge = '<span class="status-badge unprofitable">Unprofitable</span>';
          } else {
            statusBadge = '<span class="status-badge profitable">Profitable</span>';
          }

          return `
            <tr>
              <td title="${user.userId}">${truncateUserId(user.userId)}</td>
              <td>${user.tier}</td>
              <td>${user.monthSessions}</td>
              <td>${formatCurrency(user.monthCost)}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // ============== Unit Economics Summary ==============
  if (snapshot.unitEconomics) {
    const ue = snapshot.unitEconomics;
    setText('ue-free-session', formatCurrency(ue.costPerFreeSession, 3));
    setText('ue-paid-session', formatCurrency(ue.costPerPaidSession, 3));
    setText('ue-margin-session', formatCurrency(ue.marginPerPaidSession, 3));
    setText('ue-breakeven', ue.breakEvenSessionsToConvert > 0 ? String(Math.round(ue.breakEvenSessionsToConvert)) : '--');
  }

  // Free tier cost percent
  setText('free-cost-percent', formatPercent(snapshot.freeTierCostPercent));
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function truncateUserId(userId: string): string {
  if (userId.length <= 12) return userId;
  return userId.substring(0, 8) + '...' + userId.substring(userId.length - 4);
}

export function cleanup(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

