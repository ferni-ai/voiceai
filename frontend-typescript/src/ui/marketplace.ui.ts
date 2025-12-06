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

import {
  marketplaceService,
  type MarketplaceAgent,
} from '../services/marketplace.service.js';
import { soundUI } from './sound.ui.js';
import { refreshMarketplaceAgents } from './team.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Marketplace');

// ============================================================================
// PERSONA COLORS - Single source of truth from design system
// Use data-persona attributes in HTML and let CSS handle the gradients
// ============================================================================

/**
 * Persona color configuration mapped from design system tokens.
 * These match the CSS variables defined in tokens.css under [data-persona="..."]
 */
const PERSONA_GRADIENTS: Record<string, string> = {
  'ferni': 'var(--gradient-ferni, linear-gradient(135deg, var(--persona-secondary, #3d5a35), var(--persona-primary, #4a6741)))',
  'peter-john': 'var(--gradient-peter, linear-gradient(135deg, var(--persona-secondary, #2d5359), var(--persona-primary, #3a6b73)))',
  'alex-chen': 'var(--gradient-alex, linear-gradient(135deg, var(--persona-secondary, #4a5a73), var(--persona-primary, #5a6b8a)))',
  'maya-santos': 'var(--gradient-maya, linear-gradient(135deg, var(--persona-secondary, #8a635a), var(--persona-primary, #a67a6a)))',
  'jordan-taylor': 'var(--gradient-jordan, linear-gradient(135deg, var(--persona-secondary, #a86d55), var(--persona-primary, #c4856a)))',
  'nayan-patel': 'var(--gradient-nayan, linear-gradient(135deg, #9a7a52, #b8956a))',
  // Co-founders (external AI companies)
  'claude': 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
  'gemini': 'linear-gradient(135deg, #4285F4, #34A853)',
  'gpt': 'linear-gradient(135deg, #10A37F, #1A7F64)',
};

/**
 * Persona glow colors for avatar shadows - creates subtle ambient glow effect
 */
const PERSONA_GLOW_COLORS: Record<string, { primary: string; glow: string }> = {
  'ferni': { primary: '#4a6741', glow: 'rgba(74, 103, 65, 0.4)' },
  'peter-john': { primary: '#3a6b73', glow: 'rgba(58, 107, 115, 0.4)' },
  'alex-chen': { primary: '#5a6b8a', glow: 'rgba(90, 107, 138, 0.4)' },
  'maya-santos': { primary: '#a67a6a', glow: 'rgba(166, 122, 106, 0.4)' },
  'jordan-taylor': { primary: '#c4856a', glow: 'rgba(196, 133, 106, 0.4)' },
  'nayan-patel': { primary: '#b8956a', glow: 'rgba(184, 149, 106, 0.4)' },
  // Co-founders
  'claude': { primary: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.45)' },
  'gemini': { primary: '#4285F4', glow: 'rgba(66, 133, 244, 0.45)' },
  'gpt': { primary: '#10A37F', glow: 'rgba(16, 163, 127, 0.45)' },
};

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
// INITIALIZATION
// ============================================================================

/**
 * Create the marketplace modal element if it doesn't exist
 */
