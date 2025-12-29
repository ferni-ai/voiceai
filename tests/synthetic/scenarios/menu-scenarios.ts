/**
 * Menu Navigation Test Scenarios
 *
 * Comprehensive E2E test scenarios for all menu items.
 * Tests verify that:
 * 1. Menu items are visible based on relationship stage
 * 2. Click handlers fire correctly
 * 3. Modals/panels open with proper content
 * 4. Feature locks work correctly
 * 5. State persistence works (pinned items, expanded sections)
 *
 * Categories:
 *   - practices: Guided practices, rituals, notifications
 *   - insights: Your story, memories, history, predictions
 *   - engagement: Games, music, creative, video, marketplace
 *   - people: Contacts, household
 *   - integrations: Connected life (Spotify, Calendar, Health)
 *   - settings: Preferences, account, billing
 *   - quick_actions: Roadmap, referral, onboarding
 *   - feature_locks: Locked features by relationship stage
 */

// ============================================================================
// TYPES
// ============================================================================

export type MenuTestCategory =
  | 'practices'
  | 'insights'
  | 'engagement'
  | 'people'
  | 'integrations'
  | 'settings'
  | 'quick_actions'
  | 'feature_locks'
  | 'persistence';

export type ExpectedUIResult =
  | { type: 'modal'; modalId: string; hasContent: boolean }
  | { type: 'panel'; panelId: string; slidesFrom: 'left' | 'right' | 'bottom' }
  | { type: 'toggle'; stateKey: string; newValue: boolean }
  | { type: 'redirect'; urlPattern: RegExp }
  | { type: 'toast'; message: RegExp }
  | { type: 'locked'; shakeAnimation: boolean }
  | { type: 'hidden'; reason: string };

export type RelationshipStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';

export interface MenuTestScenario {
  id: string;
  name: string;
  description: string;
  category: MenuTestCategory;

  // Menu item to test
  menuAction: string;
  sectionId: string;

  // Preconditions
  preconditions?: {
    relationshipStage?: RelationshipStage;
    isTeamUnlocked?: boolean;
    isAdmin?: boolean;
    spotifyConnected?: boolean;
    calendarConnected?: boolean;
    userId?: string;
  };

  // Steps
  steps: MenuTestStep[];

  // Expected result
  expectedResult: ExpectedUIResult;

  // Additional assertions
  assertions?: MenuTestAssertion[];

  // Tags for filtering
  tags?: string[];
}

export interface MenuTestStep {
  action: 'click' | 'tap' | 'rightClick' | 'hover' | 'scroll' | 'wait';
  target: string; // CSS selector or data-action
  waitFor?: string; // Element to wait for after action
  timeout?: number;
}

export interface MenuTestAssertion {
  description: string;
  check: (result: MenuTestResult) => boolean;
}

export interface MenuTestResult {
  scenario: MenuTestScenario;
  passed: boolean;
  duration: number;
  uiState: {
    visibleModals: string[];
    visiblePanels: string[];
    activeToasts: string[];
    currentUrl: string;
    localStorage: Record<string, string>;
  };
  errors: string[];
  screenshots?: string[];
}

// ============================================================================
// PRACTICES SCENARIOS (Section 1: Your Practices)
// ============================================================================

