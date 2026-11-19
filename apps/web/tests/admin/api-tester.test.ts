/**
 * #4069 API Docs: the tester's Send sends, keeps the admin's token on this site, and
 * draws the answer as text; the quick requests run through the tester instead of
 * opening authed routes in a new tab, where no token goes with them.
 *
 * Runs the real section markup and the real portal click delegation (admin-events);
 * only the credentials and the network are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer admin-token' })),
}));

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 })
);

const { initAdminEvents } = await import('../../src/admin/admin-events.js');
const { render } = await import('../../src/admin/sections/ApiDocsSection.js');

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`no ${selector}`);
  return el;
};
const response = () => $('#testerResponse');
const authOf = (init?: RequestInit) => new Headers(init?.headers).get('Authorization');
/** Where fetch really goes: the URL it was given, resolved as the browser resolves it. */
const resolved = (url: unknown) => new URL(String(url), window.location.href);

async function send(method: string, url: string): Promise<void> {
  $<HTMLSelectElement>('#testerMethod').value = method;
  $<HTMLInputElement>('#testerUrl').value = url;
  $('[data-action="send-request"]').click();
  await vi.waitFor(() => expect(response().textContent).not.toMatch(/Sending/));
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML = `<div id="adminPortal"><div id="adminContent">${render()}</div></div>`;
  initAdminEvents();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Send', () => {
  it('sends exactly one request, with the admin token, for a path on this site', async () => {
    await send('GET', '/api/v1/admin/flags');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(resolved(url).origin).toBe(window.location.origin);
    expect(resolved(url).pathname).toBe('/api/v1/admin/flags');
    expect(init?.method).toBe('GET');
    expect(authOf(init)).toBe('Bearer admin-token');
    expect(response().textContent).toContain('Status: 200');
  });

  it.each([
    'https://other.example/api/x',
    '//other.example/api/x',
    '/\\other.example/api/x',
    'api/v1/admin/flags',
  ])('refuses %s on screen and sends nothing', async (url) => {
    await send('GET', url);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response().textContent).toContain(
      'Refused: the tester sends only to paths on this site'
    );
  });

  // Each starts with "/" and resolves on this site, but its path normalises to "//host"
  // (or "/\\host"): re-derived as a relative path, fetch would take it off-site.
  it.each([
    ['GET', '/.//other.example/x'],
    ['GET', '/..//other.example/x'],
    ['GET', '/%2e//other.example/x'],
    ['GET', '/%2e%2e//other.example/x'],
    ['GET', '/a/..//other.example/x'],
    ['GET', '/./\\other.example/x'],
    ['POST', '/.//other.example/x'],
  ])('never sends the admin token off-site for %s %s', async (method, url) => {
    $<HTMLTextAreaElement>('#testerBody').value = '{"a":1}';
    await send(method, url);
    const offSite = fetchMock.mock.calls.filter(
      ([target, init]) =>
        resolved(target).origin !== window.location.origin && authOf(init) !== null
    );
    expect(offSite).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response().textContent).toContain(
      'Refused: the tester sends only to paths on this site'
    );
  });

  it('refuses a catalogue path whose :id is not filled in', async () => {
    await send('POST', '/api/rituals/:id/complete');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response().textContent).toContain('replace :id with a real value');
  });

  it('draws an HTML response as literal text', async () => {
    const payload = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    fetchMock.mockResolvedValueOnce(new Response(payload, { status: 200 }));
    await send('GET', '/health');
    expect(response().querySelector('img, b')).toBeNull();
    expect(response().querySelector('pre')?.textContent).toBe(payload);
  });

  it('says why when the answer is an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"nope"}', { status: 404 }));
    await send('GET', '/api/agents/nobody');
    expect(response().textContent).toContain('unavailable (HTTP 404)');
  });

  it('says why when nothing answers', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await send('GET', '/health');
    expect(response().textContent).toContain('unavailable (network error)');
  });

  it('sends the body only with POST and PUT', async () => {
    $<HTMLTextAreaElement>('#testerBody').value = '{"a":1}';
    await send('POST', '/api/habits');
    await send('GET', '/api/habits');
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual(['{"a":1}', undefined]);
  });
});

describe('Quick requests', () => {
  it('are buttons, not new-tab links to authed routes', () => {
    const quick = document.querySelectorAll('.api-quick-links .quick-link');
    expect(quick).toHaveLength(4);
    expect(document.querySelectorAll('.api-docs-section a[href]')).toHaveLength(0);
    expect(document.querySelector('.api-docs-section')?.innerHTML).not.toContain('userId=demo');
  });

  it.each([
    ['Feature Flags API', '/api/v1/admin/flags'],
    ['Trust API', '/api/trust-journey/summary'],
  ])('%s fills the tester and sends with the admin token', async (label, path) => {
    const button = [...document.querySelectorAll<HTMLElement>('.quick-link')].find(
      (b) => b.textContent?.trim() === label
    );
    button?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(resolved(url).origin).toBe(window.location.origin);
    expect(`${resolved(url).pathname}${resolved(url).search}`).toBe(path);
    expect(authOf(init)).toBe('Bearer admin-token');
    expect($<HTMLInputElement>('#testerUrl').value).toBe(path);
  });
});

describe('Catalogue', () => {
  it('a row fills the tester without sending', async () => {
    $('.api-endpoint[data-path="/api/trust-export/csv"]').click();
    await vi.waitFor(() =>
      expect($<HTMLInputElement>('#testerUrl').value).toBe('/api/trust-export/csv')
    );
    expect($<HTMLSelectElement>('#testerMethod').value).toBe('GET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists no route the server does not have', () => {
    const listed = [...document.querySelectorAll<HTMLElement>('.api-endpoint')].map(
      (row) => `${row.dataset.method} ${row.dataset.path}`
    );
    expect(listed).not.toContain('PUT /api/agents/:id');
    expect(listed).not.toContain('GET /api/trust-export/preview');
    expect(listed).not.toContain('POST /api/trust-export/export');
    expect(listed).toEqual(
      expect.arrayContaining([
        'GET /api/trust-export',
        'GET /api/trust-export/csv',
        'GET /api/trust-export/summary',
      ])
    );
  });
});
