/**
 * Team UI Component
 * 
 * Manages the team roster display (Ferni, Jack Bogle, Peter Lynch, etc).
 * Shows which team member is currently active.
 * 
 * 🎬 PIXAR ANIMATION ENHANCEMENTS:
 * - Magnetic pull on hover (like attracted to cursor)
 * - Step-forward animation on selection
 * - Spotlight effect on active member
 * - Supporting cheer from other members
 * - Energy transfer animation on handoff
 */

import type { PersonaId, PersonaConfig } from '../types/persona.js';
import type { NormalizedHandoff } from '../types/events.js';
import { getPersona, isKnownPersonaId } from '../config/personas.js';
import { getPersonaColorConfig } from '../config/persona-colors.js';
import { HANDOFF_TIMING } from '../config/index.js';
import { appState } from '../state/app.state.js';
import { handoffService } from '../services/handoff.service.js';
import { DURATION, EASING, ANIMATION_PRESET } from '../config/animation-constants.js';
import {
  getElementById,
  addClass,
  removeClass,
  addListener,
} from '../utils/dom.js';
import { createLogger } from '../utils/logger.js';
import { fetchAgents, type ApiAgent } from '../services/agents.service.js';
import { marketplaceUI } from './marketplace.ui.js';
import * as marketplaceService from '../services/marketplace.service.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
import { rosterPreferences, type TeamMemberId } from '../services/roster-preferences.service.js';

const log = createLogger('TeamUI');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let rosterContainer: HTMLElement | null = null;
const teamMemberElements: Map<PersonaId, HTMLElement> = new Map();
const cleanupFunctions: (() => void)[] = [];

/** FIX BUG #57: ARIA live region for announcing handoff status to screen readers */
let ariaLiveRegion: HTMLElement | null = null;

// 🎬 Pixar Animation state
let activeHoverAnimation: Animation | null = null;
let magneticAnimationFrame: number | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the team UI component.
 * Must be called after DOM is ready.
 */
export function initTeamUI(): void {
  try {
    rosterContainer = getElementById('teamRoster');
    
    // FIX BUG #57: Create ARIA live region for handoff announcements
    createAriaLiveRegion();
    
    // Build team roster
    buildTeamRoster();

    // Set up handoff listener
    const unsubscribe = handoffService.onHandoff(handleHandoff);
    cleanupFunctions.push(unsubscribe);

    // Set up state subscription
    const unsub2 = appState.subscribe('activePersona', updateActiveTeamMember);
    cleanupFunctions.push(unsub2);
    
    // FIX BUG #57: Announce handoff start events to screen readers
    const unsubStart = handoffService.onHandoffStart((toPersona, _fromPersona) => {
      const persona = getPersona(toPersona);
      announceToScreenReader(`Switching to ${persona.name}`);
    });
    cleanupFunctions.push(unsubStart);
    
    // FIX BUG #57: Announce handoff completion
    const unsubComplete = handoffService.onHandoffComplete((toPersona) => {
      const persona = getPersona(toPersona);
      announceToScreenReader(`Now speaking with ${persona.name}`);
    });
    cleanupFunctions.push(unsubComplete);
    
    // FIX BUG #57: Announce handoff failures
    // FIX BUG: Also clear visual switching states when handoff fails
    const unsubFailed = handoffService.onHandoffFailed((error, targetPersona) => {
      announceToScreenReader(`Switch failed. ${error}`);
      clearSwitchingFeedback(targetPersona);
    });
    cleanupFunctions.push(unsubFailed);
    
    // FIX BUG: Handle handoff cancellation - clear visual states
    const unsubCancelled = handoffService.onHandoffCancelled((targetPersona, _reason) => {
      clearSwitchingFeedback(targetPersona);
    });
    cleanupFunctions.push(unsubCancelled);
    
    // 🍴 Setup avatar as drop zone for "eating" marketplace agents
    avatarFeedback.setupDropZone(handleAgentDropped);

  } catch (error) {
    log.error('Failed to initialize Team UI:', error);
  }
}

/**
 * Handle when an agent is dropped onto the avatar (uninstall)
 * 🍴 The avatar "eats" the agent - satisfying uninstall UX
 */
function handleAgentDropped(agentId: string): void {
  log.debug('Avatar is eating agent:', agentId);
  
  // Get agent name for feedback
  const installedAgents = marketplaceService.getInstalledAgents();
  const agent = installedAgents.find(a => a.id === agentId);
  const name = agent?.manifest?.identity?.name || agentId;
  
  // Uninstall the agent
  marketplaceService.uninstallAgent(agentId);
  
  // Remove from UI
  const element = teamMemberElements.get(agentId as PersonaId);
  if (element) {
    // Animate removal using design system constants
    void element.animate([
      { transform: 'scale(1)', opacity: '1' },
      { transform: 'scale(0)', opacity: '0' },
    ], {
      duration: DURATION.SLOW,
      easing: EASING.EASE_IN,
      fill: 'forwards',
    }).finished.then(() => {
      element.remove();
      teamMemberElements.delete(agentId as PersonaId);

      // Check if we need to remove the marketplace divider
      const marketplaceDivider = rosterContainer?.querySelector('.team-divider--marketplace');
      const remainingMarketplaceAgents = rosterContainer?.querySelectorAll('.team-member--marketplace-agent');
      if (marketplaceDivider && remainingMarketplaceAgents?.length === 0) {
        marketplaceDivider.remove();
      }
    });
  }
  
  log.info('Uninstalled:', name);
}

