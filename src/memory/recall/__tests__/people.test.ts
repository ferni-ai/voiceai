import { describe, expect, it } from 'vitest';
import { formatPeople, peopleOf, recallPeopleEnabled } from '../people.js';
import type { RecallFact } from '../session-recall.js';

const f = (entity: string, key: string, value: string): RecallFact => ({
  entity,
  key,
  value,
  confidence: 0.9,
});

describe('peopleOf', () => {
  // Rows exactly as the deep extractor wrote them in the memory benchmark (2026-10-11).
  it('reads how someone relates to the caller from what the extractor writes', () => {
    expect(
      peopleOf([
        f('Walt', 'spouse of', 'User'),
        f('Joan', 'sister of speaker', "The speaker's sister is named Joan"),
        f('Joan', 'location', 'Tucson'),
        f('Marcus', 'nephew of speaker', 'is the nephew of the speaker'),
        f('Ana', 'girlfriend of the user', 'Ana is the girlfriend of the user.'),
        f('Jules', 'partner', 'Partner of the speaker'),
        f('Dana', 'relation', 'a friend from work'),
        f('User', 'girlfriend', 'Ana'),
      ])
    ).toEqual([
      { name: 'Walt', relation: 'spouse' },
      { name: 'Joan', relation: 'sister' },
      { name: 'Marcus', relation: 'nephew' },
      { name: 'Ana', relation: 'girlfriend' },
      { name: 'Jules', relation: 'partner' },
      { name: 'Dana', relation: 'friend' },
    ]);
  });

  it('turns "Theo | grandparent = User" around: the caller is the grandparent', () => {
    expect(peopleOf([f('Theo', 'grandparent', 'User')])).toEqual([
      { name: 'Theo', relation: 'grandchild' },
    ]);
    expect(peopleOf([f('Lily', 'mother', 'speaker')])).toEqual([
      { name: 'Lily', relation: 'child' },
    ]);
  });

  it('keeps the most specific of several care roles', () => {
    expect(
      peopleOf([
        f('User', 'healthcare provider', 'Dr. Okonkwo'),
        f('Dr. Okonkwo', 'profession', 'physical therapist'),
      ])
    ).toEqual([{ name: 'Dr. Okonkwo', relation: 'physical therapist' }]);
  });

  it('never guesses: other people’s relations, unnamed roles and conflicts are left out', () => {
    expect(
      peopleOf([
        f('Ana', 'pet owned', 'Pepper (cat)'), // Ana's cat, not the caller's
        f('Ana', 'adopted a cat', 'Adopted a gray cat named Pepper'),
        f('Neighbor', 'walks pet', "Walks the speaker's pet during the speaker's long work shifts"),
        f('mom', 'child', 'speaker'), // a role with no name
        f('Mom', 'mother of speaker', 'Lives in Pune'), // capitalised, still a role, not a name
        f('Sam', 'relation', "Ana's brother"), // related to someone else
        f('Rio', 'sister of speaker', 'sister'),
        f('Rio', 'cousin of speaker', 'cousin'), // two answers: neither
        f('Lumen Labs', 'employer', 'Hired the User as a junior developer'),
        f('speaker', 'co-fostering', 'Fostering Turnip the beagle alongside partner Jules'),
      ])
    ).toEqual([]);
  });

  it('does not read "mother" inside "grandmother" or "friend" inside "best friend"', () => {
    expect(
      peopleOf([
        f('June', 'grandmother of speaker', 'grandmother'),
        f('Kit', 'relation', 'best friend since school'),
      ])
    ).toEqual([
      { name: 'June', relation: 'grandmother' },
      { name: 'Kit', relation: 'best friend' },
    ]);
  });
});

describe('formatPeople', () => {
  it('lists who is who, and forbids guessing anyone else', () => {
    const note = formatPeople([
      { name: 'Joan', relation: 'sister' },
      { name: 'Walt', relation: 'spouse' },
    ]);
    expect(note).toContain('People in their life: Joan (sister), Walt (spouse).');
    expect(note).toMatch(/never guess/i);
  });

  it('still forbids guessing when nobody is known', () => {
    const note = formatPeople([]);
    expect(note).not.toContain('People in their life');
    expect(note).toMatch(/never guess how someone is related/i);
  });
});

describe('recallPeopleEnabled', () => {
  it('is off unless RECALL_PEOPLE=on', () => {
    expect(recallPeopleEnabled({})).toBe(false);
    expect(recallPeopleEnabled({ RECALL_PEOPLE: 'on' })).toBe(true);
  });
});
