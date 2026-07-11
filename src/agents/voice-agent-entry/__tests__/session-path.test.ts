import { describe, it, expect } from 'vitest';
import { resolveSessionPath } from '../session-path.js';

describe('resolveSessionPath', () => {
  it('selects multi-agent when flag true', () => {
    expect(resolveSessionPath(true)).toBe('multi-agent');
  });

  it('selects single-agent when flag false', () => {
    expect(resolveSessionPath(false)).toBe('single-agent');
  });
});
