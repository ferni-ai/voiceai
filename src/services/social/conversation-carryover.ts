/**
 * Conversation carryover (CONVERSATION_CARRYOVER=on, off by default): how the
 * caller was on their last call, and what it was about, kept for the next one.
 *
 * The conversation state (conversation-state.ts) lived and died with one call.
 * initConversationStateWithPersistence had no caller, so every call ended with
 * "SKIP: Persistence was NOT enabled" (414 of 414 call ends on the dev and prod
 * agents, 2026-10-10..13), and the next call started blank. Its mood was blank even
 * during the call: the emotion read each turn reached SessionStateManager but
 * not this state (session-state.ts setEmotionAnalysis now passes it on).
 *
 * What carries is small, per user, and under bogle_users/{userId}, so account
 * erasure (erase-user-record.ts) removes it with the rest of the record:
 * the mood (sentiment and up to three emotions), the last few topics, and the
 * topics left to circle back to. No words the caller said.
 *
 * Restored state stays out of the live state: yesterday's mood shown as
 * today's would be wrong, so the next call reads it as "last call" through
 * restoredCarryover() (agents/personas/last-call-note.ts). A mood fades after
 * three days; nothing older than two weeks comes back.
 *
 * @module services/social/conversation-carryover
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  endConversation,
  getConversationState,
  type ConversationState,
  type ConversationStateManager,
  type EmotionalContext,
} from './conversation-state.js';

const log = createLogger({ module: 'ConversationCarryover' });

/** bogle_users/{userId}/conversation_state/carryover */
export const CARRYOVER_COLLECTION = 'conversation_state';
export const CARRYOVER_DOC = 'carryover';
/** A mood is only worth mentioning for a few days. */
export const MOOD_MAX_AGE_DAYS = 3;
/** Topics come back for two weeks, then the slate is clean. */
export const CARRYOVER_MAX_AGE_DAYS = 14;
/** A long call is saved this often (and once at the end), only when it changed. */
export const CARRYOVER_SAVE_EVERY_MS = 5 * 60_000;
const SAVE_TIMEOUT_MS = 2_000;
const MAX_TOPICS = 5;
const MAX_CIRCLE_BACK = 3;
const MAX_EMOTIONS = 3;
const DAY_MS = 86_400_000;

type Emotion = EmotionalContext['emotions'][number];
type Sentiment = EmotionalContext['sentiment'];

export interface CarryoverSnapshot {
  v: 1;
  sessionId: string;
  savedAt: string;
  sentiment: Sentiment;
  emotions: Emotion[];
  topics: string[];
  circleBack: string[];
}

/** What the next call gets: the snapshot, aged. */
export interface RestoredCarryover {
  ageDays: number;
  /** Absent once the mood is older than MOOD_MAX_AGE_DAYS, or when it was neutral. */
  mood?: { sentiment: Sentiment; emotions: Emotion[] };
  topics: string[];
  circleBack: string[];
}

/** Firestore, handed in by the agent layer (setCarryoverDb); none means nothing is saved or read. */
let carryoverDb: () => FirebaseFirestore.Firestore | null = () => null;

export function setCarryoverDb(get: () => FirebaseFirestore.Firestore | null): void {
  carryoverDb = get;
}

export function conversationCarryoverEnabled(env: Env = process.env): boolean {
  return flagOn('CONVERSATION_CARRYOVER', env);
}

/** A real account: anonymous and default sessions have no one to carry for. */
function carriesFor(userId: string): boolean {
  return !!userId && userId !== 'default' && userId !== 'anonymous' && !userId.includes('/');
}

// ============================================================================
// MOOD (the turn's emotion read, into the conversation state)
// ============================================================================

/** Emotion detector labels (intelligence/detectors/emotion.ts) to the state's words. */
const EMOTION_OF: Record<string, Emotion> = {
  joy: 'happy',
  happy: 'happy',
  anticipation: 'excited',
  excited: 'excited',
  trust: 'calm',
  calm: 'calm',
  content: 'calm',
  sadness: 'sad',
  sad: 'sad',
  regret: 'sad',
  fear: 'anxious',
  anxiety: 'anxious',
  anxious: 'anxious',
  worried: 'anxious',
  anger: 'frustrated',
  angry: 'frustrated',
  frustrated: 'frustrated',
  disgust: 'frustrated',
  confused: 'confused',
  grateful: 'grateful',
};
const POSITIVE = new Set<Emotion>(['happy', 'excited', 'calm', 'grateful']);
const NEGATIVE = new Set<Emotion>(['sad', 'anxious', 'frustrated']);

/**
 * Record the turn's emotion read in the conversation state (flag on only).
 * Called from SessionStateManager.setEmotionAnalysis.
 */
export function noteCarryoverMood(
  state: ConversationStateManager,
  analysis: { primary: string; intensity: number; distressLevel?: number },
  env: Env = process.env
): void {
  if (!conversationCarryoverEnabled(env)) return;
  const emotion = EMOTION_OF[analysis.primary.trim().toLowerCase()];
  if (!emotion) return;
  state.detectEmotion(emotion);
  const distressed = (analysis.distressLevel ?? 0) > 0.5;
  const sentiment: Sentiment =
    distressed || NEGATIVE.has(emotion) ? 'negative' : POSITIVE.has(emotion) ? 'positive' : 'mixed';
  state.setEmotionalContext({ sentiment, confidence: analysis.intensity });
}

// ============================================================================
// SNAPSHOT, STALENESS, STORE
// ============================================================================

