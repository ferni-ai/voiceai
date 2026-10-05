/**
 * Disconnect Report
 *
 * Logs a LiveKit room disconnect and forwards it to the disconnect diagnostics
 * and crash analytics services. Split out of connection.service.ts.
 */

import { createLogger } from '../utils/logger.js';

// Same logger name as connection.service.ts so existing log filters keep matching.
const log = createLogger('Connection');

export interface DisconnectDetails {
  reason: string;
  wasGraceful: boolean;
  roomName?: string;
  roomState?: string;
  at: number;
}

export async function reportDisconnect(details: DisconnectDetails): Promise<void> {
  const { reason, wasGraceful, roomName, roomState } = details;
  const disconnectTime = new Date(details.at).toISOString();

  log.warn(
    { wasGraceful, disconnectReason: reason, roomName, roomState, disconnectTime },
    wasGraceful
      ? '🔌 Graceful disconnect from LiveKit room'
      : `🚨 UNEXPECTED DISCONNECT from LiveKit room - reason: ${reason}`
  );

  try {
    const { captureDisconnectDiagnostic, endSession } =
      await import('./disconnect-diagnostics.service.js');
    await captureDisconnectDiagnostic(reason, wasGraceful, roomState);
    endSession();
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to capture disconnect diagnostics');
  }

  // Report unexpected disconnections to crash analytics with full context
  try {
    const { reportConnectionDrop } = await import('./crash-reporter.service.js');
    reportConnectionDrop(`LiveKit disconnect: ${reason}`, wasGraceful, {
      roomName,
      disconnectTime,
      disconnectReason: reason,
      source: 'livekit_disconnected_event',
    });
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to report connection drop');
  }
}
