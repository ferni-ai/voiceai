/**
 * Run only by outbound-guard.test.ts, in a vitest of its own: a file whose one
 * row passes, and which the setup file's afterAll must fail all the same.
 */
import { describe, expect, it } from 'vitest';

import { warmVertexClient } from '../../../services/llm-utils.js';

describe.skipIf(process.env.OUTBOUND_GUARD_PROBE !== '1')(
  'probe: a file that builds a real client',
  () => {
    it('passes its own row, because production swallows the refusal', async () => {
      await expect(warmVertexClient()).resolves.toBe(false);
    });
  }
);
