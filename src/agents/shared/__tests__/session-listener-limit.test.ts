import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_SESSION_MAX_LISTENERS, limitSessionListeners } from '../session-listener-limit.js';

const SRC = join(__dirname, '..', '..', '..');

function listenerWarnings(add: (e: EventEmitter) => void, limit: boolean): number {
  const warnings: Error[] = [];
  const onWarning = (w: Error) => {
    if (w.name === 'MaxListenersExceededWarning') warnings.push(w);
  };
  process.on('warning', onWarning);
  const session = new EventEmitter();
  if (limit) limitSessionListeners(session);
  add(session);
  return new Promise<number>((resolve) =>
    setImmediate(() => {
      process.off('warning', onWarning);
      resolve(warnings.length);
    })
  ) as unknown as number;
}

afterEach(() => vi.restoreAllMocks());

describe('limitSessionListeners', () => {
  const sixteenWatchers = (e: EventEmitter) => {
    for (let i = 0; i < 16; i++) e.on('agent_state_changed', () => undefined);
  };

  it('lets the ~16 designed agent_state_changed watchers attach without a warning', async () => {
    expect(await listenerWarnings(sixteenWatchers, true)).toBe(0);
  });

  it('is needed: the same watchers warn under Node’s default limit', async () => {
    expect(await listenerWarnings(sixteenWatchers, false)).toBe(1);
  });

  it('still flags runaway growth past the limit', async () => {
    const tooMany = (e: EventEmitter) => {
      for (let i = 0; i <= AGENT_SESSION_MAX_LISTENERS; i++) e.on('agent_state_changed', () => undefined);
    };
    expect(await listenerWarnings(tooMany, true)).toBe(1);
  });
});

describe('every AgentSession gets the limit', () => {
  function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : tsFiles(path);
      return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
    });
  }

  /** Source without comment lines, so a usage example in a doc comment doesn't count. */
  const code = (f: string): string =>
    readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');

  it('each file that constructs an AgentSession calls limitSessionListeners', () => {
    const builders = tsFiles(SRC).filter((f) => /new\s+voice\.AgentSession\s*[<(]/.test(code(f)));
    // The multi-agent path (production) and the single-agent path.
    expect(builders.length).toBeGreaterThanOrEqual(2);
    const missing = builders.filter((f) => !/limitSessionListeners\(session\)/.test(code(f)));
    expect(missing).toEqual([]);
  });
});
