/**
 * Open Source Datasets & Training Data Collection
 *
 * Leverages publicly available datasets and collects our own training data
 * to create a fine-tuned retriever that's better than generic embeddings.
 *
 * AVAILABLE DATASETS:
 * - Gorilla API-Bench: 1,600+ APIs with queries (Berkeley)
 * - ToolBench: 16,000+ APIs (Tsinghua + ModelScope)
 * - APIGen: Synthetic function calling data
 * - NL2API: Natural language to API mapping
 *
 * OUR DATA:
 * - Routing events (query → tool)
 * - Corrections (what we got wrong)
 * - User preferences (per-user patterns)
 *
 * @module tools/semantic-router/advanced/datasets
 */
export interface TrainingExample {
    query: string;
    toolId: string;
    args?: Record<string, unknown>;
    context?: string[];
    source: 'gorilla' | 'toolbench' | 'apigen' | 'ferni_logs' | 'ferni_corrections' | 'synthetic';
    confidence?: number;
}
export interface DatasetStats {
    totalExamples: number;
    bySource: Record<string, number>;
    byTool: Record<string, number>;
    avgQueryLength: number;
}
/**
 * Load Gorilla API-Bench dataset
 * Source: https://github.com/ShishirPatil/gorilla
 *
 * Contains ~1,600 APIs with natural language queries
 */
export declare function loadGorillaDataset(): TrainingExample[];
/**
 * Load ToolBench patterns
 * Source: https://github.com/OpenBMB/ToolBench
 *
 * Contains 16,000+ real APIs with diverse queries
 */
export declare function loadToolBenchPatterns(): TrainingExample[];
interface RoutingLogEntry {
    timestamp: Date;
    query: string;
    predictedTool: string;
    executedTool: string | null;
    confidence: number;
    wasCorrect: boolean;
    userId: string;
}
/**
 * Log a routing decision for training
 */
export declare function logRoutingDecision(entry: Omit<RoutingLogEntry, 'timestamp'>): void;
/**
 * Export routing logs as training data
 */
export declare function exportRoutingLogsAsTraining(): TrainingExample[];
/**
 * Generate synthetic training examples using templates
 */
export declare function generateSyntheticExamples(): TrainingExample[];
/**
 * Load and combine all training data sources
 */
export declare function loadCombinedTrainingData(): {
    examples: TrainingExample[];
    stats: DatasetStats;
};
/**
 * Export data in format suitable for sentence-transformers fine-tuning
 *
 * Format: (anchor, positive, negative) triplets
 */
export declare function exportForSentenceTransformers(examples: TrainingExample[]): Array<{
    anchor: string;
    positive: string;
    negative: string;
}>;
/**
 * Export data for classification fine-tuning
 *
 * Format: { text, label }
 */
export declare function exportForClassification(examples: TrainingExample[]): Array<{
    text: string;
    label: string;
}>;
export {};
//# sourceMappingURL=datasets.d.ts.map