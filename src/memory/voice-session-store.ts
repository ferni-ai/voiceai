/**
 * Per-Session Voice Memory Store
 *
 * Collects voice characteristics (pitch, rate, energy, stress, emotion)
 * during a session and persists to Firestore for cross-session comparison
 * ("you sound different today").
 *
 * Flow:
 * 1. recordVoiceSnapshot() - called when voice emotion is available (per turn/utterance)
 * 2. At session end, aggregate snapshots → voice profile
 * 3. persistVoiceSession() - write to bogle_users/{userId}/voice_sessions/{sessionId}
 * 4. getLastVoiceSession() - for comparison at next session start
 *
 * @module memory/voice-session-store
 */

import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'VoiceSessionStore' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSnapshot {
  turnIndex: number;
  pitch: number;
  speechRate: number;
  energy: number;
  stressLevel: number;
  emotion: string;
}

export interface VoiceProfile {
  avgPitch: number;
  avgSpeechRate: number;
  avgEnergy: number;
  avgStressLevel: number;
  voiceQuality: string;
  emotionalRange: number;
}

export interface VoiceSessionDocument {
  sessionId: string;
  timestamp: number;
  duration: number; // session length in minutes
  voiceProfile: VoiceProfile;
  turnSnapshots: VoiceSnapshot[];
  comparison?: {
    pitchDelta: number;
    stressDelta: number;
    energyDelta: number;
    note: string;
  };
}

// ============================================================================
// IN-MEMORY STORE (session-scoped)
// ============================================================================

interface SessionVoiceState {
  sessionId: string;
  userId: string;
  snapshots: VoiceSnapshot[];
  sessionStartMs: number;
}

const sessionVoiceStore = new Map<string, SessionVoiceState>();

// ============================================================================
// CORE API
// ============================================================================

/**
 * Record a voice snapshot when prosody analysis is available.
 * Lightweight - just numbers, not full ProsodyFeatures.
 */
export function recordVoiceSnapshot(
  sessionId: string,
  userId: string,
  snapshot: VoiceSnapshot
): void {
  let state = sessionVoiceStore.get(sessionId);
  if (!state) {
    state = {
      sessionId,
      userId,
      snapshots: [],
      sessionStartMs: Date.now(),
    };
    sessionVoiceStore.set(sessionId, state);
  }

  state.snapshots.push(snapshot);
  log.debug(
    { sessionId, userId, turnIndex: snapshot.turnIndex, snapshotCount: state.snapshots.length },
    'Voice snapshot recorded'
  );
}

/**
 * Aggregate snapshots into a voice profile.
 */
function aggregateToProfile(snapshots: VoiceSnapshot[]): VoiceProfile {
  if (snapshots.length === 0) {
    return {
      avgPitch: 150,
      avgSpeechRate: 150,
      avgEnergy: 0.5,
      avgStressLevel: 0.3,
      voiceQuality: 'clear',
      emotionalRange: 0,
    };
  }

  const n = snapshots.length;
  const avgPitch =
    snapshots.reduce((s, x) => s + x.pitch, 0) / n;
  const avgSpeechRate =
    snapshots.reduce((s, x) => s + x.speechRate, 0) / n;
  const avgEnergy =
    snapshots.reduce((s, x) => s + x.energy, 0) / n;
  const avgStressLevel =
    snapshots.reduce((s, x) => s + x.stressLevel, 0) / n;

  // Most frequent voice quality / emotion as proxy for quality
  const emotionCounts = new Map<string, number>();
  for (const s of snapshots) {
    emotionCounts.set(s.emotion, (emotionCounts.get(s.emotion) || 0) + 1);
  }
  let voiceQuality = 'clear';
  let maxCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxCount) {
      maxCount = count;
      voiceQuality = emotion;
    }
  }

  // Emotional range = variance in stress (proxy for valence/arousal variance)
  const stressMean = avgStressLevel;
  const stressVariance =
    snapshots.reduce((s, x) => s + Math.pow(x.stressLevel - stressMean, 2), 0) / n;
  const emotionalRange = Math.min(1, Math.sqrt(stressVariance) * 2);

  return {
    avgPitch,
    avgSpeechRate,
    avgEnergy,
    avgStressLevel,
    voiceQuality,
    emotionalRange,
  };
}

/**
 * Map VoiceEmotionResult to VoiceSnapshot.
 * Use when recording from audio-processor / turn-handler.
 */
export function toVoiceSnapshot(
  voiceEmotion: {
    primary: string;
    prosody?: {
      pitchMean?: number;
      speechRate?: number;
      energyMean?: number;
      voiceQuality?: string;
    };
    stressLevel?: number;
  },
  turnIndex: number
): VoiceSnapshot {
  const prosody = voiceEmotion.prosody ?? {};
  return {
    turnIndex,
    pitch: prosody.pitchMean ?? 150,
    speechRate: prosody.speechRate ?? 150,
    energy: prosody.energyMean ?? 0.5,
    stressLevel: voiceEmotion.stressLevel ?? 0.3,
    emotion: voiceEmotion.primary ?? 'neutral',
  };
}

