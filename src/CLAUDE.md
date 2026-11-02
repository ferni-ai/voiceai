# Source code (`src/`)

The voice agent and the UI/API server. **The map of every folder (its layer, its context,
its `index.ts` and its `CLAUDE.md`) is the generated table in
[ARCHITECTURE.md](../ARCHITECTURE.md).** This file only adds what that table can't.

## Layers

Layers L1–L5, the L3 contexts, the import rules and which folder belongs where are all in
[ARCHITECTURE.md](../ARCHITECTURE.md) "Layers", generated from
[architecture-layers.ts](../apps/cli/src/commands/quality/architecture-layers.ts) and
enforced by `pnpm quality:arch`. Don't copy that table here.

Some older `CLAUDE.md` files here still describe a "Level 100/70/60/30/10" model. That
model is retired; the layers in ARCHITECTURE.md are the ones the gate checks.

## Counts worth knowing (2026-10-31)

- **9 personas**, one bundle each in `personas/bundles/<id>/` (plus `shared/` and `types/`).
- **126 tool-domain folders** in `tools/domains/`, two of them shared helpers
  (`shared/`, `life-coaching-shared/`).

## Quick reference

| Need to... | Read |
|---|---|
| Add a tool | `tools/CLAUDE.md` |
| Add or change a persona | `personas/bundles/CLAUDE.md` |
| Add context to a turn's prompt | `intelligence/context-builders/CLAUDE.md` |
| Change the voice agent | `agents/CLAUDE.md` |
| Store or recall data | `memory/CLAUDE.md` |
| Add a flag, a scheduled job, a log marker | [ARCHITECTURE.md](../ARCHITECTURE.md) "Where to add things" |

## Tests

Vitest, next to the code in `__tests__/`: `pnpm vitest run src/<path>`.
