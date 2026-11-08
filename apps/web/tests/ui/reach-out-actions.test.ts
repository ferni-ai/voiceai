/**
 * When I'll Reach Out: Cancel and Reschedule show only where they work, and say
 * "cancelled" or "moved" only when the server did it.
 *
 * Before: the server always sent canCancel and canReschedule false, and the
 * buttons called routes that read an in-process map nothing fills, so they could
 * never work. Now the server says per item, behind REACH_OUT_ACTIONS, and the web
 * shows them only with VITE_REACH_OUT_ACTIONS on too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { ok: boolean; status: number; data?: unknown };
const upcoming = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }));
const apiGet = vi.hoisted(() =>
  vi.fn(async (): Promise<Reply> => ({ ok: true, status: 200, data: { upcoming: upcoming.items } }))
);
const apiPost = vi.hoisted(() =>
  vi.fn(async (): Promise<Reply> => ({ ok: true, status: 200, data: { success: true } }))
);
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost, apiDelete: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'held_call',
  personaId: 'ferni',
  personaName: 'Ferni',
  channel: 'call',
  scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
  preview: { body: 'Thinking of you' },
  reason: 'A call held for your hours',
  priority: 'medium',
  canCancel: true,
  canReschedule: true,
  ...over,
});

let root: HTMLElement;
const row = (id: string) => root.querySelector(`[data-outreach-id="${id}"]`) as HTMLElement;
const button = (id: string, action: string) =>
  row(id).querySelector(`[data-action="${action}"]`) as HTMLElement | null;

async function open(): Promise<void> {
  const { openOutreachSchedule } = await import('../../src/ui/outreach-schedule.ui.js');
  await openOutreachSchedule();
  root = document.querySelector('.outreach-schedule-overlay') as HTMLElement;
  await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
}

beforeEach(async () => {
  vi.resetModules();
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  document.body.innerHTML = '';
  apiGet.mockClear();
  apiPost.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  vi.stubGlobal('confirm', () => true);
  upcoming.items = [
    item('deferred_a'),
    item('f_reminder', {
      type: 'follow_up',
      channel: 'sms',
      canCancel: false,
      canReschedule: false,
    }),
    item('f_raised', { type: 'follow_up', channel: 'sms', canReschedule: false }),
  ];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('with VITE_REACH_OUT_ACTIONS off', () => {
  it('shows no Cancel or Reschedule, even where the server offers them', async () => {
    await open();
    expect(root.querySelector('[data-action="cancel"], [data-action="reschedule"]')).toBeNull();
  });
});

describe('with VITE_REACH_OUT_ACTIONS on', () => {
  beforeEach(() => vi.stubEnv('VITE_REACH_OUT_ACTIONS', 'true'));

  it('shows each button only on the items the server says it works for', async () => {
    await open();
    expect([button('deferred_a', 'cancel'), button('deferred_a', 'reschedule')]).not.toContain(
      null
    );
    expect(button('f_reminder', 'cancel')).toBeNull();
    expect(button('f_reminder', 'reschedule')).toBeNull();
    expect(button('f_raised', 'cancel')).not.toBeNull();
    expect(button('f_raised', 'reschedule')).toBeNull();
  });

  it('cancels that item by kind and id, says so, and reads the list again', async () => {
    await open();
    button('deferred_a', 'cancel')!.click();
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Cancelled/))
    );
    expect(apiPost).toHaveBeenCalledWith(
      '/api/outreach/upcoming/cancel',
      { type: 'held_call', id: 'deferred_a' },
      { maxRetries: 0 }
    );
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  });

  it('never says "cancelled" when the server refused it', async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 409, data: { success: false } });
    await open();
    button('deferred_a', 'cancel')!.click();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/already on its way/))
    );
    expect(toast.success).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  });

  it('never says "cancelled" when the connection failed', async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 0 });
    await open();
    button('deferred_a', 'cancel')!.click();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/nothing changed/))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('moves to the time picked and says "moved" only after the server did', async () => {
    await open();
    button('deferred_a', 'reschedule')!.click();
    const option = document.querySelector('.outreach-reschedule-option') as HTMLElement;
    option.click();
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Moved to/))
    );
    expect(apiPost).toHaveBeenCalledWith(
      '/api/outreach/upcoming/reschedule',
      { type: 'held_call', id: 'deferred_a', at: option.dataset.time },
      { maxRetries: 0 }
    );
  });

  it('a time the server refuses says to pick another, never "moved"', async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 422, data: { success: false } });
    await open();
    button('deferred_a', 'reschedule')!.click();
    (document.querySelector('.outreach-reschedule-option') as HTMLElement).click();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/another time/))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
