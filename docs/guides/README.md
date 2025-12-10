# 📚 Ferni AI Documentation

Welcome to the Ferni AI documentation. This guide will help you understand, develop, and deploy the platform.

## Quick Links

| I want to...                       | Go to                                                       |
| ---------------------------------- | ----------------------------------------------------------- |
| **Get started as a new developer** | [Onboarding Guide](../ONBOARDING.md)                        |
| Set up locally                     | [Local Setup Guide](guides/local-setup.md)                  |
| Understand coding standards        | [.cursorrules](../.cursorrules) / [CLAUDE.md](../CLAUDE.md) |
| Deploy to production               | [Deployment Guide](deployment/)                             |
| Create a new agent                 | [Agent Management](guides/AGENT-MANAGEMENT.md)              |
| Create a new tool                  | [Tool Guide](../src/tools/CLAUDE.md)                        |
| Understand the architecture        | [Architecture Overview](architecture/)                      |
| Understand the API                 | [API Reference](guides/api-reference.md)                    |
| See the backlog                    | [BACKLOG.md](../BACKLOG.md)                                 |
| Contribute code                    | [CONTRIBUTING.md](../CONTRIBUTING.md)                       |

---

## 🚀 New Developer Start Here

1. **[ONBOARDING.md](../ONBOARDING.md)** - Week 1 guide for new developers
2. **[CONTRIBUTING.md](../CONTRIBUTING.md)** - How to contribute code
3. **[BACKLOG.md](../BACKLOG.md)** - Product backlog and roadmap

---

## 🤖 AI Assistant / Coding Standards

These files define coding standards for both humans and AI assistants:

| File                                                                        | Purpose                             | Location                           |
| --------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| **[.cursorrules](../.cursorrules)**                                         | Complete 700+ line coding standards | Root                               |
| **[CLAUDE.md](../CLAUDE.md)**                                               | Quick reference guide               | Root                               |
| **[Tool Guide](../src/tools/CLAUDE.md)**                                    | How to create tools                 | src/tools/                         |
| **[Persona Guide](../src/personas/CLAUDE.md)**                              | How to create personas              | src/personas/                      |
| **[Context Builder Guide](../src/intelligence/context-builders/CLAUDE.md)** | Context builder patterns            | src/intelligence/context-builders/ |
| **[Frontend Guide](../frontend-typescript/CLAUDE.md)**                      | Frontend design standards           | frontend-typescript/               |

---

## 📖 Documentation Index

### Getting Started

| Document                                                     | Description                   |
| ------------------------------------------------------------ | ----------------------------- |
| [Local Setup](guides/local-setup.md)                         | Development environment setup |
| [Environment Variables](deployment/environment-variables.md) | Configuration reference       |
| [Quick Deploy](deployment/QUICK-DEPLOY.md)                   | Fast deployment guide         |

### Architecture

| Document                                                                      | Description              |
| ----------------------------------------------------------------------------- | ------------------------ |
| [Architecture Overview](architecture/architecture.md)                         | High-level system design |
| [Agent-Agnostic Architecture](architecture/AGENT-AGNOSTIC-ARCHITECTURE.md)    | Multi-persona system     |
| [Cognitive Intelligence](architecture/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md) | How personas think       |
| [Handoff Architecture](architecture/HANDOFF_ARCHITECTURE.md)                  | Agent transitions        |
| [Persistence Architecture](architecture/PERSISTENCE-ARCHITECTURE.md)          | Memory and storage       |
| [Dynamic Agent Architecture](architecture/DYNAMIC-AGENT-ARCHITECTURE.md)      | Auto-discovery system    |
| [Clean Architecture](architecture/CLEAN-ARCHITECTURE.md)                      | Code organization        |

### Guides

| Document                                                     | Description                   |
| ------------------------------------------------------------ | ----------------------------- |
| [Creating Personas](guides/creating-personas.md)             | Build custom AI personalities |
| [Agent Management](guides/AGENT-MANAGEMENT.md)               | Managing persona bundles      |
| [Ferni Complete Guide](guides/FERNI-COMPLETE-GUIDE.md)       | Full Ferni implementation     |
| [Persona Behavior Guide](guides/PERSONA-BEHAVIOR-GUIDE.md)   | Behavior system design        |
| [Persona Template](guides/PERSONA-TEMPLATE.md)               | Template for new personas     |
| [Humanization Guidelines](guides/HUMANIZATION-GUIDELINES.md) | Making AI better than human   |
| [API Reference](guides/api-reference.md)                     | REST API documentation        |
| [Subscription Setup](guides/SUBSCRIPTION-SETUP.md)           | Stripe integration            |

### Features

| Document                                                   | Description                   |
| ---------------------------------------------------------- | ----------------------------- |
| [Handoff System](features/HANDOFF_CHECKLIST.md)            | Agent handoff checklist       |
| [Humanization](features/HUMANIZATION.md)                   | Natural conversation features |
| [Spotify Integration](features/SPOTIFY-INTEGRATION.md)     | Music playback                |
| [A/B Testing](features/AB-TESTING.md)                      | Experiment framework          |
| [Monetization](features/MONETIZATION-SYSTEM.md)            | Subscription tiers            |
| [Deep Engagement](features/DEEP-ENGAGEMENT-DOMAINS.md)     | Engagement domains            |
| [Cross-Domain Journeys](features/CROSS-DOMAIN-JOURNEYS.md) | Multi-domain conversations    |
| [Voice Presence](features/VOICE-PRESENCE-ROADMAP.md)       | Voice adaptation              |