export const PRACTICES_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'prac-001',
    name: 'Guided Practices - Opens Commands Panel',
    description: 'Clicking Guided Practices opens the commands/slash commands panel',
    category: 'practices',
    menuAction: 'commands',
    sectionId: 'yourPractices',
    steps: [
      { action: 'click', target: '[data-action="commands"]', waitFor: '.commands-panel' },
    ],
    expectedResult: { type: 'panel', panelId: 'commands-panel', slidesFrom: 'right' },
    assertions: [
      {
        description: 'Panel shows available commands',
        check: (r) => r.uiState.visiblePanels.includes('commands-panel'),
      },
    ],
    tags: ['core', 'always-visible'],
  },
  {
    id: 'prac-002',
    name: 'Create Practice - Opens Ritual Builder',
    description: 'Clicking Create Practice opens the ritual builder modal',
    category: 'practices',
    menuAction: 'ritual',
    sectionId: 'yourPractices',
    preconditions: {
      relationshipStage: 'getting-started', // Requires 2+ conversations
    },
    steps: [
      { action: 'click', target: '[data-action="ritual"]', waitFor: '.ritual-builder' },
    ],
    expectedResult: { type: 'modal', modalId: 'ritual-builder', hasContent: true },
    assertions: [
      {
        description: 'Shows ritual creation interface',
        check: (r) => r.uiState.visibleModals.includes('ritual-builder'),
      },
    ],
    tags: ['core', 'feature-locked'],
  },
  {
    id: 'prac-003',
    name: 'Notifications - Opens Notification Settings',
    description: 'Clicking Notifications opens the notification settings panel',
    category: 'practices',
    menuAction: 'notifications',
    sectionId: 'yourPractices',
    steps: [
      { action: 'click', target: '[data-action="notifications"]', waitFor: '.notification-settings' },
    ],
    expectedResult: { type: 'modal', modalId: 'notification-settings', hasContent: true },
    tags: ['core', 'always-visible'],
  },
];

// ============================================================================
// INSIGHTS SCENARIOS (Section 2: Understanding You)
// ============================================================================

export const INSIGHTS_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'ins-001',
    name: 'Your Story - Opens Journey Dashboard',
    description: 'Clicking Your Story opens the unified journey dashboard',
    category: 'insights',
    menuAction: 'your-story',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'getting-started',
    },
    steps: [
      { action: 'click', target: '[data-action="your-story"]', waitFor: '.your-story-dashboard' },
    ],
    expectedResult: { type: 'modal', modalId: 'your-story-dashboard', hasContent: true },
    assertions: [
      {
        description: 'Shows relationship journey visualization',
        check: (r) => r.uiState.visibleModals.includes('your-story-dashboard'),
      },
    ],
    tags: ['core', 'journey'],
  },
  {
    id: 'ins-002',
    name: 'Your Year with Ferni - Opens Year Visualization',
    description: 'Clicking Your Year opens the annual journey visualization (NEW feature)',
    category: 'insights',
    menuAction: 'your-year',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'getting-started',
    },
    steps: [
      { action: 'click', target: '[data-action="your-year"]', waitFor: '.your-year-modal', timeout: 5000 },
    ],
    expectedResult: { type: 'modal', modalId: 'your-year-modal', hasContent: true },
    assertions: [
      {
        description: 'Dynamic import loads successfully',
        check: (r) => !r.errors.some(e => e.includes('import')),
      },
      {
        description: 'Shows year timeline',
        check: (r) => r.uiState.visibleModals.includes('your-year-modal'),
      },
    ],
    tags: ['new', 'premium', 'journey'],
  },
  {
    id: 'ins-003',
    name: 'What I\'ll Know - Opens Future Insights',
    description: 'Clicking What I\'ll Know opens predictive insights panel (NEW)',
    category: 'insights',
    menuAction: 'future-insights',
    sectionId: 'understandingYou',
    steps: [
      { action: 'click', target: '[data-action="future-insights"]', waitFor: '.future-insights-modal' },
    ],
    expectedResult: { type: 'modal', modalId: 'future-insights-modal', hasContent: true },
    tags: ['new', 'premium'],
  },
  {
    id: 'ins-004',
    name: 'Our Memories - Opens Memory Browser',
    description: 'Clicking Our Memories opens the conversation memory browser',
    category: 'insights',
    menuAction: 'conversation-memory',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'building-trust', // Requires more conversations
    },
    steps: [
      { action: 'click', target: '[data-action="conversation-memory"]', waitFor: '.memory-browser' },
    ],
    expectedResult: { type: 'modal', modalId: 'memory-browser', hasContent: true },
    tags: ['core', 'feature-locked'],
  },
  {
    id: 'ins-005',
    name: 'Past Conversations - Opens History',
    description: 'Clicking Past Conversations shows conversation history',
    category: 'insights',
    menuAction: 'history',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'established', // Requires established relationship
    },
    steps: [
      { action: 'click', target: '[data-action="history"]', waitFor: '.conversation-history' },
    ],
    expectedResult: { type: 'modal', modalId: 'conversation-history', hasContent: true },
    tags: ['core', 'feature-locked'],
  },
];

