/**
 * Export & Share
 *
 * Export journal entries and share functionality.
 *
 * @module voice-journal/export
 */

import { createLogger } from '../../utils/logger.js';
import { getEntries, getCurrentAgent } from './state.js';
import { calculateStats } from './stats.js';
import { t } from '../../i18n/index.js';

const log = createLogger('VoiceJournalExport');

// ============================================================================
// EXPORT JOURNAL
// ============================================================================

/**
 * Export entire journal as a markdown file
 */
export async function exportJournal(): Promise<void> {
  const currentAgent = getCurrentAgent();
  const entries = getEntries();
  
  if (!currentAgent || entries.length === 0) {
    const { toast } = await import('../toast.ui.js');
    toast.warning(t('toasts.noEntriesToExport'));
    return;
  }

  const { toast } = await import('../toast.ui.js');

  try {
    const stats = calculateStats(entries);
    const sortedEntries = [...entries].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Build export content
    let content = `# Voice Journal Export\n`;
    content += `## ${currentAgent.displayName || currentAgent.name}\n`;
    content += `Exported: ${new Date().toLocaleDateString()}\n\n`;
    content += `---\n\n`;
    content += `## Journal Statistics\n`;
    content += `- Total Entries: ${stats.totalEntries}\n`;
    content += `- Current Streak: ${stats.currentStreak} days\n`;
    content += `- Longest Streak: ${stats.longestStreak} days\n`;
    if (stats.topMoods.length > 0) {
      content += `- Top Moods: ${stats.topMoods.map((m) => `${m.mood} (${m.count})`).join(', ')}\n`;
    }
    content += `\n---\n\n`;
    content += `## Journal Entries\n\n`;

    for (const entry of sortedEntries) {
      const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      content += `### ${date}\n`;
      if (entry.mood) {
        content += `**Mood:** ${entry.mood}\n`;
      }
      content += `\n${entry.content}\n\n`;
      content += `---\n\n`;
    }

    // Create and download file
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${currentAgent.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(t('toasts.journalExported'));
  } catch (error) {
    log.error('Failed to export journal:', error);
    toast.error(t('toasts.couldNotExportJournal'));
  }
}

// ============================================================================
// SHARE JOURNAL
// ============================================================================

/**
 * Share journal or specific entry
 */
export async function shareJournal(): Promise<void> {
  const currentAgent = getCurrentAgent();
  const entries = getEntries();
  
  if (!currentAgent || entries.length === 0) {
    const { toast } = await import('../toast.ui.js');
    toast.warning(t('toasts.noEntriesToShare'));
    return;
  }

  const { toast } = await import('../toast.ui.js');

  // Build share content (recent entry summary)
  const recentEntry = [...entries].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  if (!recentEntry) {
    toast.warning(t('toasts.noEntriesToShare'));
    return;
  }

  const date = new Date(recentEntry.createdAt).toLocaleDateString();
  const preview = recentEntry.content.slice(0, 200);
  const shareText = `My journal entry from ${date}:\n\n"${preview}${recentEntry.content.length > 200 ? '...' : ''}"\n\n— Written with Ferni`;

  // Use Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My Journal Entry',
        text: shareText,
      });
      toast.success(t('toasts.shared'));
    } catch (error) {
      // User cancelled or share failed
      if ((error as Error).name !== 'AbortError') {
        log.error('Share failed:', error);
        fallbackCopyShare(shareText, toast);
      }
    }
  } else {
    // Fallback: copy to clipboard
    fallbackCopyShare(shareText, toast);
  }
}

function fallbackCopyShare(
  text: string, 
  toast: { success: (msg: string) => void; error: (msg: string) => void }
): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast.success(t('toasts.copiedToClipboard'));
    })
    .catch(() => {
      toast.error(t('toasts.couldNotShare'));
    });
}

