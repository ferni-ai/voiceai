/**
 * DIRECTOR_SEES_SCENE: the director and the deliberator framed for the persona
 * speaking, with a SCENE of the caller, the persona's own life and the world
 * now; notes that script a line are dropped. Off, every prompt is the one prod
 * sends today (the golden was captured from origin/main before this flag).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { characterBrief, castFor, directorSeesScene } from '../director-cast.js';
import { Deliberator, type ThinkFn } from '../deliberation.js';
import { Director, parseNotes, type Line } from '../director-notes.js';
import {
  formatScene,
  SCENE_MAX_CHARS,
  sceneFromChat,
  scriptedNote,
  stageFor,
  worldNowForDirector,
} from '../director-scene.js';
import { capturePrompts, type Captured } from './director-prompts-golden.js';

const GOLDEN = JSON.parse(
  readFileSync(new URL('./director-prompts.golden.json', import.meta.url), 'utf8')
) as Captured;

afterEach(() => vi.unstubAllEnvs());

const CALL: Line[] = [
  { speaker: 'user', text: 'Hey, can I talk to Maya about my mornings?' },
  { speaker: 'ferni', text: 'Sure, handing you over.', by: 'Ferni' },
  { speaker: 'ferni', text: "Hi, it's Maya. Mornings, huh?", by: 'Maya' },
  { speaker: 'user', text: 'I keep skipping the walk before work and then the whole day slides.' },
  { speaker: 'ferni', text: 'The walk is the first domino, then.', by: 'Maya' },
];

/** What the real Director sends its writer, for a stage. */
async function directorAsked(
  stage?: Parameters<Director['observe']>[1],
  reply = 'NONE'
): Promise<{ system: string; prompt: string; director: Director }> {
  let asked = { system: '', prompt: '' };
  const director = new Director({
    sessionId: 's',
    userName: 'Sam',
    writer: async (system, prompt) => {
      asked = { system, prompt };
      return reply;
    },
    speaking: () => 'Maya',
  });
  await director.observe(CALL, stage);
  return { ...asked, director };
}

const RECALL_NOTE = [
  '[WHAT YOU REMEMBER ABOUT SAM]',
  '- Sam: sister name = Ana [3 days ago]',
  '- Sam: job = night-shift nurse',
  'These are from past calls, not this one. Use at most one.',
].join('\n');
const LEDGER_NOTE = [
  "[WHAT YOU'VE TOLD SAM ABOUT YOUR OWN LIFE ON EARLIER CALLS]",
  '- Maya is training for a half marathon [told 5 days ago]',
  "This is your life: stay consistent with it. Don't repeat these back or list them.",
].join('\n');
const CHAT = [
  { id: 'recall_1', type: 'message', role: 'system', textContent: LEDGER_NOTE },
  { id: 'm1', type: 'message', role: 'user', textContent: 'Hey' },
  { id: 'recall_2', type: 'message', role: 'system', textContent: RECALL_NOTE },
  {
    id: 'recall_3',
    type: 'message',
    role: 'system',
    textContent: '[HOW THEY ARE] Says "fine" when tired; likes plans.',
  },
];

// 2026-10-15 23:40 UTC = 7:40 pm Thursday in New York.
const EVENING = new Date('2026-10-15T23:40:00Z');
const SESSION = { userData: { callerTimezone: 'America/New_York' } };

describe('DIRECTOR_SEES_SCENE off', () => {
  it('is off by default', () => {
    expect(directorSeesScene({})).toBe(false);
    expect(directorSeesScene({ DIRECTOR_SEES_SCENE: 'on' })).toBe(true);
  });

  it.each([
    ['unset', {}],
    ['off', { DIRECTOR_SEES_SCENE: 'off' }],
  ])(
    'flag %s: every director and deliberation prompt is byte-identical to origin/main',
    async (_, env) => {
      const got = await capturePrompts(env);
      expect(Object.keys(got).sort()).toEqual(Object.keys(GOLDEN).sort());
      for (const key of Object.keys(GOLDEN)) expect(got[key], key).toEqual(GOLDEN[key]);
    }
  );

  it('flag off: a stage handed to observe changes nothing', async () => {
    const stage = { personaId: 'maya-santos', scene: { caller: 'sister Ana' } };
    const plain = await directorAsked();
    const staged = await directorAsked(stage);
    expect(staged.system).toBe(plain.system);
    expect(staged.prompt).toBe(plain.prompt);
    expect(plain.system).toContain('Wyoming');
  });
});

