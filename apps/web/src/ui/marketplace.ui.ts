/**
 * Marketplace UI
 *
 * A beautiful modal interface for browsing and installing agents from the
 * VoiceAI Agents marketplace (similar to Claude MCP's marketplace).
 *
 * This file is being progressively refactored into modular components.
 * See ./marketplace/ directory for extracted modules:
 * - types.ts - TypeScript interfaces
 * - constants.ts - Constants and CSS variable helpers
 * - state.ts - State management
 * - utils.ts - Utility functions
 * - styles/ - CSS styles
 *
 * @module marketplace.ui
 */

import { DURATION } from '../config/animation-constants.js';
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
  type CustomAgent,
} from '../services/custom-agent.service.js';
import { openCustomAgentWizard } from './custom-agent-wizard.ui.js';
import { confirmDelete } from './confirm-modal.ui.js';
import { openAgentEditor } from './custom-agent-editor.ui.js';
import { getFirebaseUid, getAuthState } from '../services/firebase-auth.service.js';
import { toast } from './toast.ui.js';

// Import from modular structure
import {
  getCategoryLabel,
  getPersonaGradient,
  getPersonaGlow,
  getCategoryGradient,
  getCategoryGlow,
} from './marketplace/constants.js';
import {
  getMarketplaceStyles,
  getDetailStyles,
} from './marketplace/styles/index.js';
import {
  debounce,
  renderStars,
  formatReviewCount,
} from './marketplace/utils.js';

const log = createLogger('Marketplace');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout } = createTimeoutTracker();

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
    <div class="marketplace-backdrop" data-action="close" role="button" tabindex="0"></div>
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
          <button aria-label="${t('accessibility.discover')}" class="marketplace-tab active" data-tab="browse">
            Discover
          </button>
          <button aria-label="${t('accessibility.yourTeam')}" class="marketplace-tab" data-tab="installed">
            Your Team
          </button>
          <button aria-label="${t('accessibility.myCreations')}" class="marketplace-tab" data-tab="creations">
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
        <button aria-label="${t('accessibility.createAgent')}" class="creations-create-btn" data-action="create-agent">
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
          <button aria-label="${t('accessibility.createYourFirstAgent')}" class="creations-empty-btn" data-action="create-agent">
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
            <button type="button" class="creation-type-card" data-action="create-type" data-type="legacy" aria-label="Create a Legacy agent">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2c.5 3.5 2 5.5 3.5 7 1.5 1.5 3.5 2.5 5.5 3-2 .5-4 1.5-5.5 3-1.5 1.5-3 3.5-3.5 7-.5-3.5-2-5.5-3.5-7-1.5-1.5-3.5-2.5-5.5-3 2-.5 4-1.5 5.5-3 1.5-1.5 3-3.5 3.5-7z"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Legacy</h5>
              <p class="creation-type-desc">Preserve the voice and wisdom of someone you cherish</p>
              <span class="creation-type-cta">Start creating <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
            </button>
            <button type="button" class="creation-type-card" data-action="create-type" data-type="mentor" aria-label="Create a Mentor agent">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22c4-3 8-6 8-11a8 8 0 0 0-16 0c0 5 4 8 8 11z"/>
                  <circle cx="12" cy="11" r="3"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Mentor</h5>
              <p class="creation-type-desc">Create a coach based on an inspiring figure</p>
              <span class="creation-type-cta">Start creating <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
            </button>
            <button type="button" class="creation-type-card" data-action="create-type" data-type="twin" aria-label="Create a Digital Twin">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="10" r="3"/>
                  <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Digital Twin</h5>
              <p class="creation-type-desc">Your personal voice journal that grows with you</p>
              <span class="creation-type-cta">Start creating <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
            </button>
            <button type="button" class="creation-type-card" data-action="create-type" data-type="fictional" aria-label="Create a Custom agent from scratch">
              <span class="creation-type-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                </svg>
              </span>
              <h5 class="creation-type-name">Custom</h5>
              <p class="creation-type-desc">Build any personality from scratch</p>
              <span class="creation-type-cta">Start creating <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
            </button>
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

  // Attach event listeners for type cards (Legacy, Mentor, etc.)
  grid.querySelectorAll('[data-action="create-type"]').forEach(btn => {
    btn.addEventListener('click', handleCreateTypeClick);
  });

  // Attach listeners for agent cards
  grid.querySelectorAll('.custom-agent-card').forEach(card => {
    card.addEventListener('click', (e) => { void handleCustomAgentCardClick(e); });
  });

  grid.querySelectorAll('[data-action="delete-agent"]').forEach(btn => {
    btn.addEventListener('click', (e) => { void handleDeleteAgentClick(e); });
  });

  // Journal button listeners for Digital Twin agents
  grid.querySelectorAll('[data-action="open-journal"]').forEach(btn => {
    btn.addEventListener('click', handleOpenJournalClick);
  });

  // Profile button listeners for Digital Twin agents
  grid.querySelectorAll('[data-action="open-profile"]').forEach(btn => {
    btn.addEventListener('click', handleOpenProfileClick);
  });

  // Talk to Twin button listeners for Digital Twin agents
  grid.querySelectorAll('[data-action="talk-to-twin"]').forEach(btn => {
    btn.addEventListener('click', handleTalkToTwinClick);
  });

  // Legacy agent listeners
  grid.querySelectorAll('[data-action="open-stories"]').forEach(btn => {
    btn.addEventListener('click', handleOpenStoriesClick);
  });
  grid.querySelectorAll('[data-action="record-voice"]').forEach(btn => {
    btn.addEventListener('click', handleRecordVoiceClick);
  });
  grid.querySelectorAll('[data-action="talk-to-legacy"]').forEach(btn => {
    btn.addEventListener('click', handleTalkToAgentClick);
  });

  // Mentor agent listeners
  grid.querySelectorAll('[data-action="open-teachings"]').forEach(btn => {
    btn.addEventListener('click', handleOpenTeachingsClick);
  });
  grid.querySelectorAll('[data-action="talk-to-mentor"]').forEach(btn => {
    btn.addEventListener('click', handleTalkToAgentClick);
  });

  // Fictional agent listeners
  grid.querySelectorAll('[data-action="open-character"]').forEach(btn => {
    btn.addEventListener('click', handleOpenCharacterClick);
  });
  grid.querySelectorAll('[data-action="start-roleplay"]').forEach(btn => {
    btn.addEventListener('click', handleStartRoleplayClick);
  });

  // Professional agent listeners
  grid.querySelectorAll('[data-action="open-tasks"]').forEach(btn => {
    btn.addEventListener('click', handleOpenTasksClick);
  });
  grid.querySelectorAll('[data-action="start-task-mode"]').forEach(btn => {
    btn.addEventListener('click', handleStartTaskModeClick);
  });

  // Legacy share listener
  grid.querySelectorAll('[data-action="share-legacy"]').forEach(btn => {
    btn.addEventListener('click', handleShareLegacyClick);
  });

  // Mentor coaching listener
  grid.querySelectorAll('[data-action="start-coaching"]').forEach(btn => {
    btn.addEventListener('click', handleStartCoachingClick);
  });

  // Generic talk to agent
  grid.querySelectorAll('[data-action="talk-to-agent"]').forEach(btn => {
    btn.addEventListener('click', handleTalkToAgentClick);
  });
}

