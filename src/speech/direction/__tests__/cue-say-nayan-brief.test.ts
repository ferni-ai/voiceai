/**
 * NAYAN_PLAIN_ENTRANCES (#1433) reaches every line the director writes for Nayan, not only his
 * arrival: the idle check-in (session-state-handler.ts, phases/idle-checkin.ts) is a cueSay of
 * IDLE_CHECKIN_CUE, whose scene comes from sceneForSession -> characterOf. Off, his brief is
 * today's; on, the plain one. Only the session and the director are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = { userData: { personaId: 'nayan-patel', userName: 'Sam' }, history: { items: [] } };
vi.mock('../../coordination/session-integration.js', () => ({
  getSessionForCoordination: () => session,
  coordinatedSay: vi.fn(),
}));
const scenes: Array<{ brief: string; character: string }> = [];
vi.mock('../director.js', () => ({
  directLine: vi.fn(
    async (cue: { fallback: string }, scene: { brief: string; character: string }) => {
      scenes.push(scene);
      return { text: cue.fallback, source: 'understudy', ms: 0 };
    }
  ),
}));

const { directedText } = await import('../cue-say.js');
const { IDLE_CHECKIN_CUE } = await import('../../../agents/voice-agent/idle-checkin-cue.js');

const TODAYS_BRIEF = 'A gentle, reflective guide. Unhurried and wise.';

afterEach(() => {
  scenes.length = 0;
  vi.unstubAllEnvs();
});

describe('the idle check-in scene for Nayan', () => {
  it('off: the director writes his check-in from today’s brief', async () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'off');
    await directedText('s1', IDLE_CHECKIN_CUE);
    expect(scenes).toEqual([expect.objectContaining({ character: 'Nayan', brief: TODAYS_BRIEF })]);
  });

  it('on: the director writes it from the plain brief, with no "wise" or "guide"', async () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'on');
    await directedText('s1', IDLE_CHECKIN_CUE);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].character).toBe('Nayan');
    expect(scenes[0].brief).not.toBe(TODAYS_BRIEF);
    expect(scenes[0].brief).toMatch(/\bno lessons, no aphorisms\b/);
    expect(scenes[0].brief).not.toMatch(/\b(?:wise|guide|wisdom)\b/i);
  });
});
