/**
 * Transfer Flow Orchestrator
 *
 * > "Better than human means connecting you with the right human."
 *
 * Orchestrates the warm handoff from Ferni to human professionals.
 * Handles consent, summary generation, and connection initiation.
 *
 * @module services/human-transfer/transfer-flow
 */
import type { EscalationType, EscalationDecision, TransferRequest, TransferResult, CrisisService } from './types.js';
/**
 * Evaluate if transfer is needed based on conversation
 */
export declare function evaluateTransferNeed(transcript: string): EscalationDecision;
/**
 * Get available services for an escalation type
 */
export declare function getAvailableServices(escalationType: EscalationType): CrisisService[];
/**
 * Initiate warm transfer to human professional
 */
export declare function initiateWarmTransfer(request: TransferRequest): Promise<TransferResult>;
/**
 * Generate consent request message
 */
export declare function generateConsentRequest(decision: EscalationDecision): string;
export declare const transferFlow: {
    evaluateTransferNeed: typeof evaluateTransferNeed;
    getAvailableServices: typeof getAvailableServices;
    initiateWarmTransfer: typeof initiateWarmTransfer;
    generateConsentRequest: typeof generateConsentRequest;
};
//# sourceMappingURL=transfer-flow.d.ts.map