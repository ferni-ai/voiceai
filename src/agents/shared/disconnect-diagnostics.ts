/**
 * Disconnect Diagnostics
 *
 * Provides rich context for understanding why connections dropped.
 * Essential for debugging multi-instance deployments.
 *
 * DISCONNECT REASON CODES (from LiveKit protocol):
 * - 0: UNKNOWN_REASON
 * - 1: CLIENT_INITIATED (user closed app/tab)
 * - 2: DUPLICATE_IDENTITY (another participant with same identity joined)
 * - 3: SERVER_SHUTDOWN
 * - 4: PARTICIPANT_REMOVED (kicked by server)
 * - 5: ROOM_DELETED
 * - 6: STATE_MISMATCH
 * - 7: JOIN_FAILURE
 * - 8: MIGRATION
 * - 9: SIGNAL_CLOSE
 * - 10: ROOM_CLOSED ← Common in multi-instance conflicts!
 * - 11: USER_UNAVAILABLE
 * - 12: USER_REJECTED
 * - 13: SIP_TRUNK_FAILURE
 */

import { createLogger } from '../../utils/safe-logger.js';
import * as os from 'os';

const log = createLogger({ module: 'DisconnectDiagnostics' });

// ============================================================================
// DISCONNECT REASON MAPPING
// ============================================================================

export const DISCONNECT_REASONS: Record<
  number,
  {
    name: string;
    description: string;
    severity: 'info' | 'warning' | 'error';
    likelyCauses: string[];
  }
> = {
  0: {
    name: 'UNKNOWN_REASON',
    description: 'Disconnect reason not specified',
    severity: 'warning',
    likelyCauses: ['Network timeout', 'Server issue', 'Protocol error'],
  },
  1: {
    name: 'CLIENT_INITIATED',
    description: 'User intentionally disconnected',
    severity: 'info',
    likelyCauses: ['User closed app', 'User navigated away', 'User ended call'],
  },
  2: {
    name: 'DUPLICATE_IDENTITY',
    description: 'Another participant joined with same identity',
    severity: 'error',
    likelyCauses: [
      'Multiple browser tabs',
      'Multiple devices same account',
      'Agent identity collision (CRITICAL - check for multiple agent instances!)',
    ],
  },
  3: {
    name: 'SERVER_SHUTDOWN',
    description: 'LiveKit server is shutting down',
    severity: 'warning',
    likelyCauses: ['LiveKit maintenance', 'Server restart', 'Region failover'],
  },
  4: {
    name: 'PARTICIPANT_REMOVED',
    description: 'Participant was removed by server/admin',
    severity: 'warning',
    likelyCauses: ['Admin action', 'Room policy violation', 'Forced disconnect'],
  },
  5: {
    name: 'ROOM_DELETED',
    description: 'Room was explicitly deleted',
    severity: 'warning',
    likelyCauses: ['Admin deleted room', 'Room cleanup', 'API call to delete room'],
  },
  6: {
    name: 'STATE_MISMATCH',
    description: 'Client and server state diverged',
    severity: 'error',
    likelyCauses: ['Bug in client', 'Network partition recovery', 'Protocol mismatch'],
  },
  7: {
    name: 'JOIN_FAILURE',
    description: 'Failed to join room',
    severity: 'error',
    likelyCauses: ['Token expired', 'Room full', 'Permission denied', 'Invalid room name'],
  },
  8: {
    name: 'MIGRATION',
    description: 'Connection migrated to different server',
    severity: 'info',
    likelyCauses: ['LiveKit load balancing', 'Region optimization'],
  },
  9: {
    name: 'SIGNAL_CLOSE',
    description: 'WebSocket signal connection closed',
    severity: 'warning',
    likelyCauses: ['Network interruption', 'WebSocket timeout', 'Proxy/firewall interference'],
  },
  10: {
    name: 'ROOM_CLOSED',
    description: 'Room was closed by server',
    severity: 'error',
    likelyCauses: [
      '⚠️ MULTI-INSTANCE CONFLICT - Multiple workers tried to handle same job',
      'Room empty timeout expired',
      'Max room duration reached',
      'Server-side room close API call',
    ],
  },
  11: {
    name: 'USER_UNAVAILABLE',
    description: 'User became unavailable',
    severity: 'warning',
    likelyCauses: ['User went offline', 'Device lost connectivity'],
  },
  12: {
    name: 'USER_REJECTED',
    description: 'User rejected connection',
    severity: 'info',
    likelyCauses: ['User declined call', 'Permission denied by user'],
  },
  13: {
    name: 'SIP_TRUNK_FAILURE',
    description: 'SIP trunk connection failed',
    severity: 'error',
    likelyCauses: ['SIP provider issue', 'Trunk configuration error'],
  },
};

