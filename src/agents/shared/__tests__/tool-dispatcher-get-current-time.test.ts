/**
 * Tool dispatch through executeTool.
 */

import { describe, expect, it } from 'vitest';
import { executeTool } from '../tool-dispatcher.js';

describe('tool-dispatcher', () => {
  describe('executeTool (getCurrentTime)', () => {
    it('executes getCurrentTime and returns a result', async () => {
      const result = await executeTool(
        { name: 'getCurrentTime', args: {} },
        { sessionId: 'test-tool-dispatcher', personaId: 'ferni' }
      );
      expect(result.success).toBe(true);
      expect(result.fn).toBe('getCurrentTime');
      expect(typeof result.result).toBe('string');
      expect((result.result as string).length).toBeGreaterThan(0);
    });
  });
});