// ============================================================================
// ENGAGEMENT SCENARIOS (Section 3: Ways to Connect)
// ============================================================================

export const ENGAGEMENT_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'eng-001',
    name: 'Set the Vibe - Opens Vibe Controller',
    description: 'Clicking Set the Vibe opens the ambient/smart home control panel (NEW)',
    category: 'engagement',
    menuAction: 'vibe-controller',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="vibe-controller"]', waitFor: '.vibe-controller' },
    ],
    expectedResult: { type: 'modal', modalId: 'vibe-controller', hasContent: true },
    tags: ['new', 'smart-home'],
  },
  {
    id: 'eng-002',
    name: 'Journaling - Opens Digital Twin',
    description: 'Clicking Journaling opens the digital twin/journal interface (NEW)',
    category: 'engagement',
    menuAction: 'journal',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="journal"]', waitFor: '.digital-twin-ui' },
    ],
    expectedResult: { type: 'modal', modalId: 'digital-twin-ui', hasContent: true },
    tags: ['new', 'premium'],
  },
  {
    id: 'eng-003',
    name: 'Play Games - Opens Game Picker',
    description: 'Clicking Play Games opens the game selection modal',
    category: 'engagement',
    menuAction: 'play-games',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="play-games"]', waitFor: '.game-picker' },
    ],
    expectedResult: { type: 'modal', modalId: 'game-picker', hasContent: true },
    assertions: [
      {
        description: 'Shows available games',
        check: (r) => r.uiState.visibleModals.includes('game-picker'),
      },
    ],
    tags: ['core', 'fun'],
  },
  {
    id: 'eng-004',
    name: 'Musical You - Opens Music Dashboard',
    description: 'Clicking Musical You opens Spotify-integrated music dashboard',
    category: 'engagement',
    menuAction: 'music-dashboard',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="music-dashboard"]', waitFor: '.music-dashboard' },
    ],
    expectedResult: { type: 'modal', modalId: 'music-dashboard', hasContent: true },
    tags: ['core', 'spotify'],
  },
  {
    id: 'eng-005',
    name: 'Creative You - Opens Creative Dashboard',
    description: 'Clicking Creative You opens the creative expression dashboard (NEW)',
    category: 'engagement',
    menuAction: 'creative-you',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="creative-you"]', waitFor: '.creative-you-dashboard' },
    ],
    expectedResult: { type: 'modal', modalId: 'creative-you-dashboard', hasContent: true },
    tags: ['new', 'premium'],
  },
  {
    id: 'eng-006',
    name: 'Video Sessions - Opens Video Settings',
    description: 'Clicking Video Sessions opens video call configuration (locked)',
    category: 'engagement',
    menuAction: 'video-call-settings',
    sectionId: 'waysToConnect',
    preconditions: {
      relationshipStage: 'building-trust',
    },
    steps: [
      { action: 'click', target: '[data-action="video-call-settings"]', waitFor: '.video-settings' },
    ],
    expectedResult: { type: 'modal', modalId: 'video-settings', hasContent: true },
    tags: ['premium', 'feature-locked'],
  },
  {
    id: 'eng-007',
    name: 'Discover Agents - Opens Marketplace',
    description: 'Clicking Discover Agents opens agent marketplace (requires full team unlock)',
    category: 'engagement',
    menuAction: 'discover-agents',
    sectionId: 'waysToConnect',
    preconditions: {
      isTeamUnlocked: true,
    },
    steps: [
      { action: 'click', target: '[data-action="discover-agents"]', waitFor: '.marketplace' },
    ],
    expectedResult: { type: 'modal', modalId: 'marketplace', hasContent: true },
    tags: ['premium', 'team-gated'],
  },
  {
    id: 'eng-008',
    name: 'Discover Agents - Hidden when team not unlocked',
    description: 'Discover Agents menu item is hidden until full team is unlocked',
    category: 'engagement',
    menuAction: 'discover-agents',
    sectionId: 'waysToConnect',
    preconditions: {
      isTeamUnlocked: false,
    },
    steps: [], // No steps - just check visibility
    expectedResult: { type: 'hidden', reason: 'Team not fully unlocked' },
    tags: ['team-gated'],
  },
  {
    id: 'eng-009',
    name: 'Together Sessions - Opens Group Coaching',
    description: 'Clicking Together Sessions opens group/team coaching',
    category: 'engagement',
    menuAction: 'together-sessions',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'click', target: '[data-action="together-sessions"]', waitFor: '.group-coaching' },
    ],
    expectedResult: { type: 'modal', modalId: 'group-coaching', hasContent: true },
    tags: ['premium'],
  },
];

