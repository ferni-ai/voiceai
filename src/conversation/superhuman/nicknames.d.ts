/**
 * Nicknames & Terms of Endearment
 *
 * Personal touches that make relationships feel real.
 *
 * Using someone's name or a gentle term of endearment at the right moment
 * creates connection. This system manages when and how to use them.
 *
 * @module conversation/superhuman/nicknames
 */
export interface UserNaming {
    userId: string;
    firstName?: string;
    preferredName?: string;
    nicknames: string[];
    allowedEndearments: EndearmentLevel;
    lastNameUsed?: Date;
    nameUsageCount: number;
}
export type EndearmentLevel = 'none' | 'gentle' | 'warm' | 'affectionate';
export interface NamingContext {
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
    emotionalMoment: boolean;
    celebrationMoment: boolean;
    supportMoment: boolean;
}
/**
 * Get or create user naming preferences
 */
export declare function getUserNaming(userId: string): UserNaming;
/**
 * Set the user's name
 */
export declare function setUserName(userId: string, firstName: string, preferredName?: string): void;
/**
 * Add a nickname for the user
 */
export declare function addNickname(userId: string, nickname: string): void;
/**
 * Update endearment level based on relationship stage
 */
export declare function updateEndearmentLevel(userId: string, stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted'): void;
/**
 * Decide if we should use the user's name in this response
 */
export declare function shouldUseName(userId: string, context: NamingContext): {
    useName: boolean;
    useEndearment: boolean;
    suggestion?: string;
};
/**
 * Record that we used the name
 */
export declare function recordNameUsage(userId: string): void;
/**
 * Try to extract the user's name from their message
 */
export declare function extractNameFromMessage(message: string): {
    firstName?: string;
    preferredName?: string;
} | null;
/**
 * Format naming guidance for prompt
 */
export declare function formatNamingGuidance(userId: string, context: NamingContext): string | null;
declare const _default: {
    getUserNaming: typeof getUserNaming;
    setUserName: typeof setUserName;
    addNickname: typeof addNickname;
    updateEndearmentLevel: typeof updateEndearmentLevel;
    shouldUseName: typeof shouldUseName;
    recordNameUsage: typeof recordNameUsage;
    extractNameFromMessage: typeof extractNameFromMessage;
    formatNamingGuidance: typeof formatNamingGuidance;
};
export default _default;
//# sourceMappingURL=nicknames.d.ts.map