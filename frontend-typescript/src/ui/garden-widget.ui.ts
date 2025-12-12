/**
 * Garden Widget UI
 *
 * Shows the Seed Fund status - how much has been raised this month
 * and lets users contribute to keep Ferni free.
 *
 * "Ferni doesn't have a paywall. It has a community."
 */

import type {
  GardenStatus,
  UserGarden,
  GardenHealth,
  GardenerStatus,
} from '../../../src/types/seed-fund.types.js';

// =============================================================================
// STATE
// =============================================================================

interface GardenWidgetState {
  garden: GardenStatus | null;
  userGarden: UserGarden | null;
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;
}

let state: GardenWidgetState = {
  garden: null,
  userGarden: null,
  isLoading: true,
  error: null,
  isExpanded: false,
};

let containerElement: HTMLElement | null = null;

// =============================================================================
// CONSTANTS
// =============================================================================

const HEALTH_COLORS: Record<GardenHealth, string> = {
  thriving: 'var(--color-semantic-success)',
  growing: 'var(--color-accent-warm)',
  'needs-water': 'var(--color-semantic-warning)',
};

/**
 * SVG icons for gardener status (no emojis per design system guidelines)
 */
const STATUS_ICONS: Record<GardenerStatus, string> = {
  // Small sprout - new gardener
  seedling: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V12"/>
    <path d="M12 12C12 8 9 5 5 5c0 4 3 7 7 7"/>
    <path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7"/>
  </svg>`,
  // Growing plant with multiple leaves
  gardener: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V8"/>
    <path d="M12 8c-4 0-7-3-7-7 4 0 7 3 7 7"/>
    <path d="M12 8c4 0 7-3 7-7-4 0-7 3-7 7"/>
    <path d="M12 14c-3 0-5-2-5-5 3 0 5 2 5 5"/>
    <path d="M12 14c3 0 5-2 5-5-3 0-5 2-5 5"/>
  </svg>`,
  // Full tree - experienced gardener
  'grove-keeper': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V13"/>
    <path d="M12 13c-5 0-8-4-8-8 0 0 3 0 8 4 5-4 8-4 8-4 0 4-3 8-8 8"/>
    <path d="M12 9C9 9 6 6 6 3c0 0 2 0 6 3 4-3 6-3 6-3 0 3-3 6-6 6"/>
  </svg>`,
};

// =============================================================================
// API
// =============================================================================

async function fetchGardenStatus(): Promise<GardenStatus | null> {
  try {
    const response = await fetch('/api/garden/status');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchUserGarden(): Promise<UserGarden | null> {
  try {
    const response = await fetch('/api/garden/user');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// =============================================================================
// RENDER FUNCTIONS
// =============================================================================

function getHealthMessage(garden: GardenStatus): string {
  switch (garden.health) {
    case 'thriving':
      return `Ferni is free because ${garden.gardenersThisMonth} people planted seeds.`;
    case 'growing':
      return `${Math.round(garden.percentFunded)}% funded. Every seed helps.`;
    case 'needs-water':
      return 'The garden needs some love.';
  }
}

function renderCompactWidget(): string {
  const { garden, isLoading, error } = state;

  if (isLoading) {
    return `
      <div class="garden-widget garden-widget--compact garden-widget--loading">
        <div class="garden-widget__skeleton"></div>
      </div>
    `;
  }

  if (error || !garden) {
    return `
      <div class="garden-widget garden-widget--compact garden-widget--error">
        <span class="garden-widget__error-text">Could not load garden status</span>
      </div>
    `;
  }

  const healthColor = HEALTH_COLORS[garden.health];
  const progressPercent = Math.min(garden.percentFunded, 100);

  return `
    <div class="garden-widget garden-widget--compact" data-health="${garden.health}">
      <div class="garden-widget__header">
        <span class="garden-widget__title">Ferni's Garden</span>
        <button class="garden-widget__expand-btn" aria-label="Expand garden details">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </button>
      </div>

      <div class="garden-widget__progress-container">
        <div
          class="garden-widget__progress-bar"
          style="width: ${progressPercent}%; background: ${healthColor}"
        ></div>
      </div>

      <div class="garden-widget__footer">
        <span class="garden-widget__stats">${garden.gardenersThisMonth} gardeners</span>
        <span class="garden-widget__percent">${Math.round(garden.percentFunded)}%</span>
      </div>
    </div>
  `;
}

function renderExpandedWidget(): string {
  const { garden, userGarden, isLoading, error } = state;

  if (isLoading || error || !garden) {
    return renderCompactWidget();
  }

  const healthColor = HEALTH_COLORS[garden.health];
  const progressPercent = Math.min(garden.percentFunded, 100);
  const userIcon = userGarden ? STATUS_ICONS[userGarden.status] : '';
  const userStatusName = userGarden
    ? userGarden.status.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';

  return `
    <div class="garden-widget garden-widget--expanded" data-health="${garden.health}">
      <div class="garden-widget__header">
        <span class="garden-widget__title">Ferni's Garden</span>
        <button class="garden-widget__collapse-btn" aria-label="Collapse garden details">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </button>
      </div>

      <div class="garden-widget__amount">
        <span class="garden-widget__current">$${garden.currentMonth.toLocaleString()}</span>
        <span class="garden-widget__goal">/ $${garden.monthlyGoal.toLocaleString()}</span>
      </div>

      <div class="garden-widget__progress-container garden-widget__progress-container--large">
        <div
          class="garden-widget__progress-bar"
          style="width: ${progressPercent}%; background: ${healthColor}"
        ></div>
      </div>

      <p class="garden-widget__message">${getHealthMessage(garden)}</p>

      <div class="garden-widget__actions">
        <button class="garden-widget__action-btn garden-widget__action-btn--primary">
          Plant a Seed
        </button>
        <button class="garden-widget__action-btn garden-widget__action-btn--secondary">
          Become a Gardener
        </button>
      </div>

      ${
        userGarden && userGarden.totalSeeds > 0
          ? `
        <div class="garden-widget__user-status">
          <span class="garden-widget__user-icon">${userIcon}</span>
          <span class="garden-widget__user-label">${userStatusName}</span>
          <span class="garden-widget__user-seeds">${userGarden.totalSeeds} seeds planted</span>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function render(): void {
  if (!containerElement) return;

  containerElement.innerHTML = state.isExpanded ? renderExpandedWidget() : renderCompactWidget();

  // Attach event listeners
  const expandBtn = containerElement.querySelector('.garden-widget__expand-btn');
  const collapseBtn = containerElement.querySelector('.garden-widget__collapse-btn');
  const plantSeedBtn = containerElement.querySelector(
    '.garden-widget__action-btn--primary'
  );
  const becomeGardenerBtn = containerElement.querySelector(
    '.garden-widget__action-btn--secondary'
  );

  expandBtn?.addEventListener('click', () => {
    state.isExpanded = true;
    render();
  });

  collapseBtn?.addEventListener('click', () => {
    state.isExpanded = false;
    render();
  });

  plantSeedBtn?.addEventListener('click', () => {
    openPlantSeedFlow('one-time');
  });

  becomeGardenerBtn?.addEventListener('click', () => {
    openPlantSeedFlow('monthly');
  });
}

// =============================================================================
// PLANT SEED FLOW
// =============================================================================

function openPlantSeedFlow(type: 'one-time' | 'monthly'): void {
  // TODO: Implement the plant seed modal/flow
  // For now, dispatch an event that the app can handle
  const event = new CustomEvent('ferni:open-plant-seed', {
    detail: { type },
  });
  window.dispatchEvent(event);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Initialize the garden widget
 */
export async function initGardenWidget(container: HTMLElement): Promise<void> {
  containerElement = container;

  // Initial render with loading state
  render();

  // Fetch data
  const [garden, userGarden] = await Promise.all([
    fetchGardenStatus(),
    fetchUserGarden(),
  ]);

  state = {
    ...state,
    garden,
    userGarden,
    isLoading: false,
    error: garden ? null : 'Failed to load garden status',
  };

  render();
}

/**
 * Refresh garden data
 */
export async function refreshGarden(): Promise<void> {
  state.isLoading = true;
  render();

  const [garden, userGarden] = await Promise.all([
    fetchGardenStatus(),
    fetchUserGarden(),
  ]);

  state = {
    ...state,
    garden,
    userGarden,
    isLoading: false,
    error: garden ? null : 'Failed to load garden status',
  };

  render();
}

/**
 * Get the styles for the garden widget
 */
export function getGardenWidgetStyles(): string {
  return `
    .garden-widget {
      background: var(--color-bg-elevated);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
      border: 1px solid var(--color-border-subtle);
    }

    .garden-widget--loading {
      min-height: 60px;
    }

    .garden-widget__skeleton {
      height: 40px;
      background: linear-gradient(
        90deg,
        var(--color-bg-secondary) 25%,
        var(--color-bg-tertiary) 50%,
        var(--color-bg-secondary) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer var(--duration-slow) infinite;
      border-radius: var(--radius-md);
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .garden-widget__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm);
    }

    .garden-widget__title {
      font-weight: 600;
      font-size: var(--font-size-sm);
      color: var(--color-text-primary);
    }

    .garden-widget__expand-btn,
    .garden-widget__collapse-btn {
      background: none;
      border: none;
      padding: var(--space-xs);
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-sm);
      transition: color var(--duration-fast), background var(--duration-fast);
    }

    .garden-widget__expand-btn:hover,
    .garden-widget__collapse-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-secondary);
    }

    .garden-widget__expand-btn:focus-visible,
    .garden-widget__collapse-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .garden-widget__progress-container {
      height: 4px;
      background: var(--color-bg-secondary);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--space-xs);
    }

    .garden-widget__progress-container--large {
      height: 8px;
      margin-bottom: var(--space-md);
    }

    .garden-widget__progress-bar {
      height: 100%;
      border-radius: var(--radius-full);
      transition: width var(--duration-slow) var(--ease-out-expo);
    }

    .garden-widget__footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .garden-widget__stats {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .garden-widget__percent {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    /* Expanded state */
    .garden-widget--expanded {
      padding: var(--space-lg);
    }

    .garden-widget__amount {
      text-align: center;
      margin-bottom: var(--space-md);
    }

    .garden-widget__current {
      font-size: var(--font-size-2xl);
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .garden-widget__goal {
      font-size: var(--font-size-lg);
      color: var(--color-text-muted);
    }

    .garden-widget__message {
      text-align: center;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-lg);
      line-height: 1.5;
    }

    .garden-widget__actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }

    .garden-widget__action-btn {
      width: 100%;
      padding: var(--space-md);
      border-radius: var(--radius-lg);
      font-weight: 600;
      font-size: var(--font-size-sm);
      cursor: pointer;
      transition: all var(--duration-fast);
    }

    .garden-widget__action-btn--primary {
      background: var(--color-ferni);
      color: white;
      border: none;
    }

    .garden-widget__action-btn--primary:hover {
      filter: brightness(1.1);
    }

    .garden-widget__action-btn--primary:focus-visible {
      outline: 2px solid var(--color-ferni);
      outline-offset: 2px;
    }

    .garden-widget__action-btn--secondary {
      background: transparent;
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-medium);
    }

    .garden-widget__action-btn--secondary:hover {
      background: var(--color-bg-secondary);
    }

    .garden-widget__action-btn--secondary:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .garden-widget__user-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
      margin-top: var(--space-lg);
      padding-top: var(--space-md);
      border-top: 1px solid var(--color-border-subtle);
    }

    .garden-widget__user-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni);
    }

    .garden-widget__user-icon svg {
      width: 18px;
      height: 18px;
    }

    .garden-widget__user-label {
      font-weight: 600;
      font-size: var(--font-size-sm);
      color: var(--color-text-primary);
    }

    .garden-widget__user-seeds {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .garden-widget__error-text {
      font-size: var(--font-size-xs);
      color: var(--color-semantic-error);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .garden-widget__skeleton {
        animation: none;
      }

      .garden-widget__progress-bar {
        transition: none;
      }
    }
  `;
}
