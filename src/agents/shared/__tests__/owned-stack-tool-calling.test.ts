/**
 * Owned-stack tool dispatch and greeting context.
 */

import { describe, expect, it } from 'vitest';
import { executeTool } from '../tool-dispatcher.js';
import { buildOwnedStackContext, buildOwnedStackGreetingContext } from '../owned-stack-context.js';
import type { PersonaConfig } from '../../../personas/types.js';

describe('owned-stack-tool-calling', () => {
  describe('executeTool (getCurrentTime)', () => {
    it('executes getCurrentTime and returns a result', async () => {
      const result = await executeTool(
        { name: 'getCurrentTime', args: {} },
        { sessionId: 'test-owned-stack', personaId: 'ferni' }
      );
      expect(result.success).toBe(true);
      expect(result.fn).toBe('getCurrentTime');
      expect(typeof result.result).toBe('string');
      expect((result.result as string).length).toBeGreaterThan(0);
    });
  });

  describe('buildOwnedStackContext', () => {
    it('includes persona voice rules without JSON {fn,args} instructions', () => {
      const context = buildOwnedStackContext({
        sessionPersona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as PersonaConfig,
      });
      expect(context).toContain('You are Ferni');
      expect(context).toContain('Reply in 1-3 short sentences');
      expect(context).not.toContain('{"fn":');
      expect(context).toContain('playMusic');
      expect(context).toContain('getCurrentTime');
    });

    it('buildOwnedStackGreetingContext returns greeting instruction', () => {
      const context = buildOwnedStackGreetingContext({
        sessionPersona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as PersonaConfig,
      });
      expect(context).toContain('Greet the user warmly');
      expect(context).toContain('Ferni');
      expect(context).toContain('One short sentence');
    });
  });
});
