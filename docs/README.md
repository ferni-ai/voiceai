# Ferni Documentation

> **We believe in making AI human, and the decisions we make will reflect that.**

## Quick Links

| I want to...               | Read this                                   |
| -------------------------- | ------------------------------------------- |
| **Get started**            | [ONBOARDING.md](../ONBOARDING.md)           |
| **Understand the mission** | [CORE-PRINCIPLES.md](../CORE-PRINCIPLES.md) |
| **Write code**             | [CLAUDE.md](../CLAUDE.md)                   |
| **Contribute**             | [CONTRIBUTING.md](../CONTRIBUTING.md)       |
| **Deploy**                 | [DEPLOYMENT.md](../DEPLOYMENT.md)           |
| **Run commands**           | [SCRIPTS.md](../SCRIPTS.md)                 |
| **Check implementation status** | [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) 🆕 |

---

## Documentation Map

```
voiceai/
├── README.md              # Project overview
├── CLAUDE.md              # AI coding context (START HERE)
├── CORE-PRINCIPLES.md     # Mission & philosophy
├── ONBOARDING.md          # Developer setup
├── CONTRIBUTING.md        # How to contribute
├── DEPLOYMENT.md          # Deployment guide
├── SCRIPTS.md             # npm scripts
├── BACKLOG.md             # Product backlog
└── CHANGELOG.md           # Version history

docs/
├── README.md              # THIS FILE - Index
├── CURRENT-STATE-SUMMARY.md  # ⭐ AUTHORITATIVE implementation status
├── DOCUMENTATION-STATE.md    # Documentation audit & cleanup plan
│
├── architecture/          # System design (30 docs)
├── audits/                # Quality audits (32 docs)
├── plans/                 # Implementation plans (23 active)
├── features/              # Feature specs (16 docs)
├── guides/                # How-to guides (18 docs)
├── deployment/            # Deploy guides (12 docs)
├── security/              # Security checklists
├── api/                   # API documentation
├── operations/            # Runbooks & operations
├── strategy/              # Business & launch docs
├── marketplace/           # Marketplace docs
└── archive/               # 📦 Completed/outdated plans

brand/                     # Brand ASSETS (logos, icons)
design-system/brand/       # Brand DOCUMENTATION
frontend-typescript/       # Frontend code & CLAUDE.md
marketplace-agents/        # Agent marketplace
```

---

## Architecture (`/docs/architecture/`)

System design and technical decisions.

### Core Architecture

| Doc                                                                                             | Description                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| [ARCHITECTURE-ACTION-PLAN.md](./architecture/ARCHITECTURE-ACTION-PLAN.md)                       | **Refactoring priorities & roadmap** |
| [CLEAN-ARCHITECTURE.md](./architecture/CLEAN-ARCHITECTURE.md)                                   | Layer structure & import rules       |
| [AGENT-AGNOSTIC-ARCHITECTURE.md](./architecture/AGENT-AGNOSTIC-ARCHITECTURE.md)                 | Tool & persona patterns              |
| [COGNITIVE-INTELLIGENCE-ARCHITECTURE.md](./architecture/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md) | How personas think                   |
| [PERSISTENCE-ARCHITECTURE.md](./architecture/PERSISTENCE-ARCHITECTURE.md)                       | Memory & storage                     |
| [HANDOFF_ARCHITECTURE.md](./architecture/HANDOFF_ARCHITECTURE.md)                               | Agent handoff system                 |
| [MEMORY-MANAGEMENT.md](./architecture/MEMORY-MANAGEMENT.md)                                     | Memory patterns & cleanup            |
| [GCE-CLEAN-ARCHITECTURE.md](./architecture/GCE-CLEAN-ARCHITECTURE.md)                           | GCE deployment architecture          |

### Feature Architecture

