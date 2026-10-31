/**
 * Reading Between the Lines
 *
 * Understanding what's NOT being said - the gaps, the deflections,
 * the "I'm fine" that isn't fine.
 *
 * Philosophy: A great friend notices when you're holding back.
 * Not to push, but to create space. "You don't have to talk about it,
 * but I'm here if you want to."
 *
 * PERSISTENCE: User emotional profiles are persisted to Firestore.
 *
 * @module trust/ReadingBetweenLines
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { loadBeforeSave } from '../../utils/load-before-save.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { indexReadingBetweenLines } from '../data-layer/integrations/trust-integration.js';
import {
  detectEmotionalMismatch,
  detectTopicAvoidance,
  detectDeflection,
  detectPermissionSeeking,
  detectUnfinishedThought,
  detectGenZDismissive,
} from './intent-detector.js';
import {
  detectNervousLaughter,
  detectExclamationMasking,
  detectSpiritualDeflection,
  detectTopicChange,
  detectMinimizing,
  getUnsaidProfile as _getUnsaidProfile,
  getAvoidedTopics as _getAvoidedTopics,
  shouldAvoidTopic as _shouldAvoidTopic,
  recordDidShare as _recordDidShare,
  recordDeflectionPattern as _recordDeflectionPattern,
  getDeflectionStats as _getDeflectionStats,
  buildDeflectionContext as _buildDeflectionContext,
} from './tone-analyzer.js';

const log = createLogger({ module: 'ReadingBetweenLines' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnsaidSignal {
  type:
    | 'emotional_mismatch'
    | 'topic_avoidance'
    | 'deflection'
    | 'permission_seeking'
    | 'unfinished_thought'
    | 'minimizing_pain'
    | 'false_closure';

  observation: string;
  underlying: string;
  confidence: number;
  approach: 'create_space' | 'gentle_probe' | 'acknowledge_silently' | 'wait' | 'name_gently';
  phrase?: string;
  context: {
    userMessage: string;
    recentTopics?: string[];
    statedEmotion?: string;
    detectedEmotion?: string;
    previousTopic?: string;
  };
}

export interface ConversationPattern {
  topic: string;
  avoidanceCount: number;
  lastAvoided: Date;
  deflectionPhrases: string[];
}

export interface UserUnsaidProfile {
  userId: string;
  avoidedTopics: ConversationPattern[];
  falseFines: Array<{ timestamp: Date; context: string; actualEmotion?: string }>;
  hangingThreads: Array<{
    topic: string;
    lastMentioned: Date;
    timesStarted: number;
    neverFinished: boolean;
  }>;
  permissionMoments: Array<{ timestamp: Date; leadUp: string; didShare: boolean }>;
}

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

export interface PersistedConversationPattern {
  topic: string;
  avoidanceCount: number;
  lastAvoided: string;
  deflectionPhrases: string[];
}

export interface PersistedUserUnsaidProfile {
  userId: string;
  avoidedTopics: PersistedConversationPattern[];
  falseFines: Array<{ timestamp: string; context: string; actualEmotion?: string }>;
  hangingThreads: Array<{
    topic: string;
    lastMentioned: string;
    timesStarted: number;
    neverFinished: boolean;
  }>;
  permissionMoments: Array<{ timestamp: string; leadUp: string; didShare: boolean }>;
}

function serializeProfile(profile: UserUnsaidProfile): PersistedUserUnsaidProfile {
  return {
    userId: profile.userId,
    avoidedTopics: profile.avoidedTopics.map((t) => ({
      ...t, lastAvoided: t.lastAvoided.toISOString(),
    })),
    falseFines: profile.falseFines.map((f) => ({
      ...f, timestamp: f.timestamp.toISOString(),
    })),
    hangingThreads: profile.hangingThreads.map((h) => ({
      ...h, lastMentioned: h.lastMentioned.toISOString(),
    })),
    permissionMoments: profile.permissionMoments.map((p) => ({
      ...p, timestamp: p.timestamp.toISOString(),
    })),
  };
}

function deserializeProfile(data: PersistedUserUnsaidProfile): UserUnsaidProfile {
  return {
    userId: data.userId,
    avoidedTopics: data.avoidedTopics.map((t) => ({
      ...t, lastAvoided: new Date(t.lastAvoided),
    })),
    falseFines: data.falseFines.map((f) => ({
      ...f, timestamp: new Date(f.timestamp),
    })),
    hangingThreads: data.hangingThreads.map((h) => ({
      ...h, lastMentioned: new Date(h.lastMentioned),
    })),
    permissionMoments: data.permissionMoments.map((p) => ({
      ...p, timestamp: new Date(p.timestamp),
    })),
  };
}

// ============================================================================
// STORAGE (in-memory cache backed by Firestore)
// ============================================================================

const userProfiles = new Map<string, UserUnsaidProfile>();

let persistence: PersistenceStore<PersistedUserUnsaidProfile> | null = null;

function getPersistence(): PersistenceStore<PersistedUserUnsaidProfile> {
  if (!persistence) {
    persistence = createPersistenceStore<PersistedUserUnsaidProfile>({
      collection: 'reading_between_lines',
      documentId: 'profile',
      syncIntervalMs: 5000,
    });
  }
  return persistence;
}

// The stored profile is read before the first save, keeping what was recorded meanwhile
const loader = loadBeforeSave<PersistedUserUnsaidProfile>(
  'reading_between_lines',
  (userId) => getPersistence().load(userId, { strict: 'read' }),
  (userId, stored) => {
    if (!stored) return;
    const saved = deserializeProfile(stored);
    const recorded = userProfiles.get(userId);
    userProfiles.set(userId, recorded ? mergeProfiles(saved, recorded) : saved);
  }
);

/** Merge entries keyed by topic: `add` combines one already stored with one recorded since. */
function byTopic<E extends { topic: string }>(saved: E[], recorded: E[], add: (s: E, r: E) => E) {
  const merged = new Map(saved.map((e) => [e.topic, e]));
  for (const e of recorded) {
    const prev = merged.get(e.topic);
    merged.set(e.topic, prev ? add(prev, e) : e);
  }
  return [...merged.values()];
}

