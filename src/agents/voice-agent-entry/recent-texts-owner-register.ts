/**
 * Gives the call-start texts awareness (multi-agent/recent-texts-awareness.ts)
 * this layer's answer to "is the account owner proven to be on the line":
 * ownerProvenOnLine, the one rule. Until this loads, no session hears about
 * its texts. Imported for its side effect by gce/job-executor.ts.
 *
 * @module agents/voice-agent-entry/recent-texts-owner-register
 */
import { registerRecentTextsOwnerCheck } from '../multi-agent/recent-texts-awareness.js';
import { ownerProvenOnLine } from './caller-recognition.js';

registerRecentTextsOwnerCheck(ownerProvenOnLine);
