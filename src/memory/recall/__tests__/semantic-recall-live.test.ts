/**
 * Semantic recall against the real embedding model. Opt-in, needs Google
 * credentials (ADC) and GOOGLE_CLOUD_PROJECT:
 *   SEMANTIC_RECALL_LIVE=1 GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm vitest run semantic-recall-live
 */
import { describe, expect, it } from 'vitest';
import { createSemanticIndex } from '../semantic-recall.js';

const live = Boolean(process.env.SEMANTIC_RECALL_LIVE && process.env.GOOGLE_CLOUD_PROJECT);

/** One caller's memory, in the text the recall hook embeds. */
const ITEMS = [
  ['flights', 'Sam travel plan: needs to book flights to Lisbon for the wedding'],
  ['biscuit', 'Biscuit breed: golden retriever'],
  ['job', 'Sam job: software engineer at a fintech'],
  ['pottery', 'Sam hobby: pottery class on Thursdays'],
  ['wedding', 'sister event: getting married in Lisbon in November'],
  ['deadline', 'manager decision: moved the deadline to Friday'],
  ['ramen', 'Sam favorite food: spicy ramen'],
  ['mom', 'mom health: recovering from knee surgery'],
  ['denver', 'Sam home: lives in Denver'],
  ['marathon', 'Sam goal: run a half marathon in spring'],
  ['dentist', 'Sam appointment: dentist on Wednesday'],
  ['car', 'car maintenance: needs an oil change'],
  ['book', 'Ferni has been reading an old history book about the silk road'],
  ['thread', 'Ask how the pottery class went'],
].map(([id, text]) => ({ id, text }));

async function search(query: string): Promise<Map<string, number>> {
  const index = createSemanticIndex(ITEMS);
  await index.ready;
  index.observe(query);
  for (let i = 0; i < 100 && index.matches().size === 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return index.matches();
}

describe.skipIf(!live)('semantic recall with Vertex embeddings (live)', () => {
  it.each([
    ["how's my mom doing these days", 'mom'],
    ["what's my dog like again", 'biscuit'],
    ['what were you reading again', 'book'],
  ])('"%s" finds %s first', async (query, id) => {
    const found = await search(query);
    console.log(query, Object.fromEntries([...found].map(([k, v]) => [k, v.toFixed(3)])));
    expect([...found.keys()][0]).toBe(id);
  }, 30_000);

  it('finds nothing for small talk', async () => {
    const found = await search("yeah the weather's been fine I guess");
    console.log('small talk', Object.fromEntries(found));
    expect(found.size).toBe(0);
  }, 30_000);
});
