/**
 * Handoff Callbacks
 *
 * Persona handoff UI: progress indicator, safety timeout, rollback on
 * failure and the arrival celebration.
 */

import { handoffService } from '../services/index.js';
import { coachUI } from '../ui/coach.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { gesturesUI } from '../ui/gestures.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { statsUI } from '../ui/stats.ui.js';
import { thinkingUI } from '../ui/thinking.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { setCommandsPersonaId } from '../ui/commands.ui.js';
import { getSanctuaryUI } from '../ui/sanctuary.ui.js';
import { playCharacterReaction } from '../ui/animation-orchestrator.ui.js';
import { getPersona } from '../config/personas.js';
import { updatePersonaTheme } from './persona-selection.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Wire handoff service callbacks to the UI.
 */
export function setupHandoffCallbacks(): void {
  // Handoff service callbacks

  // When handoff starts - show transitioning state
  // FIX BUG: Store timeout ID for cleanup
  let handoffUITimeout: ReturnType<typeof setTimeout> | null = null;

  handoffService.onHandoffStart((toPersona, _fromPersona) => {
    log.debug('onHandoffStart:', { toPersona });

    // Show shimmer effect on waveform
    waveformUI.setTransitioning(true);

    // 🎬 Expression: Curious "thinking" expression during handoff
    ferniExpressions.contemplation(1500);

    // Show handoff progress indicator
    const handoffProgress = document.getElementById('handoffProgress');
    const handoffTargetName = document.getElementById('handoffTargetName');
    if (handoffProgress && handoffTargetName) {
      const persona = getPersona(toPersona);
      handoffTargetName.textContent = persona.name;
      handoffProgress.classList.remove('hidden');
      log.debug('Showing handoff progress for', persona.name);
    } else {
      log.warn('handoffProgress element not found!');
    }

    // FIX BUG: Safety timeout - force hide UI after 20 seconds max
    if (handoffUITimeout) clearTimeout(handoffUITimeout);
    handoffUITimeout = setTimeout(() => {
      log.warn('Safety timeout - forcing handoff UI cleanup');
      waveformUI.setTransitioning(false);
      const progress = document.getElementById('handoffProgress');
      if (progress) progress.classList.add('hidden');
      thinkingUI.hide();
    }, 20000);
  });

  // When handoff completes - agent is ready to speak
  handoffService.onHandoffComplete((toPersona) => {
    log.debug('onHandoffComplete:', { toPersona });

    // FIX BUG: Clear safety timeout
    if (handoffUITimeout) {
      clearTimeout(handoffUITimeout);
      handoffUITimeout = null;
    }

    // End shimmer, return to normal
    waveformUI.setTransitioning(false);

    // 🎬 Expression: New persona arrives with excited greeting
    ferniExpressions.heldPose('happy', 500);

    // Hide handoff progress indicator
    const handoffProgress = document.getElementById('handoffProgress');
    if (handoffProgress) {
      handoffProgress.classList.add('hidden');
      log.debug('Hiding handoff progress');
    }
    // Also make sure thinking is hidden
    thinkingUI.hide();
  });

  // When handoff fails - hide indicator and show error
  // FIX AUDIT GAP #1: Now receives rollbackTo to restore waveform/avatar persona
  handoffService.onHandoffFailed((error, targetPersona, rollbackTo) => {
    log.error('onHandoffFailed:', { error, targetPersona, rollbackTo });
    // FIX BUG: Clear safety timeout
    if (handoffUITimeout) {
      clearTimeout(handoffUITimeout);
      handoffUITimeout = null;
    }

    waveformUI.setTransitioning(false);

    // FIX AUDIT GAP #1: Restore waveform and other UI to rollback persona
    if (rollbackTo) {
      log.info('Restoring UI systems to rollback persona:', rollbackTo);
      waveformUI.setPersona(rollbackTo);
      gesturesUI.setCurrentPersona(rollbackTo);
      updatePersonaTheme(rollbackTo);
    }

    const handoffProgress = document.getElementById('handoffProgress');
    if (handoffProgress) {
      handoffProgress.classList.add('hidden');
    }
    thinkingUI.hide();
    messageUI.show("Couldn't reach them right now. I'm still here though!", 'error', 3000);
  });

  // When handoff is cancelled - hide indicator
  handoffService.onHandoffCancelled((targetPersona, reason) => {
    log.info('onHandoffCancelled:', { targetPersona, reason });
    // FIX BUG: Clear safety timeout
    if (handoffUITimeout) {
      clearTimeout(handoffUITimeout);
      handoffUITimeout = null;
    }

    waveformUI.setTransitioning(false);

    const handoffProgress = document.getElementById('handoffProgress');
    if (handoffProgress) {
      handoffProgress.classList.add('hidden');
    }
    thinkingUI.hide();
  });

  // FIX AUDIT GAP #3: Subscribe to handoff progress for waveform visual feedback
  // This provides visual progress indication on the waveform/avatar even when team roster is hidden
  handoffService.onHandoffProgress((targetPersona, elapsedMs, timeoutMs) => {
    log.debug('onHandoffProgress:', { targetPersona, elapsedMs, timeoutMs });

    // Calculate progress percentage (0-100)
    const progress = Math.min(100, Math.round((elapsedMs / timeoutMs) * 100));

    // Update waveform with progress indication
    // The waveform shimmer intensity can vary based on progress
    if (progress > 50) {
      // After halfway, intensify the shimmer to show progress
      // (waveformUI already handles transitioning state, but this adds visual variety)
      log.debug('Handoff progress:', `${progress}%`);
    }

    // Update the handoff progress element if present
    const handoffProgress = document.getElementById('handoffProgress');
    if (handoffProgress) {
      // Add a data attribute for CSS-based progress visualization
      handoffProgress.setAttribute('data-progress', String(progress));
    }
  });

  // Main handoff callback (plays sounds, updates UI)
  handoffService.onHandoff((handoff) => {
    log.debug('onHandoff:', { toPersona: handoff.toPersona, fromPersona: handoff.fromPersona });

    // Get the NEW persona directly from the handoff, not from state
    const newPersona = getPersona(handoff.toPersona);
    const enhanced = handoff as { entrancePhrase?: string; isFirstMeeting?: boolean };

    // FIX BUG: Clean up any stuck transition UI state
    // This handles legacy single-message handoffs that don't have separate start/complete
    waveformUI.setTransitioning(false);
    const handoffProgress = document.getElementById('handoffProgress');
    if (handoffProgress) {
      handoffProgress.classList.add('hidden');
    }
    // Also hide thinking indicator in case it's stuck
    thinkingUI.hide();

    // 🎬 Character-style celebration on handoff
    const avatarContainer = document.querySelector('.avatar-container');
    if (avatarContainer instanceof HTMLElement) {
      void playCharacterReaction(avatarContainer, 'joy', newPersona.id);
    }
    coachUI.flash();

    // Update theme persona colors
    updatePersonaTheme(newPersona.id);

    // Update all UI systems
    waveformUI.setPersona(newPersona.id);
    gesturesUI.setCurrentPersona(newPersona.id);
    statsUI.setPersona(newPersona.name);
    setCommandsPersonaId(newPersona.id); // Update guided practices for new persona
    getSanctuaryUI().setPersonaId(newPersona.id); // Update sanctuary for new persona
    // Particles disabled for cleaner look
    // void agentParticlesUI.setPersona(newPersona.id);

    // Play switch sound
    soundUI.play('switch');

    // Show entrance phrase or welcome message
    if (enhanced.isFirstMeeting && enhanced.entrancePhrase) {
      // First time meeting - warm welcome
      messageUI.show(enhanced.entrancePhrase, 'success', 3000);
      celebrationsUI.connectionWarmth();
    } else {
      // Returning - show shorter message
      messageUI.show(`${newPersona.name} is back!`, 'success', 2000);
    }

    // Update waveform colors to match persona
    if (newPersona.colors) {
      waveformUI.setEmotion('neutral', 0.7);
    }
  });
}
