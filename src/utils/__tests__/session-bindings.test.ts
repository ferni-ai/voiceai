import { describe, expect, it } from 'vitest';

import { createSessionBindings } from '../session-bindings.js';

describe('createSessionBindings', () => {
  it('returns each session its own value', () => {
    const bindings = createSessionBindings<string>();
    bindings.bind('a', 'room-a');
    bindings.bind('b', 'room-b');

    expect(bindings.resolve('a')).toBe('room-a');
    expect(bindings.resolve('b')).toBe('room-b');
    expect(bindings.resolve('c')).toBeUndefined();
  });

  it('resolves an unkeyed lookup only when one session is bound', () => {
    const bindings = createSessionBindings<string>();
    expect(bindings.resolve()).toBeUndefined();

    bindings.bind('a', 'room-a');
    expect(bindings.resolve()).toBe('room-a');

    bindings.bind('b', 'room-b');
    expect(bindings.resolve()).toBeUndefined();
  });

  it('ignores a late release of a value that was already replaced', () => {
    const bindings = createSessionBindings<string>();
    bindings.bind('a', 'first');
    bindings.bind('a', 'second');

    bindings.release('a', 'first');
    expect(bindings.resolve('a')).toBe('second');

    bindings.release('a');
    expect(bindings.size()).toBe(0);
  });
});
