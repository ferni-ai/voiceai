/**
 * Mic Restore
 *
 * Re-enables the microphone after things that silently take it away: a LiveKit
 * reconnect, the tab coming back to the foreground, or the native app resuming
 * (phone call, background). Never re-enables it while the user has muted.
 * Split out of connection.service.ts.
 */

import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Connection');

export interface MicRoom {
  state: string;
  localParticipant?: {
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
    getTrackPublications(): Array<{ kind?: string; track?: unknown }>;
  };
  on(event: string, callback: (...args: unknown[]) => void): unknown;
  off(event: string, callback: (...args: unknown[]) => void): unknown;
}

/** The user's mute choice, read from the real app state. */
export function isUserMuted(): boolean {
  return appState.get('isMuted') === true;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attach the restore handlers to `room` and the document.
 * Returns a cleanup function that removes all of them.
 */
export function registerMicRestoreHandlers(room: MicRoom): () => void {
  const onReconnected = async (): Promise<void> => {
    if (isUserMuted() || !room.localParticipant) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      log.info('🎤 Microphone re-enabled after reconnection');
    } catch (err) {
      log.warn('Failed to re-enable mic after reconnection:', err);
    }
  };

  const onVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState !== 'visible' || room.state !== 'connected') return;
    if (isUserMuted() || !room.localParticipant) return;
    try {
      // Small delay to let the audio context resume
      await delay(100);
      const publishing = room.localParticipant
        .getTrackPublications()
        .some((pub) => pub.kind === 'audio' && pub.track);
      if (!publishing) {
        await room.localParticipant.setMicrophoneEnabled(true);
        log.info('🎤 Microphone restored after visibility change');
      }
    } catch (err) {
      log.warn('Failed to restore mic on visibility change:', err);
    }
  };

  const onAppState = async (event: Event): Promise<void> => {
    const { isActive } = (event as CustomEvent<{ isActive: boolean }>).detail;
    if (!isActive || room.state !== 'connected') return;
    if (isUserMuted() || !room.localParticipant) return;
    try {
      // Longer delay for native: the iOS audio session needs time to restore
      await delay(300);
      await room.localParticipant.setMicrophoneEnabled(true);
      log.info('🎤 Microphone restored after native app state change');
    } catch (err) {
      log.warn('Failed to restore mic on app state change:', err);
    }
  };

  const reconnected = (): void => void onReconnected();
  const visibility = (): void => void onVisibilityChange();
  const appStateChange = (event: Event): void => void onAppState(event);

  room.on('reconnected', reconnected);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('ferni:app-state', appStateChange);

  return () => {
    room.off('reconnected', reconnected);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('ferni:app-state', appStateChange);
  };
}
