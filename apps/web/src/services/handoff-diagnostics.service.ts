/**
 * Handoff Diagnostics Service (Frontend)
 * 
 * Tracks client-side handoff metrics for debugging and visualization.
 * Complements the backend handoff-metrics service.
 * 
 * Usage:
 *   import { handoffDiagnostics } from './handoff-diagnostics.service.js';
 *   
 *   // Track a handoff request
 *   const traceId = handoffDiagnostics.trackRequest('peter-john');
 *   
 *   // Track response
 *   handoffDiagnostics.trackAcknowledged(traceId);
 *   handoffDiagnostics.trackStarted(traceId);
 *   handoffDiagnostics.trackCompleted(traceId);
 *   // or
 *   handoffDiagnostics.trackFailed(traceId, 'connection_lost', 'WebSocket disconnected');
 */

import { createLogger } from '../utils/logger.js';
import type { PersonaId } from '../types/persona.js';

const log = createLogger('HandoffDiag');

// ============================================================================
// TYPES
// ============================================================================

export type ClientHandoffPhase =
  | 'request_sent'       // Frontend sent handoff_request
  | 'acknowledged'       // Backend acknowledged receipt
  | 'started'            // Backend started processing
  | 'completed'          // Backend completed successfully
  | 'failed'             // Failed at some point
  | 'timeout';           // Frontend timed out waiting

export type ClientFailureReason =
  | 'send_failed'        // Failed to send request
  | 'no_acknowledgment'  // Never got acknowledgment
  | 'no_started'         // Never got handoff_started
  | 'no_completed'       // Never got handoff_complete
  | 'backend_error'      // Backend sent handoff_failed
  | 'timeout'            // Timed out waiting
  | 'rate_limited'       // Rate limited by debounce
  | 'cancelled';         // User or system cancelled

export interface ClientHandoffTrace {
  id: string;
  fromPersona: PersonaId;
  toPersona: PersonaId;
  
  // Timing
  requestTime: number;
  ackTime?: number;
  startedTime?: number;
  completedTime?: number;
  failedTime?: number;
  totalDurationMs?: number;
  
  // Phase tracking
  currentPhase: ClientHandoffPhase;
  
  // Result
  success?: boolean;
  failureReason?: ClientFailureReason;
  errorMessage?: string;
  
  // Server info
  serverTraceId?: string;
}

export interface ClientHandoffSummary {
  // Totals
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;
  
  // By failure reason
  byFailureReason: Partial<Record<ClientFailureReason, number>>;
  
  // Timing
  avgRequestToAckMs: number;
  avgAckToStartedMs: number;
  avgStartedToCompletedMs: number;
  avgTotalMs: number;
  
  // Recent failures
  recentFailures: ClientHandoffTrace[];
  
  // In progress
  inProgress: ClientHandoffTrace[];
}

// ============================================================================
// DIAGNOSTICS SERVICE
// ============================================================================

class HandoffDiagnosticsService {
  private traces: Map<string, ClientHandoffTrace> = new Map();
  private completedTraces: ClientHandoffTrace[] = [];
  private readonly MAX_COMPLETED = 100;
  private readonly MAX_RECENT_FAILURES = 20;
  
  /**
   * Track when a handoff request is sent.
   */
  trackRequest(fromPersona: PersonaId, toPersona: PersonaId): string {
    const traceId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    const trace: ClientHandoffTrace = {
      id: traceId,
      fromPersona,
      toPersona,
      requestTime: Date.now(),
      currentPhase: 'request_sent',
    };
    
    this.traces.set(traceId, trace);
    
    log.debug('📊 Handoff request tracked:', { traceId, fromPersona, toPersona });
    
    return traceId;
  }
  
