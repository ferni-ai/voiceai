/**
 * "Your Day" hub (menu item 1): what it shows for each answer its routes give.
 *
 * It used to ask for commitments with status=pending, which the keeper never
 * stores, and to turn any failed route into an empty list, so every person saw
 * "All caught up" whatever they had told Ferni and whether or not the server
 * answered.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockToastError = vi.fn();
const mockAuth = vi.fn<() => { uid?: string } | null>(() => ({ uid: 'u1' }));

vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet, apiPost: mockApiPost }));
vi.mock('../../src/ui/whisper.ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ui/whisper.ui.js')>();
  return { ...real, toast: { ...real.toast, error: mockToastError } };
});
vi.mock('../../src/services/firebase-auth.service.js', () => ({ getAuthState: mockAuth }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

type Answer = { ok: boolean; status: number; data?: unknown; error?: string };
const ok = (data: unknown): Answer => ({ ok: true, status: 200, data });
const COMMITMENT = {
  id: 'commit_1',
  type: 'intention',
  description: 'call my sister about the move',
  status: 'active',
  createdAt: 1,
};

function routeApi(answers: Partial<Record<'results' | 'threads' | 'commitments', Answer>>): void {
  mockApiGet.mockImplementation((path: string) => {
    if (path === '/api/background-results/pending')
      return Promise.resolve(answers.results ?? ok({ results: [] }));
    if (path === '/api/conversations/threads')
      return Promise.resolve(answers.threads ?? ok({ threads: [] }));
    if (path === '/api/commitments')
      return Promise.resolve(answers.commitments ?? ok({ items: [] }));
    return Promise.resolve({ ok: false, status: 404 });
  });
}

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.ferni-hub-panel')!;
const text = (): string => document.querySelector('.ferni-hub-content')?.textContent ?? '';

async function loadHub(): Promise<typeof import('../../src/ui/ferni-hub.ui.js')> {
  await (await import('../../src/i18n/index.js')).initI18n();
  return import('../../src/ui/ferni-hub.ui.js');
}

async function openHub(): Promise<typeof import('../../src/ui/ferni-hub.ui.js')> {
  const hub = await loadHub();
  await hub.show();
  return hub;
}

beforeEach(() => {
  vi.resetModules();
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockToastError.mockReset();
  mockAuth.mockReturnValue({ uid: 'u1' });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Your Day hub', () => {
  it('asks for active commitments and shows one the keeper holds', async () => {
    routeApi({ commitments: ok({ items: [COMMITMENT] }) });
    await openHub();

    const commitmentCalls = mockApiGet.mock.calls.filter(([path]) => path === '/api/commitments');
    expect(commitmentCalls).toHaveLength(1);
    expect(commitmentCalls[0]?.[1]).toMatchObject({ status: 'active' });
    expect(panel().dataset.state).toBe('ready');
    expect(document.querySelector('.ferni-hub-tracked-card')?.textContent).toContain(
      'call my sister about the move'
    );
    expect(text()).not.toContain('Nothing here yet');
  });

  it('says how the space fills when every route answers with nothing', async () => {
    routeApi({});
    await openHub();

    expect(panel().dataset.state).toBe('empty');
    expect(text()).toContain('Nothing here yet');
    expect(text()).toContain("I'll keep it here");
    expect(text()).not.toContain('All caught up');
  });

  it('a failed commitments route is an error with Try again, not an empty hub', async () => {
    routeApi({ commitments: { ok: false, status: 500, error: 'Failed to fetch commitments' } });
    await openHub();

    expect(panel().dataset.state).toBe('error');
    expect(text()).toContain('Something unexpected happened. Want to try again?');
    expect(text()).not.toContain('Nothing here yet');

    routeApi({ commitments: ok({ items: [COMMITMENT] }) });
    document.querySelector<HTMLButtonElement>('.ferni-hub-problem-action')!.click();
    await vi.waitFor(() => expect(panel().dataset.state).toBe('ready'));
    expect(text()).toContain('call my sister about the move');
  });

  it('a 401 asks the person to sign in', async () => {
    routeApi({ threads: { ok: false, status: 401, error: 'Unauthorized' } });
    await openHub();

    expect(panel().dataset.state).toBe('signed-out');
    expect(text()).toContain('You need to sign in first.');
  });

  it('signed out, it asks to sign in without calling the routes', async () => {
    mockAuth.mockReturnValue(null);
    routeApi({});
    await openHub();

    expect(panel().dataset.state).toBe('signed-out');
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('a route that never answers ends in the error state within 10 s', async () => {
    const hub = await loadHub();
    vi.useFakeTimers();
    mockApiGet.mockImplementation(() => new Promise(() => {}));
    const shown = hub.show();

    expect(panel().dataset.state).toBe('loading');
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    await shown;

    expect(panel().dataset.state).toBe('error');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('Done closes the commitment on the server, then removes its card', async () => {
    routeApi({ commitments: ok({ items: [COMMITMENT] }) });
    mockApiPost.mockResolvedValue(ok({ success: true }));
    await openHub();

    document.querySelector<HTMLButtonElement>('[data-tracked-action="complete"]')!.click();

    expect(mockApiPost).toHaveBeenCalledWith('/api/commitments/commit_1/complete');
    await vi.waitFor(() => expect(document.querySelector('.ferni-hub-tracked-card')).toBeNull());
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('Dismiss that the server refuses keeps the card and says so', async () => {
    routeApi({ commitments: ok({ items: [COMMITMENT] }) });
    mockApiPost.mockResolvedValue({ ok: false, status: 500, error: 'Failed to update commitment' });
    await openHub();

    const dismiss = document.querySelector<HTMLButtonElement>('[data-tracked-action="dismiss"]')!;
    dismiss.click();

    expect(mockApiPost).toHaveBeenCalledWith('/api/commitments/commit_1/dismiss');
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Couldn't update that. Try again?")
    );
    expect(document.querySelector('.ferni-hub-tracked-card')).not.toBeNull();
    expect(dismiss.disabled).toBe(false);
  });
});
