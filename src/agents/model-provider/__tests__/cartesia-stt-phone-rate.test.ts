/**
 * PHONE_AUDIO_MODE=on: the real Cartesia plugin, pointed at a local WebSocket
 * server, must open a phone caller's STT stream at sample_rate=8000 and an
 * app caller's at the plugin's 16 kHz.
 */
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

const urls: string[] = [];
const server = new WebSocketServer({ port: 0 });
server.on('connection', (_ws, req) => urls.push(req.url ?? ''));

afterAll(() => {
  delete process.env.CASCADE_STT_BASE_URL;
  delete process.env.PHONE_AUDIO_MODE;
  server.close();
});

async function connectedRate(phone: boolean): Promise<string | null> {
  const { CartesiaCascadeProvider } = await import('../cartesia-cascade.js');
  const before = urls.length;
  const stt = new CartesiaCascadeProvider().createSTT([], { phone }) as {
    stream(): { close(): void };
  };
  const stream = stt.stream();
  await vi.waitFor(() => expect(urls.length).toBeGreaterThan(before), { timeout: 5000 });
  stream.close();
  return new URL(urls[before], 'ws://x').searchParams.get('sample_rate');
}

describe('Cartesia STT rate for phone callers', () => {
  it('opens a phone caller at 8 kHz and an app caller at 16 kHz', async () => {
    process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
    process.env.CASCADE_STT_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.PHONE_AUDIO_MODE = 'on';
    expect(await connectedRate(true)).toBe('8000');
    expect(await connectedRate(false)).toBe('16000');
  });
});
