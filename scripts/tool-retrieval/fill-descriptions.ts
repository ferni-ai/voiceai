/**
 * Write a real description for every tool that has only the generated
 * placeholder ("Executes quickTimer. Call when appropriate based on user
 * request."). 228 of 1,188 tools had one on 2026-09-30: the model picks
 * tools by their descriptions, so these were close to invisible.
 *
 * Grounded in what the tool takes (its parameters), its definition's own
 * name/summary, and example requests routed to it (the intent manual). The
 * writer is told to describe nothing the evidence doesn't show.
 *
 * usage: npx tsx scripts/tool-retrieval/fill-descriptions.ts [out.json]
 * Writes { toolId: description } to out (default out/filled-descriptions.json);
 * merge into src/tools/config/tool-descriptions.json after review.
 */
import { writeFileSync } from 'node:fs';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { llm } from '@livekit/agents';
import { autoRegisterAllDomains, initializeToolRegistry } from '../../src/tools/registry/loader.js';
import { toolRegistry } from '../../src/tools/registry/index.js';
import type { ToolContext, ToolDomain } from '../../src/tools/registry/types.js';
import { ALL_TOOL_DOMAINS } from '../../src/tools/registry/types.js';
import { loadIntentManual } from '../../src/tools/retrieval/dense-index.js';

const out = process.argv[2] ?? 'scripts/tool-retrieval/out/filled-descriptions.json';
const PLACEHOLDER = /^Executes \w+\. Call when appropriate/;

await autoRegisterAllDomains();
await initializeToolRegistry({ lazyLoading: false });
const ctx = {
  userId: 'catalogue',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => true, get: () => undefined },
} as unknown as ToolContext;
const built = toolRegistry.buildToolSet({ domains: [...ALL_TOOL_DOMAINS] as ToolDomain[] }, ctx);
const tools = built.tools as Record<string, llm.FunctionTool>;
const manual = loadIntentManual();
const genai = new GoogleGenAI({ vertexai: true, project: 'johnb-2025', location: 'global' });

const todo = toolRegistry
  .getAll()
  .filter((def) => PLACEHOLDER.test(tools[def.id]?.description ?? ''));

async function write(def: (typeof todo)[number]): Promise<string | null> {
  const params = JSON.stringify(llm.toJsonSchema(tools[def.id].parameters, false)).slice(0, 1200);
  const examples = (manual.tools[def.id]?.queries ?? []).slice(0, 8);
  const prompt = `Write the description a voice assistant's language model will read to decide when to call this tool.

Tool id: ${def.id}
Domain: ${def.domain}
Its definition says: ${def.name}${def.description ? ` - ${def.description}` : ''}
Parameters (JSON schema): ${params}
Things users said that should reach this tool:
${examples.map((e) => `- ${e}`).join('\n') || '- (none recorded)'}

Rules:
- One or two plain sentences, at most 220 characters.
- Say what it does and when to use it ("Use when the user ..."), from the evidence above only. Do not invent capabilities, services or data it isn't shown to have.
- No marketing words ("superhuman", "powerful"), no "this tool".
Return JSON {"description": "..."}`;
  const r = await genai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const d = (JSON.parse(r.text ?? '{}') as { description?: string }).description?.trim();
  return d && d.length >= 20 && d.length <= 260 ? d : null;
}

const result: Record<string, string> = {};
const failed: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < todo.length) {
      const def = todo[next++];
      try {
        const d = await write(def);
        if (d) result[def.id] = d;
        else failed.push(def.id);
      } catch {
        failed.push(def.id);
      }
      process.stderr.write(`\r${Object.keys(result).length + failed.length}/${todo.length}`);
    }
  })
);
process.stderr.write('\n');
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ placeholders: todo.length, written: Object.keys(result).length, failed }));
process.exit(0);
