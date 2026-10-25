/**
 * A reply the caller cut off stays in the agent's chat, marked as cut, when LiveKit
 * committed none (or only part) of it (CUT_REPLY_IN_HISTORY, #2422). Driven through a
 * real SDK Agent and SpeechHandle: the session emits speech_created, the TTS hand-off
 * notes the text, the handle is interrupted and finishes.
 */
import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import {
  CUT_MARK,
  CUT_REPLY_EXTRA,
  CUT_REST_MARK,
  armedCutReply,
  attachCutReplyHistory,
  noteGeneratedForCut,
  unheardPart,
} from '../cut-reply-history.js';

const ON = { CUT_REPLY_IN_HISTORY: 'on' };
const TIP =
  'The secret to consistency is a slow, high toss and letting the racket do the work every time.';

function callSession(env: Record<string, string> = ON) {
  const agent = new voice.Agent({ instructions: 'You are Maya.' });
  const session = Object.assign(new EventEmitter(), { currentAgent: agent });
  const detach = attachCutReplyHistory(session as never, { sessionId: 's1' }, env);
  return { agent, session, detach };
}

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** One reply: created at 1000, its text at the TTS at 2000, then cut or played out. */
async function reply(
  s: ReturnType<typeof callSession>,
  text: string,
  opts: { cut: boolean; heard?: string; generatedAt?: number }
) {
  const handle = voice.SpeechHandle.create();
  s.session.emit('speech_created', { speechHandle: handle, createdAt: 1000 });
  noteGeneratedForCut(s.session, text, opts.generatedAt ?? 2000);
  if (opts.heard !== undefined) {
    // What LiveKit does when forwardedText is non-empty (agent_activity.js).
    const item = llm.ChatMessage.create({
      role: 'assistant',
      content: opts.heard,
      interrupted: opts.cut,
      createdAt: 1500,
    });
    const ctx = s.agent.chatCtx.copy();
    ctx.insert(item);
    await s.agent.updateChatCtx(ctx);
    handle._itemAdded([item]);
  }
  if (opts.cut) handle.interrupt();
  handle._markDone();
  await settle();
}

const assistantTexts = (agent: voice.Agent) =>
  agent.chatCtx.items.flatMap((i) =>
    i.type === 'message' && i.role === 'assistant' ? [i.textContent ?? ''] : []
  );
const inserted = (agent: voice.Agent) =>
  agent.chatCtx.items.filter((i) => i.type === 'message' && i.extra?.[CUT_REPLY_EXTRA] === true);

describe('attachCutReplyHistory', () => {
  it('puts a reply cut before a word played into the chat, marked', async () => {
    const s = callSession();
    expect(assistantTexts(s.agent)).toEqual([]);
    await reply(s, TIP, { cut: true });
    expect(assistantTexts(s.agent)).toEqual([`${CUT_MARK} ${TIP}`]);
    expect(armedCutReply(s.session)).toBe(TIP);
  });

  it('adds nothing when LiveKit committed the heard reply', async () => {
    const s = callSession();
    await reply(s, TIP, { cut: true, heard: TIP });
    expect(assistantTexts(s.agent)).toEqual([TIP]);
    expect(inserted(s.agent)).toHaveLength(0);
    expect(armedCutReply(s.session)).toBeUndefined();
  });

  it('adds only the unheard rest after a part LiveKit committed', async () => {
    const s = callSession();
    await reply(s, TIP, { cut: true, heard: 'The secret to consistency' });
    const texts = assistantTexts(s.agent);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toBe('The secret to consistency');
    expect(texts[1]).toBe(
      `${CUT_REST_MARK} is a slow, high toss and letting the racket do the work every time.`
    );
    expect(armedCutReply(s.session)).toBe(TIP);
  });

  it('adds nothing for a reply that played out', async () => {
    const s = callSession();
    await reply(s, TIP, { cut: false });
    expect(assistantTexts(s.agent)).toEqual([]);
    expect(armedCutReply(s.session)).toBeUndefined();
  });

  it('ignores text that reached the TTS before this speech began', async () => {
    const s = callSession();
    await reply(s, TIP, { cut: true, generatedAt: 500 });
    expect(assistantTexts(s.agent)).toEqual([]);
  });

  it('disarms the cut once the next reply reaches the TTS', async () => {
    const s = callSession();
    await reply(s, TIP, { cut: true });
    noteGeneratedForCut(s.session, 'Oh, the app keeps dropping your iPhone? Let me look.');
    expect(armedCutReply(s.session)).toBeUndefined();
  });

  it('flag off: nothing attached, the chat unchanged', async () => {
    const s = callSession({ CUT_REPLY_IN_HISTORY: 'off' });
    await reply(s, TIP, { cut: true });
    expect(assistantTexts(s.agent)).toEqual([]);
    expect(armedCutReply(s.session)).toBeUndefined();
    expect(s.session.listenerCount('speech_created')).toBe(0);
  });

  it('detach stops listening', async () => {
    const s = callSession();
    s.detach();
    await reply(s, TIP, { cut: true });
    expect(assistantTexts(s.agent)).toEqual([]);
  });
});

describe('unheardPart', () => {
  it('marks the whole reply when nothing was heard', () => {
    expect(unheardPart('Hi there, friend.', '')).toBe(`${CUT_MARK} Hi there, friend.`);
  });
  it('is undefined when nearly all of it was heard', () => {
    expect(
      unheardPart(
        'one two three four five six seven eight nine ten',
        'one two three four five six seven eight nine'
      )
    ).toBeUndefined();
  });
});
