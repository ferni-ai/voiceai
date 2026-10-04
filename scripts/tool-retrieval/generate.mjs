// Generate user requests per tool with Gemini (Vertex).
//
// usage: node scripts/tool-retrieval/generate.mjs <manual|test> [--tools missing.json] [--per 6]
//   manual: requests to index, for tools that have no examples (gemini-3.5-flash)
//   test:   held-out spoken requests for every tool, written by a different model
//           and prompt so the test does not share the index's phrasing
// Output: scripts/tool-retrieval/out/generated-<mode>.json  [{query, tool}]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const mode = process.argv[2];
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const OUT = 'scripts/tool-retrieval/out';
const catalogue = JSON.parse(readFileSync(`${OUT}/tools.json`, 'utf8'));
const only = arg('tools') ? new Set(JSON.parse(readFileSync(arg('tools'), 'utf8'))) : null;
const tools = catalogue.filter((t) => !only || only.has(t.name));
const per = Number(arg('per', mode === 'manual' ? 6 : 2));
const model = mode === 'manual' ? 'gemini-3.5-flash' : 'gemini-3-flash-preview';
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
  location: 'global',
});

const PROMPTS = {
  manual: `You write realistic things people say to Ferni, a warm voice companion on a phone call, when they need a specific tool.
For each tool below write ${per} different requests that need exactly that tool:
- 2 direct requests, the way people talk ("can you set a timer for ten minutes")
- 2 casual spoken ones with the need implied or wrapped in context ("ugh, the pasta needs ten minutes, can you keep track")
- 1 very short one (2-4 words)
- 1 that says why they need it
Spoken English, no quotes around phrases, no tool names or technical words. Only requests this tool would handle, not its neighbours.`,
  test: `Imagine real people on a phone call with a friendly AI companion. For each capability below, write ${per} things a person might say when they want it, in their own words: rambling, indirect, or mid-thought is fine, the way people actually talk. Never name the feature. Each must genuinely need this capability.`,
};

const outFile = `${OUT}/generated-${mode}.json`;
const done = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
const have = new Set(done.map((r) => r.tool));
const todo = tools.filter((t) => !have.has(t.name));
const batches = [];
for (let i = 0; i < todo.length; i += 8) batches.push(todo.slice(i, i + 8));

const describe = (t) => {
  const params = Object.keys(t.parameters?.properties ?? {}).join(', ');
  return `- ${t.name} [${t.domain}]: ${t.description.slice(0, 400)}${params ? ` (inputs: ${params})` : ''}`;
};

async function run(batch) {
  const prompt = `${PROMPTS[mode]}\n\nTools:\n${batch.map(describe).join('\n')}\n\nReturn JSON: {"items":[{"tool":"<name>","requests":["..."]}]}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.9,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const items = JSON.parse(r.text).items ?? [];
      const names = new Set(batch.map((t) => t.name));
      return items
        .filter((it) => names.has(it.tool))
        .flatMap((it) => (it.requests ?? []).map((query) => ({ query, tool: it.tool })));
    } catch (e) {
      if (attempt === 2)
        console.error(
          `batch failed: ${batch.map((t) => t.name).join(',')}: ${String(e).slice(0, 120)}`
        );
    }
  }
  return [];
}

let next = 0;
const results = [...done];
async function worker() {
  while (next < batches.length) {
    const b = batches[next++];
    results.push(...(await run(b)));
    if (next % 10 === 0) {
      writeFileSync(outFile, JSON.stringify(results, null, 1));
      console.error(`${next}/${batches.length} batches`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(
  JSON.stringify({
    mode,
    model,
    tools: new Set(results.map((r) => r.tool)).size,
    requests: results.length,
  })
);
