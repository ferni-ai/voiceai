/**
 * Save Journal Entry
 *
 * Handles transcription and saving of journal entries.
 *
 * @module voice-journal/save
 */

import { createLogger } from '../../utils/logger.js';
import { apiPost } from '../../utils/api.js';
import { addMemory, listMemories } from '../../services/custom-agent.service.js';
import { t } from '../../i18n/index.js';
import {
  getModal,
  getCurrentAgent,
  getCurrentPrompt,
  setCurrentPrompt,
  setEntries,
  getRecordingDuration,
} from './state.js';
import { fetchPrompt, renderPromptSection } from './prompts.js';
import { renderStats } from './render-stats.js';
import { renderCalendar } from './calendar.js';
import { renderEntries } from './entries.js';
import { renderInsights } from './insights.js';
import { blobToBase64 } from './recording.js';

const log = createLogger('VoiceJournalSave');

// ============================================================================
// GET SELECTED MOOD
// ============================================================================

export function getSelectedMood(): string | undefined {
  const modal = getModal();
  const selected = modal?.querySelector('.mood-option--selected') as HTMLElement;
  return selected?.dataset.mood;
}

// ============================================================================
// SAVE ENTRY
// ============================================================================

export async function saveJournalEntry(audioBlob: Blob): Promise<void> {
  const currentAgent = getCurrentAgent();
  if (!currentAgent) {
    log.error('No current agent');
    return;
  }

  const { toast } = await import('../whisper.ui.js');

  try {
    // Show transcribing state
    toast.info(t('toasts.transcribing'));

    // Convert blob to base64 for API
    const audioBase64 = await blobToBase64(audioBlob);

    // The audio itself is never uploaded, so the words are the entry. Without
    // them nothing is saved: no "[Voice recording - N seconds]" stand-in.
    const transcript = await transcribe(audioBase64, audioBlob.type || 'audio/webm');
    if (!transcript) {
      toast.warning(t('toasts.transcriptionUnavailable'));
      return;
    }

    let content = '';
    const currentPrompt = getCurrentPrompt();
    const recordingDuration = getRecordingDuration();

    // Include prompt if one was shown
    if (currentPrompt) {
      content += `Prompt: "${currentPrompt.prompt}"\n\n`;
    }
    content += transcript;

    const mood = getSelectedMood();

    await addMemory(currentAgent.id, {
      type: 'journalEntry',
      content,
      mood,
      transcript, // Store transcript separately for analysis
      durationSeconds: recordingDuration,
    });

    // Reload entries
    const entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];
    setEntries(entries);

    // Re-render all sections
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    // Clear mood selection
    const modal = getModal();
    modal?.querySelectorAll('.mood-option').forEach((opt) => {
      opt.classList.remove('mood-option--selected');
    });

    // Get new prompt for next entry
    const newPrompt = await fetchPrompt();
    setCurrentPrompt(newPrompt);
    renderPromptSection();

    toast.success(t('toasts.entrySaved'));

    // 🤲 Sidekick: Dispatch journal entry event for avatar sidekick
    document.dispatchEvent(new CustomEvent('ferni:journal-entry', {
      detail: { mood, hasTranscript: true, durationSeconds: recordingDuration }
    }));
  } catch (error) {
    log.error('Failed to save entry:', error);
    toast.error("Couldn't save entry. Try again?");
  }
}


// ============================================================================
// TRANSCRIBE
// ============================================================================

/** The server's stand-in when it has no speech-to-text provider. Never an entry. */
const UNAVAILABLE = '[Transcription unavailable]';

/**
 * Transcribe through the authenticated helper (a bare fetch got 401 on prod).
 * Returns the words, or null when there are none to keep.
 */
async function transcribe(audioBase64: string, mimeType: string): Promise<string | null> {
  const response = await apiPost<{ transcript?: string; success?: boolean }>(
    '/api/journal/transcribe',
    { audioBase64, mimeType },
    // One try: re-sending a whole recording on a 5xx is not worth the wait.
    { maxRetries: 0, timeout: 60000 }
  );
  const words = response.data?.transcript?.trim() ?? '';
  if (!response.ok || response.data?.success !== true || !words || words === UNAVAILABLE) {
    log.warn('No transcript, nothing saved:', response.status, response.error);
    return null;
  }
  return words;
}
