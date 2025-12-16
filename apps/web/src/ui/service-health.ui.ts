/**
 * Service Health Status UI
 *
 * Shows users when services are degraded in a non-intrusive way.
 * "Better than human" means being transparent about limitations.
 *
 * Features:
 * - Subtle status indicator in corner
 * - Expandable panel with details
 * - Auto-hides when all services healthy
 * - Respects reduced motion preferences
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet } from '../utils/api.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('ServiceHealth');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface CircuitStatus {
  name: string;
  state: 'closed' | 'open' | 'half_open';
  successRate: string;
  totalRequests: number;
}

interface ServiceHealthData {
  status: 'healthy' | 'degraded' | 'unavailable';
  timestamp: string;
  summary: {
    totalClients: number;
    healthyClients: number;
    openCircuits: number;
    halfOpenCircuits: number;
  };
  unhealthyServices: string[];
  httpClients: CircuitStatus[];
}

interface ServiceHealthState {
  visible: boolean;
  expanded: boolean;
  data: ServiceHealthData | null;
  lastFetch: number;
  error: string | null;
}

// ============================================================================
// STATE
// ============================================================================

const state: ServiceHealthState = {
  visible: false,
  expanded: false,
  data: null,
  lastFetch: 0,
  error: null,
};

let container: HTMLElement | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL_MS = 30000; // 30 seconds
const CACHE_TTL_MS = 10000; // 10 seconds
const INDICATOR_SIZE = '12px';

// Service name to user-friendly name mapping
const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  'yahoo-finance': 'Stock Data',
  'alpha-vantage': 'Market Data',
  'google-apis': 'Weather & Maps',
  'wikipedia': 'Historical Facts',
  'home-assistant': 'Smart Home',
  'philips-hue': 'Lighting',
  'lifx': 'Lighting',
  'smartthings': 'Smart Home',
  'context-service': 'AI Context',
  'spotify': 'Music',
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .service-health-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9998;
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 13px;
    pointer-events: auto;
  }

  .service-health-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-background-elevated, #FFFDFB);
    border-radius: var(--radius-full, 20px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1));
    cursor: pointer;
    transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    opacity: 0;
    transform: translateY(10px);
  }

  .service-health-indicator.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .service-health-indicator:hover {
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15));
  }

  .service-health-dot {
    width: ${INDICATOR_SIZE};
    height: ${INDICATOR_SIZE};
    border-radius: 50%;
    flex-shrink: 0;
  }

  .service-health-dot.healthy {
    background: var(--color-success, #4CAF50);
  }

  .service-health-dot.degraded {
    background: var(--color-warning, #FF9800);
    animation: pulse-warning 2s ease-in-out infinite;
  }

  .service-health-dot.unavailable {
    background: var(--color-error, #F44336);
    animation: pulse-error 1.5s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes pulse-error {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.1); }
  }

  .service-health-text {
    color: var(--color-text-secondary, #5a4a42);
    white-space: nowrap;
  }

  .service-health-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    width: 280px;
    background: var(--color-background-elevated, #FFFDFB);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-xl, 0 12px 36px rgba(0,0,0,0.2));
    overflow: hidden;
    opacity: 0;
    transform: translateY(10px) scale(0.95);
    transform-origin: bottom right;
    pointer-events: none;
    transition: all ${DURATION.NORMAL}ms ${EASING.SPRING};
  }

  .service-health-panel.expanded {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .service-health-header {
    padding: 12px 16px;
    background: var(--color-background-subtle, #f5f1e8);
    border-bottom: 1px solid var(--color-border, #e0d5c8);
  }

  .service-health-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
  }

  .service-health-header p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-muted, #8a7a6a);
  }

  .service-health-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 8px 0;
  }

  .service-health-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    transition: background ${DURATION.FAST}ms;
  }

  .service-health-item:hover {
    background: var(--color-background-subtle, #f5f1e8);
  }

  .service-health-item-name {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-primary, #2C2520);
  }

  .service-health-item-name .mini-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .service-health-item-status {
    font-size: 11px;
    color: var(--color-text-muted, #8a7a6a);
  }

  .service-health-footer {
    padding: 8px 16px;
    background: var(--color-background-subtle, #f5f1e8);
    border-top: 1px solid var(--color-border, #e0d5c8);
    font-size: 11px;
    color: var(--color-text-muted, #8a7a6a);
    text-align: center;
  }

  /* Hidden when healthy and not hovered */
  .service-health-container.auto-hide .service-health-indicator {
    opacity: 0.3;
    transform: scale(0.9);
  }

  .service-health-container.auto-hide:hover .service-health-indicator {
    opacity: 1;
    transform: scale(1);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .service-health-indicator,
    .service-health-panel {
      transition: opacity ${DURATION.FAST}ms;
    }

    .service-health-dot.degraded,
    .service-health-dot.unavailable {
      animation: none;
    }
  }
