/**
 * Per-turn observers installed on a live call's AgentSession: pace matching,
 * per-turn tool retrieval and the director's notes. Each returns what the
 * session's transcript handler feeds it.
 *
 * @module agents/multi-agent/turn-observers
 */
import { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import type { TurnToolRetrieval } from '../../tools/retrieval/turn-tool-retrieval.js';
import type { PersonaId } from '../../personas/types.js';
import { assistantTranscriptHandler } from './assistant-transcript.js';

const log = getLogger();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = voice.AgentSession<any>;
type Cleanup = Array<() => void>;

/**
 * Pace matching: a turn's words over its speaking time, recorded when the next
 * turn starts (final transcripts can land after the stop).
 */
export async function installPaceMatching(
  session: Session,
  sessionId: string,
  cleanupFunctions: Cleanup
): Promise<{ onFinalTranscript(text: string): void }> {
  const { getPaceMatcher, clearPaceMatcher } =
    await import('../../speech/output-control/pace-matching.js');
  const paceWords: string[] = [];
  let paceStartedAt = 0;
  let paceStoppedAt = 0;
  const paceStateHandler = (ev: unknown): void => {
    const state = (ev as { newState?: string }).newState;
    if (state === 'listening' && paceStartedAt) paceStoppedAt = Date.now();
    if (state !== 'speaking') return;
    if (paceStartedAt && paceStoppedAt > paceStartedAt && paceWords.length) {
      const pace = getPaceMatcher(sessionId);
      pace.recordTurn(paceWords.join(' '), paceStoppedAt - paceStartedAt);
      log.info({ sessionId, userWpm: pace.userWpm, speed: pace.speed() }, 'pace');
    }
    paceWords.length = 0;
    paceStartedAt = Date.now();
    paceStoppedAt = 0;
  };
  session.on(voice.AgentSessionEventTypes.UserStateChanged, paceStateHandler);
  cleanupFunctions.push(() => {
    session.off(voice.AgentSessionEventTypes.UserStateChanged, paceStateHandler);
    clearPaceMatcher(sessionId);
  });
  return { onFinalTranscript: (text) => void paceWords.push(text) };
}

export interface ToolRetrievalInput {
  session: Session;
  sessionId: string;
  agent: unknown;
  dynamicToolLoader: {
    loadAllDomains(): Promise<number>;
    getCurrentTools(): Record<string, unknown>;
  };
  cleanupFunctions: Cleanup;
}

/**
 * Per-turn tool retrieval (TOOL_RETRIEVAL=shadow|live): embed the user's words
 * while they talk, so the pick is ready at end of turn. The turn's text is its
 * finals so far plus the current interim: Ink finalizes a segment at every
 * pause, and the model sees the whole turn. Null when retrieval is off.
 */
export async function installToolRetrieval(
  input: ToolRetrievalInput
): Promise<{ onTranscript(transcript: string, isFinal: boolean): void } | null> {
  const { session, sessionId, agent, dynamicToolLoader, cleanupFunctions } = input;
  const { toolRetrievalMode, TurnToolRetrieval, setTurnToolRetrieval } =
    await import('../../tools/retrieval/turn-tool-retrieval.js');
  if (toolRetrievalMode() === 'off') return null;

  const { createVertexEmbedder, getSharedToolIndex, loadIntentManual } =
    await import('../../tools/retrieval/dense-index.js');
  const embedder = createVertexEmbedder();
  const manual = loadIntentManual();
  const retrieval: TurnToolRetrieval = new TurnToolRetrieval({
    sessionId,
    embedder,
    index: () => getSharedToolIndex(embedder),
    domainOf: (tool) => manual.tools[tool]?.domain,
  });
  const turnFinals: string[] = [];
  void getSharedToolIndex(embedder).catch((error: unknown) =>
    log.warn({ error: String(error) }, 'tool index warm-up failed')
  );
  setTurnToolRetrieval(session, retrieval);
  const toolsExecutedHandler = (ev: unknown): void => {
    const calls = (ev as { functionCalls?: Array<{ name?: string }> }).functionCalls ?? [];
    retrieval.onToolsExecuted(calls.map((c) => c.name ?? '').filter(Boolean));
  };
  const retrievalTurnHandler = (ev: unknown): void => {
    if ((ev as { newState?: string }).newState !== 'speaking') return;
    retrieval.newTurn();
    turnFinals.length = 0;
  };
  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, toolsExecutedHandler);
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, retrievalTurnHandler);
  cleanupFunctions.push(() => {
    session.off(voice.AgentSessionEventTypes.FunctionToolsExecuted, toolsExecutedHandler);
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, retrievalTurnHandler);
    setTurnToolRetrieval(session, null);
  });
  log.info({ sessionId, mode: toolRetrievalMode() }, 'tool retrieval on');
  // Live tool retrieval can only send tools the agent has, so load the whole
  // catalog in the background (the first call in a process also imports every
  // domain, ~2 s) and hand it over once a reply has started, so the change
  // can't void LiveKit's preemptive reply.
  if (toolRetrievalMode() === 'live') {
    const catalogStarted = Date.now();
    void dynamicToolLoader
      .loadAllDomains()
      .then(async (domains) => {
        const { updateAgentTools, applyAfterReplyStarts } = await import('../shared/tool-updater.js');
        const tools = dynamicToolLoader.getCurrentTools();
        log.info(
          { sessionId, domains, tools: Object.keys(tools).length, ms: Date.now() - catalogStarted },
          'TOOL_CATALOG_LOADED'
        );
        applyAfterReplyStarts(session as never, async () => {
          await updateAgentTools(agent as never, tools as never, { silentMerge: true });
        });
      })
      .catch((error: unknown) =>
        log.warn({ sessionId, error: String(error) }, 'tool catalog load failed')
      );
  }
  return {
    onTranscript(transcript, isFinal) {
      const turnText = [...turnFinals, transcript].join(' ');
      if (isFinal) turnFinals.push(transcript);
      retrieval.onTranscript(turnText, isFinal);
    },
  };
}

