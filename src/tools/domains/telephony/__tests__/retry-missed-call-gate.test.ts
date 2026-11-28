/**
 * retryMissedCall (CALL_RETRY_ASKS_FIRST, owner 2026-11-26): one more try at a missed call is
 * scheduled only after the owner's spoken yes to a read-back of who, when (where they are)
 * and why. Driven as the live agent gets it: the telephony definitions registered into a
 * ToolRegistry (register() applies the outbound confirm gate). The offers side is a fake
 * port here; services/outreach/__tests__/call-retry-asks-first.test.ts drives the real one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('livekit-server-sdk', () => ({
  SipClient: class {},
  RoomServiceClient: class {},
  AgentDispatchClient: class {},
}));
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => []),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { ToolRegistry } from '../../../registry/index.js';
import { OUTBOUND_TOOLS } from '../../../registry/outbound-gate.js';
import type { ToolContext } from '../../../registry/types.js';
import { isClearYes } from '../../communication/outreach/consent-words.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { retryCallConfirm, setMissedCallOffersPort } from '../call-retry-tool.js';
import { getTelephonyToolDefinitions } from '../index.js';

// The real read-back's shape (call-retry-offer.ts), errand and all: its " to " is not the person.
const READ_BACK =
  'one more try at Rosa tomorrow around 10 AM where Rosa is, to ask about the cake on Saturday';
const find = vi.fn(async (_userId: string, who: string) =>
  who.toLowerCase() === 'rosa' ? { offerId: 'retry_call-rosa-1', readBack: READ_BACK } : 'none'
);
const ACCEPTED = "Okay, I'll try Rosa again tomorrow around 10 AM Rosa's time.";
const accept = vi.fn(async () => ACCEPTED);

function liveCall() {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    registry,
    call: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('retryMissedCall')!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
    ferni: (text: string) =>
      listeners.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }),
  };
}

beforeEach(() => {
  vi.stubEnv('CALL_RETRY_ASKS_FIRST', 'on');
  vi.stubEnv('OUTBOUND_CONFIRM', '');
  setMissedCallOffersPort({ find, accept });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  setMissedCallOffersPort(undefined);
});

describe('retryMissedCall waits for the owner', () => {
  it('is gated by its own read-back, and listed only with the flag on', () => {
    expect(OUTBOUND_TOOLS.retryMissedCall).toBe(retryCallConfirm);
    expect(getTelephonyToolDefinitions().map((d) => d.id)).toContain('retryMissedCall');
    vi.stubEnv('CALL_RETRY_ASKS_FIRST', 'off');
    expect(getTelephonyToolDefinitions().map((d) => d.id)).not.toContain('retryMissedCall');
  });

  it('reads back who, when and why, and schedules nothing before the yes', async () => {
    const live = liveCall();
    const preview = await live.call({ contactName: 'Rosa' }, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain(READ_BACK);
    expect(accept).not.toHaveBeenCalled();
  });

  it.each(['Yes, try her again.', 'yeah, try her again', 'Yeah, try Rosa again tomorrow.'])(
    '%j is a clear yes to this retry: it schedules exactly the offer read back, once',
    async (yes) => {
      const live = liveCall();
      await live.call({ contactName: 'Rosa' }, 'c1');
      live.caller(yes);
      expect(await live.call({ contactName: 'Rosa' }, 'c2')).toContain(ACCEPTED);
      expect(accept).toHaveBeenCalledTimes(1);
      expect(accept).toHaveBeenCalledWith('user-1', 'retry_call-rosa-1');
    }
  );

  it('Ferni reading the retry back aloud, its "tomorrow" and "10 AM" included, keeps the yes', async () => {
    const live = liveCall();
    await live.call({ contactName: 'Rosa' }, 'c1');
    live.ferni(`Okay: ${READ_BACK}.`);
    live.caller('yeah, try her again');
    expect(await live.call({ contactName: 'Rosa' }, 'c2')).toContain(ACCEPTED);
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('an unrelated yes is not this yes: it asks once, as a retry, and schedules nothing', async () => {
    const live = liveCall();
    await live.call({ contactName: 'Rosa' }, 'c1');
    live.caller('Yeah, try Bob again.');
    const reply = await live.call({ contactName: 'Rosa' }, 'c2');
    expect(reply).toContain('"Just to be sure: try Rosa again tomorrow?"');
    expect(reply).not.toMatch(/send that|call ask/);
    expect(accept).not.toHaveBeenCalled();
  });

  it('"try her again" is a yes only to a retry, never to another call', () => {
    expect(isClearYes('yeah, try her again', ['rosa'], [], true, true)).toBe(true);
    expect(isClearYes('yeah, try her again', ['rosa'], [], true)).toBe(false);
    expect(isClearYes('yeah, try her again tomorrow', ['rosa'], [], true)).toBe(false);
  });

  it('a no schedules nothing, and Ferni says so about the retry', async () => {
    const live = liveCall();
    await live.call({ contactName: 'Rosa' }, 'c1');
    live.caller('No, leave it.');
    expect(await live.call({ contactName: 'Rosa' }, 'c2')).toContain(
      "Okay, I won't try Rosa again."
    );
    expect(accept).not.toHaveBeenCalled();
  });

  it('with no open offer it says so and schedules nothing', async () => {
    expect(await liveCall().call({ contactName: 'Doug' }, 'c1')).toBe('none');
    expect(accept).not.toHaveBeenCalled();
  });
});
