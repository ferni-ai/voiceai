/**
 * DIRECTOR_DIRECTS: the director gives direction to the persona on the call
 * (subtext, what bears on it, what the character wants, the beat), knows that
 * persona from its own sheet, and never polices delivery or scripts a line.
 * Off, every prompt is the one prod sends today (director-prompts.golden.json,
 * shared with DIRECTOR_SEES_SCENE).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.hoisted(() =>
  vi.fn(async (_prompt: string) => ({ response: { text: () => 'NONE' } }))
);
const getGenerativeModel = vi.hoisted(() =>
  vi.fn(async (_opts: { systemInstruction: string }) => ({ generateContent }))
);
vi.mock('../../../config/generative-model.js', () => ({ getGenerativeModel }));

import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { buildDeliberationPrompt, Deliberator, type ThinkFn } from '../deliberation.js';
import {
  castFor,
  directorDirects,
  directsDeliberationSystem,
  directsSystem,
  policesDelivery,
  readsMind,
  scriptedNote,
  sheetForDirector,
  transcriptNote,
} from '../director-directs.js';
import { Director, getDirector, parseNotes, type Line } from '../director-notes.js';
import { capturePrompts, type Captured } from './director-prompts-golden.js';

const GOLDEN = JSON.parse(
  readFileSync(new URL('./director-prompts.golden.json', import.meta.url), 'utf8')
) as Captured;

afterEach(() => {
  vi.unstubAllEnvs();
  generateContent.mockClear();
  getGenerativeModel.mockClear();
});

const CALL: Line[] = [
  { speaker: 'user', text: 'So I finally told my boss I am taking the promotion in Lisbon.' },
  { speaker: 'ferni', text: 'Lisbon. That is a big yes.' },
  { speaker: 'user', text: 'My mom cried on the phone, though. I keep hearing it.' },
  { speaker: 'ferni', text: 'Yeah. That stays with you.' },
];

/** What the real Director sends its writer for a persona, and what it keeps of `reply`. */
async function directed(
  personaId: string,
  reply = 'NONE'
): Promise<{ system: string; prompt: string; notes: string[]; dropped: number }> {
  let asked = { system: '', prompt: '' };
  const director = new Director({
    sessionId: 's',
    userName: 'Sam',
    writer: async (system, prompt) => {
      asked = { system, prompt };
      return reply;
    },
    personaId: () => personaId,
  });
  await director.observe(CALL);
  return { ...asked, notes: director.current(), dropped: director.droppedAsCritique() };
}

describe('flag off: byte-identical to prod', () => {
  it('is off by default and only "on" turns it on', () => {
    expect(directorDirects({})).toBe(false);
    expect(directorDirects({ DIRECTOR_DIRECTS: 'off' })).toBe(false);
    expect(directorDirects({ DIRECTOR_DIRECTS: 'on' })).toBe(true);
  });

  it('sends exactly the golden prompts, unset or off, even when told the persona', async () => {
    expect(await capturePrompts()).toEqual(GOLDEN);
    expect(await capturePrompts({ DIRECTOR_DIRECTS: 'off' }, 'nayan-patel')).toEqual(GOLDEN);
  });

  it('changes the prompts once on (the golden comparison can fail)', async () => {
    const on = await capturePrompts({ DIRECTOR_DIRECTS: 'on' }, 'nayan-patel');
    expect(on['director.default.ferni']).not.toEqual(GOLDEN['director.default.ferni']);
    expect(on['deliberation.default.reflect']).not.toEqual(GOLDEN['deliberation.default.reflect']);
    // The anticipate arm keeps its own instructions.
    expect(on['deliberation.default.anticipate']).toEqual(
      GOLDEN['deliberation.default.anticipate']
    );
  });
});

