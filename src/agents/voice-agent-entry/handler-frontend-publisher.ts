import type { JobContext } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import { forwardCameoReveals } from '../voice-agent/cameo-reveal.js';

export async function setupFrontendPublisher(
  ctx: JobContext,
  sessionPersona: PersonaConfig,
  sessionId: string,
  cleanupHandlers: Array<() => void | Promise<void>>
): Promise<void> {
  try {
    const { initializeFrontendPublisher, releaseFrontendPublisher } =
      await import('../realtime/index.js');
    const publisher = initializeFrontendPublisher(sessionId, ctx.room);
    cleanupHandlers.push(() => releaseFrontendPublisher(sessionId));
    // Ferni's introduction of a teammate shows in the app as it finishes
    cleanupHandlers.push(forwardCameoReveals(ctx.room, sessionId));

    const { initFrontendSignal, resetFrontendSignal } =
      await import('../../services/frontend-signal.js');
    initFrontendSignal(sessionId, async (type, data) => {
      if (publisher.isConnected()) await publisher.sendData(type, data ?? {});
    });
    cleanupHandlers.push(() => resetFrontendSignal(sessionId));
    process.stderr.write(`[voice-agent-entry] 📤 Frontend publisher initialized\n`);

    try {
      const { initHumanizationSignalEmitter, releaseHumanizationSignalEmitter } =
        await import('../../services/humanization/humanization-signal-emitter.js');
      initHumanizationSignalEmitter(sessionId, async (type, payload) => {
        if (publisher.isConnected()) await publisher.sendData(type, payload);
      });
      cleanupHandlers.push(() => releaseHumanizationSignalEmitter(sessionId));
      process.stderr.write(`[voice-agent-entry] 🌉 Humanization signal emitter initialized\n`);
    } catch {
      /* Non-critical */
    }

    try {
      const { setSignalEmitter, clearSignalEmitter } =
        await import('../../services/trust-systems/trust-signal-emitter.js');
      cleanupHandlers.push(() => clearSignalEmitter(sessionId));
      setSignalEmitter(sessionId, (signal) => {
        if (publisher.isConnected()) {
          void publisher.sendData('trust_signal', {
            signalType: signal.type,
            title: signal.title,
            message: signal.message,
            personaId: signal.personaId || sessionPersona.id,
            timing: signal.timing,
            metadata: signal.metadata,
          });
        }
      });
      process.stderr.write(`[voice-agent-entry] 💚 Trust signal emitter initialized\n`);
    } catch {
      /* Non-critical */
    }
  } catch (pubErr) {
    process.stderr.write(`[voice-agent-entry] Frontend publisher failed (non-fatal): ${pubErr}\n`);
  }
}
