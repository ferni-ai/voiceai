/**
 * There used to be two InsightsBroadcast singletons: cross-persona-insights
 * published into one (services/cross-persona/insights-broadcast.ts) while the
 * /ws/insights server subscribed to the other (services/communication/), so a
 * high-priority insight never reached a connected client. Real publisher, real
 * broadcast, real websocket server over a real socket; only the Firebase token
 * check and the interval manager are stubbed.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

vi.mock('../../identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-user-1' ? { uid: 'user-1', claims: {} } : null
  ),
}));
vi.mock('../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

const { addCrossPersonaInsight } = await import('../../cross-persona/cross-persona-insights.js');
const insightsWs = await import('../insights-websocket.js');

type Msg = { type: string; event?: { type: string; userId: string; insight?: { id: string } } };

let server: Server | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  insightsWs.shutdownInsightsWebSocket();
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  server = null;
});

async function subscribedClient(): Promise<Msg[]> {
  const s = createServer();
  server = s;
  insightsWs.initInsightsWebSocket(s);
  await new Promise<void>((resolve) => {
    s.listen(0, '127.0.0.1', resolve);
  });
  const port = (s.address() as AddressInfo).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/insights`, ['ferni.v1', 'bearer.tok-user-1']);
  sockets.push(ws);
  const messages: Msg[] = [];
  ws.on('message', (d) => messages.push(JSON.parse(d.toString()) as Msg));
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  ws.send(JSON.stringify({ type: 'subscribe' }));
  await vi.waitFor(() => expect(messages.map((m) => m.type)).toContain('initial_state'));
  return messages;
}

const insightEvents = (messages: Msg[]) =>
  messages.filter((m) => m.type === 'event' && m.event?.type === 'new_insight');

describe('a published insight reaches /ws/insights', () => {
  it('a high-priority insight added in-process is pushed to the subscribed client', async () => {
    const messages = await subscribedClient();
    expect(insightEvents(messages)).toHaveLength(0);

    const insight = addCrossPersonaInsight('user-1', {
      source: 'peter',
      target: 'maya',
      priority: 'high',
      content: 'Spending spikes after hard days at work',
      category: 'stress_spending_ws_test',
      proactive: false,
      oneTime: false,
    });

    await vi.waitFor(() => expect(insightEvents(messages)).toHaveLength(1));
    expect(insightEvents(messages)[0].event).toMatchObject({
      type: 'new_insight',
      userId: 'user-1',
      insight: { id: insight.id },
    });
  });

  it('a low-priority insight is not pushed', async () => {
    const messages = await subscribedClient();
    addCrossPersonaInsight('user-1', {
      source: 'peter',
      target: 'maya',
      priority: 'low',
      content: 'A small thing',
      category: 'low_ws_test',
      proactive: false,
      oneTime: false,
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(insightEvents(messages)).toHaveLength(0);
  });
});