`;

// ============================================================================
// RENDERING
// ============================================================================

function getDisplayName(serviceName: string): string {
  return SERVICE_DISPLAY_NAMES[serviceName] || serviceName.replace(/-/g, ' ');
}

function getStatusClass(state: string): string {
  switch (state) {
    case 'closed':
      return 'healthy';
    case 'half_open':
      return 'degraded';
    case 'open':
      return 'unavailable';
    default:
      return 'healthy';
  }
}

function renderIndicator(): string {
  if (!state.data) {
    return `
      <div class="service-health-indicator">
        <div class="service-health-dot healthy"></div>
        <span class="service-health-text">Loading...</span>
      </div>
    `;
  }

  const { status, summary } = state.data;
  const statusClass = status;
  
  let text = 'All systems operational';
  if (status === 'degraded') {
    const count = summary.openCircuits + summary.halfOpenCircuits;
    text = `${count} service${count > 1 ? 's' : ''} degraded`;
  } else if (status === 'unavailable') {
    text = 'Service issues detected';
  }

  return `
    <div class="service-health-indicator ${state.visible ? 'visible' : ''}">
      <div class="service-health-dot ${statusClass}"></div>
      <span class="service-health-text">${text}</span>
    </div>
  `;
}

function renderPanel(): string {
  if (!state.data) {
    return '<div class="service-health-panel"></div>';
  }

  const { httpClients, timestamp } = state.data;
  const time = new Date(timestamp).toLocaleTimeString();

  // Only show non-healthy services, or top 5 if all healthy
  const unhealthy = httpClients.filter((c) => c.state !== 'closed');
  const toShow = unhealthy.length > 0 
    ? unhealthy 
    : httpClients.slice(0, 5);

  const items = toShow.map((client) => {
    const statusClass = getStatusClass(client.state);
    const displayName = getDisplayName(client.name);
    const statusText = client.state === 'closed' 
      ? client.successRate 
      : client.state === 'half_open' 
        ? 'Recovering' 
        : 'Unavailable';

    return `
      <div class="service-health-item">
        <span class="service-health-item-name">
          <span class="mini-dot ${statusClass}"></span>
          ${displayName}
        </span>
        <span class="service-health-item-status">${statusText}</span>
      </div>
    `;
  }).join('');

  const headerText = unhealthy.length > 0
    ? `${unhealthy.length} service${unhealthy.length > 1 ? 's' : ''} need${unhealthy.length === 1 ? 's' : ''} attention`
    : 'All services healthy';

  return `
    <div class="service-health-panel ${state.expanded ? 'expanded' : ''}">
      <div class="service-health-header">
        <h3>Service Status</h3>
        <p>${headerText}</p>
      </div>
      <div class="service-health-list">
        ${items}
      </div>
      <div class="service-health-footer">
        Last updated: ${time}
      </div>
    </div>
  `;
}

function render(): void {
  if (!container) return;

  // Determine if should auto-hide
  const shouldAutoHide = state.data?.status === 'healthy';

  container.className = `service-health-container ${shouldAutoHide ? 'auto-hide' : ''}`;
  container.innerHTML = `
    ${renderIndicator()}
    ${renderPanel()}
  `;

  // Re-attach event listeners
  const indicator = container.querySelector('.service-health-indicator');
  if (indicator) {
    indicator.addEventListener('click', togglePanel);
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchHealthData(): Promise<void> {
  // Use cache if recent
  if (Date.now() - state.lastFetch < CACHE_TTL_MS && state.data) {
    return;
  }

  try {
    const result = await apiGet<ServiceHealthData>('/health/circuits');
    
    if (result.ok && result.data) {
      state.data = result.data;
      state.error = null;
      state.lastFetch = Date.now();
      
      // Show if there are issues, otherwise fade in then auto-hide
      state.visible = true;
      
      log.debug('Service health data fetched', { 
        status: state.data.status,
        unhealthy: state.data.unhealthyServices,
      });
    } else {
      // API not available - assume healthy
      state.data = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        summary: { totalClients: 0, healthyClients: 0, openCircuits: 0, halfOpenCircuits: 0 },
        unhealthyServices: [],
        httpClients: [],
      };
      state.error = result.error || null;
    }

    render();
  } catch (error) {
    log.warn('Failed to fetch service health', { error });
    state.error = String(error);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function togglePanel(): void {
  state.expanded = !state.expanded;
  render();
}

function handleClickOutside(event: MouseEvent): void {
  if (container && !container.contains(event.target as Node)) {
    state.expanded = false;
    render();
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the service health UI
 */
export function initServiceHealthUI(): void {
  // Clean up any existing instance
  cleanupServiceHealthUI();

  // Inject styles
  if (!document.getElementById('service-health-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'service-health-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create container
  container = document.createElement('div');
  container.className = 'service-health-container';
  document.body.appendChild(container);

  // Initial fetch
  fetchHealthData();

  // Start polling
  pollInterval = setInterval(fetchHealthData, POLL_INTERVAL_MS);

  // Click outside to close
  document.addEventListener('click', handleClickOutside);

  log.info('Service health UI initialized');
}

/**
 * Clean up the service health UI
 */
export function cleanupServiceHealthUI(): void {
  // Remove container
  if (container) {
    container.remove();
    container = null;
  }

  // Remove orphaned elements (HMR protection)
  document.querySelectorAll('.service-health-container').forEach((el) => el.remove());

  // Clear interval
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // Remove listener
  document.removeEventListener('click', handleClickOutside);
}

/**
 * Manually refresh health data
 */
export async function refreshServiceHealth(): Promise<void> {
  state.lastFetch = 0; // Force refresh
  await fetchHealthData();
}

/**
 * Get current health status
 */
export function getServiceHealthStatus(): ServiceHealthData | null {
  return state.data;
}

/**
 * Check if any services are degraded
 */
export function hasServiceIssues(): boolean {
  return state.data?.status !== 'healthy';
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

// Initialize when DOM is ready (if not already initialized)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Delay slightly to not compete with main app initialization
      trackedTimeout(initServiceHealthUI, 2000);
    });
  } else {
    trackedTimeout(initServiceHealthUI, 2000);
  }
}

