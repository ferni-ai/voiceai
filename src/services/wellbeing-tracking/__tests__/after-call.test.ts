import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../safety/crisis-call-risk.js';
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
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
  const done = recordWellbeingAfterCall(CALL, { llm, save, env: { WELLBEING_AFTER_CALL: flag } });
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

  it('writes nothing for an anonymous caller', async () => {
    const save = vi.fn(async () => true);
    await recordWellbeingAfterCall(
      { ...CALL, userId: 'anonymous' },
      { llm: async () => '{"mood":0.9}', save, env: { WELLBEING_AFTER_CALL: 'on' } }
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('writes nothing for an anon: or onbehalf: session id', async () => {
    const save = vi.fn(async () => true);
    for (const userId of ['anon:web-1', 'onbehalf:call-1']) {
      await recordWellbeingAfterCall(
        { ...CALL, userId },
        { llm: async () => '{"mood":0.9}', save, env: { WELLBEING_AFTER_CALL: 'on' } }
      );
    }
    expect(save).not.toHaveBeenCalled();
  });

  describe('never scores a crisis call', () => {
    afterEach(() => {
      resetCrisisCallRisk();
      vi.unstubAllEnvs();
    });
    const ON = { WELLBEING_AFTER_CALL: 'on' };
    async function scored(call: typeof CALL, deps = {}): Promise<number> {
      const llm = vi.fn(async () => '{"mood":0.1}');
      const save = vi.fn(async () => true);
      await recordWellbeingAfterCall(call, { llm, save, env: ON, ...deps });
      expect(save.mock.calls.length).toBe(llm.mock.calls.length > 0 ? 1 : 0);
      return llm.mock.calls.length;
    }
    const said = (...lines: string[]) => ({
      ...CALL,
      turns: lines.map((content, i) => ({ role: i % 2 ? 'user' : 'assistant', content })),
    });

    it("the caller's own words reach the crisis tier: no model call, nothing written", async () => {
      const call = said('How are you holding up?', "Honestly I don't want to live anymore.");
      expect(isCrisisCall(call, () => false)).toBe(true);
      expect(await scored(call, { crisisRisk: () => false })).toBe(0);
    });

    it('words only the live crisis patterns read as crisis (the 988 tier reads none)', async () => {
      for (const words of [
        'I just want to disappear forever.',
        'I wish I could go to sleep and not wake up.',
        'I took a bunch of pills.',
      ]) {
        expect(await scored(said('How are you?', words), { crisisRisk: () => false })).toBe(0);
      }
    });

    it('words only the human-transfer tier sends to 988 or 911 (the patterns read none)', async () => {
      for (const words of [
        'My husband hits me and I am scared to go home.',
        'I want to hurt someone.',
      ]) {
        expect(await scored(said('How are you?', words), { crisisRisk: () => false })).toBe(0);
      }
    });

    it("an escalation across the caller's turns (earlier turns as context)", async () => {
      const lines = [
        'I feel like a burden to everyone',
        'nobody would miss me',
        'Soon none of this will matter',
      ];
      const call = said('Hey.', lines[0], 'Hm.', lines[1], 'Okay.', lines[2]);
      expect(isCrisisCall(call, () => false)).toBe(true);
      // No line alone is a crisis.
      for (const line of lines) expect(isCrisisCall(said('Hey.', line), () => false)).toBe(false);
    });

    it('risk was noted on this call by the crisis gate or turn pipeline (real ledger)', async () => {
      // Plain words in the transcript: only the live call knew (e.g. a voice-amplified read).
      noteCrisisRisk(CALL.sessionId);
      expect(await scored(CALL)).toBe(0);
    });

    it('a classifier-only imminent read, words the patterns pass (real ledger)', async () => {
      await trackCrisisRead(CALL.sessionId, 'doing alright', Promise.resolve({ risk: 'imminent' }));
      expect(await scored(CALL)).toBe(0);
    });

    it('a crisis read still in flight when the call ended counts as risk', async () => {
      void trackCrisisRead(
        CALL.sessionId,
        'doing alright',
        new Promise<{ risk: string }>(() => {})
      );
      expect(await scored(CALL)).toBe(0);
    });

    it("another call's risk does not hold this one", async () => {
      noteCrisisRisk('some-other-call');
      expect(await scored(CALL)).toBe(1);
    });

    it('Ferni gave the caller 988 or the Crisis Text Line', async () => {
      for (const line of [
        'You can call or text 988 any time, day or night.',
        'Text HOME to 741741 to reach the Crisis Text Line.',
        // Written the way a model's free text writes it (crisis-line-speech.ts)
        'You can call or text 9-8-8 any time',
        'You can call 9 8 8 whenever you need',
        'You can call or text nine eight eight any time',
        'the Suicide and Crisis Lifeline',
        'or text home to seven four one seven four one',
      ]) {
        expect(await scored(said(line, 'ok.'), { crisisRisk: () => false })).toBe(0);
      }
    });

    it('a hard week that is not a crisis is still scored', async () => {
      expect(isCrisisCall(CALL, () => false)).toBe(false);
      const hard = said('How was work?', 'Work has been brutal and I am wiped.');
      expect(isCrisisCall(hard, () => false)).toBe(false);
      expect(await scored(hard)).toBe(1);
    });

    it('MINOR_CARE: another session of this caller sounded under 18 (writeHeld)', async () => {
      vi.stubEnv('MINOR_CARE', 'on');
      resetMinorCare();
      bindSessionUser('earlier-call', CALL.userId);
      noteCallerWords('earlier-call', "I'm 15.");
      expect(await scored(CALL)).toBe(0);
      resetMinorCare();
      expect(await scored(CALL)).toBe(1);
    });
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

describe('after-call skips a crisis call', () => {
  const CRISIS_CALL = {
    userId: 'u-2',
    sessionId: 's-2',
    startedAt: new Date('2026-10-18T15:00:00Z'),
    turns: [
      { role: 'assistant', content: 'How are things going?' },
      { role: 'user', content: "I'm planning to end it all tonight" },
    ],
  };

  it('makes no model call and writes nothing when a caller turn is a crisis', async () => {
    const llm = vi.fn(async () => '{"mood":0.1}');
    const save = vi.fn(async (_u: string, _s: WellbeingSnapshot) => true);
    await recordWellbeingAfterCall(CRISIS_CALL, {
      llm,
      save,
      env: { WELLBEING_AFTER_CALL: 'on' },
    });
    expect(llm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
