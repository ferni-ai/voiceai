/**
 * Ending a call must not look like starting one.
 *
 * Design audit 2026-10-18: in a call, Disconnect took the same filled persona
 * pill as Connect (btn-primary + btn-magnetic). It now gets btn-end-call, a
 * calm outlined style with a soft warm tint (inline-styles.css), and loses it
 * again when the call ends.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appState } = await import('../../../src/state/app.state.js');
const { initControlsUI } = await import('../../../src/ui/controls.ui.js');

function mount(): HTMLButtonElement {
  document.body.innerHTML = `
    <div class="controls">
      <button id="connectBtn" class="btn btn-primary btn-magnetic"><span class="btn-content">Connect</span></button>
      <button id="disconnectBtn" class="btn btn-secondary" style="display: none">Disconnect</button>
    </div>`;
  initControlsUI({
    onConnect: vi.fn(),
    onCancelConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onMuteToggle: vi.fn(),
  });
  return document.getElementById('disconnectBtn') as HTMLButtonElement;
}

describe('end call button', () => {
  beforeEach(() => {
    appState.set('connection', 'disconnected');
  });

  it('in a call, is styled as end-call, not as the Connect pill', () => {
    const btn = mount();
    appState.set('connection', 'connected');

    expect(btn.classList.contains('btn-end-call')).toBe(true);
    expect(btn.classList.contains('btn-primary')).toBe(false);
    expect(btn.classList.contains('btn-magnetic')).toBe(false);
    expect(btn.classList.contains('btn-secondary')).toBe(true);
  });

  it('drops the end-call style when the call ends', () => {
    const btn = mount();
    appState.set('connection', 'connected');
    appState.set('connection', 'disconnected');

    expect(btn.classList.contains('btn-end-call')).toBe(false);
    expect(btn.classList.contains('btn-primary')).toBe(false);
  });
});
