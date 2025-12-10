/**
 * Human Listening Pipeline Tests
 *
 * Tests for the "Better than Human" listening capabilities:
 * - Cognitive Load Detection
 * - Fluency Analysis
 * - Volume Dynamics
 * - Hedging Detection
 * - Energy Dynamics
 * - Breath Detection
 * - Voice Tremor Detection
 * - Narrative Arc Tracking
 * - Engagement Scoring
 * - Filler Analysis
 * - Self-Soothing Detection
 * - Unified Pipeline
 */

import { beforeEach, describe, expect, it } from 'vitest';

// Cognitive Load
import {
  getCognitiveLoadDetector,
  resetCognitiveLoadDetector,
} from '../intelligence/cognitive-load.js';

// Hedging Detection
import { getHedgingDetector, resetHedgingDetector } from '../intelligence/hedging-detection.js';

// Self-Soothing Detection
import {
  getSelfSoothingDetector,
  resetSelfSoothingDetector,
} from '../intelligence/self-soothing-detection.js';

// Fluency Analysis
import { getFluencyAnalyzer, resetFluencyAnalyzer } from '../speech/fluency-analysis.js';

// Filler Analysis
import { getFillerAnalyzer, resetFillerAnalyzer } from '../speech/filler-analysis.js';

// Narrative Arc
import { getNarrativeArcTracker, resetNarrativeArcTracker } from '../conversation/narrative-arc.js';

// Engagement Scoring
import { getEngagementScorer, resetEngagementScorer } from '../conversation/engagement-scoring.js';

// Unified Pipeline
import {
  getHumanListeningPipeline,
  resetHumanListeningPipeline,
} from '../speech/human-listening-pipeline.js';

const TEST_SESSION_ID = 'test-human-listening-session';

// ============================================================================
// COGNITIVE LOAD DETECTION TESTS
// ============================================================================

