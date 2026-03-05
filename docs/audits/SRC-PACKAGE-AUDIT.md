# src Package Audit Framework

> **Purpose:** Ensure every package under `src/` has clean code, clean architecture, is fully wired, normalized, working e2e, and valuable to the Ferni platform.

Use this when auditing a package (by hand or with an AI agent). Run `ferni audit package [name]` to run automated checks and print the checklist for a package.

---

## Packages (top-level under `src/`)

| Package | Layer | Purpose | CLAUDE.md |
|---------|-------|---------|-----------|
| `agents` | 100 | Voice agent implementations, entry points | `src/agents/CLAUDE.md` |
| `api` | 100 | API route handlers (sites, memory, health, etc.) | `src/api/` (see servers) |
| `audio` | 70 | DJ controller, music player, preference learning | `src/audio/CLAUDE.md` |
| `config` | 20 | App configuration, feature flags | - |
| `context` | 70 | ContextManager, session context | `src/context/CLAUDE.md` |
| `conversation` | 70 | Humanization, conversation state | `src/conversation/CLAUDE.md` |
| `diagnostics` | 60 | Diagnostics, crash analytics | - |
| `errors` | 10 | Shared error types, Result utilities | - |
| `handoff` | 70 | Persona transitions, cameo system | `src/handoff/CLAUDE.md` |
| `intelligence` | 70 | Context builders, tracking, insights | `src/intelligence/CLAUDE.md` |
| `integrations` | 70 | External integrations (e.g. Qwen3-Omni config) | - |
| `memory` | 30 | Storage, dynamic memory, knowledge graph | `src/memory/CLAUDE.md`, `src/memory/dynamic/CLAUDE.md` |
| `marketplace` | 70 | Tool registry, sandboxed execution | `src/marketplace/CLAUDE.md` |
| `personas` | 70 | Persona bundles, loader, IDs | `src/personas/CLAUDE.md` |
| `personality` | 70 | Personality emergence, timing | `src/personality/CLAUDE.md` |
| `runtime` | 100 | Runtime / worker entry | - |
| `servers` | 100 | Token server, API gateway, security headers | `src/servers/CLAUDE.md` |
| `services` | 60 | DI, session manager, business services | `src/services/CLAUDE.md` |
| `session` | 60 | Session state, lifecycle | - |
| `speech` | 70 | TTS gateway, SSML, providers | `src/speech/CLAUDE.md` |
| `ssml` | 70 | SSML generation, Cartesia helpers | - |
| `tasks` | 60 | Scheduled jobs, task system | `src/tasks/CLAUDE.md` |
| `tools` | 70 | LLM tools, semantic router, domains | `src/tools/CLAUDE.md` |
| `types` | 10 | Shared types, Result, profile types | - |
| `utils` | 10 | Logger, transformers-loader, guards | - |
| `workers` | 100 | Background workers | - |
| `jobs` | 60 | Job queue / job definitions | - |
| `i18n` | 10 | Internationalization | - |
| `e2e` | 0 | E2E test helpers | - |
| `tests` | 0 | E2E and integration tests | - |

---

## Audit Criteria (per package)

### 1. Clean code

- [ ] No `as any` (or within project threshold); use `unknown` + type guards.
- [ ] No raw `console.*`; use `createLogger()` from `utils/safe-logger.js`.
- [ ] Files ≤ 500 lines; split or extract submodules if larger.
- [ ] Single responsibility per module; clear naming (see `.cursorrules` module suffixes).
- [ ] JSDoc on public APIs; inline comments for *why*, not *what*.
- [ ] Errors: Result types for expected failures, throw for bugs; never swallow.

**Automated:** `pnpm quality:check` (as any, console, file size).

### 2. Clean architecture

- [ ] Imports respect layer hierarchy (see `apps/cli/src/commands/quality/architecture-validator.ts`).
- [ ] No circular dependencies across top-level packages.
- [ ] Dependencies flow inward (e.g. agents → services → memory/utils/types/config).
- [ ] Allowed exceptions documented in architecture validator if needed.

**Automated:** `pnpm quality:arch`.

### 3. Fully wired

- [ ] Exported from a single barrel (`index.ts`) where appropriate.
- [ ] Registered in DI / startup where the package is a service (e.g. services, memory).
- [ ] API routes registered in `servers/api` or equivalent if the package exposes HTTP.
- [ ] No dead entry points; all public APIs are reachable from a known entry (agent, API, CLI).
- [ ] Feature flags / config used for optional features, not commented-out code.

### 4. Normalized

- [ ] Naming matches project conventions (camelCase, PascalCase, kebab-case files).
- [ ] Module suffix conventions: `-service.ts`, `-handler.ts`, `-manager.ts`, etc. (see `.cursorrules`).
- [ ] Same patterns as sibling packages (e.g. same logger usage, same error style).
- [ ] Design tokens / CSS variables for any UI or branding (no hardcoded colors/durations).

### 5. Working e2e

- [ ] Unit tests for core logic (under `__tests__/` or `*.test.ts` next to source).
- [ ] Integration or e2e coverage where the package is on a critical path (e.g. agents, memory, tools).
- [ ] No known flaky tests; tests are deterministic and fast where possible.
- [ ] Run `pnpm typecheck` and relevant `pnpm vitest run <path>` for the package.

### 6. Valuable to Ferni

- [ ] Package has a clear purpose aligned with product (voice agent, memory, personas, tools, etc.).
- [ ] No duplicate or redundant behavior that exists elsewhere in `src/`.
- [ ] Documented in CLAUDE.md or README when non-obvious; linked from this audit doc.
- [ ] If deprecated or experimental, it is clearly marked and scoped.

---

## How to run the agent

1. **Automated checks (whole repo)**  
   ```bash
   ferni audit package
   ```
   Runs `pnpm quality:check` and `pnpm quality:arch`, then prints this checklist.

2. **Audit one package**  
   ```bash
   ferni audit package agents
   ```
   Runs the same checks and prints the checklist for `src/agents` only (for human/agent to fill).

3. **In Cursor**  
   When working under `src/<package>`, the rule **src-package-audit** applies. Follow the criteria above and run the relevant quality commands before considering the package “done.”

---

## Agent instructions (summary)

When you are asked to audit or refactor a package under `src/`:

1. **Identify the package** (e.g. `src/agents`, `src/memory`).
2. **Run** `pnpm typecheck`, `pnpm quality:check`, `pnpm quality:arch`.
3. **Walk the six criteria** (clean code, clean architecture, wired, normalized, e2e, valuable) and fix or document gaps.
4. **Prefer small, incremental changes**; keep clean architecture and existing patterns.
5. **Update this doc** if you add a new top-level package or change a package’s purpose.

---

## Package audit log (sample)

### src/intelligence (audited 2026-02)

| Criterion | Status | Notes |
|-----------|--------|--------|
| Clean code | ✅ | No blocking `as any` in production code; tests use minimal casts. Some files >500 lines (tracking/*). |
| Clean architecture | ✅ | Layer 70; no violations. |
| Fully wired | ✅ | Barrel exports in index.ts; context-builders, triggers, etc. wired via assembler and voice agent. |
| Normalized | ✅ | Naming and patterns consistent; CLAUDE.md and subdirectory docs present. |
| Working e2e | ✅ | 1038 tests pass. Fixed flaky trigger test (fixed time in personal-context-integrator.test.ts). |
| Valuable | ✅ | Core to Ferni: context assembly, triggers, tracking, proactive intelligence. |

Run: `pnpm vitest run src/intelligence` — all pass.

---

*Last updated: February 2026*
