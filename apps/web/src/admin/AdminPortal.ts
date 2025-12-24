/**
 * Admin Portal
 *
 * Unified admin dashboard for Ferni platform management.
 * Brand-compliant implementation following Ferni Design System.
 *
 * @module AdminPortal
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { cleanupAdminEvents, initAdminEvents, setupDesignSystemHandlers } from './admin-events.js';
import {
  ICON_AGENTS,
  ICON_API_DOCS,
  ICON_BACK,
  ICON_CHART,
  ICON_DASHBOARD,
  ICON_DESIGN_SYSTEM,
  ICON_DIAGNOSTICS,
  ICON_EVALOPS,
  ICON_FLAGS,
  ICON_LAYOUT_GRID,
  ICON_LEAF,
  ICON_MENU,
  ICON_REFRESH,
  ICON_ROUTING,
  ICON_SETTINGS,
  ICON_SPARKLES,
  ICON_SPEAKER,
  ICON_TRUST,
  ICON_WARNING,
  iconSm,
} from './icons.js';

const log = createLogger('AdminPortal');

// ============================================================================
// TYPES
// ============================================================================

export interface AdminSection {
  id: string;
  name: string;
  icon: string;
  description: string;
  badge?: string;
  component: () => Promise<string>;
}

interface AdminPortalState {
  initialized: boolean;
  activeSection: string;
  sidebarCollapsed: boolean;
  sections: AdminSection[];
}

// ============================================================================
// STATE
// ============================================================================

const state: AdminPortalState = {
  initialized: false,
  activeSection: 'dashboard',
  sidebarCollapsed: false,
  sections: [],
};

// ============================================================================
// SECTION DEFINITIONS
// ============================================================================

const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: ICON_DASHBOARD,
    description: 'System overview and health',
    component: async () => (await import('./sections/DashboardSection.js')).render(),
  },
  {
    id: 'business-metrics',
    name: 'Business Metrics',
    icon: ICON_CHART,
    description: 'DAU/WAU/MAU, MRR, churn',
    badge: 'NEW',
    component: async () => (await import('./sections/BusinessMetricsSection.js')).render(),
  },
  {
    id: 'semantic-routing',
    name: 'Semantic Routing',
    icon: ICON_ROUTING,
    description: 'Tool routing accuracy, learning, A/B tests',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/SemanticRoutingSection.js');
      const html = section.render();
      setTimeout(() => section.init(), 100);
      return html;
    },
  },
  {
    id: 'agents',
    name: 'Agents',
    icon: ICON_AGENTS,
    description: 'Manage AI agents and personas',
    component: async () => (await import('./sections/AgentsSection.js')).render(),
  },
  {
    id: 'evalops',
    name: 'EvalOps',
    icon: ICON_EVALOPS,
    description: 'Evaluation operations',
    badge: 'NEW',
    component: async () => (await import('./sections/EvalOpsSection.js')).render(),
  },
  {
    id: 'trust',
    name: 'Trust',
    icon: ICON_TRUST,
    description: 'Trust system analytics',
    component: async () => (await import('./sections/TrustSection.js')).render(),
  },
  {
    id: 'human-listening',
    name: 'Human Listening',
    icon: ICON_SPEAKER,
    description: 'Better-than-human listening insights',
    badge: 'NEW',
    component: async () => (await import('./sections/HumanListeningSection.js')).render(),
  },
  {
    id: 'speech-metrics',
    name: 'Speech Metrics',
    icon: ICON_SPEAKER,
    description: 'Unified speech pipeline performance',
    badge: 'NEW',
    component: async () => (await import('./sections/SpeechMetricsSection.js')).render(),
  },
  {
    id: 'experiments',
    name: 'Experiments',
    icon: ICON_FLAGS, // Using flags icon for now
    description: 'A/B tests and experiments',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/ExperimentsSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'flags',
    name: 'Feature Flags',
    icon: ICON_FLAGS,
    description: 'Toggle features and rollouts',
    component: async () => (await import('./sections/FlagsSection.js')).render(),
  },
  {
    id: 'finops',
    name: 'FinOps',
    icon: ICON_CHART,
    description: 'Cost tracking, unit economics, burn rate',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/FinOpsSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'operations',
    name: 'Operations',
    icon: ICON_CHART,
    description: 'Infrastructure health & metrics',
    badge: 'NEW',
    component: async () => (await import('./sections/OperationsSection.js')).render(),
  },
  {
    id: 'builder-metrics',
    name: 'Builder Metrics',
    icon: ICON_SETTINGS,
    description: 'Context builder performance & health',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/BuilderMetricsSection.js');
      const html = section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    icon: ICON_DIAGNOSTICS,
    description: 'Handoff and system diagnostics',
    component: async () => (await import('./sections/DiagnosticsSection.js')).render(),
  },
  {
    id: 'api-docs',
    name: 'API Docs',
    icon: ICON_API_DOCS,
    description: 'API documentation and testing',
    component: async () => (await import('./sections/ApiDocsSection.js')).render(),
  },
  {
    id: 'avatar-soul',
    name: 'Avatar Soul',
    icon: ICON_SPARKLES,
    description: 'Better Than Human animations',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/AvatarSoulSection.js');
      const html = await section.render();
      // Schedule event setup after render
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'design-system',
    name: 'Design System',
    icon: ICON_DESIGN_SYSTEM,
    description: 'Animations and visual tokens',
    component: async () => (await import('./sections/DesignSystemSection.js')).render(),
  },
  {
    id: 'model-config',
    name: 'Model Config',
    icon: ICON_SPARKLES,
    description: 'LLM parameters and system prompts',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/ModelConfigSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'more-dashboards',
    name: 'More Dashboards',
    icon: ICON_LAYOUT_GRID,
    description: 'All standalone dashboards',
    component: async () => (await import('./sections/MoreDashboardsSection.js')).render(),
  },
];

// ============================================================================
// HMR CLEANUP (Required by brand guidelines)
// ============================================================================

function cleanupOrphanedElements(): void {
  // Remove any existing admin portal instances (from HMR)
  document.querySelectorAll('#adminPortal').forEach((el) => el.remove());
  document.querySelectorAll('#admin-portal-styles').forEach((el) => el.remove());
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the admin portal
 */
