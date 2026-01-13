import type { ResponseEvaluation } from './types.js';
export declare function persistEvaluation(evaluation: ResponseEvaluation): Promise<void>;
export declare function fetchRecentEvaluations(limit: number, filters?: {
    personaId?: string;
    flagged?: boolean;
}): Promise<ResponseEvaluation[]>;
//# sourceMappingURL=evaluation-persistence.d.ts.map