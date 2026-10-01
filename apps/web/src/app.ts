/**
 * Voice AI Application
 *
 * Main application orchestrator that ties together all services and UI components.
 * A premium experience that rivals Apple and Google.
 *
 * The work lives in ./app/ — this file owns the singleton and its lifecycle:
 * - bootstrap.ts: startup sequence (routes, theme, auth, services, UI)
 * - connect-flow.ts / disconnect-flow.ts: call lifecycle
 * - persona-selection.ts: switching personas
 * - dispose.ts: cleanup
 */

// Must stay first: evaluates modules in the order app.ts always has
import './app/startup-module-order.js';

import type { PersonaId } from './types/persona.js';
import type { AppHost } from './app/app-host.js';
import { initializeApp } from './app/bootstrap.js';
import { connectToCoach } from './app/connect-flow.js';
import { installDevTooling } from './app/dev-tooling.js';
import { disconnectFromCoach, toggleMicrophoneMute } from './app/disconnect-flow.js';
import { disposeApp } from './app/dispose.js';
import { applyPersonaSelection } from './app/persona-selection.js';

// 🧪 Dev-only console helpers (window.testSoul, window.testFirstTimeUser)
installDevTooling();

// 🛠️ Dev Panel - Lazy loaded for performance (17KB gzipped savings)
// Dynamic import: const { initDevPanel } = await import('./ui/dev-panel.ui.js');

// ============================================================================
// APPLICATION CLASS
// ============================================================================

/**
 * Main application class.
 * Coordinates all services and UI components.
 */
class VoiceAIApp implements AppHost {
  /**
   * Initialize the application.
   * Must be called after DOM is ready.
   */
  initialize(): Promise<void> {
    return initializeApp(this);
  }

  /**
   * Connect to the AI coach with timeout handling.
   *
   * Philosophy: Gating should feel like natural breaks, not walls.
   * We check subscription limits but present them warmly.
   */
  connect(): Promise<void> {
    return connectToCoach();
  }

  /**
   * Disconnect from the AI coach (with a goodbye ceremony when the agent
   * has wrapped up the conversation).
   */
  disconnect(): Promise<void> {
    return disconnectFromCoach();
  }

  /**
   * Toggle microphone mute.
   */
  toggleMute(): void {
    toggleMicrophoneMute();
  }

  /**
   * Select a persona (for keyboard shortcuts and gestures).
   * Now with character-quality transition animations!
   */
  selectPersona(personaId: PersonaId): void {
    applyPersonaSelection(personaId);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    disposeApp();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton application instance.
 */
export const app = new VoiceAIApp();

// ============================================================================
// AUTO-INITIALIZE ON DOM READY
// ============================================================================

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void app.initialize();
    });
  } else {
    // DOM already ready
    void app.initialize();
  }
}
