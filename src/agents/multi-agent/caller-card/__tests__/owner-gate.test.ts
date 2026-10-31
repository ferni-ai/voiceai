/**
 * The card's owner gate: the one recent texts uses (ownerProvenOnLine, registered through
 * recent-texts-awareness.ts). A phone caller matched to a member by caller ID alone (which can
 * be spoofed) gets no card until the owner is proven, and a call Ferni placed (outbound or on a
 * member's behalf) never gets one. Both are checked before any read or the shared build.
 * Ports are counting fakes; ids are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const outbound = vi.hoisted(() => new Set<string>());
vi.mock('../../../shared/outbound-opener.js', async (original) => ({
  ...(await original<typeof import('../../../shared/outbound-opener.js')>()),
  outboundPartiesFor: (sessionId: string) => (outbound.has(sessionId) ? {} : undefined),
}));

const { callerCardText } = await import('../index.js');
const { registerRecentTextsOwnerCheck } = await import('../../recent-texts-awareness.js');

const proven = new Set<string>();
const reads = { home: 0, forgotten: 0, minorCare: 0 };
const ports = {
  home: async () => {
    reads.home++;
    return { place: 'Maplewood', source: 'preferences' as const };
  },
  forgotten: async () => {
    reads.forgotten++;
    return [];
  },
  minorCare: async () => {
    reads.minorCare++;
    return false;
  },
};
let seq = 0;
const session = () => `card-owner-${++seq}`;
const card = (sessionId: string) =>
  callerCardText(sessionId, { userId: 'riley-test', userProfile: null }, true, ports);

beforeEach(() => {
  vi.stubEnv('CALLER_CARD', 'on');
  registerRecentTextsOwnerCheck((sessionId, phoneCall) => phoneCall && proven.has(sessionId));
  Object.assign(reads, { home: 0, forgotten: 0, minorCare: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe('callerCardText: the owner must be proven on the line', () => {
  it('a phone caller matched only by caller ID: no card, nothing read', async () => {
    expect(await card(session())).toBeNull();
    expect(reads).toEqual({ home: 0, forgotten: 0, minorCare: 0 });
  });

  it('the same session once the owner is proven: the card', async () => {
    const s = session();
    expect(await card(s)).toBeNull();
    proven.add(s);
    expect(await card(s)).toContain('- Home: Maplewood.');
    expect(reads.home).toBe(1);
  });

  it('a call Ferni placed (outbound parties set): no card, nothing read, even if proven', async () => {
    const s = session();
    proven.add(s);
    outbound.add(s);
    expect(await card(s)).toBeNull();
    expect(reads).toEqual({ home: 0, forgotten: 0, minorCare: 0 });
  });
});
