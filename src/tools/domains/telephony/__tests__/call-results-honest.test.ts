/**
 * A call tool's result says what actually happened, never "I'm calling them
 * now" when nothing rang (#1415). The model reads these results and the claim
 * check (agents/personas/action-claims.ts) trusts them, so a false one here is
 * a false claim on the call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [
    { id: 'c-sam', name: 'Sam', phone: '(801) 555-0199', relationship: 'brother' },
  ]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));
vi.mock('../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: vi.fn(async () => ({ success: true, callSid: 'CA_test' })),
}));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

import { inviteParticipantTool } from '../../../semantic-router/tool-definitions/group-conversation.semantic.js';
import { definitions as groupDefinitions } from '../../group-conversation/index.js';
import { createVoiceReferralTools } from '../../referral/voice-referral.js';
import { heldCallReply } from '../../../../services/outreach/deferred-calls.js';
import { createCallOnBehalfTool, registerOnBehalfCallInitiator } from '../call-on-behalf.js';

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<unknown> };
const CALLING_NOW = /\b(?:i'm calling|calling \w+ now|right now)\b/i;

afterEach(() => vi.clearAllMocks());

describe('callOnBehalf', () => {
  const run = async () => {
    const tool = createCallOnBehalfTool({
      userId: 'user-1',
      sessionId: 's1',
    } as never) as unknown as Exec;
    return String(
      await tool.execute({ contactQuery: 'my brother', purpose: 'say happy birthday' })
    );
  };

  it('a call held for call hours, its time unknown here, says nothing was dialed', async () => {
    registerOnBehalfCallInitiator(async () => 'deferred_123_abcde');
    const reply = await run();
    expect(reply).toBe(heldCallReply('Sam'));
    expect(reply).toMatch(/^Nothing was dialed yet/);
    expect(reply).not.toMatch(CALLING_NOW);
  });

  it('a placed call may say it is calling', async () => {
    registerOnBehalfCallInitiator(async () => 'onbehalf_123_abcde');
    expect(await run()).toMatch(/calling Sam/);
  });
});

describe('inviteParticipant places no call, and says so', () => {
  it('the domain tool', async () => {
    const def = groupDefinitions.find((d) => d.id === 'inviteParticipant')!;
    const tool = def.create({ userId: 'user-1', agentId: 'ferni' } as never) as unknown as Exec;
    const reply = String(await tool.execute({ phoneNumber: '801-555-0199', name: 'Sam' }));
    expect(reply).toBe("Nothing was dialed: I can't add Sam to this call by phone yet.");
  });

  it('the semantic-router tool, which is spoken directly', async () => {
    const out = (await inviteParticipantTool.execute(
      { phoneNumber: '801-555-0199', name: 'Sam' },
      {} as never
    )) as { success: boolean; naturalResponse?: string };
    expect(out.success).toBe(false);
    expect(out.naturalResponse).not.toMatch(CALLING_NOW);
    expect(out.naturalResponse).toMatch(/haven't dialed anyone/);
  });
});

describe('inviteFriendByCall', () => {
  it('says the call went out, not that Ferni is talking to them right now', async () => {
    const tools = createVoiceReferralTools('user-1', 'Alex');
    const tool = tools.inviteFriendByCall as unknown as Exec;
    const reply = String(await tool.execute({ friendName: 'Sam', friendPhone: '8015550199' }));
    expect(reply).toMatch(/^The call to Sam has gone out/);
    expect(reply).not.toMatch(CALLING_NOW);
  });
});
