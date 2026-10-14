/** readJsonBodyLimited: a JSON body with a byte cap that holds while it streams. */
import { describe, expect, it } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage } from 'http';
import { BodyTooLargeError, readJsonBodyLimited } from '../bounded-body.js';

function request(): PassThrough & IncomingMessage {
  return new PassThrough() as PassThrough & IncomingMessage;
}

describe('readJsonBodyLimited', () => {
  it('parses a body under the cap', async () => {
    const req = request();
    req.end('{"a":1}');
    expect(await readJsonBodyLimited(req, 100)).toEqual({ a: 1 });
  });

  it('gives {} for an empty body', async () => {
    const req = request();
    req.end();
    expect(await readJsonBodyLimited(req, 100)).toEqual({});
  });

  it('counts bytes, not characters', async () => {
    const body = JSON.stringify({ s: 'éé' }); // 12 bytes, 10 characters
    const fits = request();
    fits.end(body);
    const over = request();
    over.end(body);

    expect(await readJsonBodyLimited(fits, 12)).toEqual({ s: 'éé' });
    await expect(readJsonBodyLimited(over, 11)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('rejects invalid JSON without calling it too large', async () => {
    const req = request();
    req.end('{nope');
    await expect(readJsonBodyLimited(req, 100)).rejects.toThrow('Invalid JSON body');
  });

  it('rejects, rather than hanging, when the stream closes before it ends', async () => {
    const req = request();
    req.write('{"a":');
    const reading = readJsonBodyLimited(req, 100);
    req.destroy();
    await expect(reading).rejects.toThrow('closed before the body ended');
  });
});
