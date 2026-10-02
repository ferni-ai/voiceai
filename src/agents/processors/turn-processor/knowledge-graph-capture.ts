/**
 * Turn Processor - Knowledge Graph Capture
 *
 * Fire-and-forget capture of each user turn into the knowledge graph
 * (entities, facts, relationships). Never blocks the turn.
 */

import type { TurnAnalysisResult } from '../types.js';
import { diag } from '../../../services/diagnostic-logger.js';
import { safeFireAndForget } from '../../../utils/safe-fire-and-forget.js';

/** Capture this turn into the knowledge graph in the background (no-op until capture is ready). */
export function captureTurnToKnowledgeGraph(
  userId: string,
  sessionId: string,
  turnNumber: number,
  userText: string,
  personaId: string | undefined,
  analysisResult: TurnAnalysisResult | undefined
): void {
  safeFireAndForget(
    async () => {
      try {
        const { captureTurn, isKnowledgeCaptureReady } =
          await import('../../../memory/knowledge-graph/index.js');

        if (!isKnowledgeCaptureReady()) return;

        const valenceToNumber = (v?: string): number | undefined => {
          if (!v) return undefined;
          if (v === 'positive') return 1;
          if (v === 'negative') return -1;
          return 0;
        };

        const captureResult = await captureTurn({
          userId,
          sessionId,
          turnNumber,
          transcript: userText,
          personaId,
          emotion: analysisResult?.analysis?.emotion
            ? {
                primary: analysisResult.analysis.emotion.primary,
                intensity: analysisResult.analysis.emotion.intensity,
                valence: valenceToNumber(analysisResult.analysis.emotion.valence),
              }
            : undefined,
          topic: analysisResult?.analysis?.topics?.detected?.[0],
          recentContext: undefined,
        });

        if (captureResult.entities.created > 0 || captureResult.entities.updated > 0) {
          diag.state('🧠 Knowledge graph updated', {
            entitiesCreated: captureResult.entities.created,
            entitiesUpdated: captureResult.entities.updated,
            factsCount: captureResult.facts.count,
            relationshipsCount: captureResult.relationships.count,
            timeMs: captureResult.metrics.totalTimeMs,
          });
        }
      } catch (error) {
        diag.debug('Knowledge graph capture failed (non-blocking)', { error: String(error) });
      }
    },
    { context: 'knowledge-graph-capture' }
  );
}
