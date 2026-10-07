/**
 * The six previously unwired superhuman services must run from
 * buildSuperhumanContext (the insights injection path used when
 * TURN_INTELLIGENCE is on).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectCrisis = vi.fn(() => ({ level: 'high', type: 'distress' }));
const buildFirstAidContext = vi.fn(() => '[FIRST AID] stay with them');
const buildCausalInferenceContext = vi.fn(async () => '[CAUSAL] sleep → mood');
const buildHabitEconomicsContext = vi.fn(async () => '[HABIT $] morning walk pays off');
const buildLifeTrajectoryContext = vi.fn(async () => '[TRAJECTORY] two paths');
const buildExperimentationContext = vi.fn(async () => '[N=1] try earlier bedtime');
const buildCompoundEffectsContext = vi.fn(async () => '[COMPOUND] walk streak');

vi.mock('../emotional-first-aid.js', () => ({
  detectCrisis,
  buildFirstAidContext,
}));
vi.mock('../causal-inference-engine.js', () => ({
  buildCausalInferenceContext,
}));
vi.mock('../habit-economics.js', () => ({
  buildHabitEconomicsContext,
}));
vi.mock('../life-trajectory-simulator.js', () => ({
  buildLifeTrajectoryContext,
}));
vi.mock('../n1-experimentation-platform.js', () => ({
  buildExperimentationContext,
}));
vi.mock('../compound-effects-context.js', () => ({
  buildCompoundEffectsContext,
}));

vi.mock('../commitment-keeper.js', () => ({
  buildCommitmentContext: async () => '[CORE] commitments',
}));
vi.mock('../predictive-coaching.js', () => ({ buildPredictiveContextString: async () => '' }));
vi.mock('../life-narrative.js', () => ({ buildNarrativeContextString: async () => '' }));
vi.mock('../values-alignment.js', () => ({ buildValuesContext: async () => '' }));
vi.mock('../relationship-network.js', () => ({ buildNetworkContext: async () => '' }));
vi.mock('../capacity-guardian.js', () => ({ buildCapacityContext: async () => '' }));
vi.mock('../dream-keeper.js', () => ({ buildDreamContext: async () => '' }));
vi.mock('../relationship-milestones.js', () => ({ buildMilestoneContext: async () => '' }));
vi.mock('../seasonal-awareness.js', () => ({ buildSeasonalContext: async () => '' }));
vi.mock('../biometric-habit-intelligence.js', () => ({
  buildBiometricHabitContext: async () => '',
}));
vi.mock('../communication-intelligence-engine.js', () => ({
  buildCommunicationIntelligenceContext: async () => '',
}));
vi.mock('../contemplative-intelligence.js', () => ({ buildContemplativeContext: async () => '' }));
vi.mock('../developmental-stage-awareness.js', () => ({
  buildDevelopmentalContext: async () => '',
}));
vi.mock('../financial-pattern-intelligence.js', () => ({
  buildFinancialPatternContext: async () => '',
}));
vi.mock('../habit-optimization-engine.js', () => ({
  buildHabitOptimizationContext: async () => '',
}));
vi.mock('../orchestration-intelligence.js', () => ({ buildOrchestrationContext: async () => '' }));
vi.mock('../contradiction-comfort.js', () => ({
  buildContradictionAwarenessContext: async () => '',
}));
vi.mock('../future-self.js', () => ({
  buildFutureSelfContext: () => '',
  getRecentLetter: async () => null,
}));
vi.mock('../pattern-mirror.js', () => ({ buildPatternMirrorContext: () => '' }));
vi.mock('../perfect-timing.js', () => ({ buildTimingContext: () => '' }));
vi.mock('../silence-interpreter.js', () => ({ buildSilenceContext: async () => '' }));
vi.mock('../calendar-prep-coaching.js', () => ({ buildCalendarPrepContext: async () => '' }));
vi.mock('../conflict-resolution-memory.js', () => ({
  buildConflictResolutionContext: async () => '',
}));
vi.mock('../emotional-vocabulary.js', () => ({
  buildVagueEmotionContext: () => '',
  buildVocabularyContext: async () => '',
  detectVagueEmotions: () => [],
}));
vi.mock('../energy-wave-mapping.js', () => ({ buildEnergyWaveContext: async () => '' }));
vi.mock('../inside-joke-memory.js', () => ({ buildInsideJokeContext: async () => '' }));
vi.mock('../mood-calendar.js', () => ({ buildMoodCalendarContext: async () => '' }));
vi.mock('../protective-silence.js', () => ({ buildProtectiveSilenceContext: async () => '' }));
vi.mock('../recovery-tracking.js', () => ({ buildRecoveryContext: async () => '' }));
vi.mock('../social-battery.js', () => ({ buildSocialBatteryContext: async () => '' }));
vi.mock('../voice-biomarkers.js', () => ({ buildVoiceBiomarkersContext: async () => '' }));
vi.mock('../semantic-intelligence/index.js', () => ({
  buildSemanticIntelligenceContext: async () => ({}),
  formatSemanticIntelligenceContext: () => '',
}));
vi.mock('../anticipatory-planning.js', () => ({ buildAnticipatoryPlanningContext: async () => '' }));
vi.mock('../celebration-balance.js', () => ({ buildCelebrationBalanceContext: async () => '' }));
vi.mock('../event-pattern-memory.js', () => ({ buildEventPatternContext: async () => '' }));
vi.mock('../event-story-capture.js', () => ({ buildEventStoryContext: async () => '' }));
vi.mock('../guest-intelligence.js', () => ({ buildGuestIntelligenceContext: async () => '' }));
vi.mock('../planning-coordination.js', () => ({
  buildPlanningCoordinationContext: async () => '',
}));
vi.mock('../post-event-learning.js', () => ({ buildPostEventLearningContext: async () => '' }));
vi.mock('../proactive-milestone-detector.js', () => ({
  buildMilestoneDetectorContext: async () => '',
}));
vi.mock('../seasonal-planning-intelligence.js', () => ({
  buildSeasonalPlanningContext: async () => '',
}));

describe('unused superhuman services on the injection path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes all six services from buildSuperhumanContext', async () => {
    const { buildSuperhumanContext, formatSuperhumanContextForPrompt } =
      await import('../superhuman-service.js');

    const context = await buildSuperhumanContext('user-1', {
      crisisSignal: { type: 'text', signal: 'I cannot do this anymore' },
    });
    const prompt = formatSuperhumanContextForPrompt(context);

    expect(detectCrisis).toHaveBeenCalledWith('I cannot do this anymore');
    expect(buildFirstAidContext).toHaveBeenCalled();
    expect(buildCausalInferenceContext).toHaveBeenCalledWith('user-1');
    expect(buildHabitEconomicsContext).toHaveBeenCalledWith('user-1');
    expect(buildLifeTrajectoryContext).toHaveBeenCalledWith('user-1');
    expect(buildExperimentationContext).toHaveBeenCalledWith('user-1');
    expect(buildCompoundEffectsContext).toHaveBeenCalledWith('user-1');

    expect(context.causalInference).toBe('[CAUSAL] sleep → mood');
    expect(context.habitEconomics).toBe('[HABIT $] morning walk pays off');
    expect(context.lifeTrajectory).toBe('[TRAJECTORY] two paths');
    expect(context.experimentation).toBe('[N=1] try earlier bedtime');
    expect(context.compoundEffects).toBe('[COMPOUND] walk streak');
    expect(context.crisis).toBe('[FIRST AID] stay with them');

    expect(prompt).toContain('[FIRST AID]');
    expect(prompt).toContain('[CAUSAL]');
    expect(prompt).toContain('[HABIT $]');
    expect(prompt).toContain('[TRAJECTORY]');
    expect(prompt).toContain('[N=1]');
    expect(prompt).toContain('[COMPOUND]');
  });
});
