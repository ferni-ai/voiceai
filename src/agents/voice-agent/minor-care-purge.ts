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
import { forgetLoadedUser } from '../../intelligence/predictive/persistence.js';
import { getEngagementStore } from '../../services/engagement/engagement-store.js';
import { clearUserThinking } from '../../services/trust-systems/between-session-thinking.js';
import { clearAllUserTextures } from '../../services/trust-systems/conversation-texture.js';
import { clearUserMentions } from '../../services/trust-systems/curiosity-memory.js';
import { clearAllUserGrowth } from '../../services/trust-systems/persona-growth.js';
import { clearTonalProfile } from '../../services/trust-systems/tonal-memory.js';
import { ownerSessionFor, sharedId } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'minor-care-purge' });

/** The engagement store loads lazily; a failure is logged like any other store's. */
const forgetEngagement = (userId: string) =>
  getEngagementStore()
    .then((store) => store.forgetUser(userId))
    .catch((error: unknown) =>
      log.warn({ error: String(error) }, 'MINOR_CARE purge failed: engagement')
    );

/**
 * Drop everything the per-user stores hold for this user, and their loaded markers, so the next
 * write reloads from storage first. Never a placeholder or shared id (one bucket for many people).
 * A live verified owner session for the same user is purged too: it reloads before its next write,
 * so it loses at most unsaved in-memory updates, never stored data. Never throws.
 */
export function purgeHeldUser(userId: string): void {
  if (sharedId(userId)) return log.warn('MINOR_CARE purge skipped: a shared or placeholder id');
  const ownerSession = ownerSessionFor(userId);
  if (ownerSession)
    log.info({ ownerSession }, 'MINOR_CARE purged while an owner session was live; it will reload');
  const purges: Array<[string, (userId: string) => void]> = [
    ['unified trust', purgeUnifiedUser],
    ['game memory', purgeGameMemory],
    ['music learning', purgeMusicLearning],
    ['markov model', clearMarkov],
    ['time-series model', clearTimeSeries],
    ['reinforcement model', clearReinforcement],
    ['predictive loaded markers', forgetLoadedUser],
    // The trust systems session cleanup saves through saveSystemData: their per-user maps
    ['between-session thinking', clearUserThinking],
    ['tonal memory', clearTonalProfile],
    ['curiosity memory', clearUserMentions],
    ['persona growth', clearAllUserGrowth],
    ['conversation texture', clearAllUserTextures],
    ['engagement profile cache', (u) => void forgetEngagement(u)],
  ];
  for (const [name, purge] of purges) {
    try {
      purge(userId);
    } catch (error) {
      log.warn({ store: name, error: String(error) }, 'MINOR_CARE purge failed for one store');
    }
  }
}
