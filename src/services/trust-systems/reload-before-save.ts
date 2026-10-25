/**
 * MINOR_CARE: load before save for the trust stores.
 *
 * purgeHeldUser (clearTrustSystemsUser) empties one user's in-memory trust stores at the end of a
 * held call. Their history is still stored, but the next save writes whatever is in memory over
 * it, so a save before the stores are read back keeps only what came after the purge. For a real
 * owner, or an adult the age check got wrong, the rest is gone for good. Learning style, voice
 * prosody and celebration momentum were never read back at all, so a process restart did the same.
 *
 * So a purge holds each doc saveTrustProfiles writes from a store that is read back, until a
 * session start has read it; a failed read keeps it held. The purge still clears the caches: the
 * held call's words must go, and the reload brings back only what was stored before it.
 *
 * @module services/trust-systems/reload-before-save
 */
import { loadMomentumUser, withoutHeldWins } from './celebration-momentum.js';
import {
  loadHeldWindows,
  markHeldWindowsScrubbed,
  scrubHeldDoc,
  storeHeldWindow,
} from './held-window.js';
import { importLearningProfile, type LearningProfile } from './learning-style.js';
import { readTrustDoc } from './trust-doc.js';
import { loadVoiceProsodyUser, withoutHeldSamples } from './voice-prosody-learning.js';

/** The trust_profiles docs whose store a session start reads back (loadTrustProfiles). */
const RELOADED_DOCS = [
  'boundaries',
  'growth',
  'inside_jokes',
  'small_wins',
  'thinking_of_you',
  'learning_style',
  'voice_prosody',
  'celebration_momentum',
];

/** `${userId}/${doc}` not read back since a MINOR_CARE purge or a failed read. */
const unread = new Set<string>();

/** After a MINOR_CARE purge: none of these docs is saved for this user until it's read back. */
export function holdTrustUntilReloaded(userId: string): void {
  for (const doc of RELOADED_DOCS) unread.add(`${userId}/${doc}`);
}

/** A read of one doc: a good one (found or missing) releases it, a failed one holds it. */
export function trustDocRead(userId: string, doc: string, ok: boolean): void {
  if (ok) unread.delete(`${userId}/${doc}`);
  else unread.add(`${userId}/${doc}`);
}

/** Saving this doc now would write over stored history this process hasn't read. */
export const trustDocUnread = (userId: string, doc: string): boolean =>
  unread.has(`${userId}/${doc}`);

/** Session start: read back the stores loadTrustProfiles didn't. Returns the ones read. */
export async function loadReloadedStores(userId: string): Promise<string[]> {
  const loaded: string[] = [];
  const style = await readTrustDoc<LearningProfile>(userId, 'learning_style');
  trustDocRead(userId, 'learning_style', style.status !== 'error');
  if (style.status === 'found') {
    importLearningProfile(userId, style.data);
    loaded.push('learningStyle');
  }
  const stores = [
    ['voice_prosody', loadVoiceProsodyUser],
    ['celebration_momentum', loadMomentumUser],
  ] as const;
  // MINOR_CARE: the held windows any process stored (held-window.ts) before either store reads.
  // Unreadable: both stay unread and unwritable, since a read now could keep a held caller's entries.
  const held = await loadHeldWindows(userId).catch(() => null);
  if (!held) {
    for (const [doc] of stores) trustDocRead(userId, doc, false);
    return loaded;
  }
  if (held.unscrubbed) await scrubAndMark(userId); // the purge's scrub never completed
  for (const [doc, load] of stores) {
    const ok = await load(userId).then(
      () => true,
      () => false
    );
    trustDocRead(userId, doc, ok);
    if (ok) loaded.push(doc);
  }
  return loaded;
}

/**
 * MINOR_CARE purge: rewrite the timer-flushed stores' docs without what the held call recorded
 * before its hold began (held-window.ts). Their trust_profiles mirrors are only written at a
 * session end, from memory, which a held call's end skips; the next save writes them clean.
 */
export async function scrubHeldStores(userId: string): Promise<boolean[]> {
  return Promise.all([
    scrubHeldDoc(userId, 'voice_prosody', 'data', withoutHeldSamples),
    scrubHeldDoc(userId, 'celebration_momentum', 'profile', withoutHeldWins),
  ]);
}

/** Scrub both docs; once both are clean, mark the stored windows scrubbed. Never rejects. */
async function scrubAndMark(userId: string): Promise<void> {
  if ((await scrubHeldStores(userId)).every(Boolean)) await markHeldWindowsScrubbed(userId);
}

/**
 * MINOR_CARE purge: store the held call's window first, so a process that never saw it still
 * drops its entries, then scrub. A step that fails is redone at the user's next session start.
 */
export async function storeAndScrubHeldWindow(
  userId: string,
  window: [number, number]
): Promise<void> {
  await storeHeldWindow(userId, window);
  await scrubAndMark(userId);
}
