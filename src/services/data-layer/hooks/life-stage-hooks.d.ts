/**
 * Life Stage Domain Hooks
 *
 * Semantic indexing hooks for life stage transitions:
 * - New Parent
 * - Empty Nest
 * - Infidelity Recovery
 * - Health Diagnosis
 * - Job Loss
 * - Sobriety/Recovery
 * - Sandwich Generation
 * - Blended Family
 * - Coming Out
 * - Faith Transition
 *
 * @module services/data-layer/hooks/life-stage-hooks
 */
interface LifeStageEntityBase {
    id: string;
    status: 'active' | 'resolved' | 'dormant';
    startedAt?: string;
    notes?: string;
}
interface NewParentEntity extends LifeStageEntityBase {
    babyAge?: string;
    identityStage?: string;
    sleepDeprivation?: string;
    supportNetwork?: string;
}
interface EmptyNestEntity extends LifeStageEntityBase {
    childrenMoved?: string[];
    adjustmentPhase?: string;
    newPursuit?: string;
}
interface InfidelityEntity extends LifeStageEntityBase {
    role: 'betrayed' | 'unfaithful' | 'both';
    phase?: 'discovery' | 'processing' | 'deciding' | 'rebuilding';
    trustLevel?: string;
    therapyInvolved?: boolean;
}
interface HealthDiagnosisEntity extends LifeStageEntityBase {
    condition?: string;
    severity?: string;
    treatmentPlan?: string;
    emotionalStage?: string;
}
interface JobLossEntity extends LifeStageEntityBase {
    reason?: string;
    financialBuffer?: string;
    jobSearchActive?: boolean;
    identityImpact?: string;
}
interface SobrietyEntity extends LifeStageEntityBase {
    substance?: string;
    daysSober?: number;
    supportGroup?: string;
    triggers?: string[];
}
interface SandwichGenerationEntity extends LifeStageEntityBase {
    elderCareNeeds?: string;
    childCareNeeds?: string;
    burnoutLevel?: string;
    supportResources?: string[];
}
interface BlendedFamilyEntity extends LifeStageEntityBase {
    stepRelationships?: string[];
    challengeAreas?: string[];
    integrationProgress?: string;
}
interface ComingOutEntity extends LifeStageEntityBase {
    identity?: string;
    audiencesComeOutTo?: string[];
    supportReceived?: string;
    challengesFaced?: string[];
}
interface FaithTransitionEntity extends LifeStageEntityBase {
    fromFaith?: string;
    toFaith?: string;
    stage?: 'questioning' | 'exploring' | 'transitioning' | 'settled';
    communityImpact?: string;
}
export declare const onNewParentChange: import("../hook-generator.js").DomainHook<NewParentEntity>;
export declare const onEmptyNestChange: import("../hook-generator.js").DomainHook<EmptyNestEntity>;
export declare const onInfidelityChange: import("../hook-generator.js").DomainHook<InfidelityEntity>;
export declare const onHealthDiagnosisChange: import("../hook-generator.js").DomainHook<HealthDiagnosisEntity>;
export declare const onJobLossChange: import("../hook-generator.js").DomainHook<JobLossEntity>;
export declare const onSobrietyChange: import("../hook-generator.js").DomainHook<SobrietyEntity>;
export declare const onSandwichGenerationChange: import("../hook-generator.js").DomainHook<SandwichGenerationEntity>;
export declare const onBlendedFamilyChange: import("../hook-generator.js").DomainHook<BlendedFamilyEntity>;
export declare const onComingOutChange: import("../hook-generator.js").DomainHook<ComingOutEntity>;
export declare const onFaithTransitionChange: import("../hook-generator.js").DomainHook<FaithTransitionEntity>;
export declare const lifeStageHooks: {
    onNewParentChange: import("../hook-generator.js").DomainHook<NewParentEntity>;
    onEmptyNestChange: import("../hook-generator.js").DomainHook<EmptyNestEntity>;
    onInfidelityChange: import("../hook-generator.js").DomainHook<InfidelityEntity>;
    onHealthDiagnosisChange: import("../hook-generator.js").DomainHook<HealthDiagnosisEntity>;
    onJobLossChange: import("../hook-generator.js").DomainHook<JobLossEntity>;
    onSobrietyChange: import("../hook-generator.js").DomainHook<SobrietyEntity>;
    onSandwichGenerationChange: import("../hook-generator.js").DomainHook<SandwichGenerationEntity>;
    onBlendedFamilyChange: import("../hook-generator.js").DomainHook<BlendedFamilyEntity>;
    onComingOutChange: import("../hook-generator.js").DomainHook<ComingOutEntity>;
    onFaithTransitionChange: import("../hook-generator.js").DomainHook<FaithTransitionEntity>;
};
export default lifeStageHooks;
//# sourceMappingURL=life-stage-hooks.d.ts.map