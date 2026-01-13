/**
 * Gift Registry & Thank-You Tracking - Jordan's Celebration Support
 *
 * Helps track gifts received, thank-you notes sent, and registry management
 * for any life milestone celebration.
 *
 * NOW INTEGRATED with Firestore-backed gift-tracking-service for persistence!
 */
import { llm } from '@livekit/agents';
export interface Gift {
    id: string;
    eventId?: string;
    from: string;
    fromEmail?: string;
    description: string;
    estimatedValue?: number;
    receivedDate: Date;
    thankYouSent: boolean;
    thankYouSentDate?: Date;
    notes?: string;
}
export interface RegistryItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    priority: 'must-have' | 'nice-to-have' | 'dream';
    category: string;
    url?: string;
    purchased: boolean;
    purchasedBy?: string;
}
export interface Registry {
    id: string;
    eventName: string;
    eventType: 'wedding' | 'baby-shower' | 'housewarming' | 'birthday' | 'other';
    items: RegistryItem[];
    createdAt: Date;
}
export declare const GIFT_IDEAS: Record<string, Array<{
    category: string;
    items: Array<{
        name: string;
        priceRange: string;
    }>;
}>>;
export declare const THANK_YOU_TEMPLATES: {
    wedding: string[];
    'baby-shower': string[];
    housewarming: string[];
    general: string[];
};
export declare function createGiftRegistryTools(): {
    logGiftReceived: llm.FunctionTool<{
        from: string;
        description: string;
        eventName?: string | undefined;
        estimatedValue?: number | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    logGiftGiven: llm.FunctionTool<{
        to: string;
        description: string;
        occasion?: string | undefined;
        price?: number | undefined;
        reaction?: "neutral" | "loved" | "liked" | "disliked" | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    markThankYouSent: llm.FunctionTool<{
        giftFrom: string;
    }, unknown, string>;
    getGiftHistoryForPerson: llm.FunctionTool<{
        personName: string;
    }, unknown, string>;
    suggestGiftIdeas: llm.FunctionTool<{
        personName: string;
        occasion?: string | undefined;
        budget?: number | undefined;
        mood?: "practical" | "thoughtful" | "fun" | "luxurious" | undefined;
    }, unknown, string>;
    getUpcomingGiftOccasions: llm.FunctionTool<{
        daysAhead?: number | undefined;
    }, unknown, string>;
    generateThankYouNote: llm.FunctionTool<{
        giftFrom: string;
        giftDescription: string;
        eventType: "wedding" | "general" | "housewarming" | "baby-shower";
        senderNames: string;
    }, unknown, string>;
    getGiftIdeas: llm.FunctionTool<{
        eventType: "wedding" | "housewarming" | "baby-shower";
        category?: string | undefined;
    }, unknown, string>;
    createRegistry: llm.FunctionTool<{
        eventName: string;
        eventType: "wedding" | "birthday" | "other" | "housewarming" | "baby-shower";
    }, unknown, string>;
    addToRegistry: llm.FunctionTool<{
        registryName: string;
        itemName: string;
        price: number;
        category: string;
        priority: "dream" | "must-have" | "nice-to-have";
        url?: string | undefined;
    }, unknown, string>;
    viewRegistry: llm.FunctionTool<{
        registryName: string;
    }, unknown, string>;
};
export default createGiftRegistryTools;
//# sourceMappingURL=gift-registry.d.ts.map