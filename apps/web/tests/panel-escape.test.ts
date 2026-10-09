/**
 * Settings-menu panels close on Escape and announce themselves as modal dialogs.
 *
 * The signed-in e2e walk found six panels Escape did nothing on and three
 * overlays with no dialog role. Two of them (manage subscription, family) also
 * deleted a freshly reopened modal: their close timer removed whatever modal
 * was current when it fired, not the one it was closing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../src/ui/whisper.ui.js', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const getSubscriptionStatus = vi.fn();
vi.mock('../src/services/apple-iap.service.js', () => ({ appleIAPService: { getSubscriptionStatus } }));
vi.mock('../src/utils/billing.js', () => ({ openBillingPortal: vi.fn() }));

const { closeOnEscape, asModalDialog } = await import('../src/utils/accessibility.js');

const escape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { identities: [] } });
  getSubscriptionStatus.mockResolvedValue({ tier: 'free', status: 'expired', provider: 'none' });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('closeOnEscape', () => {
  it('closes an open dialog, and leaves a closed one alone', () => {
    const el = document.body.appendChild(document.createElement('div'));
    let open = true;
    const close = vi.fn(() => (open = false));
    closeOnEscape(el, () => open, close);

    escape();
    escape();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const el = document.body.appendChild(document.createElement('div'));
    const close = vi.fn();
    closeOnEscape(el, () => true, close);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('closes one dialog per press when two are open', () => {
    const a = document.body.appendChild(document.createElement('div'));
    const b = document.body.appendChild(document.createElement('div'));
    const closeA = vi.fn();
    const closeB = vi.fn();
    closeOnEscape(a, () => true, closeA);
    closeOnEscape(b, () => true, closeB);

    escape();
    expect(closeA.mock.calls.length + closeB.mock.calls.length).toBe(1);
  });

  it('stops listening once the dialog leaves the page, or when told to', () => {
    const gone = document.body.appendChild(document.createElement('div'));
    const kept = document.body.appendChild(document.createElement('div'));
    const closeGone = vi.fn();
    const closeKept = vi.fn();
    closeOnEscape(gone, () => true, closeGone);
    const stop = closeOnEscape(kept, () => true, closeKept);
    gone.remove();
    stop();

    escape();
    escape();
    expect(closeGone).not.toHaveBeenCalled();
    expect(closeKept).not.toHaveBeenCalled();
  });

  it('asModalDialog sets role, aria-modal and the accessible name', () => {
    const el = document.createElement('div');
    asModalDialog(el, { label: 'Games' }, () => false, () => {});
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Games');
  });
});

describe('panels close on Escape', () => {
  it('data export', async () => {
    const { getDataExportUI } = await import('../src/ui/data-export.ui.js');
    const ui = getDataExportUI();
    const onClose = vi.fn();
    ui.setCallbacks({ onClose });
    ui.show([]);
    expect(ui.getIsVisible()).toBe(true);
    expect(document.querySelector('.data-export')?.getAttribute('aria-modal')).toBe('true');

    escape();
    expect(ui.getIsVisible()).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the tour: Escape dismisses it the way Skip does', async () => {
    const { getOnboardingUI } = await import('../src/ui/onboarding.ui.js');
    const ui = getOnboardingUI();
    const onSkip = vi.fn();
    ui.setCallbacks({ onSkip });
    ui.start();
    expect(ui.getIsVisible()).toBe(true);

    escape();
    expect(ui.getIsVisible()).toBe(false);
    expect(onSkip).toHaveBeenCalledOnce();
    expect(ui.hasCompleted()).toBe(true);
  });

  it('game picker is a labelled modal dialog and closes on Escape', async () => {
    const { gamePicker: ui } = await import('../src/ui/game-picker.ui.js');
    ui.show();
    vi.advanceTimersByTime(50); // animate in
    const dialog = document.querySelector('.game-picker');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-label')).toBeTruthy();

    escape();
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.game-picker')).toBeNull();
  });
});

describe('reopening during the close animation keeps the new modal', () => {
  it('manage subscription', async () => {
    const { manageSubscriptionUI } = await import('../src/ui/manage-subscription.ui.js');
    const firstClosed = vi.fn();
    await manageSubscriptionUI.open('user-1', { onClose: firstClosed });
    await manageSubscriptionUI.open('user-1'); // closes the first, builds a second
    vi.advanceTimersByTime(1_000);

    const modals = document.querySelectorAll('.manage-sub');
    expect(modals).toHaveLength(1);
    expect(modals[0].classList.contains('manage-sub--closing')).toBe(false);
    expect(firstClosed).toHaveBeenCalledOnce();

    escape();
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.manage-sub')).toBeNull();
  });

  it('family', async () => {
    const family = await import('../src/ui/family-identities.ui.js');
    await family.show();
    await family.show(); // hides the first, builds a second
    vi.advanceTimersByTime(1_000);

    expect(document.querySelectorAll('.family-modal-overlay')).toHaveLength(1);
    expect(family.isVisible()).toBe(true);

    escape();
    expect(family.isVisible()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.family-modal-overlay')).toBeNull();
  });
});
