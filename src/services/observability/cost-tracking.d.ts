/**
 * Cost Tracking Metrics
 *
 * Tracks AI service costs:
 * - LLM token costs
 * - TTS synthesis costs
 * - STT transcription costs
 * - Total spending by service and model
 */
export interface CostEvent {
    id: string;
    timestamp: number;
    service: 'llm' | 'tts' | 'stt' | 'embedding';
    provider: string;
    model?: string;
    units: number;
    estimatedCost: number;
    userId?: string;
    sessionId?: string;
}
export interface CostSnapshot {
    totalCost: number;
    costLast24h: number;
    costLastHour: number;
    llmCost: number;
    ttsCost: number;
    sttCost: number;
    embeddingCost: number;
    costByModel: Record<string, number>;
    costByProvider: Record<string, number>;
    tokensUsed: number;
    charactersSpoken: number;
    minutesTranscribed: number;
    costPerSession: number;
    costPerMinute: number;
    projectedMonthlyCost: number;
}
export declare function recordLLMCost(model: string, inputTokens: number, outputTokens: number, userId?: string, sessionId?: string): void;
export declare function recordTTSCost(provider: string, characters: number, userId?: string, sessionId?: string): void;
export declare function recordSTTCost(provider: string, durationSeconds: number, userId?: string, sessionId?: string): void;
export declare function recordEmbeddingCost(provider: string, tokens: number, userId?: string, sessionId?: string): void;
export declare function getSnapshot(): CostSnapshot;
export declare const costMetrics: {
    recordLLMCost: typeof recordLLMCost;
    recordTTSCost: typeof recordTTSCost;
    recordSTTCost: typeof recordSTTCost;
    recordEmbeddingCost: typeof recordEmbeddingCost;
    getSnapshot: typeof getSnapshot;
};
//# sourceMappingURL=cost-tracking.d.ts.map