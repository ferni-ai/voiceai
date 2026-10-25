/**
 * Deleting a voice journal entry deletes its recording (#2782 review, 2026-10-25).
 *
 * The recording is saved as voice-journals/{uid}/{agentId}/{timestamp}-entry-{id}.webm
 * and, being private, the entry keeps no URL to it, so the delete finds it in that folder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Map<string, { name: string; delete: () => Promise<void> }>());
const getFiles = vi.hoisted(() =>
  vi.fn(async ({ prefix }: { prefix: string }) => [
    [...files.values()].filter((f) => f.name.startsWith(prefix)),
  ])
);

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket(): { getFiles: typeof getFiles } {
      return { getFiles };
    }
  },
}));

function stored(name: string): void {
  files.set(name, { name, delete: vi.fn(async () => void files.delete(name)) });
}

async function loadService(): Promise<typeof import('../gcs-storage-service.js')> {
  vi.resetModules();
  return import('../gcs-storage-service.js');
}

beforeEach(() => {
  files.clear();
  getFiles.mockClear();
  vi.stubEnv('GCS_CUSTOM_AGENT_BUCKET', 'test-bucket');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deleteVoiceJournalAudio', () => {
  it("deletes that entry's recording and no one else's", async () => {
    const { deleteVoiceJournalAudio } = await loadService();
    stored('voice-journals/uid1/twin1/1700000000000-entry-journal_1.webm');
    stored('voice-journals/uid1/twin1/1700000000001-entry-journal_12.webm');
    stored('voice-journals/uid1/twin1/1700000000002-entry-x_journal_1.webm');
    stored('voice-journals/uid2/twin1/1700000000003-entry-journal_1.webm');
    stored('voice-journals/uid1/twin1/abc-entry-journal_1.webm');
    stored('voice-journals/uid1/twin1/sub/1700000000004-entry-journal_1.webm');

    expect(await deleteVoiceJournalAudio('uid1', 'twin1', 'journal_1')).toBe(1);
    expect([...files.keys()]).toEqual([
      'voice-journals/uid1/twin1/1700000000001-entry-journal_12.webm',
      'voice-journals/uid1/twin1/1700000000002-entry-x_journal_1.webm',
      'voice-journals/uid2/twin1/1700000000003-entry-journal_1.webm',
      'voice-journals/uid1/twin1/abc-entry-journal_1.webm',
      'voice-journals/uid1/twin1/sub/1700000000004-entry-journal_1.webm',
    ]);
    expect(getFiles).toHaveBeenCalledWith({ prefix: 'voice-journals/uid1/twin1/' });
  });

  it('a storage failure is logged, not thrown: the entry is already gone', async () => {
    const { deleteVoiceJournalAudio } = await loadService();
    getFiles.mockRejectedValueOnce(new Error('storage down'));

    await expect(deleteVoiceJournalAudio('uid1', 'twin1', 'journal_1')).resolves.toBe(0);
  });
});
