/**
 * Which facts already in a caller's life ledger aren't Ferni's life, by the
 * same checks FERNI_SELF_MEMORY applies when a fact is saved: jokes and
 * remarks about the call, the caller's own people and pets, and what his
 * biography rules out. Used by scripts/retract-ledger-facts.ts, which reports
 * by default and marks them retracted only with --apply.
 *
 * @module agents/personas/ledger-retraction
 */

import { consistentWithBiography, lifeFactsOnly, notTheCallers } from './life-ledger.js';

export interface StoredFact {
  id: string;
  fact: string;
}

export type RetractionReason = 'not-his-life' | 'callers' | 'biography';

export interface Retraction extends StoredFact {
  reason: RetractionReason;
}

/** Checked in chunks so one model answer never has to number hundreds of facts. */
const CHUNK = 40;

export async function planRetractions(
  facts: StoredFact[],
  callerNames: string[],
  biography: string,
  personaName = 'Ferni',
  ask?: (system: string, input: string) => Promise<string>
): Promise<Retraction[]> {
  const out: Retraction[] = [];
  const life = new Set(lifeFactsOnly(facts.map((f) => f.fact)));
  const mine = new Set(notTheCallers([...life], callerNames, personaName));
  const left: StoredFact[] = [];
  for (const f of facts) {
    if (!life.has(f.fact)) out.push({ ...f, reason: 'not-his-life' });
    else if (!mine.has(f.fact)) out.push({ ...f, reason: 'callers' });
    else left.push(f);
  }
  for (let i = 0; i < left.length; i += CHUNK) {
    const chunk = left.slice(i, i + CHUNK);
    const kept = new Set(
      await consistentWithBiography(personaName, chunk.map((f) => f.fact), biography, ask)
    );
    for (const f of chunk) if (!kept.has(f.fact)) out.push({ ...f, reason: 'biography' });
  }
  return out;
}
