/**
 * Someone else's words from a call Ferni made for the owner
 * (services/outreach/call-memory.ts), as recall shows them: only inside a
 * reported-speech frame the caller passes in (outreach/caller-text.ts
 * CALLER_TEXT_GUARD + reportedFromCall), never as a plain memory line.
 * Without a frame they are left out: fails closed.
 *
 * @module memory/recall/reported-call
 */

import { REPORTED_CALL_SOURCE } from './expired.js';
import type { RecallFact } from './session-recall.js';

/** How the prompt frames reported speech; passed in from the layer that owns it. */
export interface ReportedSpeechFrame {
  guard: string;
  frame: (name: string, lines: string[]) => string[];
}

/** A recalled fact holding someone else's words from a call Ferni made for them. */
export function isReportedCallFact(f: Pick<RecallFact, 'source'>): boolean {
  return f.source === REPORTED_CALL_SOURCE;
}

/** The guard, then one framed block per person; nothing without a frame or a reported fact. */
export function formatReportedFacts(
  facts: readonly RecallFact[],
  frame: ReportedSpeechFrame | undefined,
  age: (f: RecallFact) => string
): string[] {
  const reported = facts.filter(isReportedCallFact);
  if (!frame || reported.length === 0) return [];
  const byName = new Map<string, string[]>();
  for (const f of reported) {
    const said = `${f.key.replace(/_/g, ' ')}: ${f.value}${age(f)}`;
    byName.set(f.entity, [...(byName.get(f.entity) ?? []), said]);
  }
  return [frame.guard, ...[...byName].flatMap(([name, said]) => frame.frame(name, said))];
}
