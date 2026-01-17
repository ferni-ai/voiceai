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

import { ANIMATION_PRESET, DURATION, EASING } from '../config/animation-constants.js';
import { HANDOFF_TIMING } from '../config/index.js';
import { getPersonaColorConfig } from '../config/persona-colors.js';
import { getPersona, isKnownPersonaId } from '../config/personas.js';
import { fetchAgents, type ApiAgent } from '../services/agents.service.js';
import { handoffService } from '../services/handoff.service.js';
import * as marketplaceService from '../services/marketplace.service.js';
import { rosterPreferences, type TeamMemberId } from '../services/roster-preferences.service.js';
import {
  clearNewlyUnlocked,
  getMemberStatus,
  getTeamMember,
  isFullTeamUnlocked,
  isTeamMemberUnlocked,
  TEAM_MEMBERS,
  teamUnlockService,
  type TeamMemberId as UnlockTeamMemberId,
} from '../services/team-unlock.service.js';
import { appState } from '../state/app.state.js';
import type { NormalizedHandoff } from '../types/events.js';
import type { PersonaConfig, PersonaId } from '../types/persona.js';
import { addClass, addListener, getElementById, removeClass } from '../utils/dom.js';
import { createLogger } from '../utils/logger.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
import { marketplaceUI } from './marketplace.ui.js';
import { toast } from './whisper.ui.js';

const log = createLogger('TeamUI');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let rosterContainer: HTMLElement | null = null;
const teamMemberElements: Map<PersonaId, HTMLElement> = new Map();
const cleanupFunctions: (() => void)[] = [];

// FIX BUG: Track all setTimeout IDs for cleanup to prevent memory leaks
const activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

/**
 * Tracked setTimeout that automatically removes itself when done.
 * All timeouts are cleared on dispose() to prevent memory leaks during HMR.
 */
function trackedTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => {
    activeTimeouts.delete(id);
    callback();
  }, delay);
  activeTimeouts.add(id);
  return id;
}

/**
 * Clear a tracked timeout early (e.g., if animation is cancelled).
 */
function _clearTrackedTimeout(id: ReturnType<typeof setTimeout>): void {
  clearTimeout(id);
  activeTimeouts.delete(id);
}
void _clearTrackedTimeout; // Suppress unused warning - available for cleanup

/**
 * Clear all tracked timeouts (called on dispose).
 */
function clearAllTrackedTimeouts(): void {
  for (const id of activeTimeouts) {
    clearTimeout(id);
  }
  activeTimeouts.clear();
}

// ============================================================================
// AVATAR EYES - SVG Creation Helper
// ============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create eyes SVG element for team roster avatars.
 * Uses safe DOM methods instead of innerHTML for security.
 */
function createAvatarEyesSVG(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'team-avatar-eyes');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');

  // Defs with gradient
  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.setAttribute('id', 'rosterEyeFill');
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '0%');
  gradient.setAttribute('y2', '100%');

  const stop1 = document.createElementNS(SVG_NS, 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', '#ffffff');
  const stop2 = document.createElementNS(SVG_NS, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', '#f0f0f0');

  gradient.appendChild(stop1);
  gradient.appendChild(stop2);
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // Left eye
  const leftEye = document.createElementNS(SVG_NS, 'ellipse');
  leftEye.setAttribute('class', 'eye-main eye-left');
  leftEye.setAttribute('cx', '36');
  leftEye.setAttribute('cy', '47');
  leftEye.setAttribute('rx', '8');
  leftEye.setAttribute('ry', '10');
  leftEye.setAttribute('fill', 'url(#rosterEyeFill)');

  const leftSparkle = document.createElementNS(SVG_NS, 'circle');
  leftSparkle.setAttribute('class', 'sparkle sparkle-left');
  leftSparkle.setAttribute('cx', '34');
  leftSparkle.setAttribute('cy', '43');
  leftSparkle.setAttribute('r', '2');
  leftSparkle.setAttribute('fill', 'white');

  // Right eye
  const rightEye = document.createElementNS(SVG_NS, 'ellipse');
  rightEye.setAttribute('class', 'eye-main eye-right');
  rightEye.setAttribute('cx', '64');
  rightEye.setAttribute('cy', '47');
  rightEye.setAttribute('rx', '8');
  rightEye.setAttribute('ry', '10');
  rightEye.setAttribute('fill', 'url(#rosterEyeFill)');

  const rightSparkle = document.createElementNS(SVG_NS, 'circle');
  rightSparkle.setAttribute('class', 'sparkle sparkle-right');
  rightSparkle.setAttribute('cx', '62');
  rightSparkle.setAttribute('cy', '43');
  rightSparkle.setAttribute('r', '2');
  rightSparkle.setAttribute('fill', 'white');

  svg.appendChild(leftEye);
  svg.appendChild(leftSparkle);
  svg.appendChild(rightEye);
  svg.appendChild(rightSparkle);

  return svg;
}

/** FIX BUG #57: ARIA live region for announcing handoff status to screen readers */
let ariaLiveRegion: HTMLElement | null = null;

// 🎬 Pixar Animation state
let activeHoverAnimation: Animation | null = null;
let magneticAnimationFrame: number | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * FIX BUG: Sync unlocked members with roster.
 *
 * This reconciles the unlock state with the roster preferences.
 * If a member was unlocked while the app wasn't running (or the
 * unlock event was missed), they would be unlocked but not visible
 * in the roster. This function ensures all unlocked members are
 * in the roster.
 *
 * Returns true if any members were synced (roster needs rebuild).
 */
