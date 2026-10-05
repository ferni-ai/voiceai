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
import { ritualsService } from '../services/rituals.service.js';
import { messageUI } from './message.ui.js';
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

// Settings-menu and event-driven panels. app.ts imported each of these
// statically, which kept them (and everything they import) in the entry chunk
// even where another module already loaded them with import().

export async function openYourPeople(): Promise<void> {
  const m = await loadScreen('your people', () => import('./your-people.ui.js'));
  await m?.openYourPeople();
}

export async function openChronicle(): Promise<void> {
  const m = await loadScreen('your journal', () => import('./chronicle.ui.js'));
  m?.openChronicle();
}

export async function openCreativeYouDashboard(userId: string): Promise<void> {
  const m = await loadScreen('Creative You', () => import('./creative-you-dashboard.ui.js'));
  m?.openCreativeYouDashboard(userId);
}

export async function openMarketplace(): Promise<void> {
  const m = await loadScreen('the marketplace', () => import('./marketplace.ui.js'));
  await m?.openMarketplace();
}

export async function openMarketplaceAdmin(session: { id: string; name: string }): Promise<void> {
  const m = await loadScreen('the marketplace queue', () => import('./marketplace-admin.ui.js'));
  await m?.openAdminQueue(session);
}

export async function openSupportFerni(): Promise<void> {
  const m = await loadScreen('Support Ferni', () => import('./support-ferni.ui.js'));
  await m?.supportFerniUI.open();
}

export async function openFerniFund(userId: string): Promise<void> {
  const m = await loadScreen('the garden', () => import('./ferni-fund.ui.js'));
  await m?.ferniFundUI.open(userId);
}

type ThankYouOptions = Parameters<typeof import('./ferni-fund.ui.js').ferniFundUI.showThankYou>[0];
export async function showFerniFundThankYou(options: ThankYouOptions): Promise<void> {
  const m = await loadScreen('the garden', () => import('./ferni-fund.ui.js'));
  m?.ferniFundUI.showThankYou(options);
}

export async function openMemoryLane(): Promise<void> {
  const m = await loadScreen('memory lane', () => import('./memory-lane.ui.js'));
  await m?.memoryLaneUI.open();
}

export async function showPatternInsights(container: HTMLElement): Promise<void> {
  const m = await loadScreen('your patterns', () => import('./pattern-insights.ui.js'));
  await m?.patternInsightsUI.show(container);
}

export async function openKnowledgeQuiz(): Promise<void> {
  const m = await loadScreen('the quiz', () => import('./knowledge-quiz.ui.js'));
  await m?.openKnowledgeQuiz();
}

export async function openGrowthJournal(): Promise<void> {
  const m = await loadScreen('your growth journal', () => import('./growth-journal.ui.js'));
  await m?.openGrowthJournal();
}

export async function openOutreachSchedule(): Promise<void> {
  const m = await loadScreen('your outreach schedule', () => import('./outreach-schedule.ui.js'));
  await m?.openOutreachSchedule();
}

export async function openContactSettings(): Promise<void> {
  const m = await loadScreen('contact settings', () => import('./contact-settings.ui.js'));
  await m?.openContactSettings();
}

export async function showFamilyIdentities(): Promise<void> {
  const m = await loadScreen('family callers', () => import('./family-identities.ui.js'));
  await m?.FamilyIdentities.show();
}

export async function showGroupCoaching(): Promise<void> {
  const m = await loadScreen('group sessions', () => import('./group-coaching.ui.js'));
  m?.showGroupCoaching();
}

export async function showVibeController(): Promise<void> {
  const m = await loadScreen('the vibe controller', () => import('./vibe-controller.ui.js'));
  await m?.show();
}

export async function showSmartHomeSettings(): Promise<void> {
  const m = await loadScreen('smart home settings', () => import('./smart-home-settings.ui.js'));
  await m?.showSmartHomeSettings();
}

