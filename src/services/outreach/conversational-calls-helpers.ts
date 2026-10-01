/**
 * Conversational Voice Call helpers: SSML shaping, Firestore persistence,
 * phone normalization and quiet-hours windows.
 * Extracted from conversational-calls.ts.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { ScheduledCall } from './conversational-calls-types.js';

const log = createLogger({ module: 'ConversationalCalls' });

// ============================================================================
// SSML ENHANCEMENT
// ============================================================================

/**
 * Enhance SSML for Cartesia TTS to sound natural
 *
 * Adds:
 * - Natural breathing pauses
 * - Emotional emphasis
 * - Conversational rhythm
 */
export function enhanceSSMLForCall(ssml: string, personaId: string): string {
  let enhanced = ssml;

  // If not already wrapped in <speak>, wrap it
  if (!enhanced.startsWith('<speak>')) {
    enhanced = `<speak>${enhanced}</speak>`;
  }

  // Add Cartesia-specific voice settings based on persona
  const voiceSettings = getPersonaVoiceSettings(personaId);

  // Inject voice control at the start (after <speak>)
  const voiceControl = `<voice name="${voiceSettings.voiceId}"><prosody rate="${voiceSettings.rate}" pitch="${voiceSettings.pitch}">`;
  const voiceControlEnd = '</prosody></voice>';

  enhanced = enhanced.replace('<speak>', `<speak>${voiceControl}`);
  enhanced = enhanced.replace('</speak>', `${voiceControlEnd}</speak>`);

  // Add a greeting pause at the start (makes it feel less robotic)
  enhanced = enhanced.replace(voiceControl, `${voiceControl}<break time="400ms"/>`);

  // Add a closing pause (gives space before hanging up)
  enhanced = enhanced.replace(voiceControlEnd, `<break time="500ms"/>${voiceControlEnd}`);

  return enhanced;
}

export interface VoiceSettings {
  voiceId: string;
  rate: string;
  pitch: string;
}

export function getPersonaVoiceSettings(personaId: string): VoiceSettings {
  const settings: Record<string, VoiceSettings> = {
    ferni: { voiceId: 'nova', rate: '0.95', pitch: '+0%' },
    peter: { voiceId: 'alloy', rate: '1.0', pitch: '-2%' },
    maya: { voiceId: 'shimmer', rate: '0.98', pitch: '+3%' },
    alex: { voiceId: 'echo', rate: '1.02', pitch: '0%' },
    jordan: { voiceId: 'fable', rate: '0.97', pitch: '+2%' },
    nayan: { voiceId: 'onyx', rate: '0.9', pitch: '-3%' },
  };

  return settings[personaId] || settings['ferni'];
}

/**
 * Convert our SSML to Twilio-compatible format
 */
export function convertToTwilioSSML(ssml: string): string {
  // Remove outer <speak> tags (Twilio adds its own)
  let converted = ssml.replace(/<speak>/g, '').replace(/<\/speak>/g, '');

  // Convert voice tags to prosody (Twilio doesn't support <voice>)
  converted = converted.replace(/<voice[^>]*>/g, '');
  converted = converted.replace(/<\/voice>/g, '');

  // Keep prosody and break tags (Twilio supports these)
  // Remove any unsupported tags

  return converted;
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

export async function saveScheduledCall(call: ScheduledCall): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(call.userId)
      .collection('scheduled_calls')
      .doc(call.id)
      .set(cleanForFirestore(call));
  } catch (error) {
    log.error({ error: String(error), callId: call.id }, 'Failed to save scheduled call');
  }
}

export async function updateCallStatus(
  callId: string,
  status: ScheduledCall['status'],
  updates?: Record<string, unknown>
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    // Find the call document (we don't have userId here, so query)
    const snapshot = await db
      .collectionGroup('scheduled_calls')
      .where('id', '==', callId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update(
        cleanForFirestore({
          status,
          ...updates,
          updatedAt: new Date().toISOString(),
        })
      );
    }
  } catch (error) {
    log.warn({ error: String(error), callId }, 'Failed to update call status');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Validate length (US numbers: 10 or 11 with country code)
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.length > 10) {
    // International number
    return `+${digits}`;
  }

  return null;
}

export async function isInQuietHours(userId: string): Promise<boolean> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return false;

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return false;

    const data = doc.data();
    const preferences = data?.outreachPreferences;
    if (!preferences?.quietHours?.enabled) return false;

    // Parse quiet hours (e.g., "22:00" to "08:00")
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const startParts = preferences.quietHours.start.split(':').map(Number);
    const endParts = preferences.quietHours.end.split(':').map(Number);
    const startTime = startParts[0] * 60 + startParts[1];
    const endTime = endParts[0] * 60 + endParts[1];

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    return currentTime >= startTime && currentTime < endTime;
  } catch {
    return false;
  }
}

export async function getNextAvailableWindow(userId: string): Promise<Date> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      // Default: 9 AM tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    }

    const doc = await db.collection('bogle_users').doc(userId).get();
    const preferences = doc.exists ? doc.data()?.outreachPreferences : null;

    // Default quiet hours end at 8 AM
    const endHour = preferences?.quietHours?.end
      ? parseInt(preferences.quietHours.end.split(':')[0], 10)
      : 8;

    const next = new Date();
    if (next.getHours() >= endHour) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(endHour, 0, 0, 0);

    return next;
  } catch {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}

/**
 * Format referral conversations for context injection
 * @deprecated Use dedicated context builder
 */
export function formatReferralConversationsForContext(_userId?: string): string {
  // Stub for backward compatibility
  return '';
}