  /**
   * Track when backend acknowledges the request.
   */
  trackAcknowledged(traceId: string, serverSuccess: boolean = true): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      log.warn('Trace not found for acknowledgment:', traceId);
      return;
    }
    
    trace.ackTime = Date.now();
    
    if (serverSuccess) {
      trace.currentPhase = 'acknowledged';
    } else {
      trace.currentPhase = 'failed';
      trace.failureReason = 'backend_error';
    }
    
    log.debug('📊 Handoff acknowledged:', { 
      traceId, 
      latency: trace.ackTime - trace.requestTime,
      success: serverSuccess 
    });
  }
  
  /**
   * Track when handoff_started is received.
   */
  trackStarted(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      log.warn('Trace not found for started:', traceId);
      return;
    }
    
    trace.startedTime = Date.now();
    trace.currentPhase = 'started';
    
    log.debug('📊 Handoff started:', {
      traceId,
      requestToStartMs: trace.startedTime - trace.requestTime,
    });
  }
  
  /**
   * Track when handoff completes successfully.
   */
  trackCompleted(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      log.warn('Trace not found for completion:', traceId);
      return;
    }
    
    const now = Date.now();
    trace.completedTime = now;
    trace.totalDurationMs = now - trace.requestTime;
    trace.currentPhase = 'completed';
    trace.success = true;
    
    this.archiveTrace(trace);
    this.traces.delete(traceId);
    
    log.info('📊 ✅ Handoff completed:', {
      traceId,
      totalMs: trace.totalDurationMs,
      phases: this.getPhaseTimings(trace),
    });
  }
  
  /**
   * Track when handoff fails.
   */
  trackFailed(traceId: string, reason: ClientFailureReason, errorMessage?: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      log.warn('Trace not found for failure:', traceId);
      return;
    }
    
    const now = Date.now();
    trace.failedTime = now;
    trace.totalDurationMs = now - trace.requestTime;
    trace.currentPhase = 'failed';
    trace.success = false;
    trace.failureReason = reason;
    trace.errorMessage = errorMessage;
    
    this.archiveTrace(trace);
    this.traces.delete(traceId);
    
    log.error('📊 ❌ Handoff FAILED:', {
      traceId,
      reason,
      errorMessage,
      totalMs: trace.totalDurationMs,
      failedAtPhase: this.getLastPhase(trace),
    });
  }
  
  /**
   * Find a trace by target persona (for matching incoming messages).
   */
  findTraceByTarget(toPersona: PersonaId): ClientHandoffTrace | undefined {
    for (const trace of this.traces.values()) {
      if (trace.toPersona === toPersona && !trace.success) {
        return trace;
      }
    }
    return undefined;
  }
  
  /**
   * Get summary of client-side handoff metrics.
   */
  getSummary(): ClientHandoffSummary {
    const successes = this.completedTraces.filter(t => t.success);
    const failures = this.completedTraces.filter(t => !t.success);
    
    // By failure reason
    const byFailureReason: Partial<Record<ClientFailureReason, number>> = {};
    for (const trace of failures) {
      if (trace.failureReason) {
        byFailureReason[trace.failureReason] = (byFailureReason[trace.failureReason] || 0) + 1;
      }
    }
    
    // Timing averages
    const requestToAck = successes
      .map(t => t.ackTime && t.requestTime ? t.ackTime - t.requestTime : null)
      .filter((v): v is number => v !== null);
    const ackToStarted = successes
      .map(t => t.startedTime && t.ackTime ? t.startedTime - t.ackTime : null)
      .filter((v): v is number => v !== null);
    const startedToCompleted = successes
      .map(t => t.completedTime && t.startedTime ? t.completedTime - t.startedTime : null)
      .filter((v): v is number => v !== null);
    const totals = successes
      .map(t => t.totalDurationMs)
      .filter((v): v is number => v !== undefined);
    
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    return {
      totalRequests: this.completedTraces.length,
      totalSuccesses: successes.length,
      totalFailures: failures.length,
      successRate: this.completedTraces.length > 0 ? successes.length / this.completedTraces.length : 1,
      byFailureReason,
      avgRequestToAckMs: avg(requestToAck),
      avgAckToStartedMs: avg(ackToStarted),
      avgStartedToCompletedMs: avg(startedToCompleted),
      avgTotalMs: avg(totals),
      recentFailures: failures.slice(-this.MAX_RECENT_FAILURES).reverse(),
      inProgress: Array.from(this.traces.values()),
    };
  }
  
  /**
   * Clear all metrics.
   */
  clear(): void {
    this.traces.clear();
    this.completedTraces = [];
  }
  
  /**
   * Get metrics as console-printable string.
   */
  printSummary(): void {
    const summary = this.getSummary();
    
    log.info('📊 === Handoff Diagnostics Summary ===');
    log.info(`   Total: ${summary.totalRequests} | Success: ${summary.totalSuccesses} | Failed: ${summary.totalFailures}`);
    log.info(`   Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
    log.info(`   Avg Timing: Request→Ack ${summary.avgRequestToAckMs.toFixed(0)}ms | Ack→Started ${summary.avgAckToStartedMs.toFixed(0)}ms | Started→Complete ${summary.avgStartedToCompletedMs.toFixed(0)}ms`);
    log.info(`   Avg Total: ${summary.avgTotalMs.toFixed(0)}ms`);
    
    if (Object.keys(summary.byFailureReason).length > 0) {
      log.info('   Failures by reason:', summary.byFailureReason);
    }
    
    if (summary.inProgress.length > 0) {
      log.info(`   In Progress: ${summary.inProgress.length}`);
    }
  }
  
  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================
  
  private archiveTrace(trace: ClientHandoffTrace): void {
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.MAX_COMPLETED) {
      this.completedTraces = this.completedTraces.slice(-this.MAX_COMPLETED);
    }
  }
  
  private getPhaseTimings(trace: ClientHandoffTrace): Record<string, number> {
    const timings: Record<string, number> = {};
    
    if (trace.ackTime && trace.requestTime) {
      timings.request_to_ack = trace.ackTime - trace.requestTime;
    }
    if (trace.startedTime && trace.ackTime) {
      timings.ack_to_started = trace.startedTime - trace.ackTime;
    }
    if (trace.completedTime && trace.startedTime) {
      timings.started_to_completed = trace.completedTime - trace.startedTime;
    }
    
    return timings;
  }
  
  private getLastPhase(trace: ClientHandoffTrace): string {
    if (trace.completedTime) return 'completed';
    if (trace.startedTime) return 'started';
    if (trace.ackTime) return 'acknowledged';
    return 'request_sent';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const handoffDiagnostics = new HandoffDiagnosticsService();

// Make available globally for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { handoffDiagnostics: HandoffDiagnosticsService }).handoffDiagnostics = handoffDiagnostics;
}

