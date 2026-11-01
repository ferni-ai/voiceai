/**
 * The /connect#i=<invite> page: opened from the link a connect moment texts.
 * It takes over only for a well-formed invite, clears it from the address bar,
 * signs the person in, says which account connects and plainly what connecting
 * shares, and its one button spends the invite and goes to the provider, or
 * says why it can't.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiPost = vi.fn();
const mockAuth = vi.fn(async () => ({ isAuthenticated: false }));
const mockRefuseFraming = vi.fn(() => false);
const mockSignIn = vi.fn(async () => {});
const defaultAuthState = () => ({
  email: 'sam@example.com' as string | null,
  displayName: 'Sam Rivera' as string | null,
});
const mockAuthState = vi.fn(defaultAuthState);

vi.mock('../../src/utils/api.js', () => ({
  apiPost: mockApiPost,
  apiGet: vi.fn(),
  getApiHeaders: vi.fn(() => ({})),
}));
// auth-init starts Firebase on import; the page only needs it to have run.
vi.mock('../../src/services/auth-init.service.js', () => ({ initializeAuth: mockAuth }));
vi.mock('../../src/utils/frame-guard.js', () => ({ refuseFraming: mockRefuseFraming }));
vi.mock('../../src/ui/sign-in-gate.ui.js', () => ({ showSignInGate: mockSignIn }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({ getAuthState: mockAuthState }));
const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../src/utils/logger.js', () => {
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args: unknown[]) => logged.push([level, ...args]),
    ])
  );
  return { createLogger: () => logger, log: logger };
});

const { connectInviteFromLocation, maskEmail, showConnectInvite, CONNECT_INVITE_START_PATH } =
  await import('../../src/ui/connect-invite-page.ui');
const { openStandalonePage } = await import('../../src/app/standalone-pages');

const INVITE = 'Ab3_-'.repeat(8) + 'xyz'; // 43 characters
const GARBAGE = 'Zz9-_'.repeat(8) + 'qqq'; // well formed, but no such invite
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockReset();
  logged.length = 0;
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

/** Click Connect with a stand-in location, and report where the page went. */
async function tapConnect(...responses: unknown[]): Promise<{ card: HTMLElement; went: string[] }> {
  const went: string[] = [];
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return 'https://app.example.com/connect';
      },
      set href(url: string) {
        went.push(url);
      },
    },
  });
  for (const response of responses) mockApiPost.mockResolvedValueOnce(response);
  const card = document.createElement('main');
  document.body.append(card);
  showConnectInvite(card, INVITE);
  card.querySelector('button')?.click();
  await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { card, went };
}

describe('connectInviteFromLocation', () => {
  it('takes only a 43-character invite in the fragment of /connect', () => {
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}`)).toBe(INVITE);
    expect(connectInviteFromLocation('/connect/', `#i=${INVITE}`)).toBeNull();
    expect(connectInviteFromLocation('/connect', '')).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}x`)).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}&next=/x`)).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE.slice(1)}/`)).toBeNull();
    expect(connectInviteFromLocation('/connections', `#i=${INVITE}`)).toBeNull();
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('sam@example.com')).toBe('s•••@example.com');
    expect(maskEmail('a.b@c@example.com')).toBe('a•••@example.com');
    expect(maskEmail('nodomain')).toBe('•••');
    expect(maskEmail('@example.com')).toBe('•••');
  });
});

