/**
 * The settings menu's rows in the regrouped layout (config/menu-regroup-flag.ts):
 * five groups named for what they hold. The same rows as the legacy layout in
 * settings-menu.ui.ts, with the same actions, icons and labels, only regrouped,
 * so every panel stays reachable. Row visibility (config/menu-visibility.ts) and
 * roadmap hiding still apply when a row renders.
 */

/** The ICONS entries these rows use (settings-menu.ui.ts). */
export type MenuIconName =
  | 'bell'
  | 'outreach'
  | 'calendar'
  | 'heart'
  | 'book'
  | 'sparkles'
  | 'users'
  | 'home'
  | 'brain'
  | 'hub'
  | 'journal'
  | 'commands'
  | 'care'
  | 'ritual'
  | 'lightbulb'
  | 'music'
  | 'compass'
  | 'wellbeing'
  | 'ring'
  | 'analytics'
  | 'history'
  | 'palette'
  | 'theme'
  | 'transcript'
  | 'speaker'
  | 'fingerprint'
  | 'phone'
  | 'link'
  | 'creditCard'
  | 'shield';

export interface MenuRow {
  action: string;
  icon: MenuIconName;
  labelKey: string;
  /** A switch instead of a button; its state is read when the menu renders. */
  toggle?: 'transcription' | 'sounds';
}

export interface MenuGroup {
  id: string;
  titleKey: string;
  rows: readonly MenuRow[];
}

export interface MenuGroupOptions {
  /** "Chip in" replaces Account & Billing (Venmo chip-in on, paywall off). */
  chipIn: boolean;
  /** What Ferni Knows has a row only when memory control is on. */
  memoryControl: boolean;
}

export function menuGroups({ chipIn, memoryControl }: MenuGroupOptions): MenuGroup[] {
  const settingsRows: MenuRow[] = [
    { action: 'personal-settings', icon: 'palette', labelKey: 'menu.items.personalize' },
    { action: 'theme', icon: 'theme', labelKey: 'menu.items.themeLanguage' },
    {
      action: 'toggle-transcription',
      icon: 'transcript',
      labelKey: 'menu.items.showTranscript',
      toggle: 'transcription',
    },
    {
      action: 'toggle-sounds',
      icon: 'speaker',
      labelKey: 'menu.items.soundEffects',
      toggle: 'sounds',
    },
    { action: 'voice-id-settings', icon: 'fingerprint', labelKey: 'menu.items.voiceId' },
    { action: 'family-callers', icon: 'phone', labelKey: 'menu.items.familyCallers' },
    { action: 'all-connections', icon: 'link', labelKey: 'menu.items.allConnections' },
    ...(chipIn
      ? []
      : [
          { action: 'billing', icon: 'creditCard', labelKey: 'menu.items.accountBilling' } as const,
        ]),
    { action: 'export', icon: 'shield', labelKey: 'menu.items.exportData' },
  ];
  return [
    {
      id: 'checkIns',
      titleKey: 'menu.groups.checkIns',
      rows: [
        { action: 'notifications', icon: 'bell', labelKey: 'menu.items.notifications' },
        { action: 'outreach-schedule', icon: 'outreach', labelKey: 'menu.items.outreachSchedule' },
        { action: 'calendar-settings', icon: 'calendar', labelKey: 'menu.items.whatsAhead' },
      ],
    },
    {
      id: 'whatIRemember',
      titleKey: 'menu.groups.whatIRemember',
      rows: [
        { action: 'your-story', icon: 'heart', labelKey: 'menu.items.yourStory' },
        { action: 'memory-lane', icon: 'book', labelKey: 'menu.items.memoryLane' },
        { action: 'your-year', icon: 'sparkles', labelKey: 'menu.items.yourYear' },
        { action: 'contacts', icon: 'users', labelKey: 'menu.items.contacts' },
        { action: 'household-members', icon: 'home', labelKey: 'menu.items.householdMembers' },
        ...(memoryControl
          ? [{ action: 'cognitive', icon: 'brain', labelKey: 'ferniKnows.panelTitle' } as const]
          : []),
      ],
    },
    {
      id: 'yourDay',
      titleKey: 'menu.groups.yourDay',
      rows: [
        { action: 'hub', icon: 'hub', labelKey: 'ui.yourDay' },
        { action: 'journal', icon: 'journal', labelKey: 'menu.items.journaling' },
        { action: 'play-games', icon: 'sparkles', labelKey: 'menu.items.playGames' },
        { action: 'commands', icon: 'commands', labelKey: 'menu.items.guidedPractices' },
        { action: 'what-i-do-for-you', icon: 'care', labelKey: 'ferniCare.whatIDoForYou' },
        { action: 'ritual', icon: 'ritual', labelKey: 'menu.items.createPractice' },
        { action: 'knowledge-quiz', icon: 'lightbulb', labelKey: 'menu.items.knowledgeQuiz' },
        { action: 'music-dashboard', icon: 'music', labelKey: 'menu.items.musicalYou' },
        { action: 'vibe-controller', icon: 'sparkles', labelKey: 'menu.items.setTheVibe' },
        { action: 'discover-agents', icon: 'compass', labelKey: 'menu.items.discoverAgents' },
      ],
    },
    {
      id: 'yourJourney',
      titleKey: 'menu.groups.yourJourney',
      rows: [
        { action: 'wellbeing', icon: 'wellbeing', labelKey: 'menu.items.wellbeingDashboard' },
        { action: 'trust-dashboard', icon: 'ring', labelKey: 'menu.items.trustDashboard' },
        { action: 'pattern-insights', icon: 'analytics', labelKey: 'menu.items.patternInsights' },
        { action: 'history', icon: 'history', labelKey: 'menu.items.conversationHistory' },
      ],
    },
    { id: 'groupedSettings', titleKey: 'menu.groups.settings', rows: settingsRows },
  ];
}
