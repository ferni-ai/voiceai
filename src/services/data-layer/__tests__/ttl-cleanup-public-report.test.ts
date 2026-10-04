/**
 * The cleanup API returns the TTL report to callers. Per-collection error
 * text (Firestore and credential messages) must stay in the server logs.
 */
import { describe, expect, it } from 'vitest';

import { toPublicCleanupReport, type CleanupReport } from '../ttl-cleanup.js';

const report: CleanupReport = {
  timestamp: new Date('2026-10-02T00:00:00Z'),
  results: [
    { collection: 'ok_collection', deleted: 3, errors: 0, durationMs: 10 },
    {
      collection: 'broken_collection',
      deleted: 0,
      errors: 1,
      durationMs: 5,
      error: 'Error: Unable to detect a Project Id in the current environment.',
    },
  ],
  totalDeleted: 3,
  totalErrors: 1,
  durationMs: 15,
};

describe('toPublicCleanupReport', () => {
  it('drops the error text but keeps which collection failed', () => {
    const publicReport = toPublicCleanupReport(report);

    expect(publicReport.results.map((r) => 'error' in r)).toEqual([false, false]);
    expect(publicReport.results[1]).toEqual({
      collection: 'broken_collection',
      deleted: 0,
      errors: 1,
      durationMs: 5,
    });
    expect(publicReport.totalErrors).toBe(1);
  });

  it('leaves the original report intact for the logs', () => {
    toPublicCleanupReport(report);

    expect(report.results[1].error).toContain('Project Id');
  });
});
