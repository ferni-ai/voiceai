/**
 * Content Loader for Life Coaching Domains
 *
 * Loads PhD-level research and persona-specific methodologies.
 * Research is shared across all personas; methodology is persona-specific application.
 *
 * Architecture:
 *   research-base.json (Domain) → Universal scientific foundation
 *   personas/{id}/methodologies/{domain}.json → How that persona applies the research
 */
export interface Framework {
    name: string;
    founder?: string;
    founders?: string[];
    coreIdea: string;
    keyPrinciple: string;
    efficacy: string;
    domains: string[];
    techniques?: Technique[];
    citations: string[];
    [key: string]: unknown;
}
export interface Technique {
    name: string;
    description?: string;
    steps?: string[];
    examples?: string[];
    example?: string;
}
export interface DomainResearch {
    leadingExperts: Expert[];
    keyFindings: string[];
    assessments?: Assessment[];
    citations: string[];
    [key: string]: unknown;
}
export interface Expert {
    name: string;
    contribution: string;
}
export interface Assessment {
    name: string;
    source: string;
    measures: string;
}
export interface PersonaMethodology {
    meta: {
        version: string;
        personaId: string;
        domain: string;
        philosophy: string;
    };
    [personaName: string]: unknown;
}
export interface ResearchBase {
    meta: {
        version: string;
        lastUpdated: string;
        purpose: string;
    };
    frameworks: Record<string, Framework>;
    domainSpecificResearch: Record<string, DomainResearch>;
}
/**
 * Load the shared research base (cached after first load)
 */
export declare function loadResearchBase(): Promise<ResearchBase>;
/**
 * Load a persona's methodology for a specific domain
 */
export declare function loadPersonaMethodology(personaId: string, domain: string): Promise<PersonaMethodology | null>;
/**
 * Get a specific framework from the research base
 */
export declare function getFramework(frameworkId: string): Promise<Framework | null>;
/**
 * Get domain-specific research
 */
export declare function getDomainResearch(domain: string): Promise<DomainResearch | null>;
/**
 * Get frameworks relevant to a specific domain
 */
export declare function getFrameworksForDomain(domain: string): Promise<Framework[]>;
/**
 * Get cognitive distortions from CBT framework
 */
export declare function getCognitiveDistortions(): Promise<Array<{
    name: string;
    description: string;
    example: string;
}>>;
/**
 * Get DBT skills modules
 */
export declare function getDBTSkills(): Promise<Array<{
    module: string;
    [key: string]: unknown;
}>>;
/**
 * Get attachment styles information
 */
export declare function getAttachmentStyles(): Promise<Array<{
    style: string;
    internalModel: string;
    inRelationships: string;
}>>;
/**
 * Get Gottman's Four Horsemen
 */
export declare function getFourHorsemen(): Promise<Array<{
    horseman: string;
    description: string;
    antidote: string;
}>>;
/**
 * Get a persona's phrasing for a specific domain context
 */
export declare function getPersonaPhrases(personaId: string, domain: string, category: string): Promise<string[]>;
/**
 * Get persona's approach for a specific Four Tendencies type
 */
export declare function getTendencyApproach(personaId: string, domain: string, tendency: 'upholder' | 'questioner' | 'obliger' | 'rebel'): Promise<{
    strength: string;
    challenge: string;
    approach: string;
} | null>;
/**
 * Get combined context for a tool - research + persona methodology
 */
export declare function getToolContext(personaId: string, domain: string): Promise<{
    research: DomainResearch | null;
    frameworks: Framework[];
    methodology: PersonaMethodology | null;
}>;
/**
 * Get a random expert quote/finding for a domain
 */
export declare function getRandomInsight(domain: string): Promise<string | null>;
/**
 * Get citation for a specific framework
 */
export declare function getCitation(frameworkId: string): Promise<string | null>;
/**
 * Clear all caches (useful for testing or hot reload)
 */
export declare function clearContentCaches(): void;
declare const _default: {
    loadResearchBase: typeof loadResearchBase;
    loadPersonaMethodology: typeof loadPersonaMethodology;
    getFramework: typeof getFramework;
    getDomainResearch: typeof getDomainResearch;
    getFrameworksForDomain: typeof getFrameworksForDomain;
    getCognitiveDistortions: typeof getCognitiveDistortions;
    getDBTSkills: typeof getDBTSkills;
    getAttachmentStyles: typeof getAttachmentStyles;
    getFourHorsemen: typeof getFourHorsemen;
    getPersonaPhrases: typeof getPersonaPhrases;
    getTendencyApproach: typeof getTendencyApproach;
    getToolContext: typeof getToolContext;
    getRandomInsight: typeof getRandomInsight;
    getCitation: typeof getCitation;
    clearContentCaches: typeof clearContentCaches;
};
export default _default;
//# sourceMappingURL=content-loader.d.ts.map