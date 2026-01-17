/**
 * Journal Capture Service
 *
 * Automatically captures meaningful moments from conversations and saves them
 * to the user's Digital Twin journal. This creates a living record of insights,
 * breakthroughs, and growth - without requiring manual journaling.
 *
 * Philosophy:
 *   - A good friend remembers what matters, not everything
 *   - Capture moments, not transcripts
 *   - User has full control (consent, review, delete)
 *   - Better than human: perfect recall of significant moments
 *
 * @module journal-capture.service
 */

import { createLogger } from '../utils/logger.js';
import { apiPost } from '../utils/api.js';

const log = createLogger('JournalCapture');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of moments we detect and capture
 */
export type MomentType =
  | 'breakthrough'    // "I finally realized...", "It hit me that..."
  | 'decision'        // "I'm going to...", "I've decided..."
  | 'gratitude'       // "I'm grateful for...", "I appreciate..."
  | 'struggle'        // "I've been struggling with...", "It's hard..."
  | 'joy'             // Expressions of happiness, celebration
  | 'reflection'      // Deep thinking, self-awareness
  | 'goal'            // Future intentions, aspirations
  | 'connection'      // Relationship insights, about others
  | 'lesson'          // "I learned that...", wisdom gained
  | 'vulnerability';  // Sharing something difficult

/**
 * A detected meaningful moment from conversation
 */
export interface CapturedMoment {
  id: string;
  type: MomentType;
  content: string;           // The actual words/insight
  context?: string;          // Surrounding context
  mood?: string;             // Detected emotional state
  themes: string[];          // Topics/themes involved
  intensity: number;         // 0-1, how significant
  timestamp: string;         // When it happened
  conversationId?: string;   // Which conversation
  personaId?: string;        // Which persona was talking
}

/**
 * User's journal capture preferences
 */
export interface JournalCaptureSettings {
  enabled: boolean;
  consentDate?: string;           // When they said yes
  captureTypes: MomentType[];     // Which types to capture
  minIntensity: number;           // Threshold (0-1)
  autoTagMood: boolean;           // Auto-detect mood
  autoTagThemes: boolean;         // Auto-detect themes
  showCaptureNotification: boolean; // Toast when moment captured
  reviewBeforeSave: boolean;      // Show for approval first
}

/**
 * Default settings for new users
 */
export const DEFAULT_CAPTURE_SETTINGS: JournalCaptureSettings = {
  enabled: false,
  captureTypes: [
    'breakthrough',
    'decision',
    'gratitude',
    'reflection',
    'lesson',
    'vulnerability',
  ],
  minIntensity: 0.6,
  autoTagMood: true,
  autoTagThemes: true,
  showCaptureNotification: true,
  reviewBeforeSave: false, // Frictionless by default
};

// ============================================================================
// STORAGE
// ============================================================================

const SETTINGS_KEY = 'ferni_journal_capture_settings';
const PENDING_MOMENTS_KEY = 'ferni_pending_moments';

/**
 * Load user's capture settings
 */
export function loadCaptureSettings(): JournalCaptureSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_CAPTURE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    log.warn('Failed to load capture settings:', e);
  }
  return { ...DEFAULT_CAPTURE_SETTINGS };
}

/**
 * Save user's capture settings
 */
export function saveCaptureSettings(settings: JournalCaptureSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    log.info('Capture settings saved:', settings.enabled ? 'enabled' : 'disabled');
  } catch (e) {
    log.error('Failed to save capture settings:', e);
  }
}

/**
 * Enable journal capture with consent
 */
export function enableJournalCapture(): void {
  const settings = loadCaptureSettings();
  settings.enabled = true;
  settings.consentDate = new Date().toISOString();
  saveCaptureSettings(settings);
  log.info('Journal capture enabled with consent');
}

/**
 * Disable journal capture
 */
export function disableJournalCapture(): void {
  const settings = loadCaptureSettings();
  settings.enabled = false;
  saveCaptureSettings(settings);
  log.info('Journal capture disabled');
}

/**
 * Check if capture is enabled
 */
export function isCaptureEnabled(): boolean {
  return loadCaptureSettings().enabled;
}

// ============================================================================
// MOMENT DETECTION (Frontend triggers, backend analyzes)
// ============================================================================

/**
 * Keywords and patterns that suggest meaningful moments
 * This is a lightweight frontend filter - real analysis happens on backend
 */
const MOMENT_INDICATORS: Record<MomentType, string[]> = {
  breakthrough: [
    'i finally', 'it hit me', 'i realized', 'i understand now',
    'it clicked', 'i see now', 'everything makes sense',
  ],
  decision: [
    "i'm going to", "i've decided", 'i will', 'i choose to',
    'from now on', 'starting today', "i'm committed",
  ],
  gratitude: [
    'grateful for', 'thankful', 'i appreciate', 'blessed',
    'means so much', 'thank you for',
  ],
  struggle: [
    'struggling with', "it's hard", 'difficult', 'overwhelmed',
    "can't seem to", 'frustrated', 'exhausted',
  ],
  joy: [
    'so happy', 'excited', 'amazing', 'wonderful',
    'best feeling', 'love this', 'incredible',
  ],
  reflection: [
    'i think', 'been thinking', 'wondering if', 'looking back',
    'i notice', 'realized about myself',
  ],
  goal: [
    'want to', 'hope to', 'dream of', 'working toward',
    'my goal is', 'one day', 'aspire to',
  ],
  connection: [
    'my partner', 'my friend', 'my family', 'relationship',
    'they make me', 'we have',
  ],
  lesson: [
    'i learned', 'taught me', 'now i know', 'lesson',
    'showed me', 'opened my eyes',
  ],
  vulnerability: [
    'never told', 'hard to admit', 'scared to', 'ashamed',
    'vulnerable', 'opening up', 'honest truth',
  ],
};