/**
 * Get type-specific action buttons for a custom agent card
 */
function getAgentTypeButtons(agent: CustomAgent): string {
  const icons = {
    profile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
    journal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    talk: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    stories: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    teachings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="m5 21 5-10"/></svg>`,
    character: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" x2="2" y1="8" y2="22"/></svg>`,
    tasks: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`,
  };

  switch (agent.type) {
    case 'twin':
      return `
        <button aria-label="${t('accessibility.profile')}" class="custom-agent-action custom-agent-action--profile" data-action="open-profile" data-agent-id="${agent.id}">
          ${icons.profile}
          Profile
        </button>
        <button aria-label="${t('accessibility.journal')}" class="custom-agent-action custom-agent-action--journal" data-action="open-journal" data-agent-id="${agent.id}">
          ${icons.journal}
          Journal
        </button>
        <button aria-label="${t('accessibility.talk')}" class="custom-agent-action custom-agent-action--talk" data-action="talk-to-twin" data-agent-id="${agent.id}">
          ${icons.talk}
          Talk
        </button>
      `;

    case 'legacy':
      return `
        <button aria-label="${t('accessibility.stories')}" class="custom-agent-action custom-agent-action--stories" data-action="open-stories" data-agent-id="${agent.id}">
          ${icons.stories}
          Stories
        </button>
        <button aria-label="${t('accessibility.voice')}" class="custom-agent-action custom-agent-action--voice" data-action="record-voice" data-agent-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          Voice
        </button>
        <button aria-label="${t('accessibility.share')}" class="custom-agent-action custom-agent-action--share" data-action="share-legacy" data-agent-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Share
        </button>
        <button aria-label="${t('accessibility.talk')}" class="custom-agent-action custom-agent-action--talk" data-action="talk-to-legacy" data-agent-id="${agent.id}">
          ${icons.talk}
          Talk
        </button>
      `;

    case 'mentor':
      return `
        <button aria-label="${t('accessibility.teachings')}" class="custom-agent-action custom-agent-action--teachings" data-action="open-teachings" data-agent-id="${agent.id}">
          ${icons.teachings}
          Teachings
        </button>
        <button aria-label="${t('accessibility.coachMe')}" class="custom-agent-action custom-agent-action--coaching" data-action="start-coaching" data-agent-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          Coach Me
        </button>
      `;

    case 'fictional':
      return `
        <button aria-label="${t('accessibility.character')}" class="custom-agent-action custom-agent-action--character" data-action="open-character" data-agent-id="${agent.id}">
          ${icons.character}
          Character
        </button>
        <button aria-label="${t('accessibility.play')}" class="custom-agent-action custom-agent-action--roleplay" data-action="start-roleplay" data-agent-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          Roleplay
        </button>
      `;

    case 'professional':
      return `
        <button aria-label="${t('accessibility.tasks')}" class="custom-agent-action custom-agent-action--tasks" data-action="open-tasks" data-agent-id="${agent.id}">
          ${icons.tasks}
          Tasks
        </button>
        <button aria-label="${t('accessibility.workMode')}" class="custom-agent-action custom-agent-action--work" data-action="start-task-mode" data-agent-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Work Mode
        </button>
      `;

    default:
      return `
        <button aria-label="${t('accessibility.talk')}" class="custom-agent-action custom-agent-action--talk" data-action="talk-to-agent" data-agent-id="${agent.id}">
          ${icons.talk}
          Talk
        </button>
      `;
  }
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
        ${getAgentTypeButtons(agent)}
        <button aria-label="${t('accessibility.edit')}" class="custom-agent-action custom-agent-action--edit" data-agent-id="${agent.id}">
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
 * Handle type card click (open wizard with preselected type)
 * This allows users to click directly on Legacy/Mentor/Digital Twin/Custom cards
 */
function handleCreateTypeClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const agentType = btn.dataset.type as 'legacy' | 'mentor' | 'twin' | 'fictional';
  
  if (!agentType) {
    log.warn('No agent type found on card');
    return;
  }
  
  log.info(`Creating agent with preselected type: ${agentType}`);
  closeMarketplace();
  
  // Small delay to let marketplace close animation complete
  trackedTimeout(() => {
    openCustomAgentWizard({ preselectedType: agentType });
  }, 200);
  soundUI.play('click');
}

/**
 * Handle custom agent card click (open for editing)
 */
async function handleCustomAgentCardClick(e: Event): Promise<void> {
  const card = (e.currentTarget as HTMLElement);
  const agentId = card.dataset.agentId;
  if (agentId) {
    log.debug('Custom agent card clicked:', agentId);
    // Close marketplace and open editor
    closeMarketplace();
    trackedTimeout(async () => {
      await openAgentEditor(agentId);
    }, 200);
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

  // Get agent name from card for confirmation message
  const card = btn.closest('.custom-agent-card');
  const agentName = card?.querySelector('.custom-agent-name')?.textContent || 'this agent';

  // Confirm deletion with branded modal
  const confirmed = await confirmDelete(agentName, {
    message: `You'll lose all memories and voice data for ${agentName}.`,
  });
  if (!confirmed) return;

  try {
    await deleteCustomAgent(agentId);
    const { toast } = await import('./toast.ui.js');
    toast.success(t('toasts.agentDeleted'));
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
    const { openVoiceJournal } = await import('./voice-journal/index.js');
    await openVoiceJournal(agentId);
  } catch (err) {
    log.error('Failed to open journal:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open journal. Try again?");
  }
}

