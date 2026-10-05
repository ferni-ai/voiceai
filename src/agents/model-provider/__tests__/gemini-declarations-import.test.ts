/**
 * Importing the cascade must not touch the Google plugin's LLM class.
 *
 * cartesia-cascade is imported by most of the agent graph. When the cached
 * declarations subclass was declared at module scope, `extends google.LLM`
 * ran at import, so every importer failed whenever the plugin (or a test's
 * mock of it) had no LLM export. The class is now built when a cascade LLM is.
 */
import { describe, expect, it, vi } from 'vitest';

// A plugin with no LLM export: any read of google.LLM throws.
vi.mock('@livekit/agents-plugin-google', () => ({}));

describe('gemini-declarations import', () => {
  it('loads the cascade without reading the plugin LLM class', async () => {
    const cascade = await import('../cartesia-cascade.js');
    expect(cascade.CartesiaCascadeProvider).toBeTypeOf('function');
  });

  it('reads the plugin LLM class only when a cached LLM is built', async () => {
    const { createCachedDeclarationsLLM, DeclarationCache } =
      await import('../gemini-declarations.js');
    const cache = new DeclarationCache(() => []);
    expect(() => createCachedDeclarationsLLM({ model: 'gemini-3.5-flash' }, cache)).toThrow(
      /"LLM" export/
    );
  });
});