/**
 * FIX BUG #57: Create a visually hidden ARIA live region for screen reader announcements.
 */
function createAriaLiveRegion(): void {
  if (ariaLiveRegion) return;
  
  ariaLiveRegion = document.createElement('div');
  ariaLiveRegion.setAttribute('aria-live', 'polite');
  ariaLiveRegion.setAttribute('aria-atomic', 'true');
  ariaLiveRegion.setAttribute('role', 'status');
  // Visually hidden but accessible to screen readers
  ariaLiveRegion.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  ariaLiveRegion.className = 'sr-only';
  document.body.appendChild(ariaLiveRegion);
}

/**
 * FIX BUG #57: Announce a message to screen readers via the ARIA live region.
 */
function announceToScreenReader(message: string): void {
  if (!ariaLiveRegion) return;
  
  // Clear then set to trigger announcement
  ariaLiveRegion.textContent = '';
  // Small delay ensures the clear is processed before new content
  setTimeout(() => {
    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = message;
    }
  }, 50);
}

/**
 * FIX BUG #58: Focus the next team member in the list (arrow key navigation).
 */
function focusNextTeamMember(currentId: PersonaId): void {
  const ids = Array.from(teamMemberElements.keys());
  const currentIndex = ids.indexOf(currentId);
  const nextIndex = (currentIndex + 1) % ids.length;
  const nextId = ids[nextIndex];
  if (nextId) {
    const nextElement = teamMemberElements.get(nextId);
    if (nextElement) {
      nextElement.focus();
    }
  }
}

/**
 * FIX BUG #58: Focus the previous team member in the list (arrow key navigation).
 */
function focusPreviousTeamMember(currentId: PersonaId): void {
  const ids = Array.from(teamMemberElements.keys());
  const currentIndex = ids.indexOf(currentId);
  const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
  const prevId = ids[prevIndex];
  if (prevId) {
    const prevElement = teamMemberElements.get(prevId);
    if (prevElement) {
      prevElement.focus();
    }
  }
}

// ============================================================================
// ROSTER BUILDING
// ============================================================================

/** Flag to track if we're using dynamic agents */
let usingDynamicAgents = false;

/** Check if using dynamic agents */
export function isDynamicAgentsEnabled(): boolean {
  return usingDynamicAgents;
}

/**
 * Build the team roster - supports both dynamic API agents and hardcoded HTML.
 * First tries to load from API, falls back to existing HTML elements.
 */
function buildTeamRoster(): void {
  if (!rosterContainer) return;

  // Try to load dynamic agents
  loadDynamicAgents().catch((err) => {
    log.warn('Failed to load dynamic agents, using static HTML:', err);
    // Fall back to static HTML
    attachEventListenersToExistingElements();
  });
}

/**
 * Load agents from API and render dynamically
 */
