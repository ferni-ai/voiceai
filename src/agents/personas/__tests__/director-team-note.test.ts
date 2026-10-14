/**
 * DIRECTOR_PERSONA_AWARE, the parts #1312 left out (ported from #906): the
 * director knows the team, the told-this-call record skips a persona's own
 * name, and turn understanding names the persona on the call.
 */
import { describe, expect, it } from 'vitest';
import { Director } from '../director-notes.js';
import { teamNote } from '../director-persona.js';
import { toldThisCall } from '../told-this-call.js';
import {
  TurnUnderstander,
  UNDERSTANDING_PROMPT,
  understandingPrompt,
} from '../turn-understanding.js';

const NAYA = [
  { speaker: 'user' as const, text: 'Can I talk to Naya?' },
  { speaker: 'ferni' as const, text: 'Sure, let me see who is around.' },
];

function directorSystem(speaking?: () => string): Promise<string> {
  let system = '';
  const director = new Director({
    sessionId: 's',
    userName: 'Sam',
    speaking,
    writer: async (s) => {
      system = s;
      return 'NONE';
    },
  });
  return director.observe(NAYA).then(() => system);
}

describe('director team note', () => {
  it('names the teammates as colleagues and a request for one as a transfer', () => {
    const note = teamNote('Ferni');
    expect(note).toContain('Maya, Alex, Peter, Jordan and Nayan');
    expect(note).toContain('not friends of the caller');
    expect(note).toContain('wants to be transferred');
    expect(note).toContain('slightly wrong');
    expect(teamNote('Maya')).toContain('Ferni, Alex, Peter, Jordan and Nayan');
    expect(teamNote('Maya')).not.toMatch(/Maya,|and Maya/);
  });

  it('a financial legend gets the legends, not the core team', () => {
    expect(teamNote('Peter Lynch')).toContain('John Bogle and Joel');
    expect(teamNote('Peter Lynch')).not.toContain('Ferni');
  });

  it('reaches the director on a Ferni call with the flag on, and not with it off', async () => {
    expect(await directorSystem(() => 'Ferni')).toContain(teamNote('Ferni'));
    const off = await directorSystem();
    expect(off).not.toContain('teammates are');
    expect(off).not.toContain('transferred');
  });
});

describe('told-this-call own name', () => {
  const lines = [
    { speaker: 'user' as const, text: 'Who is this?' },
    { speaker: 'ferni' as const, text: "Hey, it's Jordan. I hear Alex said you might call." },
    { speaker: 'ferni' as const, text: 'Jordan here again. I talked to Alex earlier.' },
  ];

  it('with the speaker known, a persona saying its own name is not bringing someone up', () => {
    const names = toldThisCall(lines, 'Sam', 'Jordan Taylor').names.map((n) => n.name);
    expect(names).not.toContain('Jordan');
    expect(names).toContain('Alex');
  });

  it('a line labelled with who said it uses that name', () => {
    const byJordan = [
      { speaker: 'ferni' as const, text: 'Hi, Jordan here. Ask Alex.', by: 'Jordan Taylor' },
    ];
    const names = toldThisCall(byJordan, 'Sam', 'Maya').names.map((n) => n.name);
    expect(names).toEqual(['Alex']);
  });

  it('without a speaker (flag off) counts every name, as before', () => {
    const names = toldThisCall(lines, 'Sam').names.map((n) => n.name);
    expect(names).toContain('Jordan');
  });
});

describe('turn understanding names the persona on the call', () => {
  it("Ferni's prompt is unchanged", () => {
    expect(understandingPrompt('Ferni')).toBe(UNDERSTANDING_PROMPT);
    expect(UNDERSTANDING_PROMPT).toContain('their friend Ferni.');
    expect(UNDERSTANDING_PROMPT).toContain('about_ferni = asks about Ferni himself;');
    expect(UNDERSTANDING_PROMPT).toContain('ask Ferni something or ask him to do something');
  });

  it("a teammate's prompt names them and never Ferni", () => {
    const maya = understandingPrompt('Maya Santos');
    expect(maya).toContain('their friend Maya Santos.');
    expect(maya).toContain('about_ferni = asks about Maya Santos;');
    expect(maya).toContain('"about_ferni"'); // the move label stays
    expect(maya.replace(/about_ferni/g, '')).not.toMatch(/Ferni|\bhim\b|himself/);
  });

  it('the understander reads the prompt on each call, so a handoff changes it', async () => {
    let name = 'Ferni';
    const prompts: string[] = [];
    const u = new TurnUnderstander(
      async (prompt) => {
        prompts.push(prompt);
        return '{"move":"share"}';
      },
      Date.now,
      1000,
      () => understandingPrompt(name)
    );
    await u.settle('I had a long day at work today');
    name = 'Jordan';
    u.newTurn('I had a long day at work today');
    await u.settle('And then my car broke down on the way home');
    expect(prompts[0]).toContain('their friend Ferni.');
    expect(prompts.at(-1)).toContain('their friend Jordan.');
  });
});
