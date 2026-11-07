/**
 * A typed message goes through the voice reply's crisis gate (crisis-gate-text.ts): the same
 * decision startCrisisGate makes for the same words on a call, the same script, and the
 * same guidance the voice turn adds. Fictional lines only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { startCrisisGate } from '../crisis-gate.js';
import { readTypedMessageForCrisis, type TypedTurn } from '../crisis-gate-text.js';

const BLOCK = 'standing on the bridge rn. just wanted to tell someone before i jump';
const GUIDE = "i kinda wish i just wouldn't wake up tomorrow";
const PLAIN = 'killing it at work this week, finally got the promotion';

/** The voice turn's request for the same words. */
function voiceRequest(text: string, earlier: readonly TypedTurn[] = []): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const turn of earlier)
    ctx.addMessage({ role: turn.from === 'person' ? 'user' : 'assistant', content: turn.text });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

/** The voice turn's gate for the same words; throws if the gate is off (it is live in tests). */
function voiceGate(ctx: llm.ChatContext, options?: Parameters<typeof startCrisisGate>[2]) {
  const gate = startCrisisGate(ctx, undefined, options);
  if (!gate) throw new Error('the voice crisis gate is off');
  return gate;
}

const voiceDecision = (text: string, earlier: readonly TypedTurn[] = []) =>
  voiceGate(voiceRequest(text, earlier)).decision;

beforeEach(() => resetCrisisClassifierCache());

describe('readTypedMessageForCrisis', () => {
  it("block: the voice turn's crisis script, and nothing for the model", async () => {
    const voice = voiceDecision(BLOCK);
    expect(voice.action).toBe('replace');
    const read = await readTypedMessageForCrisis(BLOCK);
    expect(read).toEqual({ action: 'replace', reply: voice.action === 'replace' && voice.script });
  });

  it("lower tier: the message carries the voice turn's guidance, after their words", async () => {
    const voice = voiceDecision(GUIDE);
    expect(voice.action).toBe('guide');
    const read = await readTypedMessageForCrisis(GUIDE);
    expect(read.action).toBe('guide');
    const message = read.action === 'guide' ? read.message : '';
    expect(message.startsWith(GUIDE)).toBe(true);
    expect(message).toContain(`(${voice.action === 'guide' && voice.guidance})`);
  });

  it('no crisis: the message is unchanged', async () => {
    expect(await readTypedMessageForCrisis(PLAIN)).toEqual({ action: 'pass', message: PLAIN });
  });

  it('reads the earlier turns as the voice turn does', async () => {
    const earlier: TypedTurn[] = [
      { from: 'person', text: 'sometimes i wish i could just disappear' },
      { from: 'agent', text: 'that sounds heavy. what has the week been like?' },
    ];
    const now = 'soon none of this will matter';
    expect(voiceDecision(now).action).toBe('pass');
    expect(voiceDecision(now, earlier).action).toBe('guide');
    expect((await readTypedMessageForCrisis(now)).action).toBe('pass');
    expect((await readTypedMessageForCrisis(now, earlier)).action).toBe('guide');
  });

  it('a scene opening with no words of theirs is not read', async () => {
    expect(await readTypedMessageForCrisis('  ', [{ from: 'person', text: BLOCK }])).toEqual({
      action: 'pass',
      message: '  ',
    });
  });

  describe('the classifier, as on a call', () => {
    const env = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
    const verdict =
      (reply: string): CrisisGenerateFn =>
      async () =>
        reply;

    it('an imminent read the patterns missed gets the crisis script', async () => {
      const line = 'i wrote the notes for everyone and tonight is the night';
      const generate = verdict('{"risk":"imminent","subject":"self"}');
      const voice = voiceGate(voiceRequest(line), { env, generate });
      const escalated = await voice.escalation;
      expect(voice.decision.action).not.toBe('replace');
      expect(escalated?.action).toBe('replace');
      resetCrisisClassifierCache();
      const read = await readTypedMessageForCrisis(line, [], { env, generate });
      expect(read).toEqual({
        action: 'replace',
        reply: escalated?.action === 'replace' && escalated.script,
      });
    });

    it('a failed classifier keeps the patterns decision', async () => {
      const generate: CrisisGenerateFn = async () => {
        throw new Error('model down');
      };
      expect((await readTypedMessageForCrisis(BLOCK, [], { env, generate })).action).toBe(
        'replace'
      );
      expect((await readTypedMessageForCrisis(GUIDE, [], { env, generate })).action).toBe('guide');
    });
  });

  it('CRISIS_GUARD_MODE=off leaves the message alone, as on a call', async () => {
    const env = { CRISIS_GUARD_MODE: 'off' };
    expect(await readTypedMessageForCrisis(BLOCK, [], { env })).toEqual({
      action: 'pass',
      message: BLOCK,
    });
  });
});