describe('openStandalonePage(/connect)', () => {
  it('signs in first when nobody is', async () => {
    window.history.replaceState(null, '', `/connect#i=${INVITE}`);
    await openStandalonePage('/connect');
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('main.connect-invite-page button')).not.toBeNull();
  });

  it('a signed-out browser gets the same sign-in and page for any well-formed token', async () => {
    const pages: string[] = [];
    for (const token of [INVITE, GARBAGE]) {
      vi.clearAllMocks();
      window.history.replaceState(null, '', `/connect#i=${token}`);
      await openStandalonePage('/connect');
      expect(mockSignIn, token).toHaveBeenCalledTimes(1);
      expect(mockApiPost, token).not.toHaveBeenCalled(); // nothing asks about the invite first
      pages.push(document.body.innerHTML);
    }
    expect(pages[1]).toBe(pages[0]);
  });

  it('goes straight to the card when already signed in', async () => {
    mockAuth.mockResolvedValueOnce({ isAuthenticated: true });
    window.history.replaceState(null, '', `/connect#i=${INVITE}`);
    await openStandalonePage('/connect');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(document.querySelector('main.connect-invite-page button')).not.toBeNull();
  });

  it('opens the consent card for an invite, and clears it from the address bar', async () => {
    window.history.replaceState(null, '', `/connect#i=${INVITE}`);
    expect(await openStandalonePage('/connect')).toBe(true);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/connect');
    const root = document.querySelector('main.connect-invite-page');
    expect(root?.querySelector('h1')?.textContent).toBe('Let Alex keep an eye on your calendar');
    expect(root?.querySelector('.connect-invite-page__account')?.textContent).toBe(
      'Connecting to Alex for s•••@example.com'
    );
    expect([...(root?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Sees event times, titles and places',
      'Adds or changes events only when you ask',
      'Never sees your emails or attachments',
      'Undo any time in Settings > Calendar, or just tell Alex',
    ]);
    expect(root?.querySelector('button')?.textContent).toBe('Connect Google Calendar');
    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockApiPost).not.toHaveBeenCalled(); // opening the link spends nothing
  });

  it.each(['/connect', '/connect/', '/connect//'])(
    'clears the invite from %s before anything awaits, even when the page will not open',
    async (path) => {
      window.history.replaceState(null, '', `${path}?from=text#i=${INVITE}`);
      const entries = window.history.length;
      const opening = openStandalonePage(path);
      // Replaced, not pushed: no entry with the invite stays one Back press away.
      expect(window.history.length).toBe(entries);
      expect(window.location.hash).toBe('');
      expect(window.location.href).not.toContain(INVITE);
      expect(window.location.search).toBe('?from=text');
      expect(await opening).toBe(path === '/connect');
    }
  );

  it.each(['/connections', '/connectx', '/connect/x'])(
    'leaves %s and its fragment alone: not the connect page',
    async (path) => {
      window.history.replaceState(null, '', `${path}#i=${INVITE}`);
      expect(await openStandalonePage(path)).toBe(false);
      expect(window.location.hash).toBe(`#i=${INVITE}`);
    }
  );

  it('leaves the app alone without a well-formed invite', async () => {
    const app = document.createElement('div');
    app.id = 'app';
    app.textContent = 'the app';
    document.body.replaceChildren(app);
    for (const [path, hash] of [
      ['/connect', ''],
      ['/connect', '#i=short'],
      ['/connections', `#i=${INVITE}`],
    ] as const) {
      expect(await openStandalonePage(path, hash)).toBe(false);
    }
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(app);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('shows nothing inside a frame', async () => {
    mockRefuseFraming.mockReturnValueOnce(true);
    window.history.replaceState(null, '', `/connect#i=${INVITE}`);
    await openStandalonePage('/connect');
    expect(document.querySelector('main.connect-invite-page')).toBeNull();
  });
});

describe('the signed-in account line', () => {
  it.each([
    [{ email: null, displayName: 'Sam Rivera' }, 'Connecting to Alex for Sam Rivera'],
    [{ email: null, displayName: null }, undefined],
  ])('names the account it can, and nothing it cannot: %o', (state, line) => {
    mockAuthState.mockReturnValueOnce(state);
    const root = document.createElement('main');
    showConnectInvite(root, INVITE);
    expect(root.querySelector('.connect-invite-page__account')?.textContent).toBe(line);
  });
});

describe("someone else's link", () => {
  // Signed in as Blake, holding a link Avery was sent. The server refuses it.
  const OWNER = ['avery.owner@example.com', 'a•••@example.com', 'Avery Owner'];
  // A server that wrongly echoed the owner must still not reach the page, whatever it answers.
  const echo = { email: OWNER[0], displayName: OWNER[2], account: OWNER[1] };
  const asBlake = () =>
    mockAuthState.mockReturnValue({ email: 'blake@example.com', displayName: 'Blake Doe' });
  afterEach(() => {
    mockAuthState.mockImplementation(defaultAuthState);
  });

  it.each([404, 410, 403, 503, 0])(
    'a %i names only the signed-in account, never anything about the owner',
    async (status) => {
      asBlake();
      const { card } = await tapConnect({ ok: false, status, data: echo });
      const text = card.textContent ?? '';
      for (const leak of OWNER) expect(text).not.toContain(leak);
      expect(card.querySelector('[role="status"]')).not.toBeNull();
    }
  );

  it('after a 401 and sign-in, the card again names only the signed-in account', async () => {
    asBlake();
    const { card } = await tapConnect({ ok: false, status: 401, data: echo });
    await vi.waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const text = card.textContent ?? '';
    for (const leak of OWNER) expect(text).not.toContain(leak);
    expect(card.querySelector('.connect-invite-page__account')?.textContent).toBe(
      'Connecting to Alex for b•••@example.com'
    );
  });
});

describe('Connect', () => {
  it('never logs the invite, whatever the server answers', async () => {
    for (const response of [
      { ok: false, status: 401, data: null },
      { ok: false, status: 404, data: null },
      { ok: false, status: 503, data: null },
      { ok: true, status: 200, data: { url: 'https://evil.example.com' } },
    ]) {
      await tapConnect(response);
      mockApiPost.mockReset();
    }
    expect(logged.length).toBeGreaterThan(0); // the capture sees the page's log lines
    expect(JSON.stringify(logged)).not.toContain(INVITE);
  });

  it('spends the invite once and goes to the login URL the server returns', async () => {
    const { went } = await tapConnect({
      ok: true,
      status: 200,
      data: { url: '/auth/google/login?state=s1' },
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      CONNECT_INVITE_START_PATH,
      { invite: INVITE },
      { maxRetries: 0 }
    );
    expect(went).toEqual(['/auth/google/login?state=s1']);
  });

  it.each([
    '//evil.example.com/steal',
    'https://evil.example.com/steal',
    'javascript:steal()',
    '/\\evil.example.com/steal',
    '/\\/evil.example.com/steal',
    '/\t/evil.example.com/steal',
    '/\n/evil.example.com/steal',
  ])('never follows a URL off this site: %s', async (url) => {
    const { card, went } = await tapConnect({ ok: true, status: 200, data: { url } });
    expect(went).toEqual([]);
    expect(card.querySelector('[role="status"]')?.textContent).toMatch(/Couldn't open Google/);
  });
  it('never follows an answer with no URL', async () => {
    const { card, went } = await tapConnect({ ok: true, status: 200, data: {} });
    expect(went).toEqual([]);
    expect(card.querySelector('[role="status"]')?.textContent).toMatch(/Couldn't open Google/);
  });

  it.each([INVITE, GARBAGE])(
    'treats a 401 the same for any token: sign in, card again (%s)',
    async (token) => {
      mockApiPost.mockResolvedValueOnce({ ok: false, status: 401, data: null });
      const root = document.createElement('main');
      showConnectInvite(root, token);
      root.querySelector('button')?.click();
      await vi.waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(root.querySelector('[role="status"]')).toBeNull();
      expect(root.querySelector('button')?.textContent).toBe('Connect Google Calendar');
    }
  );

  it('signs in when signed out, then shows the card again for a fresh tap', async () => {
    const { card, went } = await tapConnect(
      { ok: false, status: 401, data: null },
      { ok: true, status: 200, data: { url: '/auth/google/login?state=s2' } }
    );
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(went).toEqual([]);
    expect(card.querySelector('[role="status"]')).toBeNull();
    const again = card.querySelector('button');
    expect(again?.textContent).toBe('Connect Google Calendar');
    again?.click();
    await vi.waitFor(() => expect(went).toEqual(['/auth/google/login?state=s2']));
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it.each([
    [404, /expired or was already used/], // unknown, used, or someone else's invite
    [410, /expired or was already used/],
    [403, /Couldn't open Google/],
    [503, /Couldn't open Google/],
    [0, /Couldn't open Google/],
  ])('says why when the server answers %i, in place of the button', async (status, why) => {
    const detail = 'Firestore internal: deadline exceeded at connect_invites';
    // The real client puts a refusal's text in res.error (utils/api.ts); data too, to be sure.
    const refused = { ok: false, status, error: detail, data: { error: detail } };
    const { card, went } = await tapConnect(refused);
    expect(went).toEqual([]);
    expect(card.querySelector('button')).toBeNull();
    expect(card.querySelector('[role="status"]')?.textContent).toMatch(why);
    expect(card.textContent).not.toContain(detail);
  });
});
