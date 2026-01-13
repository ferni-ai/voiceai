/**
 * Optimization System Persistence Service
 *
 * Handles Firestore persistence for the tool optimization system:
 * - User feedback records
 * - Interaction patterns (co-occurrences, sequences, journeys)
 * - AI-generated recommendations
 * - A/B experiment results
 *
 * Data is buffered in memory and flushed periodically to reduce writes.
 */
import type { FeedbackRecord, FeedbackSummary, Recommendation, ToolCoOccurrence, ToolSequence, UserJourney, GapAnalysis, ConsolidationOpportunity, SessionData } from '../types/optimization-types.js';
interface FirestoreDB {
    collection: (path: string) => CollectionRef;
    runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
    batch: () => WriteBatch;
}
interface CollectionRef {
    doc: (id?: string) => DocumentRef;
    get: () => Promise<QuerySnapshot>;
    orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
    limit: (count: number) => CollectionRef;
    where: (field: string, op: string, value: unknown) => CollectionRef;
    add: (data: unknown) => Promise<DocumentRef>;
}
interface DocumentRef {
    get: () => Promise<DocumentSnapshot>;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<void>;
    update: (data: unknown) => Promise<void>;
    delete: () => Promise<void>;
    id: string;
}
interface DocumentSnapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id: string;
}
interface QuerySnapshot {
    docs: DocumentSnapshot[];
    empty: boolean;
    size: number;
}
interface Transaction {
    get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
    set: (ref: DocumentRef, data: unknown, options?: {
        merge?: boolean;
    }) => void;
    update: (ref: DocumentRef, data: unknown) => void;
}
interface WriteBatch {
    set: (ref: DocumentRef, data: unknown, options?: {
        merge?: boolean;
    }) => WriteBatch;
    update: (ref: DocumentRef, data: unknown) => WriteBatch;
    delete: (ref: DocumentRef) => WriteBatch;
    commit: () => Promise<void>;
}
declare class OptimizationPersistenceService {
    private db;
    private initialized;
    private flushInterval;
    private readonly COLLECTIONS;
    private feedbackBuffer;
    private sessionBuffer;
    private recommendationBuffer;
    private readonly BUFFER_SIZE;
    private readonly FLUSH_INTERVAL_MS;
    private readonly FIRESTORE_BATCH_LIMIT;
    initialize(db?: FirestoreDB): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Buffer feedback for batch writing
     */
    bufferFeedback(feedback: FeedbackRecord): void;
    /**
     * Flush feedback buffer to Firestore
     */
    flushFeedback(): Promise<void>;
    /**
     * Save aggregated feedback summary
     */
    saveFeedbackSummary(toolId: string, summary: FeedbackSummary): Promise<void>;
    /**
     * Get feedback summary for a tool
     */
    getFeedbackSummary(toolId: string): Promise<FeedbackSummary | null>;
    /**
     * Get all feedback summaries
     */
    getAllFeedbackSummaries(): Promise<FeedbackSummary[]>;
    /**
     * Buffer completed session for analysis
     */
    bufferSession(session: SessionData): void;
    /**
     * Flush sessions to Firestore
     */
    flushSessions(): Promise<void>;
    /**
     * Save pattern analysis results
     */
    savePatternAnalysis(analysis: {
        coOccurrences: ToolCoOccurrence[];
        sequences: ToolSequence[];
        journeys: UserJourney[];
        gaps: GapAnalysis[];
        consolidationOpportunities: ConsolidationOpportunity[];
        analyzedAt: Date;
    }): Promise<void>;
    /**
     * Get latest pattern analysis
     */
    getLatestPatternAnalysis(): Promise<{
        coOccurrences: ToolCoOccurrence[];
        sequences: ToolSequence[];
        journeys: UserJourney[];
        gaps: GapAnalysis[];
        consolidationOpportunities: ConsolidationOpportunity[];
        analyzedAt: string;
    } | null>;
    /**
     * Buffer recommendation
     */
    bufferRecommendation(recommendation: Recommendation): void;
    /**
     * Flush recommendations to Firestore
     */
    flushRecommendations(): Promise<void>;
    /**
     * Save a recommendation
     */
    saveRecommendation(recommendation: Recommendation): Promise<void>;
    /**
     * Get pending recommendations
     */
    getPendingRecommendations(): Promise<Recommendation[]>;
    /**
     * Update recommendation status
     */
    updateRecommendationStatus(id: string, status: 'pending' | 'approved' | 'rejected' | 'implemented', implementedAt?: Date): Promise<void>;
    /**
     * Save experiment configuration and results
     */
    saveExperiment(experiment: {
        id: string;
        name: string;
        description: string;
        variants: Array<{
            id: string;
            name: string;
            config: Record<string, unknown>;
        }>;
        status: 'draft' | 'active' | 'completed' | 'cancelled';
        startedAt?: Date;
        completedAt?: Date;
        results?: {
            winner?: string;
            metrics: Record<string, Record<string, number>>;
            confidence: number;
        };
    }): Promise<void>;
    /**
     * Get active experiments
     */
    getActiveExperiments(): Promise<Array<{
        id: string;
        name: string;
        description: string;
        status: string;
    }>>;
    /**
     * Get dashboard summary data
     */
    getDashboardSummary(): Promise<{
        totalFeedback: number;
        feedbackByType: Record<string, number>;
        totalSessions: number;
        avgSessionDuration: number;
        topTools: Array<{
            toolId: string;
            count: number;
        }>;
        activeExperiments: number;
        pendingRecommendations: number;
        lastAnalysisTime: string | null;
    }>;
    /**
     * Flush all buffers
     */
    flushAll(): Promise<void>;
    /**
     * Check if persistence is available
     */
    isAvailable(): boolean;
}
export declare const optimizationPersistence: OptimizationPersistenceService;
export default optimizationPersistence;
//# sourceMappingURL=optimization-persistence.d.ts.map