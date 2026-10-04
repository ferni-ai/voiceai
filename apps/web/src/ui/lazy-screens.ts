/**
 * Screens loaded the first time someone opens them.
 *
 * Every visitor used to download these (~600 KB) before the app ran. Opening
 * one now fetches its chunk, so a fetch can fail: almost always a tab left
 * open across a deploy, whose old chunk names are gone. We say so instead of
 * leaving the button dead, and don't reload for them (they may be mid-call).
 *
 * @module ui/lazy-screens
 */
import { toast, toastInfo } from './whisper.ui.js';
import { startOAuthConnect } from '../services/oauth-connect.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LazyScreens');

async function loadScreen<T>(screen: string, importer: () => Promise<T>): Promise<T | null> {
  try {
    return await importer();
  } catch (error) {
    log.error(`Couldn't load ${screen}`, error);
    toastInfo(`Ferni just got an update. Refresh the page to open ${screen}.`);
    return null;
  }
}

export async function openCalendarView(): Promise<void> {
  const m = await loadScreen('your calendar', () => import('./calendar-view.ui.js'));
  if (!m) return;
  // The view's connect button starts Google's OAuth flow for the signed-in user.
  m.setCalendarViewCallbacks({
    onConnectCalendar: () => {
      void startOAuthConnect('google_calendar').then((result) => {
        if (!result.success) toast.error(result.error ?? "Couldn't connect. Try again?");
      });
    },
  });
  m.showCalendarView();
}

export async function openCalendarSettings(): Promise<void> {
  const m = await loadScreen('calendar settings', () => import('./calendar-settings.ui.js'));
  await m?.openCalendarSettings();
}

export async function openMusicDashboard(): Promise<void> {
  const m = await loadScreen('your music', () => import('./music-dashboard.ui.js'));
  await m?.musicDashboard.show();
}

export async function openGamePicker(): Promise<void> {
  const m = await loadScreen('games', () => import('./game-picker.ui.js'));
  m?.showGamePicker();
}

export async function openNotificationSettings(options?: {
  tab?: 'settings' | 'upcoming';
}): Promise<void> {
  const m = await loadScreen(
    'notification settings',
    () => import('./notification-settings.ui.js')
  );
  m?.showNotificationSettings(options);
}

/** The Your Story dashboard, its data service and its charts (~300 KB). */
export function loadYourStory() {
  return loadScreen('your story', () =>
    Promise.all([
      import('./your-story-dashboard.ui.js'),
      import('../services/your-story.service.js'),
      import('./visualizations/index.js'),
    ])
  );
}
