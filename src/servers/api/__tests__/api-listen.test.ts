/**
 * #3853: a local or preview API server started every background sender, with only missing
 * provider credentials between it and a text, call or push from the database it points at.
 * These pin the two settings in api-listen.ts: unset, the server listens on 0.0.0.0 and starts
 * every sender exactly as index.ts did; API_BACKGROUND_SENDERS=off starts none of them, and
 * API_LISTEN_HOST moves the listen. A value that is neither on nor off warns once, without the
 * value, and reads as the default (#4371).
 */
import type { Server } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const m: Record<string, ReturnType<typeof vi.fn>> = {};
/** A mock that records its own name in `calls` when it runs. */
const stub = (name: string, value?: unknown) =>
  (m[name] = vi.fn(() => {
    calls.push(name);
    return value;
  }));

vi.mock('../../../services/calendar/polling/apple-polling.js', () => ({
  loadRegisteredUsers: stub('loadApplePollingUsers', Promise.resolve()),
  startPolling: stub('startApplePolling'),
}));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  renewExpiringChannels: stub('startGoogleWebhookRenewal', Promise.resolve()),
}));
vi.mock('../../../services/calendar/webhooks/outlook-webhook.js', () => ({
  renewExpiringSubscriptions: stub('startOutlookSubscriptionRenewal', Promise.resolve()),
}));
vi.mock('../../../services/outreach/proactive-scheduler.js', () => ({
  loadPendingOutreach: stub('loadPendingOutreach', Promise.resolve()),
  startScheduler: stub('startProactiveScheduler'),
}));
vi.mock('../../../api/life-automation-routes.js', () => ({
  initWorkflowExecutionHandler: stub('initWorkflowExecutionHandler'),
}));
vi.mock('../services/spotify.js', () => ({
  startAutoRefresh: stub('startSpotifyAutoRefresh'),
}));
vi.mock('../../../api/twilio-routes.js', () => ({
  attachTwilioStreamBridgeToServer: stub('attachTwilioStreamBridgeToServer'),
  initializeTwilioStreamBridge: stub('initializeTwilioStreamBridge'),
}));
vi.mock('../../../services/outreach/ui-server-ports.js', () => ({
  installUiServerPorts: stub('installUiServerPorts'),
}));
vi.mock('../../../personas/voice-registry.js', () => ({
  initializeVoiceRegistry: stub('initializeVoiceRegistry', Promise.resolve()),
}));
const warn = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
}));

const { listenAndStart } = await import('../api-listen.js');

/** Every sender the switch governs. */
const SENDERS = [
  'loadApplePollingUsers',
  'startApplePolling',
  'startGoogleWebhookRenewal',
  'startOutlookSubscriptionRenewal',
  'loadPendingOutreach',
  'startProactiveScheduler',
  'initWorkflowExecutionHandler',
  'startSpotifyAutoRefresh',
] as const;
/** What the server still does with the senders off. */
const ALWAYS = [
  'installUiServerPorts',
  'initializeVoiceRegistry',
  'attachTwilioStreamBridgeToServer',
] as const;

/** Listen through a fake server, run the listen callback, and let startup settle. */
async function start(env: Record<string, string | undefined>) {
  const listen = vi.fn((_port: number, _host: string, cb: () => void) => cb());
  const server = { listen } as unknown as Server;
  listenAndStart(server, { port: 3002, livekitUrl: 'wss://example.test', env });
  await vi.waitFor(() => expect(calls).toContain('attachTwilioStreamBridgeToServer'));
  // The sender steps run on microtasks after the bridge; one macrotask drains them all.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return { listen, server };
}

beforeEach(() => {
  calls.length = 0;
  for (const fn of Object.values(m)) fn.mockClear();
  warn.mockClear();
});

describe('API server listen and background senders (#3853)', () => {
  it('both unset: listens on 0.0.0.0 and starts every sender, as main did', async () => {
    const { listen, server } = await start({});

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0].slice(0, 2)).toEqual([3002, '0.0.0.0']);
    for (const name of [...SENDERS, ...ALWAYS]) expect(m[name]).toHaveBeenCalledTimes(1);
    expect(m.attachTwilioStreamBridgeToServer).toHaveBeenCalledWith(server, '/stream');
    // main's whole start order: ports, Spotify, registry and the bridge, then the sender steps.
    // The steps run concurrently (background-services.ts), so with loads that settle at once a
    // step without a load starts first and each loaded step starts after its own load.
    expect(calls).toEqual([
      'installUiServerPorts',
      'startSpotifyAutoRefresh',
      'initializeVoiceRegistry',
      'attachTwilioStreamBridgeToServer',
      'startGoogleWebhookRenewal',
      'startOutlookSubscriptionRenewal',
      'initWorkflowExecutionHandler',
      'loadApplePollingUsers',
      'loadPendingOutreach',
      'startApplePolling',
      'startProactiveScheduler',
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('API_BACKGROUND_SENDERS=disabled: warns once, without the value, and every sender starts', async () => {
    await start({ API_BACKGROUND_SENDERS: 'disabled' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual([
      { flag: 'API_BACKGROUND_SENDERS' },
      'Unrecognised API_BACKGROUND_SENDERS value: reading as on (the default)',
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('disabled');
    for (const name of [...SENDERS, ...ALWAYS]) expect(m[name], name).toHaveBeenCalledTimes(1);
  });

  it.each([['off'], ['on'], [' OFF '], ['']])(
    'API_BACKGROUND_SENDERS=%j is a known value: no warning',
    async (value) => {
      await start({ API_BACKGROUND_SENDERS: value });
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it.each(['off', 'false', '0'])(
    'API_BACKGROUND_SENDERS=%s: no sender starts; the server still listens and serves',
    async (off) => {
      const { listen } = await start({ API_BACKGROUND_SENDERS: off });

      expect(listen.mock.calls[0].slice(0, 2)).toEqual([3002, '0.0.0.0']);
      expect(warn).not.toHaveBeenCalled();
      for (const name of SENDERS) expect(m[name], name).not.toHaveBeenCalled();
      expect(calls.filter((c) => !(ALWAYS as readonly string[]).includes(c))).toEqual([]);
      expect(m.installUiServerPorts).toHaveBeenCalledTimes(1);
      expect(m.initializeVoiceRegistry).toHaveBeenCalledTimes(1);
      expect(m.attachTwilioStreamBridgeToServer).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [' 127.0.0.1 ', '127.0.0.1'],
    ['  ', '0.0.0.0'],
    ['', '0.0.0.0'],
  ])('API_LISTEN_HOST=%j listens on %s; the senders still start', async (host, want) => {
    const { listen } = await start({ API_LISTEN_HOST: host });
    expect(listen.mock.calls[0].slice(0, 2)).toEqual([3002, want]);
    expect(m.startProactiveScheduler).toHaveBeenCalledTimes(1);
  });
});
