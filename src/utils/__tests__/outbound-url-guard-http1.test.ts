/**
 * Wire protocol: the guard stays on HTTP/1.1 even when the server offers h2 over ALPN (undici 8
 * offers h2 by default, undici 7 does not). The request goes through safeOutboundFetch and the
 * guard's own socket lookup, which sees a public answer (DNS spied). Only after the guard has
 * passed that address does the test move the socket to a local TLS server offering h2 and
 * http/1.1, by wrapping tls.connect. Its cert is self-signed, so verification is off for this
 * socket only. No network.
 */
import { execFileSync } from 'node:child_process';
import dns from 'node:dns';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http2 from 'node:http2';
import type { AddressInfo, LookupFunction } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeOutboundFetch } from '../outbound-url-guard.js';

const PUBLIC_V4 = '93.184.215.14';

/** Every lookup of host (pre-flight and the socket's own) answers address. */
function resolveTo(host: string, address: string) {
  const answers = (name: string) => {
    if (name !== host) throw Object.assign(new Error(`ENOTFOUND ${name}`), { code: 'ENOTFOUND' });
    return [{ address, family: 4 }];
  };
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async (name: string) =>
    answers(name)) as unknown as typeof dns.promises.lookup);
  vi.spyOn(dns, 'lookup').mockImplementation(((
    name: string,
    _opts: unknown,
    cb: (err: unknown, list?: unknown) => void
  ) => {
    try {
      cb(null, answers(name));
    } catch (err) {
      cb(err);
    }
  }) as unknown as typeof dns.lookup);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wire protocol: the guarded agent speaks HTTP/1.1', () => {
  const HOST = 'h1.example.test';

  function selfSignedCert(): { key: Buffer; cert: Buffer } {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'guard-h1-'));
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    try {
      execFileSync(
        'openssl',
        [
          ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1'],
          ...['-subj', `/CN=${HOST}`, '-keyout', keyPath, '-out', certPath],
        ],
        { stdio: 'ignore' }
      );
      return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('negotiates http/1.1 with a server that offers h2', async () => {
    const httpVersions: string[] = [];
    const alpn: Array<string | false | null> = [];
    const sockets = new Set<tls.TLSSocket>();
    const server = http2.createSecureServer(
      { ...selfSignedCert(), allowHTTP1: true },
      (req, res) => {
        httpVersions.push(req.httpVersion);
        res.end('ok');
      }
    );
    server.on('secureConnection', (socket: tls.TLSSocket) => {
      sockets.add(socket);
      alpn.push(socket.alpnProtocol);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;

    const guardAnswers: string[] = [];
    const realConnect = tls.connect;
    vi.spyOn(tls, 'connect').mockImplementation(((options: tls.ConnectionOptions) => {
      const guardLookup = options.lookup as LookupFunction;
      const toLocal: LookupFunction = (hostname, lookupOptions, callback) =>
        guardLookup(hostname, lookupOptions, (err, address, family) => {
          if (err) return callback(err, '');
          const answers = Array.isArray(address) ? address : [{ address, family }];
          guardAnswers.push(...answers.map((a) => String(a.address)));
          if (Array.isArray(address)) return callback(null, [{ address: '127.0.0.1', family: 4 }]);
          return callback(null, '127.0.0.1', 4);
        });
      return realConnect({ ...options, port, lookup: toLocal, rejectUnauthorized: false });
    }) as typeof tls.connect);

    try {
      resolveTo(HOST, PUBLIC_V4);
      const res = await safeOutboundFetch(`https://${HOST}/`);
      expect(await res.text()).toBe('ok');
      expect(guardAnswers).toEqual([PUBLIC_V4]); // the guard's own lookup ran and passed
      expect(alpn).toEqual(['http/1.1']);
      expect(httpVersions).toEqual(['1.1']);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
