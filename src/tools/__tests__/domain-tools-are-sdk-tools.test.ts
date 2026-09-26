/**
 * Contract: every domain tool must be a real @livekit/agents function tool.
 *
 * @livekit/agents 1.5.x rejects any tool that was not built with `llm.tool()`
 * ("tools object entry X must be an anonymous function tool"). The check runs
 * inside the Agent constructor, so ONE malformed tool anywhere in the selected
 * set crashes session creation, and no voice session can start. The routines
 * domain returned plain `{ description, parameters, execute }` objects and did
 * exactly that.
 *
 * This test feeds every domain's created tools through the SDK's own
 * ToolContext, so it fails for the same reason the Agent constructor would.
 */

import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import type { ToolContext, ToolDefinition } from '../registry/types.js';

const domainsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'domains');

const toolCtx = {
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  userId: 'contract-test',
  services: {
    has: () => false,
    get: () => {
      throw new Error('services unavailable in contract test');
    },
    getOptional: () => undefined,
  },
} as unknown as ToolContext;

const domainNames = readdirSync(domainsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(domainsDir, d.name, 'index.ts')))
  .map((d) => d.name)
  .sort();

describe('domain tools are @livekit/agents function tools', () => {
  it('found the tool domains', () => {
    expect(domainNames.length).toBeGreaterThan(100);
  });

  it.each(domainNames)('%s', async (domainName) => {
    const mod = (await import(`../domains/${domainName}/index.ts`)) as {
      definitions?: ToolDefinition[];
    };
    const rejected: string[] = [];
    for (const def of mod.definitions ?? []) {
      let tool: unknown;
      try {
        tool = def.create(toolCtx);
      } catch {
        continue; // create() needing live services is a separate concern
      }
      try {
        new llm.ToolContext({ [def.id]: tool } as never);
      } catch (error) {
        rejected.push(`${def.id}: ${(error as Error).message}`);
      }
    }
    expect(rejected).toEqual([]);
  });
});
