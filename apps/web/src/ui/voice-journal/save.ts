/**
 * Save Journal Entry
 *
 * Handles transcription and saving of journal entries.
 *
 * @module voice-journal/save
 */

import { createLogger } from '../../utils/logger.js';
import { addMemory, listMemories } from '../../services/custom-agent.service.js';
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

  const { toast } = await import('../toast.ui.js');

  try {
    // Show transcribing state
    toast.info('Transcribing...');

    // Convert blob to base64 for API
    const audioBase64 = await blobToBase64(audioBlob);

    // Transcribe the audio
    let transcript = '';
    try {
      const response = await fetch('/api/journal/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: audioBlob.type || 'audio/webm',
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as { transcript: string; success: boolean };
        if (result.success && result.transcript) {
          transcript = result.transcript;
        }
      }
    } catch (transcribeError) {
      log.warn('Transcription failed, saving without transcript:', transcribeError);
    }

    // Build entry content
    let content = '';
    const currentPrompt = getCurrentPrompt();
    const recordingDuration = getRecordingDuration();

    // Include prompt if one was shown
    if (currentPrompt) {
      content += `Prompt: "${currentPrompt.prompt}"\n\n`;
    }

    // Add transcript or placeholder
    if (transcript) {
      content += transcript;
    } else {
      content += `[Voice recording - ${recordingDuration} seconds]`;
    }

    const mood = getSelectedMood();

    await addMemory(currentAgent.id, {
      type: 'journalEntry',
      content,
      mood,
      transcript, // Store transcript separately for analysis
      durationSeconds: recordingDuration,
      // audioUrl would be set after uploading to storage
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

    toast.success('Entry saved!');
  } catch (error) {
    log.error('Failed to save entry:', error);
    toast.error('Could not save entry');
  }
}