/** What was stored, plus what this process recorded before the stored profile was read. */
function mergeProfiles(saved: UserUnsaidProfile, recorded: UserUnsaidProfile): UserUnsaidProfile {
  return {
    ...saved,
    avoidedTopics: byTopic(saved.avoidedTopics, recorded.avoidedTopics, (s, r) => ({
      ...r,
      avoidanceCount: s.avoidanceCount + r.avoidanceCount,
      deflectionPhrases: [...new Set([...s.deflectionPhrases, ...r.deflectionPhrases])],
    })),
    hangingThreads: byTopic(saved.hangingThreads, recorded.hangingThreads, (s, r) => ({
      ...r,
      timesStarted: s.timesStarted + r.timesStarted,
    })),
    falseFines: [...saved.falseFines, ...recorded.falseFines],
    permissionMoments: [...saved.permissionMoments, ...recorded.permissionMoments],
  };
}

function persistProfile(userId: string): void {
  loader.save(userId, () => {
    const profile = userProfiles.get(userId);
    if (profile) getPersistence().set(userId, serializeProfile(profile));
  });
}

function getOrCreateProfile(userId: string): UserUnsaidProfile {
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      avoidedTopics: [],
      falseFines: [],
      hangingThreads: [],
      permissionMoments: [],
    };
    userProfiles.set(userId, profile);
  }
  return profile;
}

export async function flushReadingBetweenLinesPersistence(): Promise<void> {
  await getPersistence().flush();
  log.info('Reading between lines persistence flushed');
}

export async function shutdownReadingBetweenLines(): Promise<void> {
  await flushReadingBetweenLinesPersistence();
  loader.clear();
  userProfiles.clear();
  log.info('Reading between lines service shutdown complete');
}

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Detect signals of what's NOT being said
 */
