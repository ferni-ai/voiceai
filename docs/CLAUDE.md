# Documentation Directory

**Central documentation hub** for Ferni AI Voice Agent architecture, guides, and specifications.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `architecture/` | System architecture docs (~92 files) - start here for technical deep dives |
| `audits/` | Code audits and compliance reports (~81 files) |
| `plans/` | Implementation plans and roadmaps (~48 files) |
| `guides/` | How-to guides and tutorials (~28 files) |
| `features/` | Feature specifications (~22 files) |
| `deployment/` | Deployment procedures and configs |
| `runbooks/` | Operational runbooks for debugging |
| `testing/` | Testing strategies and patterns |
| `api/` | API documentation |
| `security/` | Security policies |
| `roadmaps/` | Product roadmaps |

## Key Architecture Docs (Start Here)

| Document | Purpose |
|----------|---------|
| `architecture/CLEAN-ARCHITECTURE.md` | Layer structure and import rules |
| `architecture/TOOL-LOADING-SYSTEM.md` | How tools get to Gemini/OpenAI |
| `architecture/MEMORY-MANAGEMENT.md` | Stateless Node, caching, cleanup |
| `architecture/AGENT-AGNOSTIC-ARCHITECTURE.md` | Tool/persona patterns |
| `architecture/CROSS-PERSONA-INTELLIGENCE.md` | Team coordination system |
| `architecture/AGENT-EXTENSIBILITY.md` | Commands, hooks, MCP, widgets |
| `architecture/MONETIZATION-SYSTEM.md` | Team unlocks, subscriptions |

## Finding Documentation

```bash
# Search docs by topic
grep -r "superhuman" docs/architecture/
grep -r "deployment" docs/guides/

# List all architecture docs
ls docs/architecture/

# List all plans
ls docs/plans/
```

## Key Runbooks

| Runbook | When to Use |
|---------|-------------|
| `runbooks/DISCONNECT-DEBUGGING.md` | Voice call disconnection issues |
| `runbooks/DEPLOYMENT-ISSUES.md` | Deployment failures |

## Documentation Standards

1. **Architecture docs** are the canonical source for system design
2. **Plans** capture implementation strategy (may be outdated after implementation)
3. **Audits** track compliance and technical debt
4. **Guides** are step-by-step instructions

## Related Files

- Root `CLAUDE.md` - Primary development instructions
- `CORE-PRINCIPLES.md` - Ferni philosophy
- `.cursorrules` - Comprehensive coding standards (22KB)
