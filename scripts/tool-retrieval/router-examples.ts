/**
 * Hand-written semantic-router examples, mapped to real LLM tool names.
 * usage: npx tsx scripts/tool-retrieval/router-examples.ts
 * Output: scripts/tool-retrieval/out/router-examples.json [{query, tool}]
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { getAllMappings } from '../../src/tools/semantic-router/domain-bridge/index.js';

const dir = 'src/tools/semantic-router/tool-definitions';
const mappings = getAllMappings();
const rows: Array<{ query: string; tool: string; routerId: string }> = [];
let defs = 0;
let unmapped = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.semantic.ts'))) {
  const mod = (await import(`../../${dir}/${file}`)) as Record<string, unknown>;
  for (const value of Object.values(mod)) {
    const list = Array.isArray(value) ? value : [value];
    for (const d of list as Array<{ id?: string; examples?: unknown[] }>) {
      if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !Array.isArray(d.examples))
        continue;
      defs++;
      const tool = mappings[d.id]?.domainToolId;
      if (!tool) {
        unmapped++;
        continue;
      }
      for (const e of d.examples) {
        const query =
          typeof e === 'string'
            ? e
            : ((e as { text?: string; query?: string })?.text ?? (e as { query?: string })?.query);
        if (query) rows.push({ query, tool, routerId: d.id });
      }
    }
  }
}
const seen = new Set<string>();
const unique = rows.filter(
  (r) => !seen.has(r.query + '|' + r.tool) && seen.add(r.query + '|' + r.tool)
);
writeFileSync('scripts/tool-retrieval/out/router-examples.json', JSON.stringify(unique, null, 1));
console.log(
  JSON.stringify({
    definitions: defs,
    unmapped,
    examples: unique.length,
    tools: new Set(unique.map((r) => r.tool)).size,
  })
);
process.exit(0);
