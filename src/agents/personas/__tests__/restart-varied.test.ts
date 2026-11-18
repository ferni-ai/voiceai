/**
 * #3071: with TURN_TEXTURE=learned, a reply drawn as a "restart" was told to restart like
 * ("I, I think", "we were, we went"), and the model copied the first example almost every time:
 * about one reply in ten on a long call opened "I, I". RESTART_VARIED=on names the restart
 * without "I", draws its example from several shapes, and says never to restart on "I".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { regexSignals } from '../turn-extras.js';
import { textureLine } from '../turn-length.js';
import { rngFor, turnShapeFor } from '../turn-shape.js';

const ON = { RESTART_VARIED: 'on' };
/** A doubled "I" with a comma, dash or space between, as the old example modelled it. */
const DOUBLED_I = /\bI\s*[,—–-]?\s*I\b/;

/** The restart lines over many draws (a target of 30 words is rough most of the time). */
function restartLines(env: Record<string, string | undefined>): string[] {
  const rng = rngFor('restart-varied');
  return Array.from({ length: 2000 }, () => textureLine(30, rng, env))
    .filter((t) => t.kind === 'restart')
    .map((t) => t.line);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('RESTART_VARIED: the restart line', () => {
  it('on: never models a doubled "I" and says not to restart on "I"', () => {
    const lines = restartLines(ON);
    expect(lines.length).toBeGreaterThan(50);
    expect(lines.filter((l) => DOUBLED_I.test(l))).toEqual([]);
    expect(lines.every((l) => /never start the restart on "I"/.test(l))).toBe(true);
  });

  it('on: draws its example from several shapes, so no one phrase is there to copy', () => {
    const examples = new Set(restartLines(ON).map((l) => /\(like (".*?")\)/.exec(l)?.[1]));
    expect(examples.has(undefined)).toBe(false);
    expect(examples.size).toBeGreaterThanOrEqual(4);
  });

  it('on: only the restart line changes; openers, pauses, hedges and clean replies do not', () => {
    const linesByKind = (env: Record<string, string | undefined>) => {
      const rng = rngFor('restart-varied-kinds');
      const byKind = new Map<string, Set<string>>();
      for (let i = 0; i < 2000; i++) {
        const { kind, line } = textureLine(30, rng, env);
        if (kind !== 'restart') byKind.set(kind, (byKind.get(kind) ?? new Set()).add(line));
      }
      return byKind;
    };
    const on = linesByKind(ON);
    expect([...on.keys()].sort()).toEqual(['clean', 'hedge', 'opener', 'pause']);
    expect(on).toEqual(linesByKind({}));
  });

  it('off (the default): the restart line is the same as before', () => {
    const lines = new Set(restartLines({}));
    expect([...lines]).toEqual([
      'Start one thought, then start it over or say the first word twice, joined with a comma ("I, I think", "we were, we went").',
    ]);
  });
});

describe('RESTART_VARIED: the turn reminder the model reads (turnShapeFor)', () => {
  const said = 'my sister finally called me back about the house';
  const sig = { ...regexSignals(said, 'share'), recent: { ferniLastWords: 3, energy: 6 } };
  const reminders = () =>
    Array.from({ length: 600 }, (_, i) => turnShapeFor(said, rngFor(`r${i}`), 'model', sig));

  it('on, with learned texture: restarts happen, and none models "I, I"', () => {
    vi.stubEnv('TURN_SHAPE', 'model');
    vi.stubEnv('TURN_TEXTURE', 'learned');
    vi.stubEnv('RESTART_VARIED', 'on');
    const turns = reminders();
    expect(turns.some((t) => t.extras.includes('texture_restart'))).toBe(true);
    expect(turns.filter((t) => DOUBLED_I.test(t.reminder))).toEqual([]);
  });

  it('off, with learned texture: the old example is still there (unchanged)', () => {
    vi.stubEnv('TURN_SHAPE', 'model');
    vi.stubEnv('TURN_TEXTURE', 'learned');
    expect(reminders().some((t) => t.reminder.includes('("I, I think"'))).toBe(true);
  });
});