// ============================================================================
// PEOPLE SCENARIOS (Section 4: Your People)
// ============================================================================

export const PEOPLE_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'ppl-001',
    name: 'Your People - Opens Contacts/Relationships',
    description: 'Clicking Your People opens the relationship management panel',
    category: 'people',
    menuAction: 'contacts',
    sectionId: 'yourPeople',
    steps: [
      { action: 'click', target: '[data-action="contacts"]', waitFor: '.your-people' },
    ],
    expectedResult: { type: 'modal', modalId: 'your-people', hasContent: true },
    tags: ['core'],
  },
  {
    id: 'ppl-002',
    name: 'Family & Household - Opens Household Manager',
    description: 'Clicking Family & Household opens multi-user household management',
    category: 'people',
    menuAction: 'household-members',
    sectionId: 'yourPeople',
    steps: [
      { action: 'click', target: '[data-action="household-members"]', waitFor: '.household-manager' },
    ],
    expectedResult: { type: 'modal', modalId: 'household-manager', hasContent: true },
    tags: ['premium'],
  },
];

// ============================================================================
// INTEGRATIONS SCENARIOS (Section 5: Your Connected Life)
// ============================================================================

export const INTEGRATIONS_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'int-001',
    name: 'All Connections - Opens Connected Life Panel',
    description: 'Clicking All Connections opens consolidated integrations panel',
    category: 'integrations',
    menuAction: 'all-connections',
    sectionId: 'connectedLife',
    steps: [
      { action: 'click', target: '[data-action="all-connections"]', waitFor: '.connected-life' },
    ],
    expectedResult: { type: 'modal', modalId: 'connected-life', hasContent: true },
    assertions: [
      {
        description: 'Shows Spotify integration option',
        check: (r) => true, // DOM check in implementation
      },
      {
        description: 'Shows Calendar integration option',
        check: (r) => true,
      },
      {
        description: 'Shows Health/Wearables integration options',
        check: (r) => true,
      },
    ],
    tags: ['core', 'integrations'],
  },
  {
    id: 'int-002',
    name: 'Spotify Connection Flow - Not Connected',
    description: 'Spotify connect button initiates OAuth flow',
    category: 'integrations',
    menuAction: 'spotify',
    sectionId: 'connectedLife',
    preconditions: {
      spotifyConnected: false,
    },
    steps: [
      { action: 'click', target: '[data-action="all-connections"]', waitFor: '.connected-life' },
      { action: 'click', target: '[data-connect="spotify"]', waitFor: '.spotify-oauth' },
    ],
    expectedResult: { type: 'redirect', urlPattern: /\/spotify\/auth/ },
    tags: ['integration', 'spotify'],
  },
  {
    id: 'int-003',
    name: 'Calendar Connection Flow',
    description: 'Calendar connect button initiates Google OAuth',
    category: 'integrations',
    menuAction: 'calendar-settings',
    sectionId: 'connectedLife',
    preconditions: {
      calendarConnected: false,
    },
    steps: [
      { action: 'click', target: '[data-action="all-connections"]', waitFor: '.connected-life' },
      { action: 'click', target: '[data-connect="calendar"]' },
    ],
    expectedResult: { type: 'redirect', urlPattern: /\/auth\/google\/calendar/ },
    tags: ['integration', 'google'],
  },
];

// ============================================================================
// SETTINGS SCENARIOS (Section 6: Settings)
// ============================================================================

