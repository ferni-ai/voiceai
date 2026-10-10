/**
 * The group handler loads on the first group message, keeping it out of the main bundle.
 * Nothing may be lost or reordered while it loads, and the loader's type list must match
 * what the handler actually handles, or a group message would fall through unhandled.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const handled: string[] = [];
vi.mock('../../src/app/group-data-messages.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/app/group-data-messages.js')>();
  return {
    ...real,
    handleGroupDataMessage: (message: { type: string; n?: number }) => {
      handled.push(`${message.type}#${message.n ?? ''}`);
      return true;
    },
  };
});

afterEach(() => {
  handled.length = 0;
  vi.resetModules();
});

describe('group data loader', () => {
  it('handles messages that arrive while loading, in arrival order', async () => {
    const { routeGroupDataMessage, loadGroupDataMessages } =
      await import('../../src/app/group-data-loader.js');

    expect(routeGroupDataMessage({ type: 'group_roundtable_started', n: 1 })).toBe(true);
    expect(routeGroupDataMessage({ type: 'group_speaker_changed', n: 2 })).toBe(true);
    expect(routeGroupDataMessage({ type: 'group_roundtable_ended', n: 3 })).toBe(true);
    expect(handled).toEqual([]); // still loading

    await loadGroupDataMessages();
    await Promise.resolve();
    expect(handled).toEqual([
      'group_roundtable_started#1',
      'group_speaker_changed#2',
      'group_roundtable_ended#3',
    ]);

    routeGroupDataMessage({ type: 'group_state', n: 4 }); // loaded: handled at once
    expect(handled.at(-1)).toBe('group_state#4');
  });

  it('a message routed from another promise chain right after loading cannot overtake queued ones', async () => {
    const { routeGroupDataMessage, loadGroupDataMessages } =
      await import('../../src/app/group-data-loader.js');

    routeGroupDataMessage({ type: 'group_roundtable_started', n: 1 });
    // A later message whose promise chain settles alongside the module load (not after it)
    const late = import('../../src/app/group-data-messages.js').then(() =>
      routeGroupDataMessage({ type: 'group_speaker_changed', n: 2 })
    );
    await late;
    await loadGroupDataMessages();
    await Promise.resolve();

    expect(handled).toEqual(['group_roundtable_started#1', 'group_speaker_changed#2']);
  });

  it('a failed load is retried on the next group message, keeping what arrived meanwhile', async () => {
    vi.doMock('../../src/app/group-data-messages.js', () => {
      throw new Error('chunk failed');
    });
    const { routeGroupDataMessage, loadGroupDataMessages } =
      await import('../../src/app/group-data-loader.js');
    routeGroupDataMessage({ type: 'group_roundtable_started', n: 1 });
    await expect(loadGroupDataMessages()).rejects.toThrow(); // the chunk failed to load
    expect(handled).toEqual([]);

    vi.doMock('../../src/app/group-data-messages.js', () => ({
      handleGroupDataMessage: (message: { type: string; n?: number }) => {
        handled.push(`${message.type}#${message.n ?? ''}`);
        return true;
      },
    }));
    routeGroupDataMessage({ type: 'group_state', n: 2 }); // triggers the retry
    await loadGroupDataMessages();
    await Promise.resolve();
    expect(handled).toEqual(['group_roundtable_started#1', 'group_state#2']);
    vi.doUnmock('../../src/app/group-data-messages.js');
  });

  it('leaves other messages to the rest of the chain', async () => {
    const { routeGroupDataMessage } = await import('../../src/app/group-data-loader.js');
    for (const message of [
      { type: 'handoff_start' },
      { type: 'group_roundtable_start' },
      { type: 7 },
      null,
      'x',
    ]) {
      expect(routeGroupDataMessage(message)).toBe(false);
    }
  });
});

describe('the loader and the handler agree on group types', () => {
  it('every listed type is one the real handler takes, and no other group_ type is', async () => {
    vi.doUnmock('../../src/app/group-data-messages.js');
    const { GROUP_MESSAGE_TYPES } = await import('../../src/app/group-data-loader.js');
    const { handleGroupDataMessage, resetGroupDataMessages } =
      await import('../../src/app/group-data-messages.js');
    const source = readFileSync(join(__dirname, '../../src/app/group-data-messages.ts'), 'utf8');
    const inSwitch = [...source.matchAll(/case '(group_[a-z_]+)':/g)].map((m) => m[1]);

    expect([...GROUP_MESSAGE_TYPES].sort()).toEqual([...inSwitch].sort());
    for (const type of GROUP_MESSAGE_TYPES) expect(handleGroupDataMessage({ type })).toBe(true);
    resetGroupDataMessages();
  });
});
