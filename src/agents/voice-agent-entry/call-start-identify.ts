/**
 * Caller identification at call start, timed into the call-start stages.
 *
 * Identify, the session profile load, cache warm-up and the language and trial
 * checks all read the caller's root doc, so the shared read window opens
 * first and they share one read among them.
 *
 * @module agents/voice-agent-entry/call-start-identify
 */

/** Records a call-start stage; never throws. */
export type MarkCallStage = (sessionId: string, stage: string, atMs: number) => Promise<void>;

/** Open the call-start read window, run identify, and mark identify_start and identify_done. */
export async function identifyWithCallStartStages<T>(
  sessionId: string,
  markStage: MarkCallStage,
  identify: () => Promise<T>
): Promise<T> {
  const { openCallStartReadWindow } = await import('../../utils/call-start-reads.js');
  openCallStartReadWindow();
  const identifyStartedAt = Date.now();
  const identified = await identify();
  const identifyDoneAt = Date.now();
  await markStage(sessionId, 'identify_start', identifyStartedAt);
  await markStage(sessionId, 'identify_done', identifyDoneAt);
  return identified;
}
