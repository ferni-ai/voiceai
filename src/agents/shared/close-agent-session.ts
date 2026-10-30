/**
 * Close a LiveKit AgentSession, waiting at most `timeoutMs`. Never throws.
 *
 * Nothing in @livekit/agents closes the session when the job ends, and prod
 * runs jobs in-process, so a session we don't close keeps its STT socket open
 * (and reconnecting) for the life of the pod. close() can block while the
 * session drains, hence the bound.
 */
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export const SESSION_CLOSE_TIMEOUT_MS = 3_000;

export async function closeAgentSession(
  session: { close(): Promise<void> } | null | undefined,
  context: Record<string, unknown>,
  timeoutMs = SESSION_CLOSE_TIMEOUT_MS
): Promise<void> {
  if (!session) return;
  log.info(context, '🧹 [CLEANUP] Calling session.close()...');
  const closeStart = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const closeTimeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('session.close() timeout')), timeoutMs);
    });
    await Promise.race([session.close(), closeTimeout]);
    log.info(
      { ...context, closeDurationMs: Date.now() - closeStart },
      '🧹 [CLEANUP] ✅ session.close() completed'
    );
  } catch (err) {
    log.warn(
      { ...context, error: String(err), closeDurationMs: Date.now() - closeStart },
      '🧹 [CLEANUP] ⚠️ session.close() error or timeout'
    );
  } finally {
    clearTimeout(timer);
  }
}