export async function initAdminPortal(): Promise<void> {
  if (state.initialized) {
    log.debug('Admin portal already initialized');
    return;
  }

  log.info('Initializing admin portal');

  // HMR cleanup - remove orphaned elements
  cleanupOrphanedElements();

  state.sections = ADMIN_SECTIONS;

  // Inject styles
  injectAdminPortalStyles();

  // Render initial UI
  const container = document.getElementById('app') || document.body;
  container.innerHTML = renderPortal();

  // Attach event listeners
  attachEventListeners();

  // Initialize admin event handlers (API interactions)
  initAdminEvents();

  // Load initial section
  await loadSection(state.activeSection);

  state.initialized = true;
  log.info('Admin portal initialized');
}

/**
 * Destroy the admin portal and cleanup
 */
export function destroyAdminPortal(): void {
  // Cleanup event handlers first
  cleanupAdminEvents();

  // Remove DOM elements
  cleanupOrphanedElements();

  state.initialized = false;
  log.info('Admin portal destroyed');
}

// ============================================================================
// RENDERING
// ============================================================================

function renderPortal(): string {
  return `
    <div id="adminPortal" class="admin-portal" data-theme="admin">
      ${renderSidebar()}
      <main class="admin-main">
        <header class="admin-header">
          <button class="admin-sidebar-toggle" aria-label="Toggle sidebar">
            <span class="admin-icon">${iconSm(ICON_MENU)}</span>
          </button>
          <div class="admin-header-title">
            <p class="admin-eyebrow">ADMIN PORTAL</p>
            <h1 id="adminSectionTitle">Dashboard</h1>
            <p id="adminSectionDesc" class="admin-tagline">System overview and health</p>
          </div>
          <div class="admin-header-actions" role="button" tabindex="0">
            <button class="admin-btn admin-btn--icon" data-action="refresh" aria-label="Refresh">
              <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
            </button>
            <button class="admin-btn admin-btn--icon" data-action="settings" aria-label="Settings">
              <span class="admin-icon">${iconSm(ICON_SETTINGS)}</span>
            </button>
            <a href="/" class="admin-btn admin-btn--secondary">
              <span class="admin-icon">${iconSm(ICON_BACK)}</span>
              <span>Back to App</span>
            </a>
          </div>
        </header>
        <div id="adminContent" class="admin-content">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </main>
    </div>
  `;
}

