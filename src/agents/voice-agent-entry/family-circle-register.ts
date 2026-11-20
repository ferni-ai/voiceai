/**
 * Hands identifyUser (voice-agent/user-identification-handler.ts) the family
 * circle decision (family-circle.ts), which its layer can't import. Until this
 * registers, nobody is in the family circle. Imported for its side effect by
 * gce/job-executor.ts.
 *
 * @module agents/voice-agent-entry/family-circle-register
 */
import { registerFamilyCircleDecision } from '../voice-agent/family-circle-hook.js';
import { resolveFamilyCircle } from './family-circle.js';

registerFamilyCircleDecision(async (room, sessionId) => resolveFamilyCircle(room, sessionId));
