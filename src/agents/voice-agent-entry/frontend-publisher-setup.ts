/**
 * Frontend publisher setup — wires the room's data channel to the frontend
 * signal, humanization signal and trust signal emitters.
 *
 * Extracted from handler-setup.ts.
 *
 * @module agents/voice-agent-entry/frontend-publisher-setup
 */

import type { JobContext } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';

export async function setupFrontendPublisher(
  ctx: JobContext,
  sessionPersona: PersonaConfig,
  _sessionId: string
): Promise<void> {
  try {
    const { initializeFrontendPublisher, getFrontendPublisher } =
      await import('../realtime/index.js');
    initializeFrontendPublisher(ctx.room);

    const { initFrontendSignal } = await import('../../services/frontend-signal.js');
    initFrontendSignal(async (type, data) => {
      const publisher = getFrontendPublisher();
      if (publisher.isConnected()) await publisher.sendData(type, data ?? {});
    });
    process.stderr.write(`[voice-agent-entry] 📤 Frontend publisher initialized\n`);

    try {
      const { initHumanizationSignalEmitter } =
        await import('../../services/humanization/humanization-signal-emitter.js');
      initHumanizationSignalEmitter(async (type, payload) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) await publisher.sendData(type, payload);
      });
      process.stderr.write(`[voice-agent-entry] 🌉 Humanization signal emitter initialized\n`);
    } catch {
      /* Non-critical */
    }

    try {
      const { setSignalEmitter } =
        await import('../../services/trust-systems/trust-signal-emitter.js');
      setSignalEmitter((signal) => {
        const publisher = getFrontendPublisher();
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
