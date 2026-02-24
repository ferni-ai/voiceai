/**
 * Lightweight VoiceAgentRef wrapper for handoff support.
 *
 * Creates a lightweight VoiceAgentRef wrapper for the agent.
 * This enables handoffs to update LLM instructions without the full VoiceAgent class.
 *
 * FIX: Previously getVoiceAgentRef returned null, breaking handoff identity switching.
 * Now we create a proper wrapper that implements the required interface.
 *
 * @module agents/voice-agent-entry/voice-agent-ref
 */

import type { PersonaConfig } from '../../personas/types.js';
import type { VoiceAgentRef } from '../shared/handoff/types.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';

export function createLightweightVoiceAgentRef(
  agent: { _instructions?: string },
  initialPersona: PersonaConfig
): VoiceAgentRef {
  // Mutable state for the wrapper
  let currentPersona: PersonaConfig = initialPersona;
  let bundleRuntime: BundleRuntimeEngine | undefined;

  return {
    /**
     * Set persona - supports two signatures:
     * 1. setPersona(personaConfig: PersonaConfig) - full persona config with systemPrompt
     * 2. setPersona(personaId: string, instructions: string) - direct ID + instructions
     */
    setPersona(personaOrId: unknown, instructions?: string): void {
      // Handle both signatures
      if (typeof personaOrId === 'string' && typeof instructions === 'string') {
        // Signature 2: setPersona(personaId, instructions)
        // CRITICAL: This is how coordinator-adapter calls us during handoff!
        agent._instructions = instructions;
        process.stderr.write(
          `[voice-agent-entry] 🎭 LLM instructions updated for ${personaOrId} (${instructions.length} chars)\n`
        );
        return;
      }

      // Signature 1: setPersona(personaConfig)
      const p = personaOrId as PersonaConfig;
      currentPersona = p;

      // CRITICAL: Update the agent's instructions for the new persona
      if (p.systemPrompt) {
        agent._instructions = p.systemPrompt;
        process.stderr.write(
          `[voice-agent-entry] 🎭 LLM instructions updated for ${p.name} (${p.systemPrompt.length} chars)\n`
        );
      } else {
        process.stderr.write(`[voice-agent-entry] ⚠️ Persona ${p.name} has no systemPrompt!\n`);
      }
    },

    getPersona(): { id: string } | undefined {
      return currentPersona ? { id: currentPersona.id } : undefined;
    },

    setBundleRuntime(runtime: unknown): void {
      bundleRuntime = runtime as BundleRuntimeEngine;
      process.stderr.write(
        `[voice-agent-entry] 📦 Bundle runtime updated for ${currentPersona?.name}\n`
      );
    },

    getBundleRuntime(): { getState: () => { personaId?: string } } | undefined {
      if (!bundleRuntime) return undefined;
      return {
        getState: () => {
          const state = bundleRuntime?.getState?.();
          return { personaId: state?.personaId };
        },
      };
    },

    // For validation checks
    get instructions(): string | undefined {
      return agent._instructions;
    },
  };
}