function renderSidebar(): string {
  return `
    <aside class="admin-sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}">
      <div class="admin-sidebar-header">
        <div class="admin-logo">
          <span class="admin-logo-icon">${ICON_LEAF}</span>
          <span class="admin-logo-text">Ferni Admin</span>
        </div>
      </div>
      
      <nav class="admin-nav" aria-label="Admin navigation">
        <ul class="admin-nav-list" role="list">
          ${state.sections.map((section) => renderNavItem(section)).join('')}
        </ul>
      </nav>
      
      <div class="admin-sidebar-footer">
        <div class="admin-version">
          <span class="admin-version-label">Version</span>
          <span class="admin-version-value">1.0.0</span>
        </div>
        <div class="admin-env">
          <span class="admin-env-badge ${isDevEnvironment() ? 'admin-env-badge--dev' : 'admin-env-badge--prod'}">
            ${isDevEnvironment() ? 'DEV' : 'PROD'}
          </span>
        </div>
      </div>
    </aside>
  `;
}

function renderNavItem(section: AdminSection): string {
  const isActive = state.activeSection === section.id;

  return `
    <li class="admin-nav-item" role="listitem">
      <button aria-label="${section.name}"
        class="admin-nav-btn ${isActive ? 'active' : ''}"
        data-section="${section.id}"
        aria-current="${isActive ? 'page' : 'false'}"
      >
        <span class="admin-nav-icon">${iconSm(section.icon)}</span>
        <span class="admin-nav-text">${section.name}</span>
        ${section.badge ? `<span class="admin-nav-badge">${section.badge}</span>` : ''}
      </button>
    </li>
  `;
}

// ============================================================================
// SECTION LOADING
// ============================================================================

async function loadSection(sectionId: string): Promise<void> {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) {
    log.warn({ sectionId }, 'Section not found');
    return;
  }

  log.debug({ sectionId }, 'Loading section');
  state.activeSection = sectionId;

  // Update header
  const title = document.getElementById('adminSectionTitle');
  const desc = document.getElementById('adminSectionDesc');
  if (title) title.textContent = section.name;
  if (desc) desc.textContent = section.description;

  // Update nav active state
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    const btnSection = btn.getAttribute('data-section');
    btn.classList.toggle('active', btnSection === sectionId);
    btn.setAttribute('aria-current', btnSection === sectionId ? 'page' : 'false');
  });

  // Show loading state
  const content = document.getElementById('adminContent');
  if (!content) return;

  content.innerHTML = `
    <div class="admin-loading">
      <div class="admin-spinner"></div>
      <p>Loading ${section.name}...</p>
    </div>
  `;

  try {
    // Load section content
    const html = await section.component();

    // Fade out loading
    content.style.opacity = '0';
    await new Promise((resolve) => setTimeout(resolve, DURATION.FAST));

    // Render content
    content.innerHTML = html;

    // Fade in content
    content.style.opacity = '1';

    // Setup section-specific handlers
    if (sectionId === 'design-system') {
      setupDesignSystemHandlers();
    }

    log.debug({ sectionId }, 'Section loaded');
  } catch (error) {
    log.error({ error, sectionId }, 'Failed to load section');
    content.innerHTML = renderError(`Failed to load ${section.name}`, error as Error);
  }
}

