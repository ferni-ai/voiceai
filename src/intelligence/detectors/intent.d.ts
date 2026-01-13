/**
 * Intent Classifier
 *
 * Classifies user messages into intents for better response targeting.
 * Supports multi-label classification (a message can have multiple intents).
 */
/**
 * Intent categories
 */
export type Intent = 'seeking_advice' | 'asking_question' | 'requesting_info' | 'seeking_clarification' | 'seeking_support' | 'venting' | 'sharing_news' | 'celebrating' | 'confiding' | 'expressing_concern' | 'making_decision' | 'planning' | 'taking_action' | 'seeking_confirmation' | 'greeting' | 'gratitude' | 'farewell' | 'small_talk' | 'ending_conversation' | 'changing_topic' | 'going_back' | 'sharing_information' | 'sharing_preference' | 'sharing_opinion' | 'investment_question' | 'market_concern' | 'fee_question' | 'goal_discussion' | 'risk_discussion' | 'feedback' | 'correction' | 'unknown';
/**
 * Intent classification result
 */
export interface IntentResult {
    primary: Intent;
    secondary: Intent[];
    confidence: number;
    urgency: 'low' | 'medium' | 'high';
    requiresAction: boolean;
    requiresEmpathy: boolean;
    suggestedApproach: string;
    markers: string[];
}
/**
 * Intent Classifier class
 */
export declare class IntentClassifier {
    /**
     * Classify intents in a message
     */
    classify(text: string): IntentResult;
    /**
     * Determine urgency level
     */
    private determineUrgency;
    /**
     * Check if intent requires action
     */
    private requiresAction;
    /**
     * Check if intent requires empathy
     */
    private requiresEmpathy;
    /**
     * Get suggested approach
     */
    private getSuggestedApproach;
}
/**
 * Get the default intent classifier
 */
export declare function getIntentClassifier(): IntentClassifier;
/**
 * Quick classify function
 */
export declare function classifyIntent(text: string): IntentResult;
export default IntentClassifier;
//# sourceMappingURL=intent.d.ts.map