/**
 * The quiet hours a caller sets by voice are saved where the panel and the
 * senders read them (messagingPrefs), through the tool's port
 * (tools/domains/ambient-mode/quiet-hours-port.ts).
 *
 * @module services/messaging/voice-quiet-hours
 */
import { setQuietHoursWriter } from '../../tools/domains/ambient-mode/quiet-hours-port.js';
import { PrefsError, writePrefs } from './prefs.js';

export function installQuietHoursWriter(): void {
  setQuietHoursWriter(async (userId, quietStart, quietEnd) => {
    try {
      await writePrefs(userId, { quietStart, quietEnd }, 'voice');
      return 'saved';
    } catch (error) {
      if (error instanceof PrefsError) return 'same';
      throw error;
    }
  });
}
