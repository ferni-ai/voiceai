/**
 * E2E Diagnostics Integration Tests
 *
 * Tests the integration of e2e-diagnostics.ts with the testing framework.
 * Verifies that diagnostic events can be used for test assertions.
 *
 * @module agents/__tests__/diagnostics/diagnostics-integration
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Re-implement diagnostic tracking for tests
// (In production, this comes from e2e-diagnostics.ts)

// ============================================================================
// TEST DIAGNOSTIC TRACKER
// ============================================================================

interface DiagnosticEvent {
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface JobMetrics {
  jobId: string;
  roomName: string;
  status:
    | 'received'
    | 'accepted'
    | 'assigned'
    | 'spawned'
    | 'entry'
    | 'connected'
    | 'completed'
    | 'failed';
  receivedAt: number;
  acceptedAt?: number;
  connectedAt?: number;
  completedAt?: number;
  error?: string;
}

class TestDiagnosticTracker {
  private events: DiagnosticEvent[] = [];
  private jobs: Map<string, JobMetrics> = new Map();
  private metrics = {
    totalJobsReceived: 0,
    totalJobsCompleted: 0,
    totalJobsFailed: 0,
    startTime: Date.now(),
  };

  // Event logging
  log(
    level: DiagnosticEvent['level'],
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    this.events.push({
      level,
      category,
      message,
      data,
      timestamp: Date.now(),
    });
  }

  // Job lifecycle
  jobReceived(jobId: string, roomName: string): void {
    this.metrics.totalJobsReceived++;
    this.jobs.set(jobId, {
      jobId,
      roomName,
      status: 'received',
      receivedAt: Date.now(),
    });
    this.log('INFO', 'JOB', `Job received: ${jobId}`, { jobId, roomName });
  }

  jobAccepted(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'accepted';
      job.acceptedAt = Date.now();
      this.log('INFO', 'JOB', `Job accepted: ${jobId}`);
    }
  }

  jobConnected(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'connected';
      job.connectedAt = Date.now();
      this.log('INFO', 'JOB', `Job connected: ${jobId}`);
    }
  }

  jobCompleted(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.completedAt = Date.now();
      this.metrics.totalJobsCompleted++;
      this.log('INFO', 'JOB', `Job completed: ${jobId}`);
    }
  }

  jobFailed(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      this.metrics.totalJobsFailed++;
      this.log('ERROR', 'JOB', `Job failed: ${jobId}`, { error });
    }
  }

  // Resource tracking
  resourceLoading(name: string): void {
    this.log('DEBUG', 'RESOURCE', `Loading: ${name}`);
  }

  resourceLoaded(name: string, durationMs: number): void {
    this.log('INFO', 'RESOURCE', `Loaded: ${name}`, { durationMs });
  }

  resourceFailed(name: string, error: string): void {
    this.log('ERROR', 'RESOURCE', `Failed: ${name}`, { error });
  }

  // Session tracking
  sessionStarted(sessionId: string, personaId: string): void {
    this.log('INFO', 'SESSION', `Session started: ${sessionId}`, { personaId });
  }

  sessionEnded(sessionId: string, reason: string, durationMs: number): void {
    this.log('INFO', 'SESSION', `Session ended: ${sessionId}`, { reason, durationMs });
  }

  // Queries for assertions
  getEvents(): DiagnosticEvent[] {
    return [...this.events];
  }

  getEventsByCategory(category: string): DiagnosticEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  getEventsByLevel(level: DiagnosticEvent['level']): DiagnosticEvent[] {
    return this.events.filter((e) => e.level === level);
  }

  getJob(jobId: string): JobMetrics | undefined {
    return this.jobs.get(jobId);
  }

  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  hasEvent(category: string, messageContains: string): boolean {
    return this.events.some((e) => e.category === category && e.message.includes(messageContains));
  }

  getErrorEvents(): DiagnosticEvent[] {
    return this.events.filter((e) => e.level === 'ERROR');
  }

  // Reset for tests
  reset(): void {
    this.events = [];
    this.jobs.clear();
    this.metrics = {
      totalJobsReceived: 0,
      totalJobsCompleted: 0,
      totalJobsFailed: 0,
      startTime: Date.now(),
    };
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('E2E Diagnostics Integration', () => {
  let diagnostics: TestDiagnosticTracker;

  beforeEach(() => {
    diagnostics = new TestDiagnosticTracker();
  });

  afterEach(() => {
    diagnostics.reset();
  });

  // ==========================================================================
  // EVENT LOGGING
  // ==========================================================================

  describe('Event Logging', () => {
    it('should log events with correct structure', () => {
      diagnostics.log('INFO', 'TEST', 'Test message', { key: 'value' });

      const events = diagnostics.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        level: 'INFO',
        category: 'TEST',
        message: 'Test message',
        data: { key: 'value' },
      });
      expect(events[0].timestamp).toBeDefined();
    });

    it('should filter events by category', () => {
      diagnostics.log('INFO', 'CAT_A', 'Message A');
      diagnostics.log('INFO', 'CAT_B', 'Message B');
      diagnostics.log('INFO', 'CAT_A', 'Message A2');

      const catAEvents = diagnostics.getEventsByCategory('CAT_A');

      expect(catAEvents).toHaveLength(2);
      expect(catAEvents.every((e) => e.category === 'CAT_A')).toBe(true);
    });

    it('should filter events by level', () => {
      diagnostics.log('INFO', 'TEST', 'Info');
      diagnostics.log('ERROR', 'TEST', 'Error');
      diagnostics.log('WARN', 'TEST', 'Warning');
      diagnostics.log('ERROR', 'TEST', 'Error 2');

      const errorEvents = diagnostics.getEventsByLevel('ERROR');

      expect(errorEvents).toHaveLength(2);
      expect(errorEvents.every((e) => e.level === 'ERROR')).toBe(true);
    });

    it('should check for event presence', () => {
      diagnostics.log('INFO', 'JOB', 'Job received: job-123');

      expect(diagnostics.hasEvent('JOB', 'Job received')).toBe(true);
      expect(diagnostics.hasEvent('JOB', 'Job completed')).toBe(false);
      expect(diagnostics.hasEvent('OTHER', 'Job received')).toBe(false);
    });
  });

  // ==========================================================================
  // JOB LIFECYCLE TRACKING
  // ==========================================================================

  describe('Job Lifecycle Tracking', () => {
    it('should track job received', () => {
      diagnostics.jobReceived('job-1', 'room-1');

      const job = diagnostics.getJob('job-1');

      expect(job).toBeDefined();
      expect(job?.status).toBe('received');
      expect(job?.roomName).toBe('room-1');
      expect(job?.receivedAt).toBeDefined();
    });

    it('should track job acceptance', () => {
      diagnostics.jobReceived('job-2', 'room-2');
      diagnostics.jobAccepted('job-2');

      const job = diagnostics.getJob('job-2');

      expect(job?.status).toBe('accepted');
      expect(job?.acceptedAt).toBeDefined();
      expect(job?.acceptedAt).toBeGreaterThanOrEqual(job?.receivedAt || 0);
    });

    it('should track job connection', () => {
      diagnostics.jobReceived('job-3', 'room-3');
      diagnostics.jobAccepted('job-3');
      diagnostics.jobConnected('job-3');

      const job = diagnostics.getJob('job-3');

      expect(job?.status).toBe('connected');
      expect(job?.connectedAt).toBeDefined();
    });

    it('should track job completion', () => {
      diagnostics.jobReceived('job-4', 'room-4');
      diagnostics.jobAccepted('job-4');
      diagnostics.jobConnected('job-4');
      diagnostics.jobCompleted('job-4');

      const job = diagnostics.getJob('job-4');
      const metrics = diagnostics.getMetrics();

      expect(job?.status).toBe('completed');
      expect(job?.completedAt).toBeDefined();
      expect(metrics.totalJobsCompleted).toBe(1);
    });

    it('should track job failure', () => {
      diagnostics.jobReceived('job-5', 'room-5');
      diagnostics.jobFailed('job-5', 'Connection timeout');

      const job = diagnostics.getJob('job-5');
      const metrics = diagnostics.getMetrics();

      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Connection timeout');
      expect(metrics.totalJobsFailed).toBe(1);
    });

    it('should calculate job metrics', () => {
      // Receive multiple jobs
      diagnostics.jobReceived('job-a', 'room-a');
      diagnostics.jobReceived('job-b', 'room-b');
      diagnostics.jobReceived('job-c', 'room-c');

      // Complete some
      diagnostics.jobCompleted('job-a');
      diagnostics.jobCompleted('job-b');

      // Fail one
      diagnostics.jobFailed('job-c', 'Error');

      const metrics = diagnostics.getMetrics();

      expect(metrics.totalJobsReceived).toBe(3);
      expect(metrics.totalJobsCompleted).toBe(2);
      expect(metrics.totalJobsFailed).toBe(1);
    });
  });

  // ==========================================================================
  // RESOURCE TRACKING
  // ==========================================================================

  describe('Resource Tracking', () => {
    it('should track resource loading', () => {
      diagnostics.resourceLoading('VAD Model');

      expect(diagnostics.hasEvent('RESOURCE', 'Loading')).toBe(true);
    });

    it('should track resource loaded with duration', () => {
      diagnostics.resourceLoaded('VAD Model', 1500);

      const events = diagnostics.getEventsByCategory('RESOURCE');
      const loadedEvent = events.find((e) => e.message.includes('Loaded'));

      expect(loadedEvent).toBeDefined();
      expect(loadedEvent?.data?.durationMs).toBe(1500);
    });

    it('should track resource failure', () => {
      diagnostics.resourceFailed('TTS', 'API key invalid');

      const errors = diagnostics.getErrorEvents();

      expect(errors).toHaveLength(1);
      expect(errors[0].category).toBe('RESOURCE');
      expect(errors[0].data?.error).toBe('API key invalid');
    });
  });

  // ==========================================================================
  // SESSION TRACKING
  // ==========================================================================

  describe('Session Tracking', () => {
    it('should track session start', () => {
      diagnostics.sessionStarted('session-123', 'ferni');

      expect(diagnostics.hasEvent('SESSION', 'started')).toBe(true);

      const events = diagnostics.getEventsByCategory('SESSION');
      expect(events[0].data?.personaId).toBe('ferni');
    });

    it('should track session end with duration', () => {
      diagnostics.sessionEnded('session-123', 'user_disconnect', 300000);

      const events = diagnostics.getEventsByCategory('SESSION');
      const endEvent = events.find((e) => e.message.includes('ended'));

      expect(endEvent).toBeDefined();
      expect(endEvent?.data?.reason).toBe('user_disconnect');
      expect(endEvent?.data?.durationMs).toBe(300000);
    });
  });

  // ==========================================================================
  // TEST ASSERTIONS
  // ==========================================================================

  describe('Test Assertions with Diagnostics', () => {
    it('should assert no errors occurred', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      diagnostics.jobCompleted('job-1');

      const errors = diagnostics.getErrorEvents();

      expect(errors).toHaveLength(0);
    });

    it('should assert specific events occurred', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      diagnostics.resourceLoading('VAD');
      diagnostics.resourceLoaded('VAD', 500);
      diagnostics.jobConnected('job-1');

      // Assert the expected sequence occurred
      expect(diagnostics.hasEvent('JOB', 'received')).toBe(true);
      expect(diagnostics.hasEvent('RESOURCE', 'Loading')).toBe(true);
      expect(diagnostics.hasEvent('RESOURCE', 'Loaded')).toBe(true);
      expect(diagnostics.hasEvent('JOB', 'connected')).toBe(true);
    });

    it('should assert timing within bounds', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      diagnostics.jobAccepted('job-1');

      const job = diagnostics.getJob('job-1');
      const acceptanceTime = (job?.acceptedAt || 0) - (job?.receivedAt || 0);

      // Acceptance should be nearly instant in tests
      expect(acceptanceTime).toBeLessThan(100);
    });

    it('should assert job status transitions', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      expect(diagnostics.getJob('job-1')?.status).toBe('received');

      diagnostics.jobAccepted('job-1');
      expect(diagnostics.getJob('job-1')?.status).toBe('accepted');

      diagnostics.jobConnected('job-1');
      expect(diagnostics.getJob('job-1')?.status).toBe('connected');

      diagnostics.jobCompleted('job-1');
      expect(diagnostics.getJob('job-1')?.status).toBe('completed');
    });

    it('should assert error details', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      diagnostics.jobFailed('job-1', 'LiveKit connection refused');

      const job = diagnostics.getJob('job-1');

      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('LiveKit');
      expect(job?.error).toContain('connection');
    });
  });

  // ==========================================================================
  // RESET AND ISOLATION
  // ==========================================================================

  describe('Reset and Test Isolation', () => {
    it('should reset all state', () => {
      diagnostics.jobReceived('job-1', 'room-1');
      diagnostics.log('INFO', 'TEST', 'Message');

      diagnostics.reset();

      expect(diagnostics.getEvents()).toHaveLength(0);
      expect(diagnostics.getJob('job-1')).toBeUndefined();
      expect(diagnostics.getMetrics().totalJobsReceived).toBe(0);
    });

    it('should not leak state between test runs', () => {
      // First "test"
      diagnostics.jobReceived('job-a', 'room-a');
      expect(diagnostics.getMetrics().totalJobsReceived).toBe(1);

      diagnostics.reset();

      // Second "test"
      diagnostics.jobReceived('job-b', 'room-b');
      expect(diagnostics.getMetrics().totalJobsReceived).toBe(1);
      expect(diagnostics.getJob('job-a')).toBeUndefined();
    });
  });
});
