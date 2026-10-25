/**
 * Installs the never-silent guard (never-silent.ts) on a live call's session.
 * NEVER_SILENT=on speaks the fallback, =shadow only logs it; off by default.
 *
 * @module agents/multi-agent/never-silent-install
 */
import { getDJController } from '../../audio/dj-controller.js';
import { getLogger } from '../../utils/safe-logger.js';
import { isSessionClosing } from '../shared/session-closing-tracker.js';
import { onToolCallRequested } from '../voice-agent/empty-response-watchdog.js';
import type { LiveCallBehaviorsInput } from './live-call-behaviors.js';
import { ensureResumeBuffer, replyPaused } from './resume-buffer.js';
import {
  createNeverSilentGuard,
  hangMs,
  neverSilentMode,
  type NeverSilentSession,
} from './never-silent.js';

const log = getLogger();

function musicPlaying(): boolean {
  try {
    return getDJController().isMusicActive();
  } catch {
    return false; // DJ controller not initialized: no music
  }
}

export function installNeverSilent(
  input: LiveCallBehaviorsInput,
  env: Record<string, string | undefined> = process.env
): void {
  const mode = neverSilentMode(env);
  if (mode === 'off') return;
  const { session, sessionEventHandlers, cleanupFunctions, sessionId } = input;
  const events = input.sessionWithEvents as {
    on: (event: string, handler: (ev: unknown) => void) => void;
  };
  const guard = createNeverSilentGuard({
    session: session as unknown as NeverSilentSession,
    mode,
    hangMs: hangMs(env),
    stayQuiet: () => isSessionClosing(sessionId) || musicPlaying(),
    replyPaused: () => replyPaused(session),
    // A rendering problem is not a fallback: keep NEVER_SILENT_FALLBACK a count of real ones.
    log: (fields) =>
      log.warn(
        { sessionId, ...fields },
        'prerenderRejected' in fields || 'prerenderFailed' in fields
          ? 'NEVER_SILENT_PRERENDER'
          : 'NEVER_SILENT_FALLBACK'
      ),
  });
  const handlers: Array<{ event: string; handler: (ev: unknown) => void }> = [
    { event: 'conversation_item_added', handler: guard.onItemAdded },
    { event: 'agent_state_changed', handler: guard.onAgentState },
    { event: 'user_state_changed', handler: guard.onUserState },
    { event: 'speech_created', handler: guard.onSpeechCreated },
    { event: 'function_tools_executed', handler: () => guard.onToolsExecuted() },
  ];
  // A reply paused for noise comes back whole (resume-buffer.ts). The room sets
  // its audio output at start, usually after this runs: wrap it then too.
  if (mode === 'on') {
    const wrap = () =>
      ensureResumeBuffer(
        session as never,
        (fields) => log.info({ sessionId, ...fields }, 'REPLY_RESUME'),
        env
      );
    wrap();
    for (const event of ['speech_created', 'agent_state_changed', 'user_state_changed'])
      handlers.push({ event, handler: wrap });
  }
  for (const { event, handler } of handlers) events.on(event, handler);
  sessionEventHandlers.push(...(handlers as typeof sessionEventHandlers));
  cleanupFunctions.push(onToolCallRequested(session, () => guard.onToolsRequested()));
  cleanupFunctions.push(() => guard.stop());
}
