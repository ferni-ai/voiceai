# Source Code (`src/`)

> **Navigation index for all Ferni backend modules.**

This directory contains the core backend implementation. Modules are organized by clean architecture layers - lower layers cannot import from higher layers.

---

## Architecture Layers

```
Level 100 (Application)     ← Entry points, orchestration
Level 70  (Domain)          ← Business logic, personas, tools
Level 60  (Service)         ← Shared services
Level 30  (Infrastructure)  ← Storage, external integrations
Level 10  (Foundation)      ← Config, utils, types
```

---

## Quick Reference

| Need to... | Go to |
|------------|-------|
| Add a new tool | `tools/CLAUDE.md` |
| Create a persona | `personas/CLAUDE.md` |
| Add context injection | `intelligence/CLAUDE.md` |
| Modify voice agent | `agents/CLAUDE.md` |
| Add a service | `services/CLAUDE.md` |
| Store data | `memory/CLAUDE.md` |

---

## Module Index by Layer

### Level 100: Application Layer

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `agents/` | ✅ | Voice agent implementation, multi-agent, group conversations |
| `api/` | ✅ | REST API routes, middleware, webhooks |
| `cli/` | ✅ | Internal dev CLI tools (not user-facing) |
| `servers/` | ✅ | Token server, UI server, WebSocket |

### Level 70: Domain Layer

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `personas/` | ✅ | 6 AI team members, bundles, cognitive profiles |
| `intelligence/` | ✅ | Context builders, emotional analysis |
| `tools/` | ✅ | 118 tool domains, semantic selection |
| `conversation/` | ✅ | Humanization, 26K+ lines of dialogue magic |
| `speech/` | ✅ | SSML, prosody, backchanneling |
| `handoff/` | ✅ | Persona transitions, cameo system |
| `tasks/` | ✅ | Emotion-aware task execution |
| `audio/` | ✅ | DJ Booth, music player, preferences |

### Level 60: Service Layer

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `services/` | ✅ | 200+ services, superhuman capabilities |
| `session/` | ✅ | SessionCoordinator, lifecycle |
| `marketplace/` | ✅ | Tool registry, sandboxed execution |

### Level 30: Infrastructure Layer

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `memory/` | ✅ | Firestore, Postgres, Redis, embeddings |
| `context/` | ✅ | ContextManager, session context |
| `personality/` | ✅ | Personality emergence, timing |
| `workers/` | - | Background worker processes |

### Level 10: Foundation Layer

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `config/` | - | Environment, feature flags |
| `utils/` | - | Logging, validation, helpers |
| `types/` | - | Shared TypeScript types |
| `errors/` | ✅ | FerniError base class, error codes |
| `i18n/` | ✅ | 11 locales, RTL support |

### Supporting Modules

| Module | CLAUDE.md | Purpose |
|--------|-----------|---------|
| `tests/` | ✅ | Integration tests, fixtures |
| `scripts/` | ✅ | One-off and scheduled scripts |
| `jobs/` | ✅ | Background maintenance jobs |
| `runtime/` | ✅ | Local/remote runtime abstraction |
| `ssml/` | - | SSML generation utilities |

---

## Entry Points

| File | Purpose |
|------|---------|
| `agent.ts` | Main agent factory |
| `startup.ts` | Application bootstrap |

---

## Import Rules (Enforced)

```bash
# Validate architecture
pnpm quality:arch
```

| From Level | Can Import From |
|------------|-----------------|
| 100 (agents, api) | 70, 60, 30, 10 |
| 70 (personas, tools) | 60, 30, 10 |
| 60 (services) | 30, 10 |
| 30 (memory) | 10 |
| 10 (utils) | Only external packages |

---

## Common Tasks

### Running Tests
```bash
pnpm vitest run src/tests/          # Integration tests
pnpm vitest run src/*/\__tests__/   # Unit tests per module
```

### Finding Code
```bash
# Find a tool
grep -r "toolName" src/tools/

# Find a service
grep -r "serviceName" src/services/

# Find a persona behavior
grep -r "behaviorName" src/personas/bundles/
```

---

## Related Documentation

- Root `CLAUDE.md` - Project overview, deployment, quality gates
- `docs/architecture/CLEAN-ARCHITECTURE.md` - Full architecture details
- `apps/CLAUDE.md` - Frontend and platform apps

---

*Last updated: January 2026*