export async function showAppleHealthSettings(): Promise<void> {
  const m = await loadScreen('Apple Health settings', () => import('./apple-health-settings.ui.js'));
  await m?.showAppleHealthSettings();
}

export async function showEightSleepSettings(): Promise<void> {
  const m = await loadScreen('Eight Sleep settings', () => import('./eight-sleep-settings.ui.js'));
  await m?.showEightSleepSettings();
}

export async function showOuraSettings(): Promise<void> {
  const m = await loadScreen('Oura settings', () => import('./oura-settings.ui.js'));
  await m?.showOuraSettings();
}

export async function showWearableSettings(): Promise<void> {
  const m = await loadScreen('wearable settings', () => import('./wearable-settings.ui.js'));
  m?.showWearableSettings();
}

export async function showVideoSettings(): Promise<void> {
  const m = await loadScreen('video settings', () => import('./video-settings.ui.js'));
  m?.showVideoSettings();
}

export async function showLinkedInSettings(): Promise<void> {
  const m = await loadScreen('LinkedIn settings', () => import('./linkedin-settings.ui.js'));
  m?.initLinkedInSettings();
  m?.showLinkedInSettings();
}

export async function openPersonalize(): Promise<void> {
  const m = await loadScreen('personalize', () => import('./personalize.ui.js'));
  m?.personalizeUI.open();
}

export async function openReferral(): Promise<void> {
  const m = await loadScreen('sharing', () => import('./referral.ui.js'));
  m?.referralUI.open();
}

export async function openFutureInsights(): Promise<void> {
  const m = await loadScreen('future insights', () => import('./future-insights.ui.js'));
  m?.futureInsightsUI.open();
}

type ManageSubscriptionArgs = Parameters<typeof import('./manage-subscription.ui.js').manageSubscriptionUI.open>;
export async function openManageSubscription(...args: ManageSubscriptionArgs): Promise<void> {
  const m = await loadScreen('your subscription', () => import('./manage-subscription.ui.js'));
  await m?.manageSubscriptionUI.open(...args);
}

// These screens inject their stylesheet in an init function that app.ts used
// to call at startup. It now runs the first time the screen opens.
const initialized = new Set<string>();
function initOnce(screen: string, init: () => void): void {
  if (initialized.has(screen)) return;
  init();
  initialized.add(screen);
}

export async function showWellbeingDashboard(): Promise<void> {
  const m = await loadScreen('your wellbeing', () => import('./wellbeing-dashboard.ui.js'));
  if (!m) return;
  initOnce('wellbeing', m.initWellbeingDashboard);
  await m.showWellbeingDashboard();
}

export async function showConversationMemory(): Promise<void> {
  const m = await loadScreen('conversation memory', () => import('./conversation-memory.ui.js'));
  if (!m) return;
  initOnce('conversation-memory', m.initConversationMemory);
  await m.showConversationMemory();
}

export async function showHouseholdManager(): Promise<void> {
  const m = await loadScreen('your household', () => import('./household-manager.ui.js'));
  if (!m) return;
  initOnce('household', m.initHouseholdManager);
  await m.showHouseholdManager();
}

export async function showLifeContextDashboard(): Promise<void> {
  const m = await loadScreen('your life context', () => import('./life-context-dashboard.ui.js'));
  if (!m) return;
  initOnce('life-context', m.initLifeContextDashboard);
  m.showLifeContextDashboard();
}

export async function openRitualBuilder(): Promise<void> {
  const m = await loadScreen('the ritual builder', () => import('./ritual-builder.ui.js'));
  if (!m) return;
  initOnce('ritual-builder', () => {
    m.initRitualBuilderUI();
    m.getRitualBuilderUI().setCallbacks({
      onSave: async (ritual) => {
        const saved = await ritualsService.createRitual(ritual);
        messageUI.show(`"${saved.name}" created! You've got this.`, 'success', 4000);
        log.info('Ritual created via builder', { id: saved.id, name: saved.name });
      },
      onClose: () => log.debug('Ritual builder closed'),
    });
  });
  m.getRitualBuilderUI().show();
}
