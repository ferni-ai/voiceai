/**
 * Voice Call Service
 *
 * Makes outbound calls using Cartesia TTS voices for any persona.
 * Also handles incoming call routing to LiveKit agents.
 *
 * Now with SSML support for natural-sounding outbound calls!
 */
import { enhanceOutboundMessage, type OutboundSsmlOptions } from '../outreach/outbound-ssml.js';
/**
 * Generate speech audio using Cartesia TTS with any persona's voice
 *
 * Cartesia uses `voice_experimental_controls` for emotion/speed,
 * NOT XML-style SSML tags. Text should be plain with natural punctuation.
 */
export declare function generatePersonaVoice(text: string, personaId?: string, options?: {
    emotion?: string;
    speed?: number;
}): Promise<Buffer | null>;
/**
 * Generate speech audio using Cartesia TTS with Alex's voice
 * @deprecated Use generatePersonaVoice(text, 'alex-chen') instead
 */
export declare function generateAlexVoice(text: string): Promise<Buffer | null>;
/**
 * Upload audio buffer to Google Cloud Storage for Twilio playback
 * Returns a publicly accessible URL or null if upload fails
 */
export declare function uploadAudioToGCS(audioBuffer: Buffer, filename: string): Promise<string | null>;
export interface PersonaCallOptions {
    /** Fall back to Twilio's built-in voice if Cartesia/GCS unavailable. Default: true */
    fallbackToTwilioVoice?: boolean;
    /** Custom greeting to use instead of default "Hey, this is {name} calling" */
    customGreeting?: string;
    /** SSML options for natural speech. Set to false to disable SSML enhancement. */
    ssml?: OutboundSsmlOptions | false;
}
/**
 * Make an outbound call using any persona's Cartesia voice
 *
 * This works by:
 * 1. Looking up the persona's voice ID from the registry
 * 2. Generating audio with Cartesia TTS
 * 3. Uploading to GCS for public access (if configured)
 * 4. Making Twilio call that plays the hosted audio
 * 5. Falls back to Twilio's built-in voice if hosting unavailable
 */
export declare function callWithPersonaVoice(toPhone: string, message: string, personaId?: string, options?: PersonaCallOptions): Promise<{
    success: boolean;
    message: string;
    callSid?: string;
    usedCartesiaVoice?: boolean;
}>;
/**
 * Make an outbound call using Alex's Cartesia voice
 * @deprecated Use callWithPersonaVoice(phone, message, 'alex-chen', options) instead
 */
export declare function callWithAlexVoice(toPhone: string, message: string, options?: {
    fallbackToTwilioVoice?: boolean;
}): Promise<{
    success: boolean;
    message: string;
    callSid?: string;
}>;
/**
 * TwiML response to forward incoming calls to LiveKit SIP
 *
 * Set this URL as the webhook for your Twilio phone number:
 * https://your-server.com/api/incoming-call
 */
export declare function generateIncomingCallTwiml(options?: {
    greeting?: string;
    agentRoom?: string;
}): string;
/**
 * Configure Twilio phone number webhook for incoming calls
 */
export declare function configureIncomingCallWebhook(webhookUrl: string): Promise<{
    success: boolean;
    message: string;
}>;
export { enhanceOutboundMessage, createWarmOpening, createWarmClosing, thoughtfulPause, warmWrap, type OutboundSsmlOptions, } from '../outreach/outbound-ssml.js';
declare const _default: {
    generatePersonaVoice: typeof generatePersonaVoice;
    generateAlexVoice: typeof generateAlexVoice;
    callWithPersonaVoice: typeof callWithPersonaVoice;
    callWithAlexVoice: typeof callWithAlexVoice;
    generateIncomingCallTwiml: typeof generateIncomingCallTwiml;
    configureIncomingCallWebhook: typeof configureIncomingCallWebhook;
    enhanceOutboundMessage: typeof enhanceOutboundMessage;
};
export default _default;
//# sourceMappingURL=voice-call.d.ts.map