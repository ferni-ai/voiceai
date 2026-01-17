/**
 * Life Coaching Hub UI
 *
 * Central hub for all life coaching capabilities - grief, breakup,
 * divorce, job loss, chronic conditions, etc.
 *
 * DESIGN PRINCIPLES:
 *   - Warm, supportive visual language
 *   - Easy discovery of available support
 *   - Click any card to start voice conversation
 *   - "Better than Human" features highlighted
 */

import { t } from '../i18n/index.js';
import {
  CAPABILITIES,
  getCapabilitiesByCategory,
  searchCapabilities,
  type Capability,
} from '../services/capability-registry.js';
import { createCapabilityCard, createCapabilityGrid } from './capability-card.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeCoachingHub');

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>',
  'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .life-coaching-hub-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip, 1000);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .life-coaching-hub-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .life-coaching-hub-backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-dark, rgba(44, 37, 32, 0.75));
    backdrop-filter: var(--glass-blur-heavy, blur(20px));
  }
  
  .life-coaching-hub {
    position: relative;
    width: 95%;
    max-width: 800px;
    max-height: 90vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
  }
  
  .life-coaching-hub-overlay.visible .life-coaching-hub {
    transform: scale(1);
  }
  
  .life-coaching-hub__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .life-coaching-hub__header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3, 12px);
  }
  
  .life-coaching-hub__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ferni, #4a6741);
  }
  
  .life-coaching-hub__close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full, 9999px);
    transition: background var(--duration-fast, 100ms);
  }
  
  .life-coaching-hub__close:hover {
    background: var(--color-bg-subtle, #f8f6f4);
  }
  
  .life-coaching-hub__close svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted, #a09080);
  }
  
  .life-coaching-hub__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2C2520);
    margin: 0 0 var(--space-2, 8px) 0;
  }
  
  .life-coaching-hub__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin: 0;
  }
  
  .life-coaching-hub__search {
    margin-top: var(--space-4, 16px);
    position: relative;
  }
  
  .life-coaching-hub__search-input {
    width: 100%;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    padding-left: 40px;
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.15));
    border-radius: var(--radius-lg, 16px);
    font-size: 14px;
    background: var(--color-bg-subtle, #f8f6f4);
    color: var(--color-text-primary, #2C2520);
    transition: all var(--duration-fast, 100ms);
  }
  
  .life-coaching-hub__search-input:focus {
    outline: none;
    border-color: var(--color-ferni, #4a6741);
    box-shadow: 0 0 0 3px var(--color-ferni-tint, rgba(74, 103, 65, 0.1));
  }
  
  .life-coaching-hub__search-input::placeholder {
    color: var(--color-text-muted, #a09080);
  }
  
  .life-coaching-hub__search-icon {
    position: absolute;
    left: var(--space-3, 12px);
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    color: var(--color-text-muted, #a09080);
  }
  
  .life-coaching-hub__tabs {
    display: flex;
    gap: var(--space-1, 4px);
    padding: var(--space-3, 12px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    overflow-x: auto;
    flex-shrink: 0;
  }
  
  .life-coaching-hub__tab {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-lg, 16px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
    white-space: nowrap;
    transition: all var(--duration-fast, 100ms);
  }
  
  .life-coaching-hub__tab:hover {
    background: var(--color-bg-subtle, #f8f6f4);
  }
  
  .life-coaching-hub__tab.active {
    background: var(--color-ferni-tint, rgba(74, 103, 65, 0.1));
    color: var(--color-ferni, #4a6741);
  }
  
  .life-coaching-hub__tab svg {
    width: 16px;
    height: 16px;
  }
  
  .life-coaching-hub__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  .life-coaching-hub__section {
    margin-bottom: var(--space-6, 24px);
  }
  
  .life-coaching-hub__section:last-child {
    margin-bottom: 0;
  }
  
  .life-coaching-hub__section-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
    margin: 0 0 var(--space-3, 12px) 0;
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }
  
  .life-coaching-hub__section-title svg {
    width: 18px;
    height: 18px;
    color: var(--color-ferni, #4a6741);
  }
  
  .life-coaching-hub__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3, 12px);
  }
  
  @media (max-width: 600px) {
    .life-coaching-hub__grid {
      grid-template-columns: 1fr;
    }
  }
  
  .life-coaching-hub__cta {
    margin-top: var(--space-6, 24px);
    padding: var(--space-4, 16px);
    background: var(--color-ferni-tint, rgba(74, 103, 65, 0.1));
    border-radius: var(--radius-lg, 16px);
    text-align: center;
  }
  
  .life-coaching-hub__cta-text {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin: 0 0 var(--space-3, 12px) 0;
  }
  
  .life-coaching-hub__cta-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-ferni, #4a6741);
  }
  
  .life-coaching-hub__cta-trigger svg {
    width: 18px;
    height: 18px;
  }
  
  .life-coaching-hub__empty {
    text-align: center;
    padding: var(--space-8, 32px);
    color: var(--color-text-muted, #a09080);
  }
  
  .life-coaching-hub__empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-4, 16px);
    opacity: 0.5;
  }
  
  .life-coaching-hub__intro {
    background: linear-gradient(135deg, var(--color-ferni-tint, rgba(74, 103, 65, 0.08)), transparent);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    margin-bottom: var(--space-5, 20px);
    border: 1px solid var(--color-border-subtle, rgba(74, 103, 65, 0.1));
  }
  
  .life-coaching-hub__intro-text {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin: 0 0 var(--space-3, 12px) 0;
    line-height: 1.5;
  }
  
  .life-coaching-hub__intro-text strong {
    color: var(--color-ferni, #4a6741);
  }
  
  .life-coaching-hub__intro-stats {
    display: flex;
    gap: var(--space-4, 16px);
    flex-wrap: wrap;
  }
  
  .life-coaching-hub__stat {
    font-size: 13px;
    color: var(--color-text-muted, #a09080);
  }
  
  .life-coaching-hub__stat strong {
    font-weight: 700;
    color: var(--color-ferni, #4a6741);
  }
  
  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .life-coaching-hub {
      background: var(--color-bg-elevated-dark, #2a2420);
    }
    
    .life-coaching-hub__title,
    .life-coaching-hub__section-title {
      color: var(--color-text-primary-dark, #faf6f0);
    }
    
    .life-coaching-hub__subtitle {
      color: var(--color-text-secondary-dark, #c0b0a0);
    }
    
    .life-coaching-hub__search-input {
      background: var(--color-bg-subtle-dark, #3a3430);
      border-color: var(--color-border-subtle-dark, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary-dark, #faf6f0);
    }
  }
`;

// Inject styles once
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
  stylesInjected = true;
}

// ============================================================================
// STATE
// ============================================================================

type TabId = 'all' | 'life-coaching' | 'emotional-support' | 'growth' | 'relationships' | 'practical' | 'superhuman';

interface HubState {
  overlay: HTMLElement | null;
  activeTab: TabId;
  searchQuery: string;
}

const state: HubState = {
  overlay: null,
  activeTab: 'all',
  searchQuery: '',
};

// ============================================================================
// TABS CONFIGURATION
// ============================================================================

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'all', label: 'All Support', icon: 'heart' },
  { id: 'life-coaching', label: 'Life Events', icon: 'heart' },
  { id: 'emotional-support', label: 'Emotions', icon: 'shield' },
  { id: 'growth', label: 'Growth', icon: 'trending-up' },
  { id: 'relationships', label: 'Relationships', icon: 'users' },
  { id: 'practical', label: 'Everyday', icon: 'sparkles' },
  { id: 'superhuman', label: 'Better Than Human', icon: 'sparkles' },
];

// ============================================================================
// RENDERING
// ============================================================================

function getCapabilitiesForTab(tabId: TabId): Capability[] {
  if (state.searchQuery) {
    return searchCapabilities(state.searchQuery);
  }
  
  if (tabId === 'all') {
    return CAPABILITIES.filter(c => 
      ['life-coaching', 'emotional-support', 'growth', 'relationships', 'practical', 'superhuman'].includes(c.category)
    );
  }
  
  return getCapabilitiesByCategory(tabId as Parameters<typeof getCapabilitiesByCategory>[0]);
}

function handleCapabilityClick(capability: Capability): void {
  log.info('Capability clicked', { id: capability.id, name: capability.name });
  
  // Dispatch event to trigger voice conversation
  window.dispatchEvent(new CustomEvent('ferni:speak-trigger', {
    detail: {
      trigger: capability.voiceTriggers[0],
      capabilityId: capability.id,
    }
  }));
  
  // Close the hub
  hide();
}

function renderContent(): void {
  if (!state.overlay) return;
  
  const content = state.overlay.querySelector('.life-coaching-hub__content');
  if (!content) return;
  
  const capabilities = getCapabilitiesForTab(state.activeTab);
  
  if (capabilities.length === 0) {
    content.innerHTML = `
      <div class="life-coaching-hub__empty">
        <div class="life-coaching-hub__empty-icon">${ICONS.search}</div>
        <p>No results for "${state.searchQuery}"</p>
        <p style="font-size: 13px; color: var(--color-text-muted); margin-top: 8px;">Try saying what you need - I understand natural language</p>
      </div>
    `;
    return;
  }
  
  // Welcome intro for "All Support" tab
  const showIntro = state.activeTab === 'all' && !state.searchQuery;
  
  // Group by priority
  const highPriority = capabilities.filter(c => c.priority === 'high' || c.priority === 'essential');
  const otherPriority = capabilities.filter(c => c.priority === 'medium' || c.priority === 'low');
  
  let html = '';
  
  // Welcome intro
  if (showIntro) {
    html += `
      <div class="life-coaching-hub__intro">
        <p class="life-coaching-hub__intro-text">
          This is everything I can help you with. Browse the categories, search for what you need, 
          or just <strong>click any card</strong> to start a conversation about it.
        </p>
        <div class="life-coaching-hub__intro-stats">
          <span class="life-coaching-hub__stat">
            <strong>${capabilities.length}</strong> ways I can help
          </span>
          <span class="life-coaching-hub__stat">
            <strong>${capabilities.filter(c => c.isBetterThanHuman).length}</strong> "Better Than Human" features
          </span>
        </div>
      </div>
    `;
  }
  
  if (highPriority.length > 0) {
    const title = state.activeTab === 'superhuman' 
      ? 'What Makes Ferni Better Than Human'
      : 'Most Used Support';
    
    html += `
      <div class="life-coaching-hub__section">
        <h3 class="life-coaching-hub__section-title">
          ${ICONS.sparkles}
          ${title}
        </h3>
        <div class="life-coaching-hub__grid" id="high-priority-grid"></div>
      </div>
    `;
  }
  
  if (otherPriority.length > 0) {
    html += `
      <div class="life-coaching-hub__section">
        <h3 class="life-coaching-hub__section-title">
          ${ICONS.heart}
          More Support Available
        </h3>
        <div class="life-coaching-hub__grid" id="other-priority-grid"></div>
      </div>
    `;
  }
  
  // CTA
  html += `
    <div class="life-coaching-hub__cta">
      <p class="life-coaching-hub__cta-text">Just start talking - I'll understand what you need</p>
      <div class="life-coaching-hub__cta-trigger">
        ${ICONS.mic}
        <span>"Hey Ferni, I need help with..."</span>
      </div>
    </div>
  `;
  
  content.innerHTML = html;
  
  // Add capability cards
  const highPriorityGrid = content.querySelector('#high-priority-grid');
  if (highPriorityGrid) {
    highPriority.forEach(cap => {
      const card = createCapabilityCard(cap, {
        showVoiceTrigger: true,
        showBthBadge: true,
        showHumanLimitation: cap.isBetterThanHuman,
        onClick: handleCapabilityClick,
      });
      highPriorityGrid.appendChild(card);
    });
  }
  
  const otherPriorityGrid = content.querySelector('#other-priority-grid');
  if (otherPriorityGrid) {
    otherPriority.forEach(cap => {
      const card = createCapabilityCard(cap, {
        compact: true,
        showBthBadge: true,
        onClick: handleCapabilityClick,
      });
      otherPriorityGrid.appendChild(card);
    });
  }
}

function renderTabs(): void {
  if (!state.overlay) return;
  
  const tabsContainer = state.overlay.querySelector('.life-coaching-hub__tabs');
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = TABS.map(tab => `
    <button 
      class="life-coaching-hub__tab${state.activeTab === tab.id ? ' active' : ''}"
      data-tab="${tab.id}"
    >
      ${ICONS[tab.icon as keyof typeof ICONS] || ''}
      ${tab.label}
    </button>
  `).join('');
  
  // Add click handlers
  tabsContainer.querySelectorAll('.life-coaching-hub__tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = (btn as HTMLElement).dataset.tab as TabId;
      renderTabs();
      renderContent();
    });
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the Life Coaching Hub
 */
export function show(): void {
  injectStyles();
  
  // Create overlay if it doesn't exist
  if (!state.overlay) {
    state.overlay = document.createElement('div');
    state.overlay.className = 'life-coaching-hub-overlay';
    state.overlay.innerHTML = `
      <div class="life-coaching-hub-backdrop"></div>
      <div class="life-coaching-hub">
        <div class="life-coaching-hub__header">
          <div class="life-coaching-hub__header-top">
            <span class="life-coaching-hub__eyebrow">Ferni Can Help</span>
            <button class="life-coaching-hub__close" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
          <h2 class="life-coaching-hub__title">What do you need support with?</h2>
          <p class="life-coaching-hub__subtitle">
            I'm here for the big stuff - grief, transitions, difficult emotions, and everything in between.
          </p>
          <div class="life-coaching-hub__search">
            <span class="life-coaching-hub__search-icon">${ICONS.search}</span>
            <input 
              type="text" 
              class="life-coaching-hub__search-input" 
              placeholder="Search for support..."
            >
          </div>
        </div>
        <div class="life-coaching-hub__tabs"></div>
        <div class="life-coaching-hub__content"></div>
      </div>
    `;
    
    document.body.appendChild(state.overlay);
    
    // Close handlers
    const backdrop = state.overlay.querySelector('.life-coaching-hub-backdrop');
    const closeBtn = state.overlay.querySelector('.life-coaching-hub__close');
    
    backdrop?.addEventListener('click', hide);
    closeBtn?.addEventListener('click', hide);
    
    // Search handler
    const searchInput = state.overlay.querySelector('.life-coaching-hub__search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      state.searchQuery = (e.target as HTMLInputElement).value;
      renderContent();
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.overlay?.classList.contains('visible')) {
        hide();
      }
    });
  }
  
  // Reset state
  state.activeTab = 'all';
  state.searchQuery = '';
  
  // Render
  renderTabs();
  renderContent();
  
  // Show with animation
  requestAnimationFrame(() => {
    state.overlay?.classList.add('visible');
    
    // Focus search input
    const searchInput = state.overlay?.querySelector('.life-coaching-hub__search-input') as HTMLInputElement;
    searchInput?.focus();
  });
  
  log.info('Life Coaching Hub shown');
}

/**
 * Hide the Life Coaching Hub
 */
export function hide(): void {
  if (!state.overlay) return;
  
  state.overlay.classList.remove('visible');
  
  log.info('Life Coaching Hub hidden');
}

/**
 * Toggle the Life Coaching Hub
 */
export function toggle(): void {
  if (state.overlay?.classList.contains('visible')) {
    hide();
  } else {
    show();
  }
}

/**
 * Check if the hub is visible
 */
export function isVisible(): boolean {
  return state.overlay?.classList.contains('visible') ?? false;
}

// Export as singleton
export const lifeCoachingHub = {
  show,
  hide,
  toggle,
  isVisible,
};
