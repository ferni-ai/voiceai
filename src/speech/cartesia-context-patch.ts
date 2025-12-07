/**
 * Cartesia Context ID Patch
 * 
 * Patches the LiveKit Cartesia plugin to use a persistent context_id
 * across TTS streams within a session. This enables prosody continuity
 * between turns - Cartesia will maintain intonation, rhythm, and energy
 * across multiple synthesis calls.
 * 
 * Usage:
 *   import { patchCartesiaForPersistentContext, setSessionContextId } from './cartesia-context-patch.js';
 *   
 *   // Apply patch once at startup
 *   patchCartesiaForPersistentContext();
 *   
 *   // Set context ID at session start
 *   setSessionContextId('session-123');
 * 
 * How it works:
 * The plugin already sends context_id to Cartesia's WebSocket API.
 * This patch intercepts WebSocket.send() to replace the auto-generated
 * requestId with our persistent session-level contextId.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'CartesiaContextPatch' });

// Session-level context ID storage
let currentSessionContextId: string | null = null;
let isPatched = false;

/**
 * Set the session-level context ID for Cartesia TTS.
 * Call this at the start of each voice session.
 */
export function setSessionContextId(contextId: string): void {
  currentSessionContextId = contextId;
  log.debug({ contextId }, 'Session context ID set for Cartesia prosody continuity');
}

/**
 * Clear the session context ID (call at session end).
 */
export function clearSessionContextId(): void {
  currentSessionContextId = null;
  log.debug('Session context ID cleared');
}

/**
 * Get the current session context ID.
 */
export function getSessionContextId(): string | null {
  return currentSessionContextId;
}

/**
 * Apply the patch to enable persistent context_id across TTS streams.
 * Call this once at application startup, before creating any TTS instances.
 * 
 * This is safe to call multiple times - it will only patch once.
 */
export function patchCartesiaForPersistentContext(): void {
  if (isPatched) {
    log.debug('Cartesia context patch already applied');
    return;
  }

  try {
    // We need to patch the WebSocket send method to intercept Cartesia messages
    // This is a surgical patch that only affects Cartesia TTS WebSocket connections
    
    // Import ws module to patch
    const wsModule = require('ws');
    const originalSend = wsModule.prototype.send;
    
    wsModule.prototype.send = function(data: string | Buffer, ...args: unknown[]) {
      // Only intercept string messages (JSON) that look like Cartesia TTS
      if (typeof data === 'string' && currentSessionContextId) {
        try {
          const parsed = JSON.parse(data);
          
          // Check if this is a Cartesia TTS message (has context_id and transcript)
          if ('context_id' in parsed && 'transcript' in parsed) {
            // Replace the auto-generated context_id with our session-level one
            parsed.context_id = currentSessionContextId;
            data = JSON.stringify(parsed);
            
            log.debug(
              { contextId: currentSessionContextId, transcriptLength: parsed.transcript?.length },
              'Injected session context_id into Cartesia message'
            );
          }
        } catch {
          // Not JSON or parse error - pass through unchanged
        }
      }
      
      // Call original send
      return originalSend.call(this, data, ...args);
    };
    
    isPatched = true;
    log.info('✅ Cartesia context patch applied - prosody will persist across turns');
    
  } catch (error) {
    log.warn({ error }, 'Failed to apply Cartesia context patch (prosody continuity disabled)');
  }
}

/**
 * Check if the patch has been applied.
 */
export function isCartesiaPatched(): boolean {
  return isPatched;
}

