/**
 * After-call push ask: one optional "Want Ferni to check in about this?".
 *
 * Shown only with WEB_PUSH_DELIVERY on for this person (from the server), when
 * signed in, permission still "default", and never asked before on this
 * browser. iPhone/iPad outside the Home Screen get a short how-to instead.
 * Yes subscribes through the settings path (subscribePush); the ask never
 * blocks closing the card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockSubscribePush = vi.fn(async () => true);
const mockInitialize = vi.fn(async () => true);
const auth = { uid: 'uid-ana' as string | null };

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(async () => ({ ok: true, status: 200 })),
  getApiHeaders: vi.fn(() => ({})),
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getFirebaseUid: () => auth.uid,
}));
vi.mock('../../src/services/push-preference.js', () => ({ subscribePush: mockSubscribePush }));
vi.mock('../../src/services/push-notifications.service.js', () => ({
  getPushNotificationsService: () => ({ initialize: mockInitialize }),
}));

const { addPushAsk, decidePushAsk, isIosDevice } =
  await import('../../src/ui/after-call/push-ask.js');
const { hideAfterCallCard, showAfterCallCard, isAfterCallCardShowing } =
  await import('../../src/ui/after-call/after-call-card.ui.js');

const ASK = '.after-call-push-ask';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function flagFromServer(on: boolean): void {
  mockApiGet.mockImplementation(async (path: string) =>
    path === '/api/outreach/preferences'
      ? { ok: true, status: 200, data: { webPushDelivery: on } }
      : { ok: false, status: 404 }
  );
}

function setBrowser({
  permission = 'default' as NotificationPermission,
  ua = DESKTOP_UA,
  push = true,
} = {}): void {
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn() });
  vi.stubGlobal('PushManager', push ? function PushManager() {} : undefined);
  if (!push) delete (window as unknown as Record<string, unknown>).PushManager;
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

function card(): HTMLElement {
  return showAfterCallCard(
    { remembered: ['Interview on Thursday'], nextStep: null },
    { personaName: 'Ferni', onSupport: () => undefined }
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.uid = 'uid-ana';
  mockApiGet.mockReset();
  mockSubscribePush.mockReset().mockResolvedValue(true);
  flagFromServer(true);
  setBrowser();
});

afterEach(() => {
  hideAfterCallCard(true);
  vi.unstubAllGlobals();
});

describe('decidePushAsk', () => {
  const ok = {
    flagOn: true,
    uid: 'u',
    alreadyAsked: false,
    supported: true,
    permission: 'default' as const,
    needsHomeScreen: false,
  };

  it('asks only when every condition holds', () => {
    expect(decidePushAsk(ok)).toBe('ask');
    expect(decidePushAsk({ ...ok, flagOn: false })).toBe('none');
    expect(decidePushAsk({ ...ok, uid: null })).toBe('none');
    expect(decidePushAsk({ ...ok, alreadyAsked: true })).toBe('none');
    expect(decidePushAsk({ ...ok, alreadyAsked: null })).toBe('none'); // storage blocked
    expect(decidePushAsk({ ...ok, supported: false })).toBe('none');
    expect(decidePushAsk({ ...ok, permission: 'granted' })).toBe('none');
    expect(decidePushAsk({ ...ok, permission: 'denied' })).toBe('none');
  });

  it('iPhone outside the Home Screen gets the how-to, still only once and only with the flag', () => {
    const ios = {
      ...ok,
      supported: false,
      permission: 'unsupported' as const,
      needsHomeScreen: true,
    };
    expect(decidePushAsk(ios)).toBe('install-hint');
    expect(decidePushAsk({ ...ios, flagOn: false })).toBe('none');
    expect(decidePushAsk({ ...ios, alreadyAsked: true })).toBe('none');
  });

  it('detects iPhone and iPad (including iPadOS desktop mode), not a Mac', () => {
    expect(isIosDevice({ userAgent: IPHONE_UA, maxTouchPoints: 5 } as Navigator)).toBe(true);
    expect(isIosDevice({ userAgent: DESKTOP_UA, maxTouchPoints: 5 } as Navigator)).toBe(true);
    expect(isIosDevice({ userAgent: DESKTOP_UA, maxTouchPoints: 0 } as Navigator)).toBe(false);
  });
});

describe('the ask on the after-call card', () => {
  it('flag on: one warm question with Yes and Not now, above the support link', async () => {
    const c = card();
    expect(await addPushAsk(c)).toBe('ask');

    const ask = c.querySelector(ASK)!;
    expect(ask.textContent).toContain('Want Ferni to check in about this?');
    expect(ask.querySelector('.push-ask-yes')?.textContent).toBe('Yes, please');
    expect(ask.querySelector('.push-ask-later')?.textContent).toBe('Not now');
    expect(ask.nextElementSibling?.classList.contains('after-call-support')).toBe(true);
    expect(ask.textContent).not.toMatch(/\bAI\b/);
  });

  it('flag off: nothing shown, and they can still be asked once it turns on', async () => {
    flagFromServer(false);
    expect(await addPushAsk(card())).toBe('none');
    expect(document.querySelector(ASK)).toBeNull();

    hideAfterCallCard(true);
    flagFromServer(true);
    expect(await addPushAsk(card())).toBe('ask');
  });

  it('once per person: not shown after the first time', async () => {
    expect(await addPushAsk(card())).toBe('ask');
    hideAfterCallCard(true);
    expect(await addPushAsk(card())).toBe('none');
    // a different person on the same browser still gets their one ask
    hideAfterCallCard(true);
    auth.uid = 'uid-bo';
    expect(await addPushAsk(card())).toBe('ask');
  });

  it('permission already granted or denied: no ask and no server read', async () => {
    for (const permission of ['granted', 'denied'] as const) {
      setBrowser({ permission });
      expect(await addPushAsk(card())).toBe('none');
      hideAfterCallCard(true);
    }
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('signed out: no ask', async () => {
    auth.uid = null;
    expect(await addPushAsk(card())).toBe('none');
  });

  it('Yes subscribes through the settings path once and says so', async () => {
    const c = card();
    await addPushAsk(c);
    (c.querySelector('.push-ask-yes') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(c.querySelector(`${ASK} [role="status"]`)).not.toBeNull());

    expect(mockSubscribePush).toHaveBeenCalledTimes(1);
    expect(c.querySelector(ASK)!.textContent).toBe(
      'Done. Notes from Ferni will come to this device.'
    );
  });

  it('Yes that the browser refuses: a kind line, no error', async () => {
    mockSubscribePush.mockResolvedValueOnce(false);
    const c = card();
    await addPushAsk(c);
    (c.querySelector('.push-ask-yes') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(c.querySelector(`${ASK} [role="status"]`)).not.toBeNull());
    expect(c.querySelector(ASK)!.textContent).toBe(
      'No problem. You can change this in Settings later.'
    );
  });

  it('Not now removes the ask and leaves the card; the card still closes', async () => {
    const c = card();
    await addPushAsk(c);
    (c.querySelector('.push-ask-later') as HTMLButtonElement).click();
    expect(c.querySelector(ASK)).toBeNull();
    expect(isAfterCallCardShowing()).toBe(true);
    expect(mockSubscribePush).not.toHaveBeenCalled();

    (c.querySelector('.after-call-close') as HTMLButtonElement).click();
    expect(isAfterCallCardShowing()).toBe(false);
  });

  it('closing the card with the ask up works and never subscribes', async () => {
    const c = card();
    await addPushAsk(c);
    (c.querySelector('.after-call-close') as HTMLButtonElement).click();
    expect(isAfterCallCardShowing()).toBe(false);
    expect(mockSubscribePush).not.toHaveBeenCalled();
  });

  it('iPhone in Safari (not on the Home Screen): an honest how-to, no permission prompt', async () => {
    setBrowser({ ua: IPHONE_UA, push: false });
    const c = card();
    expect(await addPushAsk(c)).toBe('install-hint');
    const ask = c.querySelector(ASK)!;
    expect(ask.textContent).toContain('add Ferni to your Home Screen');
    expect(ask.querySelector('.push-ask-yes')).toBeNull();
    (ask.querySelector('.push-ask-later') as HTMLButtonElement).click();
    expect(c.querySelector(ASK)).toBeNull();
    expect(mockSubscribePush).not.toHaveBeenCalled();
  });

  it('card closed before the flag came back: nothing added, still unasked', async () => {
    let answer: (v: unknown) => void = () => undefined;
    mockApiGet.mockImplementation(async () => new Promise((r) => (answer = r)));
    const c = card();
    const pending = addPushAsk(c);
    hideAfterCallCard(true);
    answer({ ok: true, status: 200, data: { webPushDelivery: true } });
    expect(await pending).toBe('none');
    flagFromServer(true);
    expect(await addPushAsk(card())).toBe('ask');
  });
});

describe('wired into the post-call moment', () => {
  it('the real after-call card gets the ask when the flag is on, and not when off', async () => {
    const { conversationTracker } =
      await import('../../src/services/conversation-tracker.service.js');
    const { showPostCallCard } = await import('../../src/ui/after-call/post-call.js');
    const ask = async (): Promise<Element | null> => {
      conversationTracker.startSession('ferni', 'Ferni');
      await showPostCallCard();
      return vi.waitFor(() => {
        const node = document.querySelector('.ferni-after-call-card')?.querySelector(ASK) ?? null;
        if (mockApiGet.mock.calls.some(([p]) => p === '/api/outreach/preferences')) return node;
        throw new Error('flag not read yet');
      });
    };

    flagFromServer(false);
    expect(await ask()).toBeNull();
    hideAfterCallCard(true);
    mockApiGet.mockClear();

    flagFromServer(true);
    await ask();
    await vi.waitFor(() => expect(document.querySelector(ASK)).not.toBeNull());
  });
});