export interface DirectorNotesInput {
  session: Session;
  sessionId: string;
  userName: string | undefined;
  agent: { chatCtx: { items: unknown[] } };
  cleanupFunctions: Cleanup;
}

/** The director (DIRECTOR_NOTES=on): after each reply, notes that nudge the next one. */
export async function installDirectorNotes(input: DirectorNotesInput): Promise<void> {
  const { session, sessionId, userName, agent, cleanupFunctions } = input;
  const { directorNotesEnabled, Director, setDirector, linesFromChat } =
    await import('../personas/director-notes.js');
  if (!directorNotesEnabled()) return;
  const director = new Director({ sessionId, userName });
  setDirector(session, director);
  let spoke = false;
  const directorHandler = (ev: unknown): void => {
    const state = (ev as { newState?: string }).newState;
    if (state === 'speaking') spoke = true;
    if (state !== 'listening' || !spoke) return;
    spoke = false;
    void director.observe(linesFromChat(agent.chatCtx.items as never));
  };
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, directorHandler);
  cleanupFunctions.push(() => {
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, directorHandler);
    setDirector(session, null);
  });
  log.info({ sessionId }, 'director notes on');
}

/** Record Ferni's side of the conversation to the thread (user turns are recorded elsewhere). */
export function recordAssistantTurns(
  session: Session,
  sessionId: string,
  personaId: string,
  userData: unknown,
  cleanupFunctions: Cleanup
): void {
  const assistantHandler = assistantTranscriptHandler(
    () => {
      const ud = userData as { userId?: string; personaId?: string; threadId?: string };
      return {
        userId: ud.userId,
        sessionId,
        personaId: ud.personaId ?? personaId,
        threadId: ud.threadId,
      };
    },
    async (o) => {
      const { recordAgentMessage } =
        await import('../../services/conversation-thread/thread-recorder.js');
      await recordAgentMessage({ ...o, personaId: o.personaId as PersonaId });
    }
  );
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, assistantHandler);
  cleanupFunctions.push(() => {
    session.off?.(voice.AgentSessionEventTypes.ConversationItemAdded, assistantHandler);
  });
}
