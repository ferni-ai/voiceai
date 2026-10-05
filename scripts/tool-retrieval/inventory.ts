/**
 * List every registered tool as the LLM sees it: name, domain, description,
 * JSON-schema parameters and an estimated token cost.
 *
 * usage: npx tsx scripts/tool-retrieval/inventory.ts [out.json]
 * Default output: scripts/tool-retrieval/out/tools.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { llm } from '@livekit/agents';
import { autoRegisterAllDomains, initializeToolRegistry } from '../../src/tools/registry/loader.js';
import { toolRegistry } from '../../src/tools/registry/index.js';
import type { ToolContext, ToolDomain } from '../../src/tools/registry/types.js';
import { ALL_TOOL_DOMAINS } from '../../src/tools/registry/types.js';

const out = process.argv[2] ?? 'scripts/tool-retrieval/out/tools.json';

// A catalogue, not a session: report every service as present so no tool is
// skipped for missing credentials. Nothing here executes a tool.
const services = { has: () => true, get: () => undefined };

await autoRegisterAllDomains();
await initializeToolRegistry({ lazyLoading: false });
const defs = toolRegistry.getAll();
const ctx = {
  userId: 'catalogue',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services,
} as unknown as ToolContext;
const built = toolRegistry.buildToolSet({ domains: [...ALL_TOOL_DOMAINS] as ToolDomain[] }, ctx);

const tools = [];
const failed: string[] = [];
for (const def of defs) {
  const tool = (built.tools as Record<string, { description?: string; parameters?: unknown }>)[
    def.id
  ];
  if (!tool) {
    failed.push(def.id);
    continue;
  }
  let parameters: unknown = null;
  try {
    parameters = tool.parameters ? llm.toJsonSchema(tool.parameters as never) : null;
  } catch {
    parameters = null;
  }
  const declaration = JSON.stringify({
    name: def.id,
    description: tool.description ?? '',
    parameters,
  });
  tools.push({
    name: def.id,
    domain: def.domain,
    additionalDomains: def.additionalDomains ?? [],
    category: def.category ?? null,
    tags: def.tags ?? [],
    description: tool.description ?? '',
    parameters,
    // ~4 characters per token for English + JSON.
    tokens: Math.round(declaration.length / 4),
  });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tools, null, 1));
const total = tools.reduce((a, t) => a + t.tokens, 0);
console.log(
  JSON.stringify({
    registered: defs.length,
    built: tools.length,
    notBuilt: failed.length,
    domains: new Set(tools.map((t) => t.domain)).size,
    totalTokens: total,
    meanTokens: Math.round(total / tools.length),
  })
);
if (failed.length) console.log('not built (first 20):', failed.slice(0, 20).join(', '));
process.exit(0);
