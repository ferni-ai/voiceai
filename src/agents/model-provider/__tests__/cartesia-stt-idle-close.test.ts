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

/** One JSON record the SDK's pino logger wrote. */
interface LogRecord {
  level: number;
  msg: string;
  closeCode?: number;
  expectedIdleClose?: boolean;
  error?: { type?: string; message?: string; stack?: string; closeCode?: number };
}

/**
 * The records pino actually writes, read off the SDK logger's output stream. Reading the
 * output (not the logger call's arguments) is the point: pino drops an object passed after
 * the message, so a call can carry the error and the line still lose it.
 */
function captureLogRecords(): LogRecord[] {
  const logger = log() as unknown as object;
  const chain = [logger, Object.getPrototypeOf(logger) as object];
  const sym = chain
    .flatMap((o) => Object.getOwnPropertySymbols(o))
    .find((s) => String(s) === 'Symbol(pino.stream)');
  if (!sym) throw new Error('SDK logger has no pino stream');
  const out = (logger as Record<symbol, { write: (chunk: string) => unknown }>)[sym];
  const records: LogRecord[] = [];
  const write = out.write.bind(out);
  vi.spyOn(out, 'write').mockImplementation((chunk: string) => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      try {
        records.push(JSON.parse(line) as LogRecord);
      } catch {
        // not a JSON record; leave it out
      }
    }
    return write(chunk);
  });
  return records;
}

/** Opens one plugin stream (no retries), lets the server end it, returns the stream-error records. */
async function streamErrorRecords(build: keyof typeof builds): Promise<LogRecord[]> {
  const records = captureLogRecords();
  const { STT } = await builds[build]();
  const stt = new STT({
    apiKey: 'test-key',
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    model: 'ink-2',
  });
  stt.on('error', () => undefined); // the SDK emits the give-up; the test reads the log
  const stream = stt.stream({ connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 5000 } });

  const streamErrors = () => records.filter((r) => r.msg === 'Cartesia STT stream error');
  await vi.waitFor(() => expect(streamErrors().length).toBeGreaterThan(0), { timeout: 5000 });
  stream.close();
  return streamErrors();
}

describe.each(['esm', 'cjs'] as const)('Cartesia STT idle close (%s build)', (build) => {
  it('logs the expected 1006 idle close at warn, not error', async () => {
    move = 'drop';
    const lines = await streamErrorRecords(build);

    expect(lines.map((r) => r.level)).toEqual([40]); // warn, and no error line
    const [line] = lines;
    expect(line.expectedIdleClose).toBe(true);
    expect(line.closeCode).toBe(1006);
    expect(line.error?.message).toBe('Cartesia STT connection closed unexpectedly (code=1006)');
  });

  it('still logs any other close code at error, with the error details', async () => {
    move = 'close-1011';
    const lines = await streamErrorRecords(build);

    expect(lines.map((r) => r.level)).toEqual([50]); // error, and no warn line
    const [line] = lines;
    expect(line).not.toHaveProperty('expectedIdleClose');
    expect(line.error?.message).toBe('Cartesia STT connection closed unexpectedly (code=1011)');
    expect(line.error?.stack).toContain('APIConnectionError: Cartesia STT connection closed');
    expect(line.closeCode).toBe(1011);
  });
});
