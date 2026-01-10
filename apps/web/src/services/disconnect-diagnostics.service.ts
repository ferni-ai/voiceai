/**
 * Client-Side Disconnect Diagnostics Service
 *
 * Captures comprehensive context when disconnects happen to help diagnose
 * the root cause of mic drops and session interruptions.
 *
 * @module services/disconnect-diagnostics
 */

import { createLogger } from '../utils/logger.js';
import { apiPost } from '../utils/api.js';

const log = createLogger('DisconnectDiagnostics');

// ============================================================================
// TYPES
// ============================================================================

export interface DisconnectDiagnostic {
  // Timing
  timestamp: string;
  sessionDurationMs: number;
  timeSinceLastActivityMs: number;

  // LiveKit State
  livekitReason?: string;
  livekitRoomState?: string;
  livekitConnectionState?: string;
  wasGraceful: boolean;

  // WebRTC State
  iceConnectionState?: string;
  iceGatheringState?: string;
  signalingState?: string;
  rtcStats?: RTCStatsSnapshot;

  // Audio State
  micEnabled?: boolean;
  micTrackState?: string;
  audioOutputState?: string;
  audioContextState?: string;

  // Network State
  networkType?: string;
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  isOnline: boolean;
  wasOfflineRecently: boolean;

  // App State
  visibilityState: string;
  wasBackgroundedRecently: boolean;
  backgroundDurationMs?: number;
  isMuted: boolean;
  personaId?: string;
  turnCount: number;

  // Device Info
  userAgent: string;
  platform: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;

  // Error Context
  lastError?: string;
  errorStack?: string;

  // Session IDs (for correlation)
  sessionId?: string;
  roomName?: string;
  userId?: string;
}

interface RTCStatsSnapshot {
  packetsLost?: number;
  packetsReceived?: number;
  bytesReceived?: number;
  jitter?: number;
  roundTripTime?: number;
  fractionLost?: number;
}

interface NetworkConnection {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// ============================================================================
// STATE TRACKING
// ============================================================================

let sessionStartTime: number | null = null;
let lastActivityTime: number = Date.now();
let turnCount = 0;
let lastBackgroundTime: number | null = null;
let wasBackgroundedRecently = false;
let backgroundDurationMs = 0;
let wasOfflineRecently = false;
let lastOfflineTime: number | null = null;
let lastError: string | null = null;
let lastErrorStack: string | null = null;
let currentSessionId: string | null = null;
let currentRoomName: string | null = null;
let currentUserId: string | null = null;
let currentPersonaId: string | null = null;
let isMuted = false;

// ICE state tracking
let lastIceConnectionState: string | null = null;
let iceStateHistory: Array<{ state: string; timestamp: number }> = [];

// Track the PeerConnection for diagnostics
let trackedPeerConnection: RTCPeerConnection | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize disconnect diagnostics tracking
 */
export function initDisconnectDiagnostics(): void {
  log.info('🔍 Initializing disconnect diagnostics');

  // Track visibility changes (app going to background)
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Track online/offline
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);

