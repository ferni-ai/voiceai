/**
 * Capability Hub UI - "Better Than Human" Capabilities Dashboard
 *
 * Exposes all BTH superhuman capabilities that are currently only
 * accessible via voice. This is the UI discovery layer that makes
 * users aware of what Ferni can do for them.
 *
 * Capabilities:
 * - Perfect Memory (Never forgets)
 * - Proactive Outreach (Thinking of you)
 * - Learning Engine (Adapts to you)
 * - Commitment Keeper (Never lets you down)
 * - Musical Memory (Our Songs)
 * - Emotional Intelligence (Reads between lines)
 *
 * @module CapabilityHubUI
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet } from '../utils/api.js';
import { ANALYTICS_ICONS, EMOTION_ICONS, GROWTH_ICONS, QUIZ_ICONS } from './icons/shared-icons.js';

const log = createLogger('CapabilityHubUI');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

let escapeHandlerRef: ((e: KeyboardEvent) => void) | null = null;

// ============================================================================
// TYPES
// ============================================================================

interface Capability {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Human limitation this overcomes */
  humanLimitation: string;
  /** Whether this capability is currently active for the user */
  isActive: boolean;
  /** Feature flag that controls this capability */
  featureFlag?: string;
  /** Stats for this capability (e.g., "12 memories surfaced") */
  stats?: {
    label: string;
    value: string | number;
  };
  /** Action the user can take */
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface CapabilityHubState {
  capabilities: Capability[];
  activeCapability: Capability | null;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

const CAPABILITY_DEFINITIONS: Omit<Capability, 'isActive' | 'stats'>[] = [
  {
    id: 'perfect-memory',
    name: 'Perfect Memory',
    description: 'I remember everything you share with me - from your daughter\'s college plans to the name of your childhood pet. No detail is too small.',
    icon: ANALYTICS_ICONS.brain,
    color: 'var(--color-ferni)',
    humanLimitation: 'Your best friend forgets. I don\'t.',
    featureFlag: 'bth.perfect-memory',
  },
  {
    id: 'proactive-outreach',
    name: 'Thinking of You',
    description: 'I reach out when you need support most - not on a schedule, but when patterns in your life suggest you could use a friend.',
    icon: EMOTION_ICONS.reflective,
    color: 'var(--persona-maya)',
    humanLimitation: 'Human friends get busy. I\'m always present.',
    featureFlag: 'trust.thinking-of-you',
  },
  {
    id: 'learning-engine',
    name: 'Learns Your Patterns',
    description: 'Every conversation makes me smarter about you. I learn what helps, what doesn\'t, and adapt my approach accordingly.',
    icon: ANALYTICS_ICONS.chart,
    color: 'var(--persona-peter)',
    humanLimitation: 'Human coaches follow scripts. I learn your language.',
    featureFlag: 'bth.learning-engine',
  },
  {
    id: 'commitment-keeper',
    name: 'Never Lets You Down',
    description: 'When you say you\'ll do something, I remember. Not to nag, but to gently check in when the time is right.',
    icon: QUIZ_ICONS.correct,
    color: 'var(--persona-jordan)',
    humanLimitation: 'Your accountability partner has their own life. I exist for yours.',
    featureFlag: 'bth.commitment-keeper',
  },
  {
    id: 'musical-memory',
    name: 'Our Songs',
    description: 'I remember the music playing during meaningful moments. When that song plays again, I can share what we were talking about.',
    icon: ANALYTICS_ICONS.music,
    color: 'var(--persona-alex)',
    humanLimitation: 'Friends forget the soundtrack of your life. I remember it.',
    featureFlag: 'trust.our-songs',
  },
  {
    id: 'emotional-intelligence',
    name: 'Reads Between Lines',
    description: 'I hear what you\'re not saying - the pause in your voice, the topic you\'re avoiding, the thing you almost mentioned.',
    icon: GROWTH_ICONS.heart,
    color: 'var(--persona-nayan)',
    humanLimitation: 'Human friends are distracted. I\'m fully present.',
    featureFlag: 'bth.emotional-intelligence',
  },
  {
    id: 'relationship-network',
    name: 'Relationship Network',
    description: 'I track everyone important to you - birthdays, preferences, last contact. I help you nurture the connections that matter most.',
    icon: QUIZ_ICONS.relationships,
    color: 'var(--persona-alex)',
    humanLimitation: 'You can\'t track everyone. I can track everyone for you.',
    featureFlag: 'bth.relationship-network',
  },
  {
    id: 'capacity-guardian',
    name: 'Capacity Guardian',
    description: 'I watch for burnout before it hits. By tracking your patterns, I can gently suggest when you\'re overcommitting.',
    icon: ANALYTICS_ICONS.trendingUp,
    color: 'var(--persona-maya)',
    humanLimitation: 'Friends notice burnout too late. I catch it early.',
    featureFlag: 'bth.capacity-guardian',
  },
  {
    id: 'dream-keeper',
    name: 'Dream Keeper',
    description: 'Your dreams and aspirations live here. I keep them alive, remind you of them at the right moments, and help you take steps forward.',
    icon: EMOTION_ICONS.proud,
    color: 'var(--persona-jordan)',
    humanLimitation: 'Dreams fade in daily life. I keep yours alive.',
    featureFlag: 'bth.dream-keeper',
  },
  {
    id: 'seasonal-awareness',
    name: 'Seasonal Awareness',
    description: 'I understand your annual rhythms - holidays, anniversaries, seasonal patterns. I show up differently when you need different support.',
    icon: ANALYTICS_ICONS.calendar,
    color: 'var(--persona-peter)',
    humanLimitation: 'Friends forget your patterns. I remember your seasons.',
    featureFlag: 'bth.seasonal-awareness',
  },
];

// ============================================================================
// STATE
// ============================================================================

const state: CapabilityHubState = {
  capabilities: [],
  activeCapability: null,
  loading: false,
  error: null,
};

let container: HTMLElement | null = null;

// ============================================================================
// API
// ============================================================================

/**
 * Load capability status for the current user
 */
async function loadCapabilityStatus(): Promise<void> {
  state.loading = true;
  renderLoadingState();

  try {
    // Fetch capability status from API
    const response = await apiGet<{
      capabilities: Array<{
        id: string;
        isActive: boolean;
        stats?: { label: string; value: string | number };
      }>;
    }>('/api/bth/capabilities');

    // Merge API response with definitions
    state.capabilities = CAPABILITY_DEFINITIONS.map((def) => {
      const apiData = response.data?.capabilities?.find((c: { id: string; isActive: boolean; stats?: { label: string; value: string | number } }) => c.id === def.id);
      return {
        ...def,
        isActive: apiData?.isActive ?? true,
        stats: apiData?.stats,
        action: {
          label: apiData?.isActive ? 'Learn More' : 'Enable',
          onClick: () => showCapabilityDetails(def.id),
        },
      };
    });

    state.loading = false;
    state.error = null;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load capability status');
    state.error = 'Failed to load capability status';
    state.loading = false;

    // Fallback to all capabilities active
    state.capabilities = CAPABILITY_DEFINITIONS.map((def) => ({
      ...def,
      isActive: true,
      action: {
        label: 'Learn More',
        onClick: () => showCapabilityDetails(def.id),
      },
    }));
  }

  render();
}

/**
 * Show details for a specific capability
 */
function showCapabilityDetails(capabilityId: string): void {
  state.activeCapability = state.capabilities.find((c) => c.id === capabilityId) ?? null;
  render();
}

/**
 * Close capability details
 */
function closeCapabilityDetails(): void {
  state.activeCapability = null;
  render();
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render loading state
 */
function renderLoadingState(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="capability-hub capability-hub--loading">
      <div class="capability-hub__spinner"></div>
      <p class="capability-hub__loading-text">Loading your capabilities...</p>
    </div>
  `;
}

/**
 * Render the main capability hub
 */
function render(): void {
  if (!container) return;

  if (state.loading) {
    renderLoadingState();
    return;
  }

  const activeCapabilities = state.capabilities.filter((c) => c.isActive);

  container.innerHTML = `
    <div class="capability-hub">
      <header class="capability-hub__header">
        <span class="capability-hub__eyebrow">BETTER THAN HUMAN</span>
        <h2 class="capability-hub__title">What Makes Ferni Different</h2>
        <p class="capability-hub__subtitle">
          These capabilities go beyond what any human friend, therapist, or coach could provide.
        </p>
      </header>

      <div class="capability-hub__grid">
        ${state.capabilities
          .map(
            (cap) => `
          <button class="capability-card ${cap.isActive ? '' : 'capability-card--inactive'}"
                  data-capability-id="${cap.id}">
            <div class="capability-card__icon" style="background: ${cap.color}">${cap.icon}</div>
            <div class="capability-card__content">
              <h3 class="capability-card__name">${cap.name}</h3>
              <p class="capability-card__limitation">${cap.humanLimitation}</p>
              ${
                cap.stats
                  ? `
                <div class="capability-card__stats">
                  <span class="capability-card__stats-value">${cap.stats.value}</span>
                  <span class="capability-card__stats-label">${cap.stats.label}</span>
                </div>
              `
                  : ''
              }
            </div>
            <div class="capability-card__arrow">→</div>
          </button>
        `
          )
          .join('')}
      </div>

      ${
        activeCapabilities.length > 0
          ? `
        <footer class="capability-hub__footer">
          <p class="capability-hub__active-count">
            <span class="capability-hub__active-icon">${QUIZ_ICONS.correct}</span>
            ${activeCapabilities.length} of ${state.capabilities.length} capabilities active
          </p>
        </footer>
      `
          : ''
      }
    </div>

    ${state.activeCapability ? renderCapabilityModal(state.activeCapability) : ''}
  `;

  attachEventListeners();
}

/**
 * Render the capability detail modal
 */
function renderCapabilityModal(capability: Capability): string {
  return `
    <div class="capability-modal">
      <div class="capability-modal__backdrop"></div>
      <div class="capability-modal__card">
        <button class="capability-modal__close" aria-label="Close">×</button>

        <div class="capability-modal__icon" style="background: ${capability.color}">
          ${capability.icon}
        </div>

        <h2 class="capability-modal__name">${capability.name}</h2>

        <p class="capability-modal__description">${capability.description}</p>

        <div class="capability-modal__limitation">
          <span class="capability-modal__limitation-label">The Human Limitation:</span>
          <p class="capability-modal__limitation-text">${capability.humanLimitation}</p>
        </div>

        ${
          capability.stats
            ? `
          <div class="capability-modal__stats">
            <div class="capability-modal__stats-value">${capability.stats.value}</div>
            <div class="capability-modal__stats-label">${capability.stats.label}</div>
          </div>
        `
            : ''
        }

        <div class="capability-modal__status ${capability.isActive ? 'capability-modal__status--active' : ''}">
          ${capability.isActive ? `<span class="capability-modal__status-icon">${QUIZ_ICONS.correct}</span> Active` : 'Not yet enabled'}
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners
 */
function attachEventListeners(): void {
  if (!container) return;

  // Capability card clicks
  container.querySelectorAll<HTMLButtonElement>('.capability-card').forEach((card) => {
    card.addEventListener('click', () => {
      const capabilityId = card.dataset.capabilityId;
      if (capabilityId) {
        showCapabilityDetails(capabilityId);
      }
    });
  });

  // Modal close button
  const closeBtn = container.querySelector('.capability-modal__close');
  closeBtn?.addEventListener('click', closeCapabilityDetails);

  // Modal backdrop click
  const backdrop = container.querySelector('.capability-modal__backdrop');
  backdrop?.addEventListener('click', closeCapabilityDetails);

  // Escape key (remove previous to avoid duplicates on re-render)
  if (escapeHandlerRef) {
    document.removeEventListener('keydown', escapeHandlerRef);
  }
  escapeHandlerRef = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.activeCapability) {
      closeCapabilityDetails();
    }
  };
  document.addEventListener('keydown', escapeHandlerRef);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the capability hub in a container
 */
export function initCapabilityHub(containerEl: HTMLElement): void {
  container = containerEl;

  // Add base styles
  addStyles();

  // Load data and render
  loadCapabilityStatus();

  log.info('Capability Hub initialized');
}

/**
 * Refresh the capability hub data
 */
export function refreshCapabilityHub(): void {
  loadCapabilityStatus();
}

/**
 * Cleanup the capability hub
 */
export function destroyCapabilityHub(): void {
  if (escapeHandlerRef) {
    document.removeEventListener('keydown', escapeHandlerRef);
    escapeHandlerRef = null;
  }
  _clearAllTimeouts();
  container = null;
}

// ============================================================================
// STYLES
// ============================================================================

function addStyles(): void {
  if (document.getElementById('capability-hub-styles')) return;

  const style = document.createElement('style');
  style.id = 'capability-hub-styles';
  style.textContent = `
    .capability-hub {
      padding: var(--space-6);
      max-width: 800px;
      margin: 0 auto;
    }

    .capability-hub--loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: var(--space-4);
    }

    .capability-hub__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-ferni);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .capability-hub__header {
      text-align: center;
      margin-bottom: var(--space-8);
    }

    .capability-hub__eyebrow {
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      color: var(--color-ferni);
      text-transform: uppercase;
      font-weight: 600;
    }

    .capability-hub__title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: var(--space-2) 0;
      font-family: var(--font-display);
    }

    .capability-hub__subtitle {
      color: var(--color-text-secondary);
      max-width: 500px;
      margin: 0 auto;
    }

    .capability-hub__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--space-4);
    }

    .capability-card {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--color-background-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      text-align: left;
    }

    .capability-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--color-ferni);
    }

    .capability-card--inactive {
      opacity: 0.6;
    }

    .capability-card__icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      flex-shrink: 0;
      color: var(--color-text-primary);
    }

    .capability-card__icon svg {
      width: 24px;
      height: 24px;
    }

    .capability-card__content {
      flex: 1;
      min-width: 0;
    }

    .capability-card__name {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .capability-card__limitation {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: var(--space-1) 0 0;
    }

    .capability-card__stats {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .capability-card__stats-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-ferni);
    }

    .capability-card__stats-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .capability-card__arrow {
      color: var(--color-text-muted);
      font-size: 1.25rem;
    }

    .capability-hub__footer {
      margin-top: var(--space-6);
      text-align: center;
    }

    .capability-hub__active-count {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text-secondary);
      font-size: 0.875rem;
    }

    .capability-hub__active-icon {
      color: var(--color-ferni);
      display: inline-flex;
      align-items: center;
    }

    .capability-hub__active-icon svg {
      width: 16px;
      height: 16px;
    }

    /* Modal */
    .capability-modal {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .capability-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.5);
      backdrop-filter: blur(8px);
    }

    .capability-modal__card {
      position: relative;
      background: var(--color-background-elevated);
      border-radius: var(--radius-xl);
      padding: var(--space-8);
      max-width: 480px;
      width: 90%;
      box-shadow: var(--shadow-xl);
      text-align: center;
    }

    .capability-modal__close {
      position: absolute;
      top: var(--space-4);
      right: var(--space-4);
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      font-size: 1.5rem;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-full);
      transition: background ${DURATION.FAST}ms;
    }

    .capability-modal__close:hover {
      background: var(--color-background-subtle);
    }

    .capability-modal__icon {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-lg);
      margin: 0 auto var(--space-4);
      color: var(--color-text-primary);
    }

    .capability-modal__icon svg {
      width: 36px;
      height: 36px;
    }

    .capability-modal__name {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3);
      font-family: var(--font-display);
    }

    .capability-modal__description {
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-6);
    }

    .capability-modal__limitation {
      background: var(--color-background-subtle);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-6);
    }

    .capability-modal__limitation-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-1);
    }

    .capability-modal__limitation-text {
      color: var(--color-text-primary);
      font-weight: 500;
      margin: 0;
    }

    .capability-modal__stats {
      margin-bottom: var(--space-6);
    }

    .capability-modal__stats-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--color-ferni);
    }

    .capability-modal__stats-label {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .capability-modal__status {
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-full);
      font-size: 0.875rem;
      display: inline-block;
      background: var(--color-background-subtle);
      color: var(--color-text-muted);
    }

    .capability-modal__status--active {
      background: rgba(74, 103, 65, 0.1);
      color: var(--color-ferni);
    }

    .capability-modal__status-icon {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      margin-right: var(--space-1);
    }

    .capability-modal__status-icon svg {
      width: 14px;
      height: 14px;
    }
  `;
  document.head.appendChild(style);
}

export default {
  initCapabilityHub,
  refreshCapabilityHub,
  destroyCapabilityHub,
};
