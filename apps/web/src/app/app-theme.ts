/**
 * The theme every page with the avatar starts: the stored or system theme,
 * the ambient layers (circadian time, relationship warmth, persona aura), the
 * ambient cycle, magnetic hover and the theme toggle (button and T key).
 *
 * Moved out of app.ts so the avatar lab (src/avatar-lab) starts exactly the
 * theme the app does. Needs initI18n first: the circadian theme names its
 * period with t().
 */
import { circadianManager } from '../services/circadian-manager.js';
import { personaAura } from '../services/persona-aura.js';
import { warmthManager } from '../services/warmth-manager.js';
import { appState } from '../state/app.state.js';
import {
  initTheme,
  setPersona as setThemePersona,
  startAmbientCycle,
  toggleTheme,
  watchSystemTheme,
} from '../theme/index.js';
import { isLegendId, isValidPersonaId, type SpeakerId } from '../types/persona.js';
import { initMagneticHover } from '../ui/magnetic-hover.ui.js';

/** Adds a listener; the app passes one that it removes on dispose. */
type AddListener = (target: EventTarget, type: string, handler: EventListener) => void;

/** The persona's theme colours: canonical ids, and a Legend while one speaks; anyone else is Ferni. */
export function applyPersonaTheme(personaId: SpeakerId): void {
  setThemePersona(isValidPersonaId(personaId) || isLegendId(personaId) ? personaId : 'ferni');
}

/**
 * `listen` wires the theme toggle (button and T key) and is the app's alone.
 * Without it (the avatar lab) nothing can change the theme saved in localStorage,
 * which the same-origin admin and app read.
 */
export function initializeTheme(listen?: AddListener): void {
  initTheme();
  watchSystemTheme();

  // Layered theming: circadian (time of day), warmth (deepens as the bond grows),
  // persona aura (ambient glow of the active teammate).
  circadianManager.injectStyles();
  circadianManager.init();
  warmthManager.injectStyles();
  warmthManager.init();
  personaAura.injectStyles();
  personaAura.init();

  startAmbientCycle(); // time-aware ambient lighting
  initMagneticHover();

  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn && listen) {
    listen(toggleBtn, 'click', () => toggleTheme());
    // T toggles the theme, unless the user is typing
    listen(document, 'keydown', ((e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return;
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '');
      if (!typing) toggleTheme();
    }) as EventListener);
  }

  const persona = appState.get('selectedPersona');
  if (persona?.id) applyPersonaTheme(persona.id);
}