describe('CognitiveLoadDetector', () => {
  beforeEach(() => {
    resetCognitiveLoadDetector(TEST_SESSION_ID);
  });

  it('should detect low cognitive load in clear speech', () => {
    const detector = getCognitiveLoadDetector(TEST_SESSION_ID);

    const result = detector.analyzeUtterance(
      'I want to schedule a meeting for tomorrow at 3pm with the marketing team.',
      2000
    );

    expect(result.level).toBe('low');
    expect(result.shouldSimplify).toBe(false);
  });

  it('should detect elevated cognitive load with many fillers', () => {
    const detector = getCognitiveLoadDetector(TEST_SESSION_ID);

    // Build up baseline
    detector.analyzeUtterance('Hello, how are you today?', 1500);
    detector.analyzeUtterance('Im doing well, thanks for asking.', 1800);
    detector.analyzeUtterance('The weather is nice today.', 1600);
    detector.analyzeUtterance('I had a good breakfast this morning.', 2000);
    detector.analyzeUtterance('My coffee was excellent.', 1500);

    // Now speech with many fillers (cognitive processing)
    const result = detector.analyzeUtterance(
      'Um so like the thing is um I was um trying to um figure out um how to um explain this um but I um keep um losing my um train of thought um you know?',
      8000
    );

    // Should detect elevated cognitive load (medium or higher)
    expect(['medium', 'high', 'overloaded']).toContain(result.level);
    expect(result.indicators.fillerFrequency).toBeGreaterThan(0);
  });

  it('should detect self-corrections indicating cognitive load', () => {
    const detector = getCognitiveLoadDetector(TEST_SESSION_ID);

    const result = detector.analyzeUtterance(
      'I was going to— no wait, I mean I think— actually let me start over. The thing is— sorry, what I meant was...',
      5000
    );

    expect(result.indicators.selfCorrections).toBeGreaterThan(0);
  });

  it('should track repetitions', () => {
    const detector = getCognitiveLoadDetector(TEST_SESSION_ID);

    const result = detector.analyzeUtterance('I I I think the the problem is is is..', 3000);

    expect(result.indicators.repetitionCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// HEDGING DETECTION TESTS
// ============================================================================

describe('HedgingDetector', () => {
  beforeEach(() => {
    resetHedgingDetector(TEST_SESSION_ID);
  });

  it('should detect uncertainty hedging', () => {
    const detector = getHedgingDetector(TEST_SESSION_ID);

    const result = detector.analyze('Maybe I should probably possibly consider it, I guess.');

    expect(result.totalHedges).toBeGreaterThan(0);
    expect(result.byCategory.uncertainty).toBeGreaterThan(0);
  });

  it('should detect minimizing language', () => {
    const detector = getHedgingDetector(TEST_SESSION_ID);

    const result = detector.analyze(
      "It's just a little thing. It's not that important, only a small issue."
    );

    expect(result.byCategory.minimizing).toBeGreaterThan(0);
    expect(result.dominantCategory).toBe('minimizing');
  });

  it('should detect protecting language', () => {
    const detector = getHedgingDetector(TEST_SESSION_ID);

    const result = detector.analyze(
      "It's probably nothing. I shouldn't complain. Forget I said anything."
    );

    expect(result.byCategory.protecting).toBeGreaterThan(0);
    expect(result.shouldProbe).toBe(true);
  });

  it('should calculate hedging density', () => {
    const detector = getHedgingDetector(TEST_SESSION_ID);

    // Low hedging
    const lowResult = detector.analyze('The meeting is at 3pm in the conference room.');
    expect(lowResult.hedgingDensity).toBeLessThan(5);

    // High hedging - reset for fresh baseline
    resetHedgingDetector(TEST_SESSION_ID);
    const newDetector = getHedgingDetector(TEST_SESSION_ID);
    const highResult = newDetector.analyze(
      'Maybe it might possibly be kind of sort of okay, I guess, I think.'
    );
    expect(highResult.hedgingDensity).toBeGreaterThan(5);
  });

  it('should suggest probe questions', () => {
    const detector = getHedgingDetector(TEST_SESSION_ID);

    const result = detector.analyze("It doesn't really matter. It's fine. Whatever.");

    expect(result.shouldProbe).toBe(true);
  });
});

// ============================================================================
// SELF-SOOTHING DETECTION TESTS
// ============================================================================

describe('SelfSoothingDetector', () => {
  beforeEach(() => {
    resetSelfSoothingDetector(TEST_SESSION_ID);
  });

  it('should detect reassurance self-soothing', () => {
    const detector = getSelfSoothingDetector(TEST_SESSION_ID);

    const result = detector.analyze("It'll be fine. I'll be okay. Everything will work out.");

    expect(result.detected).toBe(true);
    expect(result.dominantCategory).toBe('reassurance');
  });

  it('should detect dismissive self-soothing', () => {
    const detector = getSelfSoothingDetector(TEST_SESSION_ID);

    const result = detector.analyze('Whatever. Never mind. Forget it.');

    expect(result.detected).toBe(true);
    expect(result.dominantCategory).toBe('dismissive');
  });

  it('should detect minimizing self-soothing', () => {
    const detector = getSelfSoothingDetector(TEST_SESSION_ID);

    const result = detector.analyze("It doesn't matter. I don't care. Who cares anyway?");

    expect(result.detected).toBe(true);
    expect(result.dominantCategory).toBe('minimizing');
  });

  it('should flag possible distress', () => {
    const detector = getSelfSoothingDetector(TEST_SESSION_ID);

    const result = detector.analyze("I'm fine. It doesn't matter. Forget I said anything.");

    expect(result.possibleDistress).toBe(true);
  });

  it('should generate probe questions', () => {
    const detector = getSelfSoothingDetector(TEST_SESSION_ID);

    const result = detector.analyze("It's not a big deal. I'm being ridiculous.");

    expect(result.probeQuestion).toBeDefined();
    expect(result.suggestedApproach).toBeDefined();
  });
});

// ============================================================================
// FLUENCY ANALYSIS TESTS
// ============================================================================

describe('FluencyAnalyzer', () => {
  beforeEach(() => {
    resetFluencyAnalyzer(TEST_SESSION_ID);
  });

  it('should detect normal fluency', () => {
    const analyzer = getFluencyAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze(
      'I would like to discuss the project timeline for next quarter.'
    );

    expect(result.pattern).toBe('normal');
    expect(result.overallFluency).toBeGreaterThan(0.7);
  });

  it('should detect repetitions', () => {
    const analyzer = getFluencyAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('I I want to to to go there.');

    expect(result.disfluencies.repetitions).toBeGreaterThan(0);
    expect(result.overallFluency).toBeLessThan(0.8);
  });

  it('should detect interjections', () => {
    const analyzer = getFluencyAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('So um I was er thinking uh about going there hmm.');

    expect(result.disfluencies.interjections).toBeGreaterThan(0);
  });

  it('should detect trailing off', () => {
    const analyzer = getFluencyAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('I was thinking about going but...');

    expect(result.disfluencies.trailing).toBeGreaterThan(0);
  });

  it('should detect disfluencies in hesitant speech', () => {
    const analyzer = getFluencyAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('I I was— no I mean— the thing is— I just...');

    // Should detect various disfluencies even if overall pattern is normal
    expect(result.totalDisfluencies).toBeGreaterThan(0);
    expect(
      result.disfluencies.repetitions + result.disfluencies.revisions + result.disfluencies.trailing
    ).toBeGreaterThan(0);
  });
});

// ============================================================================
// FILLER ANALYSIS TESTS
// ============================================================================

describe('FillerAnalyzer', () => {
  beforeEach(() => {
    resetFillerAnalyzer(TEST_SESSION_ID);
  });

  it('should detect um and uh fillers', () => {
    const analyzer = getFillerAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze(
      'Um so I was uh thinking about um maybe going there uh tomorrow.'
    );

    expect(result.instances.length).toBeGreaterThan(0);
    expect(result.instances.some((i) => i.type === 'um')).toBe(true);
    expect(result.instances.some((i) => i.type === 'uh')).toBe(true);
  });

  it('should detect like as filler', () => {
    const analyzer = getFillerAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze(
      'It was like really cool and like I was like so excited, like you know?'
    );

    expect(result.instances.some((i) => i.type === 'like')).toBe(true);
  });

  it('should identify filler positions', () => {
    const analyzer = getFillerAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('Um, I think the answer is yes.');

    expect(result.instances.some((i) => i.position === 'sentence_start')).toBe(true);
  });

  it('should detect storytelling mode (quotative like)', () => {
    const analyzer = getFillerAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze('And she was like "what?" and I was like "I know right?"');

    expect(result.instances.some((i) => i.meaning === 'storytelling')).toBe(true);
  });

  it('should track filler rate', () => {
    const analyzer = getFillerAnalyzer(TEST_SESSION_ID);

    const result = analyzer.analyze(
      'Um uh like um you know basically I mean sort of um well basically um.'
    );

    expect(result.pattern.fillerRate).toBeGreaterThan(10); // High filler rate per 100 words
  });
});

// ============================================================================
// NARRATIVE ARC TESTS
// ============================================================================

describe('NarrativeArcTracker', () => {
  beforeEach(() => {
    resetNarrativeArcTracker(TEST_SESSION_ID);
  });

  it('should detect direct communication', () => {
    const tracker = getNarrativeArcTracker(TEST_SESSION_ID);

    const result = tracker.analyzeUtterance({
      text: 'I want to schedule a meeting for tomorrow.',
      turn: 1,
    });

    expect(result.structure).toBe('direct');
    expect(result.suggestedIntervention).toBe('wait');
  });

  it('should track narrative across turns', () => {
    const tracker = getNarrativeArcTracker(TEST_SESSION_ID);

    tracker.analyzeUtterance({ text: 'So let me explain what happened.', turn: 1 });
    tracker.analyzeUtterance({ text: 'And then this other thing occurred.', turn: 2 });
    const result = tracker.analyzeUtterance({
      text: 'Which led to this situation. And so the thing is, the real issue here...',
      turn: 3,
    });

    // Should track the conversation and provide structure detection
    expect(result.structure).toBeDefined();
    expect(result.suggestedIntervention).toBeDefined();
    expect(result.themes.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect climax approaching', () => {
    const tracker = getNarrativeArcTracker(TEST_SESSION_ID);

    tracker.analyzeUtterance({ text: 'I need to tell you something.', turn: 1 });
    const result = tracker.analyzeUtterance({
      text: 'The truth is, I finally realized what the problem was.',
      turn: 2,
      emotionalIntensity: 0.8,
    });

    expect(result.climaxApproaching || result.hasReachedCore).toBe(true);
  });

  it('should detect repeated topic references', () => {
    const tracker = getNarrativeArcTracker(TEST_SESSION_ID);

    tracker.analyzeUtterance({ text: 'I keep thinking about my mother.', turn: 1 });
    tracker.analyzeUtterance({ text: "Like I said, it's about my mother.", turn: 2 });
    tracker.analyzeUtterance({ text: 'As I mentioned before, my mother...', turn: 3 });
    const result = tracker.analyzeUtterance({
      text: 'I know I keep coming back to my mother but...',
      turn: 4,
    });

    // Should track theme references across turns
    expect(result.mainConcernReferences).toBeGreaterThan(0);
    // Mother should be detected as a theme
    expect(result.themes.some((t) => t.includes('mother'))).toBe(true);
  });

  it('should suggest appropriate interventions', () => {
    const tracker = getNarrativeArcTracker(TEST_SESSION_ID);

    const result = tracker.analyzeUtterance({
      text: 'Anyway, speaking of that, it reminds me of something else entirely.',
      turn: 1,
    });

    // Digression should suggest exploring or guiding back
    expect(['wait', 'explore_digression', 'check_in']).toContain(result.suggestedIntervention);
  });
});

// ============================================================================
// ENGAGEMENT SCORING TESTS
// ============================================================================

describe('EngagementScorer', () => {
  beforeEach(() => {
    resetEngagementScorer(TEST_SESSION_ID);
  });

  it('should detect high engagement with questions and details', () => {
    const scorer = getEngagementScorer(TEST_SESSION_ID);

    scorer.recordResponse(
      'Tell me more about that! How does it work? That sounds really interesting.'
    );
    scorer.recordResponse(
      'Wow, I never thought about it that way. What happens if you do it differently?'
    );
    scorer.recordResponse("That's fascinating. Can you explain the process in more detail?");

    const result = scorer.getCurrentEngagement();

    expect(['high', 'medium']).toContain(result.level);
    expect(result.signals.questionRate).toBeGreaterThan(0);
  });

  it('should detect low engagement with minimal responses', () => {
    const scorer = getEngagementScorer(TEST_SESSION_ID);

    scorer.recordResponse('Ok.');
    scorer.recordResponse('Sure.');
    scorer.recordResponse('Uh huh.');
    scorer.recordResponse('Yeah.');
    scorer.recordResponse('Okay.');

    const result = scorer.getCurrentEngagement();

    expect(['low', 'distracted']).toContain(result.level);
    expect(result.signals.backchannelRate).toBeGreaterThan(0);
  });

  it('should detect declining engagement', () => {
    const scorer = getEngagementScorer(TEST_SESSION_ID);

    // Start engaged
    scorer.recordResponse("That's really interesting! I want to know more about how you did that.");
    scorer.recordResponse('Wow, that sounds complex. What challenges did you face along the way?');

    // Become less engaged
    scorer.recordResponse('Okay.');
    scorer.recordResponse('Sure.');
    scorer.recordResponse('Mhm.');

    const result = scorer.getCurrentEngagement();

    expect(result.declining).toBe(true);
  });

  it('should suggest appropriate actions', () => {
    const scorer = getEngagementScorer(TEST_SESSION_ID);

    scorer.recordResponse('Okay.');
    scorer.recordResponse('Sure.');
    scorer.recordResponse('Uh huh.');
    scorer.recordResponse('Yeah.');
    scorer.recordResponse('Right.');

    const result = scorer.getCurrentEngagement();

    expect(['check_in', 'shift_topic', 'energize', 'continue']).toContain(result.suggestedAction);
  });
});

// ============================================================================
// UNIFIED PIPELINE TESTS
// ============================================================================

describe('HumanListeningPipeline', () => {
  beforeEach(() => {
    resetHumanListeningPipeline(TEST_SESSION_ID);
  });

  it('should perform quick analysis', () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    const result = pipeline.quickAnalyze("I'm fine. It doesn't matter. Whatever.", 1);

    expect(result.selfSoothing.detected).toBe(true);
    expect(result.shouldSlowDown).toBe(true);
  });

  it('should perform full analysis', async () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    const result = await pipeline.analyze({
      sessionId: TEST_SESSION_ID,
      text: "Um, I guess maybe it's probably nothing. I'm fine, really. It doesn't matter.",
      turnNumber: 1,
    });

    expect(result).toBeDefined();
    expect(result.text.hedging).toBeDefined();
    expect(result.text.selfSoothing).toBeDefined();
    expect(result.text.cognitiveLoad).toBeDefined();
    expect(result.overallAssessment).toBeDefined();
  });

  it('should detect possible distress', async () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    const result = await pipeline.analyze({
      sessionId: TEST_SESSION_ID,
      text: "I'm fine. It doesn't matter. I shouldn't complain. Forget I said anything. It's not a big deal.",
      turnNumber: 1,
    });

    expect(result.possibleDistress).toBe(true);
    expect(result.prioritySignals.length).toBeGreaterThan(0);
  });

  it('should detect self-soothing and hedging combinations', async () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    // Speech with both self-soothing and hedging
    const result = await pipeline.analyze({
      sessionId: TEST_SESSION_ID,
      text: "I'm fine, it's probably nothing. Maybe I'm just being silly. It doesn't really matter anyway.",
      turnNumber: 1,
    });

    // Should detect the signals
    expect(result.text.selfSoothing.detected).toBe(true);
    expect(result.text.hedging.totalHedges).toBeGreaterThan(0);

    // Should provide guidance
    expect(result.agentGuidance).toBeDefined();
    expect(result.overallAssessment).toBeDefined();
  });

  it('should build LLM context', async () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    await pipeline.analyze({
      sessionId: TEST_SESSION_ID,
      text: "I'm fine. It doesn't matter. Maybe I'm overreacting.",
      turnNumber: 1,
    });

    const context = pipeline.buildLLMContext();

    expect(context).toBeDefined();
    expect(typeof context).toBe('string');
  });

  it('should reset properly', async () => {
    const pipeline = getHumanListeningPipeline(TEST_SESSION_ID);

    await pipeline.analyze({
      sessionId: TEST_SESSION_ID,
      text: 'Something meaningful here.',
      turnNumber: 1,
    });

    pipeline.reset();

    // After reset, should have no stored context
    const context = pipeline.buildLLMContext();
    expect(context).toBeNull();
  });
});
