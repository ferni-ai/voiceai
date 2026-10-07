/**
 * Command palette: open/close, filtering, keyboard navigation and execution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: 'disconnected' as string,
  unlocked: new Set<string>(['ferni']),
  toggleTheme: vi.fn(),
  showShortcutsPanel: vi.fn(),
}));

vi.mock('../../src/state/app.state.js', () => ({
  appState: { get: (key: string) => (key === 'connection' ? mocks.connection : undefined) },
}));
vi.mock('../../src/services/team-unlock.service.js', () => ({
  isTeamMemberUnlocked: (id: string) => mocks.unlocked.has(id),
}));
vi.mock('../../src/theme/index.js', () => ({ toggleTheme: mocks.toggleTheme }));
vi.mock('../../src/ui/keyboard-shortcuts.ui.js', () => ({
  showShortcutsPanel: mocks.showShortcutsPanel,
}));

import {
  disposeCommandPalette,
  initCommandPalette,
  isCommandPaletteOpen,
} from '../../src/ui/command-palette.ui.js';

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document): void => {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  );
};
const input = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('.command-palette__input')!;
const type = (value: string): void => {
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
};
const optionLabels = (): string[] =>
  [...document.querySelectorAll('.command-palette__item-label')].map((el) => el.textContent ?? '');
const openPalette = (): void => press('k', { metaKey: true });

describe('command palette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.connection = 'disconnected';
    mocks.unlocked = new Set(['ferni']);
    initCommandPalette();
  });

  afterEach(() => {
    disposeCommandPalette();
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('open and close', () => {
    it('renders a hidden, labelled modal dialog on init', () => {
      const dialog = document.querySelector('.command-palette');
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.classList.contains('command-palette--open')).toBe(false);
      expect(isCommandPaletteOpen()).toBe(false);
    });

    it('opens with Cmd+K and Ctrl+K toggles it closed again', () => {
      openPalette();
      expect(isCommandPaletteOpen()).toBe(true);
      expect(document.activeElement).toBe(input());
      press('k', { ctrlKey: true });
      expect(isCommandPaletteOpen()).toBe(false);
    });

    it('ignores K with other modifiers', () => {
      press('k', { metaKey: true, shiftKey: true });
      press('k');
      expect(isCommandPaletteOpen()).toBe(false);
    });

    it('closes on Escape without letting other Escape handlers fire, and restores focus', () => {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();
      const outsideEscape = vi.fn();
      document.addEventListener('keydown', outsideEscape);

      openPalette();
      outsideEscape.mockClear();
      press('Escape', {}, input());

      expect(isCommandPaletteOpen()).toBe(false);
      expect(outsideEscape).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
      document.removeEventListener('keydown', outsideEscape);
    });

    it('closes from the backdrop and the close button', () => {
      openPalette();
      document.querySelector<HTMLElement>('.command-palette__backdrop')!.click();
      expect(isCommandPaletteOpen()).toBe(false);
      openPalette();
      document.querySelector<HTMLElement>('.command-palette__close')!.click();
      expect(isCommandPaletteOpen()).toBe(false);
    });
  });

  describe('filtering', () => {
    it('shows only commands that are available right now', () => {
      openPalette();
      const labels = optionLabels();
      expect(labels).toContain('Start a conversation');
      expect(labels).not.toContain('End conversation');
      expect(labels).toContain('Talk with Ferni');
      expect(labels).not.toContain('Talk with Maya');
    });

    it('swaps start for end while connected and shows unlocked team members', () => {
      mocks.connection = 'connected';
      mocks.unlocked.add('maya-santos');
      openPalette();
      const labels = optionLabels();
      expect(labels).toContain('End conversation');
      expect(labels).not.toContain('Start a conversation');
      expect(labels).toContain('Talk with Maya');
    });

    it('matches labels, descriptions and keywords', () => {
      openPalette();
      type('dark');
      expect(optionLabels()).toEqual(['Switch light / dark']);
      type('schedule');
      expect(optionLabels()).toEqual(['Calendar']);
    });

    it('shows a gentle empty state', () => {
      openPalette();
      type('zzzzqq');
      expect(optionLabels()).toEqual([]);
      expect(document.querySelector('.command-palette__empty')?.textContent).toBe(
        'Nothing matches that yet'
      );
      expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('renders labels as text, never as HTML', () => {
      disposeCommandPalette();
      initCommandPalette({
        commands: [
          { id: 'x', label: '<img src=x onerror=alert(1)>', category: 'actions', action: vi.fn() },
        ],
      });
      openPalette();
      type('img');
      expect(document.querySelector('.command-palette__results img')).toBeNull();
    });
  });

  describe('keyboard navigation', () => {
    it('moves aria-activedescendant with arrows and wraps around', () => {
      openPalette();
      const options = document.querySelectorAll('[role="option"]');
      expect(input().getAttribute('aria-activedescendant')).toBe(options[0]!.id);

      press('ArrowDown', {}, input());
      expect(input().getAttribute('aria-activedescendant')).toBe(options[1]!.id);
      expect(options[1]!.getAttribute('aria-selected')).toBe('true');

      press('ArrowUp', {}, input());
      press('ArrowUp', {}, input());
      expect(input().getAttribute('aria-activedescendant')).toBe(options[options.length - 1]!.id);
    });
  });

  describe('execution', () => {
    it('runs the highlighted command on Enter after closing', () => {
      openPalette();
      type('dark');
      press('Enter', {}, input());
      expect(isCommandPaletteOpen()).toBe(false);
      expect(mocks.toggleTheme).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(mocks.toggleTheme).toHaveBeenCalledTimes(1);
    });

    it('dispatches the event the app listens for when an option is clicked', () => {
      const onCalendar = vi.fn();
      window.addEventListener('ferni:open-calendar', onCalendar);
      openPalette();
      type('calendar');
      document.querySelector<HTMLElement>('[data-command-id="view-calendar"]')!.click();
      vi.runAllTimers();
      expect(onCalendar).toHaveBeenCalledTimes(1);
      window.removeEventListener('ferni:open-calendar', onCalendar);
    });

    it('starts a call through ferni:toggle-call and opens the shortcuts panel directly', () => {
      const onToggleCall = vi.fn();
      window.addEventListener('ferni:toggle-call', onToggleCall);
      openPalette();
      type('start a conversation');
      press('Enter', {}, input());
      openPalette();
      type('keyboard');
      press('Enter', {}, input());
      vi.runAllTimers();
      expect(onToggleCall).toHaveBeenCalledTimes(1);
      expect(mocks.showShortcutsPanel).toHaveBeenCalledTimes(1);
      window.removeEventListener('ferni:toggle-call', onToggleCall);
    });

    it('switches persona with the full persona id the app expects', () => {
      mocks.unlocked.add('maya-santos');
      const onSwitch = vi.fn();
      window.addEventListener('ferni:switch-persona', onSwitch);
      openPalette();
      type('maya');
      press('Enter', {}, input());
      vi.runAllTimers();
      expect((onSwitch.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        persona: 'maya-santos',
      });
      window.removeEventListener('ferni:switch-persona', onSwitch);
    });

    it('logs instead of throwing when a command fails', async () => {
      disposeCommandPalette();
      initCommandPalette({
        commands: [
          {
            id: 'boom',
            label: 'Boom',
            category: 'actions',
            action: () => Promise.reject(new Error('x')),
          },
        ],
      });
      openPalette();
      type('boom');
      press('Enter', {}, input());
      await vi.runAllTimersAsync();
      expect(isCommandPaletteOpen()).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('removes orphaned palettes on re-init (HMR) and unbinds Cmd+K on dispose', () => {
      disposeCommandPalette();
      const orphan = document.createElement('div');
      orphan.className = 'command-palette';
      document.body.appendChild(orphan);

      initCommandPalette();
      expect(document.querySelectorAll('.command-palette')).toHaveLength(1);
      expect(document.querySelectorAll('#ferni-command-palette')).toHaveLength(1);

      disposeCommandPalette();
      expect(document.querySelector('.command-palette')).toBeNull();
      openPalette();
      expect(isCommandPaletteOpen()).toBe(false);
    });
  });
});
