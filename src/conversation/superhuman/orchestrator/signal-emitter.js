/**
 * Superhuman Orchestrator Signal Emitter
 *
 * Emits signals to frontend for avatar EQ.
 *
 * @module @ferni/superhuman/orchestrator/signal-emitter
 */
import { humanizationSignalEmitter } from '../../../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../../../utils/safe-logger.js';
const logger = createLogger({ module: 'BetterThanHuman' });
/**
 * Emit signals to frontend for avatar EQ response
 */
export function emitSignals(insight) {
    const actions = insight.prioritizedActions.slice(0, 3);
    for (const action of actions) {
        try {
            emitActionSignal(action, insight);
        }
        catch (err) {
            logger.warn({ error: err, actionType: action.type }, 'Failed to emit signal');
        }
    }
    // Always emit emotional bond state if bond is strong
    if (insight.emotionalBond.warmth > 0.7) {
        void humanizationSignalEmitter.emotionalBondDeepen('warmth', insight.emotionalBond.warmth);
    }
}
function emitActionSignal(action, insight) {
    switch (action.type) {
        case 'protection':
            void humanizationSignalEmitter.protectiveInstinct(action.reason, action.priority);
            break;
        case 'spontaneous_delight':
            void humanizationSignalEmitter.spontaneousDelight(action.reason, action.priority);
            break;
        case 'bond_phrase': {
            const bondMatch = action.reason.match(/Bond phrase: (\w+)/);
            if (bondMatch) {
                void humanizationSignalEmitter.emotionalBondDeepen(bondMatch[1], insight.emotionalBond.warmth);
            }
            break;
        }
        case 'inside_joke':
            void humanizationSignalEmitter.insideJokeCallback(insight.jokeCallback?.joke?.phase || 'established', action.content);
            break;
        case 'superhuman_observation':
            void humanizationSignalEmitter.superhumanObservation(insight.observation?.observation?.type || 'behavioral', action.content);
            break;
        case 'visible_vulnerability':
            void humanizationSignalEmitter.visibleVulnerability(action.reason, action.priority);
            break;
        case 'temporal_insight':
            void humanizationSignalEmitter.temporalInsight(action.content, action.priority);
            break;
        case 'meta_relationship':
            void humanizationSignalEmitter.metaRelationshipMoment(action.reason, action.priority);
            break;
        case 'somatic':
            void humanizationSignalEmitter.somaticPresence(action.reason, action.priority);
            break;
        case 'anticipation':
            void humanizationSignalEmitter.anticipatoryPresence(action.priority);
            break;
    }
}
//# sourceMappingURL=signal-emitter.js.map