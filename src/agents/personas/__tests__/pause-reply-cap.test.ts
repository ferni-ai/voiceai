/**
 * #3983 follow-up, dev 2026-11-23 with PAUSE_REQUEST_WAIT=on, three calls of
 * rt-1116-let-me-think: one gave the moment. In one the model said "Take your
 * time." and kept going for 8.6 s; in one the STT clipped the start to "on. Let me
 * think." and the note never came. With the flag on, a reply to a request that
 * carries the pause note keeps its first sentence, through the real reply guards
 * (action-claim-guard.ts withActionClaimCheck, which ferni-agent.ts llmNode calls on
 * every request), and a lone clipped tail ("on") before a full pause clause counts.
 * Synthetic phrases only.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';
import { pauseRequestNote, withPauseReplyCap } from '../pause-request.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { PAUSE_REQUEST_WAIT: 'on' };
const ISSUE_LINE = 'Hmm. Okay, hold on. Let me think.';
const ISSUE_REPLY = [
  'Take your time. Sometimes the best',
  ' things are the little everyday upgrades, you know, like a solid travel mug.',
];

afterEach(() => vi.unstubAllEnvs());

function chat(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: 'My brother asked what I want for my birthday.' });
  ctx.addMessage({ role: 'assistant', content: 'Ha, the mind goes blank right then.' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

/** The request as the live turn builds it (turn-request.ts), with the flag on for the note. */
function request(said: string, sessionId: string): llm.ChatContext {
  vi.stubEnv('PAUSE_REQUEST_WAIT', 'on');
  const sent = withTurnReminder(chat(said), { userData: { services: { sessionId } } });
  vi.unstubAllEnvs();
  return sent;
}

const streamOf = <T>(chunks: readonly T[]) =>
  new ReadableStream<T>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });

async function chunksOf(reply: unknown): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const chunk of reply as AsyncIterable<unknown>) out.push(chunk);
  return out;
}

const textOf = (chunks: unknown[]): string =>
  chunks
    .map((c) =>
      typeof c === 'string' ? c : ((c as { delta?: { content?: string } }).delta?.content ?? '')
    )
    .join('');

/** What the caller hears: the reply through the real guards (withActionClaimCheck). */
async function heard(chunks: readonly string[], req: llm.ChatContext, env: Record<string, string>) {
  return textOf(
    await chunksOf(await withActionClaimCheck(streamOf(chunks), req, {}, 'ferni', env))
  );
}

describe('the reply to a pause request keeps its first sentence (flag on)', () => {
  it('the dev 2026-11-23 reply stops at "Take your time."', async () => {
    const req = request(ISSUE_LINE, 'cap-issue');
    expect(await heard(ISSUE_REPLY, req, ON)).toBe('Take your time.');
  });

  it('flag off: the same request and reply are untouched', async () => {
    const req = request(ISSUE_LINE, 'cap-off');
    expect(await heard(ISSUE_REPLY, req, {})).toBe(ISSUE_REPLY.join(''));
    expect(await heard(ISSUE_REPLY, req, { PAUSE_REQUEST_WAIT: 'off' })).toBe(ISSUE_REPLY.join(''));
  });

  it('a request without the note (any other turn) is untouched with the flag on', async () => {
    const req = request('My brother asked what I want. Any ideas?', 'cap-other');
    expect(await heard(ISSUE_REPLY, req, ON)).toBe(ISSUE_REPLY.join(''));
  });

  it.each([
    [['Sure, take your time', '.', ' Want ideas?'], 'Sure, take your time.'],
    [['Sure, take your time.', ' Want ideas?'], 'Sure, take your time.'],
    [
      ['<break time="0.5s"/> Sure, take', ' your time. And more.'],
      '<break time="0.5s"/> Sure, take your time.',
    ],
    [['Take 1.5 minutes if you want. Or more.'], 'Take 1.5 minutes if you want.'],
    [['Take your time!', ' Really.'], 'Take your time!'],
    [['Sure, take your time'], 'Sure, take your time'],
    [['Sure.'], 'Sure.'],
    [['He said "wait." Then more.'], 'He said "wait."'],
    [['<break time="0.5s"/> Okay'], '<break time="0.5s"/> Okay'],
    [['Give it 1.5 seconds'], 'Give it 1.5 seconds'],
    [['I <3 that. Take your time.'], 'I <3 that.'],
  ])('%j is heard as %j', async (chunks, expected) => {
    const req = request(ISSUE_LINE, `cap-${expected.length}`);
    expect(textOf(await chunksOf(await withPauseReplyCap(streamOf(chunks), req, ON)))).toBe(
      expected
    );
  });

  it('ChatChunks keep their id and role; a tool call and other chunks before the cap pass through', async () => {
    const req = request(ISSUE_LINE, 'cap-chunks');
    const word = (content: string) => ({ id: 'c1', delta: { role: 'assistant', content } });
    const tool = { id: 'c1', delta: { role: 'assistant', toolCalls: [{ name: 'x' }] } };
    const usage = { usage: { completionTokens: 9 } };
    const out = await chunksOf(
      await withPauseReplyCap(
        streamOf<object>([word(''), tool, usage, word('Sure, take'), word(' your time. More.')]),
        req,
        ON
      )
    );
    expect(textOf(out)).toBe('Sure, take your time.');
    expect(out).toContainEqual(tool);
    expect(out).toContainEqual(usage);
    for (const c of out.filter((c) => (c as { delta?: object }).delta))
      expect(c).toMatchObject({ id: 'c1', delta: { role: 'assistant' } });
  });

  it('the reply ends once the next words begin, and the model is cancelled', async () => {
    const req = request(ISSUE_LINE, 'cap-early');
    let cancelled = false;
    const model = new ReadableStream<string>({
      start(c) {
        c.enqueue('Sure, take your time.');
        c.enqueue(' Sometimes the best');
        // never closes: a model still writing the words the cap drops
      },
      cancel() {
        cancelled = true;
      },
    });
    const timeout = new Promise<string>((resolve) => {
      setTimeout(() => resolve('timed out'), 1000);
    });
    const read = chunksOf(await withPauseReplyCap(model, req, ON)).then(textOf);
    expect(await Promise.race([read, timeout])).toBe('Sure, take your time.');
    expect(cancelled).toBe(true);
  });
});

describe('a clipped start still reads as a pause request', () => {
  it.each([
    'on. Let me think.',
    'On, let me think.',
    'sec. Hold on.',
    'second, let me think about it.',
  ])('reads %j as a pause request', (said) => {
    expect(pauseRequestNote(said, ON)).not.toBe('');
  });

  it.each([
    'on.',
    'On. Tell me more.',
    'Moving on. Let me think.',
    'Okay. on. Let me think.', // the tail must be the first clause
    'Second. I need to tell you something.',
    'on, on, on.',
  ])('does not read %j as a pause request', (said) => {
    expect(pauseRequestNote(said, ON)).toBe('');
  });

  it('flag off: a clipped start gets no note', () => {
    expect(pauseRequestNote('on. Let me think.', {})).toBe('');
  });
});
