/**
 * Nothing new may initialize firebase-admin itself or use its namespaced API.
 *
 * firebase-admin 14 removes the namespaced API (`import admin from 'firebase-admin'`,
 * `admin.firestore()`, `admin.apps`), and the default app must be initialized in one
 * place (getAdminApp in ../firebase-admin-app.ts) so its config doesn't depend on which
 * module runs first. The files below predate that and are being moved over in small
 * PRs; remove a file from the list when you migrate it. When the list is empty the
 * firebase-admin 14 bump can land, and this test keeps it from coming back.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const HELPER = 'src/utils/firebase-admin-app.ts';

const NOT_YET_MIGRATED = new Set([
  'src/agents/shared/performance/batch-firestore.ts',
  'src/agents/shared/shutdown-handler.ts',
  'src/agents/voice-agent/session-init-handler.ts',
  'src/api/__tests__/roadmap-seeds.emulator.test.ts',
  'src/api/admin-routes.ts',
  'src/api/custom-agent-features.routes.ts',
  'src/api/garden-routes.ts',
  'src/api/habit-routes.ts',
  'src/api/jobs/cleanup-orphaned-uploads.ts',
  'src/api/roadmap-routes.ts',
  'src/api/roadmap-seeds.ts',
  'src/api/routes/conversation-threads.ts',
  'src/api/seeds-routes.ts',
  'src/api/sites-routes.ts',
  'src/api/v1/developers/auth-routes.ts',
  'src/api/v1/developers/shared/developer-auth.ts',
  'src/api/waitlist-routes.ts',
  'src/audio/music-transition-analytics.ts',
  'src/conversation/humanization/persistence.ts',
  'src/conversation/humanization/voice-pattern-learning.ts',
  'src/intelligence/semantic-intelligence/persistence.ts',
  'src/intelligence/user-knowledge/firestore.ts',
  'src/marketplace/billing/persistence.ts',
  'src/marketplace/persistence/firestore.ts',
  'src/marketplace/reviews/persistence.ts',
  'src/scripts/query-threads.ts',
  'src/services/admin-activity.ts',
  'src/services/admin/admin-activity.ts',
  'src/services/admin/daily-report.ts',
  'src/services/analytics/humanization-analytics.ts',
  'src/services/analytics/user-analytics.ts',
  'src/services/billing/subscription-metrics.ts',
  'src/services/coaching/persistence.ts',
  'src/services/cognitive-intelligence/ant-tracker.ts',
  'src/services/data-layer/ttl-cleanup.ts',
  'src/services/engagement/ritual-onboarding.ts',
  'src/services/engagement/seed-economy.ts',
  'src/services/experiments/web-experiments.ts',
  'src/services/family/family-messages.ts',
  'src/services/games/game-analytics.ts',
  'src/services/gtm/gtm-storage.ts',
  'src/services/identity/firebase-auth.ts',
  'src/services/identity/sponsored-identity.ts',
  'src/services/memory/human-listening-memory.ts',
  'src/services/memory/voice-conversation-memory.ts',
  'src/services/monetization/ferni-fund.ts',
  'src/services/outreach/firestore-persistence.ts',
  'src/services/outreach/unified-delivery.ts',
  'src/services/platform/privacy-crypto.ts',
  'src/services/platform/security-events.ts',
  'src/services/pubsub/worker-main.ts',
  'src/services/roadmap/storage.ts',
  'src/services/scheduling/appointment-followup.ts',
  'src/services/scheduling/appointment-integration.ts',
  'src/services/scheduling/proactive-insights-service.ts',
  'src/services/scheduling/ritual-onboarding.ts',
  'src/services/seeds/__tests__/ledger.emulator.test.ts',
  'src/services/seeds/ledger.ts',
  'src/services/self-healing/health-monitors.ts',
  'src/services/trust-systems/notification-delivery.ts',
  'src/services/voice/voice-audit-log.ts',
  'src/services/voice/voice-household.ts',
  'src/services/voice/voice-profile-store.ts',
  'src/tests/intelligence/better-than-human-integration.test.ts',
  'src/tools/domains/shared/analytics.ts',
  'src/utils/__tests__/firestore-ref-wrapping.test.ts',
]);

const NAMESPACED_IMPORT = /from ['"]firebase-admin['"]/;
const DIRECT_INIT = /\binitializeApp\(/;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function offenders(): string[] {
  return tsFiles(join(REPO_ROOT, 'src'))
    .map((path) => ({ file: relative(REPO_ROOT, path), text: readFileSync(path, 'utf8') }))
    .filter(
      ({ file }) => file !== HELPER && !file.startsWith('src/utils/__tests__/firebase-admin-app')
    )
    .filter(({ text }) => NAMESPACED_IMPORT.test(text) || DIRECT_INIT.test(text))
    .map(({ file }) => file);
}

describe('firebase-admin is initialized in one place', () => {
  it('no file outside the migration list imports the namespaced API or calls initializeApp', () => {
    const unexpected = offenders().filter((file) => !NOT_YET_MIGRATED.has(file));
    expect(unexpected, `use getAdminApp()/getAdminFirestore() from ${HELPER}`).toEqual([]);
  });

  it('the migration list only names files that still need migrating', () => {
    const stillOffending = new Set(offenders());
    const migrated = [...NOT_YET_MIGRATED].filter((file) => !stillOffending.has(file));
    expect(migrated, 'remove these from NOT_YET_MIGRATED').toEqual([]);
  });
});
