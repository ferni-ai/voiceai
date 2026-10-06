/**
 * A steering note built for one caller turn doesn't pass as a note on the
 * next one (turn-intelligence.ts: notes sit right after their own turn's
 * words; withoutStaleTurnContext drops one left in the unanswered tail;
 * director-notes.ts BACK_TO_EARLIER), through the request every reply is
 * built from (turn-request.ts withTurnReminder).
 *
 * Dev call, 2026-10-03: the pushed context for "What more can we do to make
 * you human?" sat just before "Why do you keep forgetting?", and the reply
 * followed the old question; the director's 'They said "It's hard to say."...
 * Connect to that.' reached the reply to "All right, brother."
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Director, setDirector } from '../../personas/director-notes.js';
import { withTurnReminder } from '../../personas/turn-request.js';
import {
  TURN_CONTEXT_FOR,
  TURN_CONTEXT_HEADER,
  createTurnContextPusher,
  withoutStaleTurnContext,
} from '../turn-intelligence.js';

const NOTE = 'They seem to be testing whether you are human.';

function agentWith(ctx: llm.ChatContext) {
  return {
    get chatCtx() {
      return ctx;
    },
    updateChatCtx: vi.fn(async (next: llm.ChatContext) => {
      ctx = next;
    }),
  };
}

const say = (ctx: llm.ChatContext, role: 'user' | 'assistant', content: string) =>
  ctx.addMessage({ role, content });
const requestText = (ctx: llm.ChatContext) =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

/** Turn N, Ferni's reply to it, and the context built from turn N pushed after. */
async function afterTurn(turn: string) {
  const agent = agentWith(llm.ChatContext.empty());
  const hook = vi.fn(async (scratch: llm.ChatContext) => {
    scratch.addMessage({ role: 'user', content: NOTE });
  });
  const pusher = createTurnContextPusher(hook, agent);
  say(agent.chatCtx, 'user', turn);
  await pusher.onAgentState('speaking'); // the reply to turn N starts first...
  await pusher.onFinalTranscript(turn); // ...the context is ready during it...
  say(agent.chatCtx, 'assistant', "Honestly, I'm not trying to be human. I'm just Ferni.");
  await pusher.onAgentState('listening'); // ...and is pushed once Ferni is done
  expect(requestText(agent.chatCtx)).toContain(NOTE);
  return { agent, pusher };
}

