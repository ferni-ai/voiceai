/**
 * On-Behalf Call Orchestrator
 *
 * Orchestrates phone calls made ON BEHALF of users to third parties.
 * Handles the full lifecycle: room creation, agent spawning, Twilio bridging,
 * and result capture.
 *
 * @module services/outreach/on-behalf-call-orchestrator
 */
import { EventEmitter } from 'events';
import type { OnBehalfCallRequest, CallOutcome } from '../../tools/domains/telephony/call-on-behalf.js';
import { type EnrichedMessage } from './message-enrichment.js';
export type OnBehalfCallStatus = 'pending' | 'initiating' | 'ringing' | 'answered' | 'in_progress' | 'wrapping_up' | 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
export interface OnBehalfCall {
    id: string;
    request: OnBehalfCallRequest;
    status: OnBehalfCallStatus;
    script: string;
    complianceScript: string;
    enrichedMessage?: EnrichedMessage;
    twilioCallSid?: string;
    livekitRoomName?: string;
    agentParticipantId?: string;
    createdAt: Date;
    initiatedAt?: Date;
    answeredAt?: Date;
    completedAt?: Date;
    outcome?: CallOutcome;
}
export interface OnBehalfCallConfig {
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioPhoneNumber: string;
    livekitUrl: string;
    livekitApiKey: string;
    livekitApiSecret: string;
    sipTrunkId?: string;
    maxRingSeconds: number;
    voicemailDetectionEnabled: boolean;
    maxCallDurationMinutes: number;
    webhookBaseUrl: string;
}
declare class OnBehalfCallOrchestrator extends EventEmitter {
    private config;
    constructor(config?: Partial<OnBehalfCallConfig>);
    /**
     * Initiate a call on behalf of the user
     */
    initiateCall(request: OnBehalfCallRequest): Promise<string>;
    private createLiveKitRoom;
    private spawnOnBehalfAgent;
    /**
     * Make an outbound call using LiveKit's native SIP functionality.
     * This is the preferred method - the call originates FROM LiveKit,
     * so there's no complex SIP bridging needed.
     */
    private initiateLiveKitSipCall;
    private initiateTwilioCall;
    private generateSipBridgeTwiml;
    /**
     * Handle Twilio status callback
     */
    handleStatusCallback(callId: string, status: string, twilioData: Record<string, unknown>): Promise<void>;
    /**
     * Handle machine detection (voicemail)
     */
    handleMachineDetection(callId: string, machineResult: string): Promise<string | null>;
    /**
     * Generate voicemail message with "Better Than Human" enrichment
     *
     * Instead of a robotic template, we generate a warm, natural message
     * that sounds like it came from someone who truly cares.
     */
    private generateVoicemailMessageAsync;
    /**
     * Fallback voicemail for when enrichment fails
     * Still warmer than the old template, but doesn't require LLM
     */
    private generateVoicemailMessageFallback;
    /**
     * Sync wrapper for compatibility - fires async enrichment
     */
    private generateVoicemailMessage;
    private completeCall;
    private notifyOriginalSession;
    private generateOutcomeSummary;
    /**
     * Get an active call by ID
     */
    getActiveCall(callId: string): OnBehalfCall | undefined;
    /**
     * Get call context for the agent
     */
    getCallContext(callId: string): OnBehalfCallRequest | undefined;
    /**
     * Check if the service is configured
     */
    isConfigured(): boolean;
    /**
     * Determine if a message purpose should be enriched via LLM
     *
     * We enrich brief, simple messages that would benefit from expansion.
     * We skip enrichment for:
     * - Already detailed messages (50+ words)
     * - Specific business requests (reschedule, cancel, etc.)
     * - Messages with technical/appointment details
     */
    private shouldEnrichMessage;
    /**
     * Check if purpose sounds like a business/transactional request
     * (these should NOT be enriched)
     */
    private isBusinessPurpose;
    private maskPhone;
    private escapeXml;
}
export declare function getOnBehalfCallOrchestrator(config?: Partial<OnBehalfCallConfig>): OnBehalfCallOrchestrator;
export {};
//# sourceMappingURL=on-behalf-call-orchestrator.d.ts.map