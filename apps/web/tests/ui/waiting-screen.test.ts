/**
 * The waiting screen: someone on the waitlist sees their place in line, not an
 * error. Covers both ways the app learns it (a 403 WAITLISTED from /token, and
 * the sign-in gate's waitlisted answer, which a remembered sign-in also gets),
 * the You're-in state, tokens-only colors and reduced motion.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  // A remembered sign-in: the gate's subscription fires at once, already signed in
  onAuthStateChange: vi.fn((cb: (s: { isAuthenticated: boolean }) => void) => {
    cb({ isAuthenticated: true });
    return () => undefined;
  }),
  getAuthToken: vi.fn(async () => 'id-token'),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));
vi.mock('../../src/services/access-check.js', () => ({
  checkAccess: vi.fn(async () => ({ kind: 'waitlisted', email: 'pat@example.test' })),
}));
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({ apiGet }));

const { fetchConnectionToken } = await import('../../src/services/token-fetch.service.js');
const { classifyConnectError, TokenRequestError } =
  await import('../../src/services/connect-failure.js');
const { showCallNotice } = await import('../../src/ui/call-status.ui.js');
const { showSignInGate, hideSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
const {
  buildWaitingScreen,
  celebrateAdmissionOnce,
  hideWaitingOverlay,
  isWaitlistScreenEnabled,
  WAITLIST_SCREEN_STORAGE_KEY,
} = await import('../../src/ui/waiting-screen.ui.js');
const { setLocale } = await import('../../src/i18n/index.js');
const { parseWaitlistStatus, waitlistFromRefusal } =
  await import('../../src/services/waitlist-status.js');

/** A contract body (API-CONTRACT.md, GET /api/waitlist/me) */
const waiting = {
  status: 'waiting',
  position: 432,
  wavesAway: 4,
  nextWaveAt: '2026-10-22T17:00:00.000Z',
  referralUrl: 'https://ferni.ai/?ref=abc123',
  referrals: { verified: 1, creditedDays: 3, max: 5 },
  admittedAt: null,
  seatExpiresAt: null,
  foundingMember: false,
  foundingWave: null,
};
const admitted = {
  ...waiting,
  status: 'admitted',
  position: null,
  wavesAway: null,
  foundingMember: true,
  foundingWave: 7,
};

const text = () => document.body.textContent ?? '';
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  apiGet.mockReset();
  vi.unstubAllGlobals();
  // The screen is off by default; these tests are of it turned on (the default is tested below)
  localStorage.setItem(WAITLIST_SCREEN_STORAGE_KEY, 'true');
});

afterEach(() => {
  vi.useFakeTimers(); // the gate finishes hiding after its fade
  hideSignInGate();
  vi.runAllTimers();
  vi.useRealTimers();
  hideWaitingOverlay();
  document.body.innerHTML = '';
});

describe('a 403 WAITLISTED from /token', () => {
  const tryCall = async (status: number, body: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status }))
    );
    const request = { room: 'r', username: 'u', deviceId: 'd', personaId: 'ferni' };
    const error = await fetchConnectionToken(request).catch((e: unknown) => e);
    const failure = classifyConnectError(error);
    showCallNotice(failure, { onRetry: vi.fn() });
    return failure;
  };

  it('shows the waiting screen with position, waves away, next wave and invite link', async () => {
    const failure = await tryCall(403, { code: 'WAITLISTED', ...waiting });
    expect(failure.kind).toBe('waitlisted');
    const dialog = document.querySelector('#waiting-screen-overlay[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(text()).toContain('You’re #432, about 4 waves away');
    expect(text()).toMatch(/The next wave opens Thursday, October 22\./);
    expect(document.querySelector('.waiting-screen__link')?.textContent).toBe(
      'https://ferni.ai/?ref=abc123'
    );
    expect(text()).toContain('Each friend who joins moves you up a few days.');
    expect(text()).toContain('Your friends have already moved you up 3 days.');
    expect(text()).toContain('I’ll email you the moment your spot opens.');
    expect(document.getElementById('callStatusNotice')).toBeNull(); // no error notice alongside
  });

  it('copy puts the invite link on the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await tryCall(403, { code: 'WAITLISTED', ...waiting });
    document.querySelector<HTMLButtonElement>('.waiting-screen__btn--primary')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('https://ferni.ai/?ref=abc123');
    expect(document.querySelector('.waiting-screen__btn--primary')?.textContent).toBe('Copied');
  });

  it('any other 403 is still the plain sign-in notice', async () => {
    const failure = await tryCall(403, { error: 'identity mismatch' });
    expect(failure.kind).toBe('forbidden');
    expect(document.querySelector('.waiting-screen')).toBeNull();
    expect(document.getElementById('callStatusNotice')).not.toBeNull();
  });

  it('flag off: a one-line notice instead of the screen', async () => {
    localStorage.setItem(WAITLIST_SCREEN_STORAGE_KEY, 'false');
    await tryCall(403, { code: 'WAITLISTED', ...waiting });
    expect(document.querySelector('.waiting-screen')).toBeNull();
    expect(document.getElementById('callStatusNotice')?.textContent).toContain(
      'You’re on the list'
    );
  });
});

