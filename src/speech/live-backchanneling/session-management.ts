/**
 * Live Backchanneling Session Management
 *
 * Singleton instance management for live backchanneling services.
 */

import { BreathPauseDetector } from './breath-pause.js';
import { LiveBackchannelingService } from './service.js';

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let liveBackchannelInstance: LiveBackchannelingService | null = null;
let breathPauseDetectorInstance: BreathPauseDetector | null = null;

export function getLiveBackchannelingService(): LiveBackchannelingService {
  if (!liveBackchannelInstance) {
    liveBackchannelInstance = new LiveBackchannelingService();
  }
  return liveBackchannelInstance;
}

export function getBreathPauseDetector(): BreathPauseDetector {
  if (!breathPauseDetectorInstance) {
    breathPauseDetectorInstance = new BreathPauseDetector();
  }
  return breathPauseDetectorInstance;
}

export function resetLiveBackchanneling(): void {
  liveBackchannelInstance?.reset();
  liveBackchannelInstance = null;
  breathPauseDetectorInstance?.reset();
  breathPauseDetectorInstance = null;
}
