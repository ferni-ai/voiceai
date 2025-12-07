# Ferni Documentation Index

Welcome to the Ferni Voice AI documentation. This directory contains all technical documentation organized by category.

## Quick Start

- **[Local Setup](guides/local-setup.md)** - Get started with local development
- **[Environment Variables](deployment/environment-variables.md)** - Configuration reference
- **[Creating Personas](guides/creating-personas.md)** - Add new AI personas

## Directory Structure

```
docs/
├── architecture/       # System design & technical architecture
├── deployment/         # Ops, deployment, and infrastructure
├── features/           # Feature-specific documentation
├── guides/             # How-to guides and tutorials
├── migrations/         # Migration plans and status
└── security/           # Security documentation
```

## Documentation by Category

### 📐 Architecture
System design and technical architecture documents.

| Document | Description |
|----------|-------------|
| [Clean Architecture](architecture/CLEAN-ARCHITECTURE.md) | Core architecture overview |
| [Agent-Agnostic Architecture](architecture/AGENT-AGNOSTIC-ARCHITECTURE.md) | Tool/persona patterns |
| [Cognitive Intelligence](architecture/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md) | AI cognition system |
| [Persistence Architecture](architecture/PERSISTENCE-ARCHITECTURE.md) | Data storage design |
| [Dynamic Agent Architecture](architecture/DYNAMIC-AGENT-ARCHITECTURE.md) | Runtime agent loading |
| [Handoff Architecture](architecture/HANDOFF_ARCHITECTURE.md) | Persona handoff system |

### 🚀 Deployment
Deployment, infrastructure, and operations.

| Document | Description |
|----------|-------------|
| [Production Deployment](deployment/PRODUCTION-DEPLOYMENT.md) | Production setup guide |
| [Quick Deploy](deployment/QUICK-DEPLOY.md) | Fast deployment reference |
| [Google Cloud Deployment](deployment/google-cloud-deployment.md) | GCP-specific setup |
| [Environment Variables](deployment/environment-variables.md) | Configuration reference |
| [GitHub Secrets Setup](deployment/GITHUB-SECRETS-SETUP.md) | CI/CD secrets |
| [Sentry Setup](deployment/SENTRY-SETUP.md) | Error tracking |

### ✨ Features
Feature-specific documentation and specifications.

| Document | Description |
|----------|-------------|
| [Monetization System](features/MONETIZATION-SYSTEM.md) | Subscription & team unlocks |
| [Handoff Checklist](features/HANDOFF_CHECKLIST.md) | Persona handoff testing |
| [Spotify Integration](features/SPOTIFY-INTEGRATION.md) | Music features |
| [AB Testing](features/AB-TESTING.md) | Experimentation system |
| [Deep Engagement Domains](features/DEEP-ENGAGEMENT-DOMAINS.md) | User engagement |
| [Cross-Domain Journeys](features/CROSS-DOMAIN-JOURNEYS.md) | Multi-domain interactions |

### 📚 Guides
How-to guides and tutorials.

| Document | Description |
|----------|-------------|
| [Local Setup](guides/local-setup.md) | Development environment |
| [Creating Personas](guides/creating-personas.md) | Add new AI personas |
| [Persona Behavior Guide](guides/PERSONA-BEHAVIOR-GUIDE.md) | Persona customization |
| [Humanization Guidelines](guides/HUMANIZATION-GUIDELINES.md) | Making AI feel human |
| [Mobile Polish Guide](guides/MOBILE-POLISH-GUIDE.md) | Mobile UX tips |
| [Subscription Setup](guides/SUBSCRIPTION-SETUP.md) | Billing configuration |

### 🔄 Migrations
Migration plans, status tracking, and refactoring guides.

| Document | Description |
|----------|-------------|
| [Services Reorg Plan](migrations/SERVICES-REORG-PLAN.md) | Services directory cleanup |
| [Migration TODOs](migrations/MIGRATION-TODOS.md) | Outstanding migrations |
| [Legacy Migration Plan](migrations/LEGACY-MIGRATION-PLAN.md) | Legacy code removal |
| [Architecture Migration](migrations/ARCHITECTURE-MIGRATION.md) | Architecture updates |
| [Tool Migration](migrations/TOOL_MIGRATION.md) | Tool consolidation |

### 🔒 Security
Security documentation and checklists.

| Document | Description |
|----------|-------------|
| [Security Checklist](security/SECURITY-CHECKLIST.md) | Pre-launch security |
| [Security Review](security/security-review.md) | Security audit findings |

## Other Documentation

### In-Code Documentation
- `src/tools/CLAUDE.md` - How to create tools
- `src/personas/CLAUDE.md` - How to create personas
- `src/intelligence/context-builders/CLAUDE.md` - Context builder patterns
- `frontend-typescript/CLAUDE.md` - Frontend/design system rules

### Brand & Design
- `brand/FERNI-BRAND-GUIDELINES.md` - Full brand identity guide
- `brand/FERNI-SCREEN-GUIDELINES.md` - Digital design standards
- `brand/ferni-design-tokens.css` - CSS variable definitions

## Contributing to Docs

1. **Choose the right category** - Place docs in the appropriate subdirectory
2. **Use consistent formatting** - Follow existing document structure
3. **Keep it up to date** - Update docs when features change
4. **Link related docs** - Cross-reference related documentation

## Document Template

```markdown
# Document Title

**Status**: Draft | Review | Approved  
**Last Updated**: YYYY-MM-DD  
**Author**: Your Name

## Overview
Brief description of what this document covers.

## Content
Main content here...

## Related Documents
- [Related Doc 1](path/to/doc.md)
- [Related Doc 2](path/to/doc.md)
```

