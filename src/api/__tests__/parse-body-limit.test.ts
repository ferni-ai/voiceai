/**
 * parseBody caps a JSON body while it streams. Over the cap the request is
 * answered 413 in one place (bounded-body.ts), whatever the route does with the
 * error, and the connection is closed so the rest of the body is never read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import net, { type AddressInfo } from 'net';
import { PassThrough } from 'stream';
import type { IncomingMessage } from 'http';
import {
  BodyTooLargeError,
  DEFAULT_MAX_BODY_BYTES,
  bindBodyLimitResponse,
  defaultMaxBodyBytes,
} from '../bounded-body.js';
import { parseBody, sendError, sendJSON } from '../helpers.js';
import { parseBody as parseVoiceAuthBody } from '../voice-auth/helpers.js';
import { respondOnRejection } from '../../servers/api/request-failure.js';

function request(headers: Record<string, string> = {}): PassThrough & IncomingMessage {
  const req = new PassThrough() as PassThrough & IncomingMessage;
  req.headers = headers;
  return req;
}

interface Reply {
  status: number;
  body: string;
  /** Bytes the client managed to send before the server answered or hung up. */
  sent: number;
}

/**
 * A server wired like src/servers/api/index.ts, serving the common route shape:
 * parse, and on any error answer 400 without checking whether a response went
 * out already.
 */
async function startServer(maxBytes?: number): Promise<{ url: URL; close: () => Promise<void> }> {
  const handle = async (req: IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      const body = await parseBody(req, { maxBytes });
      sendJSON(res, { got: body });
    } catch {
      sendError(res, 'Invalid JSON body', 400);
    }
  };
  const server = http.createServer((req, res) =>
    respondOnRejection(res, handle(bindBodyLimitResponse(req, res), res))
  );
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: new URL(`http://127.0.0.1:${port}/`),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** POST chunks until the server answers, or `totalBytes` have gone out. */
function post(
  url: URL,
  options: { chunk: Buffer; totalBytes: number; headers?: Record<string, string> }
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    let sent = 0;
    let answered = false;
    const req = http.request(url, { method: 'POST', headers: options.headers }, (res) => {
      answered = true;
      res.on('end', () => req.destroy());
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, sent }));
    });
    // The server closing mid-upload is expected; the response has already arrived.
    req.on('error', (error) => {
      if (!answered) reject(error);
    });
    const pump = (): void => {
      while (!answered && sent < options.totalBytes) {
        sent += options.chunk.byteLength;
        if (!req.write(options.chunk)) {
          req.once('drain', pump);
          return;
        }
      }
      if (!answered) req.end();
    };
    pump();
  });
}

describe('parseBody size cap', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.API_MAX_BODY_BYTES;
    delete process.env.API_MAX_BODY_BYTES;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.API_MAX_BODY_BYTES;
    else process.env.API_MAX_BODY_BYTES = saved;
  });

  it('parses a body under the cap as before', async () => {
    const req = request();
    req.end(JSON.stringify({ name: 'test', value: 123 }));
    expect(await parseBody(req)).toEqual({ name: 'test', value: 123 });
  });

  it('caps a body at 1 MB by default', async () => {
    const fits = request();
    fits.end(JSON.stringify({ s: 'x'.repeat(DEFAULT_MAX_BODY_BYTES - 20) }));
    const over = request();
    over.end(JSON.stringify({ s: 'x'.repeat(DEFAULT_MAX_BODY_BYTES) }));

    await expect(parseBody(fits)).resolves.toBeTruthy();
    await expect(parseBody(over)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('refuses a body that never ends once it passes the cap, without waiting for the rest', async () => {
    process.env.API_MAX_BODY_BYTES = '2048';
    const req = request();
    const reading = parseBody(req);
    for (let i = 0; i < 4; i++) req.write(Buffer.alloc(1024, 0x20));

    await expect(reading).rejects.toBeInstanceOf(BodyTooLargeError);
    // Unbound requests are destroyed, so nothing more is read from the socket.
    expect(req.destroyed).toBe(true);
  });

  it('reads API_MAX_BODY_BYTES only when it is a positive whole number', () => {
    expect(defaultMaxBodyBytes({ API_MAX_BODY_BYTES: '5000' })).toBe(5000);
    for (const bad of ['', 'abc', '0', '-5', '1.5', '1e6', '99999999999999999999']) {
      expect(defaultMaxBodyBytes({ API_MAX_BODY_BYTES: bad })).toBe(DEFAULT_MAX_BODY_BYTES);
    }
    expect(defaultMaxBodyBytes({})).toBe(DEFAULT_MAX_BODY_BYTES);
  });

  it('refuses a declared Content-Length over the cap before reading any body', async () => {
    // The stream never gets data or an end, so only the header can refuse it.
    const req = request({ 'content-length': String(DEFAULT_MAX_BODY_BYTES + 1) });
    await expect(parseBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('lets voice auth samples past the default cap, up to its own', async () => {
    const samples = request();
    samples.end(JSON.stringify({ samples: Array(150_000).fill(-0.012345678901234567) }));
    const huge = request();
    huge.end(JSON.stringify({ samples: 'x'.repeat(5 * 1024 * 1024) }));

    const body = await parseVoiceAuthBody(samples);
    expect((body.samples as number[]).length).toBe(150_000);
    // Over its cap the request is already answered, so it is not read as {}.
    await expect(parseVoiceAuthBody(huge)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});

describe('parseBody size cap over HTTP', () => {
  let server: { url: URL; close: () => Promise<void> };
  beforeEach(async () => {
    server = await startServer(64 * 1024);
  });
  afterEach(async () => {
    await server.close();
  });

  it('answers 413 to a chunked body over the cap, not the route 400, and stops reading', async () => {
    const reply = await post(server.url, {
      chunk: Buffer.alloc(16 * 1024, 0x20),
      totalBytes: 200 * 1024 * 1024,
    });

    expect(reply.status).toBe(413);
    expect(JSON.parse(reply.body)).toEqual({ error: 'Payload Too Large', maxBytes: 64 * 1024 });
    // Socket buffers let some extra through, but nowhere near the 200 MB offered.
    expect(reply.sent).toBeLessThan(20 * 1024 * 1024);
  });

  it('hangs up on a client that stops mid-body after the 413, instead of waiting on it', async () => {
    const socket = net.connect(Number(server.url.port), '127.0.0.1');
    let reply = '';
    socket.on('data', (c: Buffer) => (reply += c.toString()));
    const closed = new Promise<number>((resolve) => {
      const started = Date.now();
      socket.on('close', () => resolve(Date.now() - started));
    });
    const chunk = 'x'.repeat(80 * 1024);
    // Chunked, over the cap, and never terminated: the client just goes quiet.
    socket.write(
      `POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n${chunk.length.toString(16)}\r\n${chunk}\r\n`
    );

    expect(await closed).toBeLessThan(4000);
    expect(reply).toMatch(/^HTTP\/1\.1 413/);
  });

  it('answers 413 to a Content-Length over the cap without waiting for the body', async () => {
    const reply = await post(server.url, {
      chunk: Buffer.alloc(0),
      totalBytes: 0,
      headers: { 'content-length': String(10 * 1024 * 1024) },
    });
    expect(reply.status).toBe(413);
  });

  it('still answers a body under the cap normally', async () => {
    const reply = await post(server.url, {
      chunk: Buffer.from(JSON.stringify({ hello: 'world' })),
      totalBytes: 1,
      headers: { 'content-type': 'application/json' },
    });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ got: { hello: 'world' } });
  });
});
