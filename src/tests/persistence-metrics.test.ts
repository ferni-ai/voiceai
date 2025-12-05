/**
 * Persistence Metrics Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistenceMetrics,
  withMetrics,
  withMetricsSync,
} from '../services/persistence-metrics.js';

describe('PersistenceMetrics', () => {
  beforeEach(() => {
    persistenceMetrics.reset();
  });

  describe('profile operations', () => {
    it('should record profile loads', () => {
      persistenceMetrics.recordProfileLoad('user-123', 50);
      persistenceMetrics.recordProfileLoad('user-456', 75);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.profileLoads.count).toBe(2);
      expect(snapshot.profileLoads.totalDurationMs).toBe(125);
      expect(snapshot.profileLoads.errors).toBe(0);
    });

    it('should record profile load errors', () => {
      persistenceMetrics.recordProfileLoad('user-123', 50, 'Connection failed');

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.profileLoads.count).toBe(1);
      expect(snapshot.profileLoads.errors).toBe(1);
      expect(snapshot.profileLoads.lastError).toBe('Connection failed');
    });

    it('should record profile saves', () => {
      persistenceMetrics.recordProfileSave('user-123', 100);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.profileSaves.count).toBe(1);
      expect(snapshot.profileSaves.lastDurationMs).toBe(100);
    });
  });

  describe('intelligence operations', () => {
    it('should record intelligence exports', () => {
      persistenceMetrics.recordIntelligenceExport('user-123', 8, 25);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.intelligenceExports.count).toBe(1);
      expect(snapshot.intelligenceExports.lastDurationMs).toBe(25);
    });

    it('should record intelligence imports', () => {
      persistenceMetrics.recordIntelligenceImport('user-123', 5, 15);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.intelligenceImports.count).toBe(1);
      expect(snapshot.intelligenceImports.lastDurationMs).toBe(15);
    });
  });

  describe('session operations', () => {
    it('should track session lifecycle', () => {
      persistenceMetrics.recordSessionStart('session-1', 'user-123', 'ferni');

      const snapshotDuring = persistenceMetrics.getSnapshot();
      expect(snapshotDuring.sessionsStarted.count).toBe(1);
      expect(snapshotDuring.activeSessions).toBe(1);
      expect(snapshotDuring.currentSessions).toHaveLength(1);
      expect(snapshotDuring.currentSessions[0].userId).toBe('user-123');
      expect(snapshotDuring.currentSessions[0].personaId).toBe('ferni');

      persistenceMetrics.recordSessionEnd('session-1', 500);

      const snapshotAfter = persistenceMetrics.getSnapshot();
      expect(snapshotAfter.sessionsEnded.count).toBe(1);
      expect(snapshotAfter.sessionsEnded.lastDurationMs).toBe(500);
    });

    it('should track auto-saves per session', () => {
      persistenceMetrics.recordSessionStart('session-1', 'user-123', 'ferni');
      persistenceMetrics.recordAutoSave('session-1', 50);
      persistenceMetrics.recordAutoSave('session-1', 45);
      persistenceMetrics.recordAutoSave('session-1', 55);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.autoSaves.count).toBe(3);

      // Check session-specific count
      const session = snapshot.currentSessions.find((s) => s.sessionId === 'session-1');
      expect(session?.autoSaveCount).toBe(3);
    });
  });

  describe('handoff operations', () => {
    it('should track handoffs', () => {
      persistenceMetrics.recordSessionStart('session-1', 'user-123', 'ferni');
      persistenceMetrics.recordHandoff('session-1', 'ferni', 'maya-santos', 150);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.handoffs.count).toBe(1);
      expect(snapshot.handoffs.lastDurationMs).toBe(150);

      const session = snapshot.currentSessions.find((s) => s.sessionId === 'session-1');
      expect(session?.handoffCount).toBe(1);
      expect(session?.personaId).toBe('maya-santos');
    });
  });

  describe('data integrity', () => {
    it('should track validation errors', () => {
      persistenceMetrics.recordValidationError('user-123', 'email', 'Invalid format');

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.validationErrors.count).toBe(1);
      expect(snapshot.validationErrors.lastError).toBe('Invalid format');
    });

    it('should track data recoveries', () => {
      persistenceMetrics.recordDataRecovery('user-123', ['profile', 'preferences'], 200);

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.dataRecoveries.count).toBe(1);
      expect(snapshot.dataRecoveries.lastDurationMs).toBe(200);
    });
  });

  describe('summary report', () => {
    it('should generate accurate summary', () => {
      persistenceMetrics.recordProfileLoad('user-1', 50);
      persistenceMetrics.recordProfileLoad('user-2', 100);
      persistenceMetrics.recordProfileSave('user-1', 75);
      persistenceMetrics.recordSessionStart('session-1', 'user-1', 'ferni');
      persistenceMetrics.recordAutoSave('session-1', 30);
      persistenceMetrics.recordHandoff('session-1', 'ferni', 'maya', 100);

      const report = persistenceMetrics.getSummaryReport();

      expect(report.activeSessions).toBe(1);
      expect((report.profiles as Record<string, number>).loads).toBe(2);
      expect((report.profiles as Record<string, number>).saves).toBe(1);
      expect((report.profiles as Record<string, number>).avgLoadMs).toBe(75); // (50+100)/2
      expect((report.sessions as Record<string, number>).started).toBe(1);
      expect((report.sessions as Record<string, number>).autoSaves).toBe(1);
      expect((report.handoffs as Record<string, number>).total).toBe(1);
    });
  });

  describe('withMetrics helper', () => {
    it('should time async operations', async () => {
      let recordedDuration = 0;

      await withMetrics(
        'test-operation',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'result';
        },
        (durationMs) => {
          recordedDuration = durationMs;
        }
      );

      expect(recordedDuration).toBeGreaterThanOrEqual(10);
    });

    it('should record errors in async operations', async () => {
      let recordedError: string | undefined;

      await expect(
        withMetrics(
          'failing-operation',
          async () => {
            throw new Error('Test error');
          },
          (_, error) => {
            recordedError = error;
          }
        )
      ).rejects.toThrow('Test error');

      expect(recordedError).toBe('Test error');
    });
  });

  describe('withMetricsSync helper', () => {
    it('should time sync operations', () => {
      let recordedDuration = 0;

      const result = withMetricsSync(
        'sync-operation',
        () => {
          // Simulate some work
          let x = 0;
          for (let i = 0; i < 10000; i++) x += i;
          return x;
        },
        (durationMs) => {
          recordedDuration = durationMs;
        }
      );

      expect(result).toBeGreaterThan(0);
      expect(recordedDuration).toBeGreaterThanOrEqual(0);
    });

    it('should record errors in sync operations', () => {
      let recordedError: string | undefined;

      expect(() =>
        withMetricsSync(
          'failing-sync-operation',
          () => {
            throw new Error('Sync test error');
          },
          (_, error) => {
            recordedError = error;
          }
        )
      ).toThrow('Sync test error');

      expect(recordedError).toBe('Sync test error');
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      persistenceMetrics.recordProfileLoad('user-1', 50);
      persistenceMetrics.recordSessionStart('session-1', 'user-1', 'ferni');

      persistenceMetrics.reset();

      const snapshot = persistenceMetrics.getSnapshot();
      expect(snapshot.profileLoads.count).toBe(0);
      expect(snapshot.activeSessions).toBe(0);
      expect(snapshot.currentSessions).toHaveLength(0);
    });
  });
});
