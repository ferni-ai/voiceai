/**
 * Connecting has one status, on the button, and the button cancels it.
 * Before: the button was disabled for up to 30s and a hard-coded English
 * "Connecting" sat beside three other status lines.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const onCancelConnect = vi.fn();

const { appState } = await import('../../../src/state/app.state.js');
const { initControlsUI } = await import('../../../src/ui/controls.ui.js');

function mount() {
  document.body.innerHTML = `
    <div class="controls">
      <button id="connectBtn"><span class="btn-content">Connect</span></button>
      <button id="disconnectBtn">Disconnect</button>
    </div>`;
  const onConnect = vi.fn();
  initControlsUI({ onConnect, onCancelConnect, onDisconnect: vi.fn(), onMuteToggle: vi.fn() });
  return { btn: document.getElementById('connectBtn') as HTMLButtonElement, onConnect };
}

describe('connect button while connecting', () => {
  beforeEach(() => {
    onCancelConnect.mockClear();
    appState.set('connection', 'disconnected');
  });

  it('stays tappable, says what is happening, and cancels instead of connecting again', () => {
    const { btn, onConnect } = mount();
    appState.set('connection', 'connecting');

    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    // Two lines in the pill; one sentence for screen readers.
    expect(btn.querySelector('.btn-status-main')?.textContent).toBe('Calling Ferni…');
    expect(btn.querySelector('.btn-status-hint')?.textContent).toBe('Tap to cancel');
    expect(btn.querySelector('.btn-status')?.getAttribute('aria-hidden')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Calling Ferni. Tap to cancel.');

    btn.click();
    expect(onCancelConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('connects when idle and clears the status afterwards', () => {
    const { btn, onConnect } = mount();
    btn.click();
    expect(onConnect).toHaveBeenCalledTimes(1);

    appState.set('connection', 'connecting');
    appState.set('connection', 'disconnected');
    expect(btn.getAttribute('aria-busy')).toBe('false');
    expect(btn.dataset.status).toBeUndefined();
    expect(btn.querySelector('.btn-status')).toBeNull();
    expect(btn.hasAttribute('aria-label')).toBe(false);
  });

  it('cannot be cancelled mid-reconnect of a live call', () => {
    const { btn } = mount();
    appState.set('connection', 'reconnecting');
    expect(btn.disabled).toBe(true);
    // One line, no cancel hint it can't honour, and not a new call.
    expect(btn.querySelector('.btn-status-main')?.textContent).toBe('Reconnecting…');
    expect(btn.querySelector('.btn-status-hint')).toBeNull();
  });

  it('re-entering connecting leaves one status, not two', () => {
    const { btn } = mount();
    appState.set('connection', 'reconnecting');
    appState.set('connection', 'connecting');
    expect(btn.querySelectorAll('.btn-status')).toHaveLength(1);
  });
});
