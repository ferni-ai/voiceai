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
import { marketplaceService, type MarketplaceAgent } from '../services/marketplace.service.js';
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
import {
  requestPermissionConsent,
  type MarketplaceItem,
} from './marketplace-permission-consent.ui.js';
import { soundUI } from './sound.ui.js';
import { refreshMarketplaceAgents } from './team.ui.js';

const log = createLogger('Marketplace');

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
let currentTab: 'browse' | 'installed' = 'browse';
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
  setTimeout(() => announcer.remove(), 1000);
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
          <button class="marketplace-close" data-action="close" aria-label="Close">
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
              placeholder="Who are you looking for?" 
              aria-label="Search for coaches"
            >
          </div>
          <select class="marketplace-category-select" aria-label="Filter by specialty">
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
        <div class="marketplace-grid" role="list" aria-label="Available coaches"></div>
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
    } else {
      await renderInstalledTab();
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
 * Render an employee card for the team narrative section.
 * FIX BUG: Shows locked state indicator for team members not yet unlocked.
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

  return `
    <div class="employee-card ${lockedClass}" data-persona="${personaId}" data-locked="${isLocked}">
      <div class="employee-avatar-container">
        ${progressRing}
        <div class="employee-avatar${isLocked ? ' employee-avatar--locked' : ''}" style="${avatarStyle}">${initials}</div>
        ${lockIcon}
      </div>
      <span class="employee-name">${name}</span>
      <span class="employee-role">${role}</span>
    </div>
  `;
}

/**
 * Render the "Meet the Team" narrative section
 * The first company built by AI, run by AI.
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
        <h3 class="team-narrative-title">The first company built by AI.</h3>
        <p class="team-narrative-subtitle">Run by AI. For humans.</p>
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
    .map((agent) => {
      const initials = agent.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      // Use CSS variables via data-persona attribute - gradient comes from design system
      const gradient = getPersonaGradient(agent.id);

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

      return `
    <article class="marketplace-agent ${stateClass}" data-agent-id="${agent.id}" data-persona="${agent.id}" role="listitem">
      <div class="agent-header">
        <div class="agent-avatar" style="background: ${gradient};">
          ${initials}
        </div>
        <div class="agent-meta">
          <h3 class="agent-name">${agent.name}</h3>
          <span class="agent-category">${getCategoryLabel(agent.category)}</span>
          ${ratingHtml}
        </div>
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
    const tabName = tab.dataset.tab as 'browse' | 'installed';
    if (tabName !== currentTab) {
      currentTab = tabName;
      updateTabs();
      void refreshContent();
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
    const tabName = tab.dataset.tab as 'browse' | 'installed';
    if (tabName !== currentTab) {
      currentTab = tabName;
      updateTabs();
      void refreshContent();
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
    // Send handoff request when connected
    log.debug('Connected - sending handoff request to:', personaId);

    try {
      const { connectionService } = await import('../services/connection.service.js');
      const room = connectionService.getRoom();

      if (!room?.localParticipant) {
        log.error('No room or local participant for handoff');
        return;
      }

      const message = JSON.stringify({
        type: 'handoff_request',
        target: personaId,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });

      log.info('Handoff request sent from marketplace to:', personaId);
      soundUI.play('switch');

      // Close marketplace after initiating handoff
      closeMarketplace();
    } catch (err) {
      log.error('Failed to send handoff request:', err);
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
      <button class="detail-close" aria-label="Close details">
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

  // Add event listeners
  detailPanel.querySelector('.detail-backdrop')?.addEventListener('click', closeDetailPanel);
  detailPanel.querySelector('.detail-close')?.addEventListener('click', closeDetailPanel);

  const actionBtn = detailPanel.querySelector('.detail-action') as HTMLElement;
  actionBtn?.addEventListener('click', () => {
    const agentId = actionBtn.dataset.agentId;
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

  setTimeout(() => {
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
    timeoutId = setTimeout(() => fn(...args), delay);
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

    .marketplace-agent.installed {
      border-color: var(--persona-primary, var(--color-accent-primary));
      background: var(--persona-tint, var(--color-accent-subtle));
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
      width: 52px;
      height: 52px;
      border-radius: var(--radius-lg, 14px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 1rem;
      font-weight: 700;
      color: white;
      letter-spacing: 0.02em;
      /* Professional layered shadow with persona glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 4px 8px rgba(0, 0, 0, 0.06),
        0 0 0 1px rgba(255, 255, 255, 0.08) inset,
        0 6px 18px -4px var(--agent-secondary, rgba(0, 0, 0, 0.25));
      flex-shrink: 0;
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
    }

    .marketplace-agent:hover .agent-avatar {
      transform: scale(1.06);
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 8px 16px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(255, 255, 255, 0.12) inset,
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
      width: 64px;
      height: 64px;
      border-radius: var(--radius-lg, 14px);
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
        0 0 0 1px rgba(255, 255, 255, 0.08) inset,
        0 6px 20px -4px var(--avatar-glow, rgba(74, 103, 65, 0.4));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
    }
    
    .ceo-card:hover .leader-avatar {
      transform: scale(1.04);
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 8px 16px rgba(0, 0, 0, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.12) inset,
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
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      /* Layered shadow for depth + persona-specific glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 3px 6px rgba(0, 0, 0, 0.06),
        0 0 0 1px rgba(255, 255, 255, 0.08) inset,
        0 4px 16px -3px var(--avatar-glow, rgba(0, 0, 0, 0.25));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
    }
    
    .leader-card.cofounder:hover .cofounder-avatar {
      transform: scale(1.08);
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.1),
        0 6px 12px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(255, 255, 255, 0.12) inset,
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
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', var(--font-heading, sans-serif);
      font-size: 0.75rem;
      font-weight: 700;
      color: white;
      /* Layered shadow for depth + persona-specific glow */
      box-shadow: 
        0 1px 2px rgba(0, 0, 0, 0.06),
        0 2px 4px rgba(0, 0, 0, 0.05),
        0 0 0 1px rgba(255, 255, 255, 0.06) inset,
        0 3px 12px -2px var(--avatar-glow, rgba(0, 0, 0, 0.2));
      transition: transform ${DURATION.STANDARD}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.STANDARD}ms ease;
    }
    
    .employee-card:hover .employee-avatar {
      transform: scale(1.1);
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.08),
        0 4px 8px rgba(0, 0, 0, 0.06),
        0 0 0 1px rgba(255, 255, 255, 0.1) inset,
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

    [data-theme="zen"] .agent-name {
      color: #2c2520;
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
