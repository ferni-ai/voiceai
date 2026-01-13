/**
 * AI-Powered Diagnostics
 *
 * Uses Gemini to analyze failures and suggest fixes.
 * This is the "brain" of the self-healing system.
 */
export interface DiagnosticResult {
    /** Technical root cause */
    rootCause: string;
    /** Confidence in diagnosis (0-1) */
    confidence: number;
    /** Suggested fix */
    suggestedFix: string;
    /** Human-friendly explanation for Ferni to say */
    humanExplanation: string;
    /** Whether this can be auto-fixed */
    autoFixable: boolean;
    /** Type of fix if autoFixable */
    fixType?: 'retry' | 'restart' | 'circuit_break' | 'failover' | 'escalate';
    /** Additional context */
    metadata?: Record<string, unknown>;
}
interface FailureContext {
    jobId?: string;
    stage: 'dispatch' | 'accept' | 'assign' | 'spawn' | 'entry' | 'session' | 'unknown';
    timing?: Record<string, number>;
    errorType?: string;
    errorMessage?: string;
    stackTrace?: string;
}
/**
 * Analyze a failure and provide diagnostic information.
 *
 * First checks known patterns for instant diagnosis,
 * then falls back to Gemini for complex cases.
 */
export declare function analyzeFailure(errorLogs: string[], context: FailureContext): Promise<DiagnosticResult>;
/**
 * Quick diagnosis without Gemini (pattern matching only)
 */
export declare function quickDiagnose(errorMessage: string): DiagnosticResult | null;
export {};
//# sourceMappingURL=ai-diagnostics.d.ts.map