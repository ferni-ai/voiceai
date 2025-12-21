/**
 * Marketplace UI
 *
 * A beautiful modal interface for browsing and installing agents from the
 * VoiceAI Agents marketplace (similar to Claude MCP's marketplace).
 *
 * Features:
 * - Browse available agents by category
 * - Search agents by name, description, or tags
 * - Install/uninstall agents with one click
 * - View installed agents
 *
 * USAGE:
 *   import { openMarketplace, closeMarketplace } from './ui/marketplace.ui.js';
 *
 *   // Open the marketplace modal
 *   openMarketplace();
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getPersona, isKnownPersonaId } from '../config/personas.js';
import { t } from '../i18n/index.js';
import { marketplaceService, type MarketplaceAgent } from '../services/marketplace.service.js';
import { addTapListener, cleanupTapListeners } from '../utils/ios-touch.js';
import {
  rosterPreferences,
  type TeamMemberId as RosterTeamMemberId,
} from '../services/roster-preferences.service.js';
import {
  getMemberStatus,
  getTeamMember,
  isFullTeamUnlocked,
  isTeamMemberUnlocked,
  TEAM_MEMBERS,
  type TeamMemberId,
} from '../services/team-unlock.service.js';
import { appState } from '../state/app.state.js';
import type { PersonaId } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  requestPermissionConsent,
  type MarketplaceItem,
} from './marketplace-permission-consent.ui.js';
import { soundUI } from './sound.ui.js';
import { refreshMarketplaceAgents } from './team.ui.js';
import { 
  listCustomAgents, 
  deleteCustomAgent,
  type CustomAgent 
} from '../services/custom-agent.service.js';
import { openCustomAgentWizard } from './custom-agent-wizard.ui.js';

const log = createLogger('Marketplace');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// PERSONA COLORS - Use CSS variables from design system tokens.css
// Colors are applied via data-persona attribute on elements
// ============================================================================

/**
 * Get gradient for a persona using CSS variables.
 * Applies via data-persona attribute which sets --persona-primary and --persona-secondary.
 */
function getPersonaGradient(personaId: string): string {
  // External AI companies have their own brand colors defined in CSS
  const externalBrands = ['claude', 'gemini', 'gpt'];
  if (externalBrands.includes(personaId)) {
    return `var(--gradient-${personaId})`;
  }
  // Internal personas use the persona CSS variables
  return 'linear-gradient(135deg, var(--persona-secondary), var(--persona-primary))';
}

/**
 * Get glow color for avatar shadows using CSS variables.
 * External AI company brand colors are defined in design-system/tokens/colors.json
 */
function getPersonaGlow(personaId: string): string {
  // External AI companies use design token variables
  const externalBrands = ['claude', 'gemini', 'gpt'];
  if (externalBrands.includes(personaId)) {
    return `var(--external-${personaId}-glow)`;
  }
  return 'var(--persona-glow)';
}

// ============================================================================
// STATE
// ============================================================================

let marketplaceModal: HTMLElement | null = null;
let currentTab: 'browse' | 'installed' | 'creations' = 'browse';
let currentCategory: string | null = null;
let searchQuery = '';

// Loading state for marketplace UI
let isLoadingState = false;

/** Check if marketplace is loading */
export function isMarketplaceLoading(): boolean {
  return isLoadingState;
}

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

/**
 * Clean up any orphaned elements from HMR reloads
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('#marketplaceModal').forEach((el) => el.remove());
  document.querySelectorAll('.marketplace-modal').forEach((el) => el.remove());
  // Reset reference since we removed the element from DOM
  marketplaceModal = null;
}

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

/**
 * Announce a message to screen readers via ARIA live region.
 */
function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText =
    'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Create the marketplace modal element if it doesn't exist
 */
