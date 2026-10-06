/**
 * Architecture rules for apps/web/src, plus the baseline of known violations.
 *
 * Layering follows the same convention as the backend validator
 * (apps/cli/src/commands/quality/architecture-validator.ts): every top-level
 * folder under src/ has a level, and a file may only import folders at its
 * own level or below.
 *
 * BASELINE: violations that existed when these tests were introduced and are
 * too large to fix safely in one pass. The tests fail on any violation not
 * listed here, and also on any listed entry that no longer occurs, so the
 * baseline can only shrink. Do not add entries; fix the dependency instead.
 */

/** A file in src/ that may import any folder at its own level or lower. */
export const LAYER_LEVELS: Readonly<Record<string, number>> = {
  // Application shell: src/*.ts (app.ts, index.ts, brand.ts) and app/ orchestration.
  '(root)': 100,
  app: 100,
  // Admin portal: only the app shell may load it.
  admin: 90,
  // Feature UI. Peers: eq drives avatar views in ui/, ui reads eq state.
  ui: 70,
  eq: 70,
  narrative: 70,
  pages: 70,
  // Reusable base components: no feature UI, no app shell.
  components: 65,
  // Business logic and backend I/O.
  services: 60,
  // Emotion state and animation choreography that services may drive.
  emotion: 55,
  animation: 55,
  // Animation/presence systems: pure, config-driven.
  systems: 50,
  // App state.
  state: 40,
  // Low-level shared modules.
  i18n: 20,
  theme: 20,
  utils: 10,
  config: 10,
  data: 10,
  // Pure type definitions.
  types: 0,
  // Swapped in for Firebase packages via tsconfig/vite aliases only.
  stubs: 0,
  // Stylesheets only; listed so every folder is classified.
  styles: 0,
};

/**
 * Unit tests may import anything; they are not subject to layer rules.
 * `src/ui/soul.test.ts` is a production console helper (window.testSoul), not a unit test.
 */
export const TEST_FILE = /(^|\/)__tests__\/|(?<!\/soul)\.test\.ts$/;

/** Generated files and the one module allowed to import each of them. */
export const GENERATED_ENTRY_POINTS: Readonly<Record<string, string>> = {
  'src/config/animation-constants.generated.ts': 'src/config/animation-constants.ts',
  'src/config/persona-colors.generated.ts': 'src/config/persona-colors.ts',
  'src/config/expressions.generated.ts': 'src/config/avatar-expressions.ts',
};

/** Modules with a documented public API: outsiders import the entry, not internals. */
export const PUBLIC_ENTRY_MODULES: ReadonlyArray<{
  readonly folder: string;
  readonly entry: RegExp;
  /** Files outside the folder that may still re-export its internals. */
  readonly shims?: RegExp;
}> = [
  {
    folder: 'src/eq/',
    entry: /^src\/eq\/index\.ts$/,
    // Deprecated backward-compatibility shim documented in apps/web/CLAUDE.md.
    shims: /^src\/ui\/better-than-human\.ui\.ts$/,
  },
  { folder: 'src/components/', entry: /^src\/components\/(.+\/)?index\.ts$/ },
];

/** Modules outside src/ the frontend may import. Anything else (e.g. backend src/) is forbidden. */
export const ALLOWED_EXTERNAL_SOURCE = /^\.\.\/\.\.\/design-system\//;

export const MAX_LINES = 500;

/**
 * Upper bound on apps/web entries in the repo ratchet baseline
 * (apps/cli/src/commands/quality/ratchet-baseline.json), which is the
 * grandfather list for oversized files. `ratchet --update` only lowers it;
 * this cap catches a wholesale `ratchet --init` that would grandfather new files.
 */
export const MAX_GRANDFATHERED_WEB_FILES = 321;

/** Directory names that are not kebab-case by convention. */
export const DIRECTORY_NAME_EXCEPTIONS: ReadonlySet<string> = new Set(['__tests__']);

