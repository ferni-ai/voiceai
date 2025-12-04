/**
 * Logger utility - wraps LiveKit's log for service usage
 */
import { log } from '@livekit/agents';

export function getLogger() {
  return log();
}

export default getLogger;

