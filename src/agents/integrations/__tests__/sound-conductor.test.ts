/**
 * SOUND_CONDUCTOR (sound-conductor.ts): one sound per turn edge, no repeat
 * inside 60 s, a per-kind budget a minute; off never builds a conductor,
 * shadow logs and plays everything, on skips what it blocks.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  NO_REPEAT_MS,
  SOUND_BUDGET_PER_MIN,
  TURN_EDGE_MS,
  createSoundConductor,
  createSoundGate,
  liveSoundKind,
  soundConductorMode,
  soundFamily,
  type ConductedSound,
} from '../sound-conductor.js';

/** A gate on a fake clock; `heard` lists every sound that actually played. */
function gateAt(mode: 'off' | 'shadow' | 'on') {
  let t = 1_000_000;
  const heard: string[] = [];
  const logged: Array<Record<string, unknown>> = [];
  const conductor = vi.fn(createSoundConductor);
  const gate = createSoundGate(mode, {
    conductor,
    now: () => t,
    log: (fields, msg) => {
      expect(msg).toBe('SOUND_DECISION');
      logged.push(fields);
    },
  });
  const play = (kind: ConductedSound, clip: string, atMs: number): boolean => {
    t = 1_000_000 + atMs;
    return gate(kind, clip, () => (heard.push(clip), true));
  };
  return { play, heard, logged, conductor };
}

describe('sound conductor rules', () => {
  it('blocks a second sound inside the turn edge, allows it after', () => {
    const c = createSoundConductor();
    const first = { kind: 'backchannel' as const, clip: 'Mhm', at: 0 };
    expect(c.request(first)).toEqual({ allow: true, reason: 'ok', sinceLastMs: null });
    c.played(first);
    expect(c.request({ kind: 'laugh', clip: '[laughter]', at: TURN_EDGE_MS - 1 })).toEqual({
      allow: false,
      reason: 'turn_edge',
      sinceLastMs: TURN_EDGE_MS - 1,
    });
    expect(c.request({ kind: 'laugh', clip: '[laughter]', at: TURN_EDGE_MS }).allow).toBe(true);
  });

  it('blocks an opener of the same sound right after a backchannel, not a different one', () => {
    const c = createSoundConductor();
    c.played({ kind: 'backchannel', clip: 'Mm-hmm', at: 0 });
    expect(c.request({ kind: 'opener', clip: 'Mm', at: 2_000 }).reason).toBe('same_sound');
    expect(c.request({ kind: 'opener', clip: 'Yeah', at: 2_000 }).reason).toBe('ok');
    expect(c.request({ kind: 'opener', clip: 'Mm', at: 3_000 }).reason).toBe('ok');
  });

  it('blocks the same clip inside 60 s but lets rotating takes of the word through', () => {
    const c = createSoundConductor();
    c.played({ kind: 'backchannel', clip: 'Mm-hmm', at: 0 });
    expect(c.request({ kind: 'backchannel', clip: 'Mm-hmm', at: 10_000 }).reason).toBe('repeat');
    expect(c.request({ kind: 'backchannel', clip: 'Mm-hmm.', at: 10_000 }).reason).toBe('ok');
    expect(c.request({ kind: 'backchannel', clip: 'Mm-hmm', at: NO_REPEAT_MS }).reason).toBe('ok');
  });

  it('caps each kind per rolling minute, and the cap frees up as plays age out', () => {
    const c = createSoundConductor();
    const cap = SOUND_BUDGET_PER_MIN.backchannel;
    for (let i = 0; i < cap; i++)
      c.played({ kind: 'backchannel', clip: `take-${i}`, at: i * 5_000 });
    const next = { kind: 'backchannel' as const, clip: 'fresh', at: cap * 5_000 };
    expect(c.request(next).reason).toBe('budget');
    // Another kind has its own budget.
    expect(c.request({ ...next, kind: 'opener' }).reason).toBe('ok');
    expect(c.request({ ...next, at: NO_REPEAT_MS + 1 }).reason).toBe('ok');
  });

  it('reads clip families and live kinds', () => {
    expect(['Mm', 'Mm-hmm', 'Mhm.', 'Hmm', '<volume ratio="0.7"/>Mhm...'].map(soundFamily)).toEqual(
      ['mm', 'mm', 'mm', 'mm', 'mm']
    );
    expect(soundFamily('Yeh.')).toBe('yeah');
    expect(soundFamily('Uh-huh.')).toBe('uhhuh');
    expect(liveSoundKind('[laughter]')).toBe('laugh');
    expect(liveSoundKind('Ha, [laughter]')).toBe('laugh');
    expect(liveSoundKind('Mm-hmm')).toBe('backchannel');
  });

  it('reads the flag: off by default, shadow and on', () => {
    expect(soundConductorMode({})).toBe('off');
    expect(soundConductorMode({ SOUND_CONDUCTOR: 'shadow' })).toBe('shadow');
    expect(soundConductorMode({ SOUND_CONDUCTOR: 'on' })).toBe('on');
  });
});