| Doc                                                                     | Description             |
| ----------------------------------------------------------------------- | ----------------------- |
| [FERNI-EMOTION-SYSTEM.md](./architecture/FERNI-EMOTION-SYSTEM.md)       | Emotional intelligence  |
| [MONETIZATION-SYSTEM.md](./architecture/MONETIZATION-SYSTEM.md)         | Subscriptions & unlocks |
| [CINEMATIC-DESIGN-SYSTEM.md](./architecture/CINEMATIC-DESIGN-SYSTEM.md) | Design system           |
| [REALTIME-MEMORY-PLAN.md](./architecture/REALTIME-MEMORY-PLAN.md)       | Memory optimization     |

### Architecture Decision Records (ADRs)

| ADR                                                                                           | Decision         |
| --------------------------------------------------------------------------------------------- | ---------------- |
| [001-clean-architecture.md](./architecture/adr/001-clean-architecture.md)                     | Layer structure  |
| [0001-persona-bundle-architecture.md](./architecture/adr/0001-persona-bundle-architecture.md) | Persona bundles  |
| [0002-context-builder-pattern.md](./architecture/adr/0002-context-builder-pattern.md)         | Context builders |
| [002-design-token-system.md](./architecture/adr/002-design-token-system.md)                   | Design tokens    |
| [004-persona-registry-pattern.md](./architecture/adr/004-persona-registry-pattern.md)         | Persona registry |

---

## Guides (`/docs/guides/`)

How-to guides and reference material.

| Doc                                                               | Description                        |
| ----------------------------------------------------------------- | ---------------------------------- |
| [FERNI-COMPLETE-GUIDE.md](./guides/FERNI-COMPLETE-GUIDE.md)       | Comprehensive Ferni implementation |
| [creating-personas.md](./guides/creating-personas.md)             | Building custom personas           |
| [environment-variables.md](./guides/environment-variables.md)     | Configuration reference            |
| [api-reference.md](./guides/api-reference.md)                     | REST API documentation             |
| [RUNBOOK.md](./guides/RUNBOOK.md)                                 | Operations runbook                 |
| [HUMANIZATION-GUIDELINES.md](./guides/HUMANIZATION-GUIDELINES.md) | Voice & tone guide                 |
| [MOBILE-POLISH-GUIDE.md](./guides/MOBILE-POLISH-GUIDE.md)         | Mobile UX polish                   |
| [TESTING-PHILOSOPHY.md](./guides/TESTING-PHILOSOPHY.md)           | Testing approach                   |
| [COMMIT-CONVENTIONS.md](./guides/COMMIT-CONVENTIONS.md)           | Commit messages                    |

---

## Features (`/docs/features/`)

Feature specifications and roadmaps.

| Doc                                                                     | Description            |
| ----------------------------------------------------------------------- | ---------------------- |
| [PROACTIVE-OUTREACH-VISION.md](./features/PROACTIVE-OUTREACH-VISION.md) | Proactive engagement   |
| [MUSIC-GAMES.md](./features/MUSIC-GAMES.md)                             | Music games system     |
| [SPOTIFY-INTEGRATION.md](./features/SPOTIFY-INTEGRATION.md)             | Music integration      |
| [VOICE-PRESENCE-ROADMAP.md](./features/VOICE-PRESENCE-ROADMAP.md)       | Voice features roadmap |
| [VOICE-HUMANIZATION.md](./features/VOICE-HUMANIZATION.md)               | Voice humanization     |
| [AB-TESTING.md](./features/AB-TESTING.md)                               | Experiment framework   |
| [DJ-SYSTEM.md](./features/DJ-SYSTEM.md)                                 | DJ/music system        |
| [TOOL_COST_ANALYSIS.md](./features/TOOL_COST_ANALYSIS.md)               | Tool performance data  |

---

## Core Systems

### Life Coaching

| Doc                                                                      | Description                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [COACHING-SYSTEM.md](./features/COACHING-SYSTEM.md)                      | **Complete coaching capabilities** - Goals, actions, obstacles, values, journey |
| [LIFE-COACH-ENHANCEMENT-PLAN.md](./plans/LIFE-COACH-ENHANCEMENT-PLAN.md) | Enhancement roadmap                                                             |

### Better Than Human / Emotional Intelligence