async function loadDynamicAgents(): Promise<void> {
  if (!rosterContainer) return;

  // Show loading state
  showRosterLoading();

  try {
    const agents = await fetchAgents();
    
    if (agents.length === 0) {
      throw new Error('No agents returned from API');
    }

    // Filter agents by roster preferences ("Get to Know Ferni First" UX pattern)
    // Only show agents that are visible in the user's roster
    const visibleMemberIds = rosterPreferences.getVisibleMembers();
    const visibleAgents = agents.filter(agent => {
      // Coordinator (Ferni) always visible
      if (agent.isCoordinator) return true;
      // Other team members only if in visible roster
      return visibleMemberIds.includes(agent.id as TeamMemberId);
    });

    // Sort agents to ensure consistent order regardless of API response
    // Order: Ferni (coordinator) first, then team members in canonical order
    const CANONICAL_ORDER = ['ferni', 'peter-john', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel'];
    const sortedAgents = [...visibleAgents].sort((a, b) => {
      // Coordinator always first
      if (a.isCoordinator && !b.isCoordinator) return -1;
      if (!a.isCoordinator && b.isCoordinator) return 1;
      
      // Then by canonical order
      const aIndex = CANONICAL_ORDER.indexOf(a.id);
      const bIndex = CANONICAL_ORDER.indexOf(b.id);
      
      // Unknown agents go to the end
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });

    // Clear existing roster
    teamMemberElements.clear();
    rosterContainer.innerHTML = '';

    // Render core agents dynamically (using sorted order)
    for (const agent of sortedAgents) {
      const element = createTeamMemberElement(agent);
      
      // Add divider after coordinator (first agent)
      if (agent.isCoordinator && sortedAgents.length > 1) {
        rosterContainer.appendChild(element);
        const divider = document.createElement('span');
        divider.className = 'team-divider';
        rosterContainer.appendChild(divider);
      } else {
        rosterContainer.appendChild(element);
      }

      teamMemberElements.set(agent.id as PersonaId, element);
      attachEventListenersToElement(element, agent.id as PersonaId, agent.name);
    }

    // 🏪 Load and render installed marketplace agents
    await loadInstalledMarketplaceAgents();

    // 🏪 Add marketplace button after all agents
    addMarketplaceButton();

    usingDynamicAgents = true;
    log.debug('Rendered agents dynamically (sorted):', sortedAgents.length);
    
    // Hide loading shimmer - FIX BUG: was only called in error case
    hideRosterLoading();
    
    // Re-add entrance animation class
    rosterContainer.classList.add('entrance-roster');
    
    // Mark entrance complete after animation
    setTimeout(() => {
      rosterContainer?.classList.add('entrance-complete');
    }, 800);

  } catch (err) {
    log.warn('Dynamic agent loading failed:', err);
    hideRosterLoading();
    throw err;
  }
}

/**
 * Load and render installed marketplace agents
 */
function loadInstalledMarketplaceAgents(): void {
  if (!rosterContainer) return;
  
  const installed = marketplaceService.getInstalledAgents();
  
  if (installed.length === 0) return;
  
  // Add divider before marketplace agents
  const divider = document.createElement('span');
  divider.className = 'team-divider team-divider--marketplace';
  divider.setAttribute('data-label', 'installed');
  rosterContainer.appendChild(divider);
  
  for (const installedAgent of installed) {
    // Create element from installed agent data
    const element = createMarketplaceAgentElement(installedAgent);
    rosterContainer.appendChild(element);
    
    // Track element for updates
    teamMemberElements.set(installedAgent.id as PersonaId, element);
    
    // Attach click listener
    attachMarketplaceAgentListeners(element, installedAgent);
  }
  
  log.debug('Loaded installed marketplace agents:', installed.length);
}

/**
 * Create a team member element from installed marketplace agent
 * 🍴 Marketplace agents are draggable - drag to avatar to uninstall!
 */
function createMarketplaceAgentElement(agent: marketplaceService.InstalledAgent): HTMLElement {
  const manifest = agent.manifest ?? {};
  const element = document.createElement('div');
  
  // Get display info from manifest or fallback
  const manifestIdentity = (manifest as { identity?: { name?: string } })?.identity;
  const name = manifestIdentity?.name || agent.id.split('-').map(w => (w[0] ?? '').toUpperCase() + w.slice(1)).join(' ');
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  // Display first name only in roster for cleaner UI
  const displayName = getFirstName(name);
  
  element.className = 'team-member team-member--marketplace-agent';
  element.setAttribute('data-persona-id', agent.id);
  element.setAttribute('data-marketplace-agent', 'true');
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', `Talk to ${name}. Drag to avatar to remove.`);
  element.setAttribute('aria-pressed', 'false');
  
  // 🍴 Make draggable for fun "feed to avatar" uninstall
  element.setAttribute('draggable', 'true');
  
  // Build gradient from manifest colors if available, or use design system fallback
  const marketplaceInfo = (manifest as { marketplace?: { colors?: { gradient?: string } } })?.marketplace;
  const colors = marketplaceInfo?.colors;
  // Fallback uses CSS variables for muted earthy tones from design system
  const gradient = colors?.gradient || 
    'linear-gradient(135deg, var(--color-natural-stone, #7a6f63), var(--color-natural-wood, #9a8f82))';
  
  element.innerHTML = `
    <div class="team-avatar-container">
      <div class="team-avatar-ring"></div>
      <div class="team-avatar" style="--persona-gradient: ${gradient};">
        ${initials}
      </div>
    </div>
    <span class="team-name">${displayName}</span>
    <span class="drag-hint" aria-hidden="true">Drag to remove</span>
  `;
  
  return element;
}

/**
 * Attach event listeners to marketplace agent element
 * 🍴 Includes drag handlers for "feed to avatar" uninstall interaction
 */
function attachMarketplaceAgentListeners(
  element: HTMLElement, 
  agent: marketplaceService.InstalledAgent
): void {
  const name = agent.manifest?.identity?.name || agent.id;
  
  // Click to show agent info (full voice integration requires backend support)
  // FUTURE: Implement handoff.service.ts support for marketplace agents
  const cleanup = addListener(element, 'click', (e) => {
    e.stopPropagation();
    
    log.debug('Clicked marketplace agent:', name);
    
    // Visual feedback
    element.classList.add('team-member--clicked');
    setTimeout(() => element.classList.remove('team-member--clicked'), 300);
    
    // Show marketplace modal with agent details
    void marketplaceUI.open();
  });
  cleanupFunctions.push(cleanup);
  
  // 🍴 Drag start - prepare agent for feeding to avatar
  const dragStartCleanup = addListener(element, 'dragstart', (e) => {
    if (!e.dataTransfer) return;
    
    e.dataTransfer.setData('text/plain', agent.id);
    e.dataTransfer.effectAllowed = 'move';
    
    // Visual feedback - element becomes semi-transparent
    element.classList.add('team-member--dragging');
    
    // Create a custom drag image (the avatar only)
    const avatarEl = element.querySelector('.team-avatar') as HTMLElement;
    if (avatarEl) {
      const clone = avatarEl.cloneNode(true) as HTMLElement;
      clone.style.cssText = `
        position: absolute;
        top: -1000px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${avatarEl.style.getPropertyValue('--persona-gradient') || 'linear-gradient(135deg, var(--color-natural-stone, #7a6f63), var(--color-natural-wood, #9a8f82))'};
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: var(--persona-text, white);
        font-size: var(--text-sm, 14px);
      `;
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, 24, 24);
      // Clean up clone after drag starts
      requestAnimationFrame(() => clone.remove());
    }
  });
  cleanupFunctions.push(dragStartCleanup);
  
  // 🍴 Drag end - reset visual state
  const dragEndCleanup = addListener(element, 'dragend', () => {
    element.classList.remove('team-member--dragging');
  });
  cleanupFunctions.push(dragEndCleanup);
}

/**
 * Extract first name from full name for roster display
 * Shows "Ferni" instead of "Ferni", "Alex" instead of "Alex Chen", etc.
 */
function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/**
 * Create a team member DOM element from API agent data
 */
