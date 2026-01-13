/**
 * Persona Outreach Formatter
 *
 * Loads and applies persona-specific outreach styles for all channels.
 * Each persona has their own voice, tone, emoji usage, and templates
 * defined in their outreach-voice.json bundle file.
 *
 * Philosophy: Outreach should feel like it's coming from a real person
 * with their own unique communication style - not a generic notification system.
 *
 * @module PersonaOutreachFormatter
 */
export interface OutreachVoiceProfile {
    tone: string;
    energy: string;
    style: string;
    formality: string;
}
export interface SignaturePhrases {
    greeting: string[];
    thinking_of_you: string[];
    check_in: string[];
    closing: string[];
}
export interface EmojiUsage {
    frequency: 'minimal' | 'moderate' | 'professional' | 'none';
    preferred: string[];
    avoid: string[];
    max_per_message: number;
}
export interface ChannelStyle {
    length: string;
    tone: string;
    sentences?: [number, number];
    example?: string;
    structure?: Record<string, string>;
    signature?: string;
    opening?: string;
    pacing?: string;
    allows_silence?: boolean;
    always_include?: string;
}
export interface RelationshipAdaptation {
    formality: string;
    permission_seeking?: boolean;
    opening_style: string;
    closing_style: string;
    can_use_inside_jokes?: boolean;
    can_reference_progress_history?: boolean;
    can_anticipate_needs?: boolean;
}
export interface OutreachVoiceConfig {
    name: string;
    description: string;
    version: string;
    voice_profile: OutreachVoiceProfile;
    signature_phrases: SignaturePhrases;
    emoji_usage: EmojiUsage;
    channel_styles: {
        sms: ChannelStyle;
        email: ChannelStyle;
        call: ChannelStyle;
        voicemail: ChannelStyle;
    };
    trigger_templates: Record<string, Record<string, string>>;
    relationship_adaptations: {
        new: RelationshipAdaptation;
        building: RelationshipAdaptation;
        established: RelationshipAdaptation;
        deep: RelationshipAdaptation;
    };
    specialty_triggers?: string[];
    do_not: string[];
    always_do: string[];
}
export type RelationshipStage = 'new' | 'building' | 'established' | 'deep';
export type OutreachChannel = 'sms' | 'email' | 'call' | 'voicemail' | 'push';
export interface FormatContext {
    userName?: string;
    userNickname?: string;
    relationshipStage?: RelationshipStage;
    topic?: string;
    habit?: string;
    appointment?: string;
    streak_count?: number;
    time?: string;
    details?: string;
}
export interface FormattedOutreach {
    message: string;
    greeting: string;
    closing: string;
    signature?: string;
    opening?: string;
    emoji?: string;
}
/**
 * Load a persona's outreach voice configuration
 */
export declare function loadOutreachVoiceConfig(personaId: string): OutreachVoiceConfig | null;
/**
 * Get config with fallback to Ferni's config
 */
export declare function getOutreachVoiceConfig(personaId: string): OutreachVoiceConfig;
/**
 * Get the greeting for a persona based on relationship stage
 */
export declare function getPersonaGreeting(personaId: string, context?: FormatContext): string;
/**
 * Get the closing for a persona based on relationship stage
 */
export declare function getPersonaClosing(personaId: string, context?: FormatContext): string;
/**
 * Format a message for SMS using persona's style
 */
export declare function formatSmsMessage(personaId: string, message: string, context?: FormatContext): FormattedOutreach;
/**
 * Format a message for email using persona's style
 */
export declare function formatEmailMessage(personaId: string, subject: string, body: string, context?: FormatContext): {
    subject: string;
    body: string;
    signature: string;
};
/**
 * Format a message for voice call using persona's style
 */
export declare function formatVoiceMessage(personaId: string, message: string, context?: FormatContext): FormattedOutreach;
/**
 * Format a voicemail message using persona's style
 */
export declare function formatVoicemailMessage(personaId: string, message: string, context?: FormatContext): FormattedOutreach;
/**
 * Format a push notification using persona's style
 */
export declare function formatPushNotification(personaId: string, message: string, context?: FormatContext): {
    title: string;
    body: string;
};
/**
 * Determine which persona should handle an outreach based on context
 */
export declare function routeToPersona(outreachType: string, context?: FormatContext, defaultPersona?: string): string;
/**
 * Check if a persona specializes in a given topic
 */
export declare function personaSpecializesIn(personaId: string, topic: string): boolean;
export declare const personaOutreachFormatter: {
    loadConfig: typeof loadOutreachVoiceConfig;
    getConfig: typeof getOutreachVoiceConfig;
    getGreeting: typeof getPersonaGreeting;
    getClosing: typeof getPersonaClosing;
    formatSms: typeof formatSmsMessage;
    formatEmail: typeof formatEmailMessage;
    formatVoice: typeof formatVoiceMessage;
    formatVoicemail: typeof formatVoicemailMessage;
    formatPush: typeof formatPushNotification;
    routeToPersona: typeof routeToPersona;
    personaSpecializesIn: typeof personaSpecializesIn;
};
export default personaOutreachFormatter;
//# sourceMappingURL=persona-outreach-formatter.d.ts.map