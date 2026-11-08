/**
 * A persona's caught_doing lines are about the persona's own life.
 *
 * The opening greeting can say "You caught me {caughtDoing}" or "I was just
 * {caughtDoing}" (compositional-greetings.ts, alive-entrances.ts), filled by
 * BundleRuntimeEngine.getCaughtDoing(), whose only source is the caught_doing
 * array in <bundle>/content/behaviors/quirks.json. A line like "blocking time on
 * your calendar" there sounds as if the persona already acted on the caller's
 * calendar, email or messages before the call began.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Personas whose quirks.json must carry a non-empty caught_doing. */
const PERSONAS_WITH_CAUGHT_DOING = [
  'alex-chen',
  'ferni',
  'jordan-taylor',
  'maya-santos',
  'nayan-patel',
  'peter-john',
];

/** Personas with no caught_doing today, so getCaughtDoing() returns null for them. */
const PERSONAS_WITHOUT_CAUGHT_DOING: Record<string, 'no quirks.json' | 'no caught_doing key'> = {
  'joel-dickson': 'no caught_doing key',
  'john-bogle': 'no quirks.json',
  'peter-lynch': 'no quirks.json',
};

const SECOND_PERSON = /\byour?\b/i;
const CALLERS_ACCOUNTS = /\byour\s+(calendar|email|inbox|texts|account)\b/i;

/**
 * Existing lines that trip the guard but don't speak about the caller's
 * accounts. Left as they are pending a persona-content review; an entry whose
 * line no longer exists fails the last test, so this list can only shrink.
 */
const PENDING_REVIEW: Record<string, string[]> = {
  'alex-chen': ["watching You've Got Mail. Again. Don't ask."],
  ferni: [
    'stretching my back. Turns out sitting all day catches up to you.',
    'writing down a random thought. You know how it is.',
    're-reading an old email. Sometimes you find gold.',
  ],
  'maya-santos': ["texting Daniel a random 'I love you.' Relationship maintenance, baby."],
};

function quirksPath(persona: string): string {
  return join(bundlesDir, persona, 'content', 'behaviors', 'quirks.json');
}

/** Bundle directories that hold a persona (they carry a persona.manifest.json). */
function personaDirs(): string[] {
  return readdirSync(bundlesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(bundlesDir, e.name, 'persona.manifest.json')))
    .map((e) => e.name)
    .sort();
}

/** caught_doing as getCaughtDoing() would see it: undefined when the file or key is missing. */
function readCaughtDoing(persona: string): unknown {
  const file = quirksPath(persona);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, 'utf8')) as { caught_doing?: unknown }).caught_doing;
}

function caughtDoingByPersona(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const persona of personaDirs()) {
    const lines = readCaughtDoing(persona);
    if (Array.isArray(lines)) result.set(persona, lines as string[]);
  }
  return result;
}

describe('caught_doing lines are first person', () => {
  const byPersona = caughtDoingByPersona();

  it('accounts for every persona directory', () => {
    expect(personaDirs()).toEqual(
      [...PERSONAS_WITH_CAUGHT_DOING, ...Object.keys(PERSONAS_WITHOUT_CAUGHT_DOING)].sort()
    );
  });

  it('reads a non-empty caught_doing from quirks.json for each persona expected to have one', () => {
    for (const persona of PERSONAS_WITH_CAUGHT_DOING) {
      expect(existsSync(quirksPath(persona)), `${persona}: quirks.json`).toBe(true);
      expect(byPersona.get(persona)?.length ?? 0, `${persona}: caught_doing`).toBeGreaterThan(0);
    }
    const total = [...byPersona.values()].reduce((sum, lines) => sum + lines.length, 0);
    expect(byPersona.size).toBe(PERSONAS_WITH_CAUGHT_DOING.length);
    expect(total).toBeGreaterThan(0);
  });

  it('lists the personas without caught_doing accurately', () => {
    for (const [persona, reason] of Object.entries(PERSONAS_WITHOUT_CAUGHT_DOING)) {
      expect(existsSync(quirksPath(persona)), `${persona}: ${reason}`).toBe(
        reason === 'no caught_doing key'
      );
      expect(readCaughtDoing(persona), `${persona}: ${reason}`).toBeUndefined();
    }
  });

  it('never addresses the caller or their calendar, email, inbox, texts or account', () => {
    const offending: string[] = [];
    for (const [persona, lines] of byPersona) {
      const pending = PENDING_REVIEW[persona] ?? [];
      for (const line of lines) {
        if (CALLERS_ACCOUNTS.test(line) || (SECOND_PERSON.test(line) && !pending.includes(line))) {
          offending.push(`${persona}: ${line}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it('lists only lines that still exist as pending review', () => {
    const stale = Object.entries(PENDING_REVIEW).flatMap(([persona, lines]) =>
      lines
        .filter((line) => !byPersona.get(persona)?.includes(line))
        .map((line) => `${persona}: ${line}`)
    );
    expect(stale).toEqual([]);
  });
});
