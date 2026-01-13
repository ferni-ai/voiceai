/**
 * Persona Building Blocks
 *
 * Each persona has unique building blocks that compose into authentic expressions:
 * - Passions: Topics they care deeply about, with triggers and expressions
 * - Opinions: Strong views that show personality
 * - Quirks: Human imperfections that make them relatable
 * - Locations: Places that shaped them (backstory)
 * - Vulnerabilities: Deep moments (used rarely, with trust)
 * - Topic connections: How they relate user topics to their experience
 *
 * @module personas/shared/persona-building-blocks
 */
export interface PersonaPassion {
    topic: string;
    triggers: string[];
    expression: string;
    intensity: 'mild' | 'moderate' | 'strong';
}
export interface PersonaOpinion {
    topic: string;
    stance: string;
    expression: string;
    context: string[];
}
export interface PersonaQuirk {
    category: 'habit' | 'preference' | 'confession';
    expression: string;
}
export interface LocationFragments {
    sensory: string[];
    wisdom: string[];
    callback?: string;
}
export interface PersonaVulnerability {
    topic: string;
    surface: string;
    depth: string;
    reconnection?: string;
}
export interface PersonaBuildingBlocks {
    passions: PersonaPassion[];
    opinions: PersonaOpinion[];
    quirks: PersonaQuirk[];
    locations: Record<string, LocationFragments>;
    vulnerabilities: PersonaVulnerability[];
    familyFragments: string[];
    warmDrinks: string[];
    topicConnections: Record<string, string[]>;
    temporalPhrases?: {
        dawn?: string[];
        morning?: string[];
        evening?: string[];
        late_night?: string[];
    };
}
export declare const PERSONA_BUILDING_BLOCKS: Record<string, PersonaBuildingBlocks>;
export declare function getPersonaBuildingBlocks(personaId: string): PersonaBuildingBlocks | null;
export declare function hasPersonaBuildingBlocks(personaId: string): boolean;
//# sourceMappingURL=persona-building-blocks.d.ts.map