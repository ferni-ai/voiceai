/**
 * Persona Selection
 *
 * Switching the active persona: theme colors, UI systems and, while
 * connected, a handoff request to the voice agent.
 */

import type { PersonaId } from '../types/persona.js';
import { setPersona as setThemePersona } from '../theme/index.js';
import { appState, setSelectedPersona } from '../state/app.state.js';
import { handoffService } from '../services/index.js';
import { coachUI } from '../ui/coach.ui.js';
import { teamUI } from '../ui/team.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { gesturesUI } from '../ui/gestures.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { statsUI } from '../ui/stats.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { thinkingUI } from '../ui/thinking.ui.js';
import { setCommandsPersonaId } from '../ui/commands.ui.js';
import { getSanctuaryUI } from '../ui/sanctuary.ui.js';
import { animatePersonaTransition } from '../ui/animation-orchestrator.ui.js';
import { getPersona } from '../config/personas.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Update the persona theme colors.
 */
export function updatePersonaTheme(personaId: PersonaId): void {
  // Use canonical persona IDs (CSS selectors now use these)
  const validIds = [
    'ferni',
    'peter-john',
    'alex-chen',
    'maya-santos',
    'jordan-taylor',
    'nayan-patel',
  ];
  const themePersona = validIds.includes(personaId) ? personaId : 'ferni';
  setThemePersona(themePersona as Parameters<typeof setThemePersona>[0]);
}

/**
 * Select a persona (for keyboard shortcuts and gestures).
 * Now with character-quality transition animations!
 */
export function applyPersonaSelection(personaId: PersonaId): void {
  const currentPersona = appState.get('selectedPersona');
  const persona = getPersona(personaId);

  // 🎬 Animate the transition with animation principles
  void animatePersonaTransition(currentPersona.id, personaId);

  // Update state
  setSelectedPersona(personaId);

  // Update theme persona colors
  updatePersonaTheme(personaId);

  // Update UI
  coachUI.updatePersona(persona);
  waveformUI.setPersona(personaId);
  teamUI.setActive(personaId);
  gesturesUI.setCurrentPersona(personaId);
  statsUI.setPersona(persona.name);
  thinkingUI.setPersona(personaId); // Persona-specific thinking messages
  avatarFeedback.setPersona(personaId); // Persona-specific idle behaviors
  setCommandsPersonaId(personaId); // Update guided practices for new persona
  getSanctuaryUI().setPersonaId(personaId); // Update sanctuary for new persona

  // Play sound
  soundUI.play('switch');

  // If connected, request handoff
  if (appState.get('connection') === 'connected') {
    requestHandoff(personaId);
  }
}

/**
 * Request handoff to a different persona while connected.
 * FIX BUG: Now routes through handoffService for proper rate limiting,
 * validation, retry logic, and state management.
 */
function requestHandoff(targetPersonaId: PersonaId): void {
  // Use handoffService for proper rate limiting, validation, and retry logic
  void handoffService.sendHandoffRequest(targetPersonaId, {
    onFailure: (error) => {
      log.error('Handoff request failed:', error);
      // Don't show toast here - handoffService already handles feedback
    },
  });
}