function syncUnlockedMembersWithRoster(): boolean {
  const unlockState = teamUnlockService.getState();
  if (!unlockState) {
    log.debug('Unlock state not ready, will sync on first state change');
    return false;
  }

  let syncedCount = 0;

  for (const member of TEAM_MEMBERS) {
    // Skip Ferni - always visible
    if (member.id === 'ferni') continue;

    const memberId = member.id as TeamMemberId;
    const isUnlocked = unlockState.unlockedMembers.has(member.id);
    const isInRoster = rosterPreferences.isMemberVisible(memberId);

    // If unlocked but not in roster, add them
    if (isUnlocked && !isInRoster) {
      log.info('Syncing unlocked member to roster:', member.displayName);
      rosterPreferences.addMember(memberId);
      syncedCount++;
    }
  }

  if (syncedCount > 0) {
    log.info(`Synced ${syncedCount} unlocked member(s) to roster`);
  }

  return syncedCount > 0;
}

// Track if we've done the initial roster sync (to avoid duplicate syncs)
let hasPerformedInitialSync = false;

/**
 * Initialize the team UI component.
 * Must be called after DOM is ready.
 */
export function initTeamUI(): void {
  try {
    rosterContainer = getElementById('teamRoster');

    // FIX BUG #57: Create ARIA live region for handoff announcements
    createAriaLiveRegion();

    // FIX BUG: Try to sync unlocked members with roster on init
    // This may not work yet if team unlock service hasn't initialized,
    // so we also sync on the first state change below.
    hasPerformedInitialSync = syncUnlockedMembersWithRoster();

    // TEAM UNLOCK: Subscribe to unlock state changes to update UI
    // Also performs initial sync if it wasn't done above (due to init order)
    const unlockCleanup = teamUnlockService.onStateChange((state) => {
      // FIX BUG: Sync on first state change if we couldn't sync during init
      // This handles the case where initTeamUI runs before initTeamUnlockService
      if (!hasPerformedInitialSync) {
        hasPerformedInitialSync = true;
        const didSync = syncUnlockedMembersWithRoster();
        if (didSync) {
          // Roster preferences changed, rebuild roster
          void loadDynamicAgents().catch((err) => {
            log.warn('Failed to refresh roster after initial sync:', err);
          });
          return; // Skip updateTeamMemberLockStates - loadDynamicAgents will handle it
        }
      }
      updateTeamMemberLockStates(state);
    });
    cleanupFunctions.push(unlockCleanup);

    // TEAM UNLOCK: When a member is unlocked, add them to roster and celebrate!
    const unlockCelebrationCleanup = teamUnlockService.onUnlock((member) => {
      const memberId = member.id as TeamMemberId;

      // FIX: Auto-add unlocked members to visible roster
      // This ensures they appear in the roster immediately upon unlock
      if (!rosterPreferences.isMemberVisible(memberId)) {
        rosterPreferences.addMember(memberId);

        // Rebuild roster to show the new member
        void loadDynamicAgents().catch((err) => {
          log.warn('Failed to refresh roster after unlock:', err);
        });
      }

      // Then celebrate the unlock!
      celebrateMemberUnlock(member.id as PersonaId);
    });
    cleanupFunctions.push(unlockCelebrationCleanup);

    // TEAM UNLOCK: Show "almost there" notifications when progress hits 80%+
    const almostThereCleanup = teamUnlockService.onAlmostThere((member, progress) => {
      const progressPercent = Math.round(progress * 100);
      toast.show({
        message: `You're ${progressPercent}% of the way to meeting ${member.displayName}!`,
        duration: 4000,
      });
      log.debug('Showed almost there notification:', {
        memberId: member.id,
        progress: progressPercent,
      });
    });
    cleanupFunctions.push(almostThereCleanup);

    // Listen for roster changes (from marketplace UI add/remove actions)
    const rosterChangedHandler = () => {
      log.debug('Roster changed event received, rebuilding roster');
      void loadDynamicAgents().catch((err) => {
        log.warn('Failed to refresh roster after roster change:', err);
      });
    };
    document.addEventListener('ferni:roster-changed', rosterChangedHandler);
    cleanupFunctions.push(() =>
      document.removeEventListener('ferni:roster-changed', rosterChangedHandler)
    );

    // Subscribe to roster preferences changes
    const rosterPrefsCleanup = rosterPreferences.onChange(() => {
      log.debug('Roster preferences changed, rebuilding roster');
      void loadDynamicAgents().catch((err) => {
        log.warn('Failed to refresh roster after preferences change:', err);
      });
    });
    cleanupFunctions.push(rosterPrefsCleanup);

    // Build team roster
    buildTeamRoster();

    // Set up handoff listener
    const unsubscribe = handoffService.onHandoff(handleHandoff);
    cleanupFunctions.push(unsubscribe);

    // Set up state subscription
    const unsub2 = appState.subscribe('activePersona', updateActiveTeamMember);
    cleanupFunctions.push(unsub2);

    // FIX BUG #57: Announce handoff start events to screen readers
    const unsubStart = handoffService.onHandoffStart((toPersona, _fromPersona, _banter) => {
      const persona = getPersona(toPersona);
      announceToScreenReader(`Switching to ${persona.name}`);
    });
    cleanupFunctions.push(unsubStart);

    // FIX BUG #57: Announce handoff completion
    // WARM HANDOFF: Also serves as fallback for roster update if no soft_open_complete was sent
    const unsubComplete = handoffService.onHandoffComplete((toPersona) => {
      const persona = getPersona(toPersona);
      announceToScreenReader(`Now speaking with ${persona.name}`);
      // Fallback: ensure roster is updated (in case soft_open_complete wasn't sent)
      // This handles backward compatibility when there's no soft open banter
      setActiveTeamMember(toPersona);
    });
    cleanupFunctions.push(unsubComplete);

    // FIX BUG #57: Announce handoff failures
    // FIX BUG: Also clear visual switching states when handoff fails
    // FIX AUDIT GAP: Now receives rollbackTo for more accurate screen reader announcements
    const unsubFailed = handoffService.onHandoffFailed((error, targetPersona, rollbackTo) => {
      const rollbackPersonaName = rollbackTo ? getPersona(rollbackTo).name : undefined;
      const announcement = rollbackPersonaName
        ? `Switch failed. ${error}. Staying with ${rollbackPersonaName}.`
        : `Switch failed. ${error}`;
      announceToScreenReader(announcement);
      clearSwitchingFeedback(targetPersona);
    });
    cleanupFunctions.push(unsubFailed);

    // FIX BUG: Handle handoff cancellation - clear visual states
    const unsubCancelled = handoffService.onHandoffCancelled((targetPersona, _reason) => {
      clearSwitchingFeedback(targetPersona);
    });
    cleanupFunctions.push(unsubCancelled);

    // FIX BUG: Show visual feedback when handoff is rate limited
    const unsubRateLimited = handoffService.onHandoffRateLimited((_remainingMs) => {
      // Play feedback sound
      void import('./sound.ui.js').then(({ soundUI }) => {
        soundUI.play('click');
      });

      // Haptic feedback for mobile users
      void import('../services/haptics.service.js').then(({ getHapticsService }) => {
        getHapticsService().play('tap');
      });

      // Subtle visual shake on avatar to indicate "not yet"
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer) {
        avatarContainer.classList.add('wiggle');
        setTimeout(() => avatarContainer.classList.remove('wiggle'), 400);
      }

      // Show subtle toast
      toast.show({
        message: 'Take your time - one switch at a time',
        duration: 2000,
      });
    });
    cleanupFunctions.push(unsubRateLimited);

    // WARM HANDOFF: Listen for soft_open_complete to sync roster visual transition
    // This ensures the roster moves AFTER the departing persona finishes speaking
    const unsubSoftOpen = handoffService.onSoftOpenComplete((toPersona, fromPersona) => {
      log.debug('Soft open complete - triggering visual transition:', { toPersona, fromPersona });
      // NOW trigger the actual roster visual transition
      setActiveTeamMember(toPersona);
      // Clear the switching feedback states
      clearSwitchingFeedback(toPersona);
    });
    cleanupFunctions.push(unsubSoftOpen);

    // Listen for progress heartbeat to update UI indicator
    const unsubProgress = handoffService.onHandoffProgress((_targetPersona, elapsedMs, timeoutMs) => {
      // Update progress indicator on avatar container
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer instanceof HTMLElement) {
        // Calculate progress percentage (0-100)
        const progress = Math.min(100, Math.round((elapsedMs / timeoutMs) * 100));
        avatarContainer.dataset.handoffProgress = String(progress);

        // Add pulse class if not already present
        if (!avatarContainer.classList.contains('handoff-progress')) {
          avatarContainer.classList.add('handoff-progress');
        }
      }
    });
    cleanupFunctions.push(unsubProgress);

    // Clear progress on handoff complete
    const unsubProgressClear = handoffService.onHandoffComplete(() => {
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer instanceof HTMLElement) {
        delete avatarContainer.dataset.handoffProgress;
        avatarContainer.classList.remove('handoff-progress');
      }
    });
    cleanupFunctions.push(unsubProgressClear);

    // 🍴 Setup avatar as drop zone for "eating" marketplace agents
    avatarFeedback.setupDropZone(handleAgentDropped);
  } catch (error) {
    log.error('Failed to initialize Team UI:', error);
  }
}

