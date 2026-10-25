/**
 * The transcript cleanup job on the Firestore emulator.
 *
 * Calls and call summaries are stored with Timestamps (realtime-memory,
 * summarization-worker); the job compared them with ISO strings, which
 * Firestore never orders against a Timestamp, so it deleted no transcripts
 * while reporting success. Group sessions store ISO strings, so those matched.
 *
 * The privacy policy keeps conversation history for the life of the account,
 * so the job is off unless TRANSCRIPT_CLEANUP is on. Off, nothing is deleted;
 * on, exactly the records past retention under bogle_users/{uid} go.
 *
 * Needs FIRESTORE_EMULATOR_HOST; skips without it.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared setup fakes Firestore; this test must reach the emulator.
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-transcript-cleanup';
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe.skipIf(!emulator)('transcript cleanup on the emulator', () => {
  let db: Firestore;
  let TranscriptCleanupJob: typeof import('../transcript-cleanup-job.js').TranscriptCleanupJob;

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT ??= PROJECT;
    const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
    db = getAdminFirestore();
    ({ TranscriptCleanupJob } = await import('../transcript-cleanup-job.js'));
  });

  const user = (uid: string) => db.collection('bogle_users').doc(uid);
  const exists = async (path: string) => (await db.doc(path).get()).exists;

  /** One old and one recent record of each kind, as their writers store them. */
  async function seed(): Promise<void> {
    await db.recursiveDelete(db.collection('bogle_users'));
    await db.recursiveDelete(db.collection('elsewhere'));
    const u = user('uid_a');
    await u.set({ name: 'A' });
    for (const [id, days] of [
      ['conv_old', 200],
      ['conv_new', 10],
    ] as const) {
      await u
        .collection('conversations')
        .doc(id)
        .set({ startedAt: ago(days), turnCount: 1 });
      await u
        .collection('conversations')
        .doc(id)
        .collection('turns')
        .doc('t1')
        .set({
          role: 'user',
          content: 'something said',
          timestamp: ago(days),
        });
      // CALL_TIMELINE docs (call-timeline.ts) beside the turns
      const timeline = u.collection('conversations').doc(id).collection('timeline');
      await timeline.doc('meta').set({ v: 1, chunks: 1 });
      await timeline.doc('chunk-000').set({ v: 1, events: [{ kind: 'caller_final' }] });
    }
    await u
      .collection('conversation_summaries')
      .doc('sum_old')
      .set({ createdAt: ago(400) });
    await u
      .collection('conversation_summaries')
      .doc('sum_new')
      .set({ createdAt: ago(30) });
    await u
      .collection('group_sessions')
      .doc('grp_old')
      .set({ startedAt: ago(200).toISOString() });
    await u
      .collection('group_sessions')
      .doc('grp_new')
      .set({ startedAt: ago(10).toISOString() });
    // A same-named collection that is not a person's records
    await db.doc('elsewhere/x/conversations/stray').set({ startedAt: ago(500) });
  }

  beforeEach(seed);
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the old query shape (ISO string against a Timestamp) matches nothing; a Date matches', async () => {
    const cutoff = ago(90);
    const byString = await db
      .collectionGroup('conversations')
      .where('startedAt', '<', cutoff.toISOString())
      .get();
    const byDate = await db.collectionGroup('conversations').where('startedAt', '<', cutoff).get();
    expect(byString.size).toBe(0);
    expect(byDate.docs.map((d) => d.id).sort()).toEqual(['conv_old', 'stray']);
  });

  it('off by default: every transcript, summary and group session is still there', async () => {
    const result = await new TranscriptCleanupJob().run({ dryRun: false });
    expect(result.enabled).toBe(false);
    for (const path of [
      'bogle_users/uid_a/conversations/conv_old',
      'bogle_users/uid_a/conversations/conv_old/turns/t1',
      'bogle_users/uid_a/conversations/conv_old/timeline/chunk-000',
      'bogle_users/uid_a/conversation_summaries/sum_old',
      'bogle_users/uid_a/group_sessions/grp_old',
      'elsewhere/x/conversations/stray',
    ]) {
      expect(await exists(path)).toBe(true);
    }
  });

  it('on: deletes exactly what is past retention, with its turns, and nothing else', async () => {
    vi.stubEnv('TRANSCRIPT_CLEANUP', 'on');
    expect(await exists('bogle_users/uid_a/conversations/conv_old')).toBe(true);

    const result = await new TranscriptCleanupJob().run({ dryRun: false });

    expect(result).toMatchObject({
      enabled: true,
      transcriptsDeleted: 1,
      summariesDeleted: 1,
      groupTranscriptsDeleted: 1,
    });
    expect(await exists('bogle_users/uid_a/conversations/conv_old')).toBe(false);
    expect(await exists('bogle_users/uid_a/conversations/conv_old/turns/t1')).toBe(false);
    expect(await exists('bogle_users/uid_a/conversations/conv_old/timeline/meta')).toBe(false);
    expect(await exists('bogle_users/uid_a/conversations/conv_old/timeline/chunk-000')).toBe(false);
    expect(await exists('bogle_users/uid_a/conversation_summaries/sum_old')).toBe(false);
    expect(await exists('bogle_users/uid_a/group_sessions/grp_old')).toBe(false);

    expect(await exists('bogle_users/uid_a/conversations/conv_new')).toBe(true);
    expect(await exists('bogle_users/uid_a/conversations/conv_new/turns/t1')).toBe(true);
    expect(await exists('bogle_users/uid_a/conversations/conv_new/timeline/chunk-000')).toBe(true);
    expect(await exists('bogle_users/uid_a/conversation_summaries/sum_new')).toBe(true);
    expect(await exists('bogle_users/uid_a/group_sessions/grp_new')).toBe(true);
    expect(await exists('bogle_users/uid_a')).toBe(true);
    expect(await exists('elsewhere/x/conversations/stray')).toBe(true);
  });

  it('on, dry run: reports and deletes nothing', async () => {
    vi.stubEnv('TRANSCRIPT_CLEANUP', 'on');
    const result = await new TranscriptCleanupJob().run({ dryRun: true });
    expect(result.transcriptsDeleted).toBe(0);
    expect(await exists('bogle_users/uid_a/conversations/conv_old')).toBe(true);
  });
});
