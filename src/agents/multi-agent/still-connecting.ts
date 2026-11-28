/**
 * The live call's side of ON_BEHALF_JOIN_WAIT's wait line (tools/domains/telephony/
 * call-not-placed.ts): while a confirmed call is still being placed, the member hears
 * "Still connecting, one moment." once, through session.say like any scripted line.
 *
 * It stays quiet whenever the line could cut across something that matters more: a crisis
 * decision on the call, crisis risk on it or a crisis read in flight, or a crisis verdict
 * holding the reply; a reply paused for noise; the caller talking; the call closing. A call
 * whose session id it can't find is one it can't check, so it stays quiet there too. Logs
 * whether it spoke and why not, never any words.
 *
 * @module agents/multi-agent/still-connecting
 */
import { voice } from '@livekit/agents';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { setStillConnectingPort } from '../../tools/domains/telephony/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { isSessionClosing } from '../shared/session-closing-tracker.js';
import { replyPaused } from './resume-buffer.js';

const log = createLogger({ module: 'StillConnecting' });

type Quiet = 'no_session_id' | 'crisis' | 'paused' | 'caller_talking' | 'closing';

/** Why the line isn't said in this call now, or null. */
function quietFor(session: voice.AgentSession, sessionId: string | undefined): Quiet | null {
  if (sessionId === undefined) return 'no_session_id';
  const crisis = crisisDecidedOn(session) || crisisVerdictPending(session) !== null;
  if (crisis || crisisRiskThisCall(sessionId)) return 'crisis';
  if (replyPaused(session)) return 'paused';
  if (session.userState === 'speaking') return 'caller_talking';
  return isSessionClosing(sessionId) ? 'closing' : null;
}

/** Say `line` in the call whose run context `opts` carries, unless it should stay quiet. */
function sayStillConnecting(opts: unknown, sessionId: string | undefined, line: string): void {
  const run = (opts as { ctx?: unknown } | undefined)?.ctx;
  if (!(run instanceof voice.RunContext)) return;
  const quiet = quietFor(run.session, sessionId);
  log.info({ sessionId, spoken: quiet === null, quiet }, 'ON_BEHALF_STILL_CONNECTING');
  if (quiet) return;
  try {
    run.session.say(line, { allowInterruptions: true });
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'ON_BEHALF_STILL_CONNECTING: say failed');
  }
}

/** Every live call installs the speaker (live-call-behaviors.ts). */
export function installStillConnectingPort(): void {
  setStillConnectingPort(sayStillConnecting);
}
