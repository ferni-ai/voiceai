/**
 * Cross-Device Sync for Trust Systems
 *
 * Phase 3: Ensures trust data travels with the user across devices
 *
 * Features:
 * - Real-time Firestore sync via change listeners
 * - Conflict resolution (last-write-wins with merge)
 * - Session continuity detection
 * - Device-aware sync
 *
 * Note: This module works on the server side using firebase-admin.
 * Frontend real-time sync happens via API polling or websockets.
 */
export interface SyncState {
    lastSyncTime: Date | null;
    pendingChanges: number;
    isConnected: boolean;
    deviceId: string;
    conflictsResolved: number;
}
export interface SyncEvent {
    type: 'sync_complete' | 'conflict_resolved' | 'offline_queue' | 'reconnected';
    timestamp: Date;
    details: Record<string, unknown>;
}
export interface SessionContinuity {
    previousDevice: string | null;
    previousSessionEnd: Date | null;
    conversationContext: string | null;
    wasInterrupted: boolean;
}
type SyncListener = (event: SyncEvent) => void;
export declare function setDeviceId(userId: string, deviceId: string): void;
export declare function getSyncState(userId: string): SyncState;
export declare function onSyncEvent(listener: SyncListener): () => void;
/**
 * Start listening for changes (server-side polling approach)
 */
export declare function startRealTimeSync(userId: string, onDataUpdate: (systemId: string, data: unknown) => void): () => void;
/**
 * Stop listening for a user
 */
export declare function stopRealTimeSync(userId: string): void;
/**
 * Write trust data with sync metadata
 */
export declare function syncWrite(userId: string, systemId: string, data: unknown, options?: {
    immediate?: boolean;
}): Promise<void>;
export declare function setNetworkStatus(_online: boolean): void;
/**
 * Detect if user is continuing from another device
 */
export declare function detectSessionContinuity(userId: string): Promise<SessionContinuity>;
/**
 * Update session state for continuity tracking
 */
export declare function updateSessionState(userId: string, context: string | null, isEnding?: boolean): Promise<void>;
export declare function cleanup(): void;
export {};
//# sourceMappingURL=cross-device-sync.d.ts.map