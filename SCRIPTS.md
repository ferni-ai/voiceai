# 📜 Ferni Scripts Reference

> **Auto-generated** - Do not edit directly. Run `npm run generate scripts-doc` to update.

This document lists all available npm scripts in the Ferni project.

## 🚀 Quick Start

```bash
# Interactive CLI
npm run ferni

# Most common commands
npm run dev                 # Start development
npm run test:cli quick      # Quick validation
npm run deploy all          # Deploy everything
```

---

## 🛠️ Core Development

Primary development commands

| Script | Command |
|--------|----------|
| `npm run build` | `tsc -p tsconfig.build.json` |
| `npm run dev` | `tsx src/agent.ts dev` |
| `npm run dev:e2e` | `source .env.e2e-all-features 2>/dev/null || true && npx t...` |
| `npm run dev:full` | `npm run token-server & npm run dev` |
| `npm run dev:jack` | `PERSONA_ID=jack-bogle tsx src/agent.ts dev` |
| `npm run dev:jack-b` | `PERSONA_ID=jack-b tsx src/agent.ts dev` |
| `npm run dev:peter` | `PERSONA_ID=peter-lynch tsx src/agent.ts dev` |
| `npm run start` | `node dist/agent.js start` |
| `npm run start:jack` | `PERSONA_ID=jack-bogle node dist/agent.js start` |
| `npm run start:jack-b` | `PERSONA_ID=jack-b node dist/agent.js start` |
| `npm run start:peter` | `PERSONA_ID=peter-lynch node dist/agent.js start` |

## 🧪 Testing

Test runners and validation

| Script | Command |
|--------|----------|
| `npm run test` | `vitest run` |
| `npm run test:all` | `npx tsx scripts/test.ts all` |
| `npm run test:cli` | `npx tsx scripts/test.ts` |
| `npm run test:coverage` | `vitest run --coverage` |
| `npm run test:e2e` | `npx tsx scripts/test-e2e.ts` |
| `npm run test:integrations` | `npx env-cmd -f .env npx tsx scripts/test-all-integrations.ts` |
| `npm run test:integrations:live` | `npx env-cmd -f .env npx tsx scripts/test-all-integrations...` |
| `npm run test:quick` | `npx tsx scripts/test.ts quick` |
| `npm run test:smoke` | `npx tsx scripts/test.ts smoke` |
| `npm run test:storage` | `npx tsx scripts/test-storage.ts` |
| `npm run test:ui` | `vitest --ui` |
| `npm run test:watch` | `vitest` |
| `npm run validate` | `npx tsx scripts/validate.ts` |
| `npm run validate:all` | `npx tsx scripts/validate.ts all` |
| `npm run validate:humanization` | `npx tsx scripts/validate.ts humanization` |
| `npm run validate:integrations` | `npx tsx scripts/validate.ts integrations` |
| `npm run validate:persistence` | `npx tsx scripts/validate.ts persistence` |
| `npm run validate:voices` | `npx tsx scripts/validate.ts voices` |

## 📊 Code Quality

Linting, formatting, and audits

| Script | Command |
|--------|----------|
| `npm run audit` | `npx tsx scripts/audit.ts` |
| `npm run audit:a11y` | `npx tsx scripts/audit.ts a11y` |
| `npm run audit:all` | `npx tsx scripts/audit.ts all` |
| `npm run audit:architecture` | `npx tsx scripts/audit.ts architecture` |
| `npm run audit:legacy` | `npx tsx scripts/audit.ts legacy` |
| `npm run audit:quality` | `npx tsx scripts/audit.ts quality` |
| `npm run format` | `prettier --write "src/**/*.{ts,tsx,json}"` |
| `npm run format:check` | `prettier --check "src/**/*.{ts,tsx,json}"` |
| `npm run lint` | `eslint src/**/*.ts` |
| `npm run lint:fix` | `eslint src/**/*.ts --fix` |
| `npm run quality` | `npm run typecheck && npm run lint && npm run format:check...` |
| `npm run quality:arch` | `npx tsx scripts/architecture-validator.ts` |
| `npm run quality:check` | `npx tsx scripts/code-quality-check.ts` |
| `npm run quality:full` | `npm run quality && npm run quality:check && npm run quali...` |
| `npm run typecheck` | `tsc --noEmit` |

## 🚀 Deployment

Deploy services to cloud

