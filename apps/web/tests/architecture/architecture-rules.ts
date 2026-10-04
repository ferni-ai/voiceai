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
  polish: 70,
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
  // App state, platform adapters, API client wrappers.
  state: 40,
  api: 40,
  mobile: 40,
  // Low-level shared modules.
  i18n: 20,
  theme: 20,
  utils: 10,
  config: 10,
  data: 10,
  // Pure type definitions.
  types: 0,
  // Swapped in for native/Firebase packages via tsconfig/vite aliases only.
  stubs: 0,
  // Stylesheets only; listed so every folder is classified.
  styles: 0,
};

/** Test files may import anything; they are not subject to layer rules. */
export const TEST_FILE = /(^|\/)__tests__\/|\.test\.ts$/;

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
    // Billing helper shows toasts. Fix: return a result and let the caller toast.
    'src/utils/billing.ts -> src/ui/whisper.ui.ts',
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
  ],
  'layer:ui': [
    // Lazy imports of app/ orchestration from views. Fix: dispatch an event app/ handles.
    'src/ui/activity.ui.ts -> src/app/panel-methods.ts',
    // Dev-only panel triggering a wrap-up through the real message handler.
    'src/ui/dev-panel.ui.ts -> src/app/data-message-handlers.ts',
  ],
  'boundary:stubs': [
    // Imports the Capacitor/HealthKit stub directly instead of '@capacitor/core',
    // so isNativePlatform() is always false and Apple Health is off even in the
    // iPhone app. Switching to '@capacitor/core' needs a real HealthKit plugin
    // first, or iOS would offer a permission flow that always fails.
    'src/services/biometrics.service.ts -> src/stubs/capacitor-stub.ts',
  ],
};
