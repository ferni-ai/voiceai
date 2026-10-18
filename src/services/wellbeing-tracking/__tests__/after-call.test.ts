import { describe, expect, it, vi } from 'vitest';
import { isMemberCall } from '../../outreach/after-call-checkin.js';
import type { WellbeingSnapshot } from '../index.js';
import {
  WELLBEING_TASK,
  buildWellbeingPrompt,
  isCrisisCall,
  parseWellbeingReply,
  recordWellbeingAfterCall,
} from '../after-call.js';

const CALL = {
  userId: 'u-1',
  sessionId: 's-1',
  startedAt: new Date('2026-10-18T14:00:00Z'),
  turns: [
    { role: 'assistant', content: 'How was the week?' },
    { role: 'user', content: 'Long. Barely slept, but doing alright.' },
  ],
};

function run(reply: string | null, flag = 'on') {
  const llm = vi.fn(async () => reply);
  const save = vi.fn(async (_u: string, _s: WellbeingSnapshot) => true);
  const done = recordWellbeingAfterCall(CALL, {
    llm,
    save,
    env: { WELLBEING_AFTER_CALL: flag },
    isMember: isMemberCall,
  });
  return { llm, save, done };
}

describe('after-call wellbeing snapshot', () => {
  it('saves one snapshot for the caller with only the dimensions the model scored', async () => {
    const { save, done } = run('{"mood":0.55,"sleepQuality":0.15,"worry":null,"energy":"low"}');
    await done;

    expect(save).toHaveBeenCalledTimes(1);
    const [userId, snapshot] = save.mock.calls[0]!;
    expect(userId).toBe('u-1');
    expect(snapshot).toMatchObject({
      id: 'wb_call_s-1',
      userId: 'u-1',
      source: 'inferred',
      conversationId: 's-1',
      dimensions: { mood: 0.55, sleepQuality: 0.15 },
    });
    expect(Object.keys(snapshot.dimensions)).toEqual(['mood', 'sleepQuality']);
  });

  it('makes no model call and writes nothing while WELLBEING_AFTER_CALL is off', async () => {
    const { llm, save, done } = run('{"mood":0.9}', 'off');
    await done;
    expect(llm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('writes nothing when the caller said nothing about how they are', async () => {
    const { save, done } = run('{"mood":null,"energy":null}');
    await done;
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['anonymous', 'anonymous'],
    ['an unrecognised caller', 'anon:5e4001b2-6005-40e8-bd29-abf9bc9ed648'],
    ['the third party on a call placed for someone', 'onbehalf:call-123'],
    ['no caller', ''],
  ])('makes no model call and writes nothing for %s', async (_label, userId) => {
    const llm = vi.fn(async () => '{"mood":0.9}');
    const save = vi.fn(async () => true);
    await recordWellbeingAfterCall(
      { ...CALL, userId },
      { llm, save, env: { WELLBEING_AFTER_CALL: 'on' }, isMember: isMemberCall }
    );
    expect(llm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('runs for nobody when no member check is passed in (fails closed)', async () => {
    const llm = vi.fn(async () => '{"mood":0.9}');
    const save = vi.fn(async () => true);
    await recordWellbeingAfterCall(CALL, { llm, save, env: { WELLBEING_AFTER_CALL: 'on' } });
    expect(llm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('never scores a crisis call: no model call, nothing written', async () => {
    const llm = vi.fn(async () => '{"mood":0.1}');
    const save = vi.fn(async () => true);
    const turns = [
      { role: 'assistant', content: 'How are you holding up?' },
      { role: 'user', content: "Honestly I don't want to live anymore." },
    ];
    expect(isCrisisCall(turns)).toBe(true);
    await recordWellbeingAfterCall(
      { ...CALL, turns },
      { llm, save, env: { WELLBEING_AFTER_CALL: 'on' }, isMember: isMemberCall }
    );
    expect(llm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('a hard week that is not a crisis is still scored', () => {
    expect(isCrisisCall(CALL.turns)).toBe(false);
    expect(isCrisisCall([{ role: 'user', content: 'Work has been brutal and I am wiped.' }])).toBe(
      false
    );
  });

  it('drops scores outside 0..1 and unreadable replies', () => {
    expect(parseWellbeingReply('{"mood":1.4,"energy":-0.1,"worry":0}')).toEqual({ worry: 0 });
    expect(parseWellbeingReply('not json')).toEqual({});
    expect(parseWellbeingReply(null)).toEqual({});
  });

  it("scores only the caller's lines and keeps both sides of the call in the prompt", () => {
    const prompt = buildWellbeingPrompt(CALL.turns);
    expect(prompt).toContain('CALLER: Long. Barely slept, but doing alright.');
    expect(prompt).toContain('FERNI: How was the week?');
    expect(prompt).toContain('only from what the caller said about themselves');
  });

  it('is registered as an after-call task (the agents import after-call-register)', async () => {
    const { registeredAfterCallTasks } = await import('../../session/after-call-tasks.js');
    await import('../../../agents/after-call-register.js');
    expect(registeredAfterCallTasks()).toContain(WELLBEING_TASK);
  });
});
