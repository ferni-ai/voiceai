/**
 * Which open task the person named when they said "the dry cleaning one".
 * Used by updateTask (update-task.ts) before it changes anything.
 *
 * @module tools/domains/productivity/task-match
 */

/** The fields a match reads; a stored Task has them. */
export interface NamedTask {
  readonly title: string;
}

export type TaskMatch<T extends NamedTask> =
  { kind: 'one'; task: T } | { kind: 'several'; tasks: T[] } | { kind: 'none' };

/** Words that say how a task is named, not which task: "the dry cleaning one". */
const FILLER = new Set(['the', 'a', 'an', 'my', 'one', 'task', 'that', 'this']);

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

/**
 * The open task `said` names ("dry cleaning", "the call with mom"). An exact title
 * wins; otherwise every meaningful word said must be a whole word of the title
 * ("cat" is not in "vacation"). More than one fit is several, never a guess.
 */
export function pickTaskToEdit<T extends NamedTask>(
  open: readonly T[],
  said: string
): TaskMatch<T> {
  const spoken = said.trim().toLowerCase();
  const exact = open.filter((t) => t.title.trim().toLowerCase() === spoken);
  if (exact.length === 1) return { kind: 'one', task: exact[0] };

  const wanted = words(said).filter((w) => !FILLER.has(w));
  if (wanted.length === 0) return { kind: 'none' };
  const fits = open.filter((t) => {
    const have = new Set(words(t.title));
    return wanted.every((w) => have.has(w));
  });
  if (fits.length === 1) return { kind: 'one', task: fits[0] };
  return fits.length === 0 ? { kind: 'none' } : { kind: 'several', tasks: fits };
}