| Script | Command |
|--------|----------|
| `npm run deploy` | `npx tsx scripts/deploy.ts` |
| `npm run deploy:agent` | `pnpm ferni deploy gce` (voice agent to GCE) |
| `npm run deploy:all` | `npx tsx scripts/deploy.ts all` |
| `npm run deploy:brand` | `npx tsx scripts/deploy.ts brand` |
| `npm run deploy:context` | `bash infrastructure/scripts/deploy-context.sh` |
| `npm run deploy:evolution` | `npx tsx scripts/deploy.ts evolution` |
| `npm run deploy:frontend` | `npx tsx scripts/deploy.ts frontend` |
| `npm run deploy:help` | `npx tsx scripts/deploy.ts --help` |
| `npm run deploy:joel` | `npx tsx scripts/deploy.ts joel` |
| `npm run deploy:landing` | `npx tsx scripts/deploy.ts landing` |
| `npm run deploy:speaker` | `gcloud builds submit --config=cloudbuild-speaker.yaml` |
| `npm run deploy:ui` | `npx tsx scripts/deploy.ts ui` |
| `npm run deploy:ui:async` | `npx tsx scripts/deploy.ts ui --async` |
| `npm run deploy:workers` | `bash infrastructure/scripts/deploy-workers.sh` |

## ⚙️ Setup & Configuration

Environment setup

| Script | Command |
|--------|----------|
| `npm run setup` | `npx tsx scripts/setup.ts` |
| `npm run setup:all` | `npx tsx scripts/setup.ts all` |
| `npm run setup:firestore` | `npx tsx scripts/setup.ts firestore` |
| `npm run setup:github` | `npx tsx scripts/setup.ts github` |
| `npm run setup:help` | `npx tsx scripts/setup.ts --help` |
| `npm run setup:icons` | `npx tsx scripts/setup.ts icons` |
| `npm run setup:local` | `npx tsx scripts/setup.ts local` |
| `npm run setup:persistence` | `npx tsx scripts/setup.ts persistence` |
| `npm run setup:signing` | `npx tsx scripts/setup.ts signing` |
| `npm run setup:slack` | `npx tsx scripts/setup.ts slack` |

## 🏗️ Generation

Code and asset generation

| Script | Command |
|--------|----------|
| `npm run build:android` | `npx tsx scripts/build.ts android` |
| `npm run build:animation-constants` | `node design-system/generate-animation-constants.js` |
| `npm run build:apps` | `npx tsx scripts/build.ts apps` |
| `npm run build:assets` | `node design-system/build-assets.js` |
| `npm run build:bundle` | `node scripts/build-bundle.js` |
| `npm run build:cli` | `npx tsx scripts/build.ts` |
| `npm run build:design-system` | `npm run build:tokens && npm run build:persona-colors && n...` |
| `npm run build:electron` | `npx tsx scripts/build.ts electron` |
| `npm run build:fast` | `npx tsx scripts/build-fast.ts` |
| `npm run build:fast:types` | `npx tsx scripts/build-fast.ts --types` |
| `npm run build:fast:watch` | `npx tsx scripts/build-fast.ts --watch` |
| `npm run build:ios` | `npx tsx scripts/build.ts ios` |
| `npm run build:persona-colors` | `node design-system/generate-persona-colors.js` |
| `npm run build:prod` | `npm run build:fast && npm run build:bundle` |
| `npm run build:sounds` | `node design-system/generate-sounds.js` |
| `npm run build:store-assets` | `npx tsx scripts/build.ts store-assets` |
| `npm run build:sync` | `npx tsx scripts/build.ts sync` |
| `npm run build:tailwind-config` | `node design-system/generate-tailwind-config.js` |
| `npm run build:tokens` | `node design-system/build.js` |
| `npm run generate` | `npx tsx scripts/generate.ts` |
| `npm run generate:all` | `npx tsx scripts/generate.ts all` |
| `npm run generate:api-docs` | `npx tsx scripts/generate-api-docs.ts` |
| `npm run generate:design-system` | `npx tsx scripts/generate.ts design-system` |
| `npm run generate:env` | `npx tsx scripts/generate.ts env` |
| `npm run generate:marketing` | `npx tsx scripts/generate.ts marketing` |
| `npm run generate:personas` | `npx tsx scripts/generate.ts personas` |
| `npm run generate:scripts-doc` | `npx tsx scripts/generate-scripts-doc.ts` |
| `npm run generate:vapid` | `npx tsx scripts/generate.ts vapid` |

