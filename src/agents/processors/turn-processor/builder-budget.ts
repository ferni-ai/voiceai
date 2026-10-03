/**
 * Time budgets for the per-turn context builders.
 *
 * A builder that misses its budget (or throws) contributes its fallback, so
 * the turn never waits on it. Production logs at info, and a miss used to be
 * logged at debug: nobody could tell whether a 50 ms builder ever made it into
 * the prompt. The budget collects the misses so the turn can report them once.
 *
 * @module agents/processors/turn-processor/builder-budget
 */

export interface BuilderBudget {
  /** The builder's result, or `fallback` if it misses `timeoutMs` or throws. */
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, name: string): Promise<T>;
  /** Names of the builders that fell back this turn, in the order they did. */
  readonly missed: readonly string[];
}

export function createBuilderBudget(): BuilderBudget {
  const missed: string[] = [];
  return {
    missed,
    async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, name: string): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeout]);
      } catch {
        missed.push(name);
        return fallback;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