/** What this call leaves for the next, or null when there is nothing worth keeping. */
export function snapshotOf(
  state: ConversationStateManager,
  now = new Date()
): CarryoverSnapshot | null {
  const { emotional, topic } = state.getState();
  const topics = [...new Set(topic.history.map((t) => t.topic).filter(Boolean))].slice(-MAX_TOPICS);
  const circleBack = topic.pendingCircleBack.map((c) => c.topic).slice(0, MAX_CIRCLE_BACK);
  const moody = emotional.sentiment !== 'neutral' && emotional.emotions.length > 0;
  // A short call about nothing must not wipe out a richer last call.
  if (!moody && topics.length === 0 && circleBack.length === 0) return null;
  return {
    v: 1,
    sessionId: state.sessionId,
    savedAt: now.toISOString(),
    sentiment: moody ? emotional.sentiment : 'neutral',
    emotions: moody ? emotional.emotions.slice(-MAX_EMOTIONS) : [],
    topics,
    circleBack,
  };
}

/** The staleness rule: null past CARRYOVER_MAX_AGE_DAYS, no mood past MOOD_MAX_AGE_DAYS. */
export function freshCarryover(
  snap: CarryoverSnapshot,
  now = new Date()
): RestoredCarryover | null {
  const ageMs = now.getTime() - Date.parse(snap.savedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > CARRYOVER_MAX_AGE_DAYS * DAY_MS) return null;
  const ageDays = Math.floor(ageMs / DAY_MS);
  const moodFresh = ageMs <= MOOD_MAX_AGE_DAYS * DAY_MS && snap.sentiment !== 'neutral';
  return {
    ageDays,
    ...(moodFresh ? { mood: { sentiment: snap.sentiment, emotions: snap.emotions } } : {}),
    topics: snap.topics ?? [],
    circleBack: snap.circleBack ?? [],
  };
}

function carryoverRef(db: FirebaseFirestore.Firestore, userId: string) {
  return db
    .collection('bogle_users')
    .doc(userId)
    .collection(CARRYOVER_COLLECTION)
    .doc(CARRYOVER_DOC);
}

export async function saveCarryover(
  userId: string,
  snap: CarryoverSnapshot,
  db: FirebaseFirestore.Firestore | null = carryoverDb()
): Promise<boolean> {
  if (!db || !carriesFor(userId)) return false;
  try {
    await carryoverRef(db, userId).set(snap);
    log.info({ userId, sessionId: snap.sessionId }, 'Conversation carryover saved');
    return true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Conversation carryover save failed');
    return false;
  }
}

export async function loadCarryover(
  userId: string,
  db: FirebaseFirestore.Firestore | null = carryoverDb()
): Promise<CarryoverSnapshot | null> {
  if (!db || !carriesFor(userId)) return null;
  try {
    const doc = await carryoverRef(db, userId).get();
    const data = doc.exists ? (doc.data() as Partial<CarryoverSnapshot>) : undefined;
    return data?.v === 1 && typeof data.savedAt === 'string' ? (data as CarryoverSnapshot) : null;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Conversation carryover load failed');
    return null;
  }
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

interface CarrySession {
  userId: string;
  restored: RestoredCarryover | null;
  lastSaved?: string;
  timer?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, CarrySession>();

/** Save when the snapshot changed since the last save; returns whether it wrote. */
async function saveIfChanged(sessionId: string, carry: CarrySession): Promise<boolean> {
  const snap = snapshotOf(getConversationState(sessionId));
  if (!snap) return false;
  const key = JSON.stringify({ ...snap, savedAt: '' });
  if (key === carry.lastSaved) return false;
  carry.lastSaved = key;
  return saveCarryover(carry.userId, snap);
}

/**
 * The session's conversation state (replaces getConversationState at session
 * init). With the flag on, also starts reading the last call's carryover in the
 * background (session start never waits for it) and saving this call's.
 */
export function openConversation(
  sessionId: string,
  userId: string,
  agentId: string,
  env: Env = process.env
): ConversationStateManager {
  const state = getConversationState(sessionId, userId, agentId);
  if (!conversationCarryoverEnabled(env) || !carriesFor(userId)) return state;
  const carry: CarrySession = { userId, restored: null };
  sessions.set(sessionId, carry);
  const startedAt = Date.now();
  void loadCarryover(userId).then((snap) => {
    carry.restored = snap ? freshCarryover(snap) : null;
    log.info(
      {
        userId,
        sessionId,
        loadMs: Date.now() - startedAt,
        found: !!snap,
        restored: !!carry.restored,
        mood: carry.restored?.mood?.sentiment,
        topics: carry.restored?.topics.length ?? 0,
      },
      'Conversation carryover restored'
    );
  });
  carry.timer = setInterval(() => void saveIfChanged(sessionId, carry), CARRYOVER_SAVE_EVERY_MS);
  carry.timer.unref?.();
  return state;
}

/** The last call's carryover for this session, once read; null when none or flag off. */
export function restoredCarryover(sessionId: string | undefined): RestoredCarryover | null {
  return sessionId ? (sessions.get(sessionId)?.restored ?? null) : null;
}

/** End the call's conversation state, saving its carryover first (flag on). */
export async function endConversationState(sessionId: string): Promise<ConversationState | null> {
  const carry = sessions.get(sessionId);
  if (carry) {
    clearInterval(carry.timer);
    sessions.delete(sessionId);
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), SAVE_TIMEOUT_MS).unref?.();
    });
    await Promise.race([saveIfChanged(sessionId, carry), timeout]);
  }
  return endConversation(sessionId);
}