describe('flag unset (the default): off, and /api/waitlist/me is never asked', () => {
  beforeEach(() => localStorage.removeItem(WAITLIST_SCREEN_STORAGE_KEY));

  it('is off unless turned on', () => {
    expect(isWaitlistScreenEnabled()).toBe(false);
  });

  it('a 403 WAITLISTED from /token is the one-line notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'WAITLISTED', ...waiting }), { status: 403 })
      )
    );
    const request = { room: 'r', username: 'u', deviceId: 'd', personaId: 'ferni' };
    const failure = classifyConnectError(
      await fetchConnectionToken(request).catch((e: unknown) => e)
    );
    showCallNotice(failure, { onRetry: vi.fn() });
    expect(document.querySelector('.waiting-screen')).toBeNull();
    expect(document.getElementById('callStatusNotice')?.textContent).toContain(
      'You’re on the list'
    );
  });

  it('the sign-in gate keeps its plain waitlist notice', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: waiting });
    void showSignInGate();
    await flush();
    await flush();
    expect(document.querySelector('.waiting-screen')).toBeNull();
    expect(document.querySelector('.sign-in-gate-waitlist')).not.toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('an approved sign-in gets no celebration and no status read', async () => {
    const read = vi.fn(async () => parseWaitlistStatus(admitted));
    expect(await celebrateAdmissionOnce(read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('the sign-in gate (a remembered sign-in comes through here too)', () => {
  it('waitlisted: the waiting screen replaces the gate, with a way to switch accounts', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: waiting });
    void showSignInGate();
    await flush();
    await flush();
    expect(apiGet).toHaveBeenCalledWith('/api/waitlist/me', undefined, { maxRetries: 1 });
    const gate = document.querySelector('.sign-in-gate-content');
    expect(gate?.querySelector('.waiting-screen')).not.toBeNull();
    expect(gate?.querySelector('#sign-in-gate-title')?.textContent).toBe('You’re on the list');
    expect(gate?.textContent).toContain('You’re #432');
    expect(gate?.querySelector('.sign-in-gate-btn--google')).toBeNull(); // no call UI or sign-in buttons
    expect([...gate!.querySelectorAll('button')].map((b) => b.textContent)).toContain(
      'Try a different account'
    );
  });

  it('status unreadable: the plain waitlist notice, as before', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 404 });
    void showSignInGate();
    await flush();
    await flush();
    expect(document.querySelector('.waiting-screen')).toBeNull();
    expect(document.querySelector('.sign-in-gate-waitlist')).not.toBeNull();
  });
});

describe("you're in", () => {
  it('shows the founding-member badge with the wave number, once', async () => {
    const read = vi.fn(async () => parseWaitlistStatus(admitted));
    expect(await celebrateAdmissionOnce(read)).toBe(true);
    expect(text()).toContain('You’re in');
    expect(document.querySelector('.waiting-screen__badge')?.textContent).toBe(
      'Founding member · Wave 7'
    );
    expect(document.querySelector('.waiting-screen__position')).toBeNull();
    // A lapsed seat goes to the back of the line: never promise to hold it
    expect(text()).toContain('Come in within a week to keep it.');
    expect(text()).not.toMatch(/saved it|hold your|save your/i);
    hideWaitingOverlay();
    expect(await celebrateAdmissionOnce(read)).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('still waiting or never joined: no celebration', async () => {
    expect(await celebrateAdmissionOnce(async () => parseWaitlistStatus(waiting))).toBe(false);
    expect(await celebrateAdmissionOnce(async () => null)).toBe(false);
    expect(document.querySelector('.waiting-screen')).toBeNull();
  });

  it('"Come in" runs the caller’s handler', () => {
    const onEnter = vi.fn();
    const screen = buildWaitingScreen(parseWaitlistStatus(admitted)!, { onEnter })!;
    screen.querySelector<HTMLButtonElement>('.waiting-screen__btn--primary')!.click();
    expect(onEnter).toHaveBeenCalledOnce();
  });
});

describe("#1953's refusal shape (no details yet)", () => {
  const legacy = {
    error: 'not_admitted',
    status: 'pending',
    waitlisted: true,
    message: "You're on the list.",
  };

  it('opens the soft waiting screen at once, then fills in from /api/waitlist/me', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: waiting });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(legacy), { status: 403 }))
    );
    const error = await fetchConnectionToken({
      room: 'r',
      username: 'u',
      deviceId: 'd',
      personaId: 'ferni',
    }).catch((e: unknown) => e);
    const failure = classifyConnectError(error);
    expect(failure.kind).toBe('waitlisted');
    showCallNotice(failure, { onRetry: vi.fn() });
    expect(text()).toContain('You’re on the list');
    expect(document.querySelector('.waiting-screen__position')).toBeNull();
    expect(text()).toContain('I’ll email you the moment your spot opens.');
    await flush();
    expect(apiGet).toHaveBeenCalledWith('/api/waitlist/me', undefined, { maxRetries: 1 });
    expect(text()).toContain('You’re #432, about 4 waves away');
    expect(document.querySelectorAll('#waiting-screen-overlay')).toHaveLength(1);
  });

  it('keeps the soft screen when /api/waitlist/me fails', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 401 });
    showCallNotice(classifyConnectError(new TokenRequestError(403, 'x', waitlistFromRefusal(403, JSON.stringify(legacy))!)), { onRetry: vi.fn() }); // prettier-ignore
    await flush();
    expect(text()).toContain('You’re on the list');
    expect(document.querySelector('.waiting-screen__position')).toBeNull();
  });
});

