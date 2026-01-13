/**
 * Handoff Detection Functions
 * Detects when users want to talk to different team members
 */
/**
 * Detect if user wants to talk to Peter (Investment & Research)
 */
export declare function shouldHandoffToPeter(userInput: string): boolean;
/**
 * Detect if user wants to talk to Nayan (Sage & Wisdom Guide)
 * "Hey Nayan" triggers immediate transfer to Nayan Patel.
 */
export declare function shouldHandoffToNayan(userInput: string): boolean;
/**
 * Detect if user wants to talk to Alex (Communication)
 */
export declare function shouldHandoffToAlex(userInput: string): boolean;
/**
 * Detect if user wants to talk to Maya (Spend & Save)
 */
export declare function shouldHandoffToMaya(userInput: string): boolean;
/**
 * Detect if user wants to talk to Jordan (Life's Firsts & Planning)
 */
export declare function shouldHandoffToJordan(userInput: string): boolean;
/**
 * Detect if user wants to return to Ferni (coach)
 */
export declare function shouldHandoffToFerni(userInput: string): boolean;
//# sourceMappingURL=detection.d.ts.map