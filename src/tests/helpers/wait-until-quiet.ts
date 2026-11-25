/**
 * Waits until `read()` has returned the same value for `quietMs`, for a test whose effect lands
 * after the code under test returns (a fire-and-forget write): a count read then had as long to
 * change as a count that did. Gives up after `maxMs`; the caller's assertion reports the value.
 */
export async function waitUntilQuiet(
  read: () => unknown,
  { quietMs = 1_500, maxMs = 10_000 } = {}
): Promise<void> {
  let seen = JSON.stringify(read());
  for (let waited = 0; waited < maxMs; waited += quietMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, quietMs);
    });
    const now = JSON.stringify(read());
    if (now === seen) return;
    seen = now;
  }
}