/**
 * Core team member IDs - used to distinguish from marketplace agents
 */
const CORE_TEAM_IDS = new Set([
  'ferni',
  'peter-john',
  'maya-santos',
  'jordan-taylor',
  'alex-chen',
  'nayan-patel',
]);

/**
 * Handle when an agent/team member is dropped onto the avatar
 * 🍴 The avatar "eats" them - satisfying removal UX
 *
 * Handles two cases:
 * 1. Core team member: Removes from roster (can be added back via marketplace)
 * 2. Marketplace agent: Uninstalls the agent
 */
function handleAgentDropped(agentId: string): void {
  log.debug('Avatar is eating:', agentId);

  const element = teamMemberElements.get(agentId as PersonaId);

  // Check if this is a core team member
  if (CORE_TEAM_IDS.has(agentId)) {
    // Can't remove Ferni!
    if (agentId === 'ferni') {
      log.debug('Cannot remove Ferni from roster');
      toast.show({
        message: "Ferni's always here for you",
        duration: 2000,
      });
      return;
    }

    // Remove core team member from roster
    const memberConfig = getTeamMember(agentId as UnlockTeamMemberId);
    const name = memberConfig?.displayName || agentId;

    rosterPreferences.removeMember(agentId as TeamMemberId);

    log.info('Removed from roster:', name);
    toast.show({
      message: `${name} removed from roster`,
      duration: 2000,
    });

    // Animate removal, then rebuild roster to reflect change
    if (element) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // Skip animation, just rebuild roster
        void loadDynamicAgents().catch((err) => {
          log.warn('Failed to refresh roster after removal:', err);
        });
        return;
      }

      void element
        .animate(
          [
            { transform: 'scale(1)', opacity: '1' },
            { transform: 'scale(0)', opacity: '0' },
          ],
          {
            duration: DURATION.SLOW,
            easing: EASING.EASE_IN,
            fill: 'forwards',
          }
        )
        .finished.then(() => {
          // Rebuild roster to reflect the change
          void loadDynamicAgents().catch((err) => {
            log.warn('Failed to refresh roster after removal:', err);
          });
        });
    } else {
      // Element not found (edge case) - still rebuild roster
      void loadDynamicAgents().catch((err) => {
        log.warn('Failed to refresh roster after removal:', err);
      });
    }

    return;
  }

  // Handle marketplace agent uninstall
  const installedAgents = marketplaceService.getInstalledAgents();
  const agent = installedAgents.find((a) => a.id === agentId);
  const name = agent?.manifest?.identity?.name || agentId;

  // Uninstall the agent
  marketplaceService.uninstallAgent(agentId);

  // Remove from UI
  if (element) {
    // FIX BUG: Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.remove();
      teamMemberElements.delete(agentId as PersonaId);
      return;
    }
    // Animate removal using design system constants
    void element
      .animate(
        [
          { transform: 'scale(1)', opacity: '1' },
          { transform: 'scale(0)', opacity: '0' },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.EASE_IN,
          fill: 'forwards',
        }
      )
      .finished.then(() => {
        element.remove();
        teamMemberElements.delete(agentId as PersonaId);

        // Check if we need to remove the marketplace divider
        const marketplaceDivider = rosterContainer?.querySelector('.team-divider--marketplace');
        const remainingMarketplaceAgents = rosterContainer?.querySelectorAll(
          '.team-member--marketplace-agent'
        );
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
  trackedTimeout(() => {
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
 * Render unlocked members that are NOT in the roster as "addable" ghost cards.
 * These appear with a dashed border and + icon, allowing quick addition to the roster.
 *
 * This gives visibility to unlocked members the user hasn't added yet,
 * without cluttering the roster with everyone by default.
 */
function renderAddableUnlockedMembers(agents: ApiAgent[]): void {
  if (!rosterContainer) return;

  const unlockState = teamUnlockService.getState();
  if (!unlockState) return;

  // Find unlocked members that are NOT in the visible roster
  const visibleMemberIds = rosterPreferences.getVisibleMembers();
  const addableMembers = TEAM_MEMBERS.filter((member) => {
    // Skip Ferni - always visible
    if (member.id === 'ferni') return false;
    // Must be unlocked
    if (!unlockState.unlockedMembers.has(member.id)) return false;
    // Must NOT be in visible roster already
    return !visibleMemberIds.includes(member.id as TeamMemberId);
  });

  if (addableMembers.length === 0) {
    log.debug('No addable unlocked members');
    return;
  }

  log.debug(
    'Rendering addable unlocked members:',
    addableMembers.map((m) => m.displayName)
  );

  // Find corresponding API agent data for colors
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  for (const member of addableMembers) {
    const agent = agentMap.get(member.id);
    const element = createAddableTeamMemberElement(member, agent);
    rosterContainer.appendChild(element);

    // Attach add listener
    attachAddableMemberListener(element, member);
  }
}

/**
 * Create a "ghost" team member element for unlocked but not-in-roster members.
 * Shows with dashed border and + icon to indicate it can be added.
 */
function createAddableTeamMemberElement(
  member: (typeof TEAM_MEMBERS)[number],
  agent?: ApiAgent
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'team-member team-member--addable';
  element.setAttribute('data-persona-id', member.id);
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', `Add ${member.displayName} to your team`);

  // Get colors from API agent or fall back to design system
  const colors = agent?.colors || getPersonaColorConfig(member.id);
  const gradient =
    colors?.gradient ||
    `linear-gradient(135deg, ${colors?.secondary || 'var(--persona-secondary, #3d5a35)'}, ${colors?.primary || 'var(--persona-primary, #4a6741)'})`;

  // Display name (first name only)
  const displayName = member.displayName;

  // Get initials for avatar
  const initials = member.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  element.innerHTML = `
    <div class="team-avatar-container">
      <div class="team-avatar-ring team-avatar-ring--addable"></div>
      <div class="team-avatar team-avatar--addable" data-persona="${member.id}" style="--persona-gradient: ${gradient};">
        ${initials}
      </div>
      <div class="team-add-badge" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    </div>
    <span class="team-name">${displayName}</span>
  `;

  return element;
}

/**
 * Attach click listener to addable member element.
 * Clicking adds the member to the roster.
 */
function attachAddableMemberListener(
  element: HTMLElement,
  member: (typeof TEAM_MEMBERS)[number]
): void {
  const memberId = member.id as TeamMemberId;

  const handleAdd = () => {
    log.info('Adding member to roster from home screen:', member.displayName);
    rosterPreferences.addMember(memberId);

    // Play success sound
    void import('./sound.ui.js').then(({ soundUI }) => {
      soundUI.play('success');
    });

    toast.show({
      message: `${member.displayName} added to your team`,
      duration: 2500,
    });

    // Roster will rebuild automatically via the onChange listener
  };

  const clickCleanup = addListener(element, 'click', (e) => {
    e.stopPropagation();
    handleAdd();
  });
  cleanupFunctions.push(clickCleanup);

  // Keyboard support
  const keyCleanup = addListener(element, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAdd();
    }
  });
  cleanupFunctions.push(keyCleanup);
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
    const visibleAgents = agents.filter((agent) => {
      // Coordinator (Ferni) always visible
      if (agent.isCoordinator) return true;
      // Other team members only if in visible roster
      return visibleMemberIds.includes(agent.id as TeamMemberId);
    });

    // Sort agents to ensure consistent order regardless of API response
    // Order: Ferni (coordinator) first, then team members in canonical order
    const CANONICAL_ORDER = [
      'ferni',
      'peter-john',
      'maya-santos',
      'jordan-taylor',
      'alex-chen',
      'nayan-patel',
    ];
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

    // ➕ Render unlocked-but-not-in-roster members as addable
    renderAddableUnlockedMembers(agents);

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

    // FIX: Only reveal roster when app is loaded and entrance animations are ready
    // This prevents flash of all team members on mobile startup
    revealRosterWhenReady(rosterContainer);
  } catch (err) {
    log.warn('Dynamic agent loading failed:', err);
    hideRosterLoading();
    throw err;
  }
}

/**
 * Load and render installed marketplace agents
 * Only shows marketplace agents if the full core team is unlocked
 */
function loadInstalledMarketplaceAgents(): void {
  if (!rosterContainer) return;

  const installed = marketplaceService.getInstalledAgents();

  if (installed.length === 0) return;

  // Marketplace agents require full team to be unlocked
  if (!isFullTeamUnlocked()) {
    log.debug('Marketplace agents hidden - full team not yet unlocked');
    return;
  }

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
  const name =
    manifestIdentity?.name ||
    agent.id
      .split('-')
      .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
      .join(' ');
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
  const marketplaceInfo = (manifest as { marketplace?: { colors?: { gradient?: string } } })
    ?.marketplace;
  const colors = marketplaceInfo?.colors;
  // Fallback uses CSS variables for muted earthy tones from design system
  const gradient =
    colors?.gradient ||
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

    // Visual feedback - FIX BUG: Use DURATION constant instead of hardcoded value
    element.classList.add('team-member--clicked');
    trackedTimeout(() => element.classList.remove('team-member--clicked'), DURATION.SLOW);

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
 * Create a team member DOM element from API agent data.
 *
 * TEAM UNLOCK SYSTEM: Shows locked members with visual indicator.
 * Users can still tap locked members but will see a friendly message
 * explaining they need more conversations with Ferni to unlock.
 */
function createTeamMemberElement(agent: ApiAgent): HTMLElement {
  const element = document.createElement('div');

  // Check if this team member is locked (coordinator is always unlocked)
  const isLocked = !agent.isCoordinator && !isTeamMemberUnlocked(agent.id as UnlockTeamMemberId);
  const memberStatus = getMemberStatus(agent.id as UnlockTeamMemberId);

  // Build class list with locked state
  const classes = ['team-member'];
  if (agent.isCoordinator) classes.push('team-member--coach');
  if (isLocked) classes.push('team-member--locked');
  // "Almost unlocked" at 80%+ - creates anticipation and excitement
  if (memberStatus.progress >= 0.8 && isLocked) classes.push('team-member--almost-unlocked');

  element.className = classes.join(' ');
  element.setAttribute('data-persona-id', agent.id);
  element.setAttribute('data-locked', isLocked.toString());
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');

  // 🍴 Make unlocked non-Ferni team members draggable - drag to avatar to remove from roster
  const canDragToRemove = !agent.isCoordinator && !isLocked;
  if (canDragToRemove) {
    element.setAttribute('draggable', 'true');
    element.setAttribute('data-core-team', 'true');
  }

  // Update aria-label based on locked status
  const ariaLabel = isLocked
    ? `${agent.name} - locked. Keep talking to Ferni to unlock.`
    : canDragToRemove
      ? `Talk to ${agent.name}. Drag to avatar to remove from roster.`
      : `Talk to ${agent.name}`;
  element.setAttribute('aria-label', ariaLabel);
  element.setAttribute('aria-pressed', 'false');

  // Get colors - from API or fall back to design system persona colors
  const colors = agent.colors || getPersonaColorConfig(agent.id);
  // Use CSS variables with hardcoded fallbacks for safety
  const gradient =
    colors?.gradient ||
    `linear-gradient(135deg, ${colors?.secondary || 'var(--persona-secondary, #3d5a35)'}, ${colors?.primary || 'var(--persona-primary, #4a6741)'})`;

  // Display first name only in roster for cleaner UI
  const displayName = getFirstName(agent.name);

  // Mystery indicator - intriguing "?" that invites discovery (Better than a lock)
  const mysteryIndicator = isLocked
    ? `<div class="team-mystery-indicator" aria-hidden="true">?</div>`
    : '';
  
  // Progress hint - shows conversations remaining on hover
  const progressPercent = Math.round(memberStatus.progress * 100);
  const progressHint = isLocked && memberStatus.progress > 0
    ? `<div class="team-progress-hint">${progressPercent}% discovered</div>`
    : isLocked
    ? `<div class="team-progress-hint">Keep chatting to meet ${displayName}</div>`
    : '';

  // Progress ring for locked members (shows progress toward unlock)
  const progressRing =
    isLocked && memberStatus.progress > 0
      ? `
    <svg class="team-progress-ring" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-border-subtle, rgba(255,255,255,0.1))" stroke-width="2"/>
      <circle cx="18" cy="18" r="16" fill="none" stroke="var(--persona-primary, #4a6741)" stroke-width="2"
        stroke-dasharray="${memberStatus.progress * 100}, 100"
        stroke-linecap="round"
        transform="rotate(-90 18 18)"/>
    </svg>
  `
      : '';

  // Build element structure using safe DOM methods
  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'team-avatar-container';

  const avatarRing = document.createElement('div');
  avatarRing.className = 'team-avatar-ring';
  avatarContainer.appendChild(avatarRing);

  // Add progress ring if locked and has progress
  if (progressRing) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = progressRing;
    const progressSvg = tempDiv.firstElementChild;
    if (progressSvg) avatarContainer.appendChild(progressSvg);
  }

  // Create avatar with eyes
  const avatar = document.createElement('div');
  avatar.className = `team-avatar${isLocked ? ' team-avatar--locked' : ''}`;
  avatar.style.setProperty('--persona-gradient', gradient);

  // Add eyes SVG to all avatars
  const eyesSvg = createAvatarEyesSVG();
  avatar.appendChild(eyesSvg);

  avatarContainer.appendChild(avatar);

  // Add mystery indicator if locked (replaces lock icon for better UX)
  if (mysteryIndicator) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = mysteryIndicator;
    const mysteryEl = tempDiv.firstElementChild;
    if (mysteryEl) avatarContainer.appendChild(mysteryEl);
  }
  
  // Add progress hint (shown on hover)
  if (progressHint) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = progressHint;
    const hintEl = tempDiv.firstElementChild;
    if (hintEl) avatarContainer.appendChild(hintEl);
  }

  element.appendChild(avatarContainer);

  // Add name
  const nameSpan = document.createElement('span');
  nameSpan.className = 'team-name';
  nameSpan.textContent = displayName;
  element.appendChild(nameSpan);

  return element;
}

