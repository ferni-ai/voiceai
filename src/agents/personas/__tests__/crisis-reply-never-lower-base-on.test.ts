/**
 * The reply never-lower grid, part 2 of 4: every word of each flag on top of every other flag at on.
 * Split from crisis-reply-never-lower.test.ts for CI time; that file's header says what the
 * grid reads, what counts as lowered and what it does not cover.
 */
import { describe, expect, it, vi } from 'vitest';

import { allBut, installGrid, losses, ON_TOP_ON } from './crisis-reply-never-lower.grid.js';

// The model client is replaced with none, as on a machine with no model key, so the grid reads
// the same where a key is set. A vi.mock factory is per file, so each grid file carries this.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => {
  const { reached, STUBBED_CLIENT } = await import('./crisis-reply-never-lower.reach.js');
  const getGeminiClient = async (): Promise<null> => ((reached['model clients'] += 1), null);
  return {
    ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
    getGeminiClient: Object.assign(getGeminiClient, { [STUBBED_CLIENT]: true }),
  };
});
installGrid();

describe('no flag lowers what a caller in crisis hears', () => {
  it.each(ON_TOP_ON)(
    '%s=%s on top of every other flag set to %s lowers no reply',
    async (name, _label, base, word) => {
      const others = allBut(name, base);
      // Every flag at the same word is one reading for all of them: that one is kept.
      expect(await losses(others, { ...others, [name]: word }, word === base)).toEqual([]);
    }
  );
});