describe('pushed turn context', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reaches the next reply as background on its own turn, never before the new question', async () => {
    const { agent } = await afterTurn('What more can we do to make you human?');
    say(agent.chatCtx, 'user', 'Why do you keep forgetting?');
    const lines = requestText(withTurnReminder(agent.chatCtx, {})).split('\n');
    const at = (text: string) => lines.findIndex((l) => l.includes(text));
    expect(at(NOTE)).toBeGreaterThan(at('What more can we do'));
    expect(at(NOTE)).toBeLessThan(at("I'm just Ferni"));
    expect(at("I'm just Ferni")).toBeLessThan(at('Why do you keep forgetting?'));
  });

  it('goes back to its own turn even when it is ready only after the next question', async () => {
    const agent = agentWith(llm.ChatContext.empty());
    const pusher = createTurnContextPusher(
      vi.fn(async (scratch: llm.ChatContext) => {
        scratch.addMessage({ role: 'user', content: NOTE });
      }),
      agent
    );
    say(agent.chatCtx, 'user', 'What more can we do to make you human?');
    await pusher.onAgentState('speaking');
    say(agent.chatCtx, 'assistant', "I'm just Ferni.");
    say(agent.chatCtx, 'user', 'Why do you keep forgetting?');
    await pusher.onAgentState('thinking'); // the next turn started before the note was ready
    await pusher.onFinalTranscript('What more can we do to make you human?');
    say(agent.chatCtx, 'assistant', 'I do remember, I promise.');
    await pusher.onAgentState('listening');
    const items = agent.chatCtx.items.map((i) => (i as { textContent?: string }).textContent ?? '');
    expect(items.findIndex((t) => t.includes(NOTE))).toBe(1);
  });

  it('still drops a note left in the unanswered tail that was built for other words', () => {
    const chat = llm.ChatContext.empty();
    say(chat, 'user', 'What more can we do to make you human?');
    say(chat, 'assistant', "I'm just Ferni.");
    chat.addMessage({
      role: 'user',
      content: `${TURN_CONTEXT_HEADER}\n${NOTE}`,
      extra: { [TURN_CONTEXT_FOR]: 'What more can we do to make you human?' },
    });
    say(chat, 'user', 'Why do you keep forgetting?');
    expect(requestText(withoutStaleTurnContext(chat))).not.toContain(NOTE);
  });

  it('still reaches the reply to the turn it was built for', async () => {
    const agent = agentWith(llm.ChatContext.empty());
    const pusher = createTurnContextPusher(
      vi.fn(async (scratch: llm.ChatContext) => {
        scratch.addMessage({ role: 'user', content: NOTE });
      }),
      agent
    );
    // Ready before the reply started: the caller's words land after the note.
    await pusher.onFinalTranscript('What more can we do to make you human?');
    say(agent.chatCtx, 'user', 'What more can we do to make you human?');
    expect(requestText(withTurnReminder(agent.chatCtx, {}))).toContain(NOTE);
  });

  it('reaches every reply with STALE_TURN_CONTEXT=keep', async () => {
    const { agent } = await afterTurn('What more can we do to make you human?');
    say(agent.chatCtx, 'user', 'Why do you keep forgetting?');
    expect(
      requestText(withoutStaleTurnContext(agent.chatCtx, { STALE_TURN_CONTEXT: 'keep' }))
    ).toContain(NOTE);
  });
});

describe("the director's notes", () => {
  afterEach(() => vi.unstubAllEnvs());

  const call = [
    { speaker: 'user' as const, text: 'What do you think about Donald Trump?' },
    { speaker: 'ferni' as const, text: 'I try to stay out of politics.' },
    { speaker: 'user' as const, text: "It's hard to say." },
    { speaker: 'ferni' as const, text: 'Yeah, I get that. Quiet moments are like that.' },
    { speaker: 'ferni' as const, text: 'Mm?' },
  ];

  async function nextReply(directorReply: string) {
    const session = {};
    const director = new Director({ sessionId: 's', writer: async () => directorReply });
    setDirector(session, director);
    await director.observe(call); // after Ferni's "Mm?"
    const chat = llm.ChatContext.empty();
    for (const l of call) say(chat, l.speaker === 'user' ? 'user' : 'assistant', l.text);
    say(chat, 'user', 'All right, brother.'); // the caller moved on
    const text = requestText(withTurnReminder(chat, session));
    setDirector(session, null);
    return text;
  }

  it("don't send the reply to the next turn back to an earlier line", async () => {
    const text = await nextReply(
      `They said "It's hard to say." about quiet moments. Connect to that.\nThe "Donald Trump" comment is still hanging.`
    );
    expect(text).not.toContain('Connect to that');
    expect(text).not.toContain('still hanging');
  });

  it('still carry notes about the caller and about Ferni', async () => {
    const text = await nextReply("You've mentioned quiet moments a lot. Try something new.");
    expect(text).toContain("You've mentioned quiet moments a lot.");
  });

  it('send Ferni back again with DIRECTOR_LOOK_BACK=on', async () => {
    vi.stubEnv('DIRECTOR_LOOK_BACK', 'on');
    const text = await nextReply(
      `They said "It's hard to say." about quiet moments. Connect to that.`
    );
    expect(text).toContain('Connect to that');
  });

  it('are asked for without pointers back to earlier lines', async () => {
    const prompts: string[] = [];
    const director = new Director({
      sessionId: 's',
      writer: async (system) => {
        prompts.push(system);
        return 'NONE';
      },
    });
    await director.observe(call);
    expect(prompts[0]).not.toContain('worth coming back to');
    expect(prompts[0]).toContain('never send him back to an earlier line');
  });
});
