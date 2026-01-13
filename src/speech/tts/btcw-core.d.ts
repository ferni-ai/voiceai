/**
 * BTCW TTS Core - CosyVoice Integration
 *
 * This module provides TTS using the BTCW (Better Than Cartesia Work) system,
 * which uses CosyVoice 3 as the backend with superhuman voice capabilities.
 *
 * Features:
 * - Streaming TTS with ~150ms first-byte latency
 * - 21 emotion types (Cartesia-compatible)
 * - Superhuman capabilities (circadian, relationship stage, meaningful silence)
 * - Voice cloning via reference audio
 *
 * @module @ferni/speech/tts/btcw-core
 */
import { AudioFrame } from '@livekit/rtc-node';
import { tts } from '@livekit/agents';
import type { TTSOptions } from './types.js';
type SynthesizedAudio = {
    requestId: string;
    segmentId: string;
    frame: AudioFrame;
    deltaText?: string;
    final: boolean;
};
/**
 * BTCW-specific TTS options
 */
export interface BTCWOptions extends TTSOptions {
    /** BTCW server endpoint */
    endpoint?: string;
    /** API key for authentication */
    apiKey?: string;
    /** Firebase ID token for authentication */
    idToken?: string;
    /** Function to get fresh ID token (enables auto-refresh) */
    getIdToken?: () => Promise<string>;
    /** Default emotion for synthesis */
    defaultEmotion?: BTCWEmotionType;
}
/**
 * BTCW emotion types (21 Cartesia-compatible emotions)
 */
export type BTCWEmotionType = 'neutral' | 'angry' | 'sad' | 'surprised' | 'curious' | 'affectionate' | 'excited' | 'content' | 'scared' | 'happy' | 'nostalgic' | 'contemplative' | 'grateful' | 'proud' | 'sympathetic' | 'skeptical' | 'calm' | 'thoughtful' | 'confident' | 'warm' | 'peaceful';
/**
 * Superhuman synthesis options
 */
export interface SuperhumanOptions {
    userId?: string;
    relationshipDays?: number;
    totalInteractions?: number;
    vulnerableMoments?: number;
    userLastText?: string;
    userEmotional?: boolean;
    userVulnerable?: boolean;
    timeSinceUserMs?: number;
    memoryTopics?: string[];
    memoryInvolvesLoss?: boolean;
    enableCircadian?: boolean;
    enableRelationship?: boolean;
}
/**
 * Synthesis event types
 */
export type SynthesisEventType = 'audio' | 'mark' | 'word' | 'sentence' | 'done' | 'error';
/**
 * Synthesis event emitted during streaming
 */
export interface SynthesisEvent {
    type: SynthesisEventType;
    frame?: AudioFrame;
    mark?: string;
    word?: string;
    sentence?: string;
    error?: string;
}
/**
 * Default BTCW endpoint (Cloud Run deployed service)
 */
export declare const DEFAULT_BTCW_ENDPOINT: string;
/**
 * BTCW persona voice mappings (maps to reference audio on server)
 */
export declare const BTCW_VOICE_IDS: {
    readonly FERNI: "ferni";
    readonly PETER_JOHN: "peter";
    readonly ALEX_CHEN: "alex";
    readonly MAYA_SANTOS: "maya";
    readonly JORDAN_TAYLOR: "jordan";
    readonly NAYAN_PATEL: "nayan";
};
/**
 * BTCW TTS adapter - drop-in replacement for Cartesia TTS
 *
 * Provides streaming TTS using CosyVoice 3 with superhuman capabilities.
 * API is designed to be compatible with @livekit/agents-plugin-cartesia.
 */
export declare class BTCWTTS {
    #private;
    readonly sampleRate: number;
    readonly numChannels: number;
    readonly streaming = true;
    constructor(options: BTCWOptions & {
        voice: string;
    });
    /**
     * Set ID token for authentication
     */
    setIdToken(token: string): void;
    /**
     * Set superhuman options
     */
    setSuperhumanOptions(options: SuperhumanOptions): void;
    /**
     * Create a streaming synthesis session
     * Compatible with Cartesia's stream() method
     */
    stream(): BTCWSynthesizeStream;
    /**
     * Synthesize text (non-streaming)
     */
    synthesize(text: string): Promise<BTCWChunkedStream>;
    /**
     * Health check
     */
    healthCheck(): Promise<{
        status: string;
        modelLoaded: boolean;
        mockMode: boolean;
    }>;
    /**
     * Get current voice ID
     */
    get voiceId(): string;
    /**
     * Get server endpoint
     */
    get endpoint(): string;
}
/**
 * Streaming synthesis stream - compatible with LiveKit's SynthesizeStream
 * Yields SynthesizedAudio objects that LiveKit expects
 */
export declare class BTCWSynthesizeStream implements AsyncIterable<SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM> {
    #private;
    constructor(endpoint: string, voiceId: string, emotion: BTCWEmotionType, sampleRate: number, numChannels: number, superhumanOptions?: SuperhumanOptions, apiKey?: string, idToken?: string, getIdToken?: () => Promise<string>);
    /**
     * Push text to be synthesized (matches Cartesia API)
     */
    pushText(text: string): void;
    /**
     * Signal end of input (matches Cartesia API)
     */
    endInput(): void;
    /**
     * Update the input stream with new text (required by LiveKit agents)
     * This replaces the current text queue with new text
     */
    updateInputStream(textOrStream: string | ReadableStream<string>): void;
    /**
     * Mark the end of the segment (required by LiveKit agents)
     */
    markSegmentEnd(): void;
    /**
     * Flush any buffered audio
     */
    flush(): void;
    /**
     * Close the stream
     */
    close(): void;
    [Symbol.asyncIterator](): AsyncIterator<SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM>;
}
/**
 * Chunked audio stream for non-streaming synthesis
 * Yields SynthesizedAudio objects that LiveKit expects
 */
export declare class BTCWChunkedStream implements AsyncIterable<SynthesizedAudio> {
    #private;
    constructor(endpoint: string, voiceId: string, text: string, emotion: BTCWEmotionType, sampleRate: number, numChannels: number, superhumanOptions?: SuperhumanOptions, authHeaders?: Record<string, string>);
    [Symbol.asyncIterator](): AsyncIterator<SynthesizedAudio>;
}
/**
 * Create a BTCW TTS instance
 *
 * @param voiceId - BTCW voice ID (persona name: 'ferni', 'peter', etc.)
 * @param options - BTCW options
 */
export declare function createBTCWTTS(voiceId: string, options?: Partial<BTCWOptions>): BTCWTTS;
/**
 * Create BTCW TTS from environment configuration
 */
export declare function createBTCWTTSFromEnv(voiceId?: string): BTCWTTS;
/**
 * Prewarm a BTCW TTS instance
 */
export declare function prewarmBTCWTTS(voiceId?: string): Promise<void>;
/**
 * Check if BTCW TTS is prewarmed
 */
export declare function isBTCWTTSPrewarmed(): boolean;
/**
 * Get prewarmed BTCW TTS instance (consumes it)
 */
export declare function getPrewarmedBTCWTTS(): BTCWTTS | null;
/**
 * Clear prewarmed BTCW TTS
 */
export declare function clearPrewarmedBTCWTTS(): void;
/**
 * Map Cartesia voice ID to BTCW voice ID
 * Falls back to 'ferni' for unknown voices
 */
export declare function cartesiaVoiceToBTCW(cartesiaVoiceId: string): string;
/**
 * Get BTCW voice ID for a persona name
 */
export declare function getBTCWVoiceIdForPersona(personaId: string): string;
export {};
//# sourceMappingURL=btcw-core.d.ts.map