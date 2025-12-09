/**
 * Admin Portal
 *
 * Unified admin dashboard for Ferni platform management.
 * Provides centralized access to all admin tools and dashboards.
 *
 * Features:
 * - Sidebar navigation with collapsible sections
 * - Dashboard overview with system health
 * - Agent management
 * - EvalOps dashboard
 * - Trust analytics
 * - Feature flags
 * - Handoff diagnostics
 * - API documentation
 *
 * @module AdminPortal
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

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
    icon: '📊',
    description: 'System overview and health',
    component: async () => (await import('./sections/DashboardSection.js')).render(),
  },
  {
    id: 'agents',
    name: 'Agents',
    icon: '🤖',
    description: 'Manage AI agents and personas',
    component: async () => (await import('./sections/AgentsSection.js')).render(),
  },
  {
    id: 'evalops',
    name: 'EvalOps',
    icon: '🎯',
    description: 'Evaluation operations',
    badge: 'NEW',
    component: async () => (await import('./sections/EvalOpsSection.js')).render(),
  },
  {
    id: 'trust',
    name: 'Trust',
    icon: '💚',
    description: 'Trust system analytics',
    component: async () => (await import('./sections/TrustSection.js')).render(),
  },
  {
    id: 'flags',
    name: 'Feature Flags',
    icon: '🚩',
    description: 'Toggle features and rollouts',
    component: async () => (await import('./sections/FlagsSection.js')).render(),
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    icon: '🔧',
    description: 'Handoff and system diagnostics',
    component: async () => (await import('./sections/DiagnosticsSection.js')).render(),
  },
  {
    id: 'api-docs',
    name: 'API Docs',
    icon: '📖',
    description: 'API documentation and testing',
    component: async () => (await import('./sections/ApiDocsSection.js')).render(),
  },
  {
    id: 'design-system',
    name: 'Design System',
    icon: '🎨',
    description: 'Animations and visual tokens',
    component: async () => (await import('./sections/DesignSystemSection.js')).render(),
  },
];

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
  state.sections = ADMIN_SECTIONS;

  // Inject styles
  injectAdminPortalStyles();

  // Render initial UI
  const container = document.getElementById('app') || document.body;
  container.innerHTML = renderPortal();

  // Attach event listeners
  attachEventListeners();

  // Load initial section
  await loadSection(state.activeSection);

  state.initialized = true;
  log.info('Admin portal initialized');
}

/**
 * Destroy the admin portal and cleanup
 */
export function destroyAdminPortal(): void {
  const portal = document.getElementById('adminPortal');
  if (portal) {
    portal.remove();
  }
  state.initialized = false;
  log.info('Admin portal destroyed');
}

// ============================================================================
// RENDERING
// ============================================================================