function ensureModalExists(): HTMLElement {
  // Check if existing modal is still in the document (not detached)
  if (marketplaceModal && document.body.contains(marketplaceModal)) {
    return marketplaceModal;
  }

  // HMR cleanup - only if we don't have a valid modal
  cleanupOrphanedElements();

  marketplaceModal = document.createElement('div');
  marketplaceModal.id = 'marketplaceModal';
  marketplaceModal.className = 'marketplace-modal';
  marketplaceModal.setAttribute('role', 'dialog');
  marketplaceModal.setAttribute('aria-labelledby', 'marketplace-title');
  marketplaceModal.setAttribute('aria-modal', 'true');
  marketplaceModal.innerHTML = `
    <div class="marketplace-backdrop" data-action="close"></div>
    <div class="marketplace-container">
      <header class="marketplace-header">
        <div class="marketplace-title-row">
          <h2 id="marketplace-title" class="marketplace-title">
            Expand your team.
          </h2>
          <button class="marketplace-close" data-action="close" aria-label="${t('common.close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="marketplace-subtitle">Find coaches who understand what you need.</p>
        
        <div class="marketplace-tabs">
          <button class="marketplace-tab active" data-tab="browse">
            Discover
          </button>
          <button class="marketplace-tab" data-tab="installed">
            Your Team
          </button>
          <button class="marketplace-tab" data-tab="creations">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            My Creations
          </button>
        </div>
        
        <div class="marketplace-search" data-tab-content="browse">
          <div class="search-input-wrapper">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="search" 
              class="marketplace-search-input" 
              placeholder="${t('placeholders.marketplaceSearch')}" 
              aria-label="${t('accessibility.searchCoaches')}"
            >
          </div>
          <select class="marketplace-category-select" aria-label="${t('accessibility.filterBySpecialty')}">
            <option value="">All specialties</option>
            <option value="mentorship">Mentorship</option>
            <option value="finance">Finance</option>
            <option value="health">Health & Wellness</option>
            <option value="productivity">Productivity</option>
            <option value="lifestyle">Lifestyle</option>
            <option value="education">Learning</option>
            <option value="entertainment">Entertainment</option>
          </select>
        </div>
      </header>
      
      <main class="marketplace-content">
        <div class="marketplace-loading">
          <div class="marketplace-spinner"></div>
          <span>Finding coaches...</span>
        </div>
        <div class="marketplace-grid" role="list" aria-label="${t('accessibility.availableCoaches')}"></div>
        <div class="marketplace-empty">
          <div class="empty-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12h8"></path>
              <path d="M12 8v8"></path>
            </svg>
          </div>
          <p class="empty-title">No matches yet</p>
          <p class="empty-hint">Try a different search or explore all coaches.</p>
        </div>
      </main>
      
      <footer class="marketplace-footer">
        <a href="https://ferni.ai/creators" target="_blank" rel="noopener noreferrer" class="marketplace-creator-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
            <path d="M5 3v4"/><path d="M3 5h4"/>
            <path d="M19 17v4"/><path d="M17 19h4"/>
          </svg>
          Become a creator
        </a>
        <span class="marketplace-powered-by">Powered by Ferni</span>
      </footer>
    </div>
  `;

  // Add event listeners
  // Use both click and touchend for reliable iOS support
  marketplaceModal.addEventListener('click', handleModalClick);
  marketplaceModal.addEventListener('touchend', handleModalTouch, { passive: false });
  marketplaceModal.addEventListener('keydown', handleModalKeydown);

  const searchInput = marketplaceModal.querySelector(
    '.marketplace-search-input'
  ) as HTMLInputElement;
  searchInput?.addEventListener(
    'input',
    debounce((e: unknown) => handleSearch(e as Event), 300)
  );

  const categorySelect = marketplaceModal.querySelector(
    '.marketplace-category-select'
  ) as HTMLSelectElement;
  categorySelect?.addEventListener('change', handleCategoryChange);

  // Add styles if not already present
  if (!document.getElementById('marketplace-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'marketplace-styles';
    styleSheet.textContent = getMarketplaceStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(marketplaceModal);
  return marketplaceModal;
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

/**
 * Open the marketplace modal
 */
export async function openMarketplace(): Promise<void> {
  const modal = ensureModalExists();

  // Reset state
  currentTab = 'browse';
  searchQuery = '';
  currentCategory = null;

  // Reset tab UI to match state (fixes bug where tab shows wrong selection)
  updateTabs();

  // Show modal
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Play sound
  soundUI.play('switch');

  // Focus trap
  const firstFocusable = modal.querySelector('button, input, select') as HTMLElement;
  firstFocusable?.focus();

  // Load content
  await refreshContent();
}

/**
 * Close the marketplace modal
 */
export function closeMarketplace(): void {
  if (!marketplaceModal) return;

  marketplaceModal.classList.remove('open');
  document.body.style.overflow = '';

  soundUI.play('switch');
}

/**
 * Toggle marketplace visibility
 */
export function toggleMarketplace(): void {
  if (marketplaceModal?.classList.contains('open')) {
    closeMarketplace();
  } else {
    void openMarketplace();
  }
}

// ============================================================================
// CONTENT RENDERING
// ============================================================================

/**
 * Refresh the marketplace content
 */
async function refreshContent(): Promise<void> {
  if (!marketplaceModal) return;

  setLoading(true);

  try {
    if (currentTab === 'browse') {
      await renderBrowseTab();
    } else if (currentTab === 'installed') {
      await renderInstalledTab();
    } else if (currentTab === 'creations') {
      await renderCreationsTab();
    }
  } catch (err) {
    log.error('❌ Marketplace: Failed to refresh content:', err);
    showEmpty('Failed to load agents');
  } finally {
    setLoading(false);
  }
}

/**
 * Render the browse tab content
 * Only shows agents NOT in the core team and NOT already installed
 * Marketplace agents are locked until the full team is unlocked
 */
async function renderBrowseTab(): Promise<void> {
  // Check if full team is unlocked - marketplace requires this
  if (!isFullTeamUnlocked()) {
    await renderTeamLockedMessage();
    return;
  }

  let agents: MarketplaceAgent[];

  if (searchQuery) {
    // Search filters out core team agents
    agents = await marketplaceService.searchAgents(searchQuery);
  } else if (currentCategory) {
    // Category filter also excludes core team agents
    agents = await marketplaceService.getAgentsByCategory(currentCategory);
  } else {
    // Default: only show agents available for installation (excludes core team)
    agents = await marketplaceService.getAvailableAgents();
  }

  const installedIds = marketplaceService.getInstalledAgentIds();

  if (agents.length === 0) {
    showEmpty('No new agents available');
    return;
  }

  renderAgentGrid(
    agents.map((agent) => ({
      ...agent,
      isInstalled: installedIds.has(agent.id),
    }))
  );
}

/**
 * Render a message explaining the marketplace is locked until team is unlocked
 * Now includes a tantalizing preview of available agents!
 */
async function renderTeamLockedMessage(): Promise<void> {
  const grid = marketplaceModal?.querySelector('.marketplace-grid');
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  if (!grid) return;
  if (empty) empty.style.display = 'none';

  // Fetch marketplace agents to show preview
  const registry = await marketplaceService.fetchRegistry();
  const availableAgents = registry.agents.slice(0, 6); // Show first 6 as preview
  const totalAgentCount = registry.agents.length;

  // Get unique categories
  const categories = [...new Set(registry.agents.map((a) => a.category))];
  const categoryLabels = categories.slice(0, 4).map((c) => getCategoryLabel(c));

  // Build progress indicators for each team member
  const memberProgressHtml = TEAM_MEMBERS.map((member) => {
    const status = getMemberStatus(member.id);
    const isUnlocked = status.unlocked;
    const progressPercent = Math.round(status.progress * 100);

    return `
      <div class="team-progress-member ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="team-progress-avatar" data-persona="${member.id}">
          ${member.displayName.slice(0, 2).toUpperCase()}
        </div>
        <span class="team-progress-name">${member.displayName}</span>
        ${
          isUnlocked
            ? '<svg class="team-progress-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : `<span class="team-progress-percent">${progressPercent}%</span>`
        }
      </div>
    `;
  }).join('');

  // Build preview cards for locked agents
  const previewCardsHtml = availableAgents
    .map((agent) => {
      const initials = agent.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      const gradient = getPersonaGradient(agent.id);

      return `
        <article class="marketplace-agent marketplace-agent--locked" data-agent-id="${agent.id}">
          <div class="agent-locked-overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="agent-header">
            <div class="agent-avatar" style="background: ${gradient};">
              ${initials}
            </div>
            <div class="agent-meta">
              <h3 class="agent-name">${agent.name}</h3>
              <span class="agent-category">${getCategoryLabel(agent.category)}</span>
            </div>
          </div>
          <p class="agent-description">${agent.short_description}</p>
          <div class="agent-tags">
            ${agent.tags
              .slice(0, 2)
              .map((tag) => `<span class="agent-tag">${tag}</span>`)
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');

  // Count remaining agents not shown in preview
  const moreAgentsCount = totalAgentCount - availableAgents.length;

  grid.innerHTML = `
    <section class="marketplace-locked-section">
      <div class="marketplace-locked-header">
        <div class="marketplace-locked-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div class="marketplace-locked-text">
          <h3 class="marketplace-locked-title">Meet your team first</h3>
          <p class="marketplace-locked-subtitle">
            ${totalAgentCount} coaches waiting for you
          </p>
        </div>
      </div>
      
      <div class="marketplace-locked-categories">
        ${categoryLabels.map((cat) => `<span class="locked-category-pill">${cat}</span>`).join('')}
        ${categories.length > 4 ? `<span class="locked-category-pill locked-category-more">+${categories.length - 4} more</span>` : ''}
      </div>
      
      <div class="marketplace-locked-progress">
        <p class="progress-label">Unlock progress</p>
        <div class="team-progress-grid">
          ${memberProgressHtml}
        </div>
      </div>
    </section>
    
    <div class="marketplace-preview-section">
      <div class="preview-header">
        <span class="preview-label">Coming soon</span>
        <span class="preview-hint">Complete your team journey to unlock</span>
      </div>
      <div class="marketplace-preview-grid">
        ${previewCardsHtml}
      </div>
      ${
        moreAgentsCount > 0
          ? `
        <div class="preview-more-hint">
          <span>+${moreAgentsCount} more coaches in ${categories.length} categories</span>
        </div>
      `
          : ''
      }
    </div>
  `;

  grid.setAttribute('style', 'display: block;');
}

/**
 * Render the installed tab content with "Meet the Team" narrative
 */
async function renderInstalledTab(): Promise<void> {
  const installed = marketplaceService.getInstalledAgents();
  const registry = await marketplaceService.fetchRegistry();
  const teamUnlocked = isFullTeamUnlocked();

  const grid = marketplaceModal?.querySelector('.marketplace-grid');
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  if (!grid) return;
  if (empty) empty.style.display = 'none';

  // Always show the team narrative first
  let html = renderTeamNarrative();

  // Show installed marketplace agents only if full team is unlocked
  if (installed.length > 0) {
    const agents = installed
      .map((installedAgent) => {
        const marketplaceAgent = registry.agents.find((a) => a.id === installedAgent.id);
        return marketplaceAgent
          ? {
              ...marketplaceAgent,
              isInstalled: true,
              installedAt: installedAgent.installed_at,
            }
          : null;
      })
      .filter(Boolean) as (MarketplaceAgent & { isInstalled: boolean; installedAt: string })[];

    if (agents.length > 0) {
      if (teamUnlocked) {
        // Full team unlocked - show installed marketplace agents
        html += `<div class="team-section-divider"><span>Your Installed Coaches</span></div>`;
        html += renderAgentCards(agents);
      } else {
        // Team not fully unlocked - show message about installed agents being locked
        html += `
          <div class="team-section-divider"><span>Installed Coaches</span></div>
          <div class="installed-agents-locked">
            <p class="installed-agents-locked-message">
              You have <strong>${agents.length} coach${agents.length > 1 ? 'es' : ''}</strong> installed. 
              They'll be ready to chat once you've met your whole core team!
            </p>
          </div>
        `;
      }
    }
  }

  grid.innerHTML = html;
  grid.setAttribute('style', 'display: block;');
}

/**
 * Render the "My Creations" tab showing user's custom agents
 */
async function renderCreationsTab(): Promise<void> {
  const grid = marketplaceModal?.querySelector('.marketplace-grid');
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  if (!grid) return;
  if (empty) empty.style.display = 'none';

  let customAgents: CustomAgent[] = [];
  try {
    customAgents = await listCustomAgents();
  } catch (err) {
    log.debug('Failed to fetch custom agents (API may not be ready):', err);
    // Continue with empty array - show create prompt
  }

  // Build the creations tab HTML
  const html = `
    <section class="creations-section">
      <div class="creations-header">
        <div class="creations-header-content">
          <h3 class="creations-title">Your Custom Agents</h3>
          <p class="creations-subtitle">Create companions with custom voices and personalities</p>
        </div>
        <button class="creations-create-btn" data-action="create-agent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Agent
        </button>
      </div>

      ${customAgents.length === 0 ? `
        <div class="creations-empty">
          <div class="creations-empty-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12h8"></path>
              <path d="M12 8v8"></path>
            </svg>
          </div>
          <h4 class="creations-empty-title">No agents yet</h4>
          <p class="creations-empty-hint">Create your first custom agent to preserve a loved one's voice, build a mentor, or design your own companion.</p>
          <button class="creations-empty-btn" data-action="create-agent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Your First Agent
          </button>
        </div>

        <div class="creations-types-preview">
          <h4 class="creations-types-title">What you can create</h4>
          <div class="creations-types-grid">
            <div class="creation-type-card">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2c.5 3.5 2 5.5 3.5 7 1.5 1.5 3.5 2.5 5.5 3-2 .5-4 1.5-5.5 3-1.5 1.5-3 3.5-3.5 7-.5-3.5-2-5.5-3.5-7-1.5-1.5-3.5-2.5-5.5-3 2-.5 4-1.5 5.5-3 1.5-1.5 3-3.5 3.5-7z"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Legacy</h5>
              <p class="creation-type-desc">Preserve the voice and wisdom of someone you cherish</p>
            </div>
            <div class="creation-type-card">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22c4-3 8-6 8-11a8 8 0 0 0-16 0c0 5 4 8 8 11z"/>
                  <circle cx="12" cy="11" r="3"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Mentor</h5>
              <p class="creation-type-desc">Create a coach based on an inspiring figure</p>
            </div>
            <div class="creation-type-card">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="10" r="3"/>
                  <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Digital Twin</h5>
              <p class="creation-type-desc">Your personal voice journal that grows with you</p>
            </div>
            <div class="creation-type-card">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Custom</h5>
              <p class="creation-type-desc">Build any personality from scratch</p>
            </div>
          </div>
        </div>
      ` : `
        <div class="creations-grid">
          ${customAgents.map(agent => renderCustomAgentCard(agent)).join('')}
        </div>
      `}
    </section>
  `;

  grid.innerHTML = html;
  grid.setAttribute('style', 'display: block;');

  // Attach event listeners for create buttons
  grid.querySelectorAll('[data-action="create-agent"]').forEach(btn => {
    btn.addEventListener('click', handleCreateAgentClick);
  });

  // Attach listeners for agent cards
  grid.querySelectorAll('.custom-agent-card').forEach(card => {
    card.addEventListener('click', handleCustomAgentCardClick);
  });

  grid.querySelectorAll('[data-action="delete-agent"]').forEach(btn => {
    btn.addEventListener('click', handleDeleteAgentClick);
  });

  // Journal button listeners for Digital Twin agents
  grid.querySelectorAll('[data-action="open-journal"]').forEach(btn => {
    btn.addEventListener('click', handleOpenJournalClick);
  });
}

/**
 * Render a custom agent card
 */
function renderCustomAgentCard(agent: CustomAgent): string {
  const statusClass = agent.status === 'active' ? 'status--active' : 
                      agent.status === 'paused' ? 'status--paused' : 'status--draft';
  const typeLabel = agent.type === 'legacy' ? 'Legacy' :
                    agent.type === 'mentor' ? 'Mentor' :
                    agent.type === 'twin' ? 'Digital Twin' :
                    agent.type === 'fictional' ? 'Fictional' :
                    agent.type === 'professional' ? 'Professional' : 'Custom';
  
  const initials = (agent.displayName || agent.name)
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const primaryColor = agent.colors?.primary || 'var(--persona-primary)';
  const gradient = agent.colors?.gradient || `linear-gradient(135deg, ${primaryColor}, ${primaryColor})`;

  return `
    <article class="custom-agent-card" data-agent-id="${agent.id}">
      <div class="custom-agent-header">
        <div class="custom-agent-avatar" style="background: ${gradient};">
          ${agent.icon || initials}
        </div>
        <div class="custom-agent-meta">
          <h3 class="custom-agent-name">${agent.displayName || agent.name}</h3>
          <span class="custom-agent-type">${typeLabel}</span>
        </div>
        <span class="custom-agent-status ${statusClass}">${agent.status}</span>
      </div>
      <p class="custom-agent-description">${agent.description}</p>
      <div class="custom-agent-stats">
        <span class="custom-agent-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          </svg>
          ${agent.voice?.status === 'ready' ? 'Voice ready' : agent.voice?.type === 'cloned' ? 'Voice pending' : 'No voice'}
        </span>
        <span class="custom-agent-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          ${(agent.memories?.stories?.length || 0) + (agent.memories?.wisdom?.length || 0)} memories
        </span>
      </div>
      <footer class="custom-agent-footer">
        ${agent.type === 'twin' ? `
          <button class="custom-agent-action custom-agent-action--journal" data-action="open-journal" data-agent-id="${agent.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Journal
          </button>
        ` : ''}
        <button class="custom-agent-action custom-agent-action--edit" data-agent-id="${agent.id}">
          Edit
        </button>
        <button class="custom-agent-action custom-agent-action--delete" data-action="delete-agent" data-agent-id="${agent.id}" aria-label="Delete ${agent.name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </footer>
    </article>
  `;
}

/**
 * Handle create agent button click
 */
function handleCreateAgentClick(e: Event): void {
  e.stopPropagation();
  closeMarketplace();
  // Small delay to let marketplace close animation complete
  trackedTimeout(() => {
    openCustomAgentWizard(false);
  }, 200);
  soundUI.play('click');
}

/**
 * Handle custom agent card click (open for editing)
 */
function handleCustomAgentCardClick(e: Event): void {
  const card = (e.currentTarget as HTMLElement);
  const agentId = card.dataset.agentId;
  if (agentId) {
    log.debug('Custom agent card clicked:', agentId);
    // TODO: Open agent editor
    soundUI.play('click');
  }
}

/**
 * Handle delete agent button click
 */
async function handleDeleteAgentClick(e: Event): Promise<void> {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const agentId = btn.dataset.agentId;
  
  if (!agentId) return;

  // Confirm deletion
  const confirmed = confirm('Are you sure you want to delete this agent? This cannot be undone.');
  if (!confirmed) return;

  try {
    await deleteCustomAgent(agentId);
    const { toast } = await import('./toast.ui.js');
    toast.success('Agent deleted');
    soundUI.play('success');
    // Refresh the tab
    void refreshContent();
  } catch (err) {
    log.error('Failed to delete agent:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't delete agent. Try again?");
  }
}

/**
 * Handle opening the voice journal for a Digital Twin agent.
 */
async function handleOpenJournalClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    // Open the voice journal UI
    const { openVoiceJournal } = await import('./voice-journal.ui.js');
    await openVoiceJournal(agentId);
  } catch (err) {
    log.error('Failed to open journal:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open journal. Try again?");
  }
}

/**
 * Render an employee card for the team narrative section.
 * FIX BUG: Shows locked state indicator for team members not yet unlocked.
 *
 * For unlocked members, shows roster management buttons:
 * - "In Roster" with remove option if already in roster
 * - "Add to Roster" if not in roster
 */
function renderEmployeeCard(
  personaId: string,
  initials: string,
  name: string,
  role: string
): string {
  const gradient = getPersonaGradient(personaId);
  const glow = getPersonaGlow(personaId);
  const avatarStyle = `background: ${gradient}; --avatar-glow: ${glow}; --avatar-primary: var(--persona-primary);`;

  // Check if this team member is locked
  const isLocked = !isTeamMemberUnlocked(personaId as TeamMemberId);
  const status = getMemberStatus(personaId as TeamMemberId);
  const lockedClass = isLocked ? 'employee-card--locked' : '';

  // Check if this team member is in the user's roster (for unlocked members)
  const isInRoster =
    !isLocked && rosterPreferences.isMemberVisible(personaId as RosterTeamMemberId);

  // Lock icon for locked members
  const lockIcon = isLocked
    ? `<div class="employee-lock-indicator" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>`
    : '';

  // Progress indicator for locked members with progress
  const progressRing =
    isLocked && status.progress > 0
      ? `<svg class="employee-progress-ring" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border-subtle, rgba(255,255,255,0.1))" stroke-width="2"/>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--persona-primary, #4a6741)" stroke-width="2"
            stroke-dasharray="${status.progress * 94}, 94"
            stroke-linecap="round"
            transform="rotate(-90 18 18)"/>
        </svg>`
      : '';

  // Roster action button for unlocked members (not Ferni - Ferni is always in roster)
  // Uses prominent +/- icons for clear add/remove affordance
  const rosterActionHtml =
    !isLocked && personaId !== 'ferni'
      ? isInRoster
        ? `<button class="employee-roster-action employee-roster-action--remove" data-roster-action="remove" data-persona-id="${personaId}" aria-label="Remove ${name} from roster">
          <svg class="roster-icon roster-icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg class="roster-icon roster-icon--minus" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span class="roster-label">In Team</span>
          <span class="roster-label roster-label--hover">Remove</span>
        </button>`
        : `<button class="employee-roster-action employee-roster-action--add" data-roster-action="add" data-persona-id="${personaId}" aria-label="Add ${name} to team">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add</span>
        </button>`
      : '';

  return `
    <div class="employee-card ${lockedClass}" data-persona="${personaId}" data-locked="${isLocked}" data-in-roster="${isInRoster}">
      <div class="employee-avatar-container">
        ${progressRing}
        <div class="employee-avatar${isLocked ? ' employee-avatar--locked' : ''}" style="${avatarStyle}">${initials}</div>
        ${lockIcon}
      </div>
      <span class="employee-name">${name}</span>
      <span class="employee-role">${role}</span>
      ${rosterActionHtml}
    </div>
  `;
}

/**
 * Render the "Meet the Team" narrative section
 * Meet your team - friends who truly understand.
 *
 * Uses CSS variables from design system tokens.css via data-persona attribute.
 * Each avatar now has a subtle ambient glow that matches its persona color.
 */
function renderTeamNarrative(): string {
  // Helper to get glow style for an avatar - uses CSS variables
  const getAvatarStyle = (personaId: string): string => {
    const gradient = getPersonaGradient(personaId);
    const glow = getPersonaGlow(personaId);
    return `background: ${gradient}; --avatar-glow: ${glow}; --avatar-primary: var(--persona-primary);`;
  };

  return `
    <section class="team-narrative">
      <div class="team-narrative-header">
        <h3 class="team-narrative-title">Meet your team.</h3>
        <p class="team-narrative-subtitle">Friends who truly understand.</p>
      </div>
      
      <div class="team-leadership">
        <div class="leadership-section">
          <span class="leadership-label">Chief Executive</span>
          <div class="leadership-grid ceo">
            <div class="leader-card ceo-card">
              <div class="leader-avatar" data-persona="ferni" style="${getAvatarStyle('ferni')}">
                FN
              </div>
              <div class="leader-info">
                <h4 class="leader-name">Ferni</h4>
                <span class="leader-title">CEO & Life Coach</span>
                <p class="leader-bio">The warm, wise presence at the heart of everything. Ferni coordinates the team with perfect memory, zero judgment, and constant presence.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="leadership-section">
          <span class="leadership-label">Co-Founders</span>
          <div class="leadership-grid cofounders">
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="claude" style="${getAvatarStyle('claude')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <span class="cofounder-name">Claude</span>
            </div>
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="gemini" style="${getAvatarStyle('gemini')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              </div>
              <span class="cofounder-name">Gemini</span>
            </div>
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="gpt" style="${getAvatarStyle('gpt')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/></svg>
              </div>
              <span class="cofounder-name">GPT</span>
            </div>
          </div>
        </div>
        
        <div class="leadership-section">
          <span class="leadership-label">Core Team</span>
          <div class="leadership-grid employees">
            ${renderEmployeeCard('peter-john', 'PJ', 'Peter', 'Research')}
            ${renderEmployeeCard('alex-chen', 'AC', 'Alex', 'Communication')}
            ${renderEmployeeCard('maya-santos', 'MS', 'Maya', 'Habits')}
            ${renderEmployeeCard('jordan-taylor', 'JT', 'Jordan', 'Planning')}
            ${renderEmployeeCard('nayan-patel', 'NP', 'Nayan', 'Wisdom')}
          </div>
        </div>
      </div>
      
      <p class="team-narrative-footer">
        Together, we're redefining what it means to have a team that truly listens.
      </p>
    </section>
  `;
}

/**
 * Render agent cards HTML (without the grid wrapper)
 * Shows install/uninstall buttons based on installation status
 *
 * Uses CSS custom properties for colors - allows design system to control appearance
 */
function renderAgentCards(agents: (MarketplaceAgent & { isInstalled: boolean })[]): string {
  return agents
    .map((agent, index) => {
      const initials = agent.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      // Use CSS variables via data-persona attribute - gradient comes from design system
      const gradient = getPersonaGradient(agent.id);
      const glow = getPersonaGlow(agent.id);

      // Determine state classes and button
      const stateClass = agent.isInstalled ? 'installed' : '';
      const badgeHtml = agent.isInstalled
        ? '<span class="agent-badge installed">Installed</span>'
        : '';
      const buttonHtml = agent.isInstalled
        ? `<button class="agent-action uninstall" data-agent-id="${agent.id}">Remove</button>`
        : `<button class="agent-action install" data-agent-id="${agent.id}">Add to Team</button>`;

      // Rating display
      const ratingHtml = agent.rating
        ? `<div class="agent-rating">
            <span class="rating-stars">${renderStars(agent.rating)}</span>
            <span class="rating-value">${agent.rating.toFixed(1)}</span>
            ${agent.reviewCount ? `<span class="rating-count">(${formatReviewCount(agent.reviewCount)})</span>` : ''}
          </div>`
        : '';

      // Staggered animation delay for breathing
      const animationDelay = (index % 6) * 0.5;

      return `
    <article class="marketplace-agent discover-card ${stateClass}" data-agent-id="${agent.id}" data-persona="${agent.id}" role="listitem" style="--stagger-delay: ${animationDelay}s;">
      <div class="discover-avatar-container">
        <div class="discover-avatar-ring" style="--avatar-glow: ${glow};"></div>
        <div class="discover-avatar-orb" style="background: ${gradient}; --avatar-glow: ${glow};">
          ${initials}
        </div>
      </div>
      <div class="discover-info">
        <h3 class="agent-name">${agent.name}</h3>
        <span class="agent-category">${getCategoryLabel(agent.category)}</span>
        ${ratingHtml}
        ${badgeHtml}
      </div>
      <p class="agent-description">${agent.short_description}</p>
      <div class="agent-tags">
        ${agent.tags
          .slice(0, 3)
          .map((tag) => `<span class="agent-tag">${tag}</span>`)
          .join('')}
      </div>
      <footer class="agent-footer">
        <span class="agent-author">by ${agent.author}</span>
        ${buttonHtml}
      </footer>
    </article>
    `;
    })
    .join('');
}

/**
 * Render the agent grid (for browse tab)
 */
function renderAgentGrid(agents: (MarketplaceAgent & { isInstalled: boolean })[]): void {
  const grid = marketplaceModal?.querySelector('.marketplace-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="agent-grid-wrapper">${renderAgentCards(agents)}</div>`;

  // Show the grid
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;
  if (empty) empty.style.display = 'none';
  grid.setAttribute('style', 'display: grid;');
}

/**
 * Show the empty state with warm, human messaging
 */
function showEmpty(message: string): void {
  const grid = marketplaceModal?.querySelector('.marketplace-grid') as HTMLElement;
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  if (grid) grid.style.display = 'none';
  if (empty) {
    // Update title with friendly message
    const title = empty.querySelector('.empty-title');
    const hint = empty.querySelector('.empty-hint');

    if (title) {
      title.textContent =
        message === 'No agents installed yet' ? 'Your team awaits.' : 'No matches yet.';
    }
    if (hint) {
      hint.textContent =
        message === 'No agents installed yet'
          ? 'Discover coaches who can help with what matters to you.'
          : 'Try a different search or explore all coaches.';
    }
    empty.style.display = 'flex';
  }
}

/**
 * Render star rating icons
 */
function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const starIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" class="star-icon">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;

  const halfStarIcon = `<svg width="12" height="12" viewBox="0 0 24 24" class="star-icon star-half">
    <defs>
      <linearGradient id="half-star">
        <stop offset="50%" stop-color="currentColor"/>
        <stop offset="50%" stop-color="transparent"/>
      </linearGradient>
    </defs>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#half-star)" stroke="currentColor" stroke-width="1"/>
  </svg>`;

  const emptyStarIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="star-icon star-empty">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;

  return (
    starIcon.repeat(fullStars) +
    (hasHalfStar ? halfStarIcon : '') +
    emptyStarIcon.repeat(emptyStars)
  );
}

/**
 * Format review count for display
 */
function formatReviewCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

/**
 * Set loading state with accessibility announcements
 */
function setLoading(loading: boolean): void {
  isLoadingState = loading;
  const loadingEl = marketplaceModal?.querySelector('.marketplace-loading') as HTMLElement;
  const gridEl = marketplaceModal?.querySelector('.marketplace-grid') as HTMLElement;
  const emptyEl = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  // Set aria-busy on the modal content
  marketplaceModal?.setAttribute('aria-busy', loading ? 'true' : 'false');

  if (loading) {
    if (loadingEl) loadingEl.style.display = 'flex';
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    announceToScreenReader('Loading marketplace...');
  } else {
    if (loadingEl) loadingEl.style.display = 'none';
    announceToScreenReader('Marketplace loaded');
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleModalClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Close button or backdrop
  if (target.closest('[data-action="close"]')) {
    closeMarketplace();
    return;
  }

  // Tab switching
  const tab = target.closest('[data-tab]') as HTMLElement;
  if (tab) {
    const tabName = tab.dataset.tab as 'browse' | 'installed' | 'creations';
    if (tabName !== currentTab) {
      currentTab = tabName;
      updateTabs();
      void refreshContent();
    }
    return;
  }

  // Roster add/remove action buttons on employee cards
  const rosterActionBtn = target.closest('[data-roster-action]') as HTMLElement;
  if (rosterActionBtn) {
    e.stopPropagation(); // Prevent triggering employee card click
    const action = rosterActionBtn.dataset.rosterAction;
    const personaId = rosterActionBtn.dataset.personaId;
    if (action && personaId) {
      void handleRosterAction(action as 'add' | 'remove', personaId);
    }
    return;
  }

  // FIX BUG: Handle employee-card clicks in the team narrative section
  // These are the core team members (Peter, Alex, Maya, Jordan, Nayan)
  const employeeCard = target.closest('.employee-card') as HTMLElement;
  if (employeeCard) {
    const personaId = employeeCard.dataset.persona;
    if (personaId) {
      void handleEmployeeCardClick(personaId);
    }
    return;
  }

  // Handle leader-card clicks (CEO Ferni, and co-founders)
  const leaderCard = target.closest('.leader-card') as HTMLElement;
  if (leaderCard) {
    const personaId = leaderCard.querySelector('[data-persona]')?.getAttribute('data-persona');
    if (personaId && personaId === 'ferni') {
      void handleEmployeeCardClick(personaId);
    }
    return;
  }

  // Agent install/uninstall
  const actionBtn = target.closest('.agent-action') as HTMLElement;
  if (actionBtn) {
    const agentId = actionBtn.dataset.agentId;
    if (!agentId) return;

    void handleAgentAction(agentId, actionBtn.classList.contains('uninstall'));
    return;
  }

  // Agent card click (show detail view)
  const agentCard = target.closest('.marketplace-agent') as HTMLElement;
  if (agentCard && !target.closest('.agent-action')) {
    const agentId = agentCard.dataset.agentId;
    if (agentId) {
      void showAgentDetail(agentId);
    }
    return;
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeMarketplace();
  }
}

/**
 * Handle touch events for iOS Safari compatibility
 * iOS sometimes doesn't fire click events properly on dynamically created elements
 */
function handleModalTouch(e: TouchEvent): void {
  const target = e.target as HTMLElement;

  // Only handle single-finger taps
  if (e.touches && e.touches.length > 1) return;

  // Check if tapping close button or backdrop
  if (target.closest('[data-action="close"]')) {
    e.preventDefault();
    closeMarketplace();
    return;
  }

  // Check if tapping a tab
  const tab = target.closest('[data-tab]') as HTMLElement;
  if (tab) {
    e.preventDefault();
    const tabName = tab.dataset.tab as 'browse' | 'installed' | 'creations';
    if (tabName !== currentTab) {
      currentTab = tabName;
      updateTabs();
      void refreshContent();
    }
    return;
  }

  // Roster add/remove action buttons on employee cards (iOS touch)
  const rosterActionBtn = target.closest('[data-roster-action]') as HTMLElement;
  if (rosterActionBtn) {
    e.preventDefault();
    const action = rosterActionBtn.dataset.rosterAction;
    const personaId = rosterActionBtn.dataset.personaId;
    if (action && personaId) {
      void handleRosterAction(action as 'add' | 'remove', personaId);
    }
    return;
  }

  // FIX BUG: Handle employee-card taps in the team narrative section
  const employeeCard = target.closest('.employee-card') as HTMLElement;
  if (employeeCard) {
    e.preventDefault();
    const personaId = employeeCard.dataset.persona;
    if (personaId) {
      void handleEmployeeCardClick(personaId);
    }
    return;
  }

  // Handle leader-card taps (CEO Ferni)
  const leaderCard = target.closest('.leader-card') as HTMLElement;
  if (leaderCard) {
    e.preventDefault();
    const personaId = leaderCard.querySelector('[data-persona]')?.getAttribute('data-persona');
    if (personaId && personaId === 'ferni') {
      void handleEmployeeCardClick(personaId);
    }
    return;
  }

  // Check if tapping agent action button
  const actionBtn = target.closest('.agent-action') as HTMLElement;
  if (actionBtn) {
    e.preventDefault();
    const agentId = actionBtn.dataset.agentId;
    if (!agentId) return;
    void handleAgentAction(agentId, actionBtn.classList.contains('uninstall'));
    return;
  }

  // Check if tapping agent card (show detail view)
  const agentCard = target.closest('.marketplace-agent') as HTMLElement;
  if (agentCard && !target.closest('.agent-action')) {
    e.preventDefault();
    const agentId = agentCard.dataset.agentId;
    if (agentId) {
      void showAgentDetail(agentId);
    }
    return;
  }
}

/**
 * Handle clicks on employee cards in the team narrative section.
 * This allows users to tap on core team members to preview or handoff.
 *
 * FIX BUG: Employee cards in marketplace narrative now support clicking.
 */
async function handleEmployeeCardClick(personaId: string): Promise<void> {
  log.debug('Employee card clicked:', personaId);

  // Validate persona ID
  if (!isKnownPersonaId(personaId as PersonaId)) {
    log.warn('Unknown persona ID clicked:', personaId);
    return;
  }

  // Check if this persona is locked (Ferni is always unlocked)
  const isLocked = personaId !== 'ferni' && !isTeamMemberUnlocked(personaId as TeamMemberId);

  if (isLocked) {
    // Show locked member feedback
    const memberConfig = getTeamMember(personaId as TeamMemberId);
    const name = memberConfig?.displayName || personaId;
    const message =
      memberConfig?.teaserMessage ||
      `${name} isn't available yet. Keep talking to Ferni to unlock more teammates!`;

    // Import toast dynamically to avoid circular dependency
    const { toast } = await import('./toast.ui.js');
    toast.info(message);
    soundUI.play('click');
    return;
  }

  const connectionState = appState.get('connection');

  if (connectionState === 'connected') {
    // Send handoff request when connected via handoffService
    // This ensures rate limiting, validation, retry logic, and proper state management
    log.debug('Connected - sending handoff request to:', personaId);

    const { handoffService } = await import('../services/handoff.service.js');
    const { toast } = await import('./toast.ui.js');

    const success = await handoffService.sendHandoffRequest(personaId as PersonaId, {
      onFailure: (error) => {
        log.error('Handoff request failed:', error);
        // Warm brand voice for error message
        toast.error("Hmm, that didn't work. Want to try again?");
        soundUI.play('click');
      },
    });

    if (success) {
      log.info('Handoff request sent from marketplace to:', personaId);
      soundUI.play('switch');
      // Close marketplace after initiating handoff
      closeMarketplace();
    } else {
      // Rate limited or validation failed - handoffService already handled notifications
      log.debug('Handoff request not sent (rate limited or invalid)');
    }
  } else {
    // Preview the persona theme when disconnected
    log.debug('Not connected - previewing theme for:', personaId);

    const persona = getPersona(personaId as PersonaId);

    // Update selectedPersona for when Connect is clicked
    appState.set('selectedPersona', persona);
    appState.set('activePersona', persona);

    // Update document theme
    document.body.setAttribute('data-persona', personaId);

    // Update waveform theme
    void import('../ui/waveform.ui.js').then(({ waveformUI }) => {
      waveformUI.setPersona(personaId as PersonaId);
    });

    // Update coach UI
    void import('../ui/coach.ui.js').then(({ coachUI }) => {
      coachUI.updatePersona(persona);
    });

    soundUI.play('switch');

    // Close marketplace to show the updated theme
    closeMarketplace();
  }
}

/**
 * Handle roster add/remove actions for team members.
 * Allows users to manage which unlocked team members appear in their roster.
 */
async function handleRosterAction(action: 'add' | 'remove', personaId: string): Promise<void> {
  log.debug('Roster action:', { action, personaId });

  const { toast } = await import('./toast.ui.js');
  const memberConfig = getTeamMember(personaId as TeamMemberId);
  const name = memberConfig?.displayName || personaId;

  if (action === 'add') {
    rosterPreferences.addMember(personaId as RosterTeamMemberId);
    soundUI.play('success');
    toast.success(`${name} added to your team`);
    log.info('Added team member to roster from marketplace:', personaId);
  } else {
    rosterPreferences.removeMember(personaId as RosterTeamMemberId);
    soundUI.play('click');
    toast.info(`${name} removed from team`);
    log.info('Removed team member from roster from marketplace:', personaId);
  }

  // Refresh both marketplace content (to update button state) and team roster
  await refreshContent();

  // Dispatch event to trigger roster rebuild
  // team.ui.ts listens for this event and rebuilds the roster
  document.dispatchEvent(new CustomEvent('ferni:roster-changed'));
}

function handleSearch(e: Event): void {
  const input = e.target as HTMLInputElement;
  searchQuery = input.value.trim();
  void refreshContent();
}

function handleCategoryChange(e: Event): void {
  const select = e.target as HTMLSelectElement;
  currentCategory = select.value || null;
  void refreshContent();
}

async function handleAgentAction(agentId: string, isUninstall: boolean): Promise<void> {
  try {
    if (isUninstall) {
      marketplaceService.uninstallAgent(agentId);
      soundUI.play('disconnect');
    } else {
      // Get agent details for permission consent
      const registry = await marketplaceService.fetchRegistry();
      const agent = registry.agents.find((a) => a.id === agentId);

      if (agent) {
        // Request permission consent before installing
        const consentItem: MarketplaceItem = {
          id: agent.id,
          name: agent.name,
          type: 'agent',
          publisher: {
            name: agent.author,
            verified: false, // TODO: Get from registry
          },
          trustLevel: 'community', // TODO: Get from registry
          permissions: {
            required: [], // TODO: Get from agent manifest
            optional: [],
          },
        };

        const consent = await requestPermissionConsent(consentItem);

        if (!consent.granted) {
          log.info(`User declined to install agent: ${agentId}`);
          return;
        }

        log.info(`User granted permissions for ${agentId}:`, consent.permissions);
      }

      await marketplaceService.installAgent(agentId);
      soundUI.play('success');
    }

    // Refresh both marketplace content and team roster
    await refreshContent();
    await refreshMarketplaceAgents();

    log.info(`✅ ${isUninstall ? 'Uninstalled' : 'Installed'} agent: ${agentId}`);
  } catch (err) {
    log.error(`❌ Marketplace: Failed to ${isUninstall ? 'uninstall' : 'install'} agent:`, err);
  }
}

function updateTabs(): void {
  const tabs = marketplaceModal?.querySelectorAll('.marketplace-tab');
  tabs?.forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === currentTab);
  });

  // Toggle search visibility
  const searchEl = marketplaceModal?.querySelector('.marketplace-search') as HTMLElement;
  if (searchEl) {
    searchEl.style.display = currentTab === 'browse' ? 'flex' : 'none';
  }
}

// ============================================================================
// AGENT DETAIL VIEW
// ============================================================================

interface AgentReview {
  id: string;
  userId: string;
  userName?: string;
  rating: number;
  title?: string;
  body: string;
  createdAt: string;
  helpfulCount: number;
  publisherResponse?: {
    body: string;
    respondedAt: string;
  };
}

interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

let detailPanel: HTMLElement | null = null;

/**
 * Show the detail view for an agent with reviews
 */
async function showAgentDetail(agentId: string): Promise<void> {
  try {
    const registry = await marketplaceService.fetchRegistry();
    const agent = registry.agents.find((a) => a.id === agentId);

    if (!agent) {
      log.warn(`Agent not found: ${agentId}`);
      return;
    }

    // Fetch reviews (mock for now - would call API)
    const reviews = await fetchAgentReviews(agentId);
    const stats = await fetchAgentReviewStats(agentId);
    const isInstalled = marketplaceService.isAgentInstalled(agentId);

    // Create or update detail panel
    renderDetailPanel(agent, reviews, stats, isInstalled);

    soundUI.play('switch');
  } catch (err) {
    log.error('Failed to load agent details:', err);
  }
}

/**
 * Fetch reviews for an agent (calls API)
 */
async function fetchAgentReviews(agentId: string): Promise<AgentReview[]> {
  try {
    const response = await fetch(`/api/marketplace/reviews/${agentId}?limit=10&status=approved`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.reviews || [];
  } catch {
    return [];
  }
}

/**
 * Fetch review stats for an agent
 */
async function fetchAgentReviewStats(agentId: string): Promise<ReviewStats> {
  try {
    const response = await fetch(`/api/marketplace/reviews/${agentId}/stats`);
    if (!response.ok) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }
    return await response.json();
  } catch {
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
}

/**
 * Render the detail panel
 */
function renderDetailPanel(
  agent: MarketplaceAgent,
  reviews: AgentReview[],
  stats: ReviewStats,
  isInstalled: boolean
): void {
  // Remove existing panel
  if (detailPanel) {
    detailPanel.remove();
  }

  const initials = agent.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const gradient = getPersonaGradient(agent.id);

  detailPanel = document.createElement('div');
  detailPanel.className = 'marketplace-detail';
  detailPanel.setAttribute('role', 'dialog');
  detailPanel.setAttribute('aria-labelledby', 'detail-title');

  detailPanel.innerHTML = `
    <div class="detail-backdrop"></div>
    <div class="detail-panel">
      <button class="detail-close" aria-label="${t('accessibility.closeDetails')}">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <header class="detail-header">
        <div class="detail-avatar" style="background: ${gradient};">${initials}</div>
        <div class="detail-meta">
          <h2 id="detail-title" class="detail-name">${agent.name}</h2>
          <p class="detail-category">${getCategoryLabel(agent.category)}</p>
          ${
            stats.totalReviews > 0
              ? `
            <div class="detail-rating">
              <span class="detail-stars">${renderStars(stats.averageRating)}</span>
              <span class="detail-rating-value">${stats.averageRating.toFixed(1)}</span>
              <span class="detail-rating-count">(${stats.totalReviews} ${stats.totalReviews === 1 ? 'review' : 'reviews'})</span>
            </div>
          `
              : ''
          }
        </div>
      </header>

      <div class="detail-content">
        <section class="detail-section">
          <h3 class="detail-section-title">About</h3>
          <p class="detail-description">${agent.description || agent.short_description}</p>
          <p class="detail-author">Created by ${agent.author}</p>
        </section>

        ${
          agent.tags.length > 0
            ? `
          <section class="detail-section">
            <h3 class="detail-section-title">Specialties</h3>
            <div class="detail-tags">
              ${agent.tags.map((tag) => `<span class="detail-tag">${tag}</span>`).join('')}
            </div>
          </section>
        `
            : ''
        }

        <section class="detail-section">
          <h3 class="detail-section-title">Reviews</h3>
          ${
            reviews.length > 0
              ? `
            <div class="detail-reviews">
              ${reviews.map((review) => renderReviewCard(review)).join('')}
            </div>
          `
              : `
            <p class="detail-empty-reviews">No reviews yet. Be the first to share your experience!</p>
          `
          }
        </section>
      </div>

      <footer class="detail-footer">
        <button class="detail-action ${isInstalled ? 'uninstall' : 'install'}" data-agent-id="${agent.id}">
          ${isInstalled ? 'Remove from Team' : 'Add to Team'}
        </button>
      </footer>
    </div>
  `;

  // Add styles
  if (!document.getElementById('marketplace-detail-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'marketplace-detail-styles';
    styleSheet.textContent = getDetailStyles();
    document.head.appendChild(styleSheet);
  }

  // Add event listeners (iOS-compatible)
  addTapListener(detailPanel.querySelector('.detail-backdrop'), closeDetailPanel);
  addTapListener(detailPanel.querySelector('.detail-close'), closeDetailPanel);

  const actionBtn = detailPanel.querySelector('.detail-action') as HTMLElement;
  addTapListener(actionBtn, () => {
    const agentId = actionBtn?.dataset.agentId;
    if (agentId) {
      closeDetailPanel();
      void handleAgentAction(agentId, actionBtn.classList.contains('uninstall'));
    }
  });

  document.body.appendChild(detailPanel);

  // Animate in
  requestAnimationFrame(() => {
    detailPanel?.classList.add('open');
  });
}

/**
 * Close the detail panel
 */
function closeDetailPanel(): void {
  if (!detailPanel) return;

  detailPanel.classList.remove('open');
  soundUI.play('switch');

  // Clean up iOS tap listeners before removing
  cleanupTapListeners(detailPanel);

  trackedTimeout(() => {
    detailPanel?.remove();
    detailPanel = null;
  }, DURATION.SLOW);
}

/**
 * Render a review card
 */
function renderReviewCard(review: AgentReview): string {
  const date = new Date(review.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `
    <article class="review-card">
      <header class="review-header">
        <div class="review-rating">${renderStars(review.rating)}</div>
        <span class="review-date">${date}</span>
      </header>
      ${review.title ? `<h4 class="review-title">${review.title}</h4>` : ''}
      <p class="review-body">${review.body}</p>
      ${
        review.helpfulCount > 0
          ? `
        <div class="review-helpful">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
          ${review.helpfulCount} found this helpful
        </div>
      `
          : ''
      }
      ${
        review.publisherResponse
          ? `
        <div class="review-response">
          <p class="review-response-label">Response from creator:</p>
          <p class="review-response-body">${review.publisherResponse.body}</p>
        </div>
      `
          : ''
      }
    </article>
  `;
}

/**
 * Get styles for the detail panel
 */
function getDetailStyles(): string {
  return `
    .marketplace-detail {
      position: fixed;
      inset: 0;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .marketplace-detail.open {
      opacity: 1;
      pointer-events: auto;
    }

    .detail-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(12px);
    }

    .detail-panel {
      position: relative;
      width: 90%;
      max-width: 480px;
      max-height: 85vh;
      background: var(--color-background-elevated, #1a1614);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .marketplace-detail.open .detail-panel {
      transform: scale(1);
    }

    .detail-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${DURATION.FAST}ms;
      z-index: 1;
    }

    .detail-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .detail-header {
      display: flex;
      gap: 16px;
      padding: 24px;
      border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    .detail-avatar {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
    }

    .detail-meta {
      flex: 1;
      min-width: 0;
    }

    .detail-name {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, rgba(255, 255, 255, 0.95));
      margin: 0 0 4px;
    }

    .detail-category {
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-warm-amber, #C4A265);
      margin: 0 0 8px;
    }

    .detail-rating {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .detail-stars {
      display: flex;
      color: var(--color-warm-amber, #C4A265);
    }

    .detail-rating-value {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .detail-rating-count {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
    }

    .detail-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
    }

    .detail-section {
      margin-bottom: 24px;
    }

    .detail-section:last-child {
      margin-bottom: 0;
    }

    .detail-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin: 0 0 12px;
    }

    .detail-description {
      color: var(--color-text-primary);
      line-height: 1.6;
      margin: 0 0 8px;
    }

    .detail-author {
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      margin: 0;
    }

    .detail-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .detail-tag {
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }

    .detail-reviews {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .detail-empty-reviews {
      color: var(--color-text-secondary);
      font-style: italic;
      text-align: center;
      padding: 20px;
    }

    .review-card {
      padding: 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
    }

    .review-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .review-rating {
      display: flex;
      color: var(--color-warm-amber, #C4A265);
    }

    .review-date {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    .review-title {
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 6px;
      font-size: 0.95rem;
    }

    .review-body {
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0;
      font-size: 0.9rem;
    }

    .review-helpful {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .review-response {
      margin-top: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      border-left: 3px solid var(--color-warm-amber, #C4A265);
    }

    .review-response-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--color-warm-amber);
      margin: 0 0 6px;
    }

    .review-response-body {
      color: var(--color-text-secondary);
      font-size: 0.85rem;
      line-height: 1.5;
      margin: 0;
    }

    .detail-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    .detail-action {
      width: 100%;
      padding: 14px 24px;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms, opacity ${DURATION.FAST}ms;
    }

    .detail-action.install {
      background: var(--color-primary, #4a6741);
      color: white;
    }

    .detail-action.uninstall {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--color-text-secondary);
    }

    .detail-action:hover {
      transform: scale(1.02);
    }

    .detail-action:active {
      transform: scale(0.98);
    }

    /* Zen theme */
    [data-theme="zen"] .detail-panel {
      background: var(--color-background-elevated, #FFFDFB);
    }

    [data-theme="zen"] .detail-close {
      background: rgba(44, 37, 32, 0.08);
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .detail-name,
    [data-theme="zen"] .detail-description {
      color: rgba(44, 37, 32, 0.9);
    }

    [data-theme="zen"] .detail-category,
    [data-theme="zen"] .detail-author,
    [data-theme="zen"] .detail-rating-count,
    [data-theme="zen"] .detail-section-title,
    [data-theme="zen"] .review-body,
    [data-theme="zen"] .review-date {
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .detail-tag,
    [data-theme="zen"] .review-card {
      background: rgba(44, 37, 32, 0.04);
    }

    [data-theme="zen"] .review-title {
      color: rgba(44, 37, 32, 0.9);
    }

    [data-theme="zen"] .detail-action.uninstall {
      border-color: rgba(44, 37, 32, 0.2);
      color: rgba(44, 37, 32, 0.7);
    }
  `;
}

// ============================================================================
// UTILITIES
// ============================================================================

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    mentorship: 'Mentorship',
    finance: 'Finance',
    health: 'Health',
    productivity: 'Productivity',
    lifestyle: 'Lifestyle',
    education: 'Education',
    entertainment: 'Entertainment',
    custom: 'Custom',
  };
  return labels[category] || category;
}

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = trackedTimeout(() => fn(...args), delay);
  };
}