function renderError(message: string, error?: Error): string {
  return `
    <div class="admin-error">
      <div class="admin-error-icon">${ICON_WARNING}</div>
      <h2>${message}</h2>
      ${error ? `<p class="admin-error-details">${error.message}</p>` : ''}
      <button aria-label="Retry" class="admin-btn admin-btn--primary" onclick="window.location.reload()">
        Retry
      </button>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachEventListeners(): void {
  const portal = document.getElementById('adminPortal');
  if (!portal) return;

  // Navigation clicks
  portal.addEventListener('click', handleClick);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Nav button click
  const navBtn = target.closest('.admin-nav-btn');
  if (navBtn) {
    const sectionId = navBtn.getAttribute('data-section');
    if (sectionId) {
      void loadSection(sectionId);
    }
    return;
  }

  // Sidebar toggle
  if (target.closest('.admin-sidebar-toggle')) {
    toggleSidebar();
    return;
  }

  // Action buttons
  const action = target.closest('[data-action]')?.getAttribute('data-action');
  if (action) {
    handleAction(action);
  }
}

function handleKeydown(e: KeyboardEvent): void {
  // Cmd/Ctrl + number to switch sections
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
    const num = parseInt(e.key, 10);
    const section = state.sections[num - 1];
    if (num >= 1 && num <= state.sections.length && section) {
      e.preventDefault();
      void loadSection(section.id);
    }
  }

  // Escape to go back to app
  if (e.key === 'Escape') {
    window.location.href = '/';
  }

  // Cmd/Ctrl + B to toggle sidebar
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    toggleSidebar();
  }
}

function handleAction(action: string): void {
  switch (action) {
    case 'refresh':
      void loadSection(state.activeSection);
      break;
    case 'settings':
      log.debug('Settings clicked');
      break;
    default:
      log.debug({ action }, 'Unknown action');
  }
}

function toggleSidebar(): void {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  const sidebar = document.querySelector('.admin-sidebar');
  sidebar?.classList.toggle('collapsed', state.sidebarCollapsed);
}

// ============================================================================
// UTILITIES
// ============================================================================

function isDevEnvironment(): boolean {
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.search.includes('dev')
  );
}

// ============================================================================
// STYLES (Brand-Compliant)
// ============================================================================

function injectAdminPortalStyles(): void {
  if (document.getElementById('admin-portal-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'admin-portal-styles';
  styles.textContent = `
    /* ========================================================================
       ADMIN PORTAL STYLES
       Ferni Design System Compliant - Dark Theme with WCAG AA Contrast
       ======================================================================== */

    /* Override ALL theme variables for admin portal */
    [data-theme="admin"],
    [data-theme="admin"] *,
    #adminPortal,
    #adminPortal * {
      /* Force dark theme colors */
      --color-background: #1a1612 !important;
      --color-background-elevated: #2c2520 !important;
      --color-text-primary: #faf6f0 !important;
      --color-text-secondary: #d4ccc4 !important;
      --color-text-muted: #a89a8c !important;
      
      /* Admin-specific variables */
      --admin-bg: #1a1612;
      --admin-bg-elevated: #2c2520;
      --admin-bg-card: #352e28;
      --admin-text-primary: #faf6f0;
      --admin-text-secondary: #d4ccc4;
      --admin-text-muted: #a89a8c;
      --admin-border: rgba(250, 246, 240, 0.12);
      --admin-border-hover: rgba(250, 246, 240, 0.2);
      --admin-surface-subtle: rgba(250, 246, 240, 0.04);
      --admin-surface-hover: rgba(250, 246, 240, 0.08);
      --admin-surface-active: rgba(250, 246, 240, 0.12);
      --admin-accent: #4a6741;
      --admin-accent-hover: #5a7a50;
    }
    
    /* Hide the landing page when admin is active */
    body:has(#adminPortal) > *:not(#app):not(script):not(style):not(link) {
      display: none !important;
    }

    .admin-portal {
      display: flex;
      height: 100vh; /* Fixed height for flex scroll pattern */
      max-height: 100vh; /* Prevent overflow */
      background: var(--admin-bg) !important;
      color: var(--admin-text-primary) !important;
      font-family: var(--font-body, 'Inter', -apple-system, sans-serif);
      /* Ensure admin portal is on top */
      position: relative;
      z-index: var(--z-sticky, 100);
      overflow: hidden; /* Contain all scrolling within children */
    }

    /* Sidebar */
    .admin-sidebar {
      width: min(260px, 100%);
      min-width: min(260px, 100%);
      height: 100%; /* Fill parent height */
      background: var(--admin-bg-elevated) !important;
      border-right: 1px solid var(--admin-border);
      display: flex;
      flex-direction: column;
      overflow: hidden; /* Contain nav scroll */
      transition: width var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD}),
                  min-width var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    .admin-sidebar.collapsed {
      width: 72px;
      min-width: 72px;
    }

    .admin-sidebar.collapsed .admin-logo-text,
    .admin-sidebar.collapsed .admin-nav-text,
    .admin-sidebar.collapsed .admin-nav-badge,
    .admin-sidebar.collapsed .admin-version,
    .admin-sidebar.collapsed .admin-env {
      display: none;
    }

    .admin-sidebar-header {
      padding: var(--space-4, 1rem);
      border-bottom: 1px solid var(--admin-border);
    }

    .admin-logo {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
    }

    .admin-logo-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--admin-accent);
    }

    .admin-logo-icon svg {
      width: 28px;
      height: 28px;
    }

    .admin-logo-text {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-weight: 700;
      font-size: 1.125rem;
      white-space: nowrap;
      color: var(--admin-text-primary);
    }

    /* Navigation */
    .admin-nav {
      flex: 1;
      padding: var(--space-3, 0.75rem);
      overflow-y: auto;
    }

    .admin-nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
    }

    .admin-nav-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      background: transparent;
      border: none;
      border-radius: var(--radius-md, 8px);
      color: var(--admin-text-muted);
      font-size: 0.9375rem;
      font-family: inherit;
      cursor: pointer;
      transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      text-align: left;
    }

    .admin-nav-btn:hover {
      background: var(--admin-surface-hover);
      color: var(--admin-text-primary);
    }

    .admin-nav-btn:focus-visible {
      outline: 2px solid var(--admin-accent);
      outline-offset: 2px;
    }

    .admin-nav-btn.active {
      background: var(--admin-accent);
      color: #ffffff;
    }

    .admin-nav-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
    }

    .admin-nav-icon svg {
      width: 18px;
      height: 18px;
    }

    .admin-nav-text {
      flex: 1;
      white-space: nowrap;
    }

    .admin-nav-badge {
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.375rem;
      background: var(--color-semantic-warning, #d4a84b);
      color: var(--color-background, #1a1612);
      border-radius: var(--radius-full, 9999px);
    }

    /* Sidebar Footer */
    .admin-sidebar-footer {
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-top: 1px solid var(--admin-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .admin-version-label {
      font-size: 0.6875rem;
      color: var(--admin-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .admin-version-value {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      color: var(--admin-text-secondary);
    }

    .admin-env-badge {
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-full, 9999px);
    }

    .admin-env-badge--dev {
      background: #d4a84b;
      color: #1a1612;
    }

    .admin-env-badge--prod {
      background: var(--admin-accent);
      color: #ffffff;
    }

    /* Main Content */
    .admin-main {
      flex: 1;
      height: 100%; /* Fill parent height */
      min-height: 0; /* Allow shrinking for flex scroll pattern */
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--admin-bg) !important;
    }

    .admin-header {
      display: flex;
      align-items: center;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      background: var(--admin-bg-elevated) !important;
      border-bottom: 1px solid var(--admin-border);
    }

    .admin-sidebar-toggle {
      display: none;
      background: transparent;
      border: none;
      color: var(--admin-text-primary);
      cursor: pointer;
      padding: var(--space-2, 0.5rem);
      border-radius: var(--radius-md, 8px);
      transition: background var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    .admin-sidebar-toggle:hover {
      background: var(--admin-surface-hover);
    }

    .admin-sidebar-toggle:focus-visible {
      outline: 2px solid var(--admin-accent);
      outline-offset: 2px;
    }

    @media (max-width: clamp(538px, 90vw, 768px)) {
      .admin-sidebar-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .admin-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: var(--z-modal, 2100);
        transform: translateX(-100%);
        transition: transform var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD});
      }
      
      .admin-sidebar.open {
        transform: translateX(0);
      }
    }

    /* Header Typography (Eyebrow pattern) */
    .admin-header-title {
      flex: 1;
    }

    .admin-eyebrow {
      font-size: 0.625rem;
      font-weight: 600;
      color: var(--admin-accent);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 var(--space-1, 0.25rem);
    }

    .admin-header-title h1 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: var(--admin-text-primary) !important;
    }

    .admin-tagline {
      font-size: 0.8125rem;
      color: var(--admin-text-secondary);
      margin: var(--space-1, 0.25rem) 0 0;
    }

    .admin-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    /* Icon containers */
    .admin-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--admin-text-primary);
    }

    .admin-icon svg {
      width: 16px;
      height: 16px;
    }

    /* Content Area */
    .admin-content {
      flex: 1;
      min-height: 0; /* Required for flex child to scroll */
      padding: var(--space-6, 1.5rem);
      overflow-y: auto;
      background: var(--admin-bg) !important;
      transition: opacity var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    /* Buttons */
    .admin-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      background: var(--admin-surface-subtle);
      border: 1px solid var(--admin-border);
      border-radius: var(--radius-md, 8px);
      color: var(--admin-text-primary) !important;
      font-size: 0.875rem;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    .admin-btn:hover {
      background: var(--admin-surface-hover);
      border-color: var(--admin-border-hover);
    }

    .admin-btn:focus-visible {
      outline: 2px solid var(--admin-accent);
      outline-offset: 2px;
    }

    .admin-btn--primary {
      background: var(--admin-accent) !important;
      border-color: transparent;
      color: #ffffff !important;
    }

    .admin-btn--primary:hover {
      background: var(--admin-accent-hover) !important;
    }

    .admin-btn--secondary {
      background: transparent;
    }

    .admin-btn--icon {
      width: 36px;
      height: 36px;
      padding: 0;
    }

    /* Loading State */
    .admin-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: var(--space-4, 1rem);
    }

    .admin-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--admin-border);
      border-top-color: var(--admin-accent);
      border-radius: 50%;
      animation: admin-spin 1s linear infinite;
    }

    @keyframes admin-spin {
      to { transform: rotate(360deg); }
    }

    .admin-loading p {
      color: var(--admin-text-secondary);
      font-size: 0.875rem;
    }

    /* Error State */
    .admin-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: var(--space-4, 1rem);
      text-align: center;
    }

    .admin-error-icon {
      color: var(--color-semantic-warning, #d4a84b);
    }

    .admin-error-icon svg {
      width: 48px;
      height: 48px;
    }

    .admin-error h2 {
      font-size: 1.25rem;
      color: var(--color-semantic-error, #c44536);
      margin: 0;
    }

    .admin-error-details {
      font-size: 0.875rem;
      color: var(--admin-text-secondary);
      max-width: min(400px, 100%);
    }

    /* Utility Classes */
    .admin-card,
    [data-theme="admin"] .admin-card,
    #adminPortal .admin-card {
      background: #352e28 !important;
      border: 1px solid rgba(250, 246, 240, 0.12) !important;
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-5, 1.25rem);
      color: #faf6f0 !important;
    }

    /* Modal Styles */
    .admin-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal-backdrop, 2000);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .admin-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(26, 22, 18, 0.8);
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
    }

    .admin-modal-card {
      position: relative;
      width: 90%;
      max-width: clamp(336px, 90vw, 480px);
      background: #352e28;
      border: 1px solid rgba(250, 246, 240, 0.12);
      border-radius: var(--radius-xl, 16px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .admin-modal-header {
      padding: var(--space-5, 1.25rem);
      border-bottom: 1px solid rgba(250, 246, 240, 0.08);
      position: relative;
    }

    .admin-modal-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: #faf6f0;
    }

    .admin-modal-close {
      position: absolute;
      top: var(--space-4, 1rem);
      right: var(--space-4, 1rem);
      background: transparent;
      border: none;
      color: #a89a8c;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
      padding: var(--space-1, 0.25rem);
    }

    .admin-modal-close:hover {
      color: #faf6f0;
    }

    .admin-modal-content {
      padding: var(--space-5, 1.25rem);
    }

    .admin-modal-footer {
      padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
      border-top: 1px solid rgba(250, 246, 240, 0.08);
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3, 0.75rem);
    }

    .admin-form-group {
      margin-bottom: var(--space-4, 1rem);
    }

    .admin-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: #a89a8c;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .admin-input {
      width: 100%;
      padding: var(--space-3, 0.75rem);
      background: #2c2520;
      border: 1px solid rgba(250, 246, 240, 0.12);
      border-radius: var(--radius-md, 8px);
      color: #faf6f0;
      font-size: 0.9375rem;
      font-family: inherit;
    }

    .admin-input:focus {
      outline: none;
      border-color: var(--admin-accent);
    }

    .admin-input:focus-visible {
      outline: 2px solid var(--admin-accent);
      outline-offset: 2px;
    }

    .admin-color-input {
      width: 100%;
      height: 44px;
      padding: var(--space-1, 0.25rem);
      background: #2c2520;
      border: 1px solid rgba(250, 246, 240, 0.12);
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
    }

    .admin-color-input::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    .admin-color-input::-webkit-color-swatch {
      border: none;
      border-radius: var(--radius-sm, 4px);
    }

    .admin-modal-card--small {
      max-width: min(400px, 100%);
    }

    .admin-modal-card--wide {
      max-width: clamp(560px, 90vw, 800px);
    }

    .admin-confirm-message {
      color: #d4ccc4;
      line-height: 1.6;
    }

    .admin-code-block {
      background: #2c2520;
      padding: var(--space-4, 1rem);
      border-radius: var(--radius-md, 8px);
      overflow-x: auto;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
      color: #d4ccc4;
    }

    .admin-btn--danger {
      background: var(--color-semantic-error, #c44536);
      border-color: var(--color-semantic-error, #c44536);
      color: white;
    }

    .admin-btn--danger:hover {
      background: var(--color-semantic-error-hover, #a83a2e);
      border-color: var(--color-semantic-error-hover, #a83a2e);
    }

    .admin-btn--danger:focus-visible {
      outline: 2px solid var(--color-semantic-error, #c44536);
      outline-offset: 2px;
    }

    .admin-eyebrow {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--admin-accent);
      display: block;
      margin-bottom: var(--space-1, 0.25rem);
    }

    .admin-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4, 1rem);
    }

    .admin-hint {
      font-size: 0.75rem;
      color: #a89a8c;
      margin-top: var(--space-1, 0.25rem);
    }

    .admin-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--space-4, 1rem);
    }

    .admin-stat {
      text-align: center;
    }

    .admin-stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      background: linear-gradient(135deg, var(--admin-accent), #C4A265);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .admin-stat-label {
      font-size: 0.75rem;
      color: var(--admin-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: var(--space-1, 0.25rem);
    }

    /* Section Title (Eyebrow pattern) */
    .admin-section-title,
    [data-theme="admin"] .admin-section-title,
    #adminPortal .admin-section-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 var(--space-4, 1rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      color: #faf6f0 !important;
    }

    .admin-section-title .admin-icon,
    [data-theme="admin"] .admin-section-title .admin-icon {
      color: var(--admin-accent) !important;
    }

    /* Tables */
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      color: var(--admin-text-primary);
    }

    .admin-table th,
    .admin-table td {
      padding: var(--space-3, 0.75rem);
      text-align: left;
      border-bottom: 1px solid var(--admin-border);
    }

    .admin-table th {
      font-weight: 600;
      color: var(--admin-text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .admin-table td {
      color: var(--admin-text-primary);
    }

    .admin-table tr:hover td {
      background: var(--admin-surface-subtle);
    }

    /* Toggle Switch */
    .admin-toggle {
      position: relative;
      width: 44px;
      height: 24px;
    }

    .admin-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .admin-toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--admin-surface-active);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: background var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    .admin-toggle-slider::before {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      left: 2px;
      bottom: 2px;
      background: var(--admin-text-primary);
      border-radius: 50%;
      transition: transform var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
    }

    .admin-toggle input:checked + .admin-toggle-slider {
      background: var(--admin-accent);
    }

    .admin-toggle input:checked + .admin-toggle-slider::before {
      transform: translateX(20px);
    }

    .admin-toggle input:focus-visible + .admin-toggle-slider {
      outline: 2px solid var(--admin-accent);
      outline-offset: 2px;
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .admin-sidebar,
      .admin-nav-btn,
      .admin-btn,
      .admin-content,
      .admin-toggle-slider,
      .admin-toggle-slider::before,
      .admin-sidebar-toggle {
        transition: none;
      }

      .admin-spinner {
        animation: none;
      }
    }
  `;

  document.head.appendChild(styles);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ADMIN_SECTIONS, state as adminPortalState };