/**
 * Handle opening the profile setup for a Digital Twin agent.
 */
async function handleOpenProfileClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    // Open the Digital Twin profile UI
    const { openTwinProfile } = await import('./digital-twin-profile.ui.js');
    await openTwinProfile(agentId);
  } catch (err) {
    log.error('Failed to open profile:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open profile. Try again?");
  }
}

/**
 * Handle opening the Talk to Twin conversation for a Digital Twin agent.
 */
async function handleTalkToTwinClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    // Open the Talk to Twin UI
    const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
    await openTalkToTwin(agentId);
  } catch (err) {
    log.error('Failed to open Talk to Twin:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't start conversation. Try again?");
  }
}

/**
 * Handle opening Stories UI for Legacy agents
 */
async function handleOpenStoriesClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openLegacyStories } = await import('./legacy-stories.ui.js');
    await openLegacyStories(agentId);
  } catch (err) {
    log.error('Failed to open Legacy Stories:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open stories. Try again?");
  }
}

/**
 * Handle opening Voice Clone Recorder for Legacy agents
 */
async function handleRecordVoiceClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openVoiceCloneRecorder } = await import('./voice-clone-recorder.ui.js');
    await openVoiceCloneRecorder(agentId);
  } catch (err) {
    log.error('Failed to open Voice Recorder:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open voice recorder. Try again?");
  }
}

