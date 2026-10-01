/**
 * Theme Initialization
 *
 * Theme system, ambient experience managers and the theme / Director
 * Console keyboard shortcuts.
 */

import { initTheme, onThemeChange, startAmbientCycle, toggleTheme } from '../theme/index.js';
import { appState } from '../state/app.state.js';
import { circadianManager } from '../services/circadian-manager.js';
import { personaAura } from '../services/persona-aura.js';
import { warmthManager } from '../services/warmth-manager.js';
import { toggleDirectorConsole } from '../ui/director-console.ui.js';
import { initMagneticHover } from '../ui/magnetic-hover.ui.js';
import { addTrackedListener } from './init-helpers.js';
import { updatePersonaTheme } from './persona-selection.js';

/**
 * Initialize the theme system.
 * Sets up theme from localStorage/system preference and wires up toggle button.
 */
export function initializeTheme(): void {
  // Initialize theme from stored preference or system
  initTheme();

  // ========================================================================
  // AMBIENT EXPERIENCE SYSTEM (Better than Apple/Google)
  // Layered theming: Circadian (time) + Warmth (relationship) + Persona
  // ========================================================================

  // 1. Circadian: Time-aware theming (dawn warmth, midday clarity, night intimacy)
  circadianManager.injectStyles();
  circadianManager.init();

  // 2. Warmth: Relationship-based visual evolution (deepens as bond grows)
  warmthManager.injectStyles();
  warmthManager.init();

  // 3. Persona Aura: Ambient glow reflecting the active team member
  personaAura.injectStyles();
  personaAura.init();

  // Start ambient warmth cycle (WALL-E style time-aware lighting)
  startAmbientCycle();

  // Initialize magnetic hover effect (WALL-E curiosity)
  initMagneticHover();

  // Wire up theme toggle button
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    addTrackedListener(toggleBtn, 'click', () => {
      toggleTheme();
    });

    // Add keyboard shortcut (T) for theme toggle
    addTrackedListener(document, 'keydown', ((e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        // Don't toggle if user is typing in an input
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          toggleTheme();
        }
      }
    }) as EventListener);
  }

  // Director Console: Cmd+Shift+E / Ctrl+Shift+E (only when not typing)
  addTrackedListener(document, 'keydown', ((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key?.toLowerCase() === 'e') {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        toggleDirectorConsole();
      }
    }
  }) as EventListener);

  // Listen for theme changes (for analytics or other systems)
  onThemeChange((_newTheme) => {
    // Reserved for future analytics/telemetry
  });

  // Set initial persona theme
  const persona = appState.get('selectedPersona');
  if (persona?.id) {
    updatePersonaTheme(persona.id);
  }
}
