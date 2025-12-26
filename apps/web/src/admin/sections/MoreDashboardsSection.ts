/**
 * More Dashboards Section
 *
 * Quick links to all standalone HTML dashboards.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module MoreDashboardsSection
 */

import { createLogger } from '../../utils/logger.js';
import {
  ICON_CHART,
  ICON_DIAGNOSTICS,
  ICON_EVALOPS,
  ICON_SETTINGS,
  ICON_TRUST,
  ICON_USER,
  ICON_AGENTS,
  ICON_DESIGN_SYSTEM,
  ICON_HISTORY,
  ICON_FLAGS,
  iconSm,
} from '../icons.js';

const log = createLogger('MoreDashboardsSection');

// Dashboard link definitions
interface DashboardLink {
  name: string;
  url: string;
  icon: string;
  description: string;
  category: 'observability' | 'analytics' | 'voice' | 'system' | 'development';
}

const DASHBOARD_LINKS: DashboardLink[] = [
  // Observability
  {
    name: 'Observability Hub',
    url: '/observability-hub.html',
    icon: ICON_CHART,
    description: 'Central monitoring & observability',
    category: 'observability',
  },
  {
    name: 'Metrics Dashboard',
    url: '/metrics-dashboard.html',
    icon: ICON_CHART,
    description: 'System metrics & performance',
    category: 'observability',
  },
  {
    name: 'Error Dashboard',
    url: '/error-dashboard.html',
    icon: ICON_DIAGNOSTICS,
    description: 'Error tracking & resolution',
    category: 'observability',
  },
  {
    name: 'DORA Metrics',
    url: '/dora-dashboard.html',
    icon: ICON_CHART,
    description: 'DevOps performance metrics',
    category: 'observability',
  },

  // Analytics
  {
    name: 'Analytics Dashboard',
    url: '/analytics-dashboard.html',
    icon: ICON_CHART,
    description: 'User engagement & analytics',
    category: 'analytics',
  },
  {
    name: 'UX Dashboard',
    url: '/ux-dashboard.html',
    icon: ICON_USER,
    description: 'User experience metrics',
    category: 'analytics',
  },
  {
    name: 'Persona Dashboard',
    url: '/persona-dashboard.html',
    icon: ICON_AGENTS,
    description: 'Persona performance analytics',
    category: 'analytics',
  },
  {
    name: 'Experiments (A/B)',
    url: '/experiments-dashboard.html',
    icon: ICON_FLAGS,
    description: 'A/B testing & experiments',
    category: 'analytics',
  },

  // Voice
  {
    name: 'Voice Presence',
    url: '/voice-presence-dashboard.html',
    icon: ICON_EVALOPS,
    description: 'Voice session analytics',
    category: 'voice',
  },
  {
    name: 'Voice Humanization',
    url: '/voice-humanization-dashboard.html',
    icon: ICON_EVALOPS,
    description: 'Voice quality & humanization',
    category: 'voice',
  },
  {
    name: 'Cognitive Intelligence',
    url: '/cognitive-dashboard.html',
    icon: ICON_TRUST,
    description: 'AI reasoning & adaptation',
    category: 'voice',
  },

  // System
  {
    name: 'Memory Dashboard',
    url: '/memory-dashboard.html',
    icon: ICON_HISTORY,
    description: 'Memory system & persistence',
    category: 'system',
  },
  {
    name: 'Connection Dashboard',
    url: '/connection-dashboard.html',
    icon: ICON_SETTINGS,
    description: 'WebSocket & connection health',
    category: 'system',
  },
  {
    name: 'Handoff Dashboard',
    url: '/handoff-dashboard.html',
    icon: ICON_AGENTS,
    description: 'Persona handoff analytics',
    category: 'system',
  },
  {
    name: 'Outreach Dashboard',
    url: '/outreach-dashboard.html',
    icon: ICON_USER,
    description: 'Proactive outreach system',
    category: 'system',
  },

  // Development
  {
    name: 'Tools Dashboard',
    url: '/tools-dashboard.html',
    icon: ICON_SETTINGS,
    description: 'Tool usage & optimization',
    category: 'development',
  },
  {
    name: 'LLM Dashboard',
    url: '/llm-dashboard.html',
    icon: ICON_CHART,
    description: 'LLM usage & costs',
    category: 'development',
  },
  {
    name: 'Cost Dashboard',
    url: '/cost-dashboard.html',
    icon: ICON_CHART,
    description: 'Infrastructure costs',
    category: 'development',
  },
  {
    name: 'Animation Playground',
    url: '/animation-playground.html',
    icon: ICON_DESIGN_SYSTEM,
    description: 'Animation testing sandbox',
    category: 'development',
  },
];