function createTeamMemberElement(agent: ApiAgent): HTMLElement {
  const element = document.createElement('div');
  element.className = `team-member${agent.isCoordinator ? ' team-member--coach' : ''}`;
  element.setAttribute('data-persona-id', agent.id);
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', `Talk to ${agent.name}`);
  element.setAttribute('aria-pressed', 'false');
    
  // Get colors - from API or fall back to design system persona colors
  const colors = agent.colors || getPersonaColorConfig(agent.id);
  // Use CSS variables with hardcoded fallbacks for safety
  const gradient = colors?.gradient || `linear-gradient(135deg, ${colors?.secondary || 'var(--persona-secondary, #3d5a35)'}, ${colors?.primary || 'var(--persona-primary, #4a6741)'})`;

  // Display first name only in roster for cleaner UI
  const displayName = getFirstName(agent.name);

  element.innerHTML = `
    <div class="team-avatar-container">
      <div class="team-avatar-ring"></div>
      <div class="team-avatar" style="--persona-gradient: ${gradient};">${agent.initials}</div>
    </div>
    <span class="team-name">${displayName}</span>
  `;

  return element;
}

/**
 * Attach event listeners to a team member element
 */
function attachEventListenersToElement(element: HTMLElement, personaId: PersonaId, _name: string): void {
    // Add click handler
  const cleanup = addListener(element, 'click', () => {
      onTeamMemberClick(personaId);
    });
    cleanupFunctions.push(cleanup);

  // Keyboard handler with transition awareness
  const keyCleanup = addListener(element, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (handoffService.isTransitioning) {
          announceToScreenReader(`Please wait. Transitioning to ${handoffService.targetPersona || 'new agent'}.`);
          return;
        }
        onTeamMemberClick(personaId);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        focusNextTeamMember(personaId);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusPreviousTeamMember(personaId);
      }
    });
    cleanupFunctions.push(keyCleanup);
    
    // 🎬 PIXAR: Add magnetic pull hover animation
  const hoverCleanup = addListener(element, 'mouseenter', () => {
    startMagneticHover(element);
    });
    cleanupFunctions.push(hoverCleanup);
    
  const leaveCleanup = addListener(element, 'mouseleave', () => {
    stopMagneticHover(element);
    });
    cleanupFunctions.push(leaveCleanup);
    
  const moveCleanup = addListener(element, 'mousemove', (e) => {
    updateMagneticPull(element, e);
    });
    cleanupFunctions.push(moveCleanup);
  }

/**
 * Show loading skeleton in roster
 */
function showRosterLoading(): void {
  if (!rosterContainer) return;
  
  // Add loading class for CSS animations
  rosterContainer.classList.add('roster-loading');
  
  // Don't clear existing content - keep as fallback
}

/**
 * Hide loading state
 */
function hideRosterLoading(): void {
  if (!rosterContainer) return;
  rosterContainer.classList.remove('roster-loading');
}

/**
 * 🏪 Add marketplace button to the roster.
 * Opens the agent marketplace modal for browsing/installing external agents.
 */
function addMarketplaceButton(): void {
  if (!rosterContainer) return;
  
  // Don't add if already exists
  if (document.getElementById('marketplaceBtn')) return;
  
  const marketplaceBtn = document.createElement('button');
  marketplaceBtn.id = 'marketplaceBtn';
  marketplaceBtn.className = 'team-member team-member--marketplace';
  marketplaceBtn.setAttribute('role', 'button');
  marketplaceBtn.setAttribute('tabindex', '0');
  marketplaceBtn.setAttribute('aria-label', 'Add more agents');
  marketplaceBtn.innerHTML = `
    <div class="team-avatar-container">
      <div class="team-avatar-ring marketplace-ring"></div>
      <div class="team-avatar marketplace-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    </div>
    <span class="team-name">More</span>
  `;
  
  rosterContainer.appendChild(marketplaceBtn);
  
  // Attach click listener directly (button is created dynamically)
  const cleanup = addListener(marketplaceBtn, 'click', (e) => {
    e.stopPropagation();
    marketplaceUI.open();
  });
  cleanupFunctions.push(cleanup);
  
  log.debug('Added marketplace button to roster');
}

/**
 * Fall back to attaching event listeners to existing HTML elements
 * (Original implementation for backwards compatibility)
 */
