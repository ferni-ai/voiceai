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
import {
  purgeMusicLearning,
  setMusicHeldWindow,
  withoutHeldMusicMemories,
} from '../../audio/music-learning-persistence.js';
import {
  forgetReadMoments,
  scrubHeldSharedMoments,
  setSharedMomentsHeldWindow,
} from '../../intelligence/context-builders/relationship/shared-moments.js';
import { purgeHeldIndexEntries } from '../../services/data-layer/held-index-purge.js';
import { purgeGameMemory } from '../../services/games/game-store.js';
import { purgeUnifiedUser } from '../../services/trust-systems/unified-persistence.js';
import { forgetLoadedUser } from '../../intelligence/predictive/persistence.js';
import { clearRelationshipEngine } from '../../intelligence/relationship/engine.js';
import { clearUserThinking } from '../../services/trust-systems/between-session-thinking.js';
import { clearUserMentions } from '../../services/trust-systems/curiosity-memory.js';
import { clearAllUserGrowth } from '../../services/trust-systems/persona-growth.js';
import { clearTonalProfile } from '../../services/trust-systems/tonal-memory.js';
import { clearSocialGraph } from '../../services/social-graph/index.js';
import { clearSemanticIntelligenceCache } from '../../services/superhuman/semantic-intelligence/index.js';
import { clearTrustSystemsUser } from '../../services/trust-systems/persistence.js';
import {
  noteHeldWindow,
  recordedWhileHeld,
  scrubHeldDoc,
} from '../../services/trust-systems/held-window.js';
import { scrubHeldStores } from '../../services/trust-systems/reload-before-save.js';
import { clearResonanceUser } from '../../personas/shared/personality-resonance-store.js';
import { clearArcCache } from '../../intelligence/context-builders/relationship/arc/storage.js';
import { clearDeepUnderstandingUser } from '../../intelligence/deep-understanding/forget-user.js';
import { clearOurSongsUser } from '../../services/trust-systems/index.js';
import { recordSharedHold } from '../../services/outreach/minor-care-shared-hold.js';
import { phoneHoldId } from '../../services/outreach/checkin-replies.js';
import {
  ownerSessionFor,
  sessionBoundAt,
  sessionPhone,
  setOnUserHeld,
  sharedId,
} from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'minor-care-purge' });

/**
 * MINOR_CARE_SHARED_HOLD: the shared record (no words) for the user, and for the caller's number
 * (keyed by its hash), since a text from that number resolves to whatever account the number
 * names, not the call's anon: or account id. A phone: id is its own number.
 */
export function shareHold(userId: string, sessionId?: string): void {
  void recordSharedHold(userId);
  const phone = (sessionId && sessionPhone(sessionId)) || userId.match(/^phone:(.+)$/)?.[1];
  const phoneId = phoneHoldId(phone);
  if (phoneId) void recordSharedHold(phoneId);
}
setOnUserHeld(shareHold);
setSharedMomentsHeldWindow(recordedWhileHeld); // shared moments made in a held window: never read
// Music memories made during a purged held call are dropped on every read and save, as the
// timer-flushed trust stores' are (held-window.ts holds the windows).
setMusicHeldWindow(recordedWhileHeld);

/**
 * Drop everything the per-user stores hold for this user, and their loaded markers, so the next
 * write reloads from storage first. Never a placeholder or shared id (one bucket for many people).
 * A live verified owner session for the same user is purged too: it reloads before its next write,
 * so it loses at most unsaved in-memory updates, never stored data. Never throws.
 *
 * What the timer-flushed stores (voice prosody, celebration momentum) already stored since the
 * held call began (`startedAt`, or when its session was bound to the user, whichever is earlier)
 * is the held caller's too: noted as a held window, dropped on every later read, and scrubbed from
 * the stored docs now (held-window.ts).
 */
export function purgeHeldUser(userId: string, sessionId?: string, startedAt?: number): void {
  if (sharedId(userId)) return log.warn('MINOR_CARE purge skipped: a shared or placeholder id');
  shareHold(userId, sessionId); // held for IDLE_MS from the call's end, in every process
  const since = Math.min(startedAt ?? Infinity, sessionBoundAt(sessionId) ?? Infinity);
  if (Number.isFinite(since)) noteHeldWindow(userId, since);
  else log.warn('MINOR_CARE purge: no session start, so stored entries were not scrubbed');
  const ownerSession = ownerSessionFor(userId);
  if (ownerSession)
    log.info({ ownerSession }, 'MINOR_CARE purged while an owner session was live; it will reload');
  const windowed = Number.isFinite(since); // a held window was noted for the scrubs below
  const purges: Array<[string, (userId: string) => void]> = [
    ['unified trust', purgeUnifiedUser],
    ['game memory', purgeGameMemory],
    ['music learning', purgeMusicLearning],
    ['markov model', clearMarkov],
    ['time-series model', clearTimeSeries],
    ['reinforcement model', clearReinforcement],
    ['predictive loaded markers', forgetLoadedUser],
    // recordMoment keeps the caller's phrases; endSession on a later call would save them
    ['relationship engines', (id) => clearRelationshipEngine(id)],
    // The caller's quotes, kept in memory and saved by a later call's cleanup when nothing
    // stored replaces them (a held caller's first calls have nothing stored)
    ['between-session thinking', clearUserThinking],
    ['curiosity memory', clearUserMentions],
    ['persona growth', clearAllUserGrowth],
    ['tonal memory', clearTonalProfile],
    ['social graph', clearSocialGraph],
    // threads, open loops, commitments…: buffered before the age statement, saved by a later call
    ['semantic intelligence', (id) => clearSemanticIntelligenceCache(id)],
    // boundaries, growth, inside jokes, small wins, life events…: saved by a later call's cleanup
    ['trust systems', clearTrustSystemsUser],
    // what voice prosody and momentum flushed before the age statement (held-window.ts)
    ['held-window scrub', (id) => void scrubHeldStores(id)],
    // music memories the 15 s timer stored before the age statement, and any caller's words
    [
      'music memory scrub',
      (id) => void scrubHeldDoc(id, 'music_learning', 'memories', withoutHeldMusicMemories),
    ],
    // topics they mentioned, buffered with a debounced save; a later call's cleanup flushes it
    ['personality resonance', clearResonanceUser],
    // the relationship arc (first words, key moments), cached 5 min and saved by a later call
    ['relationship arc', clearArcCache],
    // quotes, people, avoided topics: the builder feeds them every turn; a later call's end saves them
    ['deep understanding', clearDeepUnderstandingUser],
    // songs that played during their moments (memory only); a later call would speak them back
    ['our songs', clearOurSongsUser],
    // shared moments (what they said, kept as inside-joke origins) stored before the age statement
    ['shared moments scrub', (id) => void (windowed && scrubHeldSharedMoments(id, since))],
    ['shared moments read', forgetReadMoments], // deep-relationship's cache of them
    // what the stores indexed for semantic recall before the age statement (their words, too)
    [
      'semantic index scrub',
      (id) => void (windowed && purgeHeldIndexEntries(id, (at) => recordedWhileHeld(id, at))),
    ],
  ];
  for (const [name, purge] of purges) {
    try {
      purge(userId);
    } catch (error) {
      log.warn({ store: name, error: String(error) }, 'MINOR_CARE purge failed for one store');
    }
  }
}
