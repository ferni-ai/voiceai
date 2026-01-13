/**
 * Third-Party Perspective Generator - Better Than Human Service
 *
 * What no human friend can do: Give you a truly neutral viewpoint.
 *
 * "A neutral observer might see this situation like this: Two people who both
 * feel unheard and are defending themselves rather than listening. Neither
 * person is the villain. What would change if you assumed he has a legitimate
 * concern?"
 *
 * @module tools/domains/communication/superhuman-tools/third-party-perspective
 */
import type { ThirdPartyPerspective } from './types.js';
/**
 * Generate a third-party perspective on a conflict or situation.
 */
export declare function generatePerspective(userStory: string, otherPersonName: string, context?: {
    relationship?: string;
    history?: string;
}): ThirdPartyPerspective;
/**
 * Generate questions to help see other perspectives.
 */
export declare function generatePerspectiveQuestions(situation: string, otherName: string): string[];
/**
 * Generate a reframe of the situation.
 */
export declare function generateReframe(currentFrame: string, otherName: string): {
    reframe: string;
    insight: string;
};
/**
 * Build perspective context for LLM injection.
 */
export declare function buildPerspectiveContext(): string;
export declare const thirdPartyPerspective: {
    generate: typeof generatePerspective;
    questions: typeof generatePerspectiveQuestions;
    reframe: typeof generateReframe;
    buildContext: typeof buildPerspectiveContext;
};
export default thirdPartyPerspective;
//# sourceMappingURL=third-party-perspective.d.ts.map