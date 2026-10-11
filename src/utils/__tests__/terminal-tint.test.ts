import { afterEach, describe, expect, it, vi } from 'vitest';
import { tint } from '../terminal-tint.js';

describe('tint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('wraps text in the colour escape codes when colour is forced', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    expect(tint.green('ok')).toBe('\u001b[32mok\u001b[39m');
  });

  it('adds bold on top of the colour with .bold', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    expect(tint.cyan.bold('hi')).toBe('\u001b[36m\u001b[1mhi\u001b[22m\u001b[39m');
  });

  it('returns plain text when colour is turned off', () => {
    vi.stubEnv('FORCE_COLOR', '0');
    expect(tint.red('plain')).toBe('plain');
    expect(tint.bold('plain')).toBe('plain');
  });
});