function attachEventListenersToExistingElements(): void {
  if (!rosterContainer) return;

  // Clear the map
  teamMemberElements.clear();

  // Find existing team member elements in the DOM
  const existingElements = rosterContainer.querySelectorAll('.team-member');
  
  for (const element of existingElements) {
    const personaId = element.getAttribute('data-persona-id') as PersonaId | null;
    if (!personaId) continue;
    
    // Store reference
    teamMemberElements.set(personaId, element as HTMLElement);
    
    // FIX BUG #56: Add accessibility attributes for screen readers
    const htmlElement = element as HTMLElement;
    const persona = getPersona(personaId);
    htmlElement.setAttribute('role', 'button');
    htmlElement.setAttribute('tabindex', '0');
    htmlElement.setAttribute('aria-label', `Switch to ${persona.name}`);
    htmlElement.setAttribute('aria-pressed', 'false');
    
    attachEventListenersToElement(htmlElement, personaId, persona.name);
  }
  
  usingDynamicAgents = false;
  log.debug('Attached listeners to existing elements:', existingElements.length);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle team member click.
 * Apple-style: seamless switching whether connected or not.
 * When connected: shows immediate visual feedback, then requests handoff.
 * When disconnected: previews the persona's theme.
 * 
 * FIX BUG #36: Prevents clicks during active transitions.
 */
function onTeamMemberClick(personaId: PersonaId): void {
  const current = appState.get('activePersona');
  const connectionState = appState.get('connection');
  log.debug('Team member clicked:', { personaId, currentId: current.id, connectionState });
  
  // FIX BUG #36 & #93: Prevent clicks during active transition
  const isTransitioning = handoffService.isTransitioning;
  const targetPersona = handoffService.targetPersona;
  log.debug('Transition check:', { isTransitioning, targetPersona });
  
  if (isTransitioning) {
    log.debug('Ignoring click - handoff transition in progress to:', targetPersona);
    // Visual feedback that click was received but ignored
    const element = teamMemberElements.get(personaId);
    if (element) {
      addClass(element, 'click-blocked');
      setTimeout(() => removeClass(element, 'click-blocked'), 200);
    }
    return;
  }
  
  if (current.id === personaId) {
    // Subtle pulse to acknowledge the tap
    const element = teamMemberElements.get(personaId);
    if (element) {
      addClass(element, 'pulse');
      setTimeout(() => removeClass(element, 'pulse'), 300);
    }
    return;
  }

  // When connected, show immediate feedback then request handoff
  if (connectionState === 'connected') {
    log.debug('Connected - sending handoff request to:', personaId);
    showSwitchingFeedback(current.id, personaId);
    sendHandoffRequest(personaId);
    return;
  }
  log.debug('Not connected - previewing theme:', { connectionState });

  // When disconnected, preview the theme immediately
  previewPersonaTheme(personaId);
}

/**
 * Clear the visual switching feedback states.
 * Called when handoff fails, times out, or is cancelled.
 */
function clearSwitchingFeedback(targetPersonaId: PersonaId): void {
  log.debug('Clearing switching feedback for:', targetPersonaId);
  
  // Clear switching-to from target
  const targetElement = teamMemberElements.get(targetPersonaId);
  if (targetElement) {
    removeClass(targetElement, 'switching-to');
    removeClass(targetElement, 'send-failed');
  }
  
  // Clear switching-from from all elements (in case we don't know which one)
  for (const [_id, element] of teamMemberElements.entries()) {
    removeClass(element, 'switching-from');
  }
  
  // Restore the current active persona highlighting
  const current = appState.get('activePersona');
  const currentElement = teamMemberElements.get(current.id);
  if (currentElement) {
    addClass(currentElement, 'active');
  }
}

/**
 * Show immediate visual feedback when switching personas.
 * Apple-style: optimistic UI - show the change before server confirms.
 * 🎬 Pixar-style energy transfer animation between team members.
 */
function showSwitchingFeedback(fromId: PersonaId, toId: PersonaId): void {
  const fromElement = teamMemberElements.get(fromId);
  const toElement = teamMemberElements.get(toId);
  
  // Dim the current persona
  if (fromElement) {
    addClass(fromElement, 'switching-from');
  }
  
  // Highlight the target persona with a subtle glow
  if (toElement) {
    addClass(toElement, 'switching-to');
  }
  
  // 🎬 Energy transfer animation - magical pulse travels from one to the other
  if (fromElement && toElement) {
    createEnergyTransfer(fromElement, toElement, toId);
  }
  
  // Immediately update the theme preview for seamless feel
  previewPersonaTheme(toId);
  
  // FIX BUG #21: Use configurable constant instead of hardcoded 800ms
  // Clear switching states after a moment (handoff will complete the transition)
  setTimeout(() => {
    if (fromElement) removeClass(fromElement, 'switching-from');
    if (toElement) removeClass(toElement, 'switching-to');
  }, HANDOFF_TIMING.MAX_FEEDBACK_DELAY);
}

/**
 * 🎬 Create energy transfer animation between two team members.
 * A glowing orb travels from one persona to another during handoff.
 */
function createEnergyTransfer(fromEl: HTMLElement, toEl: HTMLElement, toPersonaId: PersonaId): void {
  // Don't run if reduced motion is preferred
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  
  // Get persona color for the orb
  const persona = getPersona(toPersonaId);
  const color = persona.colors?.primary ?? 'var(--persona-primary)';
  const glow = persona.colors?.glow ?? 'var(--persona-glow)';
  
  // Create the energy orb
  const orb = document.createElement('div');
  orb.className = 'energy-orb';
  orb.style.cssText = `
    position: fixed;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: radial-gradient(circle, ${color} 0%, transparent 70%);
    box-shadow: 0 0 20px ${glow}, 0 0 40px ${glow}, 0 0 60px ${glow};
    pointer-events: none;
    z-index: var(--z-modal);
    transform: translate(-50%, -50%);
    left: ${fromRect.left + fromRect.width / 2}px;
    top: ${fromRect.top + fromRect.height / 2}px;
  `;
  
  document.body.appendChild(orb);
  
  // Calculate path (slightly curved arc)
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  const midX = (startX + endX) / 2;
  const midY = Math.min(startY, endY) - 30; // Arc upward
  
  // Animate using Web Animations API
  orb.animate([
    { 
      left: `${startX}px`, 
      top: `${startY}px`, 
      transform: 'translate(-50%, -50%) scale(0.5)',
      opacity: 0,
    },
    { 
      left: `${startX}px`, 
      top: `${startY}px`, 
      transform: 'translate(-50%, -50%) scale(1.2)',
      opacity: 1,
      offset: 0.15,
    },
    { 
      left: `${midX}px`, 
      top: `${midY}px`, 
      transform: 'translate(-50%, -50%) scale(1.5)',
      opacity: 1,
      offset: 0.5,
    },
    { 
      left: `${endX}px`, 
      top: `${endY}px`, 
      transform: 'translate(-50%, -50%) scale(1.2)',
      opacity: 1,
      offset: 0.85,
    },
    { 
      left: `${endX}px`, 
      top: `${endY}px`, 
      transform: 'translate(-50%, -50%) scale(2)',
      opacity: 0,
    },
  ], {
    duration: ANIMATION_PRESET.TEAM_SELECT.duration + DURATION.FAST,
    easing: EASING.SPRING,
    fill: 'forwards',
  });
  
  // Create trail particles following the orb
  let particleCount = 0;
  const maxParticles = 8;
  const particleInterval = setInterval(() => {
    if (particleCount >= maxParticles) {
      clearInterval(particleInterval);
      return;
    }
    
    const progress = particleCount / maxParticles;
    const t = progress;
    // Quadratic bezier interpolation for curved path
    const x = (1-t)*(1-t)*startX + 2*(1-t)*t*midX + t*t*endX;
    const y = (1-t)*(1-t)*startY + 2*(1-t)*t*midY + t*t*endY;
    
    createTrailParticle(x, y, color);
    particleCount++;
  }, 40);
  
  // Remove orb after animation
  setTimeout(() => orb.remove(), 600);
}

/**
 * Create a trail particle for the energy transfer.
 */
function createTrailParticle(x: number, y: number, color: string): void {
  const particle = document.createElement('div');
  particle.style.cssText = `
    position: fixed;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${color};
    pointer-events: none;
    z-index: var(--z-modal);
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%);
    opacity: 0.8;
  `;
  
  document.body.appendChild(particle);
  
  particle.animate([
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.8 },
    { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
  ], {
    duration: ANIMATION_PRESET.TEAM_SELECT.duration,
    easing: EASING.EASE_OUT,
  });
  
  setTimeout(() => particle.remove(), ANIMATION_PRESET.TEAM_SELECT.duration);
}

/**
 * Preview a persona's theme without connecting.
 * Updates the UI to show the persona's colors.
 * Also updates selectedPersona so Connect will connect to this persona.
 * 
 * FIX BUG #19: This intentionally sets both states when disconnected.
 * - selectedPersona: Which persona Connect button will connect to
 * - activePersona: For UI theming (only valid when disconnected; when connected,
 *   activePersona is set by actual handoff events from the backend)
 */
function previewPersonaTheme(personaId: PersonaId): void {
  const persona = getPersona(personaId);
  const connectionState = appState.get('connection');
  
  // Always update selectedPersona - this is what Connect will use
  appState.set('selectedPersona', persona);
  
  // FIX BUG #19: Only update activePersona when disconnected
  // When connected, activePersona should only change via actual handoff events
  if (connectionState !== 'connected') {
    appState.set('activePersona', persona);
  }
  
  // Update document theme
  document.body.setAttribute('data-persona', personaId);
  
  // Update waveform theme
  void import('../ui/waveform.ui.js').then(({ waveformUI }) => {
    waveformUI.setPersona(personaId);
  });
  
  // Update coach UI
  void import('../ui/coach.ui.js').then(({ coachUI }) => {
    coachUI.updatePersona(persona);
  });
  
}

/**
 * Send a handoff request to the agent.
 * FIX BUG #46: Now provides user feedback on failures and resets transition state.
 */
function sendHandoffRequest(targetPersonaId: PersonaId): void {
  log.debug('Sending handoff request to:', targetPersonaId);
  
  /**
   * Handle send failure with user feedback and state reset.
   */
  const handleSendFailure = (error: unknown, context: string): void => {
    log.error(`${context}:`, error);
    
    // Reset transition state on failure (handoffService internally tracks this)
    // Clear switching feedback from UI
    const element = teamMemberElements.get(targetPersonaId);
    if (element) {
      removeClass(element, 'switching-to');
      addClass(element, 'send-failed');
      setTimeout(() => removeClass(element, 'send-failed'), 1000);
    }
    
    // Restore the current persona's highlighting
    const current = appState.get('activePersona');
    const currentElement = teamMemberElements.get(current.id);
    if (currentElement) {
      removeClass(currentElement, 'switching-from');
    }
  };
  
  // FIX BUG #54: Validate persona ID before sending to prevent arbitrary string injection
  if (!isKnownPersonaId(targetPersonaId)) {
    handleSendFailure(
      new Error(`Invalid persona ID: ${targetPersonaId}`), 
      `Cannot send handoff request: unknown persona "${targetPersonaId}"`
    );
    return;
  }

  // FIX BUG #82: Add retry logic for failed handoff requests
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 500;
  
  const attemptSend = async (attempt: number = 0): Promise<void> => {
    try {
      const { connectionService } = await import('../services/connection.service.js');
      const room = connectionService.getRoom();
      
      if (!room) {
        throw new Error('No room');
      }
      if (!room.localParticipant) {
        throw new Error('No local participant');
      }

      // Create handoff request message
      const message = JSON.stringify({
        type: 'handoff_request',
        target: targetPersonaId,
        timestamp: Date.now(),
        attempt: attempt + 1, // Include attempt number for debugging
      });

      log.debug('Publishing handoff message:', { attempt: attempt + 1, message });

      // Send via data channel
      await room.localParticipant.publishData(
        new TextEncoder().encode(message),
        { reliable: true }
      );
      
      log.info('Handoff request sent successfully to:', targetPersonaId);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        log.warn('Handoff request failed, retrying:', { attempt: attempt + 1, retryDelayMs: RETRY_DELAY_MS });
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return attemptSend(attempt + 1);
      }
      handleSendFailure(err instanceof Error ? err : new Error(String(err)), 
        `Failed to send handoff request after ${MAX_RETRIES + 1} attempts`);
    }
  };
  
  void attemptSend();
}