function ensureModalExists(): HTMLElement {
  if (marketplaceModal) return marketplaceModal;

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
        <p class="marketplace-subtitle">Find advisors who understand what you need.</p>
        
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
              aria-label="Search for advisors"
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
          <span>Finding advisors...</span>
        </div>
        <div class="marketplace-grid" role="list" aria-label="Available advisors"></div>
        <div class="marketplace-empty">
          <div class="empty-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12h8"></path>
              <path d="M12 8v8"></path>
            </svg>
          </div>
          <p class="empty-title">No matches yet</p>
          <p class="empty-hint">Try a different search or explore all advisors.</p>
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
  marketplaceModal.addEventListener('click', handleModalClick);
  marketplaceModal.addEventListener('keydown', handleModalKeydown);

  const searchInput = marketplaceModal.querySelector('.marketplace-search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', debounce((e: unknown) => handleSearch(e as Event), 300));

  const categorySelect = marketplaceModal.querySelector('.marketplace-category-select') as HTMLSelectElement;
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
 */
async function renderBrowseTab(): Promise<void> {
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

  renderAgentGrid(agents.map(agent => ({
    ...agent,
    isInstalled: installedIds.has(agent.id),
  })));
}

/**
 * Render the installed tab content with "Meet the Team" narrative
 */
async function renderInstalledTab(): Promise<void> {
  const installed = marketplaceService.getInstalledAgents();
  const registry = await marketplaceService.fetchRegistry();
  
  const grid = marketplaceModal?.querySelector('.marketplace-grid');
  const empty = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;
  
  if (!grid) return;
  if (empty) empty.style.display = 'none';
  
  // Always show the team narrative first
  let html = renderTeamNarrative();
  
  // Then show installed marketplace agents if any
  if (installed.length > 0) {
    const agents = installed
      .map(installedAgent => {
        const marketplaceAgent = registry.agents.find(a => a.id === installedAgent.id);
        return marketplaceAgent ? {
          ...marketplaceAgent,
          isInstalled: true,
          installedAt: installedAgent.installed_at,
        } : null;
      })
      .filter(Boolean) as (MarketplaceAgent & { isInstalled: boolean; installedAt: string })[];
    
    if (agents.length > 0) {
      html += `<div class="team-section-divider"><span>Your Installed Advisors</span></div>`;
      html += renderAgentCards(agents);
    }
  }
  
  grid.innerHTML = html;
  grid.setAttribute('style', 'display: block;');
}

/**
 * Render the "Meet the Team" narrative section
 * The first company built by AI, run by AI.
 * 
 * Uses PERSONA_GRADIENTS and PERSONA_GLOW_COLORS for consistent styling from design system.
 * Each avatar now has a subtle ambient glow that matches its persona color.
 */
function renderTeamNarrative(): string {
  // Helper to get glow style for an avatar
  const getAvatarStyle = (personaId: string): string => {
    const glow = PERSONA_GLOW_COLORS[personaId];
    const gradient = PERSONA_GRADIENTS[personaId];
    if (!glow || !gradient) return `background: ${gradient || '#4a6741'};`;
    return `background: ${gradient}; --avatar-glow: ${glow.glow}; --avatar-primary: ${glow.primary};`;
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
                <p class="leader-bio">The warm, wise presence at the heart of everything. Ferni coordinates the team and ensures every conversation feels human.</p>
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
            <div class="employee-card" data-persona="peter-john">
              <div class="employee-avatar" style="${getAvatarStyle('peter-john')}">PJ</div>
              <span class="employee-name">Peter</span>
              <span class="employee-role">Research</span>
            </div>
            <div class="employee-card" data-persona="alex-chen">
              <div class="employee-avatar" style="${getAvatarStyle('alex-chen')}">AX</div>
              <span class="employee-name">Alex</span>
              <span class="employee-role">Communication</span>
            </div>
            <div class="employee-card" data-persona="maya-santos">
              <div class="employee-avatar" style="${getAvatarStyle('maya-santos')}">MY</div>
              <span class="employee-name">Maya</span>
              <span class="employee-role">Wellness</span>
            </div>
            <div class="employee-card" data-persona="jordan-taylor">
              <div class="employee-avatar" style="${getAvatarStyle('jordan-taylor')}">JD</div>
              <span class="employee-name">Jordan</span>
              <span class="employee-role">Planning</span>
            </div>
            <div class="employee-card" data-persona="nayan-patel">
              <div class="employee-avatar" style="${getAvatarStyle('nayan-patel')}">NP</div>
              <span class="employee-name">Nayan</span>
              <span class="employee-role">Wisdom</span>
            </div>
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
 * All agents show "Coming Soon" and are disabled for now
 * 
 * Uses CSS custom properties for colors - allows design system to control appearance
 */
function renderAgentCards(agents: (MarketplaceAgent & { isInstalled: boolean })[]): string {
  return agents.map(agent => {
    const initials = agent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    // Check if this agent has a persona gradient defined, otherwise use their colors
    const gradient = PERSONA_GRADIENTS[agent.id] 
      || `linear-gradient(135deg, ${agent.colors.secondary}, ${agent.colors.primary})`;
    
    return `
    <article class="marketplace-agent coming-soon" data-agent-id="${agent.id}" data-persona="${agent.id}" role="listitem"
      style="--agent-primary: ${agent.colors.primary}; --agent-secondary: ${agent.colors.secondary};">
      <div class="agent-header">
        <div class="agent-avatar" style="background: ${gradient};">
          ${initials}
        </div>
        <div class="agent-meta">
          <h3 class="agent-name">${agent.name}</h3>
          <span class="agent-category">${getCategoryLabel(agent.category)}</span>
        </div>
        <span class="agent-badge coming-soon-badge">Coming Soon</span>
      </div>
      <p class="agent-description">${agent.short_description}</p>
      <div class="agent-tags">
        ${agent.tags.slice(0, 3).map(tag => `<span class="agent-tag">${tag}</span>`).join('')}
      </div>
      <footer class="agent-footer">
        <span class="agent-author">by ${agent.author}</span>
        <button class="agent-action coming-soon-btn" disabled>
          Coming Soon
        </button>
      </footer>
    </article>
    `;
  }).join('');
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
      title.textContent = message === 'No agents installed yet' 
        ? 'Your team awaits.'
        : 'No matches yet.';
    }
    if (hint) {
      hint.textContent = message === 'No agents installed yet'
        ? 'Discover advisors who can help with what matters to you.'
        : 'Try a different search or explore all advisors.';
    }
    empty.style.display = 'flex';
  }
}

/**
 * Set loading state
 */
function setLoading(loading: boolean): void {
  isLoadingState = loading;
  const loadingEl = marketplaceModal?.querySelector('.marketplace-loading') as HTMLElement;
  const gridEl = marketplaceModal?.querySelector('.marketplace-grid') as HTMLElement;
  const emptyEl = marketplaceModal?.querySelector('.marketplace-empty') as HTMLElement;

  if (loading) {
    if (loadingEl) loadingEl.style.display = 'flex';
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
  } else {
    if (loadingEl) loadingEl.style.display = 'none';
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

  // Agent install/uninstall
  const actionBtn = target.closest('.agent-action') as HTMLElement;
  if (actionBtn) {
    const agentId = actionBtn.dataset.agentId;
    if (!agentId) return;

    void handleAgentAction(agentId, actionBtn.classList.contains('uninstall'));
    return;
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
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
  tabs?.forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === currentTab);
  });

  // Toggle search visibility
  const searchEl = marketplaceModal?.querySelector('.marketplace-search') as HTMLElement;
  if (searchEl) {
    searchEl.style.display = currentTab === 'browse' ? 'flex' : 'none';
  }
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
    custom: '🔧 Custom',
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
    .marketplace-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
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
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
                  opacity 0.3s ease;
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
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      animation: cardEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
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
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), 
                  box-shadow 0.25s ease;
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
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
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
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), 
                  box-shadow 0.25s ease;
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
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), 
                  box-shadow 0.25s ease;
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
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), 
                  box-shadow 0.25s ease;
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
      border-color: var(--persona-primary, #4a6741);
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
      border-color: var(--persona-primary, #4a6741);
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
      border-top-color: var(--persona-primary, #4a6741);
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
      border-color: var(--persona-primary, #4a6741);
      background: rgba(74, 103, 65, 0.06);
    }

    [data-theme="zen"] .agent-name {
      color: #2c2520;
    }

    [data-theme="zen"] .agent-category {
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

    /* Responsive */
    @media (max-width: 640px) {
      .marketplace-container {
        width: 100vw;
        max-height: 100vh;
        border-radius: 0;
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

