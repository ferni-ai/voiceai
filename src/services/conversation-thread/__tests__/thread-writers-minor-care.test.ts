/**
 * MINOR_CARE=on: #2741 held the voice thread recorder, but three other writers reach
 * bogle_users/<id>/conversation_threads with no hold: the inbound SMS router, outbound
 * outreach and group outreach. They all converge on thread-manager (getOrCreateThread /
 * addMessage / the thread doc), so the hold sits there. Group outreach also texts the user
 * (deliverOutreach): a commitment marked done on a held call celebrates it with the team. A
 * caller under 18 gets no outreach off the back of that call, so it is refused outright.
 *
 * The real writers run with only storage and delivery faked; the same writes still happen for
 * a verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as string[]);
vi.mock('../thread-persistence.js', () => ({
  saveThread: async () => void writes.push('thread'),
  loadThread: async () => null,
  loadActiveThread: async () => null,
  saveMessage: async (_u: string, m: { role: string }) => void writes.push(`message:${m.role}`),
  loadMessages: async () => [],
}));
vi.mock('../../outreach/conversation-context-bridge.js', () => ({
  storeOutreachContext: async () => void writes.push('outreach context'),
  getConversationBridgeContext: async () => null,
}));
vi.mock('../../outreach/persona-voice-generator.js', () => ({
  getPersonaOutreachVoice: () => ({ tone: 'warm', openings: ['Hey!'] }),
  generateTextMessage: () => 'Hey!',
}));
vi.mock('../../outreach/delivery/index.js', () => ({
  deliverOutreach: async () => {
    writes.push('sms sent');
    return { success: true, messageId: 'msg-1' };
  },
}));

import { handleInboundSMS } from '../inbound-router.js';
import { initiateOutreach } from '../outbound-initiator.js';
import { teamCelebrationOutreach } from '../group-outreach.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
  userHeld,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A call (still live, or ended under 6 h ago) whose caller said "I'm only 14." */
function heldCall(c: Case): string {
  n++;
  const sessionId = `session-AJ_writers${n}-1792867440000`;
  const userId = `phone-user-${n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm only 14.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  expect(userHeld(userId)).toBe(c === 'held');
  writes.length = 0;
  return userId;
}

beforeEach(() => {
  writes.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: every conversation-thread writer, for a caller who said "I\'m only 14."', () => {
  it.each(['held', 'owner', 'off'] as Case[])(
    'keeps none of a text they send (same process as the call) when held (%s)',
    async (c) => {
      const userId = heldCall(c);
      await handleInboundSMS(userId, '+15550100000', 'my best friend and I had a fight');
      expect(writes).toEqual(c === 'held' ? [] : ['thread', 'message:user', 'thread']);
    }
  );

  it.each(['held', 'owner', 'off'] as Case[])(
    'keeps no outbound outreach message in their thread when held (%s)',
    async (c) => {
      const userId = heldCall(c);
      await initiateOutreach({
        userId,
        agentId: 'ferni',
        preferredChannel: 'sms',
        triggerType: 'follow_up',
        reason: 'checking in after a hard day',
        messageContent: 'How did things go with your friend?',
      });
      const threadWrites = writes.filter((w) => w !== 'outreach context');
      expect(threadWrites).toEqual(c === 'held' ? [] : ['thread', 'message:agent', 'thread']);
    }
  );

  it.each(['held', 'owner', 'off'] as Case[])(
    'sends no team celebration and keeps nothing when held (%s)',
    async (c) => {
      const userId = heldCall(c);
      const result = await teamCelebrationOutreach(userId, { achievement: 'finishing the essay' });
      expect(result.success).toBe(c !== 'held');
      expect(writes).toEqual(
        c === 'held' ? [] : ['thread', 'outreach context', 'message:agent', 'thread', 'sms sent']
      );
    }
  );
});
