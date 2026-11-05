/**
 * MINOR_CARE and the card, through the production minor-care check (wiring.ts) and the real
 * hold state (utils/minor-care.ts, minor-care-shared-hold.ts). A hold record that can't be read
 * means held, and a hold set mid-call (this session, or another of the account's) is seen at
 * the next persona setup. Home and forgotten ports are fakes; ids are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setHoldStore } from '../../../../services/outreach/minor-care-shared-hold.js';
import { bindSessionUser, holdSession, resetMinorCare } from '../../../../utils/minor-care.js';
import { registerRecentTextsOwnerCheck } from '../../recent-texts-awareness.js';
import { callerCardText } from '../index.js';
import { callerCardPorts } from '../wiring.js';

const USER = 'riley-test';
const services = { userId: USER, userProfile: null };
let homeReads = 0;
const ports = {
  ...callerCardPorts(services),
  home: async () => {
    homeReads++;
    return { place: 'Maplewood', source: 'preferences' as const };
  },
  forgotten: async () => [],
};
let seq = 0;
const session = () => `card-minor-${++seq}`;
const card = (sessionId: string) => callerCardText(sessionId, services, false, ports);

beforeEach(() => {
  vi.stubEnv('CALLER_CARD', 'on');
  vi.stubEnv('MINOR_CARE', 'on');
  registerRecentTextsOwnerCheck(() => true);
  resetMinorCare();
  homeReads = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe('the shared hold record (MINOR_CARE_SHARED_HOLD)', () => {
  beforeEach(() => vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on'));

  it('a record that throws on read means held: no card, home never read', async () => {
    setHoldStore({
      heldUntil: () => Promise.reject(new Error('store down')),
      write: async () => undefined,
    });
    expect(await card(session())).toBeNull();
    expect(homeReads).toBe(0);
  });

  it('a readable record with no hold: the card', async () => {
    setHoldStore({ heldUntil: async () => undefined, write: async () => undefined });
    expect(await card(session())).toContain('- Home: Maplewood.');
  });
});

describe('a hold set mid-call is seen at the next persona setup', () => {
  it('another session of the same account held: the cached card is not given again', async () => {
    const s = session();
    expect(await card(s)).toContain('- Home: Maplewood.');
    const other = session();
    bindSessionUser(other, USER);
    holdSession(other);
    expect(await card(s)).toBeNull();
  });

  it('this session held (not yet bound to the account): no card from then on', async () => {
    const s = session();
    expect(await card(s)).toContain('- Home: Maplewood.');
    holdSession(s);
    expect(await card(s)).toBeNull();
  });
});
