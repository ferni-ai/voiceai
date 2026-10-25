/**
 * A review decision applies only to the content that was submitted.
 *
 * Updating an item that was already under review kept the old submission, so a
 * reviewer assigned to it could approve after the content had been replaced.
 * Now each submission records a hash of the manifest content; changed content
 * supersedes the open submission with a new one, and an approval is refused
 * when the item no longer matches the submission's hash.
 *
 * Real review-queue module; Firestore (in-memory), the registry and
 * notifications are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; data: Record<string, unknown> };
const docs = vi.hoisted(() => [] as Doc[]);
vi.mock('firebase-admin/firestore', () => {
  // Timestamps (*At fields) read back as Firestore Timestamps do
  const toStored = (v: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k.endsWith('At') && x != null ? { toDate: () => new Date(x as string) } : x,
      ])
    );
  const snap = (d: Doc) => ({
    id: d.id,
    exists: true,
    data: () => d.data,
    ref: {
      update: async (patch: Record<string, unknown>) => {
        Object.assign(d.data, toStored(patch));
      },
    },
  });
  const query = (filters: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) => query([...filters, [f, v]]),
    get: async () => {
      const hits = docs.filter((d) => filters.every(([f, v]) => d.data[f] === v)).map(snap);
      return { empty: hits.length === 0, docs: hits };
    },
  });
  return {
    getFirestore: () => ({
      collection: (name: string) => ({
        ...query([['__collection', name]]),
        add: async (data: Record<string, unknown>) => {
          const doc = {
            id: `sub-${docs.length + 1}`,
            data: { ...toStored(data), __collection: name },
          };
          docs.push(doc);
          return { id: doc.id };
        },
      }),
    }),
  };
});

const tools = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../marketplace/index.js', () => ({
  getTool: (id: string) => tools.get(id),
  getAgent: () => undefined,
}));
vi.mock('../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn(),
  isEmailDeliveryAvailable: () => false,
}));
vi.mock('../../services/push-notifications.js', () => ({
  getPushNotificationsService: () => ({ sendToUser: vi.fn(async () => ({})) }),
}));

const { submitForReview, assignReviewer, submitReview, getOpenSubmission } =
  await import('../review-queue.js');

function tool(version: string, llmDescription = 'Does a thing') {
  return {
    id: 'tool-x',
    name: 'tool-x',
    version,
    publisher: { id: 'pub-1', name: 'Pub', verified: false },
    description: { short: 'A tool', long: 'A tool' },
    execution: { runtime: { type: 'webhook' }, limits: { timeoutMs: 5000 } },
    interface: { llmDescription },
    permissions: { required: [], optional: [] },
    metadata: { category: 'productivity', tags: [] },
    verification: { trustLevel: 'unverified', verified: false },
  };
}

beforeEach(() => {
  docs.length = 0;
  tools.clear();
  tools.set('tool-x', tool('1.0.0'));
});

describe('review queue content binding', () => {
  it('replaces an open submission when the content is resubmitted', async () => {
    const first = await submitForReview('pub-1', 'tool-x', 'tool');
    tools.set('tool-x', tool('2.0.0', 'Now does something else'));

    const second = await submitForReview('pub-1', 'tool-x', 'tool');

    expect(second.id).not.toBe(first.id);
    expect(docs.find((d) => d.id === first.id)!.data.status).toBe('superseded');
    expect((await getOpenSubmission('tool-x'))!.id).toBe(second.id);
  });

  it("refuses the old reviewer's approval once the content was resubmitted", async () => {
    await submitForReview('pub-1', 'tool-x', 'tool');
    await assignReviewer('tool-x', 'rev-1', 'Reviewer');
    tools.set('tool-x', tool('2.0.0', 'Now does something else'));
    await submitForReview('pub-1', 'tool-x', 'tool');

    await expect(submitReview('tool-x', 'rev-1', 'approved', 'lgtm')).rejects.toThrow();
  });

  it('refuses approval when the item changed after submission', async () => {
    await submitForReview('pub-1', 'tool-x', 'tool');
    await assignReviewer('tool-x', 'rev-1', 'Reviewer');
    tools.set('tool-x', tool('2.0.0', 'Swapped without resubmitting'));

    await expect(submitReview('tool-x', 'rev-1', 'approved', 'lgtm')).rejects.toThrow(/changed/);
  });

  it('approves the content that was submitted', async () => {
    await submitForReview('pub-1', 'tool-x', 'tool');
    await assignReviewer('tool-x', 'rev-1', 'Reviewer');

    const decided = await submitReview('tool-x', 'rev-1', 'approved', 'lgtm');
    expect(decided.status).toBe('approved');
  });
});