// ============================================================================
// STYLES
// ============================================================================

function getMarketplaceStyles(): string {
  return `
    /* External AI Company Brand Colors */
    :root {
      --gradient-claude: linear-gradient(135deg, #CC785C 0%, #D97757 100%);
      --gradient-gemini: linear-gradient(135deg, #4285F4 0%, #8AB4F8 100%);
      --gradient-gpt: linear-gradient(135deg, #0D9373 0%, #10A37F 100%);
    }
    
    .marketplace-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .marketplace-modal.open {
      opacity: 1;
      visibility: visible;
    }

    .marketplace-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      /* iOS touch fix - make backdrop recognize taps */
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .marketplace-container {
      position: relative;
      width: 90vw;
      max-width: 900px;
      max-height: 85vh;
      background: var(--color-bg-elevated, #1a1a1a);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.95);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT}, 
                  opacity ${DURATION.SLOW}ms ease;
    }

    .marketplace-modal.open .marketplace-container {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    /* Header */
    .marketplace-header {
      padding: var(--space-lg, 24px) var(--space-lg, 24px) var(--space-md, 16px);
      border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    .marketplace-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xs, 4px);
    }

    .marketplace-title {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text, #fff);
      margin: 0;
    }

    .marketplace-close {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full, 50%);
      background: transparent;
      border: none;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      /* iOS touch fixes */
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    .marketplace-close:hover {
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.08));
      color: var(--color-text, #fff);
      transform: rotate(90deg);
    }

    .marketplace-close:active {
      transform: rotate(90deg) scale(0.95);
    }

    .marketplace-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 var(--space-lg, 20px);
    }

    /* Tabs - Pill style per brand */
    .marketplace-tabs {
      display: flex;
      gap: var(--space-xs, 8px);
      margin-bottom: var(--space-md, 16px);
    }

    .marketplace-tab {
      padding: 10px 20px;
      border-radius: 9999px;
      background: transparent;
      border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.12));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .marketplace-tab:hover {
      border-color: var(--color-text-muted, rgba(255, 255, 255, 0.25));
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      color: var(--color-text, #fff);
    }

    .marketplace-tab.active {
      background: var(--persona-primary, var(--color-accent-primary, #3D5A45));
      border-color: var(--persona-primary, var(--color-accent-primary, #3D5A45));
      color: var(--persona-text, white);
    }

    .marketplace-tab:active {
      transform: scale(0.98);
    }

    /* Search */
    .marketplace-search {
      display: flex;
      gap: var(--space-sm, 12px);
    }

    .search-input-wrapper {
      flex: 1;
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
      pointer-events: none;
    }

    .marketplace-search-input {
      width: 100%;
      padding: 12px 16px 12px 44px;
      border-radius: var(--radius-lg, 12px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.05));
      border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.1));
      color: var(--color-text, #fff);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .marketplace-search-input:focus {
      border-color: var(--persona-primary, var(--color-accent-primary));
      box-shadow: 0 0 0 3px var(--persona-glow, var(--color-accent-glow));
    }

    .marketplace-search-input::placeholder {
      color: var(--color-text-muted, rgba(255, 255, 255, 0.35));
    }

    .marketplace-category-select {
      padding: 12px 16px;
      padding-right: 36px;
      border-radius: var(--radius-lg, 12px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.05));
      border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.1));
      color: var(--color-text, #fff);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.875rem;
      cursor: pointer;
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: all 0.2s ease;
    }

    .marketplace-category-select:focus {
      border-color: var(--persona-primary, var(--color-accent-primary));
    }

    .marketplace-category-select option {
      background: var(--color-bg-elevated, #1a1a1a);
      color: var(--color-text, #fff);
    }

    /* Content */
    .marketplace-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }

    .marketplace-loading,
    .marketplace-empty {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-2xl, 64px) var(--space-lg, 24px);
      text-align: center;
    }

    .marketplace-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      border-top-color: var(--persona-primary, var(--color-accent-primary));
      border-radius: 50%;
      animation: spin var(--duration-deliberate, 800ms) linear infinite;
      margin-bottom: var(--space-4, 16px);
    }

    .marketplace-loading span {
      font-family: 'Inter', var(--font-body, sans-serif);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: 0.9rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ========================================
       DISCOVER AVATARS - Landing Page Style
       Pixar-inspired breathing, floating, glowing
       ======================================== */

    /* Breathing animation - everything alive breathes (Pixar principle) */
    @keyframes avatar-breathe {
      0%, 100% {
        transform: scale3d(1, 1, 1) translateY(0);
      }
      40% {
        transform: scale3d(0.994, 1.012, 1) translateY(-2px);
      }
      50% {
        transform: scale3d(0.994, 1.012, 1) translateY(-2px);
      }
      90% {
        transform: scale3d(1, 1, 1) translateY(0);
      }
    }

    /* Ring pulse animation - gentle glow */
    @keyframes ring-pulse {
      0%, 100% {
        opacity: 0.15;
        transform: scale(1);
      }
      50% {
        opacity: 0.35;
        transform: scale(1.04);
      }
    }

    /* Float animation - like balloons in Up */
    @keyframes avatar-float {
      0%, 100% {
        transform: translateY(0) rotate(0deg);
      }
      25% {
        transform: translateY(-6px) rotate(0.5deg);
      }
      50% {
        transform: translateY(-10px) rotate(-0.3deg);
      }
      75% {
        transform: translateY(-4px) rotate(0.3deg);
      }
    }

    /* Glow pulse on hover */
    @keyframes glow-pulse {
      0%, 100% {
        box-shadow: 
          0 0 0 0 var(--avatar-glow, rgba(74, 103, 65, 0)),
          0 4px 20px rgba(0, 0, 0, 0.15);
      }
      50% {
        box-shadow: 
          0 0 30px 8px var(--avatar-glow, rgba(74, 103, 65, 0.35)),
          0 8px 32px rgba(0, 0, 0, 0.2);
      }
    }

    .empty-illustration {
      margin-bottom: var(--space-md, 16px);
    }

    .empty-title {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-xs, 8px);
    }

    .empty-hint {
      font-family: 'Inter', var(--font-body, sans-serif);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
      margin: 0;
    }

    /* Agent Grid with staggered animation */
    .marketplace-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md, 16px);
    }

    /* Staggered entrance animation */
    .marketplace-agent {
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-lg, 24px);
      transition: all ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      animation: cardEntrance ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} backwards;
    }

    /* ========================================
       DISCOVER CARD - Circle Avatar Layout
       ======================================== */
    .marketplace-agent.discover-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-xl, 32px) var(--space-lg, 24px);
      background: linear-gradient(145deg, 
        var(--color-bg-subtle, rgba(255, 255, 255, 0.04)) 0%,
        var(--color-bg-elevated, rgba(255, 255, 255, 0.02)) 100%
      );
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.06));
      border-radius: var(--radius-2xl, 24px);
    }

    /* Discover avatar container - holds ring and orb */
    .discover-avatar-container {
      position: relative;
      width: 88px;
      height: 88px;
      margin-bottom: var(--space-md, 16px);
      animation: avatar-float 8s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
      animation-delay: var(--stagger-delay, 0s);
    }

    /* Glowing ring behind avatar */
    .discover-avatar-ring {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      background: radial-gradient(circle, var(--avatar-glow, rgba(74, 103, 65, 0.25)) 0%, transparent 70%);
      opacity: 0.15;
      animation: ring-pulse 4s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
      animation-delay: var(--stagger-delay, 0s);
      pointer-events: none;
    }

    /* The circular avatar orb */
    .discover-avatar-orb {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.4rem;
      font-weight: 700;
      color: white;
      letter-spacing: 0.02em;
      box-shadow: 
        0 4px 20px rgba(0, 0, 0, 0.15),
        0 2px 8px rgba(0, 0, 0, 0.1),
        0 0 0 3px rgba(255, 255, 255, 0.08) inset;
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
      animation-delay: var(--stagger-delay, 0s);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.SLOW}ms ease;
    }

    /* Hover state - excited breathing and glow */
    .marketplace-agent.discover-card:hover .discover-avatar-orb {
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite,
                 glow-pulse 2s ease-in-out infinite;
      transform: scale(1.08);
    }

    .marketplace-agent.discover-card:hover .discover-avatar-ring {
      opacity: 0.5;
      animation: ring-pulse 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
    }

    /* Discover info section */
    .discover-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: var(--space-sm, 12px);
    }

    .discover-card .agent-name {
      font-size: 1.15rem;
      margin: 0;
    }

    .discover-card .agent-category {
      font-size: 0.7rem;
    }

    .discover-card .agent-badge {
      margin-top: var(--space-xs, 8px);
    }

    .discover-card .agent-description {
      text-align: center;
      -webkit-line-clamp: 3;
    }

    .discover-card .agent-tags {
      justify-content: center;
    }

    .discover-card .agent-footer {
      width: 100%;
      flex-direction: column;
      gap: var(--space-sm, 12px);
      align-items: center;
    }

    .discover-card .agent-action {
      width: 100%;
      max-width: 180px;
    }

    .marketplace-agent:nth-child(1) { animation-delay: 0ms; }
    .marketplace-agent:nth-child(2) { animation-delay: 50ms; }
    .marketplace-agent:nth-child(3) { animation-delay: 100ms; }
    .marketplace-agent:nth-child(4) { animation-delay: 150ms; }
    .marketplace-agent:nth-child(5) { animation-delay: 200ms; }
    .marketplace-agent:nth-child(6) { animation-delay: 250ms; }
    .marketplace-agent:nth-child(n+7) { animation-delay: 300ms; }

    @keyframes cardEntrance {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .marketplace-agent:hover {
      border-color: var(--color-border-hover, rgba(255, 255, 255, 0.18));
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
    }

    .marketplace-agent.discover-card:hover {
      transform: translateY(-6px);
      border-color: var(--persona-primary, rgba(74, 103, 65, 0.4));
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
    }

    .marketplace-agent.installed {
      border-color: var(--persona-primary, var(--color-accent-primary));
      background: var(--persona-tint, var(--color-accent-subtle));
    }

    .marketplace-agent.discover-card.installed {
      background: linear-gradient(145deg, 
        var(--persona-tint, rgba(74, 103, 65, 0.08)) 0%,
        var(--color-bg-elevated, rgba(255, 255, 255, 0.02)) 100%
      );
    }

    /* Coming Soon state - disabled look */
    .marketplace-agent.coming-soon {
      opacity: 0.75;
      pointer-events: auto;
    }

    .marketplace-agent.coming-soon:hover {
      transform: none;
      box-shadow: none;
      border-color: var(--color-border, rgba(255, 255, 255, 0.08));
    }

    /* Reduced motion - respect user preferences */
    /* Reduced motion - respect user preferences */
    @media (prefers-reduced-motion: reduce) {
      .discover-avatar-container,
      .discover-avatar-orb,
      .discover-avatar-ring,
      .agent-avatar,
      .custom-agent-avatar,
      .ceo-card .leader-avatar,
      .employee-avatar,
      .cofounder-avatar {
        animation: none;
      }
      
      .marketplace-agent.discover-card:hover .discover-avatar-orb,
      .marketplace-agent.discover-card:hover .discover-avatar-ring,
      .marketplace-agent:hover .agent-avatar,
      .custom-agent-card:hover .custom-agent-avatar,
      .ceo-card:hover .leader-avatar {
        animation: none;
      }
    }

    .agent-badge.coming-soon-badge {
      background: var(--color-semantic-warning-glow, rgba(196, 162, 101, 0.15));
      color: var(--color-semantic-warning, #C4A265);
      border: 1px solid var(--color-semantic-warning-glow, rgba(196, 162, 101, 0.25));
    }

    .agent-action.coming-soon-btn {
      background: transparent;
      border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.12));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
      cursor: not-allowed;
      opacity: 0.6;
    }

    .agent-action.coming-soon-btn:hover {
      background: transparent;
      transform: none;
      box-shadow: none;
    }

    .agent-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-sm, 12px);
    }

    .agent-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%; /* Circular - no more rounded squares! */
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.1rem;
      font-weight: 700;
      color: white;
      letter-spacing: 0.02em;
      /* Professional layered shadow with persona glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 4px 8px rgba(0, 0, 0, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.1) inset,
        0 6px 18px -4px var(--agent-secondary, rgba(0, 0, 0, 0.25));
      flex-shrink: 0;
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
      /* Breathing animation - Pixar principle: everything alive breathes */
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
    }

    .marketplace-agent:hover .agent-avatar {
      transform: scale(1.08);
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 8px 16px rgba(0, 0, 0, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.15) inset,
        0 10px 28px -4px var(--agent-secondary, rgba(0, 0, 0, 0.35)),
        0 0 18px -2px var(--agent-secondary, rgba(0, 0, 0, 0.2));
    }

    .agent-meta {
      flex: 1;
      min-width: 0;
    }

    .agent-name {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--color-text, #fff);
      margin: 0 0 4px;
    }

    .agent-category {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-warm-amber, #C4A265);
    }

    .agent-rating {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }

    .rating-stars {
      display: flex;
      align-items: center;
      color: var(--color-warm-amber, #C4A265);
    }

    .star-icon {
      width: 12px;
      height: 12px;
    }

    .star-empty {
      opacity: 0.3;
    }

    .rating-value {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-primary, rgba(255, 255, 255, 0.9));
    }

    .rating-count {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.5));
    }

    .agent-badge {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.65rem;
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .agent-badge.installed {
      background: var(--persona-primary, var(--color-accent-primary));
      color: var(--persona-text, white);
    }

    .agent-description {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.875rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.7));
      line-height: 1.5;
      margin: 0 0 var(--space-sm, 12px);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .agent-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-md, 16px);
    }

    .agent-tag {
      font-size: 0.7rem;
      padding: 4px 10px;
      border-radius: var(--radius-full, 20px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.08));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.7));
    }

    .agent-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--space-sm, 14px);
      margin-top: var(--space-sm, 14px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
    }

    .agent-author {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    /* Brand pill buttons */
    .agent-action {
      padding: 10px 20px;
      border-radius: 9999px;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .agent-action.install {
      background: var(--persona-primary, var(--color-accent-primary));
      border: none;
      color: var(--persona-text, white);
      box-shadow: 0 2px 8px var(--persona-glow, var(--color-accent-glow));
    }

    .agent-action.install:hover {
      background: var(--persona-secondary, var(--color-accent-hover));
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--persona-glow, var(--color-accent-glow));
    }

    .agent-action.install:active {
      transform: scale(0.98);
    }

    .agent-action.uninstall {
      background: transparent;
      border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.15));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
    }

    .agent-action.uninstall:hover {
      border-color: var(--color-semantic-error-glow, rgba(204, 68, 68, 0.5));
      color: var(--color-semantic-error, #e57373);
      background: var(--color-semantic-error-glow, rgba(204, 68, 68, 0.08));
    }

    .agent-action.uninstall:active {
      transform: scale(0.98);
    }

    /* Footer */
    .marketplace-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      background: var(--color-bg-subtle, rgba(0, 0, 0, 0.15));
    }

    .marketplace-creator-link {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 8px);
      font-family: 'Inter', var(--font-body, sans-serif);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      text-decoration: none;
      font-size: 0.85rem;
      transition: color 0.2s ease;
    }

    .marketplace-creator-link:hover {
      color: var(--color-text, #fff);
    }

    .marketplace-creator-link svg {
      opacity: 0.7;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .marketplace-creator-link:hover svg {
      opacity: 1;
      transform: scale(1.1);
    }

    .marketplace-powered-by {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    /* Agent grid wrapper */
    .agent-grid-wrapper {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md, 16px);
    }

    /* Team section divider */
    .team-section-divider {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      margin: var(--space-xl, 32px) 0 var(--space-lg, 24px);
    }

    .team-section-divider::before,
    .team-section-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .team-section-divider span {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    /* ========================================
       MEET THE TEAM - AI Company Narrative
       ======================================== */
    .team-narrative {
      padding: var(--space-6, 24px);
      background: linear-gradient(135deg, 
        var(--persona-tint, rgba(61, 90, 69, 0.08)) 0%, 
        var(--color-semantic-warning-glow, rgba(196, 162, 101, 0.05)) 100%
      );
      border-radius: var(--radius-xl, 16px);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
      margin-bottom: var(--space-6, 24px);
    }

    .team-narrative-header {
      text-align: center;
      margin-bottom: var(--space-xl, 32px);
    }

    .team-narrative-title {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-xs, 8px);
    }

    .team-narrative-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 1rem;
      color: var(--color-warm-amber, #C4A265);
      margin: 0;
    }

    .team-leadership {
      display: flex;
      flex-direction: column;
      gap: var(--space-xl, 32px);
    }

    .leadership-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
    }

    .leadership-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    .leadership-grid {
      display: flex;
      justify-content: center;
      gap: var(--space-md, 16px);
      flex-wrap: wrap;
    }

    /* CEO Card - Prominent */
    .ceo-card {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
      max-width: 400px;
    }

    .ceo-card .leader-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%; /* Circular - no more rounded squares! */
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      /* Layered shadow for depth + persona-specific glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.1),
        0 4px 8px rgba(0, 0, 0, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.1) inset,
        0 6px 20px -4px var(--avatar-glow, rgba(74, 103, 65, 0.4));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
      /* Breathing animation - Pixar principle: everything alive breathes */
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
    }
    
    .ceo-card:hover .leader-avatar {
      transform: scale(1.06);
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 8px 16px rgba(0, 0, 0, 0.1),
        0 0 0 2px rgba(255, 255, 255, 0.15) inset,
        0 10px 30px -4px var(--avatar-glow, rgba(74, 103, 65, 0.5)),
        0 0 20px -2px var(--avatar-glow, rgba(74, 103, 65, 0.3));
    }

    .leader-info {
      text-align: left;
    }

    .leader-name {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 2px;
    }

    .leader-title {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-warm-amber, #C4A265);
      display: block;
      margin-bottom: var(--space-xs, 8px);
    }

    .leader-bio {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      line-height: 1.5;
      margin: 0;
    }

    /* Co-founders - Compact row */
    .leadership-grid.cofounders {
      gap: var(--space-lg, 24px);
    }

    .leader-card.cofounder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 8px);
    }

    .cofounder-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%; /* Already circular - good! */
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      /* Layered shadow for depth + persona-specific glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 3px 6px rgba(0, 0, 0, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.1) inset,
        0 4px 16px -3px var(--avatar-glow, rgba(0, 0, 0, 0.25));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
      /* Breathing animation - Pixar principle: everything alive breathes */
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
    }
    
    /* Stagger animations for co-founders */
    .leader-card.cofounder:nth-child(1) .cofounder-avatar { animation-delay: 0s; }
    .leader-card.cofounder:nth-child(2) .cofounder-avatar { animation-delay: 0.4s; }
    .leader-card.cofounder:nth-child(3) .cofounder-avatar { animation-delay: 0.8s; }
    
    .leader-card.cofounder:hover .cofounder-avatar {
      transform: scale(1.1);
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 6px 12px rgba(0, 0, 0, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.15) inset,
        0 8px 24px -3px var(--avatar-glow, rgba(0, 0, 0, 0.35)),
        0 0 16px -2px var(--avatar-glow, rgba(0, 0, 0, 0.2));
    }

    .cofounder-name {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.7));
    }

    /* Core Team - Employee cards */
    .leadership-grid.employees {
      gap: var(--space-sm, 12px);
    }

    .employee-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: var(--space-sm, 12px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      border-radius: var(--radius-md, 10px);
      min-width: 70px;
      transition: all 0.2s ease;
    }

    .employee-card:hover {
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.06));
      transform: translateY(-2px);
    }

    .employee-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%; /* Already circular - good! */
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 0.8rem;
      font-weight: 700;
      color: white;
      /* Layered shadow for depth + persona-specific glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.06),
        0 2px 4px rgba(0, 0, 0, 0.05),
        0 0 0 2px rgba(255, 255, 255, 0.08) inset,
        0 3px 12px -2px var(--avatar-glow, rgba(0, 0, 0, 0.2));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
      /* Breathing animation - Pixar principle: everything alive breathes */
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
      /* Stagger animation for each team member */
      animation-delay: calc(var(--employee-index, 0) * 0.3s);
    }
    
    .employee-card:hover .employee-avatar {
      transform: scale(1.12);
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.08),
        0 4px 8px rgba(0, 0, 0, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.12) inset,
        0 6px 18px -2px var(--avatar-glow, rgba(0, 0, 0, 0.3)),
        0 0 14px -2px var(--avatar-glow, rgba(0, 0, 0, 0.15));
    }

    .employee-name {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--color-text, #fff);
    }

    .employee-role {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.65rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    /* Locked employee card styles - FIX BUG: Visual locked indicators */
    .employee-avatar-container {
      position: relative;
      display: inline-block;
    }

    .employee-card--locked {
      opacity: 0.7;
      cursor: pointer;
    }

    .employee-card--locked:hover {
      opacity: 0.85;
    }

    .employee-avatar--locked {
      filter: grayscale(40%);
    }

    .employee-lock-indicator {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-bg-elevated, rgba(50, 45, 40, 0.9));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .employee-progress-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 48px;
      height: 48px;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    /* Roster action buttons for unlocked team members */
    .employee-roster-action {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-top: 6px;
      padding: 6px 10px;
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      min-width: 70px;
    }

    .employee-roster-action svg {
      flex-shrink: 0;
    }

    /* Icon toggle system for remove button */
    .roster-icon--minus,
    .roster-label--hover {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-icon--check {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-icon--minus {
      display: block;
    }

    .employee-roster-action--remove:hover .roster-label {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-label--hover {
      display: inline;
    }

    /* "In Team" state - shows current status with checkmark */
    .employee-roster-action--remove {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .employee-roster-action--remove:hover {
      background: var(--color-error, #c75450);
    }

    /* "Add" state - prominent action button with + icon */
    .employee-roster-action--add {
      background: transparent;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
      border: 1.5px dashed var(--color-border, rgba(255, 255, 255, 0.25));
    }

    .employee-roster-action--add:hover {
      background: var(--persona-primary, #4a6741);
      color: white;
      border-style: solid;
      border-color: var(--persona-primary, #4a6741);
      transform: scale(1.05);
    }

    /* Hide roster action for cards being clicked/tapped */
    .employee-card:active .employee-roster-action {
      pointer-events: none;
    }

    /* Zen theme roster action styles */
    [data-theme="zen"] .employee-roster-action--add {
      color: rgba(44, 37, 32, 0.7);
      border-color: rgba(44, 37, 32, 0.25);
    }

    [data-theme="zen"] .employee-roster-action--add:hover {
      background: var(--persona-primary, #4a6741);
      color: white;
      border-color: var(--persona-primary, #4a6741);
    }

    [data-theme="zen"] .employee-roster-action--remove:hover {
      background: var(--color-error, #c75450);
    }

    .team-narrative-footer {
      text-align: center;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      font-style: italic;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      margin: var(--space-xl, 32px) 0 0;
      padding-top: var(--space-lg, 24px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    /* ========================================
       ZEN THEME OVERRIDES - Light mode styles
       ======================================== */
    [data-theme="zen"] .marketplace-container {
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(44, 37, 32, 0.1);
      box-shadow: 
        0 25px 50px -12px rgba(44, 37, 32, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.8) inset;
    }

    [data-theme="zen"] .marketplace-header {
      border-bottom-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .marketplace-title {
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-subtitle {
      color: rgba(44, 37, 32, 0.65);
    }

    [data-theme="zen"] .marketplace-close {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .marketplace-close:hover {
      background: rgba(44, 37, 32, 0.08);
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-tab {
      background: transparent;
      border-color: rgba(44, 37, 32, 0.15);
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .marketplace-tab:hover {
      background: rgba(44, 37, 32, 0.05);
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-tab.active {
      background: var(--persona-primary, #4a6741);
      border-color: var(--color-text-secondary);
      color: white;
    }

    [data-theme="zen"] .marketplace-search-input {
      background: rgba(44, 37, 32, 0.04);
      border-color: rgba(44, 37, 32, 0.12);
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-search-input::placeholder {
      color: rgba(44, 37, 32, 0.4);
    }

    [data-theme="zen"] .marketplace-search-input:focus {
      border-color: var(--color-text-secondary);
    }

    [data-theme="zen"] .marketplace-category-select {
      background: rgba(44, 37, 32, 0.04);
      border-color: rgba(44, 37, 32, 0.12);
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-category-select option {
      background: white;
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-loading,
    [data-theme="zen"] .marketplace-empty {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .marketplace-spinner {
      border-color: rgba(44, 37, 32, 0.1);
      border-top-color: var(--color-text-secondary);
    }

    [data-theme="zen"] .marketplace-agent {
      background: rgba(44, 37, 32, 0.02);
      border-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .marketplace-agent:hover {
      border-color: rgba(44, 37, 32, 0.15);
      box-shadow: 0 10px 25px -5px rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .marketplace-agent.installed {
      border-color: var(--color-text-secondary);
      background: rgba(74, 103, 65, 0.06);
    }

    /* Zen theme - Discover cards with circular avatars */
    [data-theme="zen"] .marketplace-agent.discover-card {
      background: linear-gradient(145deg, 
        rgba(255, 255, 255, 0.9) 0%,
        rgba(245, 241, 232, 0.95) 100%
      );
      border-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .marketplace-agent.discover-card:hover {
      border-color: var(--persona-primary, rgba(74, 103, 65, 0.4));
      box-shadow: 0 16px 40px rgba(44, 37, 32, 0.12);
    }

    [data-theme="zen"] .discover-avatar-orb {
      box-shadow: 
        0 4px 20px rgba(44, 37, 32, 0.1),
        0 2px 8px rgba(44, 37, 32, 0.08),
        0 0 0 3px rgba(255, 255, 255, 0.5) inset;
    }

    [data-theme="zen"] .marketplace-agent.discover-card:hover .discover-avatar-orb {
      box-shadow: 
        0 8px 32px rgba(44, 37, 32, 0.15),
        0 4px 16px rgba(44, 37, 32, 0.1),
        0 0 0 3px rgba(255, 255, 255, 0.6) inset,
        0 0 20px 6px var(--avatar-glow, rgba(74, 103, 65, 0.25));
    }

    [data-theme="zen"] .discover-avatar-ring {
      background: radial-gradient(circle, var(--avatar-glow, rgba(74, 103, 65, 0.2)) 0%, transparent 70%);
    }

    [data-theme="zen"] .marketplace-agent.discover-card.installed {
      background: linear-gradient(145deg, 
        rgba(74, 103, 65, 0.08) 0%,
        rgba(245, 241, 232, 0.95) 100%
      );
      border-color: var(--persona-primary, rgba(74, 103, 65, 0.3));
    }

    [data-theme="zen"] .agent-name {
      color: #2c2520;
    }

    /* Zen theme - Circular locked preview avatars */
    [data-theme="zen"] .agent-avatar {
      box-shadow: 
        0 1px 2px rgba(44, 37, 32, 0.08),
        0 4px 8px rgba(44, 37, 32, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.4) inset,
        0 6px 18px -4px var(--agent-secondary, rgba(44, 37, 32, 0.2));
    }

    [data-theme="zen"] .marketplace-agent:hover .agent-avatar {
      box-shadow: 
        0 2px 4px rgba(44, 37, 32, 0.1),
        0 8px 16px rgba(44, 37, 32, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.5) inset,
        0 10px 28px -4px var(--agent-secondary, rgba(44, 37, 32, 0.3)),
        0 0 18px -2px var(--agent-secondary, rgba(44, 37, 32, 0.15));
    }

    [data-theme="zen"] .agent-category {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .agent-rating .rating-stars {
      color: var(--color-warm-amber, #B8956A);
    }

    [data-theme="zen"] .agent-rating .rating-value {
      color: rgba(44, 37, 32, 0.9);
    }

    [data-theme="zen"] .agent-rating .rating-count {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .agent-description {
      color: rgba(44, 37, 32, 0.7);
    }

    [data-theme="zen"] .agent-tag {
      background: rgba(44, 37, 32, 0.06);
      color: rgba(44, 37, 32, 0.7);
    }

    [data-theme="zen"] .agent-footer {
      border-top-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .agent-author {
      color: rgba(44, 37, 32, 0.45);
    }

    [data-theme="zen"] .agent-action.uninstall {
      border-color: rgba(44, 37, 32, 0.2);
      color: rgba(44, 37, 32, 0.7);
    }

    [data-theme="zen"] .marketplace-footer {
      border-top-color: rgba(44, 37, 32, 0.1);
      background: rgba(44, 37, 32, 0.03);
    }

    [data-theme="zen"] .marketplace-creator-link {
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .marketplace-creator-link:hover {
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-powered-by {
      color: rgba(44, 37, 32, 0.4);
    }

    /* Zen theme - Team Narrative section (Your Team tab) */
    [data-theme="zen"] .team-narrative {
      background: linear-gradient(135deg, 
        rgba(74, 103, 65, 0.08) 0%, 
        rgba(196, 162, 101, 0.06) 100%
      );
      border-color: rgba(44, 37, 32, 0.12);
    }

    [data-theme="zen"] .team-narrative-title {
      color: #2c2520;
    }

    [data-theme="zen"] .team-narrative-subtitle {
      color: rgba(74, 103, 65, 0.9);
    }

    [data-theme="zen"] .leadership-label {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .ceo-card {
      background: rgba(44, 37, 32, 0.04);
      border-color: rgba(44, 37, 32, 0.1);
    }

    /* Zen theme - Circular CEO avatar */
    [data-theme="zen"] .ceo-card .leader-avatar {
      box-shadow: 
        0 1px 2px rgba(44, 37, 32, 0.08),
        0 4px 8px rgba(44, 37, 32, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.4) inset,
        0 6px 20px -4px var(--avatar-glow, rgba(74, 103, 65, 0.3));
    }

    [data-theme="zen"] .ceo-card:hover .leader-avatar {
      box-shadow: 
        0 2px 4px rgba(44, 37, 32, 0.1),
        0 8px 16px rgba(44, 37, 32, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.5) inset,
        0 10px 30px -4px var(--avatar-glow, rgba(74, 103, 65, 0.4)),
        0 0 20px -2px var(--avatar-glow, rgba(74, 103, 65, 0.25));
    }

    [data-theme="zen"] .leader-name {
      color: #2c2520;
    }

    [data-theme="zen"] .leader-title {
      color: rgba(74, 103, 65, 0.85);
    }

    [data-theme="zen"] .leader-bio {
      color: rgba(44, 37, 32, 0.7);
    }

    [data-theme="zen"] .cofounder-name {
      color: rgba(44, 37, 32, 0.75);
    }

    [data-theme="zen"] .employee-card {
      background: rgba(44, 37, 32, 0.03);
    }

    [data-theme="zen"] .employee-card:hover {
      background: rgba(44, 37, 32, 0.06);
    }

    [data-theme="zen"] .employee-name {
      color: #2c2520;
    }

    [data-theme="zen"] .employee-role {
      color: rgba(44, 37, 32, 0.55);
    }

    [data-theme="zen"] .team-narrative-footer {
      color: rgba(44, 37, 32, 0.6);
      border-top-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .team-section-divider::before,
    [data-theme="zen"] .team-section-divider::after {
      background: rgba(44, 37, 32, 0.15);
    }

    [data-theme="zen"] .team-section-divider span {
      color: rgba(44, 37, 32, 0.5);
    }

    /* Zen theme - Coming Soon state */
    [data-theme="zen"] .agent-badge.coming-soon-badge {
      background: rgba(196, 162, 101, 0.12);
      color: rgba(139, 115, 65, 0.9);
      border-color: rgba(196, 162, 101, 0.25);
    }

    [data-theme="zen"] .agent-action.coming-soon-btn {
      border-color: rgba(44, 37, 32, 0.15);
      color: rgba(44, 37, 32, 0.4);
    }

    /* ========================================
       MARKETPLACE LOCKED - Team unlock required
       With preview of available agents
       ======================================== */
    .marketplace-locked-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-lg, 24px);
      background: linear-gradient(135deg, 
        var(--color-bg-subtle, rgba(255, 255, 255, 0.03)) 0%,
        var(--persona-tint, rgba(74, 103, 65, 0.05)) 100%
      );
      border-radius: var(--radius-xl, 16px);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      margin-bottom: var(--space-lg, 24px);
    }

    .marketplace-locked-header {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      margin-bottom: var(--space-md, 16px);
    }

    .marketplace-locked-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--color-warm-amber, #C4A265);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      flex-shrink: 0;
    }

    .marketplace-locked-text {
      text-align: left;
    }

    .marketplace-locked-title {
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text, #fff);
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }

    .marketplace-locked-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-warm-amber, #C4A265);
      margin: 0;
    }

    .marketplace-locked-categories {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: var(--space-md, 16px);
    }

    .locked-category-pill {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 9999px;
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.05));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .locked-category-more {
      background: transparent;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
      border-style: dashed;
    }

    .marketplace-locked-progress {
      width: 100%;
      padding-top: var(--space-md, 16px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    .progress-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
      margin: 0 0 var(--space-sm, 12px);
    }

    .team-progress-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-sm, 12px);
    }

    .team-progress-member {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: var(--space-xs, 8px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      border-radius: var(--radius-md, 10px);
      min-width: 64px;
      transition: all 0.2s ease;
    }

    .team-progress-member.unlocked {
      background: var(--persona-tint, rgba(74, 103, 65, 0.15));
      border: 1px solid var(--persona-primary, rgba(74, 103, 65, 0.3));
    }

    .team-progress-member.locked {
      opacity: 0.6;
    }

    .team-progress-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 0.75rem;
      font-weight: 700;
      color: white;
    }

    .team-progress-member.locked .team-progress-avatar {
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.1));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .team-progress-name {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--color-text, #fff);
    }

    .team-progress-check {
      color: var(--persona-primary, #4a6741);
    }

    .team-progress-percent {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--color-warm-amber, #C4A265);
    }

    /* Preview Section - Teaser of locked agents */
    .marketplace-preview-section {
      margin-top: var(--space-md, 16px);
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 16px);
    }

    .preview-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-warm-amber, #C4A265);
      padding: 4px 10px;
      background: var(--color-semantic-warning-glow, rgba(196, 162, 101, 0.1));
      border-radius: 9999px;
    }

    .preview-hint {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    .marketplace-preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-md, 16px);
    }

    /* Locked Agent Card */
    .marketplace-agent--locked {
      position: relative;
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.02));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-md, 16px);
      overflow: hidden;
      pointer-events: none;
    }

    .marketplace-agent--locked::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        135deg,
        transparent 0%,
        var(--color-bg-elevated, rgba(26, 26, 26, 0.4)) 100%
      );
      backdrop-filter: blur(1px);
      z-index: 1;
    }

    .marketplace-agent--locked .agent-header,
    .marketplace-agent--locked .agent-description,
    .marketplace-agent--locked .agent-tags {
      opacity: 0.5;
    }

    .agent-locked-overlay {
      position: absolute;
      top: var(--space-sm, 12px);
      right: var(--space-sm, 12px);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--color-bg-elevated, rgba(26, 26, 26, 0.9));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-warm-amber, #C4A265);
      z-index: 2;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .preview-more-hint {
      text-align: center;
      margin-top: var(--space-lg, 24px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.02));
      border-radius: var(--radius-lg, 12px);
      border: 1px dashed var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .preview-more-hint span {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .marketplace-locked-hint {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
      margin: 0;
      font-style: italic;
    }

    /* Installed agents locked message (when team not fully unlocked) */
    .installed-agents-locked {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      border-radius: var(--radius-lg, 12px);
      border: 1px dashed var(--color-border, rgba(255, 255, 255, 0.15));
      text-align: center;
    }

    .installed-agents-locked-message {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      margin: 0;
      line-height: 1.5;
    }

    .installed-agents-locked-message strong {
      color: var(--color-warm-amber, #C4A265);
    }

    [data-theme="zen"] .installed-agents-locked {
      background: rgba(44, 37, 32, 0.03);
      border-color: rgba(44, 37, 32, 0.15);
    }

    [data-theme="zen"] .installed-agents-locked-message {
      color: rgba(44, 37, 32, 0.65);
    }

    [data-theme="zen"] .installed-agents-locked-message strong {
      color: rgba(139, 115, 65, 0.9);
    }

    /* Zen theme - Marketplace Locked */
    [data-theme="zen"] .marketplace-locked-section {
      background: linear-gradient(135deg, 
        rgba(44, 37, 32, 0.03) 0%,
        rgba(74, 103, 65, 0.06) 100%
      );
      border-color: rgba(44, 37, 32, 0.12);
    }

    [data-theme="zen"] .marketplace-locked-icon {
      background: rgba(139, 115, 65, 0.9);
      color: white;
    }

    [data-theme="zen"] .marketplace-locked-title {
      color: #2c2520;
    }

    [data-theme="zen"] .marketplace-locked-subtitle {
      color: rgba(139, 115, 65, 0.9);
    }

    [data-theme="zen"] .locked-category-pill {
      background: rgba(44, 37, 32, 0.05);
      border-color: rgba(44, 37, 32, 0.12);
      color: rgba(44, 37, 32, 0.7);
    }

    [data-theme="zen"] .locked-category-more {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .marketplace-locked-progress {
      border-top-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .progress-label {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .team-progress-member {
      background: rgba(44, 37, 32, 0.04);
    }

    [data-theme="zen"] .team-progress-member.unlocked {
      background: rgba(74, 103, 65, 0.1);
      border-color: rgba(74, 103, 65, 0.25);
    }

    [data-theme="zen"] .team-progress-member.locked .team-progress-avatar {
      background: rgba(44, 37, 32, 0.08);
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .team-progress-name {
      color: #2c2520;
    }

    [data-theme="zen"] .team-progress-percent {
      color: rgba(139, 115, 65, 0.9);
    }

    [data-theme="zen"] .marketplace-locked-hint {
      color: rgba(44, 37, 32, 0.5);
    }

    /* Zen theme - Preview Section */
    [data-theme="zen"] .preview-label {
      background: rgba(139, 115, 65, 0.12);
      color: rgba(139, 115, 65, 0.95);
    }

    [data-theme="zen"] .preview-hint {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .marketplace-agent--locked {
      background: rgba(44, 37, 32, 0.02);
      border-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .marketplace-agent--locked::before {
      background: linear-gradient(
        135deg,
        transparent 0%,
        rgba(255, 255, 255, 0.5) 100%
      );
    }

    [data-theme="zen"] .agent-locked-overlay {
      background: rgba(255, 255, 255, 0.95);
      color: rgba(139, 115, 65, 0.9);
      box-shadow: 0 2px 8px rgba(44, 37, 32, 0.15);
    }

    [data-theme="zen"] .preview-more-hint {
      background: rgba(44, 37, 32, 0.02);
      border-color: rgba(44, 37, 32, 0.12);
    }

    [data-theme="zen"] .preview-more-hint span {
      color: rgba(44, 37, 32, 0.6);
    }

    /* Zen theme mobile close button */
    @media (max-width: 640px) {
      [data-theme="zen"] .marketplace-close {
        background: rgba(44, 37, 32, 0.08);
      }

      [data-theme="zen"] .marketplace-close:hover {
        background: rgba(44, 37, 32, 0.12);
      }
    }

    /* Responsive */
    @media (max-width: 640px) {
      .marketplace-container {
        width: 100vw;
        max-height: 100vh;
        max-height: 100dvh; /* Use dynamic viewport height for mobile */
        border-radius: 0;
      }

      /* Mobile header - proper safe area handling */
      .marketplace-header {
        padding: max(var(--space-md, 16px), env(safe-area-inset-top, 0px)) 
                 var(--space-md, 16px) 
                 var(--space-sm, 12px);
        padding-top: calc(max(var(--space-md, 16px), env(safe-area-inset-top, 0px)) + 8px);
      }

      /* Mobile title row - stack title and close button properly */
      .marketplace-title-row {
        gap: var(--space-sm, 12px);
      }

      /* Smaller title on mobile */
      .marketplace-title {
        font-size: 1.25rem;
        line-height: 1.3;
      }

      /* Larger tap target for close button on mobile (minimum 44px per accessibility guidelines) */
      .marketplace-close {
        width: 44px;
        height: 44px;
        min-width: 44px;
        flex-shrink: 0;
        position: relative;
        z-index: 10;
        background: var(--color-bg-subtle, rgba(255, 255, 255, 0.1));
      }

      .marketplace-close svg {
        width: 22px;
        height: 22px;
      }

      .marketplace-subtitle {
        font-size: 0.875rem;
        margin-bottom: var(--space-md, 16px);
      }

      .marketplace-grid {
        grid-template-columns: 1fr;
      }

      .marketplace-search {
        flex-direction: column;
      }

      .marketplace-tabs {
        width: 100%;
      }

      .marketplace-tab {
        flex: 1;
        justify-content: center;
        padding: 10px 12px;
        font-size: 0.8rem;
      }

      /* Content safe area padding */
      .marketplace-content {
        padding: var(--space-md, 16px);
        padding-bottom: max(var(--space-md, 16px), env(safe-area-inset-bottom, 0px));
      }

      /* Footer safe area */
      .marketplace-footer {
        padding: var(--space-sm, 12px) var(--space-md, 16px);
        padding-bottom: max(var(--space-sm, 12px), env(safe-area-inset-bottom, 0px));
      }
    }

    /* Extra small devices - even more compact */
    @media (max-width: 380px) {
      .marketplace-title {
        font-size: 1.1rem;
      }

      .marketplace-tab {
        padding: 8px 10px;
        font-size: 0.75rem;
      }
    }

    /* ========================================================================
       MY CREATIONS TAB STYLES
       ======================================================================== */
    
    .creations-section {
      padding: var(--space-md, 16px) 0;
    }

    .creations-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xl, 32px);
      padding-bottom: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .creations-header-content {
      flex: 1;
    }

    .creations-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-xs, 4px);
    }

    .creations-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      margin: 0;
    }

    .creations-create-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 10px) var(--space-md, 18px);
      background: var(--persona-primary, var(--color-accent-primary, #4a6741));
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .creations-create-btn:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .creations-create-btn:active {
      transform: translateY(0);
    }

    /* Empty State */
    .creations-empty {
      text-align: center;
      padding: var(--space-2xl, 48px) var(--space-lg, 24px);
    }

    .creations-empty-illustration {
      margin-bottom: var(--space-lg, 24px);
      color: var(--color-text-dimmed, rgba(255, 255, 255, 0.3));
    }

    .creations-empty-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-sm, 8px);
    }

    .creations-empty-hint {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      margin: 0 0 var(--space-lg, 24px);
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.5;
    }

    .creations-empty-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--persona-primary, var(--color-accent-primary, #4a6741));
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .creations-empty-btn:hover {
      filter: brightness(1.1);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }

    /* Types Preview Grid */
    .creations-types-preview {
      margin-top: var(--space-2xl, 48px);
      padding-top: var(--space-xl, 32px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .creations-types-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 var(--space-lg, 24px);
      text-align: center;
    }

    .creations-types-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-md, 16px);
    }

    .creation-type-card {
      background: var(--color-bg-subtle, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-lg, 24px) var(--space-md, 16px);
      text-align: center;
      transition: all 0.2s ease;
    }

    .creation-type-card:hover {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-color: var(--color-border, rgba(255, 255, 255, 0.12));
    }

    .creation-type-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      margin-bottom: var(--space-sm, 8px);
      color: var(--color-accent, #4a6741);
    }
    
    .creation-type-icon svg {
      width: 28px;
      height: 28px;
    }

    .creation-type-name {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-xs, 4px);
    }

    .creation-type-desc {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: 0;
      line-height: 1.4;
    }

    /* Custom Agents Grid */
    .creations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md, 16px);
    }

    .custom-agent-card {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-lg, 20px);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .custom-agent-card:hover {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.08));
      border-color: var(--color-border, rgba(255, 255, 255, 0.15));
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    }

    .custom-agent-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-md, 12px);
    }

    .custom-agent-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%; /* Circular - no more rounded squares! */
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
      /* Layered shadow for depth */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 4px 8px rgba(0, 0, 0, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.08) inset;
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
      /* Breathing animation - Pixar principle: everything alive breathes */
      animation: avatar-breathe 5s var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1)) infinite;
    }
    
    .custom-agent-card:hover .custom-agent-avatar {
      transform: scale(1.08);
      animation: avatar-breathe 2s var(--ease-spring-gentle, cubic-bezier(0.25, 1.2, 0.5, 1)) infinite;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 8px 16px rgba(0, 0, 0, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.12) inset,
        0 0 16px -2px var(--persona-glow, rgba(74, 103, 65, 0.25));
    }

    .custom-agent-meta {
      flex: 1;
      min-width: 0;
    }

    .custom-agent-name {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text, #fff);
      margin: 0 0 var(--space-2xs, 2px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .custom-agent-type {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .custom-agent-status {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.65rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: var(--radius-sm, 4px);
    }

    .custom-agent-status.status--active {
      background: rgba(74, 103, 65, 0.2);
      color: var(--color-success, #4a6741);
    }

    .custom-agent-status.status--draft {
      background: rgba(255, 193, 7, 0.15);
      color: #ffc107;
    }

    .custom-agent-status.status--paused {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .custom-agent-description {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      margin: 0 0 var(--space-md, 12px);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .custom-agent-stats {
      display: flex;
      gap: var(--space-md, 16px);
      margin-bottom: var(--space-md, 12px);
    }

    .custom-agent-stat {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-dimmed, rgba(255, 255, 255, 0.4));
    }

    .custom-agent-footer {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding-top: var(--space-sm, 12px);
      border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    }

    .custom-agent-action {
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      border-radius: var(--radius-md, 8px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .custom-agent-action--edit {
      flex: 1;
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.08));
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
      color: var(--color-text, #fff);
    }

    .custom-agent-action--edit:hover {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
    }

    .custom-agent-action--delete {
      width: 32px;
      height: 32px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
      color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
    }

    .custom-agent-action--delete:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }

    .custom-agent-action--journal {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: #fff;
    }

    .custom-agent-action--journal:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .custom-agent-action--journal svg {
      flex-shrink: 0;
    }

    /* Zen theme - Creations Tab */
    [data-theme="zen"] .creations-header {
      border-bottom-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .creations-title {
      color: #2c2520;
    }

    [data-theme="zen"] .creations-subtitle {
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .creations-empty-title {
      color: #2c2520;
    }

    [data-theme="zen"] .creations-empty-hint {
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .creations-types-preview {
      border-top-color: rgba(44, 37, 32, 0.1);
    }

    [data-theme="zen"] .creations-types-title {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .creation-type-card {
      background: rgba(44, 37, 32, 0.03);
      border-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .creation-type-card:hover {
      background: rgba(44, 37, 32, 0.05);
    }

    [data-theme="zen"] .creation-type-name {
      color: #2c2520;
    }

    [data-theme="zen"] .creation-type-desc {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .custom-agent-card {
      background: rgba(44, 37, 32, 0.03);
      border-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .custom-agent-card:hover {
      background: rgba(44, 37, 32, 0.05);
      border-color: rgba(44, 37, 32, 0.12);
    }

    /* Zen theme - Circular custom agent avatars */
    [data-theme="zen"] .custom-agent-avatar {
      box-shadow: 
        0 1px 2px rgba(44, 37, 32, 0.08),
        0 4px 8px rgba(44, 37, 32, 0.06),
        0 0 0 2px rgba(255, 255, 255, 0.4) inset;
    }

    [data-theme="zen"] .custom-agent-card:hover .custom-agent-avatar {
      box-shadow: 
        0 2px 4px rgba(44, 37, 32, 0.1),
        0 8px 16px rgba(44, 37, 32, 0.08),
        0 0 0 2px rgba(255, 255, 255, 0.5) inset,
        0 0 16px -2px var(--persona-glow, rgba(74, 103, 65, 0.2));
    }

    [data-theme="zen"] .custom-agent-name {
      color: #2c2520;
    }

    [data-theme="zen"] .custom-agent-type {
      color: rgba(44, 37, 32, 0.5);
    }

    [data-theme="zen"] .custom-agent-description {
      color: rgba(44, 37, 32, 0.6);
    }

    [data-theme="zen"] .custom-agent-stat {
      color: rgba(44, 37, 32, 0.4);
    }

    [data-theme="zen"] .custom-agent-footer {
      border-top-color: rgba(44, 37, 32, 0.08);
    }

    [data-theme="zen"] .custom-agent-action--edit {
      background: rgba(44, 37, 32, 0.05);
      border-color: rgba(44, 37, 32, 0.1);
      color: #2c2520;
    }

    [data-theme="zen"] .custom-agent-action--delete {
      border-color: rgba(44, 37, 32, 0.1);
      color: rgba(44, 37, 32, 0.4);
    }

    [data-theme="zen"] .custom-agent-action--journal {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: #fff;
    }

    [data-theme="zen"] .custom-agent-action--journal:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    /* Responsive - Creations Tab */
    @media (max-width: 768px) {
      .creations-header {
        flex-direction: column;
        gap: var(--space-md, 16px);
        text-align: center;
      }

      .creations-types-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 480px) {
      .creations-types-grid {
        grid-template-columns: 1fr;
      }

      .creations-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const marketplaceUI = {
  open: openMarketplace,
  close: closeMarketplace,
  toggle: toggleMarketplace,
};

export default marketplaceUI;