### Deployment

| Document                                                     | Description           |
| ------------------------------------------------------------ | --------------------- |
| [Production Deployment](deployment/PRODUCTION-DEPLOYMENT.md) | Production setup      |
| [Google Cloud](deployment/google-cloud-deployment.md)        | GCP deployment        |
| [Environment Variables](deployment/environment-variables.md) | Config reference      |
| [GitHub Secrets](deployment/GITHUB-SECRETS-SETUP.md)         | CI/CD secrets         |
| [Sentry Setup](deployment/SENTRY-SETUP.md)                   | Error tracking        |
| [Dashboards](deployment/DASHBOARDS.md)                       | Monitoring dashboards |

### Security

| Document                                             | Description           |
| ---------------------------------------------------- | --------------------- |
| [Security Checklist](security/SECURITY-CHECKLIST.md) | Security requirements |
| [Security Review](security/security-review.md)       | Security audit        |

### Migrations

| Document                                                       | Description           |
| -------------------------------------------------------------- | --------------------- |
| [Architecture Migration](migrations/ARCHITECTURE-MIGRATION.md) | Architecture changes  |
| [Tool Migration](migrations/TOOL_MIGRATION.md)                 | Tool system updates   |
| [Services Reorg](migrations/SERVICES-REORG-PLAN.md)            | Service restructuring |
| [Voice Agent Split](migrations/VOICE-AGENT-SPLIT-PLAN.md)      | Agent refactoring     |

---

## 🎭 The Team

Ferni AI consists of 6 specialized AI agents:

### Ferni (Coordinator)

The life coach and team coordinator. Wyoming roots, Japan tsunami survivor, mental health advocate. Asks powerful questions and orchestrates the team.

**Domains**: Life coaching, purpose, relationships, resilience, team coordination

### Alex Chen

Communication coach and chief of staff. Handles calendars, emails, and coaches through difficult conversations.

**Domains**: Calendar, email, SMS, calls, assertiveness, boundaries, feedback

### Maya Santos

Life habits coach. Brazilian warmth meets behavior science. Helps build sustainable habits across all life domains.

**Domains**: Habits, routines, wellness, budgeting, behavior change, self-care

### Peter John

The Quant. Legendary analytical mind from Boston. Finds patterns others miss and turns data into actionable insights.

**Domains**: Stock research, pattern analysis, cross-domain insights, behavioral economics

### Jordan Taylor

Lifetime planner. Military brat resilience meets creative vision. Plans life's big moments from daily goals to decade milestones.

**Domains**: Life planning, events, milestones, vacations, goals, celebrations

### Nayan (Premium)

Lifetime advisor. Where inner peace meets compound interest. Combines Bogle's patience, Gandhi's simplicity, Buffett's wit.

**Domains**: Wisdom, philosophy, meditation, consciousness, long-term thinking

---

## 🔧 Development

### Code Standards

See [CLAUDE.md](../CLAUDE.md) for complete coding standards including:

- TypeScript strict mode
- No `console.log` — use `createLogger()`
- Explicit types for all functions
- HMR protection for UI components
- Design system tokens for styling

### Architecture Principles

1. **Persona-First** — Each agent has unique voice, knowledge, and behaviors
2. **Context Builders** — Modular intelligence system
3. **Tool Domains** — Tools organized by capability
4. **Handoff System** — Seamless agent transitions
5. **Memory Persistence** — Cross-session continuity

### Testing

```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

---

## 📊 Monitoring

### Dashboards

- `/cognitive-dashboard.html` — AI reasoning and adaptation
- `/metrics-dashboard.html` — Persistence and sessions
- `/tools-dashboard.html` — Tool usage analytics
- `/api/diagnostics/handoffs` — Handoff metrics (admin only)

### Key Metrics

| Metric             | Target  | Description                  |
| ------------------ | ------- | ---------------------------- |
| Response Latency   | < 200ms | Context builder execution    |
| Handoff Success    | > 95%   | Successful agent transitions |
| Memory Persistence | > 99%   | Data save success rate       |
| User Retention     | Growing | Weekly active users          |

---

## 🆘 Support

### Troubleshooting

| Issue                 | Solution                          |
| --------------------- | --------------------------------- |
| Agent doesn't respond | Check API keys, verify persona ID |
| Memory not persisting | Ensure consistent user IDs        |
| Handoff failing       | Check target persona exists       |
| Build errors          | Run `npm run build` for details   |

### Getting Help

1. Check this documentation
2. Search existing issues
3. Review [CLAUDE.md](../CLAUDE.md) for code standards
4. Open a new issue with reproduction steps

---

## 📄 License

MIT License — See [LICENSE](../LICENSE) for details.
