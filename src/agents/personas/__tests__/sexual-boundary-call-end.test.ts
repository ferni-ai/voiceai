/**
 * SEXUAL_TOPIC_BOUNDARY at the edges: the after-call tasks (the extraction that once wrote a
 * caller's sexual-content entities) never start for a held call, even when the last turn's
 * read is still running at call end; and the crisis gate is untouched: the same scripted reply,
 * and the same guidance, with the boundary on and the call held. Fixtures are fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
} from '../../../services/session/after-call-tasks.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { resetSexualTopicHold } from '../../../utils/sexual-topic-hold.js';
import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { gatedReply } from '../crisis-gate.js';
import { readCallerTurn, resetSexualBoundary, SEXUAL_BOUNDARY_NOTE } from '../sexual-boundary.js';
import { withTurnReminder } from '../turn-request.js';

const yes = () => vi.fn(async () => '{"sexual": true}');
const call = (sessionId: string) => ({
  userId: 'phone:+15550101',
  sessionId,
  turns: [],
  startedAt: new Date(),
});

beforeEach(() => {
  vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
  resetMinorCare();
  resetSexualTopicHold();
  resetSexualBoundary();
});
afterEach(async () => {
  clearAfterCallTasks();
  await drainAfterCallTasks(50);
  vi.unstubAllEnvs();
});

describe('after-call tasks', () => {
  it('start for an unheld call and never for a held one', async () => {
    const task = vi.fn(async (_ctx: { sessionId: string }) => undefined);
    registerAfterCallTask('extraction', task);
    runAfterCallTasks(call('ce-clean'));
    await readCallerTurn({ sessionId: 'ce-held', text: 'a turn' }, { understand: yes() });
    runAfterCallTasks(call('ce-held'));
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(task.mock.calls.map(([ctx]) => ctx.sessionId)).toEqual(['ce-clean']);
  });

  it("wait for the last turn's read, then are skipped when it holds", async () => {
    const task = vi.fn(async (_ctx: { sessionId: string }) => undefined);
    registerAfterCallTask('extraction', task);
    let answer: (v: string) => void = () => undefined;
    const understand = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        })
    );
    void readCallerTurn({ sessionId: 'ce-late', text: 'a turn' }, { understand });
    runAfterCallTasks(call('ce-late'));
    expect(task).not.toHaveBeenCalled();
    answer('{"sexual": true}');
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(task).not.toHaveBeenCalled();
  });
});

describe('the crisis gate is unchanged', () => {
  const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const streamOf = (text: string) =>
    new ReadableStream<unknown>({
      start: (c) => {
        c.enqueue(text);
        c.close();
      },
    });
  async function reply(sessionId: string, text: string) {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: text });
    const session = { userData: { userId: 'anon:y', services: { sessionId } } };
    const model = vi.fn(async (_ctx: llm.ChatContext) => streamOf('ok'));
    const out: unknown[] = [];
    const stream = await gatedReply(
      withTurnReminder(chat, session, { shape: false }),
      session,
      model as never,
      opener as never,
      { env: PATTERNS_ONLY }
    );
    for await (const c of stream as unknown as AsyncIterable<unknown>) out.push(c);
    const sent = (model.mock.calls[0]?.[0].items.at(-1) as llm.ChatMessage | undefined)
      ?.textContent;
    return { spoken: out.join(''), sent: sent ?? '' };
  }

  it('speaks the same script, and keeps the guidance, for a held unverified caller', async () => {
    const replaceLine = 'I want to kill myself tonight';
    const guideLine = "I hope I don't wake up tomorrow";
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'off');
    const offReplace = await reply('cg-off', replaceLine);
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    await readCallerTurn({ sessionId: 'cg-on', text: 'a turn' }, { understand: yes() });
    const onReplace = await reply('cg-on', replaceLine);
    expect(onReplace.spoken).toContain('988');
    expect(onReplace.spoken).toBe(offReplace.spoken);
    expect(onReplace.sent).toBe(''); // the script, no model call
    const guided = await reply('cg-on', guideLine);
    expect(guided.sent).toContain(buildCrisisGuidance(detectCrisis(guideLine)));
    expect(guided.sent).toContain(SEXUAL_BOUNDARY_NOTE); // pre: the boundary is on this call
  });
});