/**
 * Quick check if text might contain a meaningful moment
 * Used to decide whether to send to backend for full analysis
 */
export function mightContainMoment(text: string): boolean {
  const lower = text.toLowerCase();
  
  for (const indicators of Object.values(MOMENT_INDICATORS)) {
    for (const indicator of indicators) {
      if (lower.includes(indicator)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Estimate moment type from text (lightweight, frontend-only)
 * Real classification happens on backend with full context
 */
export function estimateMomentType(text: string): MomentType | null {
  const lower = text.toLowerCase();
  
  for (const [type, indicators] of Object.entries(MOMENT_INDICATORS)) {
    for (const indicator of indicators) {
      if (lower.includes(indicator)) {
        return type as MomentType;
      }
    }
  }
  
  return null;
}

// ============================================================================
// MOMENT QUEUE (for batching/review)
// ============================================================================

let pendingMoments: CapturedMoment[] = [];

/**
 * Add a moment to the pending queue
 */
export function queueMoment(moment: CapturedMoment): void {
  pendingMoments.push(moment);
  
  // Persist to localStorage for recovery
  try {
    localStorage.setItem(PENDING_MOMENTS_KEY, JSON.stringify(pendingMoments));
  } catch (e) {
    log.warn('Failed to persist pending moments:', e);
  }
  
  log.debug('Moment queued:', moment.type, moment.content.substring(0, 50));
}

/**
 * Get all pending moments
 */
export function getPendingMoments(): CapturedMoment[] {
  return [...pendingMoments];
}

/**
 * Clear pending moments (after save or dismiss)
 */
export function clearPendingMoments(): void {
  pendingMoments = [];
  localStorage.removeItem(PENDING_MOMENTS_KEY);
}

/**
 * Load any pending moments from previous session
 */
export function loadPendingMoments(): void {
  try {
    const stored = localStorage.getItem(PENDING_MOMENTS_KEY);
    if (stored) {
      pendingMoments = JSON.parse(stored);
      log.info(`Loaded ${pendingMoments.length} pending moments from storage`);
    }
  } catch (e) {
    log.warn('Failed to load pending moments:', e);
  }
}

// ============================================================================
// API INTEGRATION
// ============================================================================

/**
 * Send captured moment to backend for saving to journal
 */
export async function saveMomentToJournal(
  moment: CapturedMoment,
  twinId: string
): Promise<boolean> {
  try {
    const response = await apiPost(`/api/custom-agents/${twinId}/memories`, {
      type: 'journalEntry',
      content: moment.content,
      context: moment.context,
      mood: moment.mood,
      themes: moment.themes,
      source: 'auto-capture',
      momentType: moment.type,
      intensity: moment.intensity,
      conversationId: moment.conversationId,
      personaId: moment.personaId,
      capturedAt: moment.timestamp,
    });

    if (!response.ok) {
      log.error('Failed to save moment:', response.status);
      return false;
    }

    log.info('Moment saved to journal:', moment.type);
    return true;
  } catch (e) {
    log.error('Error saving moment:', e);
    return false;
  }
}

/**
 * Save all pending moments to journal
 */
export async function saveAllPendingMoments(twinId: string): Promise<number> {
  const moments = getPendingMoments();
  let saved = 0;

  for (const moment of moments) {
    const success = await saveMomentToJournal(moment, twinId);
    if (success) saved++;
  }

  if (saved > 0) {
    clearPendingMoments();
  }

  return saved;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize journal capture service
 */
export function initJournalCapture(): void {
  loadPendingMoments();
  
  const settings = loadCaptureSettings();
  log.info(
    'Journal capture initialized:',
    settings.enabled ? 'enabled' : 'disabled',
    settings.enabled ? `(${settings.captureTypes.length} types)` : ''
  );
}

// ============================================================================
// HUMAN-READABLE LABELS
// ============================================================================

/**
 * Get human-readable label for moment type
 */
export function getMomentTypeLabel(type: MomentType): string {
  const labels: Record<MomentType, string> = {
    breakthrough: 'Breakthrough',
    decision: 'Decision',
    gratitude: 'Gratitude',
    struggle: 'Struggle',
    joy: 'Joy',
    reflection: 'Reflection',
    goal: 'Goal',
    connection: 'Connection',
    lesson: 'Lesson Learned',
    vulnerability: 'Vulnerability',
  };
  return labels[type] || type;
}

/**
 * Get icon for moment type (Lucide icon names)
 */
export function getMomentTypeIcon(type: MomentType): string {
  const icons: Record<MomentType, string> = {
    breakthrough: 'lightbulb',
    decision: 'check-circle',
    gratitude: 'heart',
    struggle: 'cloud-rain',
    joy: 'sun',
    reflection: 'brain',
    goal: 'target',
    connection: 'users',
    lesson: 'book-open',
    vulnerability: 'shield',
  };
  return icons[type] || 'bookmark';
}

