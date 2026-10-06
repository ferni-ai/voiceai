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
import { formatDate, t } from '../../i18n/index.js';
import { tp } from '../../i18n/plural.js';

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
    const { toast } = await import('../whisper.ui.js');
    toast.warning(t('toasts.noEntriesToExport'));
    return;
  }

  const { toast } = await import('../whisper.ui.js');

  try {
    const stats = calculateStats(entries);
    const sortedEntries = [...entries].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Build export content
    let content = `# ${t('voiceJournal.export.title')}\n`;
    content += `## ${currentAgent.displayName || currentAgent.name}\n`;
    content += `${t('voiceJournal.export.exported', { date: formatDate(new Date()) })}\n\n`;
    content += `---\n\n`;
    content += `## ${t('voiceJournal.export.statsHeading')}\n`;
    content += `- ${t('voiceJournal.export.totalEntries', { count: stats.totalEntries })}\n`;
    content += `- ${tp('voiceJournal.export.currentStreak', stats.currentStreak)}\n`;
    content += `- ${tp('voiceJournal.export.longestStreak', stats.longestStreak)}\n`;
    if (stats.topMoods.length > 0) {
      const moods = stats.topMoods.map((m) => `${m.mood} (${m.count})`).join(', ');
      content += `- ${t('voiceJournal.export.topMoods', { moods })}\n`;
    }
    content += `\n---\n\n`;
    content += `## ${t('voiceJournal.export.entriesHeading')}\n\n`;

    for (const entry of sortedEntries) {
      const date = formatDate(new Date(entry.createdAt), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      content += `### ${date}\n`;
      if (entry.mood) {
        content += `**${t('voiceJournal.export.mood')}** ${entry.mood}\n`;
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
    const { toast } = await import('../whisper.ui.js');
    toast.warning(t('toasts.noEntriesToShare'));
    return;
  }

  const { toast } = await import('../whisper.ui.js');

  // Build share content (recent entry summary)
  const recentEntry = [...entries].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  if (!recentEntry) {
    toast.warning(t('toasts.noEntriesToShare'));
    return;
  }

  const date = formatDate(new Date(recentEntry.createdAt));
  const preview = recentEntry.content.slice(0, 200);
  const excerpt = `"${preview}${recentEntry.content.length > 200 ? '...' : ''}"`;
  const shareText = `${t('voiceJournal.export.shareIntro', { date })}\n\n${excerpt}\n\n${t('voiceJournal.export.shareSignature')}`;

  // Use Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: t('voiceJournal.export.shareTitle'),
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

