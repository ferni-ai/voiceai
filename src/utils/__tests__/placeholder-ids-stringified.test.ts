/**
 * #2651: an id built from a missing value ("undefined", "null") and the sign-in-less
 * "guest" are one bucket every such caller shares, like "anon" and "unknown". None
 * may pass as a member, and callerIdFor replaces each with this session's own anon: id.
 */
import { describe, expect, it } from 'vitest';
import { isSharedPlaceholderId, namesNoAccount } from '../synthetic-user.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { callerIdFor } from '../../services/identity/call-caller-id.js';
import { isRealUserId } from '../../tools/registry/user-id-guard.js';

const PLACEHOLDERS: Array<string | undefined | null> = [
  undefined,
  null,
  '',
  'anon',
  'guest',
  'unknown',
  'undefined',
  'null',
  'Guest',
  ' NULL ',
];

describe.each(PLACEHOLDERS.map((id) => [JSON.stringify(id) ?? 'undefined', id] as const))(
  '%s',
  (_name, id) => {
    it('is a shared placeholder, names no account, and is not a member', () => {
      expect(isSharedPlaceholderId(id)).toBe(true);
      expect(namesNoAccount(id)).toBe(true);
      expect(isMemberIdentity(id)).toBe(false);
      expect(isRealUserId(id)).toBe(false);
    });

    it('callerIdFor gives this session its own anon: id', () => {
      const session = `session-AJ_str${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
      const caller = callerIdFor(id, session);
      expect(caller).toMatch(/^anon:./);
      expect(callerIdFor(undefined, session)).toBe(caller);
      expect(callerIdFor(id, session.replace('AJ_str', 'AJ_two'))).not.toBe(caller);
    });
  }
);

describe('ids that only look like these words stay members', () => {
  it.each(['guest-house-owner-1', 'uid-null-1', 'undefinedness'])('%s', (id) => {
    expect(isSharedPlaceholderId(id)).toBe(false);
    expect(isMemberIdentity(id)).toBe(true);
  });
});