describe('DIRECTOR_SEES_SCENE on: framed for the persona speaking', () => {
  it('maya-santos: the role names Maya with her own brief, never Ferni or Wyoming', async () => {
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    const { system, prompt } = await directorAsked({ personaId: 'maya-santos', scene: {} });
    const role = system.split('\n')[0];
    expect(role).toMatch(/^You are the director of a live, unscripted phone call between Maya \(/);
    expect(role).toContain('Stockton');
    expect(role).toContain('someone she cares about');
    expect(role).not.toMatch(/Ferni|Wyoming|Japan/);
    expect(system).not.toMatch(/Wyoming|Japan|Ferni's habits/);
    expect(system).toContain(
      "a habit of Maya's to drop (too many questions, fixing too early, sounding upbeat, repeating herself)"
    );
    // Speaker labels per line (director-persona.ts), and the notes are for Maya.
    expect(prompt).toContain('Ferni: Sure, handing you over.');
    expect(prompt).toContain('Maya: The walk is the first domino, then.');
    expect(prompt).toContain("Your notes for Maya's next reply:");
  });

  it('after a handoff the director talks about the new persona', async () => {
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    const ferni = await directorAsked({ personaId: 'ferni', scene: {} });
    const jordan = await directorAsked({ personaId: 'jordan-taylor', scene: {} });
    expect(ferni.system.split('\n')[0]).toContain('between Ferni (');
    expect(jordan.system.split('\n')[0]).toContain('between Jordan (');
    expect(jordan.system.split('\n')[0]).not.toContain('Ferni');
  });

  it('a brief comes from any bundle: traits, where they are from, their role', () => {
    const sheet =
      "# X\n\n## Your life\n\nYou were raised in your parents' restaurant, Chen's Garden, in Oakland.\n";
    expect(
      characterBrief(
        sheet,
        { traits: ['calm-presence', 'clear-is-kind', 'warm'], role: 'insights-quant' },
        { subject: 'he', object: 'him', possessive: 'his' }
      )
    ).toBe("warm; was raised in his parents' restaurant; an insights quant");
  });

  it('deliberation is framed for the speaking persona, its lines labelled', async () => {
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    let asked = { system: '', prompt: '' };
    const think: ThinkFn = async (system, prompt) => {
      asked = { system, prompt };
      return { text: '{"kind":"none"}' };
    };
    const d = new Deliberator({ sessionId: 's', userName: 'Sam', think });
    const weighty: Line[] = [
      {
        speaker: 'user',
        text: "I keep skipping the walk before work and I'm worried the whole routine is falling apart again like last spring.",
      },
      { speaker: 'ferni', text: 'Last spring, huh.', by: 'Maya' },
    ];
    await d.observe(weighty, null, 'Sam: sister Ana', '', 'maya-santos');
    expect(asked.system).toMatch(
      /^You are Maya's private thoughts during a live phone call with someone she cares about\. Maya \(/
    );
    expect(asked.system).not.toMatch(/Ferni|Wyoming/);
    expect(asked.prompt).toContain('What Maya remembers that may bear on it:');
    expect(asked.prompt).toContain('Maya: Last spring, huh.');
  });
});

describe('the SCENE block', () => {
  it('carries the recall fact, the mind note, her own life and the world now, under the cap', async () => {
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    const stage = stageFor(SESSION, CHAT, 'maya-santos');
    stage.scene.worldNow = worldNowForDirector(SESSION, EVENING);
    const { prompt } = await directorAsked(stage);
    const scene = prompt.split('\n\nThe call so far:')[0];
    expect(scene).toMatch(/^SCENE \(background for your direction, never lines to say\):/);
    expect(scene).toContain('sister name = Ana');
    expect(scene).toContain('how they tend to be: Says "fine" when tired');
    expect(scene).toContain("Maya's own life, as told them: Maya is training for a half marathon");
    expect(scene).toContain('Their world now: Thursday, Oct 15, 7:40 PM EDT, evening.');
    expect(scene.length).toBeLessThanOrEqual(SCENE_MAX_CHARS);
  });

  it('reads the newest recall note of each kind from the chat, not other messages', () => {
    const got = sceneFromChat(CHAT);
    expect(got.caller).toBe('Sam: sister name = Ana; Sam: job = night-shift nurse');
    expect(got.ownLife).toBe('Maya is training for a half marathon');
    expect(got.mind).toBe('Says "fine" when tired; likes plans.');
    expect(sceneFromChat([{ id: 'm1', textContent: RECALL_NOTE }])).toEqual({});
  });

  it('omits what is empty, and nothing at all when there is no scene', () => {
    expect(formatScene({})).toBe('');
    const only = formatScene({ worldNow: 'Thursday, Oct 15, 7:40 PM EDT, evening.' }, 'Maya');
    expect(only).not.toContain('The caller');
    expect(only).not.toContain('own life');
    expect(worldNowForDirector({ userData: {} }, EVENING)).toBe('');
  });

  it('stays under the cap however long the parts are', () => {
    const long = 'word '.repeat(400);
    const scene = formatScene({ caller: long, mind: long, ownLife: long, worldNow: long }, 'Maya');
    expect(scene.length).toBeLessThanOrEqual(SCENE_MAX_CHARS);
    expect(scene).toContain('- The caller:');
    expect(scene).toContain('- Their world now:');
  });
});

describe('notes, never lines', () => {
  const SCRIPTED = [
    'Say "that sounds exhausting, honestly" and stop there.',
    'Tell them: you can always start again Monday.',
    'Open with "mornings are brutal for everyone" to make them laugh.',
  ];
  const REAL = 'The walk is their first domino; ask what time the day starts sliding.';

  it('scriptedNote catches a line to say and keeps direction or a quote of the caller', () => {
    for (const n of SCRIPTED) expect(scriptedNote(n), n).toBe(true);
    expect(scriptedNote(REAL)).toBe(false);
    expect(
      scriptedNote(
        'They said "the whole day slides": that is the stake.',
        'and then the whole day slides.'
      )
    ).toBe(false);
    expect(scriptedNote('One word, "domino", landed.')).toBe(false);
  });

  it('flag on: the director drops a scripted note and keeps a real one', async () => {
    vi.stubEnv('DIRECTOR_SEES_SCENE', 'on');
    const { director } = await directorAsked(
      { personaId: 'maya-santos', scene: {} },
      `${SCRIPTED[0]}\n${REAL}`
    );
    expect(director.current()).toEqual([REAL]);
  });

  it('flag off: parseNotes is unchanged (the scripted note survives as before)', () => {
    expect(parseNotes(`${SCRIPTED[2]}\n${REAL}`, CALL)).toEqual([SCRIPTED[2], REAL]);
  });

  it('castFor caches one brief per persona', async () => {
    expect(await castFor('maya')).toBe(await castFor('maya-santos'));
  });
});
