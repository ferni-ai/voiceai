/**
 * Keeps to how the caller has asked to be talked to.
 *
 * Listens to what the caller says (see conversation/talk-preferences.ts):
 * a request like "I just need you to listen" holds for the rest of the call
 * (userData.talkPreferences, read by the per-reply hook in ferni-agent.ts),
 * and one said as how they are ("I never want advice") is saved and in force
 * from the start of every later call.
 *
 * Transcripts are read as they arrive, interim ones included: the SDK starts
 * the reply from the preflight transcript, and the request should shape that
 * very reply.
 *
 * @module agents/multi-agent/talk-preference-recorder
 */

import {
  applyTalkRequests,
  detectTalkRequests,
  isTalkPreference,
  type TalkPreference,
} from '../../conversation/talk-preferences.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TalkPreferences' });

interface TalkPreferenceHolder {
  talkPreferences?: TalkPreference[];
}

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

export interface TalkPreferenceRecorderDeps {
  userData: TalkPreferenceHolder;
  /** Save a lasting preference for later calls. */
  saveLasting?: (preference: TalkPreference) => void;
}

export function createTalkPreferenceRecorder(deps: TalkPreferenceRecorderDeps) {
  const saved = new Set<TalkPreference>();
  return {
    /** Preferences stored on earlier calls: in force from the start. */
    loaded(stored: readonly TalkPreference[]): void {
      for (const p of stored) saved.add(p);
      deps.userData.talkPreferences = [
        ...new Set([...(deps.userData.talkPreferences ?? []), ...stored]),
      ];
    },
    /** Something the caller said (interim or final). */
    heard(text: string): void {
      const requests = detectTalkRequests(text);
      if (requests.length === 0) return;
      const before = new Set(deps.userData.talkPreferences ?? []);
      const after = applyTalkRequests(before, requests);
      deps.userData.talkPreferences = [...after];
      for (const r of requests) {
        if (r.on && r.lasting && !saved.has(r.preference)) {
          saved.add(r.preference);
          deps.saveLasting?.(r.preference);
        }
      }
      if (after.size !== before.size || [...after].some((p) => !before.has(p))) {
        log.info({ preferences: [...after] }, 'Talk preferences changed');
      }
    },
  };
}

/** Feed the recorder from the session's transcripts. Returns the unsubscribe. */
export function wireTalkPreferenceRecorder(
  session: SessionEvents,
  recorder: ReturnType<typeof createTalkPreferenceRecorder>
): () => void {
  const onTranscript = (event: unknown) => {
    const transcript = (event as { transcript?: string })?.transcript;
    if (transcript) recorder.heard(transcript);
  };
  session.on?.('user_input_transcribed', onTranscript);
  return () => session.off?.('user_input_transcribed', onTranscript);
}

const TALK_DOC = 'talk';

/** The caller's lasting preferences. Never throws. */
export async function loadTalkPreferences(userId: string): Promise<TalkPreference[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc(TALK_DOC)
      .get();
    const lasting = (doc.data()?.lasting as unknown[] | undefined) ?? [];
    return lasting.filter(isTalkPreference);
  } catch (error) {
    log.warn({ error: String(error) }, 'Talk preferences not loaded');
    return [];
  }
}

/** Remember a lasting preference. Never throws. */
export async function saveTalkPreference(
  userId: string,
  preference: TalkPreference
): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc(TALK_DOC)
      .set({ lasting: FieldValue.arrayUnion(preference), updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    log.warn({ error: String(error) }, 'Talk preference not saved');
  }
}
