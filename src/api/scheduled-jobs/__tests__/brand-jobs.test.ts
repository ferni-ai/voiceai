/**
 * Brand jobs must report failure (not success with zeroed stats) when
 * Firestore is unavailable.
 */

import { describe, expect, it, vi } from 'vitest';
import { fakeResponse } from '../../__tests__/http-test-utils.js';

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

const { sendSlackMessage } = vi.hoisted(() => ({ sendSlackMessage: vi.fn(async () => true) }));
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../helpers.js')>('../helpers.js');
  return { ...actual, sendSlackMessage };
});

import * as brandJobs from '../brand-jobs.js';

const handlers = [
  ['brand-award-deadline-check', brandJobs.handleBrandAwardDeadlineCheck],
  ['brand-story-review-reminder', brandJobs.handleBrandStoryReviewReminder],
  ['brand-workstream-progress', brandJobs.handleBrandWorkstreamProgress],
  ['brand-milestone-check', brandJobs.handleBrandMilestoneCheck],
  ['brand-ambassador-engagement', brandJobs.handleBrandAmbassadorEngagement],
  ['brand-metrics-collection', brandJobs.handleBrandMetricsCollection],
  ['brand-weekly-report', brandJobs.handleBrandWeeklyReport],
  ['brand-publish-stories', brandJobs.handleBrandPublishStories],
] as const;

describe('brand jobs without Firestore', () => {
  it.each(handlers)('%s returns 503 success:false', async (job, handler) => {
    const out = fakeResponse();
    await handler(out.res);
    expect(out.status()).toBe(503);
    expect(out.json()).toMatchObject({ success: false, job });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
