/**
 * No scripted greeting or breath cue plays broken punctuation (#3165).
 *
 * The late-night fallback greeting ended "What's on your mind?," on a live call:
 * its closing `<break 500ms/>[soft breath]<break 200ms/>` left a comma behind the
 * held break, where the parser's cleanup didn't look. Every scripted piece is run
 * through the TTS gateway's parser on its own and after a question, the way the
 * greeting builder joins a question to its landing sound. Behind
 * HELD_BREAK_PUNCTUATION (off by default), so the check runs with it on.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSSML } from '../../../speech/tts-gateway/ssml/processor.js';

const SRC = join(__dirname, '../../..');
/** Sentence punctuation, then (past any native breaks) a comma or semicolon: "mind?," */
const BROKEN = /[.!?](?:\s*<break time="\d+ms"\/>)*\s*[,;]/;

/** Every quoted literal in a source file that holds a break tag. */
function scripted(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.)*<break(?:(?!\1)[^\\\n]|\\.)*)\1/g))
    out.push(m[2].replace(/\\(["'])/g, '$1'));
  return out;
}

const pieces = [
  ...scripted(join(SRC, 'agents/shared/warm-greeting.ts')),
  ...scripted(join(SRC, 'agents/shared/legend-greetings.ts')),
  ...readdirSync(join(SRC, 'personas/bundles')).flatMap((p) => {
    try {
      return scripted(join(SRC, 'personas/bundles', p, 'content/behaviors/breath-sounds.json'));
    } catch {
      return [];
    }
  }),
];

describe('scripted greetings and breath cues', () => {
  beforeEach(() => vi.stubEnv('HELD_BREAK_PUNCTUATION', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it('cover the late-night closing and every persona with breath sounds', () => {
    expect(pieces).toContain('<break time="500ms"/>[soft breath]<break time="200ms"/>');
    expect(pieces.length).toBeGreaterThan(100);
  });

  it('never leave sentence punctuation followed by a comma, alone or after a question', () => {
    const broken = pieces
      .flatMap((p) => [p, `What's on your mind?${p}`])
      .map((t) => parseSSML(t).cleanText)
      .filter((out) => BROKEN.test(out));
    expect(broken).toEqual([]);
  });
});
