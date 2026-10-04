/**
 * When a provider isn't configured: development and tests get a labelled stub,
 * production gets an honest error. Never report fake success to real users.
 *
 * Deliberately dependency-free (no logger): callers already log the thrown
 * error, and test suites mock the logger module in incompatible ways.
 */
export function devStubOrUnavailable<T>(unavailableMessage: string, stub: () => T): T {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(unavailableMessage);
  }
  return stub();
}
