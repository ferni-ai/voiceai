/**
 * Human Listening Pipeline
 *
 * Main pipeline class that orchestrates all human-like listening capabilities.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { analyzeAudio, analyzeConversation, analyzeText, resetAllAnalyzers } from './analyzers.js';
import {
  calculateOverallConfidence,
  calculateSsmlSuggestions,
  determinePossibleDistress,
  determineShouldGiveSpace,
  determineShouldSlowDown,
  generateAgentGuidance,
  generateOverallAssessment,
  identifyPrioritySignals,
  synthesizeEmotionalUndercurrent,
} from './synthesis.js';
import type { HumanListeningContext, HumanListeningResult, QuickAnalysisResult } from './types.js';

// Text-based analyzers for quick analyze and LLM context
import { getEngagementScorer } from '../../conversation/engagement-scoring.js';
import { getCognitiveLoadDetector } from '../../intelligence/detectors/cognitive-load.js';
import { getHedgingDetector } from '../../intelligence/detectors/hedging.js';
import { getSelfSoothingDetector } from '../../intelligence/detectors/self-soothing.js';

const log = getLogger().child({ module: 'HumanListeningPipeline' });

// ============================================================================
// HUMAN LISTENING PIPELINE
// ============================================================================

/**
 * Unified pipeline that integrates all human-like listening capabilities
 */
export class HumanListeningPipeline {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    log.debug({ sessionId }, '🎧 Human Listening Pipeline initialized');
  }

  /**
   * Process a complete turn through all analyzers
   */
  async analyze(context: HumanListeningContext): Promise<HumanListeningResult> {
    const startTime = Date.now();

    // Run all analyses in parallel
    const [audio, text, conversation] = await Promise.all([
      analyzeAudio(this.sessionId, context),
      analyzeText(this.sessionId, context),
      analyzeConversation(this.sessionId, context),
    ]);

    // Synthesize emotional undercurrent
    const emotionalUndercurrent = synthesizeEmotionalUndercurrent(audio, text, conversation);

    // Generate overall assessment
    const overallAssessment = generateOverallAssessment(
      audio,
      text,
      conversation,
      emotionalUndercurrent
    );

    // Identify priority signals
    const prioritySignals = identifyPrioritySignals(audio, text, conversation);

    // Generate unified guidance
    const agentGuidance = generateAgentGuidance(audio, text, conversation, prioritySignals);

    // Determine response adjustments
    const shouldSlowDown = determineShouldSlowDown(audio, text, conversation);
    const shouldGiveSpace = determineShouldGiveSpace(audio, text, conversation);
    const possibleDistress = determinePossibleDistress(audio, text, conversation);

    // Calculate SSML suggestions
    const ssmlSuggestions = calculateSsmlSuggestions(audio, text, shouldSlowDown);

    // Overall confidence
    const confidence = calculateOverallConfidence(audio, text, conversation);

    const result: HumanListeningResult = {
      audio,
      text,
      conversation,
      emotionalUndercurrent,
      overallAssessment,
      prioritySignals,
      agentGuidance,
      shouldSlowDown,
      shouldGiveSpace,
      possibleDistress,
      ssmlSuggestions,
      confidence,
    };

    const elapsed = Date.now() - startTime;
    log.debug(
      {
        elapsed,
        prioritySignals: prioritySignals.length,
        shouldSlowDown,
        possibleDistress,
      },
      '🎧 Human listening analysis complete'
    );

    return result;
  }

  /**
   * Quick analysis for real-time use (text only, faster)
   * @param text - The user's transcript text
   * @param turnNumber - Current turn number (used for context-aware analysis)
   */
  quickAnalyze(text: string, turnNumber: number): QuickAnalysisResult {
    const cognitiveLoad = getCognitiveLoadDetector(this.sessionId).analyzeUtterance(
      text,
      turnNumber
    );
    const hedging = getHedgingDetector(this.sessionId).analyze(text);
    const selfSoothing = getSelfSoothingDetector(this.sessionId).analyze(text);

    const shouldSlowDown =
      cognitiveLoad.level === 'high' ||
      cognitiveLoad.level === 'overloaded' ||
      hedging.elevated ||
      selfSoothing.possibleDistress;

    return { cognitiveLoad, hedging, selfSoothing, shouldSlowDown };
  }

  /**
   * Build LLM context from most recent analysis
   */
  buildLLMContext(): string | null {
    const lines: string[] = [];

    // Get latest from each analyzer
    const cognitive = getCognitiveLoadDetector(this.sessionId).getCurrentState();
    const hedging = getHedgingDetector(this.sessionId).buildContextForPrompt();
    const selfSoothing = getSelfSoothingDetector(this.sessionId).buildContextForPrompt();
    const engagement = getEngagementScorer(this.sessionId).getCurrentEngagement();

    // Cognitive load
    if (cognitive.level !== 'low') {
      lines.push(`[COGNITIVE LOAD: ${cognitive.level.toUpperCase()}] ${cognitive.guidance}`);
    }

    // Hedging
    if (hedging) {
      lines.push(hedging);
    }

    // Self-soothing
    if (selfSoothing) {
      lines.push(selfSoothing);
    }

    // Engagement
    if (engagement.level === 'low' || engagement.level === 'distracted') {
      lines.push(`[ENGAGEMENT: ${engagement.level.toUpperCase()}] ${engagement.actionGuidance}`);
    }

    return lines.length > 0 ? lines.join('\n\n') : null;
  }

  /**
   * Reset all analyzers
   */
  reset(): void {
    resetAllAnalyzers(this.sessionId);
    log.debug({ sessionId: this.sessionId }, '🎧 Human Listening Pipeline reset');
  }
}

export default HumanListeningPipeline;
