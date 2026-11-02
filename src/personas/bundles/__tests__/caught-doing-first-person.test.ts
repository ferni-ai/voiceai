/**
 * A persona's caught_doing lines are about the persona's own life.
 *
 * The opening greeting can say "You caught me {caughtDoing}" or "I was just
 * {caughtDoing}" (compositional-greetings.ts), filled from the line the runtime
 * reads in getCaughtDoing() from <bundle>/content/behaviors/quirks.json. A line
 * like "blocking time on your calendar" there sounds as if the persona already
 * acted on the caller's calendar, email or messages before the call began.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Personas whose quirks.json must carry caught_doing; a move or key rename fails here. */
const PERSONAS_WITH_CAUGHT_DOING = [
  'alex-chen',
  'ferni',
  'jordan-taylor',
  'maya-santos',
  'nayan-patel',
  'peter-john',
];

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

function caughtDoingByPersona(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const entry of readdirSync(bundlesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(bundlesDir, entry.name, 'content', 'behaviors', 'quirks.json');
    if (!existsSync(file)) continue;
    const lines = (JSON.parse(readFileSync(file, 'utf8')) as { caught_doing?: unknown })
      .caught_doing;
    if (Array.isArray(lines)) result.set(entry.name, lines as string[]);
  }
  return result;
}

describe('caught_doing lines are first person', () => {
  const byPersona = caughtDoingByPersona();

  it('reads caught_doing for every persona expected to have it', () => {
    for (const persona of PERSONAS_WITH_CAUGHT_DOING) {
      expect(byPersona.get(persona)?.length ?? 0, persona).toBeGreaterThan(0);
    }
    const total = [...byPersona.values()].reduce((sum, lines) => sum + lines.length, 0);
    expect(total).toBeGreaterThanOrEqual(PERSONAS_WITH_CAUGHT_DOING.length);
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
