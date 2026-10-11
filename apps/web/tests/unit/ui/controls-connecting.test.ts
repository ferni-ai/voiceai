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
    expect(btn.dataset.status).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe(btn.dataset.status);

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
    expect(btn.hasAttribute('aria-label')).toBe(false);
  });

  it('cannot be cancelled mid-reconnect of a live call', () => {
    const { btn } = mount();
    appState.set('connection', 'reconnecting');
    expect(btn.disabled).toBe(true);
  });
});
