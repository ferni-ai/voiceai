/**
 * The SemanticRouterResult for an intelligent-router RoutingDecision.
 *
 * @module tools/semantic-router/integration/intelligent-route-result
 */

import type { RoutingDecision } from '../advanced/intelligent/index.js';
import type { SemanticRouterResult } from '../types.js';

/**
 * Create SemanticRouterResult from RoutingDecision
 */
export function createRouteResultFromDecision(decision: RoutingDecision): SemanticRouterResult {
  const intentCategory = decision.rawResults.intentClassifier?.intent?.category || 'unknown';

  const matches: import('../types.js').ToolMatch[] = decision.toolId
    ? [
        {
          toolId: decision.toolId,
          confidence: decision.confidence,
          matchedBy: ['embedding'] as import('../types.js').MatchLayer[],
          layerScores: {
            pattern: 0,
            keyword: 0,
            embedding: decision.confidence,
            context: 0,
            history: 0,
            holistic: 0,
          },
          extractedArgs: decision.args,
          missingArgs: [],
          matchReason: `Intelligent routing via ${decision.decidedBy}`,
        },
      ]
    : [];

  // Build action based on decision
  let action: import('../types.js').RouterAction;

  if (decision.toolId && (decision.action === 'execute' || decision.action === 'plan')) {
    action = {
      type: 'execute',
      toolId: decision.toolId,
      args: decision.args,
      confidence: decision.confidence,
    };
  } else if (decision.toolId && decision.action === 'confirm') {
    action = {
      type: 'hint',
      toolId: decision.toolId,
      confidence: decision.confidence,
    };
  } else if (decision.action === 'clarify') {
    action = {
      type: 'clarify',
      question: decision.reasoning || 'Could you tell me more?',
      missingInfo: [],
    };
  } else {
    action = {
      type: 'conversation',
      reason: decision.reasoning || 'No tool matched',
    };
  }

  return {
    intent: {
      category: intentCategory as
        import('../types.js').ToolCategory | 'conversation' | 'clarification' | 'unknown',
      confidence: decision.confidence,
      mood: 'request',
      urgency: 'normal',
    },
    matches,
    action,
    extractedArgs: decision.args,
    metadata: {
      totalTimeMs: decision.timing.total,
      layerTimesMs: {
        pattern: decision.timing.intentClassifier || 0,
        keyword: 0,
        embedding: decision.timing.semanticRouter || 0,
        context: decision.timing.banditOptimizer || 0,
        history: 0,
        holistic: 0,
      },
      toolsConsidered: 0,
      inputText: '',
      normalizedText: '',
      contextUsed: [],
      routerVersion: '2.0.0-intelligent',
    },
  };
}
