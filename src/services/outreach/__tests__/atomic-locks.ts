/** Test double for guarded-text's send locks (TextStore lock/lockedAt/unlock). */

/** lock/lockedAt/unlock with lock() atomic as Firestore's create() is: a held id can't be taken. */
export function atomicLocks() {
  const held = new Map<string, string>();
  return {
    lock: async (id: string, at: string) => {
      if (held.has(id)) return false;
      held.set(id, at);
      return true;
    },
    lockedAt: async (id: string) => held.get(id),
    unlock: async (id: string) => {
      held.delete(id);
    },
  };
}
