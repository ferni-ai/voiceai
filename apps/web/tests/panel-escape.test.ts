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

const { closeOnEscape, asModalDialog, trackedEscapeDialogs } = await import('../src/utils/accessibility.js');

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
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
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

  it('does not pile up dialogs that were opened, closed and removed', () => {
    for (let i = 0; i < 50; i++) {
      const el = document.body.appendChild(document.createElement('div'));
      closeOnEscape(el, () => false, () => {});
      el.remove(); // closed and gone, the way rebuilt-per-open dialogs go
    }
    const kept = document.body.appendChild(document.createElement('div'));
    closeOnEscape(kept, () => false, () => {});
    expect(trackedEscapeDialogs()).toBeLessThanOrEqual(2);
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

describe('panels with their own open state close on Escape', () => {
  it('connected life', async () => {
    const { connectedLifeUI } = await import('../src/ui/connected-life.ui.js');
    await connectedLifeUI.show();
    vi.advanceTimersByTime(50); // animate in
    expect(document.querySelector('.connected-life-overlay')?.getAttribute('role')).toBe('dialog');

    escape();
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.connected-life-overlay')).toBeNull();
  });

  it('notifications', async () => {
    const { getNotificationSettingsUI } = await import('../src/ui/notification-settings.ui.js');
    const ui = getNotificationSettingsUI();
    const onClose = vi.fn();
    ui.setCallbacks({ onClose });
    ui.show();
    const panel = document.querySelector('.notif-settings');
    expect(panel?.classList.contains('notif-settings--visible')).toBe(true);

    escape();
    expect(panel?.classList.contains('notif-settings--visible')).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('music dashboard', async () => {
    const { musicDashboard } = await import('../src/ui/music-dashboard.ui.js');
    musicDashboard.showLoading();
    expect(musicDashboard.isOpen()).toBe(true);

    escape();
    expect(musicDashboard.isOpen()).toBe(false);
  });
});

describe('one Escape closes the dialog on top', () => {
  it('closes the dialog under the middle of the screen, not one opened earlier', () => {
    const under = document.body.appendChild(document.createElement('div'));
    const top = document.body.appendChild(document.createElement('div'));
    const inner = top.appendChild(document.createElement('button'));
    const closeUnder = vi.fn();
    const closeTop = vi.fn();
    closeOnEscape(top, () => true, closeTop);
    closeOnEscape(under, () => true, closeUnder); // registered later, but underneath
    document.elementFromPoint = () => inner;

    escape();
    expect(closeTop).toHaveBeenCalledOnce();
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it('leaves the tour alone when a panel is open over it', async () => {
    // Fresh instances: the shared ones lost their elements when earlier tests cleared the page
    const { default: OnboardingUI } = await import('../src/ui/onboarding.ui.js');
    const { default: DataExportUI } = await import('../src/ui/data-export.ui.js');
    const tour = new OnboardingUI();
    localStorage.removeItem('ferni:onboarding:complete');
    tour.start();
    const exportUI = new DataExportUI();
    exportUI.show([]);
    const panel = document.querySelector('.data-export') as HTMLElement;
    document.elementFromPoint = () => panel;

    escape();
    expect(exportUI.getIsVisible()).toBe(false);
    expect(tour.getIsVisible()).toBe(true);
    expect(tour.hasCompleted()).toBe(false);
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

  it('manage subscription opened twice at once leaves one modal', async () => {
    const { manageSubscriptionUI } = await import('../src/ui/manage-subscription.ui.js');
    await Promise.all([manageSubscriptionUI.open('user-1'), manageSubscriptionUI.open('user-1')]);
    vi.advanceTimersByTime(1_000);
    expect(document.querySelectorAll('.manage-sub')).toHaveLength(1);
    manageSubscriptionUI.close();
    vi.advanceTimersByTime(1_000);
  });

  it("manage subscription: a slow first open never shows its status under a later person's", async () => {
    const { manageSubscriptionUI } = await import('../src/ui/manage-subscription.ui.js');
    let finishAnn!: (s: unknown) => void;
    getSubscriptionStatus.mockImplementation((id: string) =>
      id === 'ann'
        ? new Promise((resolve) => (finishAnn = resolve)) // Ann's answer is slow
        : Promise.resolve({ tier: 'free', status: 'expired', provider: 'none' })
    );
    const annOpen = manageSubscriptionUI.open('ann');
    await manageSubscriptionUI.open('bob'); // Bob opens while Ann's status loads
    finishAnn({ tier: 'premium', status: 'active', provider: 'stripe' });
    await annOpen;
    vi.advanceTimersByTime(1_000);

    const modals = document.querySelectorAll('.manage-sub');
    expect(modals).toHaveLength(1);
    expect(modals[0].querySelector('.manage-sub__plan-badge--premium')).toBeNull(); // Bob's free plan
    manageSubscriptionUI.close();
    vi.advanceTimersByTime(1_000);
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
