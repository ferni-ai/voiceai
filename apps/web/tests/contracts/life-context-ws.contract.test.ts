/**
 * Life-context WebSocket contract: web client → server → web dashboard.
 *
 * The REAL server (initLifeContextWebSocket) runs on a real http server on
 * port 0. The REAL web client (life-context-updates.service) opens its socket
 * through the real openAuthedWebSocket; the global WebSocket is the `ws`
 * client, pointed at that port. Only the Firebase verifier, the interval
 * manager, the life-context data service and the web's token source are
 * mocked. Assertions are on what the dashboard ends up showing.
 *
 * The server binds the socket to the uid in the `bearer.<token>` subprotocol
 * and starts streaming only after the client sends { type: 'subscribe' }.
 * Before the fix the client never sent it, so nothing ever arrived.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';

const TOKENS: Record<string, string> = { 'tok-user-A': 'user-A' };
vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    TOKENS[token] ? { uid: TOKENS[token], claims: {} } : null
  ),
}));
vi.mock('../../../../src/utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

type BroadcastListener = (event: Record<string, unknown>) => void;
const broadcast = vi.hoisted(() => ({ listener: null as BroadcastListener | null }));
const lifeContext = vi.hoisted(() => ({
  lifeContextBroadcast: {
    subscribe: (fn: BroadcastListener) => {
      broadcast.listener = fn;
      return () => undefined;
    },
    triggerScan: async (uid: string) => ({
      overallLoadScore: uid === 'user-A' ? 0.11 : 0.99,
      wellbeingScore: 0.7,
      stressIndicators: [],
      patterns: [],
      createdAt: new Date(0),
    }),
    shutdown: () => undefined,
  },
  startLifeContextMonitoring: vi.fn(),
  stopLifeContextMonitoring: vi.fn(),
  getLifeContextSnapshot: () => undefined,
}));
vi.mock('../../../../src/services/communication/life-context-broadcast.js', () => lifeContext);
vi.mock('../../../../src/intelligence/triggers/index.js', () => ({
  generateSynthesisTriggers: () => [],
}));

vi.mock('../../src/services/firebase-auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAuthToken: async () => 'tok-user-A',
  getFirebaseUid: () => 'user-A',
}));

const server = await import('../../../../src/services/communication/life-context-websocket.js');
const client = await import('../../src/services/life-context-updates.service.js');
const dashboard = await import('../../src/ui/life-context-dashboard.ui.js');

let http: Server | null = null;

async function startServer(): Promise<void> {
  const s = createServer();
  http = s;
  server.initLifeContextWebSocket(s);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address() as AddressInfo;

  // The browser's WebSocket, as the `ws` client, aimed at this server.
  class BrowserWebSocket extends NodeWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      const target = new URL(url);
      target.protocol = 'ws:';
      target.host = `127.0.0.1:${port}`;
      super(target.toString(), protocols);
    }
  }
  vi.stubGlobal('WebSocket', BrowserWebSocket);
}

afterEach(async () => {
  client.disposeLifeContextUpdates();
  server.shutdownLifeContextWebSocket();
  vi.unstubAllGlobals();
  lifeContext.startLifeContextMonitoring.mockClear();
  await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
  http = null;
});

const shownLoad = (): number | undefined =>
  (dashboard.getLifeContextState().data as { overallLoadScore?: number } | null)?.overallLoadScore;

describe('life-context WebSocket: client subscribe → server stream', () => {
  it('the client subscribes, so the server streams the verified user and the dashboard shows it', async () => {
    await startServer();
    await client.connectToLifeContextStream('user-A');

    // The server only starts monitoring after a subscribe message.
    await vi.waitFor(() =>
      expect(lifeContext.startLifeContextMonitoring).toHaveBeenCalledWith('user-A')
    );
    // initial_state from the subscribe reaches the dashboard.
    await vi.waitFor(() => expect(shownLoad()).toBe(0.11));

    // A later broadcast for this user reaches the dashboard too.
    broadcast.listener?.({
      type: 'context_update',
      userId: 'user-A',
      snapshot: {
        overallLoadScore: 0.42,
        wellbeingScore: 0.5,
        stressIndicators: [],
        patterns: [],
        createdAt: new Date(1000),
      },
      triggers: [],
    });
    await vi.waitFor(() => expect(shownLoad()).toBe(0.42));
  });

  it('opening "Your World" streams into the dashboard; closing it unsubscribes', async () => {
    await startServer();
    client.openLifeContextDashboard();

    await vi.waitFor(() => expect(shownLoad()).toBe(0.11));
    expect(document.querySelector('.life-context-modal-overlay')).not.toBeNull();

    dashboard.hideLifeContextDashboard();
    await vi.waitFor(() =>
      expect(lifeContext.stopLifeContextMonitoring).toHaveBeenCalledWith('user-A')
    );
  });
});
