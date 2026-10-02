/**
 * Voice journal - real-time sync event handling. Extracted from voice-journal/index.ts.
 */

import { listMemories } from '../../services/custom-agent.service.js';
import { t } from '../../i18n/index.js';
import type { JournalSyncEvent } from '../../services/journal-sync.service.js';
import { getCurrentAgent, setEntries } from './state.js';
import { renderStats } from './render-stats.js';
import { renderCalendar } from './calendar.js';
import { renderEntries } from './entries.js';
import { renderInsights } from './insights.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('VoiceJournalUI');

/**
 * Handle real-time sync events from other devices
 */
export async function handleSyncEvent(event: JournalSyncEvent): Promise<void> {
  const currentAgent = getCurrentAgent();
  if (!currentAgent || event.agentId !== currentAgent.id) return;

  log.debug('Received sync event:', event.type);

  if (
    event.type === 'entry_added' ||
    event.type === 'entry_deleted' ||
    event.type === 'entry_updated'
  ) {
    // Reload entries from server
    const entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];
    setEntries(entries);

    // Re-render all sections
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    // Show toast notification
    const { toast } = await import('../whisper.ui.js');
    if (event.type === 'entry_added') {
      toast.info(t('toasts.newEntrySynced'));
    } else if (event.type === 'entry_deleted') {
      toast.info(t('toasts.entryRemoved'));
    }
  }
}