/**
 * Attach event listeners to a team member element
 */
function attachEventListenersToElement(
  element: HTMLElement,
  personaId: PersonaId,
  _name: string
): void {
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
        announceToScreenReader(
          `Please wait. Transitioning to ${handoffService.targetPersona || 'new agent'}.`
        );
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

  // 🍴 Drag handlers for core team members - drag to avatar to remove from roster
  if (
    element.getAttribute('draggable') === 'true' &&
    element.getAttribute('data-core-team') === 'true'
  ) {
    const dragStartCleanup = addListener(element, 'dragstart', (e) => {
      if (!e.dataTransfer) return;

      e.dataTransfer.setData('text/plain', personaId);
      e.dataTransfer.effectAllowed = 'move';

      // Visual feedback - element becomes semi-transparent
      element.classList.add('team-member--dragging');

      // Create a custom drag image (the avatar only)
      const avatarEl = element.querySelector('.team-avatar') as HTMLElement;
      if (avatarEl) {
        const clone = avatarEl.cloneNode(true) as HTMLElement;
        const gradient = avatarEl.style.getPropertyValue('--persona-gradient');
        clone.style.cssText = `
          position: absolute;
          top: -1000px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${gradient || 'linear-gradient(135deg, var(--persona-secondary, #3d5a35), var(--persona-primary, #4a6741))'};
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

    const dragEndCleanup = addListener(element, 'dragend', () => {
      element.classList.remove('team-member--dragging');
    });
    cleanupFunctions.push(dragEndCleanup);
  }
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
 * Reveal roster only when app is loaded and entrance animations are ready.
 * This prevents flash of all team members on mobile startup.
 */
function revealRosterWhenReady(container: HTMLElement): void {
  // Remove any legacy inline styles (from old HTML)
  container.style.removeProperty('visibility');
  container.style.removeProperty('opacity');

  // Check if app is already loaded
  if (document.body.classList.contains('app-loaded')) {
    // App is loaded - remove initializing class to trigger entrance animation
    container.classList.remove('roster-initializing');

    // Mark entrance complete after animation - FIX BUG: Use DURATION constant
    trackedTimeout(() => {
      container.classList.add('entrance-complete');
    }, DURATION.CELEBRATION);
  } else {
    // App not loaded yet - wait for it
    // Use MutationObserver to watch for app-loaded class
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (document.body.classList.contains('app-loaded')) {
            observer.disconnect();
            container.classList.remove('roster-initializing');

            // Mark entrance complete after animation - FIX BUG: Use DURATION constant
            trackedTimeout(() => {
              container.classList.add('entrance-complete');
            }, DURATION.CELEBRATION);
            break;
          }
        }
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Safety timeout - don't wait forever
    trackedTimeout(() => {
      observer.disconnect();
      container.classList.remove('roster-initializing');
      container.classList.add('entrance-complete');
    }, 5000);
  }
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

  // iOS touch fix: Also listen for touchend to ensure taps are captured
  const touchCleanup = addListener(marketplaceBtn, 'touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    marketplaceUI.open();
  });
  cleanupFunctions.push(touchCleanup);

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

  // FIX: Only reveal roster when app is loaded and entrance animations are ready
  revealRosterWhenReady(rosterContainer);

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
 *
 * TEAM UNLOCK: Locked members show a friendly message instead of
 * attempting handoff. This gives immediate feedback rather than
 * waiting for backend to reject.
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
      trackedTimeout(() => removeClass(element, 'click-blocked'), DURATION.NORMAL);
    }
    return;
  }

  // TEAM UNLOCK: Check if this member is locked before attempting handoff
  // Ferni (coordinator) is always unlocked
  const isLocked = personaId !== 'ferni' && !isTeamMemberUnlocked(personaId as UnlockTeamMemberId);
  if (isLocked) {
    log.debug('Team member is locked:', personaId);
    const memberConfig = getTeamMember(personaId as UnlockTeamMemberId);
    const status = getMemberStatus(personaId as UnlockTeamMemberId);

    // Show locked member feedback
    showLockedMemberFeedback(personaId, memberConfig, status);
    return;
  }

  if (current.id === personaId) {
    // Subtle pulse to acknowledge the tap - FIX BUG: Use DURATION constant
    const element = teamMemberElements.get(personaId);
    if (element) {
      addClass(element, 'pulse');
      trackedTimeout(() => removeClass(element, 'pulse'), DURATION.SLOW);
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
 * Show friendly feedback when user taps a locked team member.
 * Uses toast + visual feedback instead of a blocking modal.
 */
function showLockedMemberFeedback(
  personaId: PersonaId,
  memberConfig: ReturnType<typeof getTeamMember>,
  status: ReturnType<typeof getMemberStatus>
): void {
  const element = teamMemberElements.get(personaId);

  // Visual feedback - shake animation - FIX BUG: Use DURATION constant
  if (element) {
    addClass(element, 'team-member--locked-feedback');
    trackedTimeout(() => removeClass(element, 'team-member--locked-feedback'), DURATION.DRAMATIC);
  }

  // Get the teaser message or fallback
  const name = memberConfig?.displayName || personaId;
  const message =
    memberConfig?.teaserMessage ||
    `${name} isn't available yet. Keep talking to Ferni to unlock more teammates!`;

  // Announce to screen readers
  announceToScreenReader(message);

  // Show toast notification with progress hint
  const progressPercent = Math.round(status.progress * 100);
  const progressHint = status.progress > 0 ? ` (${progressPercent}% there!)` : '';
  toast.show({ message: `${message}${progressHint}`, duration: 3500 });

  log.debug('Showed locked member feedback:', { personaId, progress: status.progress });
}

/**
 * Update team member lock states when unlock status changes.
 * Called when relationship stage progresses or subscription changes.
 */
function updateTeamMemberLockStates(state: ReturnType<typeof teamUnlockService.getState>): void {
  if (!state) return;

  for (const [personaId, element] of teamMemberElements.entries()) {
    // Skip non-core team members (marketplace agents)
    if (element.classList.contains('team-member--marketplace-agent')) continue;

    const isLocked = !state.unlockedMembers.has(personaId as UnlockTeamMemberId);
    const status = state.memberStatuses.get(personaId as UnlockTeamMemberId);

    // Update classes
    if (isLocked) {
      addClass(element, 'team-member--locked');
      // "Almost unlocked" at 80%+ - creates anticipation
      if (status && status.progress >= 0.8) {
        addClass(element, 'team-member--almost-unlocked');
      } else {
        removeClass(element, 'team-member--almost-unlocked');
      }
    } else {
      removeClass(element, 'team-member--locked');
      removeClass(element, 'team-member--almost-unlocked');
    }

    // Update data attribute
    element.setAttribute('data-locked', isLocked.toString());

    // Update aria-label
    const memberConfig = getTeamMember(personaId as UnlockTeamMemberId);
    const name = memberConfig?.displayName || personaId;
    const ariaLabel = isLocked
      ? `${name} - locked. Keep talking to Ferni to unlock.`
      : `Talk to ${name}`;
    element.setAttribute('aria-label', ariaLabel);

    // Update progress ring if present
    const progressRing = element.querySelector(
      '.team-progress-ring circle:last-child'
    ) as SVGCircleElement;
    if (progressRing && status) {
      progressRing.setAttribute('stroke-dasharray', `${status.progress * 100}, 100`);
    }

    // Update mystery indicator visibility
    const mysteryIndicator = element.querySelector('.team-mystery-indicator') as HTMLElement;
    if (mysteryIndicator) {
      mysteryIndicator.style.display = isLocked ? '' : 'none';
    }
    
    // Update progress hint
    const progressHint = element.querySelector('.team-progress-hint') as HTMLElement;
    if (progressHint) {
      progressHint.style.display = isLocked ? '' : 'none';
      if (isLocked && status && status.progress > 0) {
        progressHint.textContent = `${Math.round(status.progress * 100)}% discovered`;
      }
    }
  }

  log.debug('Updated team member lock states', {
    unlocked: Array.from(state.unlockedMembers),
  });
}

/**
 * Celebrate when a team member is unlocked!
 * Shows a delightful animation and announces to screen readers.
 */
function celebrateMemberUnlock(personaId: PersonaId): void {
  const element = teamMemberElements.get(personaId);
  if (!element) return;

  const memberConfig = getTeamMember(personaId as UnlockTeamMemberId);
  const name = memberConfig?.displayName || personaId;

  log.info('🎉 Celebrating unlock:', name);

  // Announce to screen readers
  announceToScreenReader(`${name} is now available! You can now talk to them.`);

  // Add celebration animation class
  addClass(element, 'team-member--just-unlocked');

  // FIX BUG: Check reduced motion preference before animating
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Skip animation but still show the unlocked state
    return;
  }

  // Animate the unlock with a burst effect
  void element
    .animate(
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.2)', filter: 'brightness(1.3)' },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      {
        duration: DURATION.CELEBRATION,
        easing: EASING.SPRING,
      }
    )
    .finished.then(() => {
      removeClass(element, 'team-member--just-unlocked');
    });

  // Show celebration toast - uses same glass style as whisper.ui.ts
  const toast = document.createElement('div');
  toast.className = 'ferni-toast ferni-toast--celebration';
  toast.innerHTML = `
    <span class="ferni-toast__message">${name} unlocked!</span>
  `;
  // Glass toast styling - consistent with whisper.ui.ts
  toast.style.cssText = `
    position: fixed;
    bottom: calc(80px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%) translateY(12px);
    background: rgba(30, 30, 35, 0.75);
    backdrop-filter: blur(var(--glass-blur-medium, 16px));
    -webkit-backdrop-filter: blur(var(--glass-blur-medium, 16px));
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--color-text-primary, #faf6f0);
    padding: 6px 14px;
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(74, 103, 65, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 12px;
    font-weight: 500;
    z-index: var(--z-toast, 1700);
    opacity: 0;
    transition: opacity 0.2s ease, transform 0.2s ease;
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // FIX BUG: Use DURATION constants instead of hardcoded values
  trackedTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    trackedTimeout(() => toast.remove(), DURATION.SLOW);

    // FIX: Clear newlyUnlocked flag to prevent duplicate celebrations
    clearNewlyUnlocked();
  }, DURATION.AMBIENT_FAST);
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
  trackedTimeout(() => {
    if (fromElement) removeClass(fromElement, 'switching-from');
    if (toElement) removeClass(toElement, 'switching-to');
  }, HANDOFF_TIMING.MAX_FEEDBACK_DELAY);
}

/**
 * 🎬 Create energy transfer animation between two team members.
 * A glowing orb travels from one persona to another during handoff.
 */
function createEnergyTransfer(
  fromEl: HTMLElement,
  toEl: HTMLElement,
  toPersonaId: PersonaId
): void {
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
  orb.animate(
    [
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
    ],
    {
      duration: ANIMATION_PRESET.TEAM_SELECT.duration + DURATION.FAST,
      easing: EASING.SPRING,
      fill: 'forwards',
    }
  );

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
    const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
    const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;

    createTrailParticle(x, y, color);
    particleCount++;
  }, DURATION.MICRO - 10); // ~40ms particle spawn interval

  // Remove orb after animation - FIX BUG: Use DURATION constant
  trackedTimeout(() => orb.remove(), DURATION.DRAMATIC);
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

  particle.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.8 },
      { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
    ],
    {
      duration: ANIMATION_PRESET.TEAM_SELECT.duration,
      easing: EASING.EASE_OUT,
    }
  );

  trackedTimeout(() => particle.remove(), ANIMATION_PRESET.TEAM_SELECT.duration);
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
 *
 * REFACTORED: Now uses handoffService.sendHandoffRequest() for consistency
 * with marketplace.ui.ts and other entry points. This ensures:
 * - Rate limiting (800ms debounce)
 * - Retry logic (up to 2 retries)
 * - Proper state management
 * - Unified error handling
 */
function sendHandoffRequest(targetPersonaId: PersonaId): void {
  log.debug('Sending handoff request to:', targetPersonaId);

  /**
   * Handle send failure with user feedback and state reset.
   */
  const handleSendFailure = (error: Error): void => {
    log.error('Handoff request failed:', error);

    // Reset transition state on failure
    // Clear switching feedback from UI
    const element = teamMemberElements.get(targetPersonaId);
    if (element) {
      removeClass(element, 'switching-to');
      addClass(element, 'send-failed');
      trackedTimeout(() => removeClass(element, 'send-failed'), DURATION.GLACIAL / 1.5);
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
    handleSendFailure(new Error(`Unknown persona: ${targetPersonaId}`));
    return;
  }

  // Use handoffService for centralized handoff request handling
  // This provides rate limiting, retry logic, and proper state management
  void (async () => {
    const success = await handoffService.sendHandoffRequest(targetPersonaId, {
      onFailure: handleSendFailure,
    });

    if (!success) {
      // Request was rate limited or blocked - show visual feedback
      const element = teamMemberElements.get(targetPersonaId);
      if (element) {
        removeClass(element, 'switching-to');
        addClass(element, 'click-blocked');
        trackedTimeout(() => removeClass(element, 'click-blocked'), DURATION.NORMAL);
      }

      // Restore current persona highlighting
      const current = appState.get('activePersona');
      const currentElement = teamMemberElements.get(current.id);
      if (currentElement) {
        removeClass(currentElement, 'switching-from');
      }
    }
  })();
}

/**
 * Handle handoff event.
 *
 * WARM HANDOFF: This is called when handoff_started fires.
 * We intentionally DON'T update the active team member here - we wait for
 * soft_open_complete event to sync the visual transition with voice timing.
 * The fallback (if no soft_open_complete) is handled by onHandoffComplete.
 */
function handleHandoff(_handoff: NormalizedHandoff): void {
  // WARM HANDOFF: Visual transition is now handled by soft_open_complete event
  // to sync with departing persona's voice. See initTeamUI for the handler.
  // We don't call setActiveTeamMember here anymore.
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
    trackedTimeout(() => {
      playStepForward(personaId);
      // Team cheer after the new persona steps forward
      trackedTimeout(() => playTeamCheer(personaId), DURATION.NORMAL);
    }, DURATION.FAST_RELEASE);
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
  activeHoverAnimation = element.animate(
    [
      { transform: 'scale(1) translateY(0)', offset: 0 },
      { transform: 'scale(1.02) translateY(-2px)', offset: 0.4 },
      { transform: 'scale(1.05) translateY(-4px)', offset: 0.7 },
      { transform: 'scale(1.08) translateY(-6px)', offset: 1 },
    ],
    {
      duration: ANIMATION_PRESET.TEAM_HOVER.duration,
      easing: EASING.SPRING, // Bouncy spring
      fill: 'forwards',
    }
  );

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
  const settleAnimation = element.animate(
    [
      { transform: currentTransform, offset: 0 },
      { transform: 'scale(1.02) translateY(-2px)', offset: 0.3 },
      { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ],
    {
      duration: DURATION.SLOW,
      easing: EASING.STANDARD,
      fill: 'forwards',
    }
  );

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
 * 
 * FIX BUG: Added onfinish handler to clear transform after animation.
 * Without this, fill: 'forwards' keeps scale(1.1) applied indefinitely,
 * which distorts avatar shapes. The CSS breathing animation handles the
 * active state, so we should reset transform to allow CSS to take over.
 */
export function playStepForward(personaId: PersonaId): void {
  const element = teamMemberElements.get(personaId);
  if (!element) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Step forward with squash/stretch
  const animation = element.animate(
    [
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
      // Settle back to normal (CSS breathing animation will take over)
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ],
    {
      duration: ANIMATION_PRESET.TEAM_SELECT.duration + DURATION.FAST,
      easing: EASING.SPRING,
      fill: 'forwards',
    }
  );

  // FIX BUG: Clear transform after animation so CSS can control the element
  // This prevents the scale(1.1) from persisting and distorting avatar shapes
  animation.onfinish = () => {
    element.style.transform = '';
  };
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
  const animation = element.animate(
    [
      { transform: currentTransform, offset: 0 },
      { transform: 'scale(1.02) translateY(-4px)', offset: 0.3 },
      { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ],
    {
      duration: ANIMATION_PRESET.TEAM_SELECT.duration - DURATION.MICRO,
      easing: EASING.STANDARD,
      fill: 'forwards',
    }
  );

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
    trackedTimeout(() => {
      element.animate(
        [
          { transform: 'scale(1) translateY(0)', offset: 0 },
          { transform: 'scale(1.03) translateY(-3px)', offset: 0.3 },
          { transform: 'scale(0.98) translateY(1px)', offset: 0.6 },
          { transform: 'scale(1) translateY(0)', offset: 1 },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.SPRING,
        }
      );
    }, delay);

    delay += staggerMs;
  }
}

/**
 * Clean up resources.
 */
export function dispose(): void {
  // FIX BUG: Clear all tracked timeouts to prevent memory leaks
  clearAllTrackedTimeouts();

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

  existingAgents.forEach((el) => {
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
