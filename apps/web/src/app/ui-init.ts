/**
 * UI Initialization
 *
 * Runs every UI init step in the original order. Listeners registered for
 * the same event fire in registration order, so the order here matters.
 */

import { setShowTeamHuddleCallback } from './data-message-handlers.js';
import { showTeamHuddle } from './panel-methods.js';
import type { AppHost } from './app-host.js';
import { wireCallControlEvents, wireGestures } from './input-wiring.js';
import { wireNavigationEvents, wireQuickActionEvents } from './navigation-events.js';
import { initSettingsMenu } from './settings-menu-wiring.js';
import { checkVoiceReEnrollment, loadEngagementData, showWelcome } from './startup-checks.js';
import { initCoreUI } from './ui-core-init.js';
import { initDeferredUI } from './ui-deferred-init.js';
import { initFeatureUI } from './ui-feature-init.js';
import { handleUrlCallbacks } from './url-callbacks.js';

/**
 * Initialize all UI components.
 */
export function initializeUI(host: AppHost): void {
  initCoreUI(host);
  initDeferredUI(host);
  initFeatureUI();
  initSettingsMenu();
  wireNavigationEvents(host);
  handleUrlCallbacks();
  wireQuickActionEvents();

  // Set up team huddle callback for data message handlers
  setShowTeamHuddleCallback(() => showTeamHuddle());

  // 📊 Load engagement data (API first, demo fallback in dev)
  void loadEngagementData();

  // 🔊 Check for voice profile re-enrollment needs
  void checkVoiceReEnrollment();
  // Agent particles disabled for cleaner professional UI
  // safeInit('AgentParticlesUI', () => void initAgentParticles());

  wireCallControlEvents(host);

  // Show personalized greeting and track visit
  showWelcome();

  // Keyboard shortcuts with app callbacks (disabled for now)
  // initKeyboardUI({
  //   onConnect: () => { void host.connect(); },
  //   onDisconnect: () => { void host.disconnect(); },
  //   onSelectPersona: (personaId: PersonaId) => { host.selectPersona(personaId); },
  // });

  wireGestures(host);
}
