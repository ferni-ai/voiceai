/**
 * Demo Conversation Generator
 *
 * Generates dynamic, contextual demo conversations for the landing page.
 * Shows Ferni's superpowers in action.
 *
 * @module services/landing-intelligence/demo-generator
 */
import type { VisitorIntent } from './intent-detector.js';
export interface DemoMessage {
    /** Message role */
    role: 'user' | 'ferni';
    /** Message content */
    message: string;
    /** When this happened (for timeline demos) */
    timestamp?: string;
    /** Superpower being demonstrated */
    superpower?: 'memory' | 'reading-between-lines' | 'presence' | 'anticipation' | 'quote-callback' | 'emotional-forecasting' | 'gentle-challenge';
    /** Visual annotation for the demo */
    annotation?: string;
}
export interface DemoConversation {
    /** Unique ID */
    id: string;
    /** Demo theme */
    theme: string;
    /** Messages */
    messages: DemoMessage[];
    /** Which concern this addresses */
    concern?: VisitorIntent['primaryConcern'];
    /** Generated at */
    generatedAt: Date;
}
export declare function generateDemoConversation(concern?: VisitorIntent['primaryConcern'], superpower?: DemoMessage['superpower']): Promise<DemoConversation>;
export declare function getDemoForSection(section: string): DemoConversation;
export declare function generateUseCaseDemo(useCase: 'career' | 'anxiety' | 'habits' | 'relationships' | 'decisions'): Promise<DemoConversation>;
//# sourceMappingURL=demo-generator.d.ts.map