| Doc                                                                                       | Description                        |
| ----------------------------------------------------------------------------------------- | ---------------------------------- |
| [design-system/brand/BETTER-THAN-HUMAN.md](../design-system/brand/BETTER-THAN-HUMAN.md)   | EQ specification (source of truth) |
| [BETTER-THAN-HUMAN-INTEGRATION-PLAN.md](./plans/BETTER-THAN-HUMAN-INTEGRATION-PLAN.md)    | Implementation plan                |
| [BETTER-THAN-PHD-ROADMAP.md](./plans/BETTER-THAN-PHD-ROADMAP.md)                          | PhD-level EQ roadmap               |
| [BETTER-THAN-PHD-SYSTEMS.md](./architecture/BETTER-THAN-PHD-SYSTEMS.md)                   | Systems implementation             |

### Trust & Authentication

| Doc                                                                              | Description                   |
| -------------------------------------------------------------------------------- | ----------------------------- |
| [TRUST-SYSTEMS.md](./architecture/TRUST-SYSTEMS.md)                              | Trust & relationship tracking |
| [VOICE-AUTHENTICATION.md](./features/VOICE-AUTHENTICATION.md)                    | Voice auth overview           |
| [VOICE-AUTH-IMPLEMENTATION-GUIDE.md](./guides/VOICE-AUTH-IMPLEMENTATION-GUIDE.md)| Implementation guide          |

### Outreach & Engagement

| Doc                                                                        | Description         |
| -------------------------------------------------------------------------- | ------------------- |
| [OUTREACH-PRODUCTION-PLAN.md](./plans/OUTREACH-PRODUCTION-PLAN.md)         | Production plan     |
| [OUTREACH-DEPLOYMENT-COMPLETE.md](./deployment/OUTREACH-DEPLOYMENT-COMPLETE.md) | Deployment status |
| [OUTREACH-WEBHOOKS.md](./features/OUTREACH-WEBHOOKS.md)                    | Webhook integration |

### Evaluation & Operations

| Doc                                    | Description                  |
| -------------------------------------- | ---------------------------- |
| [EVALOPS.md](./operations/EVALOPS.md)  | Evaluation operations system |
| [API.md](./api/API.md)                 | API documentation            |

---

## Deployment (`/docs/deployment/`)

| Doc                                                               | Description           |
| ----------------------------------------------------------------- | --------------------- |
| [PRODUCTION-DEPLOYMENT.md](./deployment/PRODUCTION-DEPLOYMENT.md) | Full deployment guide |
| [QUICK-DEPLOY.md](./deployment/QUICK-DEPLOY.md)                   | Fast deploy reference |
| [SUBSCRIPTION-SETUP.md](./deployment/SUBSCRIPTION-SETUP.md)       | Stripe setup          |
| [SENTRY-SETUP.md](./deployment/SENTRY-SETUP.md)                   | Error tracking        |
| [GITHUB-SECRETS-SETUP.md](./deployment/GITHUB-SECRETS-SETUP.md)   | CI/CD secrets         |
| [DASHBOARDS.md](./deployment/DASHBOARDS.md)                       | Monitoring dashboards |

---

## Security (`/docs/security/`)

| Doc                                                                               | Description              |
| --------------------------------------------------------------------------------- | ------------------------ |
| [SECURITY-CHECKLIST.md](./security/SECURITY-CHECKLIST.md)                         | Security audit checklist |
| [security-review.md](./security/security-review.md)                               | Review process           |
| [CODE-ORGANIZATION-PR-CHECKLIST.md](./security/CODE-ORGANIZATION-PR-CHECKLIST.md) | PR checklist             |

---

## Audits (`/docs/audits/`)

System and code quality audits.

