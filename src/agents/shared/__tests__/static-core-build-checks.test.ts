/**
 * buildToolsByName checks a tool's domain twice, in the intent manual (before
 * any domain is loaded) and in the registry definition (before it is built).
 * Each check is exercised alone here, with a manual entry that disagrees with
 * the registry.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../tools/retrieval/dense-index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../tools/retrieval/dense-index.js')>();
  return {
    ...real,
    loadIntentManual: () => {
      const manual = real.loadIntentManual();
      return {
        tools: {
          ...manual.tools,
          // The manual says a findable domain; the registry says developer.
          sneakyUtility: { domain: 'simple-utilities', description: 'x', queries: [] },
          // The manual says developer.
          devOnlyTool: { domain: 'developer', description: 'x', queries: [] },
        },
      };
    },
  };
});
vi.mock('../../../tools/registry/loader.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../tools/registry/loader.js')>();
  return { ...real, loadToolDomain: vi.fn(real.loadToolDomain) };
});

const loader = await import('../../../tools/registry/loader.js');
const { toolRegistry } = await import('../../../tools/registry/index.js');
const { buildToolsByName } = await import('../static-core-tools.js');

const CTX = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' };
const define = (id: string) => ({
  id,
  name: id,
  description: `${id} test tool`,
  domain: 'developer' as const,
  create: () => llm.tool({ description: id, parameters: z.object({}), execute: async () => 'ran' }),
});

describe('buildToolsByName domain checks, each alone', () => {
  it('refuses a tool the manual calls findable when the registry says developer', async () => {
    toolRegistry.register(define('sneakyUtility'));
    const spy = vi.spyOn(toolRegistry, 'buildToolSet');
    const built = await buildToolsByName(['sneakyUtility', 'tellJoke'], CTX);
    expect(Object.keys(built)).toEqual(['tellJoke']);
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({
      optional: ['tellJoke'],
      forbidden: ['sneakyUtility'],
    });
  }, 60_000);

  it('never loads the developer domain for a tool the manual places there', async () => {
    vi.mocked(loader.loadToolDomain).mockClear();
    const built = await buildToolsByName(['devOnlyTool', 'tellJoke'], CTX);
    expect(Object.keys(built)).toEqual(['tellJoke']);
    const loaded = vi.mocked(loader.loadToolDomain).mock.calls.map(([domain]) => domain);
    expect(loaded).not.toContain('developer');
  }, 60_000);
});
