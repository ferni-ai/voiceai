/**
 * Mood timeline: how the user seemed through each conversation, from the
 * emotion detection that already drives live attunement.
 *
 * Live attunement never depends on this: readings are always used in the call.
 * Only the stored timeline is gated: samples are buffered in memory during the
 * call and written (at most once a minute, and when the conversation is
 * summarized) only while the Health category is on. Switching Health off drops
 * the buffers at once.
 *
 *   bogle_users/{uid}/mood_timeline/{conversationId}
 *   bogle_users/{uid}/memory_tombstones/mood_{conversationId}  (deleted stays deleted)
 *
 * @module services/health-memory/mood-timeline
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isCategoryEnabled, onConsentChange } from '../memory-consent/store.js';
import { downsample, summarizeSamples, valenceFor } from './mood-model.js';
import {
  MOOD_COLLECTION,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type MoodConversation,
  type MoodSample,
} from './types.js';

const log = createLogger({ module: 'MoodTimeline' });

const MIN_SAMPLE_GAP_MS = 5_000;
const FLUSH_EVERY_MS = 60_000;
const MAX_SAMPLES = 60;
const MAX_BUFFERED_SAMPLES = 400;
const MAX_BUFFERS = 2_000;
const IDLE_EVICT_MS = 3 * 60 * 60_000;
const MAX_LIST = 60;

interface Buffer {
  readonly userId: string;
  readonly conversationId: string;
  personaId?: string;
  samples: MoodSample[];
  conversationIds: Set<string>;
  lastFlushAt: number;
  touchedAt: number;
  flushing?: Promise<boolean>;
}

const buffers = new Map<string, Buffer>();
const keyOf = (userId: string, conversationId: string) => `${userId}::${conversationId}`;

function docId(conversationId: string): string {
  return conversationId.replace(/\//g, '_').slice(0, 300);
}

export function moodTombstoneId(conversationId: string): string {
  return `mood_${docId(conversationId)}`;
}

function dropUserBuffers(userId: string): void {
  for (const [k, b] of buffers) if (b.userId === userId) buffers.delete(k);
}

// Health switched off in this process: forget anything not yet written.
onConsentChange((userId, category, enabled) => {
  if (category === 'health' && !enabled) dropUserBuffers(userId);
});

function evictIdle(now: number): void {
  if (buffers.size < MAX_BUFFERS) return;
  for (const [k, b] of buffers) if (now - b.touchedAt > IDLE_EVICT_MS) buffers.delete(k);
  while (buffers.size >= MAX_BUFFERS) {
    const oldest = buffers.keys().next().value;
    if (oldest === undefined) break;
    buffers.delete(oldest);
  }
}

export interface MoodReading {
  readonly mood: string;
  readonly intensity: number;
  readonly distress?: number;
  readonly personaId?: string;
  readonly at?: Date;
}

/** Note how the user seems right now. Cheap and synchronous; never throws. */
export function recordMoodSample(
  userId: string,
  conversationId: string,
  reading: MoodReading
): void {
  if (!userId || userId === 'anonymous' || !conversationId || !reading?.mood) return;
  const now = reading.at?.getTime() ?? Date.now();
  const key = keyOf(userId, conversationId);
  let buf = buffers.get(key);
  if (!buf) {
    evictIdle(now);
    buf = {
      userId,
      conversationId,
      samples: [],
      conversationIds: new Set([conversationId]),
      lastFlushAt: now,
      touchedAt: now,
    };
    buffers.set(key, buf);
  }
  if (reading.personaId) buf.personaId = reading.personaId;
  buf.touchedAt = now;
  const mood = reading.mood.toLowerCase().slice(0, 40);
  const last = buf.samples[buf.samples.length - 1];
  if (last && last.mood === mood && now - Date.parse(last.at) < MIN_SAMPLE_GAP_MS) return;
  buf.samples.push({
    at: new Date(now).toISOString(),
    mood,
    valence: valenceFor(mood, reading.intensity, reading.distress ?? 0),
    intensity: Math.round(Math.min(1, Math.max(0, reading.intensity || 0)) * 100) / 100,
  });
  if (buf.samples.length > MAX_BUFFERED_SAMPLES)
    buf.samples = downsample(buf.samples, MAX_SAMPLES * 2);
  if (now - buf.lastFlushAt >= FLUSH_EVERY_MS) void flushBuffer(buf);
}

function col(fs: Firestore, userId: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(MOOD_COLLECTION);
}