## 🎯 Rollout & Release

Feature rollout management

| Script | Command |
|--------|----------|
| `npm run rollout` | `npx tsx scripts/rollout.ts` |
| `npm run rollout:advance` | `npx tsx scripts/rollout.ts advance` |
| `npm run rollout:list` | `npx tsx scripts/rollout.ts list` |
| `npm run rollout:presets` | `npx tsx scripts/rollout.ts presets` |
| `npm run rollout:rollback` | `npx tsx scripts/rollout.ts rollback` |
| `npm run rollout:start` | `npx tsx scripts/rollout.ts start` |
| `npm run rollout:status` | `npx tsx scripts/rollout.ts status` |

## 🌍 Environment

Environment management

| Script | Command |
|--------|----------|
| `npm run env:generate` | `npx tsx scripts/generate-env-example.ts` |
| `npm run env:report` | `npx tsx scripts/generate-env-example.ts --report` |

## 🎨 Design System

Design tokens and components

| Script | Command |
|--------|----------|
| `npm run design-system` | `node design-system/dev-server.js` |
| `npm run design-system:dev` | `node design-system/dev-server.js` |
| `npm run design-system:test` | `npx playwright test --config=design-system/playwright.con...` |
| `npm run design-system:test:update` | `npx playwright test --config=design-system/playwright.con...` |

## 🔧 Utilities

Miscellaneous utilities

| Script | Command |
|--------|----------|
| `npm run ferni` | `npx tsx scripts/ferni.ts` |
| `npm run ferni:health` | `npx tsx scripts/ferni.ts health` |
| `npm run sandbox` | `docker compose -f docker-compose.local.yml up -d && echo ...` |
| `npm run sync:promo` | `node design-system/sync-promo-tokens.js` |
| `npm run token-server` | `node token-server.js` |

## 📦 Other Scripts

