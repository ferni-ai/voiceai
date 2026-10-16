/**
 * Live retrieval ranks the intent tools for a caller's words, using the real
 * intent manual (the queries the tools are indexed under). Retrieval only sends a
 * tool the agent holds; loadEssentialDomains is what puts the named ones there.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DenseToolIndex } from '../dense-index.js';
import { fakeEmbedder } from './fake-embedder.js';
import type { IntentManual } from '../tool-retriever.js';

const manual = JSON.parse(
  readFileSync(new URL('../intent-manual.generated.json', import.meta.url), 'utf8')
) as IntentManual;

/** How deep the retrieval pick goes: TurnToolRetrieval ranks CANDIDATES_PER_SLOT x k. */
const PICK_DEPTH = 20;

describe('live retrieval ranks the intent tools for the caller words', () => {
  it.each([
    ['Flights to Denver next Friday', 'searchFlights'],
    ['book a hotel in Denver for next Friday', 'searchHotels'],
    ['find a coffee shop near me open now', 'findRestaurants'],
    ['check this tracking number', 'trackPackage'],
  ])(
    '"%s" puts %s in the pick',
    async (text, tool) => {
      const embedder = fakeEmbedder();
      const index = await DenseToolIndex.build(manual, embedder);
      const [vector] = await embedder.embed([text]);
      const picked = index.search(vector, PICK_DEPTH).map((t) => t.tool);
      const places =
        tool === 'findRestaurants' ? ['findRestaurants', 'searchLocalBusinesses'] : [tool];
      expect(picked.some((name) => places.includes(name))).toBe(true);
    },
    60_000
  );
});