/**
 * Handle handoff event.
 */
function handleHandoff(handoff: NormalizedHandoff): void {
  
  // Update active state
  setActiveTeamMember(handoff.toPersona);
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Update which team member is active based on persona.
 */
function updateActiveTeamMember(persona: PersonaConfig): void {
  setActiveTeamMember(persona.id);
}

/**
 * Set the active team member.
 * Now includes the coach (Ferni) in the roster.
 * FIX BUG #56: Updates aria-pressed for screen reader accessibility.
 * 🎬 Now with Pixar step-forward animation!
 */
export function setActiveTeamMember(personaId: PersonaId): void {
  // Track previous active for step-back animation
  let previousActiveId: PersonaId | null = null;
  
  // Activate the matching team member, deactivate others
  for (const [id, element] of teamMemberElements.entries()) {
    if (element.classList.contains('active') && id !== personaId) {
      previousActiveId = id;
    }
    
    if (id === personaId) {
      addClass(element, 'active');
      // FIX BUG #56: Update aria-pressed for screen readers
      element.setAttribute('aria-pressed', 'true');
      element.setAttribute('aria-current', 'true');
    } else {
      removeClass(element, 'active');
      element.setAttribute('aria-pressed', 'false');
      element.removeAttribute('aria-current');
    }
  }
  
  // 🎬 Pixar animations for persona transition
  if (previousActiveId && previousActiveId !== personaId) {
    // Step back the previous persona
    playStepBack(previousActiveId);
    
    // Step forward the new persona with slight delay
    setTimeout(() => {
      playStepForward(personaId);
      // Team cheer after the new persona steps forward
      setTimeout(() => playTeamCheer(personaId), 200);
    }, 150);
  }
}

/**
 * Show/hide the team roster.
 */
export function setRosterVisible(visible: boolean): void {
  if (!rosterContainer) return;
  
  if (visible) {
    removeClass(rosterContainer, 'hidden');
  } else {
    addClass(rosterContainer, 'hidden');
  }
}

// ============================================================================
// 🎬 PIXAR MAGNETIC HOVER ANIMATIONS
// ============================================================================

/**
 * Start the magnetic hover effect.
 * Like the avatar is magnetically attracted to the cursor.
 * 
 * Pixar Principles:
 * - ANTICIPATION: Slight lean toward cursor
 * - APPEAL: Characters feel curious and engaged
 * - SECONDARY ACTION: Subtle scale pulse
 */
function startMagneticHover(element: HTMLElement): void {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Cancel any existing animation
  if (activeHoverAnimation) {
    activeHoverAnimation.cancel();
  }
  
  // Entrance animation - character "perks up"
  activeHoverAnimation = element.animate([
    { transform: 'scale(1) translateY(0)', offset: 0 },
    { transform: 'scale(1.02) translateY(-2px)', offset: 0.4 },
    { transform: 'scale(1.05) translateY(-4px)', offset: 0.7 },
    { transform: 'scale(1.08) translateY(-6px)', offset: 1 },
  ], {
    duration: ANIMATION_PRESET.TEAM_HOVER.duration,
    easing: EASING.SPRING, // Bouncy spring
    fill: 'forwards',
  });
  
  // Add hover class for CSS effects (glow, shadow)
  element.classList.add('pixar-hover');
}

/**
 * Stop the magnetic hover effect.
 * Smooth settle back to resting position.
 */
function stopMagneticHover(element: HTMLElement): void {
  // Cancel magnetic animation frame
  if (magneticAnimationFrame) {
    cancelAnimationFrame(magneticAnimationFrame);
    magneticAnimationFrame = null;
  }
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.style.transform = '';
    element.classList.remove('pixar-hover');
    return;
  }
  
  // Cancel entrance animation
  if (activeHoverAnimation) {
    activeHoverAnimation.cancel();
    activeHoverAnimation = null;
  }
  
  // Get current transform for smooth exit
  const computedStyle = getComputedStyle(element);
  const currentTransform = computedStyle.transform || 'none';
  
  // Settle back animation
  const settleAnimation = element.animate([
    { transform: currentTransform, offset: 0 },
    { transform: 'scale(1.02) translateY(-2px)', offset: 0.3 },
    { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
    { transform: 'scale(1) translateY(0)', offset: 1 },
  ], {
    duration: DURATION.SLOW,
    easing: EASING.STANDARD,
    fill: 'forwards',
  });
  
  settleAnimation.onfinish = () => {
    element.style.transform = '';
  };
  
  element.classList.remove('pixar-hover');
}

/**
 * Update the magnetic pull based on cursor position.
 * The avatar "leans" toward the cursor with subtle rotation.
 */
function updateMagneticPull(element: HTMLElement, event: MouseEvent): void {
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Cancel previous frame
  if (magneticAnimationFrame) {
    cancelAnimationFrame(magneticAnimationFrame);
  }
  
  magneticAnimationFrame = requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate offset from center
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    
    // Normalize to element size (max ~15% of dimension)
    const maxOffset = 6;
    const offsetX = Math.max(-maxOffset, Math.min(maxOffset, deltaX * 0.15));
    const offsetY = Math.max(-maxOffset, Math.min(maxOffset, deltaY * 0.15));
    
    // Calculate rotation based on cursor position (max 3 degrees)
    const rotateZ = (deltaX / rect.width) * 3;
    
    // Apply magnetic pull transform
    element.style.transform = `
      scale(1.08) 
      translateX(${offsetX}px) 
      translateY(${-6 + offsetY}px) 
      rotateZ(${rotateZ}deg)
    `;
  });
}

