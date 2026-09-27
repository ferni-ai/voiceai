/**
 * introduceMember used to sleep inside the tool call until the intro would
 * have been spoken (27.6s on a live call) before returning. The LLM cannot
 * speak until its tool returns, so the caller heard silence. The visual reveal
 * is now scheduled and the tool returns at once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHandoffTools } from '../handoff-factory.js';
import { cameoUnlockEvents } from '../state.js';

afterEach(() => vi.useRealTimers());

describe('introduceMember', () => {
  it('returns immediately and fires the reveal after the intro would finish', async () => {
    const { tools } = await buildHandoffTools('ferni');
    const tool = tools.introduceMember as {
      execute(args: object, ctx: object): Promise<{ success: boolean }>;
    };
    const unlocked: string[] = [];
    const onUnlock = (e: { memberId: string }) => unlocked.push(e.memberId);
    cameoUnlockEvents.on('memberUnlocked', onUnlock);

    vi.useFakeTimers();
    const started = Date.now();
    const result = await tool.execute(
      { memberId: 'maya-santos', spoken_intro: 'one two three four five' },
      {}
    );
    expect(result.success).toBe(true);
    expect(Date.now() - started).toBe(0); // no fake time had to pass
    expect(unlocked).toEqual([]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(unlocked).toEqual(['maya-santos']);
    cameoUnlockEvents.off('memberUnlocked', onUnlock);
  }, 30_000);
});
