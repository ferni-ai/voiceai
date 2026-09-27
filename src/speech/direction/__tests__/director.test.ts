import { describe, expect, it } from 'vitest';
import { acceptLine, type Cue } from '../cue.js';
import { buildDirection, directLine, directionMode, type Scene } from '../director.js';

const cue: Cue = {
  moment: 'music_started',
  direction: 'The song they asked for just started. Welcome it in briefly.',
  facts: { track: 'Could You Be Loved', artist: 'Bob Marley' },
  fallback: 'There we go.',
  urgency: 'now',
};

const scene: Scene = {
  character: 'Ferni',
  brief: 'Warm, curious, a little playful.',
  userName: 'Seth',
  recentTurns: [
    { speaker: 'user', text: 'Could you play some Jamaican music?' },
    { speaker: 'character', text: 'Oh, absolutely. Let me find something.' },
  ],
};

describe('acceptLine', () => {
  it('cleans quotes and speaker labels', () => {
    expect(acceptLine('"Ferni: Ah, Bob Marley. Good call."', cue)).toBe(
      'Ah, Bob Marley. Good call.'
    );
  });

  it('rejects markup, stage directions and assistant-speak', () => {
    expect(acceptLine('[laughs] Nice one.', cue)).toBeNull();
    expect(acceptLine('<emotion value="happy"/>Nice.', cue)).toBeNull();
    expect(acceptLine('As an AI, I love reggae.', cue)).toBeNull();
  });

  it('rejects lines that are too long, miss required words, or repeat the last line', () => {
    expect(acceptLine('word '.repeat(80), cue)).toBeNull();
    expect(acceptLine('Nice pick.', { ...cue, mustInclude: ['Marley'] })).toBeNull();
    expect(
      acceptLine('Oh, absolutely. Let me find something.', cue, [
        'Oh, absolutely. Let me find something.',
      ])
    ).toBeNull();
  });
});

describe('buildDirection', () => {
  it('gives the actor the character, the recent turns, the direction and the facts', () => {
    const { system, prompt } = buildDirection(cue, scene);
    expect(system).toContain('You are Ferni');
    expect(system).toMatch(/Never invent/);
    expect(prompt).toContain('Seth: Could you play some Jamaican music?');
    expect(prompt).toContain('Direction: The song they asked for just started');
    expect(prompt).toContain('- artist: Bob Marley');
  });
});

describe('directLine', () => {
  it("speaks the actor's line when it is on time and usable", async () => {
    const line = await directLine(cue, scene, {
      actor: async () => 'Ah, Bob Marley. Perfect for tonight.',
      mode: 'on',
    });
    expect(line).toMatchObject({ source: 'actor', text: 'Ah, Bob Marley. Perfect for tonight.' });
  });

  it('falls back to the understudy when the actor is late', async () => {
    const slow = () => new Promise<string>((r) => setTimeout(() => r('Too late.'), 200));
    const line = await directLine(cue, scene, { actor: slow, mode: 'on', budgetMs: 20 });
    expect(line).toMatchObject({ source: 'understudy', text: 'There we go.', reason: 'late' });
  });

  it('falls back when the actor fails or writes something unspeakable', async () => {
    const failing = await directLine(cue, scene, {
      actor: async () => {
        throw new Error('503');
      },
      mode: 'on',
    });
    expect(failing).toMatchObject({ source: 'understudy', reason: 'error' });
    const bad = await directLine(cue, scene, { actor: async () => '*smiles* Nice.', mode: 'on' });
    expect(bad).toMatchObject({ source: 'understudy', reason: 'rejected' });
  });

  it('in shadow mode writes the line but speaks the fallback; off never calls the actor', async () => {
    let called = 0;
    const actor = async () => {
      called++;
      return 'Ah, Bob Marley.';
    };
    expect(await directLine(cue, scene, { actor, mode: 'shadow' })).toMatchObject({
      text: 'There we go.',
      reason: 'shadow',
    });
    expect(called).toBe(1);
    expect(await directLine(cue, scene, { actor, mode: 'off' })).toMatchObject({
      text: 'There we go.',
      reason: 'off',
    });
    expect(called).toBe(1);
  });

  it('defaults to on, and honours DIRECTED_SPEECH', () => {
    expect(directionMode({})).toBe('on');
    expect(directionMode({ DIRECTED_SPEECH: 'shadow' })).toBe('shadow');
    expect(directionMode({ DIRECTED_SPEECH: 'off' })).toBe('off');
  });
});