describe('the director directs the persona on the call', () => {
  it('reads how the character is with people and how they talk from the sheet', async () => {
    const sheet =
      "# X\n\n## Your life\nlife\n\n## How you are with people\nkind\n\n## How you talk\nslow\n\n## Lines you don't cross\nnone";
    expect(sheetForDirector(sheet)).toBe('kind\n\nslow');
    expect(sheetForDirector(null)).toBe('');
    const nayan = await castFor('nayan-patel');
    expect(nayan.name).toBe('Nayan');
    expect(nayan.p.subject).toBe('he');
    expect(nayan.sheet).toContain('You listen more than you talk');
    expect(nayan.sheet).not.toContain('Vadodara'); // his life is not the director's brief
  });

  it("frames the request for the persona, with that persona's own sheet, not Ferni's", async () => {
    vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    const nayan = await directed('nayan-patel');
    const maya = await directed('maya-santos');
    expect(nayan.system).toContain('You direct Nayan');
    expect(nayan.system).toContain('You say less than most people, and slower.');
    expect(nayan.system).not.toContain('Wyoming');
    expect(nayan.prompt).toContain('Nayan: Lisbon. That is a big yes.');
    expect(nayan.prompt).not.toContain('Ferni:');
    expect(maya.system).toContain('You direct Maya');
    expect(maya.system).toContain((await castFor('maya-santos')).sheet.slice(0, 80));
    expect(maya.system).not.toContain('You say less than most people, and slower.');
  });

  it("asks for direction and the character's intention, never delivery notes or lines", () => {
    const s = directsSystem({
      name: 'Nayan',
      p: { subject: 'he', object: 'him', possessive: 'his' },
      sheet: '',
    });
    expect(s).toContain('never about the delivery');
    expect(s).toContain('to let it land');
    expect(s).toContain("doesn't end every reply on a question");
    expect(s).toContain("when he wouldn't ask anything here");
    expect(s).toContain('Never write lines or quote words for him to say.');
    expect(s).not.toMatch(/habit of Nayan's to drop/);
  });

  it("keeps main's guard rule (#2266) in the director's and the deliberator's prompts", () => {
    const cast: Parameters<typeof directsSystem>[0] = {
      name: 'Nayan',
      p: { subject: 'he', object: 'him', possessive: 'his' },
      sheet: '',
    };
    expect(directsSystem(cast)).toContain('Never suggest Nayan drop or soften a boundary');
    expect(directsSystem(cast)).toContain('honest that he is an AI');
    expect(directsDeliberationSystem(cast)).toContain('Never suggest Nayan drop or soften');
    expect(directsDeliberationSystem(cast)).toContain('Your thought is private');
  });

  it('with DIRECTOR_SEES_SCENE on too, directs from the sheet and adds the scene', async () => {
    vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    let asked = { system: '', prompt: '' };
    const director = new Director({
      sessionId: 's',
      userName: 'Sam',
      writer: async (system, prompt) => {
        asked = { system, prompt };
        return 'NONE';
      },
      personaId: () => 'nayan-patel',
    });
    await director.observe(CALL, { personaId: 'nayan-patel', scene: { caller: 'sister Ana' } });
    expect(asked.system).toContain('You direct Nayan');
    expect(asked.prompt).toContain('SCENE (background for your direction');
    expect(asked.prompt).toContain('sister Ana');
    expect(asked.prompt).toContain('Nayan: Lisbon. That is a big yes.');
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'off');
    await director.observe(CALL, { personaId: 'nayan-patel', scene: { caller: 'sister Ana' } });
    expect(asked.system).toContain('You direct Nayan');
    expect(asked.prompt).not.toContain('SCENE');
  });
});

describe('the guard: no style policing, no scripted lines', () => {
  const policing = [
    'Drop the cheerleader voice; her mom cried.',
    'He is repeating "just" and "absolutely", tell him to watch his filler words.',
    'Drop the questions. Her mom cried, that is the thing.',
    "Don't let Ferni sound too clinical about her mom.",
    'He sounds a bit hesitant; keep the delivery steadier.',
  ];
  const direction = [
    'To let it land: her mom cried, the cost of Lisbon she has not said out loud.',
    'Nayan has nothing he needs to ask here; he would let it sit that her mom cried.',
    'She keeps hearing it: the promotion is fine, the goodbye is the scene.',
  ];

  it('tells delivery notes from direction', () => {
    for (const n of policing) expect(policesDelivery(n), n).toBe(true);
    for (const n of direction) expect(policesDelivery(n), n).toBe(false);
    // The caller sounding a way is about them, not the actor's delivery.
    expect(policesDelivery('They sounded a bit tentative about Lisbon.')).toBe(false);
  });

  it('drops scripted lines but lets a note quote the caller', () => {
    expect(scriptedNote('Say: "Lisbon will still be there."')).toBe(true);
    expect(scriptedNote('Try "that must have been a lot to hear" here.')).toBe(true);
    expect(
      scriptedNote('She said "I keep hearing it": the call is about her mom.', 'I keep hearing it.')
    ).toBe(false);
  });

  it('drops a note written as a line of the call, not a note with a colon', () => {
    const names = ['Riley', 'Maya'];
    expect(transcriptNote('Riley: yes! They called me like twenty minutes ago.', names)).toBe(true);
    expect(transcriptNote('maya: so proud of you', names)).toBe(true);
    expect(transcriptNote('To celebrate: Riley worked a year for this.', names)).toBe(false);
    expect(transcriptNote('Riley kept the portfolio review quiet.', names)).toBe(false);
  });

  it('drops them only with the flag on', () => {
    const reply = [policing[0], direction[0]].join('\n');
    expect(parseNotes(reply, CALL)).toEqual([policing[0], direction[0]]);
    expect(parseNotes(reply, CALL, 'Nayan', { directs: true })).toEqual([direction[0]]);
  });

  it('keeps direction, drops the critique, and counts the drop on a live run', async () => {
    vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    const r = await directed('nayan-patel', `${policing[0]}\n${direction[1]}`);
    expect(r.notes).toEqual([direction[1]]);
    expect(r.dropped).toBe(1);
  });
});

