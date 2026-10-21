/**
 * Back during a call keeps the call: the entry comes back and a hint shows.
 * A panel's own back entry stacked on ours still closes the panel first.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCallBackGuard,
  type CallBackGuard,
} from '../../../src/ui/call-room/call-back-guard.js';

/** history.back() in jsdom fires popstate on a later task. */
async function back(): Promise<void> {
  const popped = new Promise<void>((resolve) =>
    window.addEventListener('popstate', () => resolve(), { once: true })
  );
  history.back();
  await popped;
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let guard: CallBackGuard;
let hint: ReturnType<typeof vi.fn>;

beforeEach(() => {
  history.replaceState(null, '');
  hint = vi.fn();
  guard = createCallBackGuard(hint);
});

afterEach(() => {
  guard.dispose();
});

describe('call back guard', () => {
  it('pushes one call entry when the call starts', () => {
    const before = history.length;
    guard.enter();
    guard.enter();
    expect(history.length).toBe(before + 1);
    expect(history.state).toEqual({ ferniCall: true });
  });

  it('back during the call re-pushes the entry and shows the hint', async () => {
    guard.enter();
    await back();
    expect(history.state).toEqual({ ferniCall: true });
    expect(hint).toHaveBeenCalledOnce();
  });

  it("back from a panel's entry lands on ours and leaves the call alone", async () => {
    guard.enter();
    history.pushState({ ferniCall: true, ferniOverlay: true }, '');
    await back();
    expect(history.state).toEqual({ ferniCall: true });
    expect(hint).not.toHaveBeenCalled();
  });

  it('hang-up gives the entry back quietly when it is on top', async () => {
    guard.enter();
    const popped = new Promise<void>((resolve) =>
      window.addEventListener('popstate', () => resolve(), { once: true })
    );
    guard.leave();
    await popped;
    expect(history.state).toBeNull();
    expect(hint).not.toHaveBeenCalled();
  });

  it('hang-up under an open panel does not navigate', () => {
    guard.enter();
    history.pushState({ ferniCall: true, ferniOverlay: true }, '');
    const backSpy = vi.spyOn(history, 'back');
    guard.leave();
    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it('after hang-up, back is left to the app', async () => {
    guard.enter();
    history.pushState({ unrelated: true }, '');
    guard.leave();
    await back();
    expect(history.state).toEqual({ ferniCall: true });
    expect(hint).not.toHaveBeenCalled();
  });
});
