/**
 * @deprecated For outreach, use outreach/unified-outreach.ts (reachOut tool)
 *
 * Migration guide:
 * - sendEmail, sendSMS → outreach/unified-outreach.ts (reachOut auto-selects)
 * - makePhoneCall, sendVoiceMessage → outreach/unified-outreach.ts
 * - Reminders, calendar → Keep here (distinct features)
 *
 * The `reachOut` tool provides:
 * - Automatic channel selection
 * - LLM-powered message personalization
 * - Interaction tracking for relationship scoring
 * - Optimal timing intelligence
 *
 * Communication Specialist Tools (PARTIALLY DEPRECATED)
 *
 * Full communication integration:
 * - Real email sending via SendGrid
 * - Real SMS/text via Twilio
 * - Phone calls via Twilio Programmable Voice
 * - Voice messages via Cartesia TTS + Twilio MMS
 * - Persistent reminders with scheduled delivery (KEEP)
 * - Calendar integration (KEEP)
 */
import { llm } from '@livekit/agents';
/**
 * Parse natural language into a scheduled time
 */
export declare function parseScheduleTime(naturalTime: string): Date | null;
export declare function createCommunicationTools(): {
    draftEmail: llm.FunctionTool<{
        to: string;
        subject: string;
        context: string;
        tone: "casual" | "urgent" | "friendly" | "formal";
    }, unknown, string>;
    sendApprovedEmail: llm.FunctionTool<{
        to: string;
        subject: string;
        body: string;
    }, unknown, string>;
    sendTextMessage: llm.FunctionTool<{
        to: string;
        message: string;
    }, unknown, string>;
    makePhoneCall: llm.FunctionTool<{
        phoneNumber: string;
        message: string;
    }, unknown, string>;
    sendVoiceMessage: llm.FunctionTool<{
        phoneNumber: string;
        message: string;
    }, unknown, string>;
    setReminder: llm.FunctionTool<{
        message: string;
        when: string;
        deliveryMethod: "email" | "sms" | "call" | "voice_message";
        contact?: string | undefined;
    }, unknown, string>;
    listReminders: llm.FunctionTool<Record<string, never>, unknown, string>;
    cancelReminder: llm.FunctionTool<{
        reminderId: string;
    }, unknown, "Got it, I've cancelled that reminder." | "I couldn't find that reminder. It might have already been delivered or cancelled. Want to see your current reminders?">;
    scheduleReminder: llm.FunctionTool<{
        reminderText: string;
        when: string;
        contactMethod?: "email" | "sms" | undefined;
        contact?: string | undefined;
    }, unknown, string>;
    scheduleEvent: llm.FunctionTool<{
        title: string;
        when: string;
        description?: string | undefined;
        durationMinutes?: number | undefined;
    }, unknown, string>;
    saveContactInfo: llm.FunctionTool<{
        phone?: string | undefined;
        email?: string | undefined;
        preferredMethod?: "email" | "sms" | "call" | "voice_message" | undefined;
    }, unknown, string>;
    checkAvailability: llm.FunctionTool<{
        date: string;
        durationMinutes: number;
    }, unknown, string>;
    scheduleCall: llm.FunctionTool<{
        contact: string;
        purpose: string;
        dateTime: string;
        duration: number;
        phone?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    getCommunicationSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export { createCommunicationCoachingTools } from './communication-coaching.js';
/**
 * Create all communication tools - base + coaching combined
 */
export declare function createAllCommunicationTools(): Promise<{
    draftDifficultMessage: llm.FunctionTool<{
        conversationType: "other" | "asking_for_raise" | "asking_for_promotion" | "giving_feedback" | "receiving_feedback" | "declining_request" | "setting_boundary" | "following_up" | "delivering_bad_news" | "resolving_conflict" | "negotiating_deadline" | "addressing_issue" | "building_relationship";
        recipient: string;
        context: string;
        keyPoints: string;
        desiredOutcome: string;
        format: "script" | "email" | "text" | "slack" | "talking_points";
        tone: "professional" | "warm" | "direct" | "friendly" | "formal" | "diplomatic";
    }, unknown, string>;
    practiceConversation: llm.FunctionTool<{
        scenario: string;
        otherPerson: string;
        userGoal: string;
        anticipatedChallenges?: string | undefined;
    }, unknown, string>;
    reviewMessage: llm.FunctionTool<{
        message: string;
        context: string;
        concern?: string | undefined;
    }, unknown, string>;
    planCommunicationStrategy: llm.FunctionTool<{
        situation: string;
        stakeholders: string;
        goal: string;
        constraints?: string | undefined;
        timeline?: string | undefined;
    }, unknown, string>;
    checkTone: llm.FunctionTool<{
        message: string;
        intendedTone: string;
    }, unknown, string>;
    transformTone: llm.FunctionTool<{
        message: string;
        currentTone: string;
        targetTone: "softer" | "warmer" | "more_direct" | "more_formal" | "more_casual" | "more_assertive";
    }, unknown, string>;
    buildAssertiveResponse: llm.FunctionTool<{
        situation: string;
        whatUserWants: string;
        currentResponse?: string | undefined;
        fear?: string | undefined;
    }, unknown, string>;
    planFollowUp: llm.FunctionTool<{
        originalRequest: string;
        recipient: string;
        daysSinceOriginal: number;
        previousFollowUps: number;
        urgency: "medium" | "low" | "high";
    }, unknown, string>;
    analyzeIncomingMessage: llm.FunctionTool<{
        incomingMessage: string;
        sender: string;
        userContext?: string | undefined;
        userGoal?: string | undefined;
    }, unknown, string>;
    analyzeCommPattern: llm.FunctionTool<{
        sampleMessages: string;
        context: string;
        challenge: string;
    }, unknown, string>;
    draftEmail: llm.FunctionTool<{
        to: string;
        subject: string;
        context: string;
        tone: "casual" | "urgent" | "friendly" | "formal";
    }, unknown, string>;
    sendApprovedEmail: llm.FunctionTool<{
        to: string;
        subject: string;
        body: string;
    }, unknown, string>;
    sendTextMessage: llm.FunctionTool<{
        to: string;
        message: string;
    }, unknown, string>;
    makePhoneCall: llm.FunctionTool<{
        phoneNumber: string;
        message: string;
    }, unknown, string>;
    sendVoiceMessage: llm.FunctionTool<{
        phoneNumber: string;
        message: string;
    }, unknown, string>;
    setReminder: llm.FunctionTool<{
        message: string;
        when: string;
        deliveryMethod: "email" | "sms" | "call" | "voice_message";
        contact?: string | undefined;
    }, unknown, string>;
    listReminders: llm.FunctionTool<Record<string, never>, unknown, string>;
    cancelReminder: llm.FunctionTool<{
        reminderId: string;
    }, unknown, "Got it, I've cancelled that reminder." | "I couldn't find that reminder. It might have already been delivered or cancelled. Want to see your current reminders?">;
    scheduleReminder: llm.FunctionTool<{
        reminderText: string;
        when: string;
        contactMethod?: "email" | "sms" | undefined;
        contact?: string | undefined;
    }, unknown, string>;
    scheduleEvent: llm.FunctionTool<{
        title: string;
        when: string;
        description?: string | undefined;
        durationMinutes?: number | undefined;
    }, unknown, string>;
    saveContactInfo: llm.FunctionTool<{
        phone?: string | undefined;
        email?: string | undefined;
        preferredMethod?: "email" | "sms" | "call" | "voice_message" | undefined;
    }, unknown, string>;
    checkAvailability: llm.FunctionTool<{
        date: string;
        durationMinutes: number;
    }, unknown, string>;
    scheduleCall: llm.FunctionTool<{
        contact: string;
        purpose: string;
        dateTime: string;
        duration: number;
        phone?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    getCommunicationSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
}>;
export default createCommunicationTools;
//# sourceMappingURL=communication-tools.d.ts.map