export function detectUnsaidSignals(
  userId: string,
  userMessage: string,
  context: {
    recentTopics?: string[];
    statedEmotion?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    topicBeforeThis?: string;
  }
): UnsaidSignal[] {
  void loader.ensure(userId); // the first touch reads the stored profile
  const signals: UnsaidSignal[] = [];
  const lower = userMessage.toLowerCase();
  const profile = getOrCreateProfile(userId);
  let profileModified = false;

  // 1. Emotional mismatch ("I'm fine" + heavy context)
  const emotionalMismatch = detectEmotionalMismatch(lower, context, profile);
  if (emotionalMismatch) { signals.push(emotionalMismatch); profileModified = true; }

  // 2. Topic avoidance
  const avoidance = detectTopicAvoidance(lower, context, profile);
  if (avoidance) { signals.push(avoidance); profileModified = true; }

  // 3. Deflection
  const deflection = detectDeflection(lower, context);
  if (deflection) { signals.push(deflection); }

  // 4. Nervous laughter
  const nervousLaughter = detectNervousLaughter(lower);
  if (nervousLaughter) { signals.push(nervousLaughter); }

  // 5. Exclamation masking
  const exclamationMask = detectExclamationMasking(lower, userMessage);
  if (exclamationMask) { signals.push(exclamationMask); }

  // 6. Spiritual deflection
  const spiritualDeflection = detectSpiritualDeflection(lower);
  if (spiritualDeflection) { signals.push(spiritualDeflection); }

  // 7. Sudden topic change
  const topicChange = detectTopicChange(lower, {
    topicBeforeThis: context.topicBeforeThis,
    recentTopics: context.recentTopics,
  });
  if (topicChange) { signals.push(topicChange); }

  // 8. Gen-Z dismissive patterns
  const genZDismissive = detectGenZDismissive(lower);
  if (genZDismissive) { signals.push(genZDismissive); }

  // 9. Permission-seeking
  const permissionSeek = detectPermissionSeeking(lower, userMessage);
  if (permissionSeek) {
    signals.push(permissionSeek);
    profile.permissionMoments.push({
      timestamp: new Date(),
      leadUp: userMessage.slice(0, 100),
      didShare: false,
    });
    profileModified = true;
  }

  // 10. Unfinished thoughts
  const unfinished = detectUnfinishedThought(userMessage, context);
  if (unfinished) { signals.push(unfinished); }

  // 11. Minimizing pain
  const minimizing = detectMinimizing(lower, context);
  if (minimizing) { signals.push(minimizing); }

  // Persist if profile was modified
  if (profileModified) { persistProfile(userId); }

  // Index significant signals to semantic memory
  if (signals.length > 0) {
    for (const signal of signals) {
      if (signal.confidence >= 0.6) {
        indexReadingBetweenLines(userId, {
          id: `unsaid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          observation: signal.observation,
          whatTheySaid: userMessage.slice(0, 200),
          whatTheyMeant: signal.underlying,
        });
      }
    }
    log.debug(
      { userId, signalCount: signals.length, types: signals.map((s) => s.type) },
      '🔍 Detected unsaid signals'
    );
  }

  return signals;
}

// ============================================================================
// PUBLIC API (delegates to tone-analyzer with internal profile state)
// ============================================================================

export function getUnsaidProfile(userId: string): UserUnsaidProfile | null {
  return _getUnsaidProfile(userProfiles, userId);
}

export function getAvoidedTopics(userId: string): string[] {
  return _getAvoidedTopics(userProfiles, userId);
}

export function shouldAvoidTopic(userId: string, topic: string): boolean {
  return _shouldAvoidTopic(userProfiles, userId, topic);
}

export function recordDidShare(userId: string): void {
  _recordDidShare(userProfiles, userId);
}

export function recordDeflectionPattern(userId: string, signal: UnsaidSignal): void {
  _recordDeflectionPattern(userProfiles, userId, signal, getOrCreateProfile);
  log.debug(
    { userId, topic: signal.underlying },
    '📊 Recorded deflection pattern'
  );
}

export function getDeflectionStats(userId: string) {
  return _getDeflectionStats(userProfiles, userId);
}

export function buildDeflectionContext(userId: string): string {
  return _buildDeflectionContext(userProfiles, userId);
}

export function exportUnsaidProfile(userId: string): PersistedUserUnsaidProfile | null {
  const profile = userProfiles.get(userId);
  if (!profile) return null;
  return serializeProfile(profile);
}

export function importUnsaidProfile(data: PersistedUserUnsaidProfile): void {
  if (!data || !data.userId) {
    log.warn('Invalid unsaid profile data - skipping import');
    return;
  }
  const profile = deserializeProfile(data);
  userProfiles.set(profile.userId, profile);
  log.info(
    { userId: profile.userId, avoidedTopics: profile.avoidedTopics.length, falseFines: profile.falseFines.length },
    '📥 Imported unsaid profile from Firestore'
  );
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  detectUnsaidSignals,
  getUnsaidProfile,
  exportUnsaidProfile,
  importUnsaidProfile,
  getAvoidedTopics,
  shouldAvoidTopic,
  recordDidShare,
  recordDeflectionPattern,
  getDeflectionStats,
  buildDeflectionContext,
};