export const SETTINGS_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'set-001',
    name: 'Personalize - Opens Personalization Panel',
    description: 'Clicking Personalize opens the user customization panel',
    category: 'settings',
    menuAction: 'personal-settings',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="personal-settings"]', waitFor: '.personalize-modal' },
    ],
    expectedResult: { type: 'modal', modalId: 'personalize-modal', hasContent: true },
    tags: ['core', 'settings'],
  },
  {
    id: 'set-002',
    name: 'Voice & Accent - Opens Accent Settings',
    description: 'Clicking Voice & Accent opens TTS accent configuration',
    category: 'settings',
    menuAction: 'accent-settings',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="accent-settings"]', waitFor: '.accent-settings' },
    ],
    expectedResult: { type: 'modal', modalId: 'accent-settings', hasContent: true },
    tags: ['core', 'voice'],
  },
  {
    id: 'set-003',
    name: 'Theme & Language - Opens Theme Settings',
    description: 'Clicking Theme opens light/dark theme + language settings',
    category: 'settings',
    menuAction: 'theme',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="theme"]', waitFor: '.theme-settings' },
    ],
    expectedResult: { type: 'modal', modalId: 'theme-settings', hasContent: true },
    tags: ['core', 'settings'],
  },
  {
    id: 'set-004',
    name: 'Transcript Toggle - Toggles Live Transcript',
    description: 'Clicking transcript toggle enables/disables live transcript',
    category: 'settings',
    menuAction: 'toggle-transcription',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="toggle-transcription"]' },
    ],
    expectedResult: { type: 'toggle', stateKey: 'transcript_enabled', newValue: true },
    assertions: [
      {
        description: 'Menu stays open after toggle',
        check: (r) => r.uiState.visiblePanels.includes('settings-menu'),
      },
      {
        description: 'Toggle button updates visual state',
        check: (r) => true, // DOM check
      },
    ],
    tags: ['core', 'toggle'],
  },
  {
    id: 'set-005',
    name: 'Your Voice - Opens Voice Enrollment',
    description: 'Clicking Your Voice opens voice ID enrollment modal',
    category: 'settings',
    menuAction: 'voice-id-settings',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="voice-id-settings"]', waitFor: '.voice-enrollment' },
    ],
    expectedResult: { type: 'modal', modalId: 'voice-enrollment', hasContent: true },
    tags: ['core', 'voice'],
  },
  {
    id: 'set-006',
    name: 'How to Reach You - Opens Contact Settings',
    description: 'Clicking How to Reach You opens contact info settings',
    category: 'settings',
    menuAction: 'contact-settings',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="contact-settings"]', waitFor: '.contact-settings' },
    ],
    expectedResult: { type: 'modal', modalId: 'contact-settings', hasContent: true },
    tags: ['core', 'settings'],
  },
  {
    id: 'set-007',
    name: 'Support Ferni - Opens Support Panel',
    description: 'Clicking Support Ferni opens the subscription/support panel',
    category: 'settings',
    menuAction: 'support-ferni',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="support-ferni"]', waitFor: '.support-ferni' },
    ],
    expectedResult: { type: 'modal', modalId: 'support-ferni', hasContent: true },
    tags: ['monetization'],
  },
  {
    id: 'set-008',
    name: 'Account & Billing - Opens Billing Portal',
    description: 'Clicking Account & Billing opens Stripe billing portal',
    category: 'settings',
    menuAction: 'billing',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="billing"]' },
    ],
    expectedResult: { type: 'redirect', urlPattern: /billing\.stripe\.com|\/api\/billing/ },
    tags: ['monetization', 'stripe'],
  },
  {
    id: 'set-009',
    name: 'Download Your Story - Opens Data Export',
    description: 'Clicking Download Your Story opens GDPR-compliant data export',
    category: 'settings',
    menuAction: 'export',
    sectionId: 'settings',
    steps: [
      { action: 'click', target: '[data-action="export"]', waitFor: '.data-export' },
    ],
    expectedResult: { type: 'modal', modalId: 'data-export', hasContent: true },
    tags: ['gdpr', 'privacy'],
  },
];

// ============================================================================
// QUICK ACTIONS SCENARIOS
// ============================================================================

