#!/usr/bin/env npx tsx
/**
 * Compare the live Cartesia pronunciation dictionary with the one the code
 * describes (speech/pronunciation-memory/team-names.ts), or publish the code's
 * as a NEW dictionary.
 *
 *   npx tsx scripts/voice-eval/pronunciation-dict.ts            # diff only (read-only)
 *   npx tsx scripts/voice-eval/pronunciation-dict.ts --create   # new dictionary, prints its id
 *
 * --create never edits the live dictionary: every agent (dev and prod) reads
 * CARTESIA_PRONUNCIATION_DICT_ID, so a change there would reach prod without
 * a deploy. Point dev's secret at the new id, listen, then prod's.
 *
 * Needs CARTESIA_API_KEY; the live id comes from CARTESIA_PRONUNCIATION_DICT_ID
 * or --live <id>.
 */
import 'dotenv/config';

import { CARTESIA_API_VERSION } from '../../src/config/voice-ids.js';
import {
  pronunciationDictItems,
  type PronunciationDictItem,
} from '../../src/speech/pronunciation-memory/team-names.js';

const API = 'https://api.cartesia.ai/pronunciation-dicts';
const key = process.env.CARTESIA_API_KEY;
if (!key) {
  console.error('CARTESIA_API_KEY is not set');
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${key}`,
  'Cartesia-Version': CARTESIA_API_VERSION,
  'Content-Type': 'application/json',
};
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function live(id: string): Promise<PronunciationDictItem[]> {
  const res = await fetch(`${API}/${id}`, { headers });
  if (!res.ok) throw new Error(`GET ${id}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { items: PronunciationDictItem[] }).items;
}

const wanted = pronunciationDictItems();
const liveId = arg('live') ?? process.env.CARTESIA_PRONUNCIATION_DICT_ID;
if (liveId) {
  const current = new Map((await live(liveId)).map((i) => [i.text, i.pronunciation]));
  const added = wanted.filter((i) => !current.has(i.text));
  const changed = wanted.filter(
    (i) => current.has(i.text) && current.get(i.text) !== i.pronunciation
  );
  const dropped = [...current.keys()].filter((t) => !wanted.some((i) => i.text === t));
  console.log(`live ${liveId}: ${current.size} items; code: ${wanted.length}`);
  for (const i of added) console.log(`  + ${i.text}  ${i.pronunciation}`);
  for (const i of changed)
    console.log(`  ~ ${i.text}  ${current.get(i.text)} -> ${i.pronunciation}`);
  for (const t of dropped) console.log(`  - ${t}`);
}

if (process.argv.includes('--create')) {
  const res = await fetch(`${API}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: arg('name') ?? `Ferni names ${new Date().toISOString().slice(0, 10)}`,
      description: 'From src/speech/pronunciation-memory/team-names.ts pronunciationDictItems()',
      items: wanted,
      access: 'private',
    }),
  });
  if (!res.ok) throw new Error(`create: ${res.status} ${await res.text()}`);
  const dict = (await res.json()) as { id: string; item_count?: number };
  console.log(`created ${dict.id} (${dict.item_count ?? wanted.length} items)`);
}
