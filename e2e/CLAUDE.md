# E2E Tests

**End-to-end test suite** using Playwright for full user journey testing.

## Structure

All test files are `.spec.ts` files in this directory (~65 test files).

## Test Categories

| Category | Files | Purpose |
|----------|-------|---------|
| **Auth/Onboarding** | `auth.spec.ts`, `onboarding.spec.ts` | Login, signup flows |
| **Voice Features** | `voice-*.spec.ts` | Voice identity, journals, sessions |
| **Personas** | `persona-handoff.spec.ts`, `cognitive-*.spec.ts` | Persona switching, differentiation |
| **Team Features** | `team-*.spec.ts`, `group-*.spec.ts` | Team roster, group coaching |
| **Intelligence** | `predictive-*.spec.ts`, `memory-*.spec.ts` | Predictive features, memory |
| **Integrations** | `integrations.spec.ts`, `calendar.spec.ts` | External service integrations |
| **Monetization** | `subscription.spec.ts`, `billing.spec.ts` | Payment, subscriptions |
| **Admin** | `admin-portal.spec.ts` | Admin functionality |

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test file
pnpm test:e2e auth.spec.ts

# Run with UI
pnpm test:e2e --ui

# Run headed (visible browser)
pnpm test:e2e --headed
```

## Key Test Files

| File | Tests |
|------|-------|
| `ferni-eq.spec.ts` | Superhuman emotional intelligence |
| `trust-systems.spec.ts` | Trust building flows |
| `journey.spec.ts` | Full user journey (~30KB) |
| `custom-agent.spec.ts` | Agent builder flows |
| `dev-panel.spec.ts` | Dev mode functionality |

## Configuration

Tests use Playwright config at root: `playwright.config.ts`

## Writing Tests

1. Follow existing patterns in similar test files
2. Use page objects where available
3. Test user journeys, not implementation details
4. Include accessibility assertions where relevant

## Related

- `tests/` - Integration and synthetic tests
- `src/tests/` - Unit tests (Vitest)
