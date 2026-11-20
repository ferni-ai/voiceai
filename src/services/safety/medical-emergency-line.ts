/**
 * The line a transfer decision gives for the caller's own medical emergency
 * (CRISIS_MEDICAL_911_FIRST, #4249, off by default).
 *
 * The transfer classifier (human-transfer/escalation-classifier.ts) reads a first-person
 * medical emergency (chest pain, a heart attack or stroke, can't breathe, bleeding) as an
 * immediate crisis and names 911 as the service. The crisis patterns don't read these lines,
 * so the crisis-line policy has nothing to say, and the transfer context used to say only
 * "Always mention 988". With the flag on, it leads with 911: alone, with no crisis line; with
 * suicidal, self-harm or danger-to-others signals, 911 first and then the crisis line.
 *
 * @module services/safety/medical-emergency-line
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

/** The service the transfer classifier names for a medical emergency (escalation-classifier.ts). */
const MEDICAL_EMERGENCY_SERVICE = `${EMERGENCY_NUMBER} Emergency Services`;

const CALL_NOW = `CRITICAL: This sounds like a medical emergency. Tell them to call ${EMERGENCY_NUMBER} right now, before anything else`;
const ALONE = `${CALL_NOW}, and stay with them until help is on the way. Don't point them to a crisis line for this.`;
const FIRST = `${CALL_NOW}.`;

/** The parts of a transfer decision this reads. */
export interface MedicalRead {
  suggestedService?: string;
  safetyFlags?: { suicidalIdeation?: boolean; selfHarm?: boolean; dangerToOthers?: boolean };
}

/**
 * The lines for a crisis decision that is the caller's own medical emergency, or null (flag
 * off, or not a medical emergency: the caller keeps its own line). `crisisLine` is the
 * caller's crisis-line instruction, kept after 911 when a risk signal rides along.
 */
export function medicalEmergencyLines(
  decision: MedicalRead,
  crisisLine: string,
  env: Env = process.env
): string[] | null {
  if (!flagOn('CRISIS_MEDICAL_911_FIRST', env)) return null;
  if (decision.suggestedService !== MEDICAL_EMERGENCY_SERVICE) return null;
  const risk = decision.safetyFlags;
  return risk?.suicidalIdeation || risk?.selfHarm || risk?.dangerToOthers
    ? [FIRST, crisisLine]
    : [ALONE];
}