// ============================================================================
// INSTANCE IDENTIFICATION
// ============================================================================

/**
 * Get unique instance identifier for logging
 */
export function getInstanceId(): string {
  // Use combination of hostname and process ID for uniqueness
  const hostname = os.hostname();
  const pid = process.pid;

  // Also include container ID if running in Docker
  const containerId = process.env.HOSTNAME || '';

  if (containerId && containerId !== hostname) {
    return `${containerId.substring(0, 12)}-${pid}`;
  }

  return `${hostname.substring(0, 12)}-${pid}`;
}

/**
 * Get instance metadata for logging
 */
export function getInstanceMetadata(): Record<string, unknown> {
  return {
    instanceId: getInstanceId(),
    hostname: os.hostname(),
    pid: process.pid,
    containerId: process.env.HOSTNAME,
    agentName: process.env.AGENT_NAME || 'unknown',
    nodeEnv: process.env.NODE_ENV,
    uptime: Math.round(process.uptime()),
  };
}

// ============================================================================
// DISCONNECT ANALYSIS
// ============================================================================

export interface DisconnectContext {
  sessionId: string;
  roomName: string;
  reason: number | string;
  durationMs: number;
  turnCount?: number;
  participantCount?: number;
  wasActive?: boolean;
  lastActivity?: Date;
  userId?: string;
  personaId?: string;
}

export interface DisconnectAnalysis {
  reasonCode: number;
  reasonName: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  likelyCauses: string[];
  wasGraceful: boolean;
  requiresInvestigation: boolean;
  instanceMetadata: Record<string, unknown>;
  recommendations: string[];
}

/**
 * Analyze a disconnect event and provide diagnostic information
 */
export function analyzeDisconnect(context: DisconnectContext): DisconnectAnalysis {
  const reasonCode =
    typeof context.reason === 'number' ? context.reason : parseInt(String(context.reason), 10) || 0;

  const reasonInfo = DISCONNECT_REASONS[reasonCode] || DISCONNECT_REASONS[0];

  // Determine if graceful (user-initiated or expected)
  const gracefulCodes = [1, 8, 12]; // CLIENT_INITIATED, MIGRATION, USER_REJECTED
  const wasGraceful = gracefulCodes.includes(reasonCode);

  // Determine if needs investigation
  const criticalCodes = [2, 6, 10]; // DUPLICATE_IDENTITY, STATE_MISMATCH, ROOM_CLOSED
  const requiresInvestigation =
    criticalCodes.includes(reasonCode) || (context.durationMs < 60000 && !wasGraceful); // Disconnects within 1 min are suspicious

  // Build recommendations
  const recommendations: string[] = [];

  if (reasonCode === 10) {
    recommendations.push(
      'Check for multiple agent instances running simultaneously',
      'Verify only one deployment type is active (standalone VM OR MIG, not both)',
      'Run: gcloud compute instances list | grep voiceai',
      'Check LiveKit dashboard for multiple agent registrations'
    );
  }

  if (reasonCode === 2) {
    recommendations.push(
      'Check for agent identity collisions',
      'Verify AGENT_NAME env var is unique per deployment',
      'Check for zombie processes or containers'
    );
  }

  if (context.durationMs < 30000 && !wasGraceful) {
    recommendations.push(
      'Session was very short - check for initialization issues',
      'Check logs for errors in greeting/TTS/LLM setup'
    );
  }

  return {
    reasonCode,
    reasonName: reasonInfo.name,
    description: reasonInfo.description,
    severity: reasonInfo.severity,
    likelyCauses: reasonInfo.likelyCauses,
    wasGraceful,
    requiresInvestigation,
    instanceMetadata: getInstanceMetadata(),
    recommendations,
  };
}

