/**
 * Where `memory_saved` goes: the session layer plugs in a room sender here.
 * Kept apart from memory-saved.ts so the session layer does not load the memory
 * store (and its optional redis adapter) just to register a callback.
 */

/** Publish to the call's room; false when nothing was delivered. */
export type MemorySavedSend = (
  sessionId: string,
  type: string,
  payload: Record<string, unknown>
) => Promise<boolean>;

let sender: MemorySavedSend | null = null;

/** Called by the session layer once a room can be reached; null unplugs (tests). */
export function setMemorySavedSender(next: MemorySavedSend | null): void {
  sender = next;
}

export function memorySavedSender(): MemorySavedSend | null {
  return sender;
}