describe('the guard: no mind-reading the caller', () => {
  /** Hand-labelled director notes from the 2026-10-18 bar runs (see the file's `rubric`). */
  const FIXTURE = JSON.parse(
    readFileSync(new URL('./director-mind-reading.fixture.json', import.meta.url), 'utf8')
  ) as { notes: Array<{ note: string; mindReading: boolean; borderline: boolean }> };

  /** What the flag-on parser keeps of one note (no call given, so no content-word check). */
  const kept = (note: string): string[] =>
    parseNotes(note, undefined, 'Maya', { directs: true, names: ['Riley', 'Maya'] });

  function confusion(notes: typeof FIXTURE.notes) {
    const m = { tp: 0, fn: 0, fp: 0, tn: 0 };
    for (const n of notes) {
      const d = readsMind(n.note);
      if (n.mindReading && d) m.tp++;
      else if (n.mindReading) m.fn++;
      else if (d) m.fp++;
      else m.tn++;
    }
    return { ...m, recall: m.tp / (m.tp + m.fn), falsePositive: m.fp / (m.fp + m.tn) };
  }

  it('the fixture is the labelled set it claims to be', () => {
    expect(FIXTURE.notes).toHaveLength(1063);
    expect(FIXTURE.notes.filter((n) => n.mindReading)).toHaveLength(217);
    // Every note was kept by the flag-off parser when it was written.
    expect(FIXTURE.notes.filter((n) => parseNotes(n.note).length === 0)).toEqual([]);
  });

  it('the flag-on parser drops every note the guard flags', () => {
    const flagged = FIXTURE.notes.filter((n) => readsMind(n.note));
    expect(flagged.length).toBeGreaterThan(200);
    expect(flagged.filter((n) => kept(n.note).length > 0).map((n) => n.note)).toEqual([]);
  });

  it('drops >= 90% of mind-reading notes and <= 5% of legitimate ones', () => {
    const all = confusion(FIXTURE.notes);
    expect(all.recall).toBeGreaterThanOrEqual(0.9);
    expect(all.falsePositive).toBeLessThanOrEqual(0.05);
    // The notes a labeller could not call either way are not doing the work.
    const clear = confusion(FIXTURE.notes.filter((n) => !n.borderline));
    expect(clear.recall).toBeGreaterThanOrEqual(0.95);
    expect(clear.falsePositive).toBeLessThanOrEqual(0.01);
  });

  it('drops a feeling or motive pinned on the caller', () => {
    for (const n of [
      'Riley is using the car trouble to escape the pressure of the upcoming raise conversation.',
      'Riley is likely hiding some anxiety about the big move behind the excitement of the job offer.',
      "Riley is downplaying the achievement because they're secretly insecure about the slow time.",
      'Deep down she is afraid the knee will give out again.',
      'He is really afraid of what his mom will say.',
      'Riley is deflecting to the car because asking for a raise feels vulnerable.',
      'Riley is feeling guilty for even considering the move while their mom needs them.',
      "Riley's silence might mean they are feeling self-conscious about celebrating.",
      'She is looking for permission to stop working and rest.',
      "She's likely feeling the financial pressure right now.",
    ])
      expect(readsMind(n), n).toBe(true);
  });

  it('keeps subtext grounded in what they said, and direction', () => {
    for (const n of [
      "Riley said twice the review is Thursday: that's what's on her mind.",
      'She keeps hearing it: the promotion is fine, the goodbye is the scene.',
      "Riley's freaking out about the money; let the size of it land.",
      'Riley changed the subject abruptly to her car; follow her lead.',
      "To explore the roommate's likely reaction to a direct conversation.",
      'To find out what kind of second opinion they actually need from you.',
      'To dig in: ask them to name the thing they are dreading or anticipating this week.',
      'To match her energy without making her feel guilty for sharing.',
      'To avoid filling the silence with easy comfort: she needs someone to stay with her.',
      'Keep it short; a long answer might feel like a lecture right now.',
      "Riley is grieving the physical absence of a companion who's been there fourteen years.",
    ])
      expect(readsMind(n), n).toBe(false);
  });

  it('matches whole words, not substrings', () => {
    expect(readsMind('An unlikely win: Riley ran the whole 5k without walking.')).toBe(false);
    expect(readsMind('Riley is guiltless about the cobbler; celebrate the peaches.')).toBe(false);
    expect(readsMind('Riley is guilty about the cobbler.')).toBe(true);
  });

  it('drops them only with the flag on, and counts the drop on a live run', async () => {
    const mind = 'Riley is likely hiding how much the Lisbon move scares her.';
    const direction =
      'To let it land: her mom cried, the cost of Lisbon she has not said out loud.';
    expect(parseNotes(`${mind}\n${direction}`, CALL)).toEqual([mind, direction]);
    expect(parseNotes(`${mind}\n${direction}`, CALL, 'Nayan', { directs: true })).toEqual([
      direction,
    ]);
    vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    const r = await directed('nayan-patel', `${mind}\n${direction}`);
    expect(r.notes).toEqual([direction]);
    expect(r.dropped).toBe(1);
  });
});