const CATEGORY_LABELS: Record<DashboardLink['category'], { label: string; icon: string }> = {
  observability: { label: 'Observability', icon: ICON_CHART },
  analytics: { label: 'Analytics', icon: ICON_CHART },
  voice: { label: 'Voice & AI', icon: ICON_EVALOPS },
  system: { label: 'System', icon: ICON_SETTINGS },
  development: { label: 'Development', icon: ICON_DESIGN_SYSTEM },
};

/**
 * Render the more dashboards section
 */
export function render(): string {
  log.debug('Rendering more dashboards section');

  const categories = ['observability', 'analytics', 'voice', 'system', 'development'] as const;

  return `
    <div class="dashboards-section">
      <p class="dashboards-intro">
        Quick access to all standalone dashboards. These open in a new tab.
      </p>
      
      ${categories.map(category => renderCategory(category)).join('')}
    </div>

    <style>
      .dashboards-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-6, 1.5rem);
      }

      .dashboards-intro {
        color: var(--admin-text-secondary, #b8aa9c);
        font-size: 0.9375rem;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .dashboard-category {
        background: var(--admin-bg-card, #4a4039);
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 1rem);
      }

      .category-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        margin-bottom: var(--space-4, 1rem);
        padding-bottom: var(--space-3, 0.75rem);
        border-bottom: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
      }

      .category-header h3 {
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--admin-text-primary, #faf6f0);
        margin: 0;
      }

      .category-header .admin-icon {
        color: var(--persona-primary, #4a6741);
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .dashboard-link {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-bg-secondary, #3d352e);
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        text-decoration: none;
        color: inherit;
        transition: transform 150ms ease, opacity 150ms ease;
      }

      .dashboard-link:hover {
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.08));
        border-color: var(--persona-primary, #4a6741);
        transform: translateY(-2px);
      }

      .dashboard-link:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .dashboard-link {
          transition: none;
        }
        .dashboard-link:hover {
          transform: none;
        }
      }

      .dashboard-link-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-sm, 6px);
        color: var(--persona-primary, #4a6741);
      }

      .dashboard-link-content {
        flex: 1;
        min-width: 0;
      }

      .dashboard-link-name {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--admin-text-primary, #faf6f0);
        margin-bottom: 2px;
      }

      .dashboard-link-desc {
        font-size: 0.75rem;
        color: var(--admin-text-muted, #8a7a6a);
        line-height: 1.4;
      }

      .dashboard-link-arrow {
        flex-shrink: 0;
        color: var(--admin-text-muted, #8a7a6a);
        opacity: 0;
        transition: opacity 150ms ease;
      }

      .dashboard-link:hover .dashboard-link-arrow {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        .dashboard-link-arrow {
          transition: none;
        }
      }
    </style>
  `;
}

function renderCategory(category: DashboardLink['category']): string {
  const links = DASHBOARD_LINKS.filter(link => link.category === category);
  const { label, icon } = CATEGORY_LABELS[category];

  return `
    <div class="dashboard-category">
      <div class="category-header">
        <span class="admin-icon">${iconSm(icon)}</span>
        <h3>${label}</h3>
      </div>
      <div class="dashboard-grid">
        ${links.map(link => renderDashboardLink(link)).join('')}
      </div>
    </div>
  `;
}

function renderDashboardLink(link: DashboardLink): string {
  return `
    <a href="${link.url}" target="_blank" rel="noopener" class="dashboard-link">
      <span class="dashboard-link-icon">${iconSm(link.icon)}</span>
      <div class="dashboard-link-content">
        <div class="dashboard-link-name">${link.name}</div>
        <div class="dashboard-link-desc">${link.description}</div>
      </div>
      <span class="dashboard-link-arrow">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17L17 7"/>
          <path d="M7 7h10v10"/>
        </svg>
      </span>
    </a>
  `;
}

export default { render };

