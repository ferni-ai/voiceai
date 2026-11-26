/**
 * Run only by outbound-guard.test.ts, in a vitest of its own: a file that says
 * why it builds a real client, and is not failed for building one.
 */
import { describe, expect, it } from 'vitest';

import { allowOutbound } from '../../outbound-guard.js';

describe.skipIf(process.env.OUTBOUND_GUARD_PROBE !== '1')('probe: a file that says why', () => {
  it('builds a real client that sends nothing', async () => {
    allowOutbound('probe: builds a client to show the opt-out, sends nothing');
    const { OpenAI } = await import('openai');

    expect(new OpenAI({ apiKey: 'k' })).toBeInstanceOf(OpenAI);
  });
});
