/**
 * Flags Section
 *
 * Feature flag management for the admin portal.
 *
 * @module FlagsSection
 */

import { createLogger } from '../../utils/logger.js';

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
          <input 
            type="text" 
            placeholder="Search flags..." 
            class="flags-search-input"
            id="flagsSearch"
            oninput="filterFlags(this.value)"
          >
        </div>
        <div class="flags-action-btns">
          <button class="admin-btn" data-action="enable-all-flags">
            ✅ Enable All
          </button>
          <button class="admin-btn" data-action="disable-all-flags">
            ⛔ Disable All
          </button>
          <button class="admin-btn" data-action="reset-flags">
            🔄 Reset to Defaults
          </button>
        </div>
      </div>

      <!-- Flag Categories -->
      ${Object.entries(categories).map(([category, categoryFlags]) => `
        <div class="admin-card flags-category">
          <h2 class="admin-section-title">
            <span>${getCategoryIcon(category)}</span> ${category}
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
      }

      .flags-search-input {
        width: 100%;
        padding: var(--space-3, 0.75rem);
        background: var(--color-background-elevated, #2c2520);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-size: 0.9375rem;
        font-family: inherit;
      }

      .flags-search-input::placeholder {
        color: var(--color-text-muted, #756A5E);
      }

      .flags-search-input:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
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
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--radius-md, 8px);
        transition: all 150ms ease;
      }

      .flag-item:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .flag-item--disabled {
        opacity: 0.6;
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
        background: rgba(255, 255, 255, 0.05);
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
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-sm, 4px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        text-align: center;
      }

      .flag-percentage-input:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
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
            <span class="flag-percentage-label">Rollout:</span>
            <input 
              type="number" 
              class="flag-percentage-input"
              value="${flag.percentage}"
              min="0"
              max="100"
              data-flag-id="${flag.id}"
              data-action="set-percentage"
            >
            <span class="flag-percentage-label">%</span>
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
    'Trust': '💚',
    'Voice': '🎤',
    'EvalOps': '🎯',
    'Engagement': '🤝',
    'Experimental': '🧪',
    'System': '⚙️',
  };
  return icons[category] || '🚩';
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
    // Fall through to mock data
  }

  // Mock data for development
  return [
    { id: 'trust-reading-between-lines', name: 'Reading Between Lines', description: 'Detects what users aren\'t saying', enabled: true, category: 'Trust' },
    { id: 'trust-boundary-memory', name: 'Boundary Memory', description: 'Remembers topics to avoid', enabled: true, category: 'Trust' },
    { id: 'trust-growth-reflection', name: 'Growth Reflection', description: 'Notices and reflects user evolution', enabled: true, category: 'Trust' },
    { id: 'trust-inside-jokes', name: 'Inside Jokes', description: 'Tracks shared history for callbacks', enabled: true, category: 'Trust' },
    { id: 'trust-small-wins', name: 'Small Wins', description: 'Celebrates effort not just outcomes', enabled: true, category: 'Trust' },
    { id: 'trust-thinking-of-you', name: 'Thinking of You', description: 'Proactive no-agenda outreach', enabled: false, percentage: 10, category: 'Trust' },
    { id: 'voice-enhanced-fingerprinting', name: 'Enhanced Voice Fingerprinting', description: 'Uses neural speaker embeddings', enabled: true, category: 'Voice' },
    { id: 'voice-authentication', name: 'Voice Authentication', description: 'Enable voice enrollment & verification', enabled: true, category: 'Voice' },
    { id: 'voice-emotion-detection', name: 'Voice Emotion Detection', description: 'Detect emotions from voice', enabled: false, percentage: 25, category: 'Voice' },
    { id: 'evalops', name: 'EvalOps System', description: 'Master toggle for evaluation system', enabled: true, category: 'EvalOps' },
    { id: 'evalops-auto-sampling', name: 'Auto Sampling', description: 'Sample conversations automatically', enabled: true, percentage: 5, category: 'EvalOps' },
    { id: 'evalops-llm-evaluation', name: 'LLM Evaluation', description: 'Full LLM-as-judge (costs API tokens)', enabled: false, category: 'EvalOps' },
  ];
}

export default { render };

