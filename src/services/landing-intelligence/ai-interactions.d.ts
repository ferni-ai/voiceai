/**
 * AI Interactions for Landing Page
 *
 * Provides real AI-powered interactions for the landing page:
 * - Live text chat with Ferni (no account required)
 * - Persona preview responses
 * - Smart FAQ answers
 * - AI-generated social proof
 * - Personalized hero headlines
 *
 * @module services/landing-intelligence/ai-interactions
 */
export interface DemoChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}
export interface DemoChatSession {
    visitorId: string;
    messages: DemoChatMessage[];
    startedAt: number;
    persona?: string;
}
export interface PersonaPreviewRequest {
    persona: 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';
    question: string;
    visitorId?: string;
}
export interface PersonaPreviewResponse {
    persona: string;
    question: string;
    response: string;
    traits: string[];
}
export interface SmartFAQRequest {
    question: string;
    visitorId?: string;
    context?: string;
}
export interface SmartFAQResponse {
    question: string;
    answer: string;
    relatedQuestions?: string[];
    confidence: number;
}
export interface PersonalizedHeroRequest {
    hour: number;
    referrer?: string;
    isReturning: boolean;
    visitCount: number;
    device: 'mobile' | 'tablet' | 'desktop';
    sentiment?: number;
    topSectionsViewed?: string[];
}
export interface PersonalizedHeroResponse {
    tagline: string;
    headline: string;
    subhead: string;
    ctaText: string;
    generationReason: string;
}
export interface SocialProofSnippet {
    type: 'conversation' | 'moment' | 'insight';
    content: string;
    persona?: string;
    topic?: string;
    time?: string;
}
/**
 * Send a message in the demo chat and get AI response
 */
export declare function sendDemoChatMessage(visitorId: string, message: string, persona?: string): Promise<{
    response: string;
    messagesRemaining: number;
    sessionMessages: DemoChatMessage[];
}>;
/**
 * Generate a preview response from a specific persona
 */
export declare function generatePersonaPreview(request: PersonaPreviewRequest): Promise<PersonaPreviewResponse>;
/**
 * Answer a visitor's question with AI
 */
export declare function answerSmartFAQ(request: SmartFAQRequest): Promise<SmartFAQResponse>;
/**
 * Generate personalized hero content based on visitor context
 */
export declare function generatePersonalizedHero(request: PersonalizedHeroRequest): Promise<PersonalizedHeroResponse>;
/**
 * Generate dynamic social proof snippets
 */
export declare function generateSocialProof(count?: number): Promise<SocialProofSnippet[]>;
/**
 * Generate "What would Ferni say?" hover preview
 */
export declare function generateHoverPreview(elementType: 'faq' | 'feature' | 'testimonial' | 'cta', context: string): Promise<string>;
export interface SentimentCopyRequest {
    sentiment: number;
    currentSection: string;
    timeOnPage: number;
    originalCopy: {
        ctaText?: string;
        subhead?: string;
    };
}
export interface SentimentCopyResponse {
    ctaText?: string;
    subhead?: string;
    reason: string;
}
/**
 * Generate copy variations based on visitor sentiment
 */
export declare function generateSentimentReactiveCopy(request: SentimentCopyRequest): Promise<SentimentCopyResponse>;
//# sourceMappingURL=ai-interactions.d.ts.map