/**
 * Log a disconnect event with full diagnostic context
 */
export function logDisconnect(context: DisconnectContext): void {
  const analysis = analyzeDisconnect(context);

  const logData = {
    // Session info
    sessionId: context.sessionId,
    roomName: context.roomName,
    userId: context.userId,
    personaId: context.personaId,

    // Disconnect details
    reasonCode: analysis.reasonCode,
    reasonName: analysis.reasonName,
    description: analysis.description,
    wasGraceful: analysis.wasGraceful,

    // Session metrics
    durationMs: context.durationMs,
    durationMinutes: (context.durationMs / 60000).toFixed(2),
    turnCount: context.turnCount,
    participantCount: context.participantCount,
    wasActive: context.wasActive,

    // Instance info
    ...analysis.instanceMetadata,

    // Investigation
    requiresInvestigation: analysis.requiresInvestigation,
    likelyCauses: analysis.likelyCauses,
    recommendations: analysis.recommendations,
  };

  // Log at appropriate level
  if (analysis.severity === 'error' || analysis.requiresInvestigation) {
    log.error(logData, `🔌 DISCONNECT: ${analysis.reasonName} - ${analysis.description}`);
  } else if (analysis.severity === 'warning') {
    log.warn(logData, `🔌 Disconnect: ${analysis.reasonName}`);
  } else {
    log.info(logData, `🔌 Disconnect: ${analysis.reasonName}`);
  }

  // Also write to stderr for immediate visibility
  if (analysis.requiresInvestigation) {
    process.stderr.write(
      `\n⚠️  DISCONNECT REQUIRES INVESTIGATION\n` +
        `   Reason: ${analysis.reasonName} (code ${analysis.reasonCode})\n` +
        `   Session: ${context.sessionId}\n` +
        `   Duration: ${(context.durationMs / 1000).toFixed(1)}s\n` +
        `   Instance: ${analysis.instanceMetadata.instanceId}\n` +
        `   Likely causes:\n${analysis.likelyCauses.map((c) => `     - ${c}`).join('\n')}\n` +
        `   Recommendations:\n${analysis.recommendations.map((r) => `     - ${r}`).join('\n')}\n\n`
    );
  }
}

// ============================================================================
// JOB ROUTING LOGGING
// ============================================================================

/**
 * Log job availability request (for detecting multi-instance conflicts)
 */
export function logJobAvailability(jobId: string, roomName: string): void {
  log.info(
    {
      event: 'job_availability',
      jobId,
      roomName,
      ...getInstanceMetadata(),
      timestamp: new Date().toISOString(),
    },
    `📋 Job availability request: ${jobId} (room: ${roomName})`
  );
}

/**
 * Log job assignment (for detecting multi-instance conflicts)
 */
export function logJobAssignment(jobId: string, roomName: string): void {
  log.info(
    {
      event: 'job_assignment',
      jobId,
      roomName,
      ...getInstanceMetadata(),
      timestamp: new Date().toISOString(),
    },
    `✅ Job assigned: ${jobId} (room: ${roomName})`
  );
}

/**
 * Log job termination with full context
 */
export function logJobTermination(jobId: string, reason?: string): void {
  log.warn(
    {
      event: 'job_termination',
      jobId,
      reason: reason || 'unknown',
      ...getInstanceMetadata(),
      timestamp: new Date().toISOString(),
    },
    `🛑 Job terminated: ${jobId}${reason ? ` (reason: ${reason})` : ''}`
  );
}

export default {
  DISCONNECT_REASONS,
  getInstanceId,
  getInstanceMetadata,
  analyzeDisconnect,
  logDisconnect,
  logJobAvailability,
  logJobAssignment,
  logJobTermination,
};
