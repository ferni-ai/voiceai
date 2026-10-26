/**
 * What the crisis gate tells the slow-turn sound (slow-turn-sound.ts): that the
 * classifier is holding this reply, and whether a sound already opened the turn.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { SLOW_TURN } from '../../integrations/slow-turn-sound.js';
import { attachSlowTurnSoundToCall } from '../../integrations/slow-turn-wiring.js';
import { crisisVerdictPending } from '../../safety/crisis-gate-signal.js';
import { gatedReply } from '../crisis-gate.js';
import { OpenerGate } from '../opener-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

const saying = (text: string) => async () =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

async function collect(stream: ReadableStream<unknown> | null): Promise<string> {
  let out = '';
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out += String(chunk);
  return out;
}

beforeEach(() => resetCrisisClassifierCache());

describe('gatedReply: the pending crisis verdict', () => {
  it('is recorded while the classifier holds the reply, and cleared when it settles', async () => {
    const session = { userData: undefined };
    let answer!: (verdict: string) => void;
    const generate: CrisisGenerateFn = () =>
      new Promise<string>((resolve) => {
        answer = resolve;
      });
    const reply = await gatedReply(
      request('Work was rough today and I am wiped out.'),
      session,
      saying('That sounds like a long one.') as never,
      new OpenerGate(3),
      { env: LIVE, generate }
    );
    expect(crisisVerdictPending(session)).not.toBeNull();
    answer('{"risk":"none","subject":"self"}');
    expect(await collect(reply)).toBe('That sounds like a long one.');
    await Promise.resolve();
    expect(crisisVerdictPending(session)).toBeNull();
  });

  it('nothing is recorded without a classifier read', async () => {
    const session = { userData: undefined };
    await collect(
      await gatedReply(
        request('Work was rough.'),
        session,
        saying('Oof.') as never,
        new OpenerGate(3),
        {
          env: PATTERNS_ONLY,
        }
      )
    );
    expect(crisisVerdictPending(session)).toBeNull();
  });
});

describe('gatedReply after a slow-turn "Mm"', () => {
  afterEach(() => vi.useRealTimers());

  it('the answer after a tool, asked after the sound, does not open with a second "Mm"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const session = Object.assign(new EventEmitter(), {
      userData: undefined,
      history: { items: [] },
    });
    const played: string[] = [];
    const detach = attachSlowTurnSoundToCall(
      session,
      'slow-mm',
      { playClip: (t) => (played.push(t), true), lastPlayedAt: () => 0 },
      () => 'ferni'
    );
    session.emit('user_state_changed', { newState: 'speaking' });
    session.emit('ferni_preemptive_decision', { used: false });
    session.emit('conversation_item_added', {
      item: { role: 'user', textContent: 'can you call my sister for me' },
    });
    session.emit('user_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(played).toEqual(['Mm']);
    vi.useRealTimers();
    await new Promise((resolve) => {
      setTimeout(resolve, 5); // the post-tool request starts after the sound
    });
    const out = await collect(
      await gatedReply(
        request('can you call my sister for me'),
        session,
        saying('Mm, sure, one sec.') as never,
        new OpenerGate(3),
        { env: PATTERNS_ONLY }
      )
    );
    expect(out).toBe('Sure, one sec.');
    detach();
  });
});
