/**
 * Voice-to-screen events reach the app over the call.
 *
 * The agent runs on LiveKit Cloud, apart from the UI server, so "open Memory
 * Lane" and "switch to dark mode" only change the screen if the event goes on
 * the call's own data channel. Real frontend-signal bindings; Redis and
 * Firestore are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../redis-pubsub.js', () => ({
  CHANNELS: { USER_EVENTS: 'ferni:user-events' },
  getRedisPubSub: () => ({ publish: vi.fn(async () => undefined), subscribe: vi.fn() }),
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { initFrontendSignal, resetFrontendSignal } =
  await import('../../communication/frontend-signal.js');
const { broadcastUserEvent } = await import('../index.js');
const { deliverOverCall, uiEventsOverCall } = await import('../call-delivery.js');

const ON = { UI_EVENTS_OVER_CALL: 'on' } as NodeJS.ProcessEnv;

afterEach(() => {
  resetFrontendSignal();
  vi.unstubAllEnvs();
});

describe('voice-to-screen events over the call', () => {
  it('are off unless UI_EVENTS_OVER_CALL=on', async () => {
    const sent = vi.fn(async () => undefined);
    initFrontendSignal('call-a', sent);
    expect(uiEventsOverCall({} as NodeJS.ProcessEnv)).toBe(false);
    expect(await deliverOverCall('show_view', { view: 'memory-lane' }, 'call-a', {})).toBe(false);
    expect(sent).not.toHaveBeenCalled();
  });

  it('send the event in the shape the app reads (type plus data)', async () => {
    const sent = vi.fn(async () => undefined);
    initFrontendSignal('call-a', sent);
    expect(await deliverOverCall('show_view', { view: 'memory-lane' }, 'call-a', ON)).toBe(true);
    expect(sent).toHaveBeenCalledWith('show_view', { data: { view: 'memory-lane' } });
  });

  it("go to the caller's own call, not another live call", async () => {
    vi.stubEnv('UI_EVENTS_OVER_CALL', 'on');
    const mine = vi.fn(async () => undefined);
    const theirs = vi.fn(async () => undefined);
    initFrontendSignal('call-mine', mine);
    initFrontendSignal('call-theirs', theirs);

    await broadcastUserEvent(
      'uid-1',
      'theme_change',
      { theme: 'dark', source: 'voice' },
      {
        sessionId: 'call-mine',
      }
    );

    expect(mine).toHaveBeenCalledWith('theme_change', {
      data: { theme: 'dark', source: 'voice' },
    });
    expect(theirs).not.toHaveBeenCalled();
  });

  it('are not sent to anyone when two calls are live and the call is unknown', async () => {
    vi.stubEnv('UI_EVENTS_OVER_CALL', 'on');
    const a = vi.fn(async () => undefined);
    const b = vi.fn(async () => undefined);
    initFrontendSignal('call-a', a);
    initFrontendSignal('call-b', b);

    await broadcastUserEvent('uid-1', 'show_view', { view: 'settings' });

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
