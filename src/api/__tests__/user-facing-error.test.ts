import type { ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendError } from '../helpers.js';
import { sendUserFacingError } from '../user-facing-error.js';

function capture(): { res: ServerResponse; sent: () => { status: number; body: unknown } } {
  let status = 0;
  let body = '';
  const res = {
    writeHead: (s: number) => {
      status = s;
      return res;
    },
    end: (d: string) => {
      body = d;
    },
  } as unknown as ServerResponse;
  return { res, sent: () => ({ status, body: JSON.parse(body) }) };
}

describe('5xx messages in production', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sendError hides the message on Cloud Run; sendUserFacingError keeps it', () => {
    vi.stubEnv('K_SERVICE', 'ferni-api');
    const masked = capture();
    sendError(masked.res, 'your sign-in is still open', 500);
    expect(masked.sent()).toEqual({ status: 500, body: { error: 'Internal server error' } });

    const kept = capture();
    sendUserFacingError(kept.res, 'your sign-in is still open', 500);
    expect(kept.sent()).toEqual({ status: 500, body: { error: 'your sign-in is still open' } });
  });
});
