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

import { createDomainHook, joinNonEmpty, formatField } from '../hook-generator.js';

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// NEW PARENT
// ============================================================================

export const onNewParentChange = createDomainHook<NewParentEntity>({
  storeType: 'life-stage',
  entityType: 'new_parent',
  contentBuilder: (d) =>
    joinNonEmpty([
      `New parent journey.`,
      formatField('Baby age', d.babyAge),
      formatField('Identity stage', d.identityStage),
      formatField('Sleep', d.sleepDeprivation),
      formatField('Support', d.supportNetwork),
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    identityStage: d.identityStage,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// EMPTY NEST
// ============================================================================

export const onEmptyNestChange = createDomainHook<EmptyNestEntity>({
  storeType: 'life-stage',
  entityType: 'empty_nest',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Empty nest transition.`,
      d.childrenMoved?.length ? `Children moved: ${d.childrenMoved.join(', ')}.` : '',
      formatField('Adjustment phase', d.adjustmentPhase),
      formatField('New pursuit', d.newPursuit),
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    adjustmentPhase: d.adjustmentPhase,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// INFIDELITY RECOVERY (Sensitive)
// ============================================================================

export const onInfidelityChange = createDomainHook<InfidelityEntity>({
  storeType: 'life-stage',
  entityType: 'infidelity_recovery',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Infidelity recovery (${d.role}).`,
      formatField('Phase', d.phase),
      formatField('Trust rebuilding', d.trustLevel),
      d.therapyInvolved ? 'Therapy involved.' : '',
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    role: d.role,
    phase: d.phase,
    therapyInvolved: d.therapyInvolved,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// HEALTH DIAGNOSIS
// ============================================================================

export const onHealthDiagnosisChange = createDomainHook<HealthDiagnosisEntity>({
  storeType: 'life-stage',
  entityType: 'health_diagnosis',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Health diagnosis: ${d.condition || 'unspecified'}.`,
      formatField('Severity', d.severity),
      formatField('Treatment', d.treatmentPlan),
      formatField('Emotional stage', d.emotionalStage),
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    condition: d.condition,
    severity: d.severity,
    emotionalStage: d.emotionalStage,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// JOB LOSS
// ============================================================================

export const onJobLossChange = createDomainHook<JobLossEntity>({
  storeType: 'life-stage',
  entityType: 'job_loss',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Job loss: ${d.reason || 'transition'}.`,
      formatField('Financial buffer', d.financialBuffer),
      d.jobSearchActive ? 'Job search active.' : 'Job search preparing.',
      formatField('Identity impact', d.identityImpact),
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    reason: d.reason,
    jobSearchActive: d.jobSearchActive,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// SOBRIETY / RECOVERY (Sensitive)
// ============================================================================

export const onSobrietyChange = createDomainHook<SobrietyEntity>({
  storeType: 'life-stage',
  entityType: 'sobriety',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Sobriety journey (${d.substance || 'substance'}).`,
      d.daysSober ? `Days sober: ${d.daysSober}.` : '',
      formatField('Support group', d.supportGroup),
      d.triggers?.length ? `Known triggers: ${d.triggers.join(', ')}.` : '',
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    substance: d.substance,
    daysSober: d.daysSober,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// SANDWICH GENERATION
// ============================================================================

export const onSandwichGenerationChange = createDomainHook<SandwichGenerationEntity>({
  storeType: 'life-stage',
  entityType: 'sandwich_generation',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Sandwich generation caregiving.`,
      formatField('Elder care', d.elderCareNeeds),
      formatField('Child care', d.childCareNeeds),
      formatField('Burnout level', d.burnoutLevel),
      d.supportResources?.length ? `Resources: ${d.supportResources.join(', ')}.` : '',
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    burnoutLevel: d.burnoutLevel,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// BLENDED FAMILY
// ============================================================================

export const onBlendedFamilyChange = createDomainHook<BlendedFamilyEntity>({
  storeType: 'life-stage',
  entityType: 'blended_family',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Blended family integration.`,
      d.stepRelationships?.length ? `Relationships: ${d.stepRelationships.join(', ')}.` : '',
      d.challengeAreas?.length ? `Challenges: ${d.challengeAreas.join(', ')}.` : '',
      formatField('Progress', d.integrationProgress),
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    integrationProgress: d.integrationProgress,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// COMING OUT (Sensitive)
// ============================================================================

export const onComingOutChange = createDomainHook<ComingOutEntity>({
  storeType: 'life-stage',
  entityType: 'coming_out',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Coming out journey (${d.identity || 'LGBTQ+'}).`,
      d.audiencesComeOutTo?.length ? `Come out to: ${d.audiencesComeOutTo.join(', ')}.` : '',
      formatField('Support received', d.supportReceived),
      d.challengesFaced?.length ? `Challenges: ${d.challengesFaced.join(', ')}.` : '',
      formatField('Notes', d.notes),
    ]),
  metadataExtractor: (d) => ({
    identity: d.identity,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// FAITH TRANSITION
// ============================================================================

export const onFaithTransitionChange = createDomainHook<FaithTransitionEntity>({
  storeType: 'life-stage',
  entityType: 'faith_transition',
  contentBuilder: (d) => {
    const transitionInfo =
      d.fromFaith && d.toFaith
        ? `From ${d.fromFaith} to ${d.toFaith}.`
        : d.fromFaith
          ? `Leaving ${d.fromFaith}.`
          : '';
    return joinNonEmpty([
      `Faith transition.`,
      transitionInfo,
      formatField('Stage', d.stage),
      formatField('Community impact', d.communityImpact),
      formatField('Notes', d.notes),
    ]);
  },
  metadataExtractor: (d) => ({
    fromFaith: d.fromFaith,
    toFaith: d.toFaith,
    stage: d.stage,
    status: d.status,
  }),
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// EXPORTS
// ============================================================================

export const lifeStageHooks = {
  onNewParentChange,
  onEmptyNestChange,
  onInfidelityChange,
  onHealthDiagnosisChange,
  onJobLossChange,
  onSobrietyChange,
  onSandwichGenerationChange,
  onBlendedFamilyChange,
  onComingOutChange,
  onFaithTransitionChange,
};

export default lifeStageHooks;
