/**
 * Persona Health Metrics
 *
 * Tracks persona-specific health indicators:
 * - Bundle load times
 * - Knowledge query performance
 * - Voice synthesis quality
 * - Handoff success rates
 * - Persona usage distribution
 */
export interface PersonaLoadEvent {
    id: string;
    timestamp: number;
    personaId: string;
    loadTimeMs: number;
    success: boolean;
    error?: string;
    bundleSize?: number;
    fromCache: boolean;
}
export interface PersonaKnowledgeQuery {
    id: string;
    timestamp: number;
    personaId: string;
    queryType: 'rag' | 'direct' | 'embedding';
    latencyMs: number;
    resultsCount: number;
    relevanceScore: number;
    success: boolean;
}
export interface PersonaVoiceEvent {
    id: string;
    timestamp: number;
    personaId: string;
    voiceId: string;
    provider: string;
    durationMs: number;
    latencyMs: number;
    quality: 'good' | 'degraded' | 'failed';
}
export interface PersonaUsageEvent {
    id: string;
    timestamp: number;
    personaId: string;
    sessionId: string;
    userId: string;
    turnsCount: number;
    durationMs: number;
}
export interface PersonaHealthSnapshot {
    avgLoadTimeMs: number;
    loadSuccessRate: number;
    cacheHitRate: number;
    avgKnowledgeLatencyMs: number;
    avgKnowledgeRelevance: number;
    knowledgeQuerySuccessRate: number;
    queriesByPersona: Record<string, number>;
    avgVoiceLatencyMs: number;
    voiceQualityRate: number;
    voiceFailureRate: number;
    usageByPersona: Record<string, number>;
    sessionsPerPersona: Record<string, number>;
    avgTurnsPerPersona: Record<string, number>;
    personaHealthScores: Record<string, number>;
    unhealthyPersonas: string[];
}
export declare function recordPersonaLoad(event: Omit<PersonaLoadEvent, 'id' | 'timestamp'>): void;
export declare function recordKnowledgeQuery(event: Omit<PersonaKnowledgeQuery, 'id' | 'timestamp'>): void;
export declare function recordVoiceEvent(event: Omit<PersonaVoiceEvent, 'id' | 'timestamp'>): void;
export declare function recordPersonaUsage(event: Omit<PersonaUsageEvent, 'id' | 'timestamp'>): void;
export declare function getSnapshot(): PersonaHealthSnapshot;
export declare const personaMetrics: {
    recordPersonaLoad: typeof recordPersonaLoad;
    recordKnowledgeQuery: typeof recordKnowledgeQuery;
    recordVoiceEvent: typeof recordVoiceEvent;
    recordPersonaUsage: typeof recordPersonaUsage;
    getSnapshot: typeof getSnapshot;
};
//# sourceMappingURL=persona-health.d.ts.map