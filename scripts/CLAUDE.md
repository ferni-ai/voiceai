# Scripts

**Utility scripts** for development, testing, deployment, and operations (~130 scripts).

## Categories

### Setup & Configuration
| Script | Purpose |
|--------|---------|
| `setup-all-api-keys.sh` | Configure all API keys |
| `setup-google-oauth.sh` | Google OAuth setup |
| `setup-integration-secrets.sh` | Integration credentials |
| `setup-livekit-forks.sh` | LiveKit fork setup |
| `setup-livekit-sip.ts` | SIP/telephony setup |
| `setup-smart-home.ts` | Smart home integrations |
| `migrate-to-pnpm.sh` | pnpm migration helper |

### Deployment
| Script | Purpose |
|--------|---------|
| `deploy-cloud-scheduler.ts` | Deploy scheduled jobs |
| `deploy-semantic-store.ts` | Deploy semantic store |
| `deploy-marketplace-scheduler.sh` | Marketplace jobs |
| `deploy-joel-page.mts` | Deploy Joel landing page |

### Testing
| Script | Purpose |
|--------|---------|
| `test-better-than-human-e2e.ts` | E2E superhuman tests |
| `test-gemini-*.ts` | Gemini model tests |
| `test-livekit-*.ts` | LiveKit integration tests |
| `test-music-integrations.ts` | Music service tests |
| `test-outbound-call.ts` | Outbound calling tests |

### Validation
| Script | Purpose |
|--------|---------|
| `validate-architecture.ts` | Architecture layer checks |
| `validate-tools.ts` | Tool registry validation |
| `validate-identity.ts` | Identity system validation |
| `validate-outbound-system.ts` | Outbound call validation |

### Data & Debugging
| Script | Purpose |
|--------|---------|
| `diagnose-*.ts` | Various diagnostic scripts |
| `check-my-data.ts` | User data inspection |
| `analyze-tool-usage.ts` | Tool usage analytics |
| `seed-memory-data.ts` | Seed test data |

### Cleanup & Maintenance
| Script | Purpose |
|--------|---------|
| `cleanup-anonymous-users.ts` | Remove anonymous users |
| `delete-stale-profiles.ts` | Clean old profiles |

## Running Scripts

```bash
# TypeScript scripts
npx tsx scripts/script-name.ts

# Shell scripts
./scripts/script-name.sh

# With pnpm (if defined in package.json)
pnpm script-name
```

## Key Scripts for Daily Work

```bash
# Validate everything works
npx tsx scripts/validate-architecture.ts
npx tsx scripts/validate-tools.ts

# Debug user issues
npx tsx scripts/check-my-data.ts
npx tsx scripts/diagnose-user-data.ts

# Test integrations
npx tsx scripts/test-music-integrations.ts
npx tsx scripts/test-better-than-human-e2e.ts
```

## Adding New Scripts

1. Create `.ts` or `.sh` file in this directory
2. For TypeScript: use `tsx` for execution
3. Add to `package.json` scripts if frequently used
4. Document purpose in file header comment

## Related

- `src/tests/` - Unit tests (Vitest)
- `e2e/` - E2E tests (Playwright)
- `tests/` - Integration tests