  // Track errors that might precede disconnects
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  log.info('✅ Disconnect diagnostics initialized');
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Call when session starts
 */
export function startSession(sessionId: string, roomName: string, userId?: string): void {
  sessionStartTime = Date.now();
  lastActivityTime = Date.now();
  turnCount = 0;
  currentSessionId = sessionId;
  currentRoomName = roomName;
  currentUserId = userId || null;
  wasBackgroundedRecently = false;
  wasOfflineRecently = false;
  iceStateHistory = [];
  lastError = null;
  lastErrorStack = null;

  log.info({ sessionId, roomName }, '📍 Session started for diagnostics');
}

/**
 * Call when session ends normally
 */
export function endSession(): void {
  sessionStartTime = null;
  currentSessionId = null;
  currentRoomName = null;
  iceStateHistory = [];
}

/**
 * Record activity (keeps track of last user interaction)
 */
export function recordActivity(): void {
  lastActivityTime = Date.now();
}

/**
 * Record a conversation turn
 */
export function recordTurn(): void {
  turnCount++;
  lastActivityTime = Date.now();
}

/**
 * Update current persona
 */
export function setPersona(personaId: string): void {
  currentPersonaId = personaId;
}

/**
 * Update mute state
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;
}

/**
 * Track the RTCPeerConnection for diagnostics
 */
export function trackPeerConnection(pc: RTCPeerConnection): void {
  trackedPeerConnection = pc;

  // Track ICE connection state changes
  pc.addEventListener('iceconnectionstatechange', () => {
    const state = pc.iceConnectionState;
    const timestamp = Date.now();

    iceStateHistory.push({ state, timestamp });

    // Keep only last 20 state changes
    if (iceStateHistory.length > 20) {
      iceStateHistory.shift();
    }

    // Log problematic states
    if (state === 'disconnected' || state === 'failed') {
      log.warn(
        {
          state,
          previousState: lastIceConnectionState,
          history: iceStateHistory.slice(-5),
        },
        `⚠️ ICE connection state: ${state}`
      );
    }

    lastIceConnectionState = state;
  });

  // Track signaling state changes
  pc.addEventListener('signalingstatechange', () => {
    log.debug({ state: pc.signalingState }, 'Signaling state changed');
  });

  // Track connection state (newer API)
  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState;
    if (state === 'disconnected' || state === 'failed') {
      log.warn({ state }, `⚠️ PeerConnection state: ${state}`);
    }
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    lastBackgroundTime = Date.now();
    log.debug('📱 App went to background');
  } else if (document.visibilityState === 'visible' && lastBackgroundTime) {
    backgroundDurationMs = Date.now() - lastBackgroundTime;
    wasBackgroundedRecently = true;

    // Clear the flag after 30 seconds
    setTimeout(() => {
      wasBackgroundedRecently = false;
    }, 30000);

    log.debug({ backgroundDurationMs }, '📱 App returned from background');
  }
}

function handleOffline(): void {
  lastOfflineTime = Date.now();
  wasOfflineRecently = true;
  log.warn('📡 Network went OFFLINE');
}

function handleOnline(): void {
  const offlineDuration = lastOfflineTime ? Date.now() - lastOfflineTime : 0;
  log.info({ offlineDurationMs: offlineDuration }, '📡 Network back ONLINE');

  // Clear the flag after 60 seconds
  setTimeout(() => {
    wasOfflineRecently = false;
  }, 60000);
}

function handleError(event: ErrorEvent): void {
  lastError = event.message;
  lastErrorStack = event.error?.stack;
}

function handleRejection(event: PromiseRejectionEvent): void {
  lastError = String(event.reason);
  lastErrorStack = event.reason?.stack;
}

// ============================================================================
// DIAGNOSTIC CAPTURE
// ============================================================================

/**
 * Capture full disconnect diagnostic context.
 * Call this when a disconnect is detected.
 */
export async function captureDisconnectDiagnostic(
  livekitReason?: string,
  wasGraceful: boolean = false,
  roomState?: string
): Promise<DisconnectDiagnostic> {
  const now = Date.now();

  // Get network info
  const nav = navigator as Navigator & { connection?: NetworkConnection };
  const connection = nav.connection;

  // Get RTC stats if available
  let rtcStats: RTCStatsSnapshot | undefined;
  if (trackedPeerConnection) {
    try {
      rtcStats = await getRTCStats(trackedPeerConnection);
    } catch (e) {
      log.debug({ error: String(e) }, 'Failed to get RTC stats');
    }
  }

  // Get audio context state
  let audioContextState: string | undefined;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      audioContextState = ctx.state;
      ctx.close();
    }
  } catch {
    // Ignore
  }

  const diagnostic: DisconnectDiagnostic = {
    // Timing
    timestamp: new Date().toISOString(),
    sessionDurationMs: sessionStartTime ? now - sessionStartTime : 0,
    timeSinceLastActivityMs: now - lastActivityTime,

    // LiveKit State
    livekitReason,
    livekitRoomState: roomState,
    wasGraceful,

    // WebRTC State
    iceConnectionState: trackedPeerConnection?.iceConnectionState,
    iceGatheringState: trackedPeerConnection?.iceGatheringState,
    signalingState: trackedPeerConnection?.signalingState,
    rtcStats,

    // Audio State
    audioContextState,
    isMuted,

    // Network State
    networkType: connection?.type,
    effectiveType: connection?.effectiveType,
    downlinkMbps: connection?.downlink,
    rttMs: connection?.rtt,
    isOnline: navigator.onLine,
    wasOfflineRecently,

    // App State
    visibilityState: document.visibilityState,
    wasBackgroundedRecently,
    backgroundDurationMs: wasBackgroundedRecently ? backgroundDurationMs : undefined,
    turnCount,
    personaId: currentPersonaId || undefined,

    // Device Info
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,

    // Error Context
    lastError: lastError || undefined,
    errorStack: lastErrorStack || undefined,

    // Session IDs
    sessionId: currentSessionId || undefined,
    roomName: currentRoomName || undefined,
    userId: currentUserId || undefined,
  };

  // Log the diagnostic
  const logLevel = wasGraceful ? 'info' : 'error';
  log[logLevel](
    {
      ...diagnostic,
      iceHistory: iceStateHistory.slice(-5), // Include recent ICE history
    },
    wasGraceful
      ? '📊 Disconnect diagnostic captured (graceful)'
      : '🚨 DISCONNECT DIAGNOSTIC CAPTURED - UNEXPECTED DISCONNECT'
  );

  // Send to backend
  await sendDiagnosticToBackend(diagnostic);

  return diagnostic;
}

