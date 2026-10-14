/**
 * identity/character.md says Ferni doesn't "offer to listen or tell them
 * you're here for them (you just listen)", and the brand has no streak
 * counting: showing up is noticed, never tallied. The persona content still
 * had "I'm here whenever you need." as a closing line and in the voicemail
 * example, and the rituals doc had "Three days in a row". This walks every
 * string in the Ferni content JSON and fails on those phrases.
 *
 * Whole phrases only: "never use the same sound twice in a row" is an
 * instruction, not a streak count, and passes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONTENT = join(process.cwd(), 'src', 'personas', 'bundles', 'ferni', 'content');

const NUMBER = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirty)';

const BANNED: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'here-when-you-need-me',
    pattern: /\bI(?:'m| am|'ll be| will be) (?:always )?here (?:when|whenever) you need\b/i,
  },
  {
    name: 'streak count',
    pattern: new RegExp(
      `\\b${NUMBER}\\s+(?:days?|weeks?|months?|sessions?|conversations?|check-ins?)\\s+in a row\\b` +
        `|\\b${NUMBER}[- ](?:day|week|month)\\s+streak\\b`,
      'i'
    ),
  },
];

const bannedIn = (text: string): string[] =>
  BANNED.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return jsonFiles(path);
    return e.name.endsWith('.json') ? [path] : [];
  });
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('Ferni persona content: banned phrases', () => {
  it('flags the banned phrases and streak counts, and passes ordinary lines', () => {
    expect(bannedIn("Good talk. I'll be here when you need me.")).toEqual([
      'here-when-you-need-me',
    ]);
    expect(bannedIn("No rush to call back. I'm here whenever you need.")).toEqual([
      'here-when-you-need-me',
    ]);
    expect(bannedIn('Three days in a row. Nice consistency.')).toEqual(['streak count']);
    expect(bannedIn('You hit a 7-day streak!')).toEqual(['streak count']);
    expect(bannedIn("You've been showing up for yourself lately.")).toEqual([]);
    expect(bannedIn('Never use the same sound twice in a row.')).toEqual([]);
    expect(bannedIn('Talk soon.')).toEqual([]);
  });

  it('no Ferni content string uses a banned phrase', () => {
    const files = jsonFiles(CONTENT);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      strings(JSON.parse(readFileSync(file, 'utf8')))
        .filter((s) => bannedIn(s).length > 0)
        .map((s) => `${relative(CONTENT, file)}: [${bannedIn(s).join(', ')}] ${s}`)
    );
    expect(offenders).toEqual([]);
  });
});
