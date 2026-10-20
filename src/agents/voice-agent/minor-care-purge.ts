/**
 * MINOR_CARE: at the end of a held call (a caller under 18 by their own words, not a verified
 * owner), drop every per-user in-memory store that could otherwise be written later: after the
 * hold lapses (6 h idle) or by another session for the same user. Each store also refuses or
 * drops a held user's data at write time; this is the end-of-call sweep for the ones that keep
 * learning in memory (the predictive models, music learning) and a backstop for the rest.
 *
 * @module agents/voice-agent/minor-care-purge
 */
import { clearHeldMarkovUser as clearMarkov } from '../../intelligence/predictive/markov-sequence-predictor.js';
import { clearHeldTimeSeriesUser as clearTimeSeries } from '../../intelligence/predictive/time-series-forecaster.js';
import { clearHeldReinforcementUser as clearReinforcement } from '../../intelligence/predictive/reinforcement-learner.js';
import { purgeMusicLearning } from '../../audio/music-learning-persistence.js';
import { purgeGameMemory } from '../../services/games/game-store.js';
import { purgeUnifiedUser } from '../../services/trust-systems/unified-persistence.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'minor-care-purge' });

/** Drop everything the per-user stores hold for this user. Never throws. */
export function purgeHeldUser(userId: string): void {
  const purges: Array<[string, (userId: string) => void]> = [
    ['unified trust', purgeUnifiedUser],
    ['game memory', purgeGameMemory],
    ['music learning', purgeMusicLearning],
    ['markov model', clearMarkov],
    ['time-series model', clearTimeSeries],
    ['reinforcement model', clearReinforcement],
  ];
  for (const [name, purge] of purges) {
    try {
      purge(userId);
    } catch (error) {
      log.warn({ store: name, error: String(error) }, 'MINOR_CARE purge failed for one store');
    }
  }
}
