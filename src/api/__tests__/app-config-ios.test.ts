/**
 * GET /api/app-config/ios: nulls when unset or malformed (never blocks), the
 * configured minimum otherwise, public and cacheable for five minutes.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appConfigIos, handleAppConfigIos, MESSAGE_MAX_CHARS } from '../app-config-ios.js';

describe('appConfigIos', () => {
  it('is null and null when nothing is set', () => {
    expect(appConfigIos({})).toEqual({ minimumBuild: null, message: null });
  });

  it('reads the minimum build and the message', () => {
    expect(
      appConfigIos({ IOS_MIN_BUILD: '1234', IOS_MIN_BUILD_MESSAGE: 'Please update.' })
    ).toEqual({ minimumBuild: 1234, message: 'Please update.' });
    expect(appConfigIos({ IOS_MIN_BUILD: ' 57 ' }).minimumBuild).toBe(57);
  });

  it.each([
    '',
    ' ',
    'abc',
    '12.5',
    '-3',
    '+7',
    '1e3',
    '0x10',
    '12abc',
    '0',
    '00',
    '1234567890',
    'NaN',
    'Infinity',
  ])('reads a malformed IOS_MIN_BUILD (%j) as null', (raw) =>
    expect(appConfigIos({ IOS_MIN_BUILD: raw }).minimumBuild).toBeNull()
  );

  it('keeps the message to one plain line, capped, and null when blank', () => {
    expect(appConfigIos({ IOS_MIN_BUILD_MESSAGE: 'a\n\tb\u0000c' }).message).toBe('a b c');
    expect(appConfigIos({ IOS_MIN_BUILD_MESSAGE: ' \n ' }).message).toBeNull();
    expect(appConfigIos({ IOS_MIN_BUILD_MESSAGE: 'x'.repeat(1000) }).message).toHaveLength(
      MESSAGE_MAX_CHARS
    );
  });

  it('a bad minimum does not take the message with it, and neither blocks the other', () => {
    expect(appConfigIos({ IOS_MIN_BUILD: 'soon', IOS_MIN_BUILD_MESSAGE: 'Hi' })).toEqual({
      minimumBuild: null,
      message: 'Hi',
    });
  });
});

describe('GET /api/app-config/ios', () => {
  let server: Server;
  let base = '';
  let env: Record<string, string | undefined> = {};
  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!handleAppConfigIos(req, res, url.pathname, env)) res.writeHead(404).end();
    });
    await new Promise<void>((r) => {
      server.listen(0, '127.0.0.1', r);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
      })
  );
  beforeEach(() => {
    env = {};
  });

  it('answers nulls with no auth when unset', async () => {
    const res = await fetch(`${base}/api/app-config/ios`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ minimumBuild: null, message: null });
  });

  it('answers the configured values', async () => {
    env = { IOS_MIN_BUILD: '42', IOS_MIN_BUILD_MESSAGE: 'A newer Ferni is out.' };
    const res = await fetch(`${base}/api/app-config/ios`);
    expect(await res.json()).toEqual({ minimumBuild: 42, message: 'A newer Ferni is out.' });
  });

  it('answers null, not an error, for a malformed minimum', async () => {
    env = { IOS_MIN_BUILD: 'twelve' };
    const res = await fetch(`${base}/api/app-config/ios`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ minimumBuild: null, message: null });
  });

  it('is cacheable for five minutes, publicly', async () => {
    const res = await fetch(`${base}/api/app-config/ios`);
    const cache = res.headers.get('cache-control') ?? '';
    expect(cache).toContain('public');
    expect(cache).toContain('max-age=300');
    expect(cache).toContain('s-maxage=300');
  });

  it('answers only GET on that path', async () => {
    expect((await fetch(`${base}/api/app-config/ios`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/api/app-config/android`)).status).toBe(404);
  });
});