describe('copy', () => {
  it('has no em dashes or ellipses in the waiting-screen strings', () => {
    for (const loc of ['en-US', 'en-GB']) {
      const j = JSON.parse(
        readFileSync(resolve(__dirname, `../../src/i18n/locales/${loc}.json`), 'utf8')
      );
      const strings = JSON.stringify([j.waitlistScreen, j.connectFailure.waitlisted]);
      expect(strings).not.toMatch(/[\u2014\u2026]|\.\.\./);
    }
  });
});

describe('other locales', () => {
  const en = JSON.parse(
    readFileSync(resolve(__dirname, '../../src/i18n/locales/en-US.json'), 'utf8')
  );
  const gb = JSON.parse(
    readFileSync(resolve(__dirname, '../../src/i18n/locales/en-GB.json'), 'utf8')
  );

  afterEach(async () => setLocale('en-US', { reload: false }));

  it('en-GB carries every waiting-screen string', () => {
    expect(gb.waitlistScreen).toEqual(en.waitlistScreen);
    expect(gb.connectFailure.waitlisted).toBe(en.connectFailure.waitlisted);
  });

  it.each(['de', 'ja', 'ar'])('%s falls back to English copy, never raw keys', async (locale) => {
    await setLocale(locale as Parameters<typeof setLocale>[0], { reload: false });
    const screen = buildWaitingScreen(parseWaitlistStatus(waiting)!)!;
    expect(screen.textContent).not.toMatch(/waitlistScreen\./);
    expect(screen.textContent).toContain('Each friend who joins moves you up a few days.');
    expect(screen.textContent).toContain('Your friends have already moved you up 3 days.');
  });

  it('one day reads as one day', () => {
    const screen = buildWaitingScreen(
      parseWaitlistStatus({ ...waiting, referrals: { verified: 1, creditedDays: 1, max: 5 } })!
    )!;
    expect(screen.textContent).toContain('moved you up 1 day.');
  });
});

describe('reading the contract', () => {
  it('needs the WAITLISTED code on a 403, and keeps only https invite links', () => {
    expect(waitlistFromRefusal(403, JSON.stringify(waiting))).toBeNull();
    expect(waitlistFromRefusal(401, JSON.stringify({ code: 'WAITLISTED', ...waiting }))).toBeNull();
    expect(waitlistFromRefusal(403, 'not json')).toBeNull();
    expect(
      parseWaitlistStatus({ ...waiting, referralUrl: 'javascript:alert(1)' })?.referralUrl
    ).toBeNull();
    expect(buildWaitingScreen(parseWaitlistStatus({ ...waiting, status: 'expired' })!)).toBeNull();
  });
});

describe('style', () => {
  const source = readFileSync(resolve(__dirname, '../../src/ui/waiting-screen.ui.ts'), 'utf8');

  it('uses design tokens only: no hardcoded colors', () => {
    expect(source).toContain('var(--color-'); // scanner sanity: it is reading the styles
    expect(source.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/gi)).toBeNull();
  });

  it('turns the avatar animation off for reduced motion', () => {
    buildWaitingScreen(parseWaitlistStatus(waiting)!);
    const css = document.getElementById('waiting-screen-styles')?.textContent ?? '';
    expect(css).toMatch(/animation: waiting-screen-breathe/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.waiting-screen__avatar \{ animation: none !important; \} \}/
    );
  });
});