/**
 * Handle opening Teachings UI for Mentor agents
 */
async function handleOpenTeachingsClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openMentorTeachings } = await import('./mentor-teachings.ui.js');
    await openMentorTeachings(agentId);
  } catch (err) {
    log.error('Failed to open Mentor Teachings:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open teachings. Try again?");
  }
}

/**
 * Handle opening Character UI for Fictional agents
 */
async function handleOpenCharacterClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openCharacterSheet } = await import('./character-sheet.ui.js');
    await openCharacterSheet(agentId);
  } catch (err) {
    log.error('Failed to open Character Sheet:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open character. Try again?");
  }
}

/**
 * Handle opening Tasks UI for Professional agents
 */
async function handleOpenTasksClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openProfessionalTasks } = await import('./professional-tasks.ui.js');
    await openProfessionalTasks(agentId);
  } catch (err) {
    log.error('Failed to open Professional Tasks:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open tasks. Try again?");
  }
}

/**
 * Handle generic talk to custom agent
 */
async function handleTalkToAgentClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    // Use the Talk to Twin UI as the base for all agent conversations
    const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
    await openTalkToTwin(agentId);
  } catch (err) {
    log.error('Failed to open agent conversation:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't start conversation. Try again?");
  }
}

/**
 * Handle sharing a Legacy agent with family members
 */
async function handleShareLegacyClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openLegacyShare } = await import('./legacy-share.ui.js');
    await openLegacyShare(agentId);
  } catch (err) {
    log.error('Failed to open Legacy Share:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't open sharing. Try again?");
  }
}

/**
 * Handle starting a coaching session with a Mentor agent
 */
async function handleStartCoachingClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openCoachingMode } = await import('./coaching-mode.ui.js');
    await openCoachingMode(agentId);
  } catch (err) {
    log.error('Failed to open Coaching Mode:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't start coaching. Try again?");
  }
}

/**
 * Handle starting roleplay with a Fictional agent
 */
async function handleStartRoleplayClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openRoleplayMode } = await import('./roleplay-mode.ui.js');
    await openRoleplayMode(agentId);
  } catch (err) {
    log.error('Failed to open Roleplay Mode:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't start roleplay. Try again?");
  }
}

/**
 * Handle starting task mode with a Professional agent
 */
