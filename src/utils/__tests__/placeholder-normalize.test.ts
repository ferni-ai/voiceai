/**
 * PRIVACY: a placeholder hidden by an invisible or look-alike character is still
 * a placeholder. '​unknown' (a zero-width space first) used to pass as a
 * member id, so callerIdFor used it as given and every caller who sent it shared
 * one bucket again. Ids are now compared NFKC-normalised, with Unicode format
 * characters (Cf: zero-width space/joiners, BOM, soft hyphen) dropped, trimmed and
 * lower-cased. A bare 'anon:' or 'onbehalf:' (a prefix with no id) is a
 * placeholder in isSharedPlaceholderId, as it already was in callerIdFor.
 */
import { describe, expect, it } from 'vitest';
import { isSharedPlaceholderId, namesNoAccount } from '../synthetic-user.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { callerIdFor } from '../../services/identity/call-caller-id.js';

const disguised: Array<[string, string]> = [
  ['zero-width space before', '​unknown'],
  ['zero-width space inside', 'unk​nown'],
  ['zero-width joiner', 'anony‍mous'],
  ['word joiner', '⁠anonymous'],
  ['BOM', '﻿unknown'],
  ['soft hyphen', 'un­known'],
  ['NBSP padding', ' unknown '],
  ['ideographic space padding', '　anonymous'],
  ['full-width', 'ｕｎｋｎｏｗｎ'], // ｕｎｋｎｏｗｎ
  ['full-width upper case', 'ＡＮＯＮＹＭＯＵＳ'], // ＡＮＯＮＹＭＯＵＳ
  ['bare anon:', 'anon:'],
  ['bare anon: padded and upper case', ' ANON: '],
  ['bare anon: with a zero-width space', 'anon:​'],
  ['bare onbehalf:', 'onbehalf:'],
];

describe.each(disguised)('%s', (_name, id) => {
  it('is a shared placeholder, names no account, and is not a member', () => {
    expect(isSharedPlaceholderId(id)).toBe(true);
    expect(namesNoAccount(id)).toBe(true);
    expect(isMemberIdentity(id)).toBe(false);
  });

  it('callerIdFor replaces it with an anon: id of this session', () => {
    const session = `session-AJ_norm${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
    const caller = callerIdFor(id, session);
    expect(caller).toMatch(/^anon:./);
    expect(caller).not.toBe(id);
    expect(callerIdFor(undefined, session)).toBe(caller); // one bucket per caller, not per spelling
  });
});

describe('real ids are untouched', () => {
  it('a member stays a member, used as given', () => {
    for (const id of ['uid-abc123', 'phone:+15551234567', 'auth:google:1234']) {
      expect(isSharedPlaceholderId(id)).toBe(false);
      expect(isMemberIdentity(id)).toBe(true);
      expect(callerIdFor(id, 'session-AJ_m-1761200000000')).toBe(id);
    }
  });

  it('a minted anon: id with a body is no member, not shared, and used as given', () => {
    expect(isSharedPlaceholderId('anon:a1b2c3')).toBe(false);
    expect(isMemberIdentity('anon:a1b2c3')).toBe(false);
    expect(callerIdFor('anon:a1b2c3', 'session-AJ_a-1761200000000')).toBe('anon:a1b2c3');
  });
});

describe('all four predicates agree on every spelling (one normalisation, synthetic-user.ts)', () => {
  const disguises: Array<[string, (id: string) => string]> = [
    ['as is', (id) => id],
    ['upper case, padded', (id) => ` ${id.toUpperCase()} `],
    ['zero-width space first', (id) => `​${id}`],
    ['zero-width space inside', (id) => `${id.slice(0, 2)}​${id.slice(2)}`],
    ['BOM', (id) => `﻿${id}`],
    ['NBSP padding', (id) => ` ${id} `],
    [
      'full-width',
      (id) => id.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
    ],
  ];
  type Kind = 'placeholder' | 'minted' | 'member';
  const bases: Array<[string, Kind]> = [
    ['unknown', 'placeholder'],
    ['anonymous', 'placeholder'],
    ['anon', 'placeholder'],
    ['anon:', 'placeholder'],
    ['onbehalf:', 'placeholder'],
    ['anon:a1b2c3', 'minted'],
    ['uid-abc123', 'member'],
  ];
  const expected: Record<
    Kind,
    { shared: boolean; noAccount: boolean; member: boolean; replaced: boolean }
  > = {
    placeholder: { shared: true, noAccount: true, member: false, replaced: true },
    minted: { shared: false, noAccount: true, member: false, replaced: false },
    member: { shared: false, noAccount: false, member: true, replaced: false },
  };
  const rows = bases.flatMap(([base, kind]) =>
    disguises.map(([how, disguise]) => [`${base} (${how})`, disguise(base), kind] as const)
  );

  it.each(rows)('%s', (_label, id, kind) => {
    const session = `session-AJ_tbl${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
    expect({
      shared: isSharedPlaceholderId(id),
      noAccount: namesNoAccount(id),
      member: isMemberIdentity(id),
      // treated as no id: it gets the same anon: id the session gives a caller with none
      replaced: callerIdFor(id, session) === callerIdFor(undefined, session),
    }).toEqual(expected[kind]);
  });
});
