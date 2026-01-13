/**
 * Persona Voice Generator for Outreach
 *
 * Each Ferni team member has a distinct voice in outreach communications.
 * This service generates messages that sound authentically like each persona,
 * whether via text, email, or voice call.
 *
 * Philosophy: A thoughtful friend who checks in, not a bot that sends notifications.
 *
 * Brand Integration: All generated content is validated against brand rules
 * to ensure consistent voice across all channels.
 */
import type { AgentId } from '../agent-bus.js';
export type OutreachChannel = 'sms' | 'email' | 'call' | 'voice_message' | 'push';
export type OutreachTone = 'celebratory' | 'supportive' | 'encouraging' | 'casual' | 'informative' | 'urgent';
export type RelationshipStage = 'new' | 'building' | 'established' | 'deep';
export interface PersonaOutreachVoice {
    personaId: AgentId;
    displayName: string;
    tone: {
        default: string;
        energy: 'calm' | 'warm' | 'enthusiastic' | 'grounded';
        formality: 'casual' | 'friendly' | 'professional';
    };
    signaturePhrases: {
        greeting: string[];
        thinkingOfYou: string[];
        celebration: string[];
        encouragement: string[];
        closing: string[];
    };
    textStyle: {
        length: 'short' | 'medium' | 'long';
        emojiUse: 'none' | 'minimal' | 'moderate' | 'expressive';
        preferredEmoji: string[];
    };
    emailStyle: {
        tone: string;
        structure: string;
        signature: string;
    };
    callStyle: {
        opening: string;
        pacing: string;
        allowsSilence: boolean;
        voicemailStyle: string;
    };
    naturalTopics: string[];
    avoidTopics: string[];
}
export interface OutreachContext {
    userId: string;
    userName: string;
    preferredName?: string;
    relationshipStage: RelationshipStage;
    trigger: {
        type: string;
        reason: string;
        urgency: 'low' | 'medium' | 'high' | 'urgent';
    };
    context: {
        recentTopics?: string[];
        recentWins?: string[];
        currentStruggles?: string[];
        upcomingEvents?: string[];
        emotionalState?: string;
        lastConversationSummary?: string;
    };
    commitment?: string;
    milestone?: string;
    goal?: string;
    event?: string;
}
export interface GeneratedOutreach {
    channel: OutreachChannel;
    persona: AgentId;
    message: string;
    subject?: string;
    voicemailMessage?: string;
    tone: OutreachTone;
    metadata: {
        relationshipStage: RelationshipStage;
        triggerType: string;
        generatedAt: Date;
    };
}
export declare const personaOutreachVoices: Record<string, PersonaOutreachVoice>;
/**
 * Get the outreach voice profile for a persona
 */
export declare function getPersonaOutreachVoice(personaId: string): PersonaOutreachVoice;
/**
 * Generate a text message in persona voice
 */
export declare function generateTextMessage(personaId: string, context: OutreachContext, tone: OutreachTone): string;
/**
 * Generate an email in persona voice
 */
export declare function generateEmailMessage(personaId: string, context: OutreachContext, tone: OutreachTone): {
    subject: string;
    body: string;
};
/**
 * Generate a voicemail message in persona voice
 *
 * Philosophy: A voicemail from Ferni should feel like getting a message
 * from your most thoughtful friend - someone who actually remembers
 * what you told them and checks in without any agenda.
 *
 * "Better than Human" means:
 * - We remember what they shared (lastConversationSummary)
 * - We remember their struggles (currentStruggles)
 * - We remember their wins (recentWins)
 * - We never make them feel obligated to call back
 */
export declare function generateVoicemailMessage(personaId: string, context: OutreachContext, tone: OutreachTone): string;
/**
 * Generate a first-time warm introduction voicemail
 *
 * Special case: When Ferni calls someone for the first time,
 * it should feel like meeting a friend, not getting a sales call.
 */
export declare function generateWarmIntroductionVoicemail(personaId: string, name: string, stage?: RelationshipStage): string;
/**
 * Generate a call opening in persona voice
 */
export declare function generateCallOpening(personaId: string, context: OutreachContext): string;
/**
 * Generate complete outreach package for all channels
 */
export declare function generateOutreach(personaId: string, context: OutreachContext, channel: OutreachChannel, tone?: OutreachTone): GeneratedOutreach;
/**
 * Select the most appropriate persona for an outreach trigger
 */
export declare function selectPersonaForOutreach(triggerType: string, lastPersonaId?: string, wasRecentConversation?: boolean): string;
declare const _default: {
    getPersonaOutreachVoice: typeof getPersonaOutreachVoice;
    generateOutreach: typeof generateOutreach;
    generateTextMessage: typeof generateTextMessage;
    generateEmailMessage: typeof generateEmailMessage;
    generateVoicemailMessage: typeof generateVoicemailMessage;
    generateCallOpening: typeof generateCallOpening;
    selectPersonaForOutreach: typeof selectPersonaForOutreach;
    personaOutreachVoices: Record<string, PersonaOutreachVoice>;
};
export default _default;
//# sourceMappingURL=persona-voice-generator.d.ts.map