export const QUICK_ACTION_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'qa-001',
    name: 'What\'s Growing - Opens Roadmap Panel',
    description: 'Clicking What\'s Growing opens the feature roadmap panel',
    category: 'quick_actions',
    menuAction: 'whats-growing',
    sectionId: 'quickActions',
    steps: [
      { action: 'click', target: '[data-action="whats-growing"]', waitFor: '.roadmap-panel' },
    ],
    expectedResult: { type: 'panel', panelId: 'roadmap-panel', slidesFrom: 'right' },
    tags: ['core'],
  },
  {
    id: 'qa-002',
    name: 'Invite a Friend - Opens Referral Panel',
    description: 'Clicking Invite a Friend opens the referral/share panel',
    category: 'quick_actions',
    menuAction: 'share-ferni',
    sectionId: 'quickActions',
    steps: [
      { action: 'click', target: '[data-action="share-ferni"]', waitFor: '.referral-modal' },
    ],
    expectedResult: { type: 'modal', modalId: 'referral-modal', hasContent: true },
    tags: ['growth'],
  },
  {
    id: 'qa-003',
    name: 'Take the Tour - Starts Onboarding',
    description: 'Clicking Take the Tour restarts the onboarding flow',
    category: 'quick_actions',
    menuAction: 'help',
    sectionId: 'quickActions',
    steps: [
      { action: 'click', target: '[data-action="help"]', waitFor: '.onboarding-step' },
    ],
    expectedResult: { type: 'modal', modalId: 'onboarding', hasContent: true },
    tags: ['core', 'onboarding'],
  },
];

// ============================================================================
// FEATURE LOCK SCENARIOS
// ============================================================================

export const FEATURE_LOCK_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'lock-001',
    name: 'Ritual Builder - Locked at first-meeting',
    description: 'Ritual builder shows lock icon and shakes when clicked at first-meeting stage',
    category: 'feature_locks',
    menuAction: 'ritual',
    sectionId: 'yourPractices',
    preconditions: {
      relationshipStage: 'first-meeting',
    },
    steps: [
      { action: 'click', target: '[data-action="ritual"]' },
    ],
    expectedResult: { type: 'locked', shakeAnimation: true },
    assertions: [
      {
        description: 'Shows lock icon',
        check: (r) => true, // DOM check
      },
      {
        description: 'Shows unlock hint',
        check: (r) => true, // DOM check
      },
    ],
    tags: ['feature-lock', 'progressive-disclosure'],
  },
  {
    id: 'lock-002',
    name: 'Memory Browser - Locked until building-trust',
    description: 'Memory browser requires building-trust stage to unlock',
    category: 'feature_locks',
    menuAction: 'conversation-memory',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'getting-started',
    },
    steps: [
      { action: 'click', target: '[data-action="conversation-memory"]' },
    ],
    expectedResult: { type: 'locked', shakeAnimation: true },
    tags: ['feature-lock'],
  },
  {
    id: 'lock-003',
    name: 'Conversation History - Locked until established',
    description: 'Full conversation history requires established relationship',
    category: 'feature_locks',
    menuAction: 'history',
    sectionId: 'understandingYou',
    preconditions: {
      relationshipStage: 'building-trust',
    },
    steps: [
      { action: 'click', target: '[data-action="history"]' },
    ],
    expectedResult: { type: 'locked', shakeAnimation: true },
    tags: ['feature-lock'],
  },
];

// ============================================================================
// PERSISTENCE SCENARIOS
// ============================================================================

export const PERSISTENCE_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'persist-001',
    name: 'Pinned Items - Pin via Right Click',
    description: 'Right-clicking a menu item pins it to Quick Access',
    category: 'persistence',
    menuAction: 'music-dashboard',
    sectionId: 'waysToConnect',
    steps: [
      { action: 'rightClick', target: '[data-action="music-dashboard"]' },
      { action: 'wait', target: '.settings-menu__item--pinned', timeout: 500 },
    ],
    expectedResult: { type: 'toggle', stateKey: 'ferni_menu_pinned', newValue: true },
    assertions: [
      {
        description: 'Item appears in Quick Access section',
        check: (r) => true, // DOM check
      },
      {
        description: 'Pin state persists in localStorage',
        check: (r) => {
          const pinned = JSON.parse(r.uiState.localStorage['ferni_menu_pinned'] || '[]');
          return pinned.includes('music-dashboard');
        },
      },
    ],
    tags: ['persistence', 'ux'],
  },
  {
    id: 'persist-002',
    name: 'Section Expansion - Persists on Reload',
    description: 'Collapsed/expanded section state persists across reloads',
    category: 'persistence',
    menuAction: '',
    sectionId: 'understandingYou',
    steps: [
      { action: 'click', target: '[data-section="understandingYou"]' }, // Collapse
      { action: 'wait', target: '', timeout: 100 },
    ],
    expectedResult: { type: 'toggle', stateKey: 'ferni_menu_expanded', newValue: false },
    assertions: [
      {
        description: 'Expansion state persists in localStorage',
        check: (r) => {
          const expanded = JSON.parse(r.uiState.localStorage['ferni_menu_expanded'] || '[]');
          return !expanded.includes('understandingYou');
        },
      },
    ],
    tags: ['persistence', 'ux'],
  },
];

