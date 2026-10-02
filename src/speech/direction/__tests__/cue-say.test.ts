import { describe, expect, it, vi } from 'vitest';

const session = {
  userData: { personaId: 'ferni', userName: 'Seth' },
  history: {
    items: [
      { type: 'message', role: 'system', textContent: 'You are Ferni.' },
      { type: 'message', role: 'user', textContent: 'Could you play some Jamaican music?' },
      { type: 'function_call', role: undefined, textContent: undefined },
      {
        type: 'message',
        role: 'assistant',
        textContent: '<emotion value="content"/>Oh, nice pick.',
      },
    ],
  },
};
const said: string[] = [];
vi.mock('../../coordination/session-integration.js', () => ({
  getSessionForCoordination: () => session,
  coordinatedSay: (_id: string, text: string) => said.push(text),
}));

const { sceneForSession } = await import('../cue-say.js');

describe('sceneForSession', () => {
  it('builds the scene from the live session: character, user, recent spoken turns', () => {
    const scene = sceneForSession('s1');
    expect(scene.character).toBe('Ferni');
    expect(scene.userName).toBe('Seth');
    expect(scene.recentTurns).toEqual([
      { speaker: 'user', text: 'Could you play some Jamaican music?' },
      { speaker: 'character', text: 'Oh, nice pick.' },
    ]);
  });
});
