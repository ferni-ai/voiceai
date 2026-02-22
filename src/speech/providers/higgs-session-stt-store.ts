/**
 * Higgs Session STT Biomarkers Store
 *
 * When Higgs is used as the session STT (HiggsSTT adapter), transcript + biomarkers
 * come from triggerTranscription() in the adapter. The adapter stores biomarkers here
 * so transcript-handler can attach them to userData without calling fetchHiggsTranscriptAndBiomarkers
 * (which would trigger a second transcription).
 *
 * Lives in speech/providers to avoid speech→agents layer violation (BTH refactor H1.6).
 *
 * @module speech/providers/higgs-session-stt-store
 */

import type { VoiceBiomarkers } from '../tts-gateway/types.js';

const store = new Map<string, VoiceBiomarkers | undefined>();

/**
 * Store biomarkers for a session (called by HiggsSTT when it receives transcript+biomarkers).
 */
export function setHiggsSessionSTTBiomarkers(
  sessionId: string,
  biomarkers: VoiceBiomarkers | undefined
): void {
  store.set(sessionId, biomarkers);
}

/**
 * Get and remove biomarkers for a session (called by transcript-handler when processing final transcript).
 */
export function takeHiggsSessionSTTBiomarkers(sessionId: string): VoiceBiomarkers | undefined {
  const value = store.get(sessionId);
  store.delete(sessionId);
  return value;
}

/**
 * Check if we have biomarkers for a session (e.g. to know transcript came from Higgs session STT).
 */
export function hasHiggsSessionSTTBiomarkers(sessionId: string): boolean {
  return store.has(sessionId);
}
