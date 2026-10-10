/**
 * Handoff and cameo recovery messages.
 *
 * When a handoff's soft-open never gets its handoff_started (handoff.service) or a
 * cameo outlives its safety limit (cameo.service), the services reset their own
 * state and dispatch ferni:handoff-timeout / ferni:cameo-timeout so the UI can say
 * so. Without a listener the person just saw a switch that never happened, or a
 * guest voice vanish, with no word. Say it gently, once.
 *
 * Initialised by initHandoffPresence (the team roster owns the handoff UI).
 */

import { t } from '../i18n/index.js';
import { toast } from './whisper.ui.js';

/** Listen for the two timeout events. Returns the cleanup. */
export function initHandoffRecovery(): () => void {
  const onHandoffTimeout = (): void => {
    toast.info(t('teamRoster.handoffTimeout'));
  };
  const onCameoTimeout = (): void => {
    toast.info(t('teamRoster.cameoTimeout'));
  };

  document.addEventListener('ferni:handoff-timeout', onHandoffTimeout);
  document.addEventListener('ferni:cameo-timeout', onCameoTimeout);

  return () => {
    document.removeEventListener('ferni:handoff-timeout', onHandoffTimeout);
    document.removeEventListener('ferni:cameo-timeout', onCameoTimeout);
  };
}
