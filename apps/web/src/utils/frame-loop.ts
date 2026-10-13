/**
 * A requestAnimationFrame loop that runs only while there is something to
 * animate (animation standard 5: nothing runs per frame while idle).
 *
 * The loop schedules a frame only while `shouldRun()` holds and the page is
 * visible. `onFrame` returns false once it has settled, which stops the loop
 * until the next `wake()`. Hiding the page stops it; showing it wakes it.
 */

export interface FrameLoop {
  /** Schedule a frame if none is pending and the loop should run. */
  wake(): void;
  /** Cancel the pending frame. */
  sleep(): void;
  /** True while a frame is scheduled. */
  isRunning(): boolean;
  /** Stop and stop listening for visibility changes. */
  dispose(): void;
}

export function createFrameLoop(
  onFrame: (now: number) => boolean | void,
  shouldRun: () => boolean = () => true
): FrameLoop {
  let frame: number | null = null;
  const canRun = (): boolean => !document.hidden && shouldRun();

  const tick = (now: number): void => {
    frame = null;
    if (!canRun()) return;
    if (onFrame(now) === false) return;
    if (canRun()) frame = requestAnimationFrame(tick);
  };

  const loop: FrameLoop = {
    wake() {
      if (frame === null && canRun()) frame = requestAnimationFrame(tick);
    },
    sleep() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
    isRunning: () => frame !== null,
    dispose() {
      loop.sleep();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };

  const onVisibility = (): void => {
    if (document.hidden) loop.sleep();
    else loop.wake();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return loop;
}
