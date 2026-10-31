/**
 * Menu screens must leave their loading state when the server never answers.
 *
 * apiFetch and the auth wait in getApiHeadersAsync had no time limit (apiGet
 * did), and three screens built on them: "How You're Feeling" kept its spinner,
 * "Privacy & your data" did nothing on tap until the categories came back (and
 * then listed every category with 0 items when they didn't), and "Our Story So
 * Far" kept its care-block loader. Here fetch and Firebase never answer, and
 * each screen must show its error within the request time limit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n/index.js';
import { API_REQUEST_TIMEOUT_MS, AUTH_READY_TIMEOUT_MS } from '../../src/utils/request-deadline.js';

const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

const auth = vi.hoisted(() => ({ ready: true, tokenAnswers: true }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(() => (auth.ready ? Promise.resolve({}) : new Promise(() => undefined))),
  getAuthToken: vi.fn(() =>
    auth.tokenAnswers ? Promise.resolve('id-token') : new Promise(() => undefined)
  ),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut: vi.fn(async () => undefined),
}));
vi.mock('../../src/services/push-preference.js', () => ({
  signOutReleasingPush: vi.fn(async () => undefined),
}));
vi.mock('../../src/services/rituals.service.js', () => ({
  ritualsService: { clearAll: vi.fn() },
}));

beforeEach(() => {
  auth.ready = true;
  auth.tokenAnswers = true;
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => never<Response>())
  );
});

// The screens share one module graph (and its loaded locale); auth tests get fresh helpers.
const { showWellbeingDashboard, cleanupWellbeingDashboard } =
  await import('../../src/ui/wellbeing-dashboard.ui.js');
const { showDataExport } = await import('../../src/app/panel-methods.js');
const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');
await import('../../src/services/data-export.service.js'); // showDataExport loads it lazily
const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');
const { createDemoStoryData } = await import('../../src/ui/visualizations/index.js');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('apiFetch time limits', () => {
  beforeEach(() => vi.resetModules());

  it('rejects with RequestTimeoutError once the server has not answered in time', async () => {
    const { apiFetch } = await import('../../src/utils/api-helpers.js');
    const outcome = apiFetch('/api/anything').then(
      () => 'answered',
      (err: unknown) => err
    );

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void outcome.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect((err as Error).name).toBe('RequestTimeoutError'); // fresh module: compare by name
    expect((err as Error).message).toBe(`Request timeout after ${API_REQUEST_TIMEOUT_MS}ms`);
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.signal?.aborted).toBe(true);
  });

  it('stops waiting for an auth start that never finishes', async () => {
    auth.ready = false;
    const { getApiHeadersAsync } = await import('../../src/utils/api-helpers.js');
    const headers = getApiHeadersAsync();

    await vi.advanceTimersByTimeAsync(AUTH_READY_TIMEOUT_MS);

    await expect(headers).resolves.toMatchObject({ Authorization: 'Bearer id-token' });
  });

  it('stops waiting for a token that never comes and sends no Authorization', async () => {
    auth.tokenAnswers = false;
    const { getApiHeadersAsync } = await import('../../src/utils/api-helpers.js');
    const headers = getApiHeadersAsync();

    await vi.advanceTimersByTimeAsync(AUTH_READY_TIMEOUT_MS);

    const resolved = await headers;
    expect(resolved).not.toHaveProperty('Authorization');
  });
});

describe('screens leave their loading state when the server never answers', () => {
  it('How You\'re Feeling: the spinner gives way to "couldn\'t load" with a retry', async () => {
    void showWellbeingDashboard();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#wellbeing-content .wellbeing-spinner')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    expect(document.querySelector('#wellbeing-content .wellbeing-spinner')).toBeNull();
    const error = document.querySelector('#wellbeing-content .wellbeing-error');
    expect(error?.textContent).toContain(t('wellbeing.couldntLoadData'));
    cleanupWellbeingDashboard();
  });

  it('Privacy & your data: opens at once, then says it couldn\'t load, never "0 items"', async () => {
    const panel = () => document.querySelector('.data-export');

    const opened = showDataExport();
    await vi.advanceTimersByTimeAsync(0);
    expect(panel()?.classList.contains('data-export--visible')).toBe(true);
    expect(panel()?.querySelector('[role="status"]')?.textContent).toContain(t('common.loading'));

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    await opened;

    const alert = panel()?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(t('dataExport.loadFailed'));
    expect(panel()?.querySelector('.data-export__category-count')).toBeNull();
    expect(panel()?.querySelector('.data-export__categories')).toBeNull();

    // Try again reaches the server a second time
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ categories: [] }), { status: 200 })
    );
    alert?.querySelector<HTMLButtonElement>('.data-export__btn--primary')?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(panel()?.querySelector('.data-export__categories')).not.toBeNull();
    getDataExportUI().destroy();
  });

  it('Privacy & your data: a server error says it couldn\'t load, not "0 items"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));

    await showDataExport();

    const panel = document.querySelector('.data-export');
    expect(panel?.querySelector('[role="alert"]')?.textContent).toContain(
      t('dataExport.loadFailed')
    );
    expect(panel?.querySelector('.data-export__category-count')).toBeNull();
    getDataExportUI().destroy();
  });

  it('Our Story So Far: the care block stops loading and offers a retry', async () => {
    const care = () => document.querySelector('#viz-actions-taken');

    getYourStoryUI().show(createDemoStoryData('demo-user'));
    await vi.advanceTimersByTimeAsync(0);
    expect(care()?.textContent).toContain(t('yourStory.care.loading'));

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    expect(care()?.textContent).not.toContain(t('yourStory.care.loading'));
    expect(care()?.querySelector('.error-state')?.textContent).toContain(
      t('yourStory.actionsError.message')
    );
    getYourStoryUI().hide();
  });
});
