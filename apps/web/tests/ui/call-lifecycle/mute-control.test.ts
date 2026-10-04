/**
 * The mute control is real: index.html ships #muteBtn, the controls show it during
 * a live call, clicking it toggles mute, and the M shortcut reaches the app.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, setConnectionState } from '../../../src/state/app.state.js';
import { initControlsUI } from '../../../src/ui/controls.ui.js';
import {
  disposeKeyboardShortcuts,
  getShortcuts,
  initKeyboardShortcuts,
} from '../../../src/ui/keyboard-shortcuts.ui.js';

const indexHtml = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

function mountControlsFromIndexHtml(): void {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  const controls = doc.querySelector('.controls-row');
  document.body.innerHTML = '';
  if (controls) document.body.appendChild(document.importNode(controls, true));
}

describe('mute button', () => {
  beforeEach(() => {
    setConnectionState('disconnected');
    appState.set('isMuted', false);
    mountControlsFromIndexHtml();
  });

  it('exists in index.html with an accessible label', () => {
    const btn = document.getElementById('muteBtn');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Mute microphone');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('is shown only during a live call and toggles mute when clicked', () => {
    const onMuteToggle = vi.fn();
    initControlsUI({ onConnect: vi.fn(), onDisconnect: vi.fn(), onMuteToggle });
    const btn = document.getElementById('muteBtn') as HTMLButtonElement;
    expect(btn.style.display).toBe('none');

    setConnectionState('connected');
    expect(btn.style.display).toBe('flex');

    btn.click();
    expect(onMuteToggle).toHaveBeenCalledOnce();

    appState.set('isMuted', true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Unmute microphone');
    expect(btn.classList.contains('muted')).toBe(true);
  });

  it('does not carry a mute into the next call', () => {
    initControlsUI({ onConnect: vi.fn(), onDisconnect: vi.fn(), onMuteToggle: vi.fn() });
    setConnectionState('connected');
    appState.set('isMuted', true);

    setConnectionState('disconnected');

    expect(appState.get('isMuted')).toBe(false);
  });
});

describe('keyboard shortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="someButton">Open</button>';
    initKeyboardShortcuts();
  });
  afterEach(() => disposeKeyboardShortcuts());

  function press(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...init }));
  }

  it('M asks the app to toggle mute', () => {
    const onToggle = vi.fn();
    window.addEventListener('ferni:toggle-mute', onToggle);
    press('m');
    window.removeEventListener('ferni:toggle-mute', onToggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('Enter on a focused button activates the button, not the call', () => {
    const onToggleCall = vi.fn();
    window.addEventListener('ferni:toggle-call', onToggleCall);
    (document.getElementById('someButton') as HTMLButtonElement).focus();
    press('Enter');
    window.removeEventListener('ferni:toggle-call', onToggleCall);
    expect(onToggleCall).not.toHaveBeenCalled();
  });

  it('only advertises shortcuts the app handles, and never Esc-to-hang-up', () => {
    const keys = getShortcuts().map((s) => s.key);
    expect(keys).toContain('m');
    expect(keys).toContain('r');
    expect(keys).not.toContain('Escape');
    expect(keys).not.toContain(' ');
    expect(keys).not.toContain('/');
  });
});
