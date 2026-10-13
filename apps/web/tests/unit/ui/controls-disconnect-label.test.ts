/**
 * The Disconnect button's label follows the goodbye.
 * Before: controls.ui.ts looked for a `.btn-text` span, but the button in
 * index.html wraps its label in `.btn-content`, so wrap-up, closing and
 * hang-up never changed what the button said.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appState } = await import('../../../src/state/app.state.js');
const { initControlsUI, showClosingState, showAgentHangupState } =
  await import('../../../src/ui/controls.ui.js');
const { t } = await import('../../../src/i18n/index.js');

/** The same markup as index.html's control row */
function mount(): HTMLElement {
  document.body.innerHTML = `
    <div class="controls">
      <button id="connectBtn"><span class="btn-content">Connect</span></button>
      <button id="disconnectBtn"><span class="btn-content" data-i18n="entrance.endTalk">Disconnect</span></button>
    </div>`;
  initControlsUI({
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onMuteToggle: vi.fn(),
  });
  return document.querySelector('#disconnectBtn .btn-content') as HTMLElement;
}

describe('disconnect button label', () => {
  beforeEach(() => {
    appState.set('isWrappingUp', false);
    appState.set('connection', 'connected');
  });

  it('says goodbye while Ferni wraps up', () => {
    const label = mount();
    appState.set('isWrappingUp', true);
    expect(label.textContent).toBe(t('session.goodbye'));
  });

  it('shows the closing ceremony', () => {
    const label = mount();
    appState.set('isWrappingUp', true);
    showClosingState();
    expect(label.textContent).toBe(t('session.untilNextTime'));
  });

  it('shows that Ferni is hanging up', () => {
    const label = mount();
    showAgentHangupState();
    expect(label.textContent).toBe(t('session.ending'));
  });

  it('goes back to its own label after the call', () => {
    const label = mount();
    appState.set('isWrappingUp', true);
    showClosingState();
    appState.set('connection', 'disconnected');
    expect(label.textContent).toBe(t('entrance.endTalk'));
  });
});
