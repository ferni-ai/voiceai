/**
 * The LiveKit Cartesia plugin had no way to send keyterms; a pnpm patch adds
 * them. This points the real plugin at a local WebSocket server and checks the
 * URL it connects with, so an upgrade that drops the patch fails here.
 */
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

const urls: string[] = [];
const server = new WebSocketServer({ port: 0 });
server.on('connection', (_ws, req) => urls.push(req.url ?? ''));

afterAll(() => {
  delete process.env.CASCADE_STT_BASE_URL;
  server.close();
});

describe('Cartesia STT keyterms', () => {
  it('sends each keyterm on the STT connection', async () => {
    process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
    process.env.CASCADE_STT_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { CartesiaCascadeProvider } = await import('../cartesia-cascade.js');
    const stt = new CartesiaCascadeProvider().createSTT(['Ferni', 'Seth Ford']) as {
      stream(): { close(): void };
    };
    const stream = stt.stream();
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(0), { timeout: 5000 });
    stream.close();

    const params = new URL(urls[0], 'ws://x').searchParams;
    expect(params.get('model')).toBe('ink-2');
    expect(params.getAll('keyterm')).toEqual(['Ferni', 'Seth Ford']);
  });
});
