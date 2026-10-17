/**
 * Briefed handoffs (BRIEFED_HANDOFF): the brief, its fallbacks, and the orchestrator
 * using it for the teammate's prompt and first line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  reply: (_system: string): string | undefined => undefined,
}));

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
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async ({ systemInstruction }: { systemInstruction?: string }) => ({
    generateContent: async () => ({
      response: { text: () => models.reply(systemInstruction ?? '') ?? '' },
    }),
  }),
}));

import {
  BRIEF_MAX_CHARS,
  NO_TOPIC,
  briefedHandoffs,
  formatBrief,
  groundBrief,
  groundedReason,
  parseBrief,
  plainBrief,
  prepareBriefing,
  readConversation,
  ungroundedClaim,
  type BriefInput,
} from '../handoff-brief.js';
import { createAgentOrchestrator, type PersonaAgent } from '../orchestrator.js';
import { withoutStockOpener } from '../handoff-arrival.js';

const msg = (role: string, text: string) => ({ type: 'message', role, textContent: text });

const CALL = [
  msg('system', 'You are Ferni.'),
  msg('assistant', 'Hey Sam, how is your evening going?'),
  msg('user', "I got a job offer from a startup in Denver. It pays one forty, I'm at one fifteen."),
  msg(
    'system',
    '[WHAT YOU REMEMBER ABOUT SAM]\n- Sam: partner = Ana\n- Sam: city = Austin\nThese are from past calls.'
  ),
  msg('assistant', 'That is a real jump.'),
  msg(
    'user',
    "I can't tell if the equity is worth anything. Can I talk to Peter about the money side?"
  ),
];

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  fromName: 'Ferni',
  toName: 'Peter',
  toPersonaId: 'peter-john',
  ...readConversation({ history: { items: CALL } }),
  ...over,
});

afterEach(() => {
  models.reply = () => undefined;
  delete process.env.BRIEFED_HANDOFF;
});

describe('briefedHandoffs', () => {
  it('is on only for BRIEFED_HANDOFF=on', () => {
    expect(briefedHandoffs({})).toBe(false);
    expect(briefedHandoffs({ BRIEFED_HANDOFF: 'true' })).toBe(false);
    expect(briefedHandoffs({ BRIEFED_HANDOFF: 'on' })).toBe(true);
  });
});

describe('readConversation', () => {
  it("keeps the caller's and persona's lines and the recalled facts, not instructions", () => {
    const { turns, remembered } = readConversation({ history: { items: CALL } });
    expect(turns.map((t) => t.speaker)).toEqual(['persona', 'caller', 'persona', 'caller']);
    expect(turns[1].text).toContain('Denver');
    expect(remembered).toEqual(['Sam: partner = Ana', 'Sam: city = Austin']);
    expect(JSON.stringify(turns)).not.toContain('You are Ferni');
  });

  it('reads nothing from a session without history', () => {
    expect(readConversation(null)).toEqual({ turns: [], remembered: [] });
  });
});

describe('plainBrief', () => {
  it("quotes the caller's own last words, never the model's reason", () => {
    const brief = plainBrief(input({ reason: 'Wants help valuing startup equity' }));
    expect(brief.why).toContain('In their words: "I can\'t tell if the equity is worth anything');
    expect(brief.why).not.toContain('valuing');
    expect(brief.discussed).toContain('one forty');
  });
});

describe('parseBrief', () => {
  it('takes the JSON, fenced or not, and refuses one without a reason', () => {
    const raw =
      '```json\n{"why":"Valuing the equity in a Denver offer","facts":["Sam: partner = Ana",""]}\n```';
    expect(parseBrief(raw)).toEqual({
      why: 'Valuing the equity in a Denver offer',
      discussed: undefined,
      open: undefined,
      mood: undefined,
      facts: ['Sam: partner = Ana'],
    });
    expect(parseBrief('{"discussed":"x"}')).toBeNull();
    expect(parseBrief('not json')).toBeNull();
  });
});

describe('formatBrief', () => {
  it('stays within the budget, dropping whole lines, and says not to re-ask', () => {
    const long = 'x'.repeat(150);
    const text = formatBrief(
      { why: long, discussed: long, open: long, mood: long, facts: [long, long] },
      'Ferni'
    );
    const content = text.split('\n').slice(1, -1).join('');
    expect(content.length).toBeLessThanOrEqual(BRIEF_MAX_CHARS);
    expect(text.startsWith('[HANDOFF BRIEF from Ferni')).toBe(true);
    expect(text).toContain('Never ask them to explain again');
    expect(text).not.toContain('From past calls'); // the last line didn't fit
  });
});

describe('prepareBriefing', () => {
  it("uses the model's brief and the director's first line", async () => {
    const actor = vi.fn(async () => 'Hey Sam. Is the equity in that Denver offer worth anything?');
    const out = await prepareBriefing(input(), 'Hey there! Peter here.', {
      writer: async () =>
        '{"why":"Whether the equity in the Denver offer is worth anything","open":"what the equity is worth"}',
      actor,
    });
    expect(out.brief).toContain(
      'Why they came to you: In their words: "I can\'t tell if the equity'
    );
    expect(out.brief).toContain('Still open: what the equity is worth');
    expect(out.firstLine).toBe('Hey Sam. Is the equity in that Denver offer worth anything?');
    const [system, prompt] = actor.mock.calls[0] as unknown as [string, string];
    expect(system).toContain('You are Peter');
    expect(prompt).toContain('equity is worth anything'); // the caller's words
    expect(prompt).not.toContain('That is a real jump'); // Ferni's lines aren't Peter's
  });

  it('falls back to the plain brief and the old line when the models are late or fail', async () => {
    const out = await prepareBriefing(input({ reason: 'Help with the equity question' }), 'Hi!', {
      writer: () => new Promise<string | undefined>(() => {}), // never answers
      actor: async () => {
        throw new Error('down');
      },
      budgetMs: 30,
    });
    expect(out.brief).toContain(
      'Why they came to you: In their words: "I can\'t tell if the equity'
    );
    expect(out.firstLine).toBeUndefined();
  });
});

describe('grounding: the brief holds only what the caller said', () => {
  // Prod 2026-10-13, synthetic words: the caller only asked for a teammate by name; the
  // handoff tool's reason, the brief writer and the first line each supplied a topic.
  const byName = (over: Partial<BriefInput> = {}): BriefInput =>
    input({
      toName: 'Jordan',
      toPersonaId: 'jordan-taylor',
      turns: [
        { speaker: 'caller', text: 'You stopped talking.' },
        { speaker: 'persona', text: "Sorry! So, since you're weighing the offer, what's next?" },
        { speaker: 'caller', text: 'Hey, can I talk to Jordan?' },
      ],
      remembered: ['Sam: partner = Ana'],
      reason: 'Help with retirement planning',
      ...over,
    });
  const run = async (
    over: Partial<BriefInput> = {},
    said = "Hey Sam! Ferni told me you're weighing the offer.",
    written = '{"why":"Weighing the job offer","discussed":"A new offer from a bank"}'
  ) => {
    const actor = vi.fn(async (..._args: unknown[]) => said);
    const writer = vi.fn(async (..._args: unknown[]) => written);
    const out = await prepareBriefing(byName(over), 'Hey, it’s Jordan.', { writer, actor });
    return {
      out,
      cue: JSON.stringify(actor.mock.calls[0] ?? []),
      prompt: String(writer.mock.calls[0]?.[1] ?? ''),
    };
  };

  it('greets without a topic when the caller only asked for the teammate', async () => {
    const { out, cue, prompt } = await run();
    expect(out.brief).toContain(`Why they came to you: ${NO_TOPIC}`);
    expect(out.brief).not.toMatch(/offer|retirement|bank/i);
    expect(cue).not.toMatch(/offer|retirement|Ana/);
    expect(cue).toContain('only asked for you by name');
    // the outgoing persona's lines never reach the writer: "the offer" was Ferni's
    expect(prompt).not.toContain('offer');
    // the director's invented "Ferni told me…" is not spoken: the plain line is
    expect(out.firstLine).toBeUndefined();
  });

  it('keeps a first line that only greets, minus a stock opener', async () => {
    expect((await run({}, 'Hey Sam! Good to hear you.')).out.firstLine).toBe(
      'Hey Sam! Good to hear you.'
    );
    // Prod 2026-10-17: the call was well under way; "what do you want to get into" isn't.
    const { out } = await run({}, 'Hey Sam! What do you want to get into?');
    expect(out.firstLine).toBe('Hey Sam!');
  });

  it("drops the writer's additions and keeps the caller's own words", async () => {
    const turns = [
      {
        speaker: 'caller' as const,
        text: 'Hey Jordan, can you help me do some planning for the move?',
      },
    ];
    const { out } = await run(
      { turns, reason: undefined },
      "Hi! Ferni said you're planning the move.",
      '{"why":"Weighing the new job offer before the move","open":"Which offer pays more"}'
    );
    expect(out.brief).toContain(
      'Why they came to you: In their words: "Hey Jordan, can you help me'
    );
    expect(out.brief).not.toContain('offer');
    expect(out.firstLine).toBe("Hi! Ferni said you're planning the move."); // grounded
  });

  it('keeps a reason only when the caller said it', () => {
    expect(groundedReason('Help with the equity question', ['Is the equity worth it?'])).toBe(
      'Help with the equity question'
    );
    expect(groundedReason('Help with retirement planning', ['Hey, can I talk to Jordan?'])).toBe(
      undefined
    );
    expect(
      groundedReason('Help with retirement planning', ['Can you help me do some planning?'])
    ).toBe(undefined); // "retirement" is the model's
  });

  it('knows a claim about the caller from a greeting', () => {
    const asked = ['Hey, can I talk to Jordan?'];
    expect(ungroundedClaim("Ferni told me you're weighing the offer.", asked)).toBe(true);
    expect(ungroundedClaim("Hey! You're weighing the offer, right?", asked)).toBe(true);
    expect(ungroundedClaim('Hey, it’s Jordan. What would you like to get into?', asked)).toBe(
      false
    );
    expect(ungroundedClaim('Ferni said you wanted to talk to me!', asked)).toBe(false);
    expect(
      ungroundedClaim("Ferni said you're not sure the equity is worth it.", [
        'Is the equity worth it?',
      ])
    ).toBe(false);
  });

  it('refuses a reason or a writer field with one detail the caller never gave', async () => {
    const turns = [
      {
        speaker: 'caller' as const,
        text: 'Can I talk to Peter? I need help with a budget for my trip.',
      },
    ];
    const { out, cue } = await run(
      { turns, reason: 'budget for the Paris trip', toName: 'Peter', toPersonaId: 'peter-john' },
      "Hey! Let's get that Paris trip budget sorted.",
      '{"why":"A budget for the Paris trip","discussed":"Money worries and the divorce","mood":"anxious about offer"}'
    );
    expect(out.brief).not.toMatch(/Paris|divorce|offer/);
    expect(cue).not.toContain('Paris');
    expect(out.firstLine).toBeUndefined();
    expect(groundedReason('budget for the Paris trip', ['help me with a budget for my trip'])).toBe(
      undefined
    );
  });

  it('keeps a mood only when it is a feeling', async () => {
    const calm = await run({}, 'Hi!', '{"why":"x","mood":"a bit stressed"}');
    expect(calm.out.brief).toContain('How they seem: a bit stressed');
    const topical = await run({}, 'Hi!', '{"why":"x","mood":"anxious about offer"}');
    expect(topical.out.brief).not.toContain('How they seem');
  });

  it('drops invented first lines that make no "told me" claim', () => {
    const asked = ['Hey, can I talk to Jordan?'];
    for (const line of [
      'So, the offer. Big decision!',
      "How's the new job thing going?",
      'Hi! I hear the offer came through.',
      'Congrats on the offer!',
      "Hey! You've been weighing the offer, huh?",
      'Ferni let me know about your offer.',
      "Ferni said you're planning the move. Ferni also told me about the job offer.",
    ]) {
      expect(ungroundedClaim(line, asked), line).toBe(true);
    }
  });

  it('keeps warm, grounded first lines', () => {
    const asked = ['Hey, can I talk to Jordan?'];
    for (const line of [
      'I heard you asked for me! What are we getting into?',
      "Hey, you're talking to Jordan now.",
      "Glad you're calling.",
      'Good to hear your voice. What would you like to dig into today?',
    ]) {
      expect(ungroundedClaim(line, asked), line).toBe(false);
    }
    expect(ungroundedClaim("Ferni said you're moving to Denver!", ['A move to Denver.'])).toBe(
      false
    );
    expect(
      ungroundedClaim("Ferni said you're planning a wedding.", ['I need to plan my wedding'])
    ).toBe(false);
  });

  it('never takes the writer\'s paraphrase of why: a dropped "not" still matches every word', async () => {
    const turns = [
      {
        speaker: 'caller' as const,
        text: "I'm not quitting my job, I just want to talk to Jordan about vacation.",
      },
    ];
    const { out } = await run({ turns, reason: undefined }, 'Hi!', '{"why":"quitting job"}');
    expect(out.brief).toContain('Why they came to you: In their words: "I\'m not quitting my job');
  });

  it('keeps only recalled facts that were in the notes, marked as from past calls', () => {
    const grounded = groundBrief(
      { why: 'x', facts: ['Sam: partner = Ana', 'Sam: offer = bank job'] },
      byName()
    );
    expect(grounded.facts).toEqual(['Sam: partner = Ana']);
    expect(formatBrief(grounded, 'Ferni')).toContain('From past calls (not said today)');
  });
});

describe('orchestrator with BRIEFED_HANDOFF', () => {
  const agentsFor = () => {
    const made: Array<{
      personaId: string;
      context: Record<string, unknown>;
      agent: PersonaAgent;
    }> = [];
    const createPersonaAgent = vi.fn(async (personaId: string, context: unknown) => {
      const agent: PersonaAgent = {
        id: `${personaId}-${made.length}`,
        personaId,
        isActive: false,
        session: { history: { items: CALL } },
        cleanup: vi.fn().mockResolvedValue(undefined),
        say: vi.fn(),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      };
      made.push({ personaId, context: context as Record<string, unknown>, agent });
      return agent;
    });
    const orchestrator = createAgentOrchestrator({
      ctx: {} as never,
      room: {} as never,
      userParticipant: {} as never,
      createPersonaAgent,
      sessionId: 'brief-test',
    });
    return { orchestrator, made };
  };

  it('gives the teammate the brief and opens with the briefed line', async () => {
    process.env.BRIEFED_HANDOFF = 'on';
    models.reply = (system) =>
      system.startsWith('You brief a teammate')
        ? '{"why":"Whether the startup equity in the Denver offer is worth anything"}'
        : system.startsWith('You are Peter')
          ? 'Hey Sam. Ferni says the Denver offer is a startup one?'
          : undefined;
    const { orchestrator, made } = agentsFor();
    await orchestrator.start('ferni');
    const result = await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'equity' });
    expect(result.success).toBe(true);
    const peter = made.find((m) => m.personaId === 'peter-john')!;
    expect(peter.context.conversationSummary).toContain(
      'Why they came to you: In their words: "I can\'t tell if the equity'
    );
    expect(peter.agent.say).toHaveBeenCalledWith(
      'Hey Sam. Ferni says the Denver offer is a startup one?',
      expect.anything()
    );
  });

  it('is unchanged with the flag off: no brief, the old arrival line', async () => {
    models.reply = () => {
      throw new Error('no model call expected for the handoff');
    };
    const { orchestrator, made } = agentsFor();
    await orchestrator.start('ferni').catch(() => undefined);
    await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'equity' });
    const peter = made.find((m) => m.personaId === 'peter-john')!;
    expect(String(peter.context.conversationSummary ?? '')).not.toContain('HANDOFF BRIEF');
    const said = (peter.agent.say as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(said).not.toContain('Denver');
  });
});

describe('the arriving line on a call already under way (prod call 2026-10-17)', () => {
  // About 1 a.m. for the caller (New York), well into the call; they only asked for the teammate.
  const lateCall = (): BriefInput =>
    input({
      fromName: 'Alex',
      toName: 'Ferni',
      toPersonaId: 'ferni',
      turns: [
        { speaker: 'caller', text: 'So what is your job, Alex?' },
        { speaker: 'persona', text: 'Logistics, mostly.' },
        { speaker: 'caller', text: 'Oh, really?' },
        { speaker: 'caller', text: 'Transfer me to Ferni.' },
      ],
      reason: undefined,
      timeZone: 'America/New_York',
    });
  const NOW = new Date('2026-10-17T05:10:00Z');

  async function arrive(said: string, env: Record<string, string> = {}) {
    const actor = vi.fn(async (..._args: unknown[]) => said);
    const out = await prepareBriefing(lateCall(), 'Hey, I am back with you.', {
      writer: async () => undefined,
      actor,
      env,
      now: NOW,
    });
    return { out, cue: JSON.stringify(actor.mock.calls[0] ?? []) };
  }

  it('tells the director the call is under way and the hour, not to ask a stock opener', async () => {
    const { cue } = await arrive('Hey Seth.');
    expect(cue).toContain('already under way');
    expect(cue).toContain('talking with Alex for a while');
    expect(cue).toContain('about 1 AM for them, late at night');
    expect(cue).not.toContain("ask what they'd like to get into");
    expect(cue).toContain('never ask a stock opener');
  });

  it('cuts the stock openers the call heard, keeping the hello', async () => {
    const heard: Array<[string, string | undefined]> = [
      ["Hey Seth, I'm here. What would you like to dive into today?", "Hey Seth, I'm here."],
      ['Hello there. What would you like to get into today?', 'Hello there.'],
      ['Hi Seth, Peter here. What would you like to get into today?', 'Hi Seth, Peter here.'],
      ['What would you like to get into?', undefined], // nothing left: the canned line plays
    ];
    for (const [said, kept] of heard) expect((await arrive(said)).out.firstLine, said).toBe(kept);
    expect(withoutStockOpener("Still up? Me too, it's quiet here.")).toBe(
      "Still up? Me too, it's quiet here."
    );
  });

  it('HANDOFF_ARRIVAL_CONTEXT=off brings back the old cue and line', async () => {
    const { out, cue } = await arrive('Hello there. What would you like to get into today?', {
      HANDOFF_ARRIVAL_CONTEXT: 'off',
    });
    expect(out.firstLine).toBe('Hello there. What would you like to get into today?');
    expect(cue).not.toContain('already under way');
  });
});
