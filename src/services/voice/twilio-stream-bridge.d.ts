/**
 * Twilio Stream → LiveKit Bridge
 *
 * Enables two-way real-time conversations by:
 * 1. Twilio makes the outbound call
 * 2. Twilio streams audio via WebSocket to our server
 * 3. We bridge the audio to LiveKit for the AI agent
 * 4. Agent audio flows back through the same bridge
 *
 * ENHANCED with:
 * - Audio buffering from caller
 * - Simple VAD (Voice Activity Detection)
 * - Automatic transcription on silence
 * - Transcript event emission for conversation loop
 *
 * This avoids the need for Twilio Elastic SIP Trunking ($$)
 *
 * @module twilio-stream-bridge
 */
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { type TwilioEnhancer } from './twilio-audio-enhance.js';
export interface TwilioStreamMessage {
    event: 'connected' | 'start' | 'media' | 'stop' | 'mark' | 'dtmf';
    sequenceNumber?: string;
    streamSid?: string;
    start?: {
        streamSid: string;
        accountSid: string;
        callSid: string;
        tracks: string[];
        customParameters: Record<string, string>;
        mediaFormat: {
            encoding: string;
            sampleRate: number;
            channels: number;
        };
    };
    media?: {
        track: 'inbound' | 'outbound';
        chunk: string;
        timestamp: string;
        payload: string;
    };
    mark?: {
        name: string;
    };
    dtmf?: {
        track: string;
        digit: string;
    };
}
export interface BridgeSession {
    callSid: string;
    streamSid: string;
    livekitRoomName: string;
    twilioWs: WebSocket;
    startedAt: Date;
    status: 'connecting' | 'active' | 'ended';
    audioBuffer: Buffer[];
    lastAudioTime: number;
    silenceTimer: NodeJS.Timeout | null;
    isAgentSpeaking: boolean;
    customParameters: Record<string, string>;
    audioPacketCount?: number;
    audioEnhancer?: TwilioEnhancer;
}
export interface BridgeConfig {
    livekitUrl: string;
    livekitApiKey: string;
    livekitApiSecret: string;
    port?: number;
}
export declare class TwilioStreamBridge extends EventEmitter {
    private wss;
    private sessions;
    private roomService;
    private config;
    constructor(config: BridgeConfig);
    /**
     * Start the WebSocket server for Twilio streams
     * Use this for standalone mode (local testing)
     */
    start(port?: number): void;
    /**
     * Attach to an existing HTTP server for WebSocket upgrades
     * Use this for Cloud Run where only one port is available
     */
    attachToServer(httpServer: import('http').Server, path?: string): void;
    /**
     * Stop the bridge
     */
    stop(): Promise<void>;
    /**
     * Handle a new Twilio WebSocket connection
     */
    private handleConnection;
    /**
     * Handle stream start - set up LiveKit room
     */
    private handleStreamStart;
    /**
     * Handle incoming audio from Twilio
     * Convert μ-law 8kHz → Linear PCM 16kHz, buffer, and detect silence
     */
    private handleMedia;
    /**
     * Process buffered audio - transcribe and emit transcript event
     */
    private processBufferedAudio;
    /**
     * Transcribe audio using Google Cloud Speech-to-Text REST API
     */
    private transcribeAudio;
    /**
     * Create WAV file from PCM data
     */
    private createWavBuffer;
    private writeString;
    /**
     * Set agent speaking state (to avoid echo during agent speech)
     */
    setAgentSpeaking(callSid: string, isSpeaking: boolean): void;
    /**
     * Send audio to Twilio (from LiveKit/agent)
     * Convert Linear PCM 16kHz → μ-law 8kHz and send to Twilio
     */
    sendAudioToCaller(callSid: string, linearPcm16k: Buffer): void;
    /**
     * Send a mark event to Twilio (for sync/timing)
     */
    sendMark(callSid: string, markName: string): void;
    /**
     * Get active session info
     */
    getSession(callSid: string): BridgeSession | undefined;
    /**
     * Get all active sessions
     */
    getAllSessions(): BridgeSession[];
}
/**
 * Generate TwiML that streams audio to our WebSocket bridge
 *
 * IMPORTANT: For two-way conversational calls, the greeting should be spoken
 * THROUGH the stream by the agent, NOT before the stream connects.
 * This ensures bidirectional audio works properly.
 *
 * @param options.websocketUrl - WebSocket URL for Twilio to connect to
 * @param options.roomName - LiveKit room name (passed as parameter)
 * @param options.customParameters - Additional parameters to pass through stream
 */
export declare function generateStreamTwiml(options: {
    websocketUrl: string;
    roomName: string;
    /** @deprecated - Agent should speak greeting through stream instead */
    greeting?: string;
    /** @deprecated - Agent should speak greeting through stream instead */
    greetingAudioUrl?: string;
    voicemailGreeting?: string;
    voicemailAudioUrl?: string;
    customParameters?: Record<string, string>;
}): string;
export declare function getTwilioStreamBridge(config?: BridgeConfig): TwilioStreamBridge;
//# sourceMappingURL=twilio-stream-bridge.d.ts.map