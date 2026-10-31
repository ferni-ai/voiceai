/**
 * runTransaction for an in-memory Firestore fake: reads go straight to the doc refs, and
 * writes apply in order once the function resolves, as a commit does. Writers that check
 * an account before writing (erasing-mark.ts guards) run in a transaction, so every fake
 * a profile or engagement write reaches needs one.
 */
interface FakeRef {
  get: () => Promise<unknown>;
  set: (data: never, options?: { merge?: boolean }) => Promise<unknown>;
}

export async function fakeRunTransaction<T>(
  fn: (tx: {
    get: (ref: FakeRef) => Promise<never>;
    set: (ref: FakeRef, data: unknown, options?: { merge?: boolean }) => void;
  }) => Promise<T>
): Promise<T> {
  const writes: Array<() => Promise<unknown>> = [];
  const result = await fn({
    get: (ref) => ref.get() as Promise<never>,
    set: (ref, data, options) => void writes.push(() => ref.set(data as never, options)),
  });
  for (const write of writes) await write();
  return result;
}