async function handleStartTaskModeClick(e: Event): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLButtonElement;
  const agentId = btn.dataset.agentId;
  if (!agentId) return;

  try {
    const { openTaskMode } = await import('./task-mode.ui.js');
    await openTaskMode(agentId);
  } catch (err) {
    log.error('Failed to open Task Mode:', err);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't start work mode. Try again?");
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
      // Use category-based colors for visual variety in marketplace
      const gradient = getCategoryGradient(agent.category);
      const glow = getCategoryGlow(agent.category);

      // Determine state classes and button
      const stateClass = agent.isInstalled ? 'installed' : '';
      const badgeHtml = agent.isInstalled
        ? '<span class="agent-badge installed">Installed</span>'
        : '';
      const buttonHtml = agent.isInstalled
        ? `<button aria-label="${t('accessibility.remove')}" class="agent-action uninstall" data-agent-id="${agent.id}">Remove</button>`
        : `<button aria-label="${t('accessibility.addToTeam')}" class="agent-action install" data-agent-id="${agent.id}">Add to Team</button>`;

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
    <article class="marketplace-agent discover-card ${stateClass}" data-agent-id="${agent.id}" data-category="${agent.category}" role="listitem" style="--stagger-delay: ${animationDelay}s;">
      <div class="discover-avatar-container">
        <div class="discover-avatar-ring" style="--avatar-glow: ${glow};"></div>
        <div class="discover-avatar-orb" style="background: ${gradient}; --avatar-glow: ${glow};">
          ${initials}
        </div>
      </div>
      <div class="discover-info">
        <h3 class="agent-name">${agent.name}</h3>
        <span class="agent-category" data-category="${agent.category}">${getCategoryLabel(agent.category)}</span>
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

// renderStars and formatReviewCount imported from ./marketplace/utils.js

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
    toast.success(t('toasts.nameAddedToYourTeam'));
    log.info('Added team member to roster from marketplace:', personaId);
  } else {
    rosterPreferences.removeMember(personaId as RosterTeamMemberId);
    soundUI.play('click');
    toast.info(t('toasts.nameRemovedFromTeam'));
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
        // Uses verified publisher, trust level, and permissions from registry
        // Map trust level: 'official' -> 'verified' for MarketplaceItem compatibility
        const trustLevelMap: Record<string, 'platform' | 'verified' | 'community' | 'unverified'> = {
          official: 'verified',
          verified: 'verified',
          community: 'community',
        };
        const consentItem: MarketplaceItem = {
          id: agent.id,
          name: agent.name,
          type: 'agent',
          publisher: {
            name: agent.publisher.name,
            verified: agent.publisher.verified,
          },
          trustLevel: trustLevelMap[agent.trustLevel] || 'community',
          permissions: {
            // Map PermissionScope strings to PermissionRequest objects
            // Use type assertion since marketplace.service and marketplace-permission-consent have different scope types
            required: agent.permissions.required.map((scope) => ({ scope: scope as unknown as import('./marketplace-permission-consent.ui.js').PermissionScope, reason: '', required: true as const })),
            optional: agent.permissions.optional.map((scope) => ({ scope: scope as unknown as import('./marketplace-permission-consent.ui.js').PermissionScope, reason: '', required: false as const })),
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

        <section class="detail-section review-form-section">
          <h3 class="detail-section-title">Write a Review</h3>
          <form class="review-form" data-agent-id="${agent.id}">
            <div class="review-rating-select">
              <span class="review-rating-label">Your rating:</span>
              <div class="star-selector" role="group" aria-label="${t('accessibility.selectRating')}">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) => `
                  <button type="button" class="star-btn" data-rating="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                `
                  )
                  .join('')}
              </div>
              <input type="hidden" name="rating" value="0" required />
            </div>
            <div class="form-group">
              <input type="text" name="title" class="review-title-input" placeholder="Review title (optional)" maxlength="100" />
            </div>
            <div class="form-group">
              <textarea name="body" class="review-body-input" placeholder="Share your experience..." rows="3" required minlength="10" maxlength="1000"></textarea>
              <span class="char-count">0/1000</span>
            </div>
            <button type="submit" class="review-submit-btn" disabled>
              Submit Review
            </button>
          </form>
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

  // Review form event listeners
  setupReviewFormListeners(detailPanel, agent.id);

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

// ============================================================================
// REVIEW FORM HANDLERS
// ============================================================================

/**
 * Set up event listeners for the review form
 */
function setupReviewFormListeners(panel: HTMLElement, agentId: string): void {
  const form = panel.querySelector('.review-form') as HTMLFormElement;
  if (!form) return;

  const starBtns = form.querySelectorAll('.star-btn');
  const ratingInput = form.querySelector('input[name="rating"]') as HTMLInputElement;
  const bodyInput = form.querySelector('textarea[name="body"]') as HTMLTextAreaElement;
  const charCount = form.querySelector('.char-count') as HTMLElement;
  const submitBtn = form.querySelector('.review-submit-btn') as HTMLButtonElement;

  let selectedRating = 0;

  // Star rating selection
  starBtns.forEach((btn) => {
    const starBtn = btn as HTMLButtonElement;
    const rating = parseInt(starBtn.dataset.rating || '0', 10);

    // Hover effect
    starBtn.addEventListener('mouseenter', () => {
      updateStarDisplay(starBtns, rating);
    });

    starBtn.addEventListener('mouseleave', () => {
      updateStarDisplay(starBtns, selectedRating);
    });

    // Click to select
    addTapListener(starBtn, () => {
      selectedRating = rating;
      ratingInput.value = String(rating);
      updateStarDisplay(starBtns, rating);
      validateReviewForm(form, submitBtn);
      soundUI.play('toggle');
    });
  });

  // Character counter
  bodyInput.addEventListener('input', () => {
    const length = bodyInput.value.length;
    charCount.textContent = `${length}/1000`;
    validateReviewForm(form, submitBtn);
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitReview(form, agentId, submitBtn);
  });
}

