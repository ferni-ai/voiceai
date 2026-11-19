/**
 * The UI server's listen host (#3862): a development server stays on loopback, because
 * development trusts the dev-mode admin key and claimed user ids; deployed servers keep
 * listening on every interface.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { uiServerListenHost } from '../listen-host.js';

describe('uiServerListenHost', () => {
  it('defaults a development server to loopback', () => {
    expect(uiServerListenHost({ NODE_ENV: 'development' })).toBe('127.0.0.1');
  });

  it.each([['production'], ['staging'], ['test'], [undefined]])(
    'keeps every interface when NODE_ENV is %s',
    (nodeEnv) => {
      expect(uiServerListenHost({ NODE_ENV: nodeEnv })).toBe('0.0.0.0');
    }
  );

  it('takes UI_SERVER_HOST over either default', () => {
    expect(uiServerListenHost({ NODE_ENV: 'development', UI_SERVER_HOST: '0.0.0.0' })).toBe(
      '0.0.0.0'
    );
    expect(uiServerListenHost({ NODE_ENV: 'production', UI_SERVER_HOST: '::1' })).toBe('::1');
  });

  it('ignores a blank UI_SERVER_HOST', () => {
    expect(uiServerListenHost({ NODE_ENV: 'development', UI_SERVER_HOST: '  ' })).toBe('127.0.0.1');
  });

  it('binds a real development server to loopback only', async () => {
    const server = http.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, uiServerListenHost({ NODE_ENV: 'development' }), resolve);
    });
    try {
      expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('is the host the UI server listens on', () => {
    const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    expect(source).toMatch(/\nconst HOST = uiServerListenHost\(\);\n/);
    expect(source).toMatch(/\nserver\.listen\(PORT, HOST, /);
    expect(source).not.toContain("'0.0.0.0'");
  });
});
