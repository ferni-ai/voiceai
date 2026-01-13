/**
 * Theatrical Personality System
 *
 * Makes agent transitions, celebrations, greetings, and goodbyes
 * memorable and distinctly THEM.
 *
 * This is about creating MOMENTS - the kind of thing users remember.
 *
 * NOTE: All theatrical content is now loaded from persona bundles.
 * See bundles/{persona}/content/behaviors/ for entrances, celebrations, etc.
 */
export type CelebrationType = 'decision_made' | 'goal_reached' | 'breakthrough' | 'commitment' | 'learning' | 'progress' | 'courage' | 'win';
export interface StorytellingConfig {
    askAboutMusic: boolean;
    introPhrases: string[];
    pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
    pauseMultiplier: number;
}
/**
 * Register entrances from a bundle
 * Call this after loading a persona bundle
 */
export declare function registerBundleEntrances(personaId: string, entrances: string[]): void;
/**
 * Clear bundle entrances (useful for hot reload)
 */
export declare function clearBundleEntrances(personaId?: string): void;
/**
 * Get all entrances for a persona
 */
export declare function getAllEntrancesForPersona(personaId: string): string[];
/**
 * Get theatrical entrance for a persona
 */
export declare function getTheatricalEntrance(personaId: string): string;
/**
 * Register celebrations from a bundle
 */
export declare function registerBundleCelebrations(personaId: string, celebrations: Record<string, string[]>): void;
/**
 * Clear bundle celebrations (useful for hot reload)
 */
export declare function clearBundleCelebrations(personaId?: string): void;
/**
 * Get celebration moment for a persona
 */
export declare function getCelebration(personaId: string, type: CelebrationType): string;
/**
 * Register goodbyes from a bundle
 */
export declare function registerBundleGoodbyes(personaId: string, goodbyes: string[]): void;
/**
 * Clear bundle goodbyes (useful for hot reload)
 */
export declare function clearBundleGoodbyes(personaId?: string): void;
/**
 * Get goodbye for a persona
 */
export declare function getTheatricalGoodbye(personaId: string): string;
interface BundleStorytellingConfig {
    askAboutMusic: boolean;
    introPhrases: string[];
    pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
    pauseMultiplier: number;
    musicOffers?: string[];
}
/**
 * Register storytelling config from a bundle
 */
export declare function registerBundleStorytelling(personaId: string, config: BundleStorytellingConfig): void;
/**
 * Clear bundle storytelling (useful for hot reload)
 */
export declare function clearBundleStorytelling(personaId?: string): void;
/**
 * Get storytelling config for a persona
 */
export declare function getStorytellingConfig(personaId: string): StorytellingConfig | null;
/**
 * Get storytelling intro for persona
 */
export declare function getStorytellingIntro(personaId: string): string;
/**
 * Get music offer for storytelling (bundle-aware)
 */
export declare function getBundleStoryMusicOffer(personaId: string): string | null;
/**
 * Get music offer phrase for storytelling mode
 * @deprecated Use getBundleStoryMusicOffer instead
 */
export declare function getStoryMusicOffer(personaId: string): string | null;
/**
 * Register backchannels from a loaded bundle
 * Call this after loading a persona bundle
 */
export declare function registerBundleBackchannels(personaId: string, backchannels: Record<string, string[]>): void;
/**
 * Clear bundle backchannels (useful for hot reload)
 */
export declare function clearBundleBackchannels(personaId?: string): void;
/**
 * Get all available backchannels for a persona
 */
export declare function getAllBackchannelsForPersona(personaId: string): Record<string, string[]> | null;
/**
 * Get enhanced backchannel for persona with anti-repetition logic
 *
 * PHILOSOPHY: Real humans don't say "mmhmm" 5 times in a row.
 * Track recent backchannels and avoid repeating them.
 */
export declare function getEnhancedBackchannel(personaId: string, emotion: 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful' | 'supportive' | 'efficient' | 'encouraging' | 'understanding' | 'playful' | 'celebration'): string;
/**
 * Clear recent backchannels for a persona (useful for new sessions)
 */
export declare function clearRecentBackchannels(personaId?: string): void;
/**
 * Clear all registries (for testing)
 */
export declare function clearAllTheatricalRegistries(): void;
declare const _default: {
    getTheatricalEntrance: typeof getTheatricalEntrance;
    registerBundleEntrances: typeof registerBundleEntrances;
    clearBundleEntrances: typeof clearBundleEntrances;
    getAllEntrancesForPersona: typeof getAllEntrancesForPersona;
    getCelebration: typeof getCelebration;
    registerBundleCelebrations: typeof registerBundleCelebrations;
    clearBundleCelebrations: typeof clearBundleCelebrations;
    getTheatricalGoodbye: typeof getTheatricalGoodbye;
    registerBundleGoodbyes: typeof registerBundleGoodbyes;
    clearBundleGoodbyes: typeof clearBundleGoodbyes;
    getStorytellingConfig: typeof getStorytellingConfig;
    getStorytellingIntro: typeof getStorytellingIntro;
    getBundleStoryMusicOffer: typeof getBundleStoryMusicOffer;
    getStoryMusicOffer: typeof getStoryMusicOffer;
    registerBundleStorytelling: typeof registerBundleStorytelling;
    clearBundleStorytelling: typeof clearBundleStorytelling;
    getEnhancedBackchannel: typeof getEnhancedBackchannel;
    registerBundleBackchannels: typeof registerBundleBackchannels;
    clearBundleBackchannels: typeof clearBundleBackchannels;
    getAllBackchannelsForPersona: typeof getAllBackchannelsForPersona;
    clearRecentBackchannels: typeof clearRecentBackchannels;
    clearAllTheatricalRegistries: typeof clearAllTheatricalRegistries;
};
export default _default;
//# sourceMappingURL=theatrical.d.ts.map