/**
 * Update star display based on rating
 */
function updateStarDisplay(starBtns: NodeListOf<Element>, rating: number): void {
  starBtns.forEach((btn) => {
    const starBtn = btn as HTMLButtonElement;
    const btnRating = parseInt(starBtn.dataset.rating || '0', 10);
    const svg = starBtn.querySelector('svg');
    if (svg) {
      if (btnRating <= rating) {
        svg.setAttribute('fill', 'currentColor');
        starBtn.classList.add('selected');
      } else {
        svg.setAttribute('fill', 'none');
        starBtn.classList.remove('selected');
      }
    }
  });
}

/**
 * Validate the review form and enable/disable submit
 */
function validateReviewForm(form: HTMLFormElement, submitBtn: HTMLButtonElement): void {
  const rating = parseInt((form.querySelector('input[name="rating"]') as HTMLInputElement).value, 10);
  const body = (form.querySelector('textarea[name="body"]') as HTMLTextAreaElement).value.trim();

  const isValid = rating >= 1 && rating <= 5 && body.length >= 10;
  submitBtn.disabled = !isValid;
}

/**
 * Submit the review to the API
 */
async function submitReview(
  form: HTMLFormElement,
  agentId: string,
  submitBtn: HTMLButtonElement
): Promise<void> {
  const userId = getFirebaseUid();
  if (!userId) {
    toast.error(t('toasts.signInToLeaveAReview'));
    return;
  }

  const authState = getAuthState();
  const formData = new FormData(form);
  const rating = parseInt(formData.get('rating') as string, 10);
  const title = (formData.get('title') as string)?.trim() || undefined;
  const body = (formData.get('body') as string).trim();

  if (rating < 1 || rating > 5 || body.length < 10) {
    toast.warning(t('toasts.addARatingAndAtLeast10Characters'));
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = t('ui.marketplace.submitting');

  try {
    const response = await fetch('/api/marketplace/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-firebase-uid': userId,
      },
      body: JSON.stringify({
        itemId: agentId,
        itemType: 'agent',
        userId,
        userName: authState.displayName || undefined,
        rating,
        title,
        body,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to submit review');
    }

    toast.success(t('toasts.thanksForYourReview'));
    soundUI.play('success');

    // Reset form
    form.reset();
    const starBtns = form.querySelectorAll('.star-btn');
    updateStarDisplay(starBtns, 0);
    const charCount = form.querySelector('.char-count') as HTMLElement;
    if (charCount) charCount.textContent = '0/1000';

    // Optionally refresh the detail panel to show the new review
    // For now, just close and let user reopen to see their review
    log.info({ agentId, rating }, 'Review submitted successfully');
  } catch (err) {
    log.error({ error: err, agentId }, 'Failed to submit review');
    toast.error("Couldn't submit review. Try again?");
    submitBtn.disabled = false;
    submitBtn.textContent = t('ui.marketplace.submitReview');
  }
}

// ============================================================================
// LEGACY STYLES REMOVED
// ============================================================================
// The following massive CSS functions were moved to modular files:
// - getDetailStyles() -> ./marketplace/styles/detail.ts (334 lines)
// - getMarketplaceStyles() -> ./marketplace/styles/index.ts (2805 lines)
// Total: ~3139 lines of CSS moved to modular architecture
// Import from ./marketplace/styles/index.js instead

// Legacy CSS has been fully removed. All styles are now in:
// - ./marketplace/styles/base.ts
// - ./marketplace/styles/cards.ts
// - ./marketplace/styles/detail.ts
// - ./marketplace/styles/team.ts
// - ./marketplace/styles/creations.ts
//
// Import getMarketplaceStyles and getDetailStyles from ./marketplace/styles/index.js

// ============================================================================
// LEGACY CODE REMOVAL MARKER
// ============================================================================
// ~3100 lines of CSS were removed during the Dec 2024 modularization.
// The following marker prevents accidental re-addition:
const _LEGACY_REMOVED = true;
void _LEGACY_REMOVED;

// --- The following was the start of ~3100 lines of legacy CSS that was removed ---
// Original content started with:
// const _LEGACY_STYLES_PLACEHOLDER = `
//     .marketplace-detail { ... }
// ...and continued for 3100+ lines...
// --- END LEGACY CODE REMOVAL MARKER ---

// ============================================================================
// EXPORTS
// ============================================================================

export const marketplaceUI = {
  open: openMarketplace,
  close: closeMarketplace,
  toggle: toggleMarketplace,
};

export default marketplaceUI;

// FILE END
