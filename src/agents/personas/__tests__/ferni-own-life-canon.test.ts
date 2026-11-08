/**
 * Ferni's own-life sheet (character-own-life.md, added to the character prompt
 * when FERNI_PERSONA_SLIP_GUARD is on) must not contradict his character sheet.
 *
 * The persona audit (2026-10-17) found it calling a friend "from your early
 * days in finance", a career character.md never gives him: he grew up in
 * Wyoming, spent a decade in Japan, was fired once, and works as a life coach.
 * The life ledger checks what Ferni says about himself against this sheet, so a
 * stray career here becomes a fact he can repeat.
 *
 * Checked: career, age (against canon.json, which self-recall answers from),
 * friends (never a teammate or his late mentor) and places.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const IDENTITY = fileURLToPath(new URL('../../../personas/bundles/ferni/identity', import.meta.url));
const read = (name: string): string => readFileSync(join(IDENTITY, name), 'utf8');

const character = read('character.md');
const ownLife = read('character-own-life.md');
const canon = JSON.parse(read('canon.json')) as { age: string };

/** Lines of work a sheet could give him. */
const CAREERS =
  /\b(finance|financial|banking|banker|Wall Street|investment|trader|lawyer|doctor|nurse|engineer|professor|teacher|military|army|navy|accountant|consultant|startup|software|journalist|chef|pilot)\b/gi;

/** Places a sheet could put him. */
const PLACES =
  /\b(Wyoming|Japan|Tokyo|Kyoto|Osaka|Ireland|Dublin|London|Boston|New York|California|Colorado|Montana|Seattle|Chicago|Texas)\b/g;

const AGE = /You're ([a-z]+-[a-z]+|\d+)\b/g;

const TEAMMATES_AND_MENTOR = /\b(Peter|Maya|Alex|Jordan|Nayan|Tanaka)\b/;

const matches = (text: string, re: RegExp): string[] =>
  [...text.matchAll(re)].map((m) => m[1]!.toLowerCase());

/** "Your closest friends are ...: Lyle, ...; Owen, ...; and Hollis, ..." -> the names. */
function friendNames(text: string): string[] {
  const line = text.split('\n').find((l) => l.startsWith('Your closest friends')) ?? '';
  const list = line.slice(line.indexOf(':') + 1).split('. ')[0]!;
  return list.split(';').map((clause) => clause.trim().replace(/^and /, '').split(/[ ,]/)[0]!);
}

describe("Ferni's own-life sheet agrees with his character sheet", () => {
  it('gives him no career character.md does not', () => {
    const extra = matches(ownLife, CAREERS).filter(
      (career) => !matches(character, CAREERS).includes(career)
    );
    expect(extra).toEqual([]);
    expect(character).toContain('You work as a life coach');
  });

  it('states the age self-recall answers with, and character.md states no other', () => {
    const ages = matches(ownLife, AGE);
    expect(ages).toEqual(matches(canon.age, AGE));
    for (const age of matches(character, AGE)) expect(ages).toContain(age);
  });

  it('names friends who are not his teammates or his late mentor', () => {
    const friends = friendNames(ownLife);
    expect(friends).toEqual(['Lyle', 'Owen', 'Boyd', 'Marty', 'Hollis']);
    for (const name of friends) expect(name).not.toMatch(TEAMMATES_AND_MENTOR);
  });

  it('puts him only in places character.md does', () => {
    const extra = matches(ownLife, PLACES).filter(
      (place) => !matches(character, PLACES).includes(place)
    );
    expect(extra).toEqual([]);
  });
});
