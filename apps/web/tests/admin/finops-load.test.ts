/**
 * A failed FinOps load says why instead of leaving "Loading FinOps data..." on screen.
 * The routes take the signed-in admin, so a 401 says sign in and a 403 says not an admin.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const adminFetch = vi.fn<(url: string) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string) => adminFetch(url),
}));

const { FinOpsHttpError, finopsGet, finopsLoadFailure } =
  await import('../../src/admin/sections/finops-load.js');

describe('finopsGet', () => {
  it('returns the JSON body of a 2xx reply', async () => {
    adminFetch.mockResolvedValueOnce(new Response('{"burn":3}', { status: 200 }));
    await expect(finopsGet('/api/finops/snapshot')).resolves.toEqual({ burn: 3 });
  });

  it('throws FinOpsHttpError carrying the status of a non-2xx reply', async () => {
    adminFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(finopsGet('/api/finops/snapshot')).rejects.toMatchObject({ status: 401 });
  });
});

describe('finopsLoadFailure', () => {
  it.each([
    [new FinOpsHttpError(401), 'Sign in as an admin to see FinOps (HTTP 401).'],
    [new FinOpsHttpError(403), 'This account is not an admin, so FinOps is hidden (HTTP 403).'],
    [new FinOpsHttpError(500), 'Could not load FinOps data (HTTP 500).'],
    [new TypeError('Failed to fetch'), 'Could not reach the FinOps service.'],
  ])('%s', (error, text) => {
    expect(finopsLoadFailure(error)).toBe(text);
  });
});

describe('FinOps section', () => {
  afterEach(async () => {
    (await import('../../src/admin/sections/FinOpsSection.js')).cleanup();
  });

  it('replaces "Loading FinOps data..." with the reason when the load fails', async () => {
    adminFetch.mockImplementation(async () => new Response('{}', { status: 401 }));
    const section = await import('../../src/admin/sections/FinOpsSection.js');
    document.body.innerHTML = `<div id="adminContent">${await section.render()}</div>`;
    expect(document.querySelector('#finops-loading p')?.textContent).toBe('Loading FinOps data...');

    await section.setupEvents();

    expect(document.querySelector('#finops-loading p')?.textContent).toBe(
      'Sign in as an admin to see FinOps (HTTP 401).'
    );
  });
});