/**
 * Persist voice session to Firestore. Fire-and-forget, non-blocking.
 * Writes to bogle_users/{userId}/voice_sessions/{sessionId}
 */
export async function persistVoiceSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const state = sessionVoiceStore.get(sessionId);
  if (!state || state.snapshots.length === 0) {
    log.debug({ sessionId, userId }, 'No voice snapshots to persist');
    return false;
  }

  const db = getFirestoreDb();
  if (!db) {
    log.warn({ sessionId, userId }, 'Firestore unavailable, skipping voice session persist');
    return false;
  }

  const profile = aggregateToProfile(state.snapshots);
  const durationMinutes = (Date.now() - state.sessionStartMs) / (60 * 1000);

  const doc: Omit<VoiceSessionDocument, 'comparison'> = {
    sessionId,
    timestamp: Date.now(),
    duration: Math.round(durationMinutes * 10) / 10,
    voiceProfile: profile,
    turnSnapshots: state.snapshots.slice(-50), // Keep last 50 to limit doc size
  };

  try {
    // Compare with previous session if available
    const lastSession = await getLastVoiceSession(userId);
    if (lastSession?.voiceProfile) {
      const prev = lastSession.voiceProfile;
      const pitchDelta = profile.avgPitch - prev.avgPitch;
      const stressDelta = profile.avgStressLevel - prev.avgStressLevel;
      const energyDelta = profile.avgEnergy - prev.avgEnergy;

      const notes: string[] = [];
      if (Math.abs(stressDelta) > 0.15) {
        notes.push(stressDelta > 0 ? 'higher stress than usual' : 'lower stress than usual');
      }
      if (Math.abs(pitchDelta) > 15) {
        notes.push(pitchDelta > 0 ? 'higher pitch than usual' : 'lower pitch than usual');
      }
      if (Math.abs(energyDelta) > 0.15) {
        notes.push(energyDelta > 0 ? 'higher energy than usual' : 'lower energy than usual');
      }

      (doc as VoiceSessionDocument).comparison = {
        pitchDelta,
        stressDelta,
        energyDelta,
        note: notes.length > 0 ? notes.join('; ') : 'similar to last session',
      };
    }

    const ref = db.collection('bogle_users').doc(userId).collection('voice_sessions').doc(sessionId);
    await ref.set(doc);

    log.info(
      {
        sessionId,
        userId,
        snapshotCount: state.snapshots.length,
        durationMinutes: doc.duration,
        hasComparison: !!(doc as VoiceSessionDocument).comparison,
      },
      'Voice session persisted to Firestore'
    );

    // Clear in-memory state after successful persist
    sessionVoiceStore.delete(sessionId);
    return true;
  } catch (error) {
    log.error({ error: String(error), sessionId, userId }, 'Failed to persist voice session');
    return false;
  }
}

/**
 * Get the last voice session for a user (for comparison at session start).
 */
export async function getLastVoiceSession(
  userId: string,
  excludeSessionId?: string
): Promise<VoiceSessionDocument | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('voice_sessions')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    for (const doc of snap.docs) {
      if (doc.id === excludeSessionId) continue;
      return doc.data() as VoiceSessionDocument;
    }
    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not load last voice session');
    return null;
  }
}

/**
 * Check if current session differs notably from last (for context injection).
 * Returns a flag/note when stress, pitch, or energy changed significantly.
 */
export async function getVoiceComparisonNote(
  userId: string,
  currentProfile: VoiceProfile
): Promise<string | null> {
  const last = await getLastVoiceSession(userId);
  if (!last?.voiceProfile) return null;

  const prev = last.voiceProfile;
  if (Math.abs(currentProfile.avgStressLevel - prev.avgStressLevel) > 0.15) {
    return currentProfile.avgStressLevel > prev.avgStressLevel
      ? 'User sounds more stressed than usual'
      : 'User sounds more relaxed than usual';
  }
  if (Math.abs(currentProfile.avgPitch - prev.avgPitch) > 15) {
    return 'User\'s voice pitch has shifted notably';
  }
  if (Math.abs(currentProfile.avgEnergy - prev.avgEnergy) > 0.15) {
    return currentProfile.avgEnergy > prev.avgEnergy
      ? 'User has higher energy than usual'
      : 'User has lower energy than usual';
  }
  return null;
}

/**
 * Cleanup in-memory state for a session (call on session end before persist).
 */
export function cleanupVoiceSessionStore(sessionId: string): void {
  sessionVoiceStore.delete(sessionId);
}