| Doc                                                               | Description                |
| ----------------------------------------------------------------- | -------------------------- |
| [DESIGN-SYSTEM-AUDIT.md](./audits/DESIGN-SYSTEM-AUDIT.md)         | Design token consolidation |
| [BETTER-THAN-HUMAN-AUDIT.md](./audits/BETTER-THAN-HUMAN-AUDIT.md) | EQ capabilities            |
| [EMOTION-ANIMATION-AUDIT.md](./audits/EMOTION-ANIMATION-AUDIT.md) | Avatar emotions            |
| [ANIMATION-PRINCIPLES-AUDIT.md](./audits/ANIMATION-PRINCIPLES-AUDIT.md) | Animation best practices |
| [UI-SPACING-AUDIT.md](./audits/UI-SPACING-AUDIT.md)               | UI spacing consistency     |
| [COMPREHENSIVE-CODEBASE-AUDIT.md](./audits/COMPREHENSIVE-CODEBASE-AUDIT.md) | Full codebase review |
| [GAMES-AUDIT.md](./audits/GAMES-AUDIT.md)                         | Games system               |
| [BEHAVIOR-AUDIT.md](./audits/BEHAVIOR-AUDIT.md)                   | Persona behaviors          |
| [SDLC-AUDIT.md](./audits/SDLC-AUDIT.md)                           | Dev lifecycle              |
| [TECH-DEBT.md](./TECH-DEBT.md)                                    | Auto-generated debt report |

---

## Business & Launch (`/docs/strategy/`)

| Doc                                                                        | Description                 |
| -------------------------------------------------------------------------- | --------------------------- |
| [VC-ARCHITECTURE-OVERVIEW.md](./strategy/VC-ARCHITECTURE-OVERVIEW.md)      | Investor-ready architecture |
| [SERVICE-DOMAINS-DEEP-DIVE.md](./architecture/SERVICE-DOMAINS-DEEP-DIVE.md)| E2E service breakdown       |
| [LAUNCH-KIT.md](./strategy/LAUNCH-KIT.md)                                  | Go-to-market materials      |

---

## Coding Standards (CLAUDE.md Files)

AI assistant context files form a hierarchy:

| File                                                                                          | Purpose                                         |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                                                     | **Root**: Quality gates, architecture, patterns |
| [frontend-typescript/CLAUDE.md](../frontend-typescript/CLAUDE.md)                             | Frontend patterns, design tokens                |
| [src/tools/CLAUDE.md](../src/tools/CLAUDE.md)                                                 | Tool development                                |
| [src/personas/CLAUDE.md](../src/personas/CLAUDE.md)                                           | Persona development                             |
| [src/intelligence/context-builders/CLAUDE.md](../src/intelligence/context-builders/CLAUDE.md) | Context builder patterns                        |
| [src/tools/habit-coaching/CLAUDE.md](../src/tools/habit-coaching/CLAUDE.md)                   | Module organization example                     |

Complete coding standards: [.cursorrules](../.cursorrules) (22KB)

---

## Plans (`/docs/plans/`)

Implementation plans and roadmaps. See [archive/](./archive/) for completed plans.

| Doc                                                                                    | Description                  |
| -------------------------------------------------------------------------------------- | ---------------------------- |
| [IMPLEMENTATION-PLAN.md](./plans/IMPLEMENTATION-PLAN.md)                               | Comprehensive implementation |
| [BETTER-THAN-PHD-ROADMAP.md](./plans/BETTER-THAN-PHD-ROADMAP.md)                       | PhD-level EQ roadmap (master)|
| [COMPREHENSIVE-REMEDIATION-PLAN.md](./plans/COMPREHENSIVE-REMEDIATION-PLAN.md)         | Technical debt remediation   |
| [FEATURE-COMPLETION-PLAN.md](./plans/FEATURE-COMPLETION-PLAN.md)                       | 26 menu features E2E         |
| [MUSIC-INTELLIGENCE-PLAN.md](./plans/MUSIC-INTELLIGENCE-PLAN.md)                       | Music/DJ system roadmap      |
| [EXTENSIBILITY-COMPLETION-PLAN.md](./plans/EXTENSIBILITY-COMPLETION-PLAN.md)           | Agent extensibility system   |
| [ADMIN-SECTION-IMPLEMENTATION-PLANS.md](./plans/ADMIN-SECTION-IMPLEMENTATION-PLANS.md) | Admin UI plans               |
| [AI-BRAND-SCALING-PLAN.md](./plans/AI-BRAND-SCALING-PLAN.md)                           | AI brand expansion           |
| [EMOTION-SYSTEM-PLAN.md](./plans/EMOTION-SYSTEM-PLAN.md)                               | Emotion system implementation|
| [LOCALIZATION-PLAN.md](./plans/LOCALIZATION-PLAN.md)                                   | i18n implementation plan     |
| [LIFE-COACH-ENHANCEMENT-PLAN.md](./plans/LIFE-COACH-ENHANCEMENT-PLAN.md)               | Life coaching improvements   |

