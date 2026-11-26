/**
 * CRISIS_GATE_TURN_READS (#4004): a reply gate waiting for its turn's pipeline read hears when
 * one starts.
 *
 * A preemptive reply runs the gate, and its read, before the turn ends; the pipeline's read of
 * that turn starts at the end of the turn. The gate's look at the turn's reads (turnVerdicts) is
 * a snapshot, so a read that starts after it is never weighed. crisis-classifier.ts notes each
 * kept read as it starts; a gate waiting on that call wakes and looks again. In memory only; a
 * waiter is dropped when its time runs out.
 *
 * @module CrisisTurnReadArrival
 */

type Wake = () => void;

/** Call scope → the gates waiting for that call's next kept read. */
const waiting = new Map<string, Set<Wake>>();

/** A classifier read of `scope` started and is kept for its turn: wake every gate waiting on it. */
export function noteTurnRead(scope: string): void {
  const wakes = waiting.get(scope);
  if (!wakes) return;
  waiting.delete(scope);
  for (const wake of wakes) wake();
}

/** True once a kept read of `scope` starts; false when `ms` pass first. */
export async function nextTurnRead(scope: string, ms: number): Promise<boolean> {
  if (!(ms > 0)) return false;
  return new Promise<boolean>((resolve) => {
    const wakes = waiting.get(scope) ?? new Set<Wake>();
    waiting.set(scope, wakes);
    const settle = (arrived: boolean): void => {
      clearTimeout(timer);
      wakes.delete(onRead);
      if (!wakes.size && waiting.get(scope) === wakes) waiting.delete(scope);
      resolve(arrived);
    };
    const onRead: Wake = () => settle(true);
    const timer = setTimeout(() => settle(false), ms); // before onRead can run
    wakes.add(onRead);
  });
}
