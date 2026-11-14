/**
 * Shared by the forget probes (forget-probe-*.test.ts): one forgotten topic, one memory that must
 * survive, and what each registered reader is expected to say back.
 *
 * A probe reads a real reader with "Biscuit" forgotten. It must still say the Denver memory (so a
 * silent reader can't pass), and says Biscuit back only while its registry row (forget-readers.ts)
 * leaks: `none` always, `flag` with FORGET_EVERY_READER off. Fixing a reader means changing its
 * row, and the probe then holds it to zero.
 */
import { expect } from 'vitest';
import { FORGET_READERS } from './forget-readers.js';

/** The topic the caller asked Ferni to forget (fictional: a dog). */
export const FORGOTTEN = 'Biscuit';
/** Something else the caller said, which every reader must keep saying. */
export const KEPT = 'Denver';

/** How many times the text says the forgotten topic, as a whole word ("Biscuits" too). */
export function surfaces(text: string): number {
  return text.match(/\bbiscuits?\b/giu)?.length ?? 0;
}

/** Whether the registry says this reader still says a forgotten topic back. */
export function leaks(id: string, flagOn: boolean): boolean {
  const row = FORGET_READERS.find((r) => r.id === id);
  if (!row) throw new Error(`no forget reader registered as ${id}`);
  return row.check === 'none' || (row.check === 'flag' && !flagOn);
}

/** The probe's assertion: the kept memory is there, and the forgotten one only if the row leaks. */
export function expectProbe(id: string, said: string, flagOn: boolean): void {
  expect(said, `${id} said nothing it remembers`).toContain(KEPT);
  if (leaks(id, flagOn))
    expect(surfaces(said), `${id} is registered as leaking`).toBeGreaterThan(0);
  else expect(surfaces(said), `${id} said a forgotten topic back`).toBe(0);
}
