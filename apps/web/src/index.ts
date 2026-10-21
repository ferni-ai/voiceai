/**
 * Voice AI Frontend - Entry Point
 *
 * This is the main entry point for the TypeScript frontend.
 * It initializes the application when the DOM is ready.
 */

// Initialize GSAP plugins early (before any animations)
import './utils/gsap-setup.js';
import { isCaptionsV2Enabled } from './ui/captions/captions-flag.js';

// Import and auto-initialize the app
export { app } from './app.js';

// Captions v2 (off by default, see ui/captions/captions-flag.ts): live call
// captions in their own region above the controls instead of over the avatar.
if (isCaptionsV2Enabled()) {
  void import('./ui/captions/live-captions.js').then((m) => m.initLiveCaptions());
}

// Report a reply (store policy), during and after a call; on unless switched off.
void import('./ui/report-reply/report-reply-entry.js').then((m) => m.initReportReply());

// Dev server only: ?e2e=1&gallery=overlays opens one of each overlay kind for
// screenshot review. Production builds set import.meta.env.DEV to false, so
// this branch and the gallery chunk are dropped.
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('e2e') === '1' && params.get('gallery') === 'overlays') {
    void import('./ui/dev-panel/overlay-gallery.js').then((m) => m.mountOverlayGallery());
  }
}

// Re-export types for external use
export * from './types/index.js';

// Re-export config for external use
export * from './config/index.js';
