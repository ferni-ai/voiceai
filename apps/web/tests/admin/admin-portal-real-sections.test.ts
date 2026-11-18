/**
 * The real BTH Validation and Blind Evaluation entries open through the portal without an
 * uncaught error, and BTH's tabs are wired. Both used to be handed
 * document.querySelector('.admin-section-content') (a class the portal never renders) on a
 * 100 ms timer and crashed on every open. Every request answers 404; none leaves the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-fetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/admin/admin-fetch.js')>()),
  adminFetch: async () => new Response('{}', { status: 404 }),
}));

vi.mock('../../src/admin/admin-api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/admin/admin-api.js')>()),
  getAdminHeadersAsync: async () => ({}),
}));

const uncaught: string[] = [];
const onError = (e: ErrorEvent): void => void uncaught.push(e.message);
const onRejection = (e: PromiseRejectionEvent): void => void uncaught.push(String(e.reason));

async function openPortal(section: string): Promise<void> {
  window.history.replaceState({}, '', `/admin?section=${section}`);
  document.body.innerHTML = '<div id="app"></div>';
  const { initAdminPortal } = await import('../../src/admin/index.js');
  await initAdminPortal();
}

const content = (): HTMLElement => document.getElementById('adminContent') as HTMLElement;
const settle = async (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));

describe('admin portal: real sections that crashed on open', () => {
  beforeEach(() => {
    vi.resetModules();
    uncaught.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 }))
    );
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  });

  afterEach(() => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    vi.unstubAllGlobals();
  });

  it('opens BTH Validation with its tabs wired', async () => {
    await openPortal('bth-validation');
    await settle();
    expect(uncaught).toEqual([]);
    expect(content().textContent).not.toContain('Failed to load');

    const gaps = content().querySelector<HTMLElement>('.bth-tab[data-tab="gaps"]');
    expect(gaps).not.toBeNull();
    gaps?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(gaps?.classList.contains('bth-tab--active')).toBe(true));
  });

  it('opens Blind Evaluation without an uncaught error', async () => {
    await openPortal('blind-evaluation');
    await settle();
    expect(uncaught).toEqual([]);
    expect(content().textContent).not.toContain('Failed to load');
  });
});
