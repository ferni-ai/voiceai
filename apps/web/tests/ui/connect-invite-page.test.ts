/**
 * The /connect#i=<invite> page: opened from the link a connect moment texts.
 * It takes over only for a well-formed invite, clears it from the address bar,
 * says plainly what connecting shares, and its one button spends the invite
 * and goes to the provider, or says why it can't.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiPost = vi.fn();
const mockAuth = vi.fn(async () => ({ isAuthenticated: false }));
const mockRefuseFraming = vi.fn(() => false);

vi.mock('../../src/utils/api.js', () => ({
  apiPost: mockApiPost,
  apiGet: vi.fn(),
  getApiHeaders: vi.fn(() => ({})),
}));
// auth-init starts Firebase on import; the page only needs it to have run.
vi.mock('../../src/services/auth-init.service.js', () => ({ initializeAuth: mockAuth }));
vi.mock('../../src/utils/frame-guard.js', () => ({ refuseFraming: mockRefuseFraming }));

const { connectInviteFromLocation, renderConnectInvite, CONNECT_INVITE_START_PATH } =
  await import('../../src/ui/connect-invite-page.ui');
const { openStandalonePage } = await import('../../src/app/standalone-pages');

const INVITE = 'Ab3_-'.repeat(8) + 'xyz'; // 43 characters
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockReset();
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

/** Click Connect with a stand-in location, and report where the page went. */
async function tapConnect(response: unknown): Promise<{ card: HTMLElement; went: string[] }> {
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
  mockApiPost.mockResolvedValueOnce(response);
  const card = renderConnectInvite(INVITE);
  document.body.append(card);
  card.querySelector('button')?.click();
  await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { card, went };
}

describe('connectInviteFromLocation', () => {
  it('takes only a 43-character invite in the fragment of /connect', () => {
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}`)).toBe(INVITE);
    expect(connectInviteFromLocation('/connect/', `#i=${INVITE}`)).toBe(INVITE);
    expect(connectInviteFromLocation('/connect', '')).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}x`)).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE}&next=/x`)).toBeNull();
    expect(connectInviteFromLocation('/connect', `#i=${INVITE.slice(1)}/`)).toBeNull();
    expect(connectInviteFromLocation('/connections', `#i=${INVITE}`)).toBeNull();
  });
});

describe('openStandalonePage(/connect)', () => {
  it('opens the consent card for an invite, and clears it from the address bar', async () => {
    window.history.replaceState(null, '', `/connect#i=${INVITE}`);
    expect(await openStandalonePage('/connect')).toBe(true);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/connect');
    const root = document.querySelector('main.connect-invite-page');
    expect(root?.querySelector('h1')?.textContent).toBe('Let Alex keep an eye on your calendar');
    expect([...(root?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Sees event times, titles and places',
      'Adds or changes events only when you ask',
      'Never sees your emails or attachments',
      'Undo any time in Settings > Calendar, or just tell Alex',
    ]);
    expect(root?.querySelector('button')?.textContent).toBe('Connect Google Calendar');
    expect(mockAuth).toHaveBeenCalledTimes(1); // so a signed-in browser sends its token
    expect(mockApiPost).not.toHaveBeenCalled(); // opening the link spends nothing
  });

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

describe('Connect', () => {
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

  it.each(['//evil.example.com/steal', 'https://evil.example.com/steal', 'javascript:steal()'])(
    'never follows a URL off this site: %s',
    async (url) => {
      const { card, went } = await tapConnect({ ok: true, status: 200, data: { url } });
      expect(went).toEqual([]);
      expect(card.querySelector('[role="status"]')?.textContent).toMatch(/Couldn't open Google/);
    }
  );
  it('never follows an answer with no URL', async () => {
    const { card, went } = await tapConnect({ ok: true, status: 200, data: {} });
    expect(went).toEqual([]);
    expect(card.querySelector('[role="status"]')?.textContent).toMatch(/Couldn't open Google/);
  });

  it.each([
    [410, /expired or was already used/],
    [403, /different account/],
    [503, /Couldn't open Google/],
    [0, /Couldn't open Google/],
  ])('says why when the server answers %i, in place of the button', async (status, why) => {
    const { card, went } = await tapConnect({ ok: false, status, data: null });
    expect(went).toEqual([]);
    expect(card.querySelector('button')).toBeNull();
    expect(card.querySelector('[role="status"]')?.textContent).toMatch(why);
  });
});
