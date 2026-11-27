/**
 * The theme start moved out of app.ts so the avatar lab can share it. The app
 * passes its tracked listener, so the toggle's listeners go through it (and are
 * removed on dispose); T toggles the theme unless the user is typing; the
 * selected persona's colours apply, and an unknown id falls back to Ferni.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toggleTheme: vi.fn(),
  setPersona: vi.fn(),
  selected: null as { id: string } | null,
}));

vi.mock('../../src/theme/index.js', () => ({
  initTheme: vi.fn(),
  watchSystemTheme: vi.fn(),
  startAmbientCycle: vi.fn(),
  toggleTheme: m.toggleTheme,
  setPersona: m.setPersona,
}));
vi.mock('../../src/services/circadian-manager.js', () => ({
  circadianManager: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/services/warmth-manager.js', () => ({
  warmthManager: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/services/persona-aura.js', () => ({
  personaAura: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/ui/magnetic-hover.ui.js', () => ({ initMagneticHover: vi.fn() }));
vi.mock('../../src/state/app.state.js', () => ({
  appState: { get: () => m.selected },
}));

import { applyPersonaTheme, initializeTheme } from '../../src/app/app-theme.js';

type Listen = (target: EventTarget, type: string, handler: EventListener) => void;

/** Listeners the tests added for real, removed after each test. */
const added: Array<[EventTarget, string, EventListener]> = [];
const addForReal: Listen = (target, type, handler) => {
  added.push([target, type, handler]);
  target.addEventListener(type, handler);
};

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.selected = null;
  document.body.innerHTML = '<button id="themeToggle"></button><input id="field" />';
});

afterEach(() => {
  for (const [target, type, handler] of added.splice(0)) target.removeEventListener(type, handler);
});

describe('initializeTheme', () => {
  it("adds the toggle's listeners through the caller's listen", () => {
    const listen = vi.fn<Listen>(addForReal);
    initializeTheme(listen);
    expect(listen.mock.calls.map(([target, type]) => [target, type])).toEqual([
      [document.getElementById('themeToggle'), 'click'],
      [document, 'keydown'],
    ]);
    document.getElementById('themeToggle')?.click();
    expect(m.toggleTheme).toHaveBeenCalledOnce();
  });

  it('toggles on T, but not while the user types in a field', () => {
    initializeTheme(addForReal);
    press('t');
    press('T');
    press('x');
    expect(m.toggleTheme).toHaveBeenCalledTimes(2);

    (document.getElementById('field') as HTMLInputElement).focus();
    press('t');
    expect(m.toggleTheme).toHaveBeenCalledTimes(2);
  });

  it("applies the selected persona's theme", () => {
    m.selected = { id: 'alex-chen' };
    initializeTheme(() => undefined);
    expect(m.setPersona).toHaveBeenCalledWith('alex-chen');
  });
});

describe('applyPersonaTheme', () => {
  it('falls back to Ferni for an id that is no persona or Legend', () => {
    applyPersonaTheme('nobody' as never);
    expect(m.setPersona).toHaveBeenCalledWith('ferni');
  });
});