function renderPortal(): string {
  return `
    <div id="adminPortal" class="admin-portal">
      ${renderSidebar()}
      <main class="admin-main">
        <header class="admin-header">
          <button class="admin-sidebar-toggle" aria-label="Toggle sidebar">
            <span class="toggle-icon">☰</span>
          </button>
          <div class="admin-header-title">
            <h1 id="adminSectionTitle">Dashboard</h1>
            <p id="adminSectionDesc">System overview and health</p>
          </div>
          <div class="admin-header-actions">
            <button class="admin-btn admin-btn--icon" data-action="refresh" aria-label="Refresh">
              🔄
            </button>
            <button class="admin-btn admin-btn--icon" data-action="settings" aria-label="Settings">
              ⚙️
            </button>
            <a href="/" class="admin-btn admin-btn--secondary">
              ← Back to App
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
          <span class="admin-logo-icon">🌿</span>
          <span class="admin-logo-text">Ferni Admin</span>
        </div>
      </div>
      
      <nav class="admin-nav">
        <ul class="admin-nav-list">
          ${state.sections.map(section => renderNavItem(section)).join('')}
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
    <li class="admin-nav-item">
      <button 
        class="admin-nav-btn ${isActive ? 'active' : ''}"
        data-section="${section.id}"
        aria-current="${isActive ? 'page' : 'false'}"
      >
        <span class="admin-nav-icon">${section.icon}</span>
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
  const section = state.sections.find(s => s.id === sectionId);
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
  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
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
    await new Promise(resolve => setTimeout(resolve, DURATION.FAST));
    
    // Render content
    content.innerHTML = html;
    
    // Fade in content
    content.style.opacity = '1';
    
    log.debug({ sectionId }, 'Section loaded');
  } catch (error) {
    log.error({ error, sectionId }, 'Failed to load section');
    content.innerHTML = renderError(`Failed to load ${section.name}`, error as Error);
  }
}

function renderError(message: string, error?: Error): string {
  return `
    <div class="admin-error">
      <div class="admin-error-icon">⚠️</div>
      <h2>${message}</h2>
      ${error ? `<p class="admin-error-details">${error.message}</p>` : ''}
      <button class="admin-btn admin-btn--primary" onclick="window.location.reload()">
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
    if (num >= 1 && num <= state.sections.length) {
      e.preventDefault();
      void loadSection(state.sections[num - 1].id);
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
      // TODO: Open settings panel
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
  return window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1' ||
         window.location.search.includes('dev');
}

// ============================================================================
// STYLES
// ============================================================================

function injectAdminPortalStyles(): void {
  if (document.getElementById('admin-portal-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'admin-portal-styles';
  styles.textContent = `
    /* ========================================================================
       ADMIN PORTAL STYLES
       Ferni Design System compliant
       ======================================================================== */

    .admin-portal {
      display: flex;
      min-height: 100vh;
      background: var(--color-background, #1a1612);
      color: var(--color-text-primary, #faf6f0);
      font-family: var(--font-body, 'Inter', -apple-system, sans-serif);
    }

    /* Sidebar */
    .admin-sidebar {
      width: 260px;
      min-width: 260px;
      background: var(--color-background-elevated, #2c2520);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD},
                  min-width ${DURATION.SLOW}ms ${EASING.STANDARD};
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .admin-logo {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
    }

    .admin-logo-icon {
      font-size: 1.75rem;
    }

    .admin-logo-text {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-weight: 700;
      font-size: 1.125rem;
      white-space: nowrap;
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
      color: var(--color-text-secondary, #a89a8c);
      font-size: 0.9375rem;
      font-family: inherit;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      text-align: left;
    }

    .admin-nav-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--color-text-primary, #faf6f0);
    }

    .admin-nav-btn.active {
      background: var(--persona-primary, #4a6741);
      color: var(--color-text-primary, #faf6f0);
    }

    .admin-nav-icon {
      font-size: 1.25rem;
      width: 24px;
      text-align: center;
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
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .admin-version-label {
      font-size: 0.6875rem;
      color: var(--color-text-muted, #756A5E);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .admin-version-value {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      color: var(--color-text-secondary, #a89a8c);
    }

    .admin-env-badge {
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-full, 9999px);
    }

    .admin-env-badge--dev {
      background: var(--color-semantic-warning, #d4a84b);
      color: var(--color-background, #1a1612);
    }

    .admin-env-badge--prod {
      background: var(--persona-primary, #4a6741);
      color: var(--color-text-primary, #faf6f0);
    }

    /* Main Content */
    .admin-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .admin-header {
      display: flex;
      align-items: center;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      background: var(--color-background-elevated, #2c2520);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .admin-sidebar-toggle {
      display: none;
      background: transparent;
      border: none;
      color: var(--color-text-primary, #faf6f0);
      font-size: 1.5rem;
      cursor: pointer;
      padding: var(--space-2, 0.5rem);
    }

    @media (max-width: 768px) {
      .admin-sidebar-toggle {
        display: block;
      }
      
      .admin-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 100;
        transform: translateX(-100%);
        transition: transform ${DURATION.SLOW}ms ${EASING.STANDARD};
      }
      
      .admin-sidebar.open {
        transform: translateX(0);
      }
    }

    .admin-header-title {
      flex: 1;
    }

    .admin-header-title h1 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }

    .admin-header-title p {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #a89a8c);
      margin: 0;
    }

    .admin-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    /* Content Area */
    .admin-content {
      flex: 1;
      padding: var(--space-6, 1.5rem);
      overflow-y: auto;
      transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    /* Buttons */
    .admin-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary, #faf6f0);
      font-size: 0.875rem;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .admin-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .admin-btn--primary {
      background: var(--persona-primary, #4a6741);
      border-color: transparent;
    }

    .admin-btn--primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    .admin-btn--secondary {
      background: transparent;
    }

    .admin-btn--icon {
      width: 36px;
      height: 36px;
      padding: 0;
      font-size: 1rem;
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
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: admin-spin 1s linear infinite;
    }

    @keyframes admin-spin {
      to { transform: rotate(360deg); }
    }

    .admin-loading p {
      color: var(--color-text-secondary, #a89a8c);
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
      font-size: 3rem;
    }

    .admin-error h2 {
      font-size: 1.25rem;
      color: var(--color-semantic-error, #c44536);
      margin: 0;
    }

    .admin-error-details {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #a89a8c);
      max-width: 400px;
    }

    /* Utility Classes */
    .admin-card {
      background: var(--color-background-elevated, #2c2520);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-5, 1.25rem);
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
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--color-accent, #C4A265));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .admin-stat-label {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #a89a8c);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: var(--space-1, 0.25rem);
    }

    /* Section Title */
    .admin-section-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 var(--space-4, 1rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    /* Tables */
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .admin-table th,
    .admin-table td {
      padding: var(--space-3, 0.75rem);
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .admin-table th {
      font-weight: 600;
      color: var(--color-text-secondary, #a89a8c);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .admin-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
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
      background: rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .admin-toggle-slider::before {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      left: 2px;
      bottom: 2px;
      background: var(--color-text-primary, #faf6f0);
      border-radius: 50%;
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .admin-toggle input:checked + .admin-toggle-slider {
      background: var(--persona-primary, #4a6741);
    }

    .admin-toggle input:checked + .admin-toggle-slider::before {
      transform: translateX(20px);
    }
  `;

  document.head.appendChild(styles);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { state as adminPortalState, ADMIN_SECTIONS };

