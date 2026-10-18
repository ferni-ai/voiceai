import { describe, expect, it } from 'vitest';
import { canonicalEmail, isOwnerEmail, ownerEmail } from '../owner-email.js';

// A made-up address: the real one is a secret (OWNER_EMAIL) and never in this repo.
const env: NodeJS.ProcessEnv = { OWNER_EMAIL: 'Pat.Example@gmail.com' };
const unset: NodeJS.ProcessEnv = {};

describe('owner email', () => {
  it('reads OWNER_EMAIL, and is undefined when unset or blank', () => {
    expect(ownerEmail(env)).toBe('Pat.Example@gmail.com');
    expect(ownerEmail(unset)).toBeUndefined();
    expect(ownerEmail({ OWNER_EMAIL: '  ' })).toBeUndefined();
  });

  it('matches the owner with or without Gmail dots, in any case', () => {
    expect(isOwnerEmail('pat.example@gmail.com', env)).toBe(true);
    expect(isOwnerEmail('patexample@gmail.com', env)).toBe(true);
    expect(isOwnerEmail('PATEXAMPLE@googlemail.com', env)).toBe(true);
  });

  it('does not match anyone else', () => {
    expect(isOwnerEmail('pat.example2@gmail.com', env)).toBe(false);
    expect(isOwnerEmail('pat.example@example.com', env)).toBe(false);
    expect(isOwnerEmail(undefined, env)).toBe(false);
  });

  it('matches nobody when OWNER_EMAIL is unset (fails closed)', () => {
    expect(isOwnerEmail('pat.example@gmail.com', unset)).toBe(false);
    expect(isOwnerEmail('', unset)).toBe(false);
  });

  it('keeps dots for non-Gmail domains', () => {
    expect(canonicalEmail('A.B@Example.com')).toBe('a.b@example.com');
    expect(canonicalEmail('a.b@gmail.com')).toBe('ab@gmail.com');
  });
});