---

## Brand & Design

| File                                                                                                 | Purpose                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| [brand/README.md](../brand/README.md)                                                                | Brand assets (logos, icons)  |
| [design-system/brand/FERNI-BRAND-GUIDELINES.md](../design-system/brand/FERNI-BRAND-GUIDELINES.md)    | Core brand guidelines        |
| [design-system/brand/FERNI-SCREEN-GUIDELINES.md](../design-system/brand/FERNI-SCREEN-GUIDELINES.md)  | Screen design system         |
| [design-system/brand/FERNI-SONIC-IDENTITY.md](../design-system/brand/FERNI-SONIC-IDENTITY.md)        | Audio branding               |
| [design-system/brand/FERNI-UNIVERSE-BIBLE.md](../design-system/brand/FERNI-UNIVERSE-BIBLE.md)        | Brand universe & personality |
| [design-system/brand/BETTER-THAN-HUMAN.md](../design-system/brand/BETTER-THAN-HUMAN.md)              | EQ specification             |

See [design-system/brand/README.md](../design-system/brand/README.md) for complete brand documentation index.

---

## Marketplace Agents

| File                                                                                                        | Purpose                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| [marketplace-agents/README.md](../marketplace-agents/README.md)                                             | Marketplace overview     |
| [marketplace-agents/CONTRIBUTING.md](../marketplace-agents/CONTRIBUTING.md)                                 | Agent contribution guide |
| [marketplace-agents/docs/AGENT-DEVELOPMENT-GUIDE.md](../marketplace-agents/docs/AGENT-DEVELOPMENT-GUIDE.md) | Development guide        |

---

## DevOps & Development Workflow

| Doc | Description |
|-----|-------------|
| [BRANCH-PROTECTION.md](./deployment/BRANCH-PROTECTION.md) | GitHub branch protection setup |
| [BUILD-OPTIMIZATIONS.md](./deployment/BUILD-OPTIMIZATIONS.md) | Build performance tips |
| [CLOUDFLARE-SETUP.md](./deployment/CLOUDFLARE-SETUP.md) | CDN configuration |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute |
| [guides/COMMIT-CONVENTIONS.md](./guides/COMMIT-CONVENTIONS.md) | Commit message format |

### Automation Overview

| System | What It Does |
|--------|--------------|
| **Pre-commit hooks** | Typecheck, lint, test on commit |
| **Conventional commits** | Enforced via commitlint |
| **Blue-green deploys** | Safe deployments with rollback |
| **Auto-release tags** | Semver from conventional commits |
| **Dependabot** | Weekly dependency updates |
| **Slack notifications** | Deploy success/failure alerts |

See [.github/workflows/](../.github/workflows/) for all CI/CD workflows.

---

## Archive (`/docs/archive/`)

Completed plans and outdated documentation preserved for historical reference.

| Category | Contents |
|----------|----------|
| `completed-plans/` | 6 plans now fully implemented (Animation, Trust Systems, Personas, etc.) |
| Root archive | Superseded status documents |

See [archive/README.md](./archive/README.md) for details.

---

## Documentation Maintenance

For documentation cleanup status and maintenance guidelines, see:

- [DOCUMENTATION-STATE.md](./DOCUMENTATION-STATE.md) - Documentation audit & cleanup plan
- [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) - **Authoritative** implementation status

---

_Last updated: December 15, 2024_
