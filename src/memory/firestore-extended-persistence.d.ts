/**
 * Extended Firestore Persistence
 *
 * Persists additional data that was previously ephemeral:
 * - Session state (survives restarts)
 * - Tool execution logs (for pattern analysis)
 * - Persona bonds (relationship with each persona)
 * - Voice profiles (vocal characteristics)
 * - User intents (intent history for learning)
 * - Superhuman cache (cached insights)
 * - Quality metrics (per-session quality data)
 *
 * Schema:
 * - bogle_users/{userId}/sessions/{sessionId} → SessionState
 * - bogle_users/{userId}/tool_executions/{executionId} → ToolExecution
 * - bogle_users/{userId}/persona_bonds/{personaId} → PersonaBond
 * - bogle_users/{userId}/voice_profile → VoiceProfile
 * - bogle_users/{userId}/intents/{intentId} → UserIntent
 * - bogle_users/{userId}/superhuman_cache/{cacheKey} → CachedInsight
 * - bogle_users/{userId}/quality_metrics/{sessionId} → QualityMetrics
 *
 * @module memory/firestore-extended-persistence
 */
interface Firestore {
    collection: (path: string) => CollectionReference;
}
interface CollectionReference {
    doc: (id: string) => DocumentReference;
    get: () => Promise<QuerySnapshot>;
    add: (data: unknown) => Promise<DocumentReference>;
    where: (field: string, op: string, value: unknown) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    limit: (n: number) => Query;
}
interface Query {
    get: () => Promise<QuerySnapshot>;
    limit: (n: number) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}
interface DocumentReference {
    id: string;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<unknown>;
    get: () => Promise<DocumentSnapshot>;
    delete: () => Promise<unknown>;
    update: (data: unknown) => Promise<unknown>;
    collection: (name: string) => CollectionReference;
}
interface DocumentSnapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id: string;
    ref: DocumentReference;
}
interface QuerySnapshot {
    empty: boolean;
    docs: DocumentSnapshot[];
    size: number;
}
export interface SessionState {
    sessionId: string;
    userId: string;
    startedAt: Date;
    lastActiveAt: Date;
    personaId: string;
    connectionType: 'webrtc' | 'websocket';
    deviceInfo?: {
        platform?: string;
        browser?: string;
        deviceId?: string;
    };
    context?: {
        mood?: string;
        topics?: string[];
        emotionalState?: string;
    };
    isActive: boolean;
}
export interface ToolExecution {
    id: string;
    sessionId: string;
    toolId: string;
    toolName: string;
    parameters: Record<string, unknown>;
    result?: string;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
    executedAt: Date;
    personaId: string;
}
export interface PersonaBond {
    personaId: string;
    userId: string;
    totalConversations: number;
    totalDurationMinutes: number;
    firstConversation: Date;
    lastConversation: Date;
    trustLevel: number;
    preferredTopics: string[];
    memorableExchanges: Array<{
        date: Date;
        topic: string;
        emotionalResonance: number;
    }>;
    communicationStyle?: {
        formalityPreference: 'formal' | 'casual' | 'adaptive';
        humorAppreciation: number;
        detailPreference: 'brief' | 'detailed' | 'adaptive';
    };
}
export interface VoiceProfile {
    userId: string;
    updatedAt: Date;
    characteristics: {
        avgPitch?: number;
        avgSpeed?: number;
        volumeProfile?: 'soft' | 'moderate' | 'loud';
        clarity?: number;
    };
    preferences: {
        preferredResponseSpeed?: 'slow' | 'normal' | 'fast';
        pauseTolerance?: number;
        preferredVoiceId?: string;
    };
    emotionalSignatures?: Array<{
        emotion: string;
        voicePattern: string;
        detectedCount: number;
    }>;
    enrollmentStatus?: 'not_enrolled' | 'enrolled' | 'needs_refresh';
}
export interface UserIntent {
    id: string;
    userId: string;
    sessionId: string;
    utterance: string;
    detectedIntent: string;
    confidence: number;
    entities?: Record<string, string>;
    routedToTool?: string;
    successful: boolean;
    correctedIntent?: string;
    timestamp: Date;
}
export interface CachedInsight {
    cacheKey: string;
    userId: string;
    insightType: string;
    data: Record<string, unknown>;
    computedAt: Date;
    expiresAt: Date;
    hitCount: number;
}
export interface QualityMetrics {
    sessionId: string;
    userId: string;
    recordedAt: Date;
    audioQuality: {
        avgLatencyMs?: number;
        packetLoss?: number;
        jitter?: number;
    };
    conversationQuality: {
        turnsCount: number;
        avgTurnDurationMs: number;
        interruptionCount: number;
        silencePercentage: number;
    };
    userSatisfaction?: {
        explicit?: number;
        inferred?: number;
    };
    toolsUsed: string[];
    errorsEncountered: string[];
}
/**
 * Configure the Firestore instance (call once at startup)
 */
export declare function configureFirestoreExtended(firestore: Firestore): void;
export declare function saveSessionState(session: SessionState): Promise<void>;
export declare function getSessionState(userId: string, sessionId: string): Promise<SessionState | null>;
export declare function getRecentSessions(userId: string, limit?: number): Promise<SessionState[]>;
export declare function logToolExecution(execution: ToolExecution): Promise<void>;
export declare function getToolExecutions(userId: string, options?: {
    toolId?: string;
    limit?: number;
    since?: Date;
}): Promise<ToolExecution[]>;
export declare function savePersonaBond(bond: PersonaBond): Promise<void>;
export declare function getPersonaBond(userId: string, personaId: string): Promise<PersonaBond | null>;
export declare function getAllPersonaBonds(userId: string): Promise<PersonaBond[]>;
export declare function saveVoiceProfile(profile: VoiceProfile): Promise<void>;
export declare function getVoiceProfile(userId: string): Promise<VoiceProfile | null>;
export declare function logUserIntent(intent: UserIntent): Promise<void>;
export declare function getRecentIntents(userId: string, limit?: number): Promise<UserIntent[]>;
export declare function setCachedInsight(insight: CachedInsight): Promise<void>;
export declare function getCachedInsight(userId: string, cacheKey: string): Promise<CachedInsight | null>;
export declare function saveQualityMetrics(metrics: QualityMetrics): Promise<void>;
export declare function getQualityMetrics(userId: string, options?: {
    limit?: number;
    since?: Date;
}): Promise<QualityMetrics[]>;
/**
 * Delete all extended data for a user (GDPR compliance)
 */
export declare function deleteAllExtendedUserData(userId: string): Promise<{
    deleted: string[];
    errors: string[];
}>;
export {};
//# sourceMappingURL=firestore-extended-persistence.d.ts.map