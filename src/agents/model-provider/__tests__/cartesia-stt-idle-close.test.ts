/**
 * Cartesia closes the STT socket with 1006 about 300 s after the caller's last
 * words. The SDK reconnects and the call goes on, but the plugin logged every
 * one at error ("Cartesia STT stream error"): 4 alert-level lines per quiet
 * 20 minutes. Our patch (patches/@livekit__agents-plugin-cartesia@1.9.3.patch)
 * logs that close at warn with expectedIdleClose; any other failure stays at
 * error. This drives the real plugin, ESM and CJS builds, against a local
 * WebSocket server that drops the socket, so an upgrade that loses the patch
 * fails here.
 */
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { log } from '@livekit/agents';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

type ServerMove = 'drop' | 'close-1011';
let move: ServerMove = 'drop';

const server = new WebSocketServer({ port: 0 });
server.on('connection', (socket) => {
  // Let the client finish opening, then end the connection the way under test.
  setTimeout(() => {
    if (move === 'drop')
      socket.terminate(); // no close frame: the client sees 1006
    else socket.close(1011, 'server error');
  }, 20);
});

afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

interface PluginModule {
  STT: new (opts: Record<string, unknown>) => {
    on: (event: 'error', listener: (e: unknown) => void) => void;
    stream: (opts: { connOptions: Record<string, number> }) => { close: () => void };
  };
}

const builds: Record<string, () => Promise<PluginModule>> = {
  esm: async () => (await import('@livekit/agents-plugin-cartesia')) as unknown as PluginModule,
  cjs: async () =>
    createRequire(import.meta.url)('@livekit/agents-plugin-cartesia') as PluginModule,
};

/** Opens one plugin stream (no retries), lets the server end it, returns the stream-error log call. */
async function streamErrorLog(build: keyof typeof builds) {
  const logger = log();
  const warn = vi.spyOn(logger, 'warn');
  const error = vi.spyOn(logger, 'error');
  const isStreamError = (args: unknown[]) => args.includes('Cartesia STT stream error');

  const { STT } = await builds[build]();
  const stt = new STT({
    apiKey: 'test-key',
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    model: 'ink-2',
  });
  stt.on('error', () => undefined); // the SDK emits the give-up; the test reads the log
  const stream = stt.stream({ connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 5000 } });

  let level: 'warn' | 'error' | undefined;
  let args: unknown[] = [];
  await vi.waitFor(
    () => {
      const w = warn.mock.calls.find(isStreamError);
      const e = error.mock.calls.find(isStreamError);
      if (w) [level, args] = ['warn', w];
      if (e) [level, args] = ['error', e];
      expect(level).toBeDefined();
    },
    { timeout: 5000 }
  );
  stream.close();
  return {
    level,
    fields: args.find((a) => typeof a === 'object' && a !== null) as Record<string, unknown>,
    warnedStreamError: warn.mock.calls.some(isStreamError),
    erroredStreamError: error.mock.calls.some(isStreamError),
  };
}

describe.each(['esm', 'cjs'] as const)('Cartesia STT idle close (%s build)', (build) => {
  it('logs the expected 1006 idle close at warn, not error', async () => {
    move = 'drop';
    const got = await streamErrorLog(build);

    expect(got.level).toBe('warn');
    expect(got.erroredStreamError).toBe(false);
    expect(got.fields.expectedIdleClose).toBe(true);
    expect(got.fields.closeCode).toBe(1006);
    expect(String((got.fields.error as Error).message)).toBe(
      'Cartesia STT connection closed unexpectedly (code=1006)'
    );
  });

  it('still logs any other close code at error', async () => {
    move = 'close-1011';
    const got = await streamErrorLog(build);

    expect(got.level).toBe('error');
    expect(got.warnedStreamError).toBe(false);
    const fields = got.fields as { error: Error };
    expect(fields.error.message).toBe('Cartesia STT connection closed unexpectedly (code=1011)');
    expect(fields).not.toHaveProperty('expectedIdleClose');
  });
});