| Script | Command |
|--------|----------|
| `npm run agents` | `npx tsx src/cli/agent-manager.ts` |
| `npm run agents:create` | `npx tsx src/cli/agent-manager.ts create` |
| `npm run agents:list` | `npx tsx src/cli/agent-manager.ts list` |
| `npm run agents:validate` | `npx tsx src/cli/agent-manager.ts validate` |
| `npm run brand:check` | `node design-system/check-brand.js` |
| `npm run brand:check:all` | `npx tsx scripts/check-brand-compliance.ts --all` |
| `npm run brand:validate` | `curl -s -X POST https://app.ferni.ai/api/brand/validate -...` |
| `npm run build:frontend` | `npx tsx scripts/build.ts frontend` |
| `npm run cleanup:calendar-tokens` | `npx tsx scripts/cleanup-test-calendar-tokens.ts` |
| `npm run debt` | `npx tsx scripts/tech-debt.ts` |
| `npm run debt:json` | `npx tsx scripts/tech-debt.ts --json` |
| `npm run debt:markdown` | `npx tsx scripts/tech-debt.ts --markdown` |
| `npm run docker:build` | `docker build -f docker/Dockerfile.agent -t voice-agent .` |
| `npm run docker:run` | `docker run --env-file .env -p 8080:8080 voice-agent` |
| `npm run flags:dry-run` | `npx tsx scripts/enable-all-flags.ts --dry-run` |
| `npm run flags:enable-all` | `npx tsx scripts/enable-all-flags.ts` |
| `npm run flags:report` | `npx tsx scripts/enable-all-flags.ts --report` |
| `npm run flags:reset` | `npx tsx scripts/enable-all-flags.ts --reset` |
| `npm run flags:save-env` | `npx tsx scripts/enable-all-flags.ts --save-env` |
| `npm run infra:health` | `bash infrastructure/scripts/check-scaling-health.sh` |
| `npm run infra:setup-pubsub` | `bash infrastructure/scripts/setup-pubsub.sh` |
| `npm run infra:terraform` | `cd infrastructure/terraform && terraform init && terrafor...` |
| `npm run job:all` | `npx tsx scripts/run-job.ts all` |
| `npm run job:check-in` | `npx tsx scripts/run-job.ts checkInNudge` |
| `npm run job:daily-warnings` | `npx tsx scripts/run-job.ts dailyWarningCheck` |
| `npm run job:weekly-ant` | `npx tsx scripts/run-job.ts weeklyANTReport` |
| `npm run job:wisdom` | `npx tsx scripts/run-job.ts wisdomAggregation` |
| `npm run ops:health` | `npx tsx scripts/health-check.ts` |
| `npm run ops:health:alert` | `npx tsx scripts/health-check.ts --alert` |
| `npm run ops:logs` | `gcloud run services logs read voiceai-agent --region us-c...` |
| `npm run ops:logs:errors` | `gcloud logging read 'resource.type="cloud_run_revision" s...` |
| `npm run ops:setup` | `./scripts/setup-monitoring.sh` |
| `npm run persona` | `npx tsx src/cli/persona-cli.ts` |
| `npm run persona:build` | `npx tsx src/cli/persona-cli.ts build` |
| `npm run persona:list` | `npx tsx src/cli/persona-cli.ts list` |
| `npm run persona:validate` | `npx tsx src/cli/persona-cli.ts validate` |
| `npm run prebuild:frontend` | `npm run build:design-system && npm run generate:personas` |
| `npm run prepare` | `husky || true` |
| `npm run secrets:sync` | `npx tsx scripts/sync-secrets-to-env.ts` |
| `npm run services:down` | `docker compose -f docker-compose.local.yml down` |
| `npm run services:logs` | `docker compose -f docker-compose.local.yml logs -f` |
| `npm run services:up` | `docker compose -f docker-compose.local.yml up -d` |
| `npm run storybook` | `cd design-system && npm run storybook` |
| `npm run storybook:build` | `cd design-system && npm run build-storybook` |
| `npm run tokens:check` | `node design-system/check-drift.js` |
| `npm run tokens:sync` | `npm run build:design-system && npm run sync:promo && echo...` |
| `npm run tokens:version` | `node design-system/version-tokens.js` |
| `npm run tokens:watch` | `node design-system/dev-server.js --watch` |
| `npm run tools:activate` | `npx tsx src/cli/tools-report.ts activate` |
| `npm run tools:alerts` | `npx tsx src/cli/tools-report.ts alerts` |
| `npm run tools:benchmark` | `npx tsx src/cli/tools-report.ts benchmark` |
| `npm run tools:deactivate` | `npx tsx src/cli/tools-report.ts deactivate` |
| `npm run tools:deprecation` | `npx tsx src/cli/tools-report.ts deprecation` |
| `npm run tools:experiments` | `npx tsx src/cli/tools-report.ts experiments` |
| `npm run tools:health` | `npx tsx src/cli/tools-report.ts health` |
| `npm run tools:help` | `npx tsx src/cli/tools-report.ts help` |
| `npm run tools:optimizer` | `npx tsx src/cli/tools-report.ts optimizer` |
| `npm run tools:patterns` | `npx tsx src/cli/tools-report.ts patterns` |
| `npm run tools:recommendations` | `npx tsx src/cli/tools-report.ts recommendations` |
| `npm run tools:report` | `npx tsx src/cli/tools-report.ts` |
| `npm run tools:route` | `npx tsx src/cli/tools-report.ts route` |
| `npm run tools:versions` | `npx tsx src/cli/tools-report.ts versions` |
| `npm run warmup:agent` | `bash scripts/warmup-agent.sh` |

## 🎯 Unified CLI Reference

The `ferni` CLI provides interactive access to all commands:

```bash
# Interactive mode
npm run ferni

# Direct commands
npm run ferni deploy ui
npm run ferni test quick
npm run ferni setup local
npm run ferni generate all
npm run ferni health
```

### Available CLI Modules

| Module | Description | Example |
|--------|-------------|---------|
| `deploy` | Deploy services | `ferni deploy ui` |
| `setup` | Configure environment | `ferni setup local` |
| `test` | Run tests | `ferni test quick` |
| `validate` | Run validations | `ferni validate all` |
| `audit` | Code audits | `ferni audit quality` |
| `build` | Build apps | `ferni build apps` |
| `generate` | Generate code/assets | `ferni generate all` |
| `rollout` | Feature rollouts | `ferni rollout status` |
| `health` | System health check | `ferni health` |

---

## 📚 Additional Resources

- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Development Setup](./docs/DEVELOPMENT.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)

---

*Generated on 2025-12-13*
