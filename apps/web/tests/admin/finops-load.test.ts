/**
 * A failed FinOps load says why instead of leaving "Loading FinOps data..." on screen.
 * The routes take only the server's admin key, so a 401 with none saved says so.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const finopsFetch = vi.fn<(url: string) => Promise<Response>>();
let storedKey = '';
vi.mock('../../src/admin/admin-fetch.js', () => ({
  finopsFetch: (url: string) => finopsFetch(url),
  getStoredAdminKey: () => storedKey,
}));

const { FinOpsHttpError, finopsGet, finopsLoadFailure } =
  await import('../../src/admin/sections/finops-load.js');

describe('finopsGet', () => {
  it('returns the JSON body of a 2xx reply', async () => {
    finopsFetch.mockResolvedValueOnce(new Response('{"burn":3}', { status: 200 }));
    await expect(finopsGet('/api/finops/snapshot')).resolves.toEqual({ burn: 3 });
  });

  it('throws FinOpsHttpError carrying the status of a non-2xx reply', async () => {
    finopsFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(finopsGet('/api/finops/snapshot')).rejects.toMatchObject({ status: 401 });
  });
});

describe('finopsLoadFailure', () => {
  it.each([
    [
      new FinOpsHttpError(401),
      false,
      "FinOps needs the server's admin key, and none is saved in this browser (HTTP 401).",
    ],
    [
      new FinOpsHttpError(403),
      true,
      'The FinOps service refused the admin key saved in this browser (HTTP 403).',
    ],
    [new FinOpsHttpError(500), true, 'Could not load FinOps data (HTTP 500).'],
    [new TypeError('Failed to fetch'), false, 'Could not reach the FinOps service.'],
  ])('%s with a key saved: %s', (error, hasKey, text) => {
    expect(finopsLoadFailure(error, hasKey)).toBe(text);
  });
});

describe('FinOps section', () => {
  afterEach(async () => {
    (await import('../../src/admin/sections/FinOpsSection.js')).cleanup();
  });

  it('replaces "Loading FinOps data..." with the reason when the load fails', async () => {
    storedKey = '';
    finopsFetch.mockImplementation(async () => new Response('{}', { status: 401 }));
    const section = await import('../../src/admin/sections/FinOpsSection.js');
    document.body.innerHTML = `<div id="adminContent">${await section.render()}</div>`;
    expect(document.querySelector('#finops-loading p')?.textContent).toBe('Loading FinOps data...');

    await section.setupEvents();

    expect(document.querySelector('#finops-loading p')?.textContent).toBe(
      "FinOps needs the server's admin key, and none is saved in this browser (HTTP 401)."
    );
  });
});
