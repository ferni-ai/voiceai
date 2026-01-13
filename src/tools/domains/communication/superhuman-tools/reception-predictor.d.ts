/**
 * Reception Predictor - Better Than Human Service
 *
 * What no human friend can do: Objectively assess how your words will land.
 *
 * "Based on what you've told me about Mark, this phrase 'you need to...' might
 * trigger his defenses. He tends to respond better when you ask questions.
 * Try: 'What do you think about...?'"
 *
 * @module tools/domains/communication/superhuman-tools/reception-predictor
 */
import type { ReceptionPrediction } from './types.js';
/**
 * Predict how a message will be received by a specific person.
 */
export declare function predictReception(userId: string, message: string, contactName: string): Promise<ReceptionPrediction>;
/**
 * Predict reception without a specific contact (general patterns only).
 */
export declare function predictGeneralReception(message: string): ReceptionPrediction;
/**
 * Generate a softened version of the message.
 */
export declare function generateSoftenedVersion(message: string): string;
/**
 * Generate alternative phrasings for a specific trigger phrase.
 */
export declare function generateAlternatives(triggerPhrase: string): string[];
/**
 * Build context for LLM about reception prediction capabilities.
 */
export declare function buildReceptionPredictorContext(): string;
export declare const receptionPredictor: {
    predict: typeof predictReception;
    predictGeneral: typeof predictGeneralReception;
    soften: typeof generateSoftenedVersion;
    alternatives: typeof generateAlternatives;
    buildContext: typeof buildReceptionPredictorContext;
};
export default receptionPredictor;
//# sourceMappingURL=reception-predictor.d.ts.map