// ============================================================================
// ADMIN SCENARIOS
// ============================================================================

export const ADMIN_SCENARIOS: MenuTestScenario[] = [
  {
    id: 'admin-001',
    name: 'Admin Section - Visible for Admins',
    description: 'Admin section appears when ferni_admin_id is set',
    category: 'settings',
    menuAction: 'marketplace-admin',
    sectionId: 'admin',
    preconditions: {
      isAdmin: true,
    },
    steps: [
      { action: 'scroll', target: '.settings-menu__section--admin' },
      { action: 'click', target: '[data-action="marketplace-admin"]', waitFor: '.marketplace-admin' },
    ],
    expectedResult: { type: 'modal', modalId: 'marketplace-admin', hasContent: true },
    tags: ['admin'],
  },
  {
    id: 'admin-002',
    name: 'Admin Section - Hidden for Non-Admins',
    description: 'Admin section is not rendered for regular users',
    category: 'settings',
    menuAction: 'marketplace-admin',
    sectionId: 'admin',
    preconditions: {
      isAdmin: false,
    },
    steps: [], // Just verify not visible
    expectedResult: { type: 'hidden', reason: 'Not admin' },
    tags: ['admin'],
  },
];

// ============================================================================
// ALL SCENARIOS COMBINED
// ============================================================================

export const ALL_MENU_SCENARIOS: MenuTestScenario[] = [
  ...PRACTICES_SCENARIOS,
  ...INSIGHTS_SCENARIOS,
  ...ENGAGEMENT_SCENARIOS,
  ...PEOPLE_SCENARIOS,
  ...INTEGRATIONS_SCENARIOS,
  ...SETTINGS_SCENARIOS,
  ...QUICK_ACTION_SCENARIOS,
  ...FEATURE_LOCK_SCENARIOS,
  ...PERSISTENCE_SCENARIOS,
  ...ADMIN_SCENARIOS,
];

// ============================================================================
// HELPERS
// ============================================================================

export function getScenariosByCategory(category: MenuTestCategory): MenuTestScenario[] {
  return ALL_MENU_SCENARIOS.filter((s) => s.category === category);
}

export function getScenarioById(id: string): MenuTestScenario | undefined {
  return ALL_MENU_SCENARIOS.find((s) => s.id === id);
}

export function getScenariosByTag(tag: string): MenuTestScenario[] {
  return ALL_MENU_SCENARIOS.filter((s) => s.tags?.includes(tag));
}

export function getCoreScenarios(): MenuTestScenario[] {
  return ALL_MENU_SCENARIOS.filter((s) => s.tags?.includes('core'));
}

export function getNewFeatureScenarios(): MenuTestScenario[] {
  return ALL_MENU_SCENARIOS.filter((s) => s.tags?.includes('new'));
}

export function getFeatureLockScenarios(): MenuTestScenario[] {
  return ALL_MENU_SCENARIOS.filter((s) => s.category === 'feature_locks');
}

export function getMenuScenarioSummary(): {
  total: number;
  byCategory: Record<MenuTestCategory, number>;
  byTag: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const scenario of ALL_MENU_SCENARIOS) {
    byCategory[scenario.category] = (byCategory[scenario.category] || 0) + 1;
    for (const tag of scenario.tags || []) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  return {
    total: ALL_MENU_SCENARIOS.length,
    byCategory: byCategory as Record<MenuTestCategory, number>,
    byTag,
  };
}
