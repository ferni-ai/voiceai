/**
 * PRIVACY: a placeholder hidden by an invisible or look-alike character is still
 * a placeholder. '\u200bunknown' (a zero-width space first) used to pass as a
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
  ['zero-width space before', '\u200bunknown'],
  ['zero-width space inside', 'unk\u200bnown'],
  ['zero-width joiner', 'anony\u200dmous'],
  ['word joiner', '\u2060anonymous'],
  ['BOM', '\ufeffunknown'],
  ['soft hyphen', 'un\u00adknown'],
  ['NBSP padding', '\u00a0unknown\u00a0'],
  ['ideographic space padding', '\u3000anonymous'],
  ['full-width', 'ｕｎｋｎｏｗｎ'], // ｕｎｋｎｏｗｎ
  ['full-width upper case', 'ＡＮＯＮＹＭＯＵＳ'], // ＡＮＯＮＹＭＯＵＳ
  ['bare anon:', 'anon:'],
  ['bare anon: padded and upper case', ' ANON: '],
  ['bare anon: with a zero-width space', 'anon:\u200b'],
  ['bare onbehalf:', 'onbehalf:'],
  ['Hangul filler inside', 'unk\u3164nown'],
  ['variation selector', 'unknown\ufe0f'],
  ['tab inside', 'unk\tnown'],
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
    ['zero-width space first', (id) => `\u200b${id}`],
    ['zero-width space inside', (id) => `${id.slice(0, 2)}\u200b${id.slice(2)}`],
    ['BOM', (id) => `\ufeff${id}`],
    ['NBSP padding', (id) => `\u00a0${id}\u00a0`],
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

/**
 * The normaliser sits under isMemberIdentity, which ~67 prod files ask. Every real
 * member id shape must come out exactly as main had it: still a member, never shared,
 * and used as given (not lower-cased or stripped). Non-member shapes stay non-members.
 */
describe('member id sweep: no real id changes side', () => {
  type Row = { member: boolean; shared: boolean; asGiven: boolean };
  const MEMBER: Row = { member: true, shared: false, asGiven: true };
  const MINTED: Row = { member: false, shared: false, asGiven: true };
  const shapes: Array<[string, string, Row]> = [
    ['Firebase uid', 'Xk3j9QmP2aR7tY1uV5wZ8bC4dE6f', MEMBER],
    ['Firebase uid, all digits', '0123456789012345678901234567', MEMBER],
    ['phone US', 'phone:+15551234567', MEMBER],
    ['phone UK', 'phone:+447700900123', MEMBER],
    ['auth provider', 'auth:google:109876543210', MEMBER],
    ['device', 'device:9f8e7d6c-5b4a-4321-8fed-cba987654321', MEMBER],
    ['sponsored (family_)', 'family_sp_Ab12Cd34', MEMBER],
    ['sponsored uuid', 'family_3f9c2a1e-8b7d-4c6a-9e5f-1a2b3c4d5e6f', MEMBER],
    ['hyphens', 'user-with-hyphens-01', MEMBER],
    ['underscores', 'user_with_underscores_02', MEMBER],
    ['mixed case', 'UPPER_mixed-Case_123', MEMBER],
    ['voice-eval harness', 'voice-eval-run_42', MEMBER],
    ['e2e harness', 'e2e-user_1', MEMBER],
    ['placeholder lookalike: unknown_caller', 'unknown_caller', MEMBER],
    ['placeholder lookalike: anonymous-123', 'anonymous-123', MEMBER],
    ['placeholder lookalike: anonx', 'anonx', MEMBER],
    ['placeholder lookalike: session-abc', 'session-abc', MEMBER],
    ['anon:<uuid>', 'anon:3f9c2a1e-8b7d-4c6a-9e5f-1a2b3c4d5e6f', MINTED],
    ['onbehalf:<callId>', 'onbehalf:CA1234abcd', MINTED],
  ];

  it.each(shapes)('%s', (_label, id, want) => {
    const session = `session-AJ_sweep${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
    expect({
      member: isMemberIdentity(id),
      shared: isSharedPlaceholderId(id),
      asGiven: callerIdFor(id, session) === id,
    }).toEqual(want);
    expect(namesNoAccount(id)).toBe(!want.member);
  });

  it('2,000 generated Firebase-shaped uids and phone ids are all members, used as given', () => {
    let seed = 2692;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const flipped: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const uid = Array.from({ length: 28 }, () => ALNUM[next() % ALNUM.length]).join('');
      const phone = `phone:+1${String(next() % 10 ** 10).padStart(10, '0')}`;
      for (const id of [uid, phone]) {
        if (!isMemberIdentity(id) || isSharedPlaceholderId(id)) flipped.push(id);
        if (callerIdFor(id, 'session-AJ_gen-1761200000000') !== id) flipped.push(id);
      }
    }
    expect(flipped).toEqual([]);
  });
});
