# Ferni AI – Agents

This file tells AI agents how to work on the Ferni codebase.

---

## Package audit agent (src/)

To have an agent **audit each package under `src/`** for clean code, clean architecture, wiring, normalization, e2e, and value:

1. **Run the audit**
   ```bash
   ferni audit package           # Run quality:check + quality:arch, print checklist
   ferni audit package agents   # Same + focus checklist on src/agents
   ```

2. **Follow the framework**
   - Full criteria and package list: **`docs/audits/SRC-PACKAGE-AUDIT.md`**
   - Six criteria per package: clean code, clean architecture, fully wired, normalized, working e2e, valuable to Ferni.

3. **Cursor rule**
   - When editing `src/**/*.ts`, the rule **src-package-audit** applies (see `.cursor/rules/src-package-audit.mdc`).
   - Before considering a package “done”: run `pnpm typecheck`, `pnpm quality:check`, `pnpm quality:arch`, and apply the six criteria.

4. **One package at a time**
   - Prefer auditing and fixing one top-level package (e.g. `agents`, `memory`, `tools`) per pass.
   - Fix or document gaps; keep changes small and incremental.

---

## Other agents

- **Deployment:** Use `ferni deploy` (never raw `gcloud`/`firebase`). See `.cursorrules` deployment table.
- **Quality:** `pnpm quality`, `ferni quality`, `ferni audit quality`, `ferni audit architecture`.
- **Design system:** No hardcoded colors/durations; use tokens. `pnpm tokens:sync`, `ferni tokens check`.

---

*See also: `CLAUDE.md`, `.cursorrules`, `docs/architecture/CLEAN-ARCHITECTURE.md`.*