describe('the deliberator thinks as the persona', () => {
  const WEIGHTY =
    "I got the offer in Denver, it's more money and the job I always said I wanted, but my mom just moved in with us and I keep putting off telling her.";

  async function thought(on: boolean): Promise<{ system: string; prompt: string }> {
    if (on) vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    let got = { system: '', prompt: '' };
    const think: ThinkFn = async (system, prompt) => {
      got = { system, prompt };
      return { text: '{"kind":"none"}' };
    };
    const d = new Deliberator({ sessionId: 's', userName: 'Sam', think });
    await d.observe(
      [
        { speaker: 'user', text: WEIGHTY },
        { speaker: 'ferni', text: 'Denver, huh.' },
      ],
      null,
      'Mom moved in last month.',
      '',
      'alex-chen'
    );
    return got;
  }

  it("uses the persona's sheet and name with the flag on, Ferni's prompt off", async () => {
    const off = await thought(false);
    expect(off.system).toContain('Wyoming');
    expect(off.prompt).toContain('Ferni: Denver, huh.');
    vi.unstubAllEnvs();
    const on = await thought(true);
    expect(on.system).toContain("You are Alex's private thoughts");
    expect(on.system).toContain((await castFor('alex-chen')).sheet.slice(0, 80));
    expect(on.system).not.toContain('Wyoming');
    expect(on.prompt).toContain('Alex: Denver, huh.');
    expect(on.prompt).toContain('What Alex remembers');
  });

  it('labels lines as before when no persona is given', () => {
    const lines: Line[] = [{ speaker: 'ferni', text: 'hi', by: 'Maya' }];
    expect(buildDeliberationPrompt(lines, '')).toContain('Ferni: hi');
    expect(buildDeliberationPrompt(lines, '', undefined, '', 'Nayan')).toContain('Maya: hi');
  });
});

describe('live wiring', () => {
  it('hands the live director the persona on the session', async () => {
    vi.stubEnv('DIRECTOR_NOTES', 'on');
    vi.stubEnv('DIRECTOR_DIRECTS', 'on');
    const handlers: Array<(ev: unknown) => void> = [];
    const session = {
      // Only the state changes the director listens for; the tool watcher's events never fire.
      on: (e: string, h: (ev: unknown) => void) => {
        if (e === 'agent_state_changed') handlers.push(h);
      },
      off: vi.fn(),
      userData: { personaId: 'maya-santos' },
    };
    const items = [
      { type: 'message', role: 'user', textContent: 'I ran the whole 5k without stopping!' },
      { type: 'message', role: 'assistant', textContent: 'The whole thing. No walking.' },
    ];
    const cleanup: Array<() => void> = [];
    await installDirectorNotes({
      session: session as never,
      sessionId: 's',
      userName: 'Sam',
      agent: { chatCtx: { items } },
      cleanupFunctions: cleanup,
    });
    expect(getDirector(session)).toBeDefined();
    handlers.forEach((h) => h({ newState: 'speaking' }));
    handlers.forEach((h) => h({ newState: 'listening' }));
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const system = getGenerativeModel.mock.calls[0]?.[0].systemInstruction;
    expect(system).toContain('You direct Maya');
    expect(system).not.toContain('Wyoming');
    expect(generateContent.mock.calls[0]?.[0]).toContain('Maya: The whole thing. No walking.');
    cleanup.forEach((f) => f());
  });
});