describe('sound gate modes', () => {
  it('off: no conductor is built or asked, nothing logged, every sound plays', () => {
    const g = gateAt('off');
    expect(g.play('backchannel', 'Mm-hmm', 0)).toBe(true);
    expect(g.play('opener', 'Mm-hmm', 400)).toBe(true);
    expect(g.conductor).not.toHaveBeenCalled();
    expect(g.logged).toEqual([]);
    expect(g.heard).toEqual(['Mm-hmm', 'Mm-hmm']);
  });

  it('shadow: every decision is logged and every sound still plays', () => {
    const g = gateAt('shadow');
    expect(g.play('backchannel', 'Mm-hmm', 0)).toBe(true);
    expect(g.play('opener', 'Yeah', 400)).toBe(true);
    expect(g.heard).toEqual(['Mm-hmm', 'Yeah']);
    expect(g.logged).toEqual([
      expect.objectContaining({ kind: 'backchannel', allow: true, reason: 'ok', played: true }),
      expect.objectContaining({
        kind: 'opener',
        clip: 'Yeah',
        allow: false,
        reason: 'turn_edge',
        sinceLastMs: 400,
        played: true,
        mode: 'shadow',
      }),
    ]);
  });

  it('on: a blocked sound never reaches play()', () => {
    const g = gateAt('on');
    expect(g.play('backchannel', 'Mm-hmm', 0)).toBe(true);
    expect(g.play('opener', 'Yeah', 400)).toBe(false);
    expect(g.play('backchannel', 'Mm-hmm', 5_000)).toBe(false); // repeat
    expect(g.play('backchannel', 'Right', 5_000)).toBe(true);
    expect(g.heard).toEqual(['Mm-hmm', 'Right']);
    expect(g.logged.map((f) => f.reason)).toEqual(['ok', 'turn_edge', 'repeat', 'ok']);
  });

  it('on: a play that fails is not remembered as heard', () => {
    let t = 0;
    const gate = createSoundGate('on', { now: () => t, log: () => {} });
    expect(gate('backchannel', 'Mm-hmm', () => false)).toBe(false); // track busy
    t = 100;
    expect(gate('opener', 'Yeah', () => true)).toBe(true);
  });

  it('replays a LIVE.md pile-up: backchannel, opener 0.4 s, laugh 0.9 s is one sound when on', () => {
    const pileUp = (mode: 'shadow' | 'on') => {
      const g = gateAt(mode);
      g.play('backchannel', 'Mm-hmm', 0);
      g.play('opener', 'Mm', 400);
      g.play('laugh', '[laughter]', 900);
      return g;
    };
    expect(pileUp('on').heard).toEqual(['Mm-hmm']);
    const shadow = pileUp('shadow');
    expect(shadow.heard).toEqual(['Mm-hmm', 'Mm', '[laughter]']);
    expect(shadow.logged.map((f) => f.allow)).toEqual([true, false, false]);
  });
});
