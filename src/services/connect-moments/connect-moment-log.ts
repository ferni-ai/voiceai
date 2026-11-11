/**
 * One log line per connect-moment step, as counts only: the integration and the
 * step, never a uid, a phone number, a token or anything the caller said. Enough
 * to measure the yes rate, time to payoff and 7-day disconnects in Cloud Logging
 * (jsonPayload.msg = "CONNECT_MOMENT").
 *
 * @module services/connect-moments/connect-moment-log
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { ConnectableId } from './connectables.js';

const log = createLogger({ module: 'ConnectMoment' });

export type ConnectMomentStep =
  'asked' | 'yes' | 'sent' | 'send_failed' | 'tapped' | 'tap_refused' | 'connected' | 'payoff';

export function noteConnectMoment(
  integration: ConnectableId,
  step: ConnectMomentStep,
  /** A fixed reason code or a duration; never free text. */
  detail?: { reason?: string; elapsedMs?: number }
): void {
  log.info({ integration, step, ...detail }, 'CONNECT_MOMENT');
}