/** `source -> target` dependency keys grandfathered per rule id. */
export const BASELINE: Readonly<Record<string, readonly string[]>> = {
  'layer:types': [
    // events.ts mixes runtime message validators (which log) with type definitions.
    // Fix: move the validators to utils/ or services/ and keep types/ pure.
    'src/types/events.ts -> src/utils/logger.ts',
  ],
  'layer:utils': [
    // The API client reads the Firebase token straight from the auth service.
    // Fix: invert with an auth-token provider registered by the auth service at startup.
    'src/utils/api.ts -> src/services/firebase-auth.service.ts',
    'src/utils/api-helpers.ts -> src/services/firebase-auth.service.ts',
    // Helpers translate errors themselves. Fix: return codes and let the caller translate.
    'src/utils/api.ts -> src/i18n/index.ts',
    'src/utils/api-helpers.ts -> src/i18n/index.ts',
    'src/utils/billing.ts -> src/i18n/index.ts',
    // Billing helper shows toasts. Fix: return a result and let the caller toast.
    'src/utils/billing.ts -> src/ui/whisper.ui.ts',
  ],
  'layer:state': [
    // App state reads the Firebase user directly.
    // Fix: accept the user via a setter registered by the auth service at startup.
    'src/state/app.state.ts -> src/services/firebase-auth.service.ts',
  ],
  'layer:emotion': [
    // The expression bridge pushes emotion state into the avatar views.
    // Fix: have the views subscribe to emotion events instead.
    'src/emotion/emotion-expression-bridge.ts -> src/ui/ferni-expressions.ui.ts',
    'src/emotion/emotion-expression-bridge.ts -> src/ui/luxo-expressions.ui.ts',
  ],
  'layer:services': [
    // Services that show toasts directly. Fix: emit an event or return a result for ui/ to toast.
    'src/services/founders.service.ts -> src/ui/whisper.ui.ts',
    'src/services/linkedin.service.ts -> src/ui/whisper.ui.ts',
    'src/services/push-preference.ts -> src/ui/whisper.ui.ts',
    // Services that open or drive UI components. Fix: dispatch DOM/custom events
    // the components subscribe to, or move the orchestration into app/.
    'src/services/brand-system.ts -> src/ui/celebration.ui.ts',
    'src/services/brand-system.ts -> src/ui/empty-state.ui.ts',
    'src/services/celebration.service.ts -> src/ui/ferni-expressions.ui.ts',
    'src/services/cross-team-notifications.service.ts -> src/ui/proactive-outreach.ui.ts',
    'src/services/delight.service.ts -> src/ui/celebrations.ui.ts',
    'src/services/humanization-bridge.service.ts -> src/ui/better-than-human.ui.ts',
    'src/services/humanization-bridge.service.ts -> src/ui/ferni-expressions.ui.ts',
    'src/services/humanization-bridge.service.ts -> src/ui/memory-feedback.ui.ts',
    'src/services/life-context-updates.service.ts -> src/ui/life-context-dashboard.ui.ts',
    'src/services/monetization-integration.service.ts -> src/ui/ferni-fund.ui.ts',
    'src/services/monetization-integration.service.ts -> src/ui/value-capture.ui.ts',
    'src/services/predictive-insights.service.ts -> src/ui/predictive-insights.ui.ts',
    'src/services/progressive-features.service.ts -> src/ui/feature-hints.ui.ts',
    'src/services/progressive-features.service.ts -> src/ui/persona-intro.ui.ts',
    'src/services/progressive-features.service.ts -> src/ui/progress-indicator.ui.ts',
    'src/services/progressive-features.service.ts -> src/ui/stage-celebration.ui.ts',
    'src/services/progressive-features.service.ts -> src/ui/trust-signals.ui.ts',
    'src/services/ritual-engine.service.ts -> src/ui/celebration.ui.ts',
    'src/services/rituals.service.ts -> src/ui/ritual-builder.ui.ts',
    'src/services/your-story.service.ts -> src/ui/visualizations/index.ts',
    // Engagement demo/service import the views they populate. Fix: emit data and let ui/ subscribe.
    'src/services/engagement-demo-data.ts -> src/ui/engagement.ui.ts',
    'src/services/engagement-demo-data.ts -> src/ui/team-huddle.ui.ts',
    'src/services/engagement.service.ts -> src/ui/engagement.ui.ts',
    // Soul-stats talks to the admin API client. Fix: move the call behind a services/ API wrapper.
    'src/services/soul-stats.service.ts -> src/admin/admin-api.ts',
  ],
  'generated:src/config/animation-constants.generated.ts': [
    // Feature UI reads generated tokens directly. Fix: import animation-constants.ts instead.
    'src/ui/activity.ui.ts -> src/config/animation-constants.generated.ts',
  ],
  'generated:src/config/expressions.generated.ts': [
    // Callers read generated expressions directly. Fix: import avatar-expressions.ts instead.
    'src/app/data-message-handlers.ts -> src/config/expressions.generated.ts',
    'src/emotion/emotion-expression-bridge.ts -> src/config/expressions.generated.ts',
    'src/ui/luxo-expressions.ui.ts -> src/config/expressions.generated.ts',
  ],
  'entry:src/eq/': [
    // Session handlers reach into eq internals. Fix: import from src/eq/index.ts.
    'src/app/data-message-handlers.ts -> src/eq/bridge/index.ts',
    'src/app/data-message-handlers.ts -> src/eq/types.ts',
  ],
  'entry:src/components/': [
    // Team intro constructs a modal from the internals. Fix: import from the public components entry.
    'src/ui/team-intro.ui.ts -> src/components/base/modal.ts',
  ],
  'cycle:static': [
    // Voice-journal calendar/entries and recording/save import each other. Fix: extract shared types.
    'src/ui/voice-journal/entries.ts -> src/ui/voice-journal/calendar.ts',
    'src/ui/voice-journal/save.ts -> src/ui/voice-journal/recording.ts',
    // Engagement service and view import each other (also via demo-data). Fix: emit events; ui/ subscribes.
    'src/services/engagement.service.ts -> src/ui/engagement.ui.ts',
    'src/services/engagement.service.ts -> src/ui/engagement.ui.ts -> src/services/engagement-demo-data.ts',
    'src/ui/engagement.ui.ts -> src/services/engagement-demo-data.ts',
    // Ferni Care views import each other. Fix: extract shared state to a peer module.
    'src/ui/ferni-care/routine-builder.ui.ts -> src/ui/ferni-care/dashboard.ui.ts -> src/ui/ferni-care/ideas-gallery.ui.ts',
  ],
  'cycle:graph': [
    // Same leftover cycles as cycle:static, keyed as sorted file groups from the compiler graph.
    'src/services/engagement-demo-data.ts -> src/services/engagement.service.ts -> src/ui/engagement.ui.ts',
    'src/ui/ferni-care/dashboard.ui.ts -> src/ui/ferni-care/ideas-gallery.ui.ts -> src/ui/ferni-care/routine-builder.ui.ts',
    'src/ui/voice-journal/calendar.ts -> src/ui/voice-journal/entries.ts',
    'src/ui/voice-journal/recording.ts -> src/ui/voice-journal/save.ts',
  ],
  'layer:ui': [
    // Lazy imports of app/ orchestration from views. Fix: dispatch an event app/ handles.
    'src/ui/activity.ui.ts -> src/app/panel-methods.ts',
    // Dev-only panel triggering a wrap-up through the real message handler.
    'src/ui/dev-panel.ui.ts -> src/app/data-message-handlers.ts',
  ],
  'boundary:stubs': [],
};
