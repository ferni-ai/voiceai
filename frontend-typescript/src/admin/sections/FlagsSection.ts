/**
 * Flags Section
 *
 * Feature flag management for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module FlagsSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import {
  ICON_SUCCESS,
  ICON_ERROR,
  ICON_REFRESH,
  ICON_TRUST,
  ICON_SPEAKER,
  ICON_EVALOPS,
  ICON_TEAM,
  ICON_SETTINGS,
  ICON_FLAGS,
  ICON_SEARCH,
  iconSm,
} from '../icons.js';

const log = createLogger('FlagsSection');

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  percentage?: number;
  category?: string;
}

/**
 * Render the feature flags section
 */
export async function render(): Promise<string> {
  log.debug('Rendering flags section');

  const flags = await fetchFlags();
  const categories = groupByCategory(flags);

  return `
    <div class="flags-section">
      <!-- Actions -->
      <div class="flags-actions">
        <div class="flags-search">
          <span class="flags-search-icon">${iconSm(ICON_SEARCH)}</span>
          <input 
            type="text" 
            placeholder="Search flags..." 
            class="flags-search-input"
            id="flagsSearch"
          >
        </div>
        <div class="flags-action-btns">
          <button class="admin-btn" data-action="enable-all-flags">
            <span class="admin-icon">${iconSm(ICON_SUCCESS)}</span>
            Enable All
          </button>
          <button class="admin-btn" data-action="disable-all-flags">
            <span class="admin-icon">${iconSm(ICON_ERROR)}</span>
            Disable All
          </button>
          <button class="admin-btn" data-action="reset-flags">
            <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
            Reset to Defaults
          </button>
        </div>
      </div>

      <!-- Flag Categories -->
      ${flags.length === 0 ? `
        <div class="admin-card flags-empty">
          <div class="empty-state">
            <span class="admin-icon">${iconSm(ICON_FLAGS)}</span>
            <h3>No Feature Flags Available</h3>
            <p>Feature flags will appear here when the API is available.</p>
            <p class="empty-state-hint">Check that the backend is running and connected.</p>
          </div>
        </div>
      ` : Object.entries(categories).map(([category, categoryFlags]) => `
        <div class="admin-card flags-category">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(getCategoryIcon(category))}</span>
            ${category}
            <span class="category-count">${categoryFlags.length} flags</span>
          </h2>
          <div class="flags-list">
            ${categoryFlags.map(flag => renderFlagItem(flag)).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <style>
      .flags-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .flags-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-4, 1rem);
        flex-wrap: wrap;
      }

      .flags-search {
        flex: 1;
        max-width: 400px;
        position: relative;
      }

      .flags-search-icon {
        position: absolute;
        left: var(--space-3, 0.75rem);
        top: 50%;
        transform: translateY(-50%);
        color: var(--color-text-muted, #756A5E);
        display: flex;
        pointer-events: none;
      }

      .flags-search-icon svg {
        width: 16px;
        height: 16px;
      }

      .flags-search-input {
        width: 100%;
        padding: var(--space-3, 0.75rem);
        padding-left: calc(var(--space-3, 0.75rem) * 2 + 16px);
        background: var(--color-background-elevated, #2c2520);
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-size: 0.9375rem;
        font-family: inherit;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .flags-search-input::placeholder {
        color: var(--color-text-muted, #756A5E);
      }

      .flags-search-input:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .flags-search-input {
          transition: none;
        }
      }

      .flags-action-btns {
        display: flex;
        gap: var(--space-2, 0.5rem);
      }

      .category-count {
        font-size: 0.75rem;
        font-weight: 400;
        color: var(--color-text-muted, #756A5E);
        margin-left: auto;
      }

      .flags-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .flag-item {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
        transition: background var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .flag-item:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.05));
      }

      .flag-item--disabled {
        opacity: 0.6;
      }

      @media (prefers-reduced-motion: reduce) {
        .flag-item {
          transition: none;
        }
      }

      .flag-info {
        flex: 1;
      }

      .flag-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .flag-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .flag-id {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.6875rem;
        color: var(--color-text-muted, #756A5E);
        padding: 0.125rem 0.375rem;
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-sm, 4px);
      }

      .flag-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .flag-controls {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
      }

      .flag-percentage {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .flag-percentage-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .flag-percentage-input {
        width: 60px;
        padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-sm, 4px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        text-align: center;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .flag-percentage-input:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .flag-percentage-input {
          transition: none;
        }
      }
    </style>
  `;
}

function renderFlagItem(flag: FeatureFlag): string {
  return `
    <div class="flag-item ${!flag.enabled ? 'flag-item--disabled' : ''}" data-flag="${flag.id}">
      <div class="flag-info">
        <div class="flag-header">
          <span class="flag-name">${flag.name}</span>
          <span class="flag-id">${flag.id}</span>
        </div>
        <p class="flag-desc">${flag.description}</p>
      </div>
      <div class="flag-controls">
        ${flag.percentage !== undefined ? `
          <div class="flag-percentage">
            <label for="percentage-${flag.id}" class="flag-percentage-label">Rollout:</label>
            <input
              type="number"
              id="percentage-${flag.id}"
              class="flag-percentage-input"
              value="${flag.percentage}"
              min="0"
              max="100"
              data-flag-id="${flag.id}"
              data-action="set-percentage"
              aria-describedby="percentage-hint-${flag.id}"
            >
            <span id="percentage-hint-${flag.id}" class="flag-percentage-label">%</span>
          </div>
        ` : ''}
        <label class="admin-toggle">
          <input 
            type="checkbox" 
            ${flag.enabled ? 'checked' : ''}
            data-flag-id="${flag.id}"
            data-action="toggle"
          >
          <span class="admin-toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'Trust': ICON_TRUST,
    'Voice': ICON_SPEAKER,
    'EvalOps': ICON_EVALOPS,
    'Engagement': ICON_TEAM,
    'Experimental': ICON_SETTINGS,
    'System': ICON_SETTINGS,
  };
  return icons[category] || ICON_FLAGS;
}

function groupByCategory(flags: FeatureFlag[]): Record<string, FeatureFlag[]> {
  return flags.reduce((acc, flag) => {
    const category = flag.category || 'System';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);
}

async function fetchFlags(): Promise<FeatureFlag[]> {
  try {
    const response = await fetch('/api/v1/admin/flags', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      // Merge general flags and trust flags
      const generalFlags = (data.flags || []).map((f: FeatureFlag) => ({
        ...f,
        category: f.category || 'System',
      }));
      const trustFlags = Object.entries(data.trustFlags || {}).map(([id, config]) => ({
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        description: (config as { enabled?: boolean }).enabled ? 'Enabled' : 'Disabled',
        enabled: (config as { enabled?: boolean }).enabled || false,
        percentage: (config as { percentage?: number }).percentage,
        category: 'Trust',
      }));
      return [...generalFlags, ...trustFlags];
    }
  } catch {
    // API unavailable
  }

  // Return empty array - flags will appear when API is available
  return [];
}

export default { render };
