/**
 * Shared types for voice-agent-entry modules.
 *
 * @module agents/voice-agent-entry/types
 */

import type { JobContext } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';

/** Session initialization phase tracker */
export type SessionPhase =
  | 'deps'
  | 'persona'
  | 'connect'
  | 'session'
  | 'services'
  | 'handlers'
  | 'greeting'
  | 'running';

/** User location extracted from IP-based geo metadata */
export interface UserLocation {
  city?: string;
  regionCode?: string;
  countryCode?: string;
}

/** Result from metadata parsing */
export interface ParsedMetadata {
  metadata: Record<string, unknown>;
  callType: string | undefined;
  personaId: string;
  publisherId: string | undefined;
}

/** Result from session services initialization */
export interface SessionServicesResult {
  services: Record<string, unknown>;
  isReturningUser: boolean;
  userData: Record<string, unknown>;
  userId: string | null;
  userName: string | null;
  userAccent: string | null;
  stopPeriodicSync?: () => void;
  subscriptionTier: 'free' | 'friend' | 'partner';
}

/** Session creation result */
export interface SessionCreationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  voiceAgentRef: import('../shared/handoff/types.js').VoiceAgentRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  directorAudioRouter?: any;
  toolCount: number;
  toolLoadMode: string;
}

/** Handler setup result for cleanup */
export interface HandlerSetupResult {
  cleanupHandlers: Array<() => void | Promise<void>>;
}

/** FinOps tier derived from subscription */
export type FinOpsTier = 'free' | 'friend' | 'partner';

/** Resilience wrapper function type */
export type WithResilience = <T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;
    baseDelay: number;
    maxDelay?: number;
    operationName: string;
    onBeforeRetry?: () => Promise<void>;
  }
) => Promise<T>;

/** E2E diagnostics interface (subset used in entry) */
export interface E2EDiagnostics {
  childEntry: (jobId: string) => void;
  resourceLoading: (name: string) => void;
  resourceLoaded: (name: string, durationMs: number) => void;
  sessionConnecting: (roomName: string, identity: string) => void;
  sessionConnected: (jobId: string, roomName: string, identity: string, durationMs: number) => void;
  sessionStarted: (jobId: string, personaId: string) => void;
  sessionEnded: (jobId: string, reason: string, durationMs: number) => void;
  captureError: (context: string, error: Error, meta: Record<string, unknown>) => void;
  custom: (tag: string, message: string, meta: Record<string, unknown>) => void;
}

/** Voice humanization result */
export interface VoiceHumanizationCleanup {
  cleanup: (() => void) | undefined;
}

/** Shared session context passed between phases */
export interface VoiceEntryContext {
  ctx: JobContext;
  sessionId: string;
  jobId: string;
  roomName: string;
  startTime: number;
  cleanupHandlers: Array<() => void | Promise<void>>;
  cleanupTracker: {
    register: (type: 'event' | 'timer' | 'subscription' | 'resource', description: string, cleanup: () => void | Promise<void>) => () => void;
  };
  e2e: E2EDiagnostics;
  withResilience: WithResilience;
  humanizeError: (err: Error) => { shouldNotifyUser: boolean; userMessage: string };
  registerSession: (id: string, info: Record<string, unknown>) => void;
  updateSessionState: (id: string, state: Record<string, unknown>) => void;
  unregisterSession: (id: string, reason: string) => void;
  recordCrash: (type: string, err: Error, sessionId: string, meta: Record<string, unknown>) => void;
  sessionPersona: PersonaConfig;
  modelBaseInstructions: string;
  systemPrompt: string;
}