async function writeBuffer(buf: Buffer): Promise<boolean> {
  if (buf.samples.length === 0) return false;
  if (!(await isCategoryEnabled(buf.userId, 'health'))) {
    buffers.delete(keyOf(buf.userId, buf.conversationId));
    return false;
  }
  const fs = getFirestoreDb();
  if (!fs) return false;
  const tomb = await fs
    .collection(USERS_COLLECTION)
    .doc(buf.userId)
    .collection(TOMBSTONE_COLLECTION)
    .doc(moodTombstoneId(buf.conversationId))
    .get();
  if (tomb.exists) {
    buffers.delete(keyOf(buf.userId, buf.conversationId));
    return false;
  }
  const samples = downsample(buf.samples, MAX_SAMPLES);
  const summary = summarizeSamples(buf.samples);
  await col(fs, buf.userId)
    .doc(docId(buf.conversationId))
    .set({
      conversationIds: [...buf.conversationIds],
      ...(buf.personaId ? { personaId: buf.personaId } : {}),
      startedAt: buf.samples[0]?.at,
      endedAt: buf.samples[buf.samples.length - 1]?.at,
      samples,
      ...summary,
      updatedAt: new Date().toISOString(),
    });
  buf.lastFlushAt = Date.now();
  return true;
}

function flushBuffer(buf: Buffer): Promise<boolean> {
  if (buf.flushing) return buf.flushing;
  buf.lastFlushAt = Date.now();
  buf.flushing = writeBuffer(buf)
    .catch((error: unknown) => {
      log.warn({ userId: buf.userId, error: String(error) }, 'Mood timeline write failed');
      return false;
    })
    .finally(() => {
      buf.flushing = undefined;
    });
  return buf.flushing;
}

/**
 * Write and release every buffered conversation for the user (conversation
 * summarized / session end). `conversationId` is added to provenance so a
 * delete by either id finds the timeline. Returns conversations written.
 */
export async function flushMoodTimeline(userId: string, conversationId?: string): Promise<number> {
  let written = 0;
  for (const [key, buf] of [...buffers]) {
    if (buf.userId !== userId) continue;
    if (conversationId) buf.conversationIds.add(conversationId);
    if (buf.flushing) await buf.flushing;
    if (await flushBuffer(buf)) written++;
    buffers.delete(key);
  }
  return written;
}

/** Tests and teardown. */
export function clearMoodBuffers(): void {
  buffers.clear();
}

function parse(id: string, d: Record<string, unknown> | undefined): MoodConversation | null {
  if (!d || !Array.isArray(d.samples)) return null;
  const samples = (d.samples as unknown[]).filter(
    (s): s is MoodSample =>
      !!s &&
      typeof (s as MoodSample).at === 'string' &&
      typeof (s as MoodSample).valence === 'number'
  );
  const summary = summarizeSamples(samples);
  const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f);
  return {
    id,
    conversationIds: Array.isArray(d.conversationIds)
      ? (d.conversationIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [id],
    ...(typeof d.personaId === 'string' ? { personaId: d.personaId } : {}),
    startedAt: str(d.startedAt, samples[0]?.at ?? ''),
    endedAt: str(d.endedAt, samples[samples.length - 1]?.at ?? ''),
    samples,
    dominantMood: str(d.dominantMood, summary.dominantMood),
    averageValence:
      typeof d.averageValence === 'number' ? d.averageValence : summary.averageValence,
    arc: d.arc === 'lifting' || d.arc === 'heavier' || d.arc === 'mixed' ? d.arc : 'steady',
    updatedAt: str(d.updatedAt, ''),
  };
}

/** Newest first. */
export async function listMoodTimeline(userId: string): Promise<MoodConversation[]> {
  const fs = getFirestoreDb();
  if (!fs) return [];
  try {
    const snap = await col(fs, userId).get();
    return snap.docs
      .map((d) => parse(d.id, d.data()))
      .filter((c): c is MoodConversation => c !== null)
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, MAX_LIST);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not list mood timeline');
    return [];
  }
}

/** Delete one conversation's timeline (by its id or any id it goes by) and tombstone it. */
export async function deleteMoodFor(
  userId: string,
  conversationId: string,
  reason: 'user_deleted' | 'voice_forget' | 'conversation_deleted' = 'conversation_deleted'
): Promise<number> {
  buffers.delete(keyOf(userId, conversationId));
  const fs = getFirestoreDb();
  if (!fs) return 0;
  let deleted = 0;
  const snap = await col(fs, userId).get();
  for (const d of snap.docs) {
    const ids = Array.isArray(d.data()?.conversationIds)
      ? (d.data()?.conversationIds as unknown[])
      : [];
    if (d.id !== docId(conversationId) && !ids.includes(conversationId)) continue;
    await fs
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(TOMBSTONE_COLLECTION)
      .doc(moodTombstoneId(d.id))
      .set({ createdAt: new Date().toISOString(), reason, kind: 'mood' });
    await d.ref.delete();
    deleted++;
  }
  return deleted;
}

export async function deleteAllMood(userId: string): Promise<number> {
  dropUserBuffers(userId);
  const fs = getFirestoreDb();
  if (!fs) return 0;
  const snap = await col(fs, userId).get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.docs.length;
}

export async function countMood(userId: string): Promise<number> {
  const fs = getFirestoreDb();
  if (!fs) return 0;
  return (await col(fs, userId).get()).docs.length;
}
