/**
 * Run only by outbound-guard.test.ts, in a vitest of its own: the control. It
 * loads the same production module and builds no client.
 */
import { describe, expect, it } from 'vitest';

import * as llm from '../../../services/llm-utils.js';
import { PROJECT_ID_VARS } from '../../gcp-test-guard.js';
import { MODEL_KEY_VARS } from '../../outbound-guard.js';

describe.skipIf(process.env.OUTBOUND_GUARD_PROBE !== '1')('probe: a file that builds none', () => {
  it('loads the model helper without building a client', () => {
    expect(typeof llm.warmVertexClient).toBe('function');
  });

  it('sees no provider key and no project id, though the shell that started it holds both', () => {
    const seen = [...MODEL_KEY_VARS, ...PROJECT_ID_VARS].filter((name) => name in process.env);

    expect(seen).toEqual([]);
  });
});
