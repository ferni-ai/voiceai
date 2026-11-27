/**
 * A slow first visit to Avatar Soul must not stop a later visit's lab (#4069, L6).
 * The portal calls a section's cleanup when that load's setup ends after a newer load,
 * and the module's cleanup stops whatever is current. So if setup waited for the soul
 * stats, a first visit's late answer would stop the third visit's lab: dead buttons.
 * Driven through the real portal and the real registry; no request leaves the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabRequest } from '../../src/ui/avatar-lab-protocol.js';

/** The first soul stats request waits for the test; every later one answers at once. */
const stats = vi.hoisted(() => ({
  hold: true,
  answers: [] as Array<(response: Response) => void>,
}));
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

vi.mock('../../src/admin/admin-fetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/admin/admin-fetch.js')>()),
  adminFetch: (url: string) => {
    if (url !== '/api/v1/admin/soul/stats') return Promise.resolve(json({}, 404));
    if (!stats.hold) return Promise.resolve(json({ measured: false, reason: 'SOUL_STATS is off' }));
    stats.hold = false;
    return new Promise<Response>((resolve) => stats.answers.push(resolve));
  },
}));

vi.mock('../../src/admin/admin-api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/admin/admin-api.js')>()),
  getAdminHeadersAsync: async () => ({}),
}));

async function openPortal(section: string): Promise<void> {
  window.history.replaceState({}, '', `/admin?section=${section}`);
  document.body.innerHTML = '<div id="app"></div>';
  const { initAdminPortal } = await import('../../src/admin/index.js');
  await initAdminPortal();
}

const navTo = (id: string): void => {
  document
    .querySelector<HTMLElement>(`.admin-nav-btn[data-section="${id}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const frame = (): HTMLIFrameElement | null => document.querySelector('#avatarLabFrame');
const fieldData = (): string => document.getElementById('avatarSoulFieldData')?.textContent ?? '';
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  vi.resetModules();
  stats.hold = true;
  stats.answers.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({}, 404))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Avatar Soul through the portal', () => {
  it("a first visit's late soul stats answer leaves a later visit's lab and field data working", async () => {
    await openPortal('api-docs');
    navTo('avatar-soul'); // load 1: its soul stats request waits
    await vi.waitFor(() => expect(stats.answers).toHaveLength(1));
    navTo('api-docs'); // load 2
    await vi.waitFor(() => expect(frame()).toBeNull());
    navTo('avatar-soul'); // load 3: its soul stats answer at once
    await vi.waitFor(() => expect(fieldData()).toContain('not measured: SOUL_STATS is off'));

    stats.answers[0]?.(json({ measured: false, reason: 'a stale first answer' }));
    await settle();

    const lab = frame()?.contentWindow;
    if (!lab) throw new Error('load 3 has no lab frame');
    const posted: LabRequest[] = [];
    vi.spyOn(lab, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message as LabRequest);
    });
    const spark = [
      ...document.querySelectorAll<HTMLButtonElement>('button[data-lab-control]'),
    ].find((b) => b.textContent?.trim() === 'Memory spark');
    spark?.click();
    expect(posted.map((r) => r.command)).toEqual([{ name: 'moment', moment: 'memorySpark' }]);
    expect(document.getElementById('avatarLabStatus')?.textContent).toBe(
      'Memory spark: asking the lab'
    );
    expect(fieldData()).toContain('not measured: SOUL_STATS is off');
    expect(fieldData()).not.toContain('a stale first answer');
  });
});
