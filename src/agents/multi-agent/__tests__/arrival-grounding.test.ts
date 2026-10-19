/**
 * ARRIVAL_LINE_GROUNDED: a teammate's first line restates only the caller's words or is a
 * plain hello, and is never recorded as summary or fact input.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const log: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  log.child = () => log;
  return { createLogger: () => log, getLogger: () => log };
});
vi.mock('../../../services/diagnostic-logger.js', () => ({ diag: { entry: vi.fn() } }));
vi.mock('../../../conversation/advanced-humanization-integration.js', () => ({
  recordAgentResponse: vi.fn(),
  recordAdviceGiven: vi.fn(),
}));

import type { SessionServices } from '../../../services/index.js';
import type { UserData } from '../../shared/types.js';
import { recordCommittedAgentReply } from '../../voice-agent/agent-reply-recorder.js';
import {
  addedWords,
  clearHeldLines,
  heldOutOfMemory,
  holdOutOfMemory,
} from '../arrival-grounding.js';
import { assistantTranscriptHandler } from '../assistant-transcript.js';
import { prepareBriefing, type BriefInput } from '../handoff-brief.js';
import { createAgentOrchestrator, type PersonaAgent } from '../orchestrator.js';

const ON = { ARRIVAL_LINE_GROUNDED: 'on' };
const OFF = { ARRIVAL_LINE_GROUNDED: 'off' };

afterEach(() => {
  clearHeldLines();
  vi.unstubAllEnvs();
});

describe('addedWords: what a first line says that the caller never did', () => {
  const cases: Array<{ name: string; caller: string; line: string; dropped: boolean }> = [
    {
      name: 'an invented offer and feeling',
      caller: 'Can I talk to Jordan?',
      line: "Ferni told me you're weighing the offer and already feeling fried.",
      dropped: true,
    },
    {
      name: 'an invented riff',
      caller: 'Can I talk to Maya?',
      line: "Sounds like you're missing something, or maybe it's just playing hide and seek.",
      dropped: true,
    },
    {
      name: 'a topic the claim filter misses',
      caller: 'Can I talk to Jordan about retirement?',
      line: 'Hey, Jordan here! Sounds like a lot going on with a job offer.',
      dropped: true,
    },
    {
      name: 'a guessed feeling about what they did say',
      caller: 'I want to go over my retirement savings.',
      line: 'Retirement savings, that must be stressful.',
      dropped: true,
    },
    {
      name: 'their own words back',
      caller: 'Can I talk to Jordan about my retirement savings?',
      line: "Hey, it's Jordan. Retirement savings, let's dig in.",
      dropped: false,
    },
    {
      name: 'their words give or take an ending',
      caller: "I'm moving to Denver next month.",
      line: 'Hey! The move to Denver, tell me.',
      dropped: false,
    },
    {
      name: 'a plain hello',
      caller: 'Can I talk to Peter?',
      line: "Hey, Peter here. I'm listening.",
      dropped: false,
    },
  ];
  it.each(cases)('$name: dropped=$dropped', ({ caller, line, dropped }) => {
    expect(addedWords(line, [caller]).length > 0).toBe(dropped);
  });

  it('allows the caller name and the moment the director was given', () => {
    const grounds = ['Can I talk to Peter?', 'Sam', 'about 1 AM for them, late at night'];
    expect(addedWords('Hey Sam, late night, huh? Peter here.', grounds)).toEqual([]);
    expect(addedWords('Hey Sam, late night, huh? Peter here.', ['Can I talk to Peter?'])).toEqual(
      expect.arrayContaining(['sam', 'late', 'night'])
    );
  });
});

const input = (callerLines: string[]): BriefInput => ({
  fromName: 'Ferni',
  toName: 'Jordan Taylor',
  toPersonaId: 'jordan-taylor',
  turns: callerLines.map((text) => ({ speaker: 'caller' as const, text })),
  remembered: [],
});

const brief = (callerLines: string[], written: string, env: Record<string, string>) => {
  const actor = vi.fn(async () => written);
  const done = prepareBriefing(input(callerLines), "Hey, it's Jordan.", {
    actor,
    writer: async () => undefined,
    budgetMs: 200,
    env,
  });
  return { actor, done };
};

describe('prepareBriefing with ARRIVAL_LINE_GROUNDED', () => {
  it('writes no line when the caller only asked for the teammate: the plain hello is said', async () => {
    const { actor, done } = brief(['Can I talk to Jordan?'], 'Ready to talk about the offer?', ON);
    expect((await done).firstLine).toBeUndefined();
    expect(actor).not.toHaveBeenCalled();
  });

  it('drops a line that adds a topic the caller never said', async () => {
    const caller = ['Can I talk to Jordan about retirement?'];
    const invented = 'Hey, Jordan here! Sounds like a lot going on with a job offer.';
    expect((await brief(caller, invented, ON).done).firstLine).toBeUndefined();
  });

  it('keeps a line that restates the caller', async () => {
    const caller = ['Can I talk to Jordan about my retirement savings?'];
    const line = "Hey, it's Jordan. Retirement savings, let's dig in.";
    expect((await brief(caller, line, ON).done).firstLine).toBe(line);
  });

  it('flag off: unchanged, the director writes even for a name-only ask and the topic line stays', async () => {
    const nameOnly = brief(['Can I talk to Jordan?'], "Hey, it's Jordan, I'm here.", OFF);
    expect((await nameOnly.done).firstLine).toBe("Hey, it's Jordan, I'm here.");
    expect(nameOnly.actor).toHaveBeenCalledTimes(1);
    const invented = 'Hey, Jordan here! Sounds like a lot going on with a job offer.';
    const caller = ['Can I talk to Jordan about retirement?'];
    expect((await brief(caller, invented, OFF).done).firstLine).toBe(invented);
  });
});

describe('a held first line', () => {
  const line = "Hey, it's Jordan. Retirement savings, let's dig in.";

  it('matches whole, with markup, or cut short; not other lines or sessions', () => {
    holdOutOfMemory('s1', line, ON);
    expect(heldOutOfMemory('s1', line, ON)).toBe(true);
    expect(heldOutOfMemory('s1', `<emotion value="warm"/>${line}`, ON)).toBe(true);
    expect(heldOutOfMemory('s1', "Hey, it's Jordan. Retirement", ON)).toBe(true);
    expect(heldOutOfMemory('s1', 'Hey', ON)).toBe(false);
    expect(heldOutOfMemory('s1', 'What are you saving for?', ON)).toBe(false);
    expect(heldOutOfMemory('s2', line, ON)).toBe(false);
  });

  it('expires', () => {
    holdOutOfMemory('s1', line, ON, 0);
    expect(heldOutOfMemory('s1', line, ON, 11 * 60_000)).toBe(false);
  });

  it('flag off: nothing is held', () => {
    holdOutOfMemory('s1', line, OFF);
    expect(heldOutOfMemory('s1', line, ON)).toBe(false);
    holdOutOfMemory('s1', line, ON);
    expect(heldOutOfMemory('s1', line, OFF)).toBe(false);
  });
});

describe('the first line never reaches summary or fact input', () => {
  const arrival = 'Hey Sam, Jordan here! Sounds like you are weighing the offer.';
  const reply = 'What would make the offer feel right to you?';
  const record = async (text: string) => {
    const services = {
      addTurn: vi.fn(),
      humorCalibration: { recordHumorAttempt: vi.fn() },
      storyPreference: { recordStory: vi.fn() },
    };
    const item = llm.ChatMessage.create({ role: 'assistant', content: text });
    await recordCommittedAgentReply(
      {
        sessionId: 's1',
        services: services as unknown as SessionServices,
        userData: {} as UserData,
      },
      item
    );
    return services.addTurn;
  };
  const threaded = (text: string) => {
    const save = vi.fn(async () => undefined);
    const handler = assistantTranscriptHandler(() => ({ userId: 'u1', sessionId: 's1' }), save);
    handler({ item: { type: 'message', role: 'assistant', textContent: text } });
    return save;
  };

  it('flag on: the session turns (summary and after-call input) and the thread skip it', async () => {
    vi.stubEnv('ARRIVAL_LINE_GROUNDED', 'on');
    holdOutOfMemory('s1', arrival);
    expect(await record(arrival)).not.toHaveBeenCalled();
    expect(threaded(arrival)).not.toHaveBeenCalled();
    expect(await record(reply)).toHaveBeenCalledWith('assistant', reply);
    expect(threaded(reply)).toHaveBeenCalledTimes(1);
  });

  it('flag off: recorded as before', async () => {
    vi.stubEnv('ARRIVAL_LINE_GROUNDED', 'off');
    holdOutOfMemory('s1', arrival);
    expect(await record(arrival)).toHaveBeenCalledWith('assistant', arrival);
    expect(threaded(arrival)).toHaveBeenCalledTimes(1);
  });
});

describe('the orchestrator holds whatever the teammate says first', () => {
  const handoff = async () => {
    const said: Record<string, string[]> = {};
    const createPersonaAgent = vi.fn(async (personaId: string): Promise<PersonaAgent> => {
      const lines: string[] = (said[personaId] = []);
      return {
        id: personaId,
        personaId,
        isActive: false,
        session: { history: { items: [] } },
        cleanup: vi.fn().mockResolvedValue(undefined),
        say: (text: string) => void lines.push(text),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      };
    });
    const orchestrator = createAgentOrchestrator({
      ctx: {} as never,
      room: {} as never,
      userParticipant: {} as never,
      createPersonaAgent,
      sessionId: 'arrive-test',
    });
    await orchestrator.start('ferni');
    expect(
      (await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'x' })).success
    ).toBe(true);
    return said['peter-john']?.[0] ?? '';
  };

  it('flag on: the arrival line is held out of memory', async () => {
    vi.stubEnv('ARRIVAL_LINE_GROUNDED', 'on');
    const line = await handoff();
    expect(line).not.toBe('');
    expect(heldOutOfMemory('arrive-test', line)).toBe(true);
  });

  it('flag off: nothing is held', async () => {
    vi.stubEnv('ARRIVAL_LINE_GROUNDED', 'off');
    const line = await handoff();
    vi.stubEnv('ARRIVAL_LINE_GROUNDED', 'on');
    expect(heldOutOfMemory('arrive-test', line)).toBe(false);
  });
});
