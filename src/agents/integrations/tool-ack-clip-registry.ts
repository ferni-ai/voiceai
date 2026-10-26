/**
 * Where TOOL_ACK_CLIP (tool-ack-clip.ts) and the in-stream lead-in
 * (tool-lead-in.ts) agree who acknowledges a tool. A leaf module: no import cycle.
 *
 * @module agents/integrations/tool-ack-clip-registry
 */

type TakesOver = (tool: string, words: string) => boolean;

const takeovers = new WeakMap<object, TakesOver>();
const textLeadIns = new WeakMap<object, number>();

/** The clip wiring for a call says which tools it acknowledges; null removes it. */
export function setAckClipTakeover(session: object, takesOver: TakesOver | null): void {
  if (takesOver) takeovers.set(session, takesOver);
  else takeovers.delete(session);
}

/** tool-lead-in.ts asks this before inserting a line: true leaves it to the clip. */
export function ackClipTakesOver(session: object, tool: string, words: string): boolean {
  return takeovers.get(session)?.(tool, words) ?? false;
}

/** tool-lead-in.ts put a line into a reply's text: no clip on top of it. */
export function noteTextLeadIn(session: object, at = Date.now()): void {
  textLeadIns.set(session, at);
}

export function textLeadInAt(session: object): number {
  return textLeadIns.get(session) ?? 0;
}