/**
 * 🎬 Play step-forward animation when persona is selected.
 * Like a character stepping up to the spotlight.
 */
export function playStepForward(personaId: PersonaId): void {
  const element = teamMemberElements.get(personaId);
  if (!element) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Step forward with squash/stretch
  element.animate([
    // Start: Normal position
    { transform: 'scale(1) translateY(0) translateZ(0)', offset: 0 },
    // Anticipation: Slight crouch/squash
    { transform: 'scale(1.02, 0.96) translateY(2px) translateZ(0)', offset: 0.15 },
    // Launch forward with stretch
    { transform: 'scale(0.96, 1.06) translateY(-12px) translateZ(20px)', offset: 0.4 },
    // Overshoot
    { transform: 'scale(0.98, 1.04) translateY(-16px) translateZ(25px)', offset: 0.55 },
    // Land with squash
    { transform: 'scale(1.04, 0.96) translateY(-10px) translateZ(15px)', offset: 0.7 },
    // Settle into spotlight position
    { transform: 'scale(1.1) translateY(-8px) translateZ(10px)', offset: 1 },
  ], {
    duration: ANIMATION_PRESET.TEAM_SELECT.duration + DURATION.FAST,
    easing: EASING.SPRING,
    fill: 'forwards',
  });
}

/**
 * 🎬 Play step-back animation when persona loses focus.
 */
