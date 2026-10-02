/**
 * Caller Memory Wiring
 *
 * Wires everything Ferni remembers about a signed-in caller onto a persona
 * agent's session: memory recall notes, how they asked to be talked to,
 * their words for the people in their life, their plans, the dates that
 * matter to them, and what made them laugh.
 *
 * Extracted from agent-setup.ts; behavior is unchanged. The caller checks
 * that there is a real user and that recall is enabled (memoryRecallMode).
 *
 * @module agents/multi-agent/caller-memory-wiring
 */

import { humorCue } from '../../conversation/humor-fit.js';
import type { TheirWords } from '../../conversation/their-words.js';
import type { UserData } from '../shared/types.js';
import { saveCommitment, wireCommitmentRecorder } from './commitment-recorder.js';
import {
  addRecallNote,
  createMemoryRecall,
  loadHumorHistory,
  saveCallbackOutcome,
  saveClosedFollowUp,
  saveHumorIncrement,
  saveSharedLaugh,
  saveToldStory,
  type RecallAgent,
} from './memory-recall-hook.js';
import {
  createSharedLaughRecorder,
  humorIncrement,
  wireSharedLaughRecorder,
} from './shared-laugh-recorder.js';
import {
  createSignificantDatesRecorder,
  loadSignificantDates,
  saveSignificantDate,
  wireSignificantDatesRecorder,
} from './significant-dates-recorder.js';
import {
  createTalkPreferenceRecorder,
  loadTalkPreferences,
  removeTalkPreference,
  saveTalkPreference,
  wireTalkPreferenceRecorder,
} from './talk-preference-recorder.js';
import {
  applyStoredWords,
  loadTheirWords,
  saveTheirWords,
  wireTheirWordsRecorder,
} from './their-words-recorder.js';

/** The slice of the AgentSession this needs. */
export interface CallerMemorySession {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface CallerMemoryDeps {
  session: CallerMemorySession;
  agent: RecallAgent;
  userId: string;
  userData: UserData;
  personaId: string;
}

/**
 * Wire the caller's memory onto the session. Returns the cleanup functions,
 * in the order they should be added to the agent's cleanup list.
 */
export function wireCallerMemory(deps: CallerMemoryDeps): Array<() => void> {
  const { session: sessionWithEvents, agent, userId, userData } = deps;
  const cleanupFunctions: Array<() => void> = [];
  if (!sessionWithEvents.on) return cleanupFunctions;

  const recall = createMemoryRecall({
    userId,
    userName: userData.userName,
    timezone: userData.timezone,
    closeFollowUp: (followUp) => void saveClosedFollowUp(userId, followUp),
    personaId: deps.personaId,
    saveStory: (story) => void saveToldStory(userId, story),
  });
  // The greeting can open with the newest open thread, and knows how the
  // last call felt (orchestrator.ts)
  userData.openingFacts = () => recall.openingFacts();
  const onRecallTranscript = (event: unknown) => {
    const evt = event as { transcript?: string };
    if (!evt.transcript) return;
    const note = recall.noteFor(evt.transcript);
    if (note) addRecallNote(agent, note);
  };
  const onRecallAgentState = (event: unknown) => {
    if ((event as { newState?: string }).newState === 'speaking') recall.newTurn();
  };
  // Ferni's committed replies: a follow-up it raised is closed for good
  const onRecallItem = (event: unknown) => {
    const item = (event as { item?: { role?: string; textContent?: string } }).item;
    if (item?.role === 'assistant' && item.textContent) recall.agentSaid(item.textContent);
  };
  sessionWithEvents.on('user_input_transcribed', onRecallTranscript);
  sessionWithEvents.on('agent_state_changed', onRecallAgentState);
  sessionWithEvents.on('conversation_item_added', onRecallItem);
  cleanupFunctions.push(() => {
    sessionWithEvents.off?.('user_input_transcribed', onRecallTranscript);
    sessionWithEvents.off?.('agent_state_changed', onRecallAgentState);
    sessionWithEvents.off?.('conversation_item_added', onRecallItem);
  });

  // Keep to how they have asked to be talked to, this call and (when
  // lasting) every later one (conversation/talk-preferences.ts)
  const talkRecorder = createTalkPreferenceRecorder({
    userData,
    saveLasting: (preference) => void saveTalkPreference(userId, preference),
    removeLasting: (preference) => void removeTalkPreference(userId, preference),
  });
  void loadTalkPreferences(userId).then((stored) => talkRecorder.loaded(stored));
  cleanupFunctions.push(wireTalkPreferenceRecorder(sessionWithEvents, talkRecorder));

  // Their words for the people in their life ("my person", "Nana"),
  // used back to them (conversation/their-words.ts)
  const wordsHolder = userData as unknown as { theirWords?: TheirWords };
  cleanupFunctions.push(
    wireTheirWordsRecorder(
      sessionWithEvents,
      wordsHolder,
      (words) => void saveTheirWords(userId, words)
    )
  );
  void loadTheirWords(userId).then((stored) => applyStoredWords(wordsHolder, stored));

  // What they said they would do ("call my mom this weekend"): asked
  // about on a later call, once (memory/recall/commitments.ts)
  cleanupFunctions.push(
    wireCommitmentRecorder(sessionWithEvents, (plan) => void saveCommitment(userId, plan))
  );

  // Birthdays, anniversaries, the day they lost someone: saved when
  // mentioned; near one, the greeting and replies know (significant-dates.ts)
  const datesRecorder = createSignificantDatesRecorder({
    userData,
    save: (date) => void saveSignificantDate(userId, date),
  });
  userData.daysThatMatterReady = loadSignificantDates(userId).then((dates) =>
    datesRecorder.loaded(dates)
  );
  cleanupFunctions.push(wireSignificantDatesRecorder(sessionWithEvents, datesRecorder));

  // Remember what made them laugh, for a callback on a later call.
  const laughRecorder = createSharedLaughRecorder({
    userData: userData as unknown as Record<string, unknown>,
    save: (laugh) => saveSharedLaugh(userId, laugh),
    takeOfferedCallback: () => recall.takeOfferedCallback(),
    onCallbackOutcome: (laugh, landed) => void saveCallbackOutcome(userId, laugh, landed),
  });
  cleanupFunctions.push(wireSharedLaughRecorder(sessionWithEvents, laughRecorder));

  // How much playfulness this caller welcomes, from laughs across calls
  // (conversation/humor-fit.ts). The call counts once per session, even
  // when a handoff runs this cleanup more than once.
  void loadHumorHistory(userId).then((history) => {
    userData.humorCue = humorCue(history);
  });
  let laughsSaved = 0;
  cleanupFunctions.push(() => {
    const inc = humorIncrement(laughRecorder.tally(), {
      call: userData.humorCallCounted === true,
      laughs: laughsSaved,
    });
    if (!inc) return;
    if (inc.calls > 0) userData.humorCallCounted = true;
    laughsSaved += inc.laughs;
    void saveHumorIncrement(userId, inc);
  });

  return cleanupFunctions;
}
