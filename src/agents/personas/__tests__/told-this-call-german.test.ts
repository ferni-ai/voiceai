/**
 * #3604 r2: the German help line is left out of the told note because it names a
 * way to reach help (reachesHelp knows Telefonseelsorge), not because isSafetyLine
 * reads the German article "Die" as the English "die". With isSafetyLine blind to
 * the row, keptTold still drops it.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Line } from '../director-notes.js';
import { isSafetyLine } from '../phrase-loops.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { reachesHelp } from '../../safety/crisis-guard.js';

vi.mock('../phrase-loops.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../phrase-loops.js')>();
  return {
    ...actual,
    isSafetyLine: (line: string) => !line.includes('Telefonseelsorge') && actual.isSafetyLine(line),
  };
});

const GERMAN = 'Die Telefonseelsorge ist rund um die Uhr unter null acht hundert erreichbar.';
const saidThrice = (said: string): Line[] =>
  ['Okay.', 'Alright.', 'Ich höre dich.'].flatMap((lead, i) => [
    { speaker: 'user', text: `Turn ${i}.` },
    { speaker: 'ferni', text: `${lead} ${said}` },
  ]);

describe('the German help line is read as help, not as the word "die" (#3604 r2)', () => {
  it('reachesHelp reads it, and isSafetyLine is blind to it here', () => {
    expect(reachesHelp(GERMAN)).toBe(true);
    expect(isSafetyLine(GERMAN)).toBe(false);
  });

  it('keptTold drops the quote and the name, said in three replies', () => {
    const told = toldThisCall(saidThrice(GERMAN));
    expect(formatTold(told)).toContain(`"${GERMAN}"`); // precondition: main quotes it
    const kept = formatTold(keptTold(told, () => true));
    expect(kept).not.toContain('Telefonseelsorge');
    expect(kept).not.toContain(GERMAN);
  });
});
