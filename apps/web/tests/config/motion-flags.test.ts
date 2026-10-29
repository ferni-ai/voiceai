/**
 * The avatar motion switches: a browser override beats the build value, the
 * build value beats the default, and the default is off. Nothing outside
 * config/motion-flags.ts reads them.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MOTION_FLAG_KEYS,
  isMotionFlagOn,
  type MotionFlag,
} from '../../src/config/motion-flags.js';

/** Each switch with its build value's name. */
const BUILD_NAMES: Record<MotionFlag, string> = {
  naturalBlink: 'VITE_NATURAL_BLINK',
  lidBlend: 'VITE_LID_BLEND',
  gaze: 'VITE_GAZE',
  listenNods: 'VITE_LISTEN_NODS',
  springBody: 'VITE_SPRING_BODY',
  weightedEasing: 'VITE_WEIGHTED_EASING',
  speechBeats: 'VITE_SPEECH_BEATS',
  thinkingGlance: 'VITE_THINKING_GLANCE',
  turnGestures: 'VITE_TURN_GESTURES',
  faceEngine: 'VITE_FACE_ENGINE',
  expressionArbiter: 'VITE_EXPRESSION_ARBITER',
  replyTone: 'VITE_REPLY_TONE',
  soundDirector: 'VITE_SOUND_DIRECTOR',
};
const FLAGS = Object.keys(BUILD_NAMES) as MotionFlag[];

function build(flag: MotionFlag, value: string): void {
  vi.stubEnv(BUILD_NAMES[flag], value);
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isMotionFlagOn', () => {
  it('knows exactly the 13 switches', () => {
    expect(Object.keys(MOTION_FLAG_KEYS).sort()).toEqual([...FLAGS].sort());
  });

  describe.each(FLAGS)('%s', (flag) => {
    const key = MOTION_FLAG_KEYS[flag];

    it('is off with no override and no build value', () => {
      for (const f of FLAGS) build(f, '');
      expect(isMotionFlagOn(flag)).toBe(false);
    });

    it.each(['on', 'true'])('a build value of %s turns it on', (value) => {
      build(flag, value);
      expect(isMotionFlagOn(flag)).toBe(true);
    });

    it.each(['on', 'true'])("an override of '%s' turns it on with the build off", (value) => {
      build(flag, '');
      localStorage.setItem(key, value);
      expect(isMotionFlagOn(flag)).toBe(true);
    });

    it.each(['off', 'false'])("an override of '%s' wins over a build that has it on", (value) => {
      build(flag, 'on');
      localStorage.setItem(key, value);
      expect(isMotionFlagOn(flag)).toBe(false);
    });

    it('ignores any other stored value and falls back to the build', () => {
      localStorage.setItem(key, '1');
      build(flag, '');
      expect(isMotionFlagOn(flag)).toBe(false);
      build(flag, 'on');
      expect(isMotionFlagOn(flag)).toBe(true);
    });
  });

  it('reads only its own build value', () => {
    build('naturalBlink', 'on');
    expect(FLAGS.filter((f) => isMotionFlagOn(f))).toEqual(['naturalBlink']);
  });

  it('falls back to the build value when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    build('gaze', '');
    expect(isMotionFlagOn('gaze')).toBe(false);
    build('gaze', 'on');
    expect(isMotionFlagOn('gaze')).toBe(true);
  });
});

/** The string literals and identifiers in a file's code (comments are not code). */
function codeTokens(file: string, text: string): Set<string> {
  const tokens = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) tokens.add(node.text);
    else if (ts.isIdentifier(node)) tokens.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  return tokens;
}

describe('the only reader', () => {
  const SRC = join(__dirname, '../../src');
  const READER = join(SRC, 'config/motion-flags.ts');
  const WATCHED = [...Object.values(MOTION_FLAG_KEYS), ...Object.values(BUILD_NAMES)];

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx|js)$/.test(name) && !name.endsWith('.d.ts') && path !== READER
        ? [path]
        : [];
    });
  }
  // Only files that mention a watched name anywhere are parsed.
  const files = sources(SRC).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    if (!WATCHED.some((name) => text.includes(name)) && !text.includes('MOTION_FLAG_KEYS')) {
      return [];
    }
    const tokens = [...codeTokens(path, text)];
    return [{ file: relative(SRC, path), tokens }];
  });
  const usersOf = (match: (token: string) => boolean): string[] =>
    files.filter(({ tokens }) => tokens.some(match)).map(({ file }) => file);

  it('sees every key and build value in the reader itself, and skips comments', () => {
    const tokens = codeTokens(READER, readFileSync(READER, 'utf8'));
    for (const name of WATCHED) expect(tokens.has(name)).toBe(true);
    expect(codeTokens('x.ts', "// 'ferni:gaze'\nconst a = 1;").has('ferni:gaze')).toBe(false);
  });

  it.each(FLAGS)('no other source file uses the %s override key in code', (flag) => {
    const key = MOTION_FLAG_KEYS[flag];
    expect(usersOf((token) => new RegExp(`${key}(?![\\w-])`).test(token))).toEqual([]);
  });

  it.each(FLAGS)('no other source file reads the %s build value', (flag) => {
    expect(usersOf((token) => token === BUILD_NAMES[flag])).toEqual([]);
  });

  it('no other source file uses the key table', () => {
    expect(usersOf((token) => token === 'MOTION_FLAG_KEYS')).toEqual([]);
  });
});
