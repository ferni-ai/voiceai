/**
 * #2642: a pushed turn-context note's safety guidance (safety-note.ts) must
 * reach the reply. The stale drop (withoutStaleTurnContext) threw the whole
 * note away on barge-in and mid-turn-pause sequences, and a held safety note
 * was overwritten by the next held note when PREEMPT_STABLE_CONTEXT was off
 * (prod). Real pusher and real stale drop; the hook stands in for the turn.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addSafetyNote } from '../../processors/turn-processor/safety-note.js';
import {
  createTurnContextPusher,
  TURN_CONTEXT_HEADER,
  withoutStaleTurnContext,
} from '../turn-intelligence.js';

const CRISIS = "I don't see the point of any of it anymore";
const ESCALATION = 'I have been giving my things away';
const GUIDANCE =
  '[CRITICAL - USER SAFETY]\nStay with them. Offer the 988 Suicide & Crisis Lifeline.';
const ESCALATION_GUIDANCE = '[ESCALATION AWARENESS]\nThey may be preparing; ask directly.';
const MEMORY = '[RELEVANT MEMORIES]\nThey moved to Denver last spring.';

/** Stands in for handleUserTurn: crisis words bring safety guidance, all words bring memory. */
const hook = async (scratch: llm.ChatContext, msg: llm.ChatMessage): Promise<void> => {
  const words = msg.textContent ?? '';
  if (words.includes(CRISIS)) addSafetyNote(scratch, GUIDANCE);
  if (words.includes(ESCALATION)) addSafetyNote(scratch, ESCALATION_GUIDANCE);
  scratch.addMessage({ role: 'system', content: MEMORY });
};

function liveCall() {
  let ctx = llm.ChatContext.empty();
  const agent = {
    get chatCtx() {
      return ctx;
    },
    updateChatCtx: async (c: llm.ChatContext) => {
      ctx = c;
    },
  };
  const notes = (c: llm.ChatContext) =>
    c.items
      .map((i) => (i as { textContent?: string }).textContent ?? '')
      .filter((t) => t.startsWith(TURN_CONTEXT_HEADER));
  return {
    pusher: createTurnContextPusher(hook as never, agent as never),
    say: (role: 'user' | 'assistant', content: string) => ctx.addMessage({ role, content }),
    /** The notes in the agent's context. */
    pushed: () => notes(ctx),
    /** The notes one reply's request carries, after the stale drop. */
    sent: () => notes(withoutStaleTurnContext(ctx as never, {}) as llm.ChatContext),
  };
}

/** The final transcript arrives, then the turn commits (agent 'thinking') while the hook runs. */
async function finalThenThinking(call: ReturnType<typeof liveCall>, words: string) {
  const built = call.pusher.onFinalTranscript(words);
  await call.pusher.onAgentState('thinking');
  await built;
}

afterEach(() => vi.unstubAllEnvs());

describe('safety guidance in the pushed note is never lost (#2642)', () => {
  it.each(['off', 'on'])(
    'S2: barge-in before the reply, then "wait no" — the request keeps the crisis guidance (PREEMPT_STABLE_CONTEXT=%s)',
    async (flag) => {
      vi.stubEnv('PREEMPT_STABLE_CONTEXT', flag);
      const call = liveCall();
      call.say('assistant', 'How has the week been?');
      call.say('user', CRISIS);
      await finalThenThinking(call, CRISIS); // held: Ferni is thinking
      await call.pusher.onUserState('speaking'); // barge-in before any reply text
      await call.pusher.onAgentState('listening');
      call.say('user', 'wait no');
      await call.pusher.onFinalTranscript('wait no'); // a later note, held while they speak
      await call.pusher.onUserState('listening'); // the note lands now
      expect(call.sent().some((note) => note.includes(GUIDANCE))).toBe(true);
    }
  );

  it('S1: pause mid-turn, note pushed, caller keeps talking — only the safety part survives the stale drop', async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    await call.pusher.onFinalTranscript(CRISIS); // a pause: pushed at once
    await call.pusher.onUserState('speaking');
    const more = call.pusher.onFinalTranscript('sorry I mean like everything');
    call.say('user', `${CRISIS} sorry I mean like everything`); // LiveKit commits one message
    await call.pusher.onAgentState('thinking');
    const sent = call.sent(); // the reply is requested before the second note is ready
    await more;
    expect(sent).toEqual([`${TURN_CONTEXT_HEADER}\n${GUIDANCE}`]);
  });

  it("S3: interrupted reply, note lands after the caller's next words — the request keeps the crisis guidance", async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    call.say('user', CRISIS);
    await finalThenThinking(call, CRISIS);
    await call.pusher.onUserState('speaking');
    call.say('user', 'I just feel so tired');
    await call.pusher.onAgentState('listening');
    await call.pusher.onUserState('listening'); // turn 1's note lands now
    expect(call.sent().some((note) => note.includes(GUIDANCE))).toBe(true);
  });

  it('a held crisis note is not replaced by a later held note with safety guidance of its own', async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    await finalThenThinking(call, CRISIS);
    await call.pusher.onUserState('speaking');
    await call.pusher.onAgentState('listening');
    await call.pusher.onFinalTranscript(ESCALATION);
    await call.pusher.onUserState('listening');
    const [note] = call.pushed();
    expect(note).toContain(GUIDANCE);
    expect(note).toContain(ESCALATION_GUIDANCE);
    expect(note.split(GUIDANCE)).toHaveLength(2); // once, not repeated
  });

  it('a held crisis note and a later note with the same guidance carry it once', async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    await finalThenThinking(call, CRISIS);
    await call.pusher.onUserState('speaking');
    await call.pusher.onAgentState('listening');
    await call.pusher.onFinalTranscript(`${CRISIS}, honestly`);
    await call.pusher.onUserState('listening');
    const [note] = call.pushed();
    expect(note.split(GUIDANCE)).toHaveLength(2);
  });

  it('a note in history, before a reply of Ferni, is sent whole (control)', async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    call.say('user', CRISIS);
    await finalThenThinking(call, CRISIS);
    call.say('assistant', "I'm really glad you told me. I'm here with you.");
    await call.pusher.onAgentState('listening');
    call.say('user', 'I just feel so tired');
    expect(call.sent()).toEqual([`${TURN_CONTEXT_HEADER}\n${GUIDANCE}\n\n${MEMORY}`]);
  });

  it('a stale note with no safety guidance is still dropped whole (control)', async () => {
    const call = liveCall();
    call.say('assistant', 'How has the week been?');
    await call.pusher.onFinalTranscript('pretty good');
    call.say('user', 'pretty good actually, we went hiking');
    expect(call.pushed()).toHaveLength(1);
    expect(call.sent()).toEqual([]);
  });
});
