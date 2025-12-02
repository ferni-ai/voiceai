/**
 * Team UI Component
 * 
 * Manages the team roster display (Ferni, Jack Bogle, Peter Lynch, etc).
 * Shows which team member is currently active.
 */

import type { PersonaId, PersonaConfig } from '../types/persona.js';
import type { NormalizedHandoff } from '../types/events.js';
import { getPersona } from '../config/personas.js';
import { appState } from '../state/app.state.js';
import { handoffService } from '../services/handoff.service.js';
import {
  getElementById,
  addClass,
  removeClass,
  addListener,
} from '../utils/dom.js';

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let rosterContainer: HTMLElement | null = null;
const teamMemberElements: Map<PersonaId, HTMLElement> = new Map();
const cleanupFunctions: (() => void)[] = [];

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
    
    // Build team roster
    buildTeamRoster();

    // Set up handoff listener
    const unsubscribe = handoffService.onHandoff(handleHandoff);
    cleanupFunctions.push(unsubscribe);

    // Set up state subscription
    const unsub2 = appState.subscribe('activePersona', updateActiveTeamMember);
    cleanupFunctions.push(unsub2);

    console.log('✅ Team UI initialized');
  } catch (error) {
    console.error('Failed to initialize Team UI:', error);
  }
}

// ============================================================================
// ROSTER BUILDING
// ============================================================================

/**
 * Build the team roster - attach event listeners to existing HTML elements.
 */
function buildTeamRoster(): void {
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
    
    // Add click handler
    const cleanup = addListener(element as HTMLElement, 'click', () => {
      onTeamMemberClick(personaId);
    });
    cleanupFunctions.push(cleanup);

    // Add keyboard handler
    const keyCleanup = addListener(element as HTMLElement, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTeamMemberClick(personaId);
      }
    });
    cleanupFunctions.push(keyCleanup);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle team member click.
 * Apple-style: seamless switching whether connected or not.
 * When connected: shows immediate visual feedback, then requests handoff.
 * When disconnected: previews the persona's theme.
 */
function onTeamMemberClick(personaId: PersonaId): void {
  const current = appState.get('activePersona');
  
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
  if (appState.get('connection') === 'connected') {
    showSwitchingFeedback(current.id, personaId);
    sendHandoffRequest(personaId);
    return;
  }

  // When disconnected, preview the theme immediately
  previewPersonaTheme(personaId);
}

/**
 * Show immediate visual feedback when switching personas.
 * Apple-style: optimistic UI - show the change before server confirms.
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
  
  // Immediately update the theme preview for seamless feel
  previewPersonaTheme(toId);
  
  // Clear switching states after a moment (handoff will complete the transition)
  setTimeout(() => {
    if (fromElement) removeClass(fromElement, 'switching-from');
    if (toElement) removeClass(toElement, 'switching-to');
  }, 800);
}

/**
 * Preview a persona's theme without connecting.
 * Updates the UI to show the persona's colors.
 * Also updates selectedPersona so Connect will connect to this persona.
 */
function previewPersonaTheme(personaId: PersonaId): void {
  const persona = getPersona(personaId);
  
  // Update both activePersona AND selectedPersona
  // selectedPersona is what gets used when Connect is clicked
  appState.set('activePersona', persona);
  appState.set('selectedPersona', persona);
  
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
  
  console.log(`✅ Selected persona: ${persona.name} - Connect will now use this persona`);
}

/**
 * Send a handoff request to the agent.
 */
function sendHandoffRequest(targetPersonaId: PersonaId): void {
  // Import connection service dynamically to avoid circular deps
  void import('../services/connection.service.js').then(({ connectionService }) => {
    const room = connectionService.getRoom();
    if (!room?.localParticipant) {
      console.warn('Cannot send handoff request: not connected');
      return;
    }

    // Create handoff request message
    const message = JSON.stringify({
      type: 'handoff_request',
      target: targetPersonaId,
      timestamp: Date.now(),
    });

    // Send via data channel
    room.localParticipant.publishData(
      new TextEncoder().encode(message),
      { reliable: true }
    ).then(() => {
      console.log(`✅ Handoff request sent for: ${targetPersonaId}`);
    }).catch((err) => {
      console.error('Failed to send handoff request:', err);
    });
  });
}

/**
 * Handle handoff event.
 */
function handleHandoff(handoff: NormalizedHandoff): void {
  console.log(`🔄 Team UI: Handoff to ${handoff.toPersona}`);
  
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
 */
export function setActiveTeamMember(personaId: PersonaId): void {
  // Activate the matching team member, deactivate others
  for (const [id, element] of teamMemberElements.entries()) {
    if (id === personaId) {
      addClass(element, 'active');
    } else {
      removeClass(element, 'active');
    }
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

/**
 * Clean up resources.
 */
export function dispose(): void {
  for (const fn of cleanupFunctions) {
    fn();
  }
  cleanupFunctions.length = 0;
  teamMemberElements.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamUI = {
  init: initTeamUI,
  setActive: setActiveTeamMember,
  setVisible: setRosterVisible,
  dispose,
};

