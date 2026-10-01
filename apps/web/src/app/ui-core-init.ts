/**
 * Core UI Initialization
 *
 * GSAP, the offline banner and the critical UI components needed for
 * first paint.
 */

import { initCoachUI } from '../ui/coach.ui.js';
import { initControlsUI } from '../ui/controls.ui.js';
import { initExpressiveEyes } from '../ui/expressive-eyes.ui.js';
import { initMessageUI } from '../ui/message.ui.js';
import { initSpotifyUI } from '../ui/spotify.ui.js';
import { initTeamUI } from '../ui/team.ui.js';
import { initWaveformUI } from '../ui/waveform.ui.js';
import { initGSAP, promoteAllToGPU } from '../utils/gsap-animations.js';
import { safeInit } from './init-helpers.js';
import type { AppHost } from './app-host.js';

/**
 * Initialize the critical UI components, in dependency order.
 */
export function initCoreUI(host: AppHost): void {
  // ⚡ Initialize GSAP for GPU-accelerated animations
  safeInit('GSAP', () => {
    initGSAP();
    // Promote frequently animated elements to GPU layers
    // NOTE: #coachAvatar removed - causes visible box bug in Safari
    // GSAP's force3D config (set in initGSAP) handles GPU acceleration
    promoteAllToGPU('.waveform-bar, .btn');
  });

  // System UI - Critical system-level UI components
  safeInit('OfflineBanner', async () => {
    const { initOfflineBanner } = await import('../ui/offline-banner.ui.js');
    initOfflineBanner();
  });

  // Core UI - Initialize in order of dependency (these are critical)
  safeInit('MessageUI', () => initMessageUI());
  safeInit('WaveformUI', () => initWaveformUI());
  safeInit('CoachUI', () => initCoachUI());
  safeInit('ExpressiveEyes', () => initExpressiveEyes()); // 👀 Pixar-style eye expressions
  safeInit('TeamUI', () => initTeamUI());
  safeInit('SpotifyUI', () => initSpotifyUI());
  safeInit('ControlsUI', () =>
    initControlsUI({
      onConnect: () => {
        void host.connect();
      },
      onDisconnect: () => {
        void host.disconnect();
      },
      onMuteToggle: () => host.toggleMute(),
    })
  );
}