export function playStepBack(personaId: PersonaId): void {
  const element = teamMemberElements.get(personaId);
  if (!element) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.style.transform = '';
    return;
  }
  
  // Get current transform
  const computedStyle = getComputedStyle(element);
  const currentTransform = computedStyle.transform || 'none';
  
  // Step back to line
  const animation = element.animate([
    { transform: currentTransform, offset: 0 },
    { transform: 'scale(1.02) translateY(-4px)', offset: 0.3 },
    { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
    { transform: 'scale(1) translateY(0)', offset: 1 },
  ], {
    duration: ANIMATION_PRESET.TEAM_SELECT.duration - DURATION.MICRO,
    easing: EASING.STANDARD,
    fill: 'forwards',
  });
  
  animation.onfinish = () => {
    element.style.transform = '';
  };
}

/**
 * 🎬 Play supporting cheer animation on other team members.
 * Like characters celebrating a teammate's success.
 */
export function playTeamCheer(selectedId: PersonaId): void {
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Animate all other team members with staggered timing
  let delay = 0;
  const staggerMs = 80;
  
  for (const [id, element] of teamMemberElements.entries()) {
    if (id === selectedId) continue;
    
    // Small bounce cheer animation
    setTimeout(() => {
      element.animate([
        { transform: 'scale(1) translateY(0)', offset: 0 },
        { transform: 'scale(1.03) translateY(-3px)', offset: 0.3 },
        { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
        { transform: 'scale(1) translateY(0)', offset: 1 },
      ], {
        duration: DURATION.SLOW,
        easing: EASING.SPRING,
      });
    }, delay);
    
    delay += staggerMs;
  }
}

/**
 * Clean up resources.
 */
export function dispose(): void {
  for (const fn of cleanupFunctions) {
    fn();
  }
  cleanupFunctions.length = 0;
  teamMemberElements.clear();
  
  // 🎬 Clean up animation state
  if (activeHoverAnimation) {
    activeHoverAnimation.cancel();
    activeHoverAnimation = null;
  }
  if (magneticAnimationFrame) {
    cancelAnimationFrame(magneticAnimationFrame);
    magneticAnimationFrame = null;
  }
  
  // FIX BUG #57: Clean up ARIA live region
  if (ariaLiveRegion && ariaLiveRegion.parentNode) {
    ariaLiveRegion.parentNode.removeChild(ariaLiveRegion);
    ariaLiveRegion = null;
  }
}

/**
 * Refresh the marketplace agents section of the roster.
 * Call this after installing/uninstalling agents.
 */
export async function refreshMarketplaceAgents(): Promise<void> {
  if (!rosterContainer) return;
  
  // Remove existing marketplace agents and divider
  const existingAgents = rosterContainer.querySelectorAll('[data-marketplace-agent="true"]');
  const existingDivider = rosterContainer.querySelector('.team-divider--marketplace');
  
  existingAgents.forEach(el => {
    const id = el.getAttribute('data-persona-id');
    if (id) teamMemberElements.delete(id as PersonaId);
    el.remove();
  });
  existingDivider?.remove();
  
  // Remove the marketplace button temporarily
  const marketplaceBtn = document.getElementById('marketplaceBtn');
  marketplaceBtn?.remove();
  
  // Re-add installed agents
  await loadInstalledMarketplaceAgents();
  
  // Re-add marketplace button
  addMarketplaceButton();
  
  log.debug('Refreshed marketplace agents in roster');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamUI = {
  init: initTeamUI,
  setActive: setActiveTeamMember,
  setVisible: setRosterVisible,
  refreshMarketplaceAgents,
  dispose,
};

