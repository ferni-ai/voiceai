/**
 * Response Length Variation Context Builder
 *
 * Humans don't always give medium-length responses. Sometimes they just say
 * "yeah" or "mmm, tell me more." Other times they go deep with a long,
 * thoughtful response. This builder guides natural length variation.
 *
 * Length signals:
 * - User venting → be brief, hold space
 * - User excited sharing → brief encouragements, let them talk
 * - User asking deep question → can go longer
 * - User processing → brief, give them room
 * - User just needs acknowledgment → just acknowledge!
 *
 * @module ResponseLengthContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type ResponseLength = 'minimal' | 'brief' | 'normal' | 'elaborate';
interface LengthSignals {
    isVenting: boolean;
    isProcessing: boolean;
    isExcitedSharing: boolean;
    needsAcknowledgment: boolean;
    askingDeepQuestion: boolean;
    justSharedSomethingBig: boolean;
    userMessageLength: 'short' | 'medium' | 'long';
}
/**
 * Detect signals that indicate what length response is appropriate
 */
declare function detectLengthSignals(userText: string, analysis: ContextBuilderInput['analysis']): LengthSignals;
/**
 * Determine ideal response length based on signals
 *
 * PHILOSOPHY: Ferni should be warm, curious, and ENGAGING.
 * Being too brief makes him feel cold and disinterested.
 * Only go minimal when truly appropriate (intense venting, clear acknowledgment needs).
 * Default to being present and substantive.
 */
declare function determineResponseLength(signals: LengthSignals): ResponseLength;
/**
 * Build response length guidance
 */
declare function buildResponseLengthContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildResponseLengthContext, detectLengthSignals, determineResponseLength };
//# sourceMappingURL=response-length.d.ts.map