/**
 * Get RTC stats snapshot
 */
async function getRTCStats(pc: RTCPeerConnection): Promise<RTCStatsSnapshot> {
  const stats = await pc.getStats();
  const snapshot: RTCStatsSnapshot = {};

  stats.forEach((report) => {
    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
      snapshot.packetsLost = report.packetsLost;
      snapshot.packetsReceived = report.packetsReceived;
      snapshot.bytesReceived = report.bytesReceived;
      snapshot.jitter = report.jitter;
    }
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      snapshot.roundTripTime = report.currentRoundTripTime;
    }
    if (report.type === 'remote-inbound-rtp') {
      snapshot.fractionLost = report.fractionLost;
    }
  });

  return snapshot;
}

/**
 * Send diagnostic to backend for analysis
 */
async function sendDiagnosticToBackend(diagnostic: DisconnectDiagnostic): Promise<void> {
  try {
    const response = await apiPost<{ id: string }>('/api/disconnect-diagnostic', diagnostic);

    if (response.ok && response.data) {
      log.info({ diagnosticId: response.data.id }, 'Diagnostic sent to backend');
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to send diagnostic to backend - storing locally');

    // Store in localStorage for later
    try {
      const stored = localStorage.getItem('ferni_disconnect_diagnostics') || '[]';
      const diagnostics = JSON.parse(stored);
      diagnostics.push(diagnostic);
      // Keep only last 10
      if (diagnostics.length > 10) {
        diagnostics.shift();
      }
      localStorage.setItem('ferni_disconnect_diagnostics', JSON.stringify(diagnostics));
    } catch {
      // Ignore storage errors
    }
  }
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Get current connection health snapshot (for debug panel)
 */
export function getConnectionHealthSnapshot(): {
  isOnline: boolean;
  iceState: string | null;
  sessionDurationMs: number;
  turnCount: number;
  wasBackgroundedRecently: boolean;
  wasOfflineRecently: boolean;
  lastActivityAgo: string;
} {
  const now = Date.now();
  const lastActivityAgo = sessionStartTime
    ? `${Math.round((now - lastActivityTime) / 1000)}s ago`
    : 'no session';

  return {
    isOnline: navigator.onLine,
    iceState: trackedPeerConnection?.iceConnectionState || null,
    sessionDurationMs: sessionStartTime ? now - sessionStartTime : 0,
    turnCount,
    wasBackgroundedRecently,
    wasOfflineRecently,
    lastActivityAgo,
  };
}

/**
 * Flush any stored diagnostics to backend
 */
export async function flushStoredDiagnostics(): Promise<void> {
  try {
    const stored = localStorage.getItem('ferni_disconnect_diagnostics');
    if (!stored) return;

    const diagnostics = JSON.parse(stored);
    for (const diagnostic of diagnostics) {
      await sendDiagnosticToBackend({ ...diagnostic, fromStorage: true });
    }

    localStorage.removeItem('ferni_disconnect_diagnostics');
    log.info(`Flushed ${diagnostics.length} stored diagnostics`);
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to flush stored diagnostics');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const disconnectDiagnostics = {
  init: initDisconnectDiagnostics,
  startSession,
  endSession,
  recordActivity,
  recordTurn,
  setPersona,
  setMuted,
  trackPeerConnection,
  capture: captureDisconnectDiagnostic,
  getHealthSnapshot: getConnectionHealthSnapshot,
  flushStored: flushStoredDiagnostics,
};

