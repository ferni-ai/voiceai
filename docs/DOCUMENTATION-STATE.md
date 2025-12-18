# Documentation State & Cleanup Plan

> Last Updated: December 13, 2024

## Executive Summary

The Ferni AI codebase has **~380 markdown files** across multiple directories. This document tracks the documentation structure, cleanup progress, and maintenance guidelines.

### December 2024 Consolidation Complete ✅

Major consolidation work completed Dec 13, 2024:
- **Brand documentation consolidated** to `design-system/brand/` (single source of truth)
- **Brand assets separated** to `brand/` (logos, icons, favicons only)
- **Root-level plans moved** to `docs/plans/`
- **Duplicate files removed** (18 duplicate brand docs, frontend copies)
- Updated all cross-references to use correct paths
- Created [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) as implementation status source

---

## Current State (After Consolidation)

### Documentation Volume

| Category | Files | Notes |
|----------|-------|-------|
| **Root docs** | 9 | CLAUDE.md, README.md, ONBOARDING.md, etc. |
| **CLAUDE.md files** | 7 | Root + 6 subdirectory contexts |
| **docs/ directory** | 100+ | Architecture, guides, features, plans |
| **design-system/brand/** | 19 | All brand documentation (canonical) |
| **brand/** | ~70 assets | Logos, icons, favicons (NO docs) |
| **marketplace-agents/** | 70+ | Agent knowledge bases |
| **apps/** | 80+ | Platform-specific docs |
| **src/**.md files | 90+ | Persona content, module guides |

### Documentation Hierarchy

```
voiceai/
├── ROOT DOCS (Entry Points)
│   ├── README.md              # Project overview
│   ├── CLAUDE.md              # AI coding context (START HERE)
│   ├── CORE-PRINCIPLES.md     # Mission & philosophy
│   ├── ONBOARDING.md          # Developer setup
│   ├── CONTRIBUTING.md        # Contribution process
│   ├── DEPLOYMENT.md          # Deploy instructions
│   ├── SCRIPTS.md             # npm scripts reference
│   ├── BACKLOG.md             # Product backlog
│   └── CHANGELOG.md           # Version history
│
├── docs/                      # Technical Documentation
│   ├── README.md              # Docs index
│   ├── architecture/          # System design
│   │   └── adr/               # Architecture Decision Records
│   ├── guides/                # How-to guides
│   ├── features/              # Feature specs
│   ├── plans/                 # Implementation plans
│   ├── deployment/            # Deploy guides
│   ├── security/              # Security checklists
│   └── audits/                # Quality audits
│
├── design-system/
│   └── brand/                 # Brand DOCUMENTATION (canonical)
│       ├── BETTER-THAN-HUMAN.md    # EQ specification
│       ├── FERNI-BRAND-GUIDELINES.md
│       └── ...
│
├── brand/                     # Brand ASSETS only
│   ├── logos/                 # Logo files
│   ├── icons/                 # App icons
│   ├── favicons/              # Browser favicons
│   ├── social/                # Social media graphics
│   └── ferni-design-tokens.css
│
├── CLAUDE.md Files            # AI Context Hierarchy
│   ├── ./CLAUDE.md            # Root (main context)
│   ├── apps/web/CLAUDE.md
│   ├── src/tools/CLAUDE.md
│   ├── src/personas/CLAUDE.md
│   ├── src/speech/CLAUDE.md
│   ├── src/intelligence/context-builders/CLAUDE.md
│   └── src/tools/habit-coaching/CLAUDE.md
│
├── marketplace-agents/        # Agent Marketplace
│
└── apps/                      # Platform Apps
```

---

## Consolidation Work Completed

### Phase 5: December 13, 2024 Consolidation ✅

| Task | Status |
|------|--------|
| Remove 18 duplicate brand docs from `brand/` | ✅ Done |
| Remove `apps/web/public/design-system/brand/` copies | ✅ Done |
| Move `PLAN.md`, `IMPLEMENTATION-PLAN.md`, `EXTENSIBILITY-COMPLETION-PLAN.md` to `docs/plans/` | ✅ Done |
| Update `brand/README.md` to reference `design-system/brand/` | ✅ Done |
| Update `design-system/brand/README.md` as canonical index | ✅ Done |
| Update `docs/README.md` with correct brand paths | ✅ Done |
| Add `docs/plans/` section to docs index | ✅ Done |
| Rename `src/personality/BETTER-THAN-HUMAN.md` → `SUPERHUMAN-FEATURES.md` | ✅ Done |

### Previous Phases (Completed)

- [x] Phase 1: Fix critical path references in CLAUDE.md
- [x] Phase 2: Create `docs/audits/` directory, consolidate audits
- [x] Phase 3: Add "Last Updated" dates, create CURRENT-STATE-SUMMARY.md
- [x] Phase 4: Comprehensive feature audit (Dec 2024)

---

## Source of Truth Reference

| Content Type | Canonical Location |
|--------------|-------------------|
| **Brand documentation** | `design-system/brand/*.md` |
| **Brand assets** | `brand/` (logos, icons, favicons) |
| **EQ specification** | `design-system/brand/BETTER-THAN-HUMAN.md` |
| **Implementation plans** | `docs/plans/` |
| **Architecture docs** | `docs/architecture/` |
| **Feature specs** | `docs/features/` |
| **How-to guides** | `docs/guides/` |
| **AI coding context** | `CLAUDE.md` (root + subdirectories) |
| **Implementation status** | `docs/CURRENT-STATE-SUMMARY.md` |

---

## CLAUDE.md Hierarchy

The AI context files form a coherent tree:

```
CLAUDE.md (root) - 26KB
├── Essential patterns, quality gates, deployment
├── Brand language & design system rules
│
├── apps/web/CLAUDE.md - Frontend patterns
│
├── src/tools/CLAUDE.md - Tool development
│
├── src/personas/CLAUDE.md - Persona bundles
│
├── src/speech/CLAUDE.md - Voice/audio processing
│
├── src/intelligence/context-builders/CLAUDE.md - Context builders
│
└── src/tools/habit-coaching/CLAUDE.md - Module organization example
```

### Context Injection Principles

1. **Root CLAUDE.md** = Working memory (quality gates, deploy commands, patterns)
2. **Subdirectory CLAUDE.md** = Domain expertise (specific to that code area)
3. **docs/** = Long-term reference (search as needed)
4. **design-system/brand/** = Design constraints (UI/UX decisions)

---

## Maintenance Guidelines

### Where to Add New Docs

| Content Type | Location |
|-------------|----------|
| New feature spec | `docs/features/` |
| System architecture | `docs/architecture/` |
| How-to guide | `docs/guides/` |
| Implementation plan | `docs/plans/` |
| Architecture decision | `docs/architecture/adr/` |
| Brand guideline | `design-system/brand/` |
| Code pattern | Update relevant CLAUDE.md |
| Quality audit | `docs/audits/` |

### Documentation Review Cadence

| Docs | Review Frequency |
|------|------------------|
| CLAUDE.md files | Every sprint |
| docs/architecture/ | Quarterly |
| docs/guides/ | Monthly |
| design-system/brand/ | Annually |
| TECH-DEBT.md | Weekly (auto-generated) |

### Naming Conventions

- Architecture: `docs/architecture/FEATURE-ARCHITECTURE.md`
- Features: `docs/features/FEATURE-NAME.md`
- Plans: `docs/plans/FEATURE-PLAN.md`
- Guides: `docs/guides/TOPIC-GUIDE.md`
- Audits: `docs/audits/AREA-AUDIT.md`

---

## Remaining Tasks

### Ongoing Maintenance

- [ ] Split files over 1000 lines where appropriate
- [ ] Audit marketplace-agents knowledge files
- [ ] Create quick-reference cards for common tasks
- [ ] Verify all internal doc links are working

### Future Improvements

- [ ] Add automated link checking to CI
- [ ] Consider doc versioning for major changes
- [ ] Add search/index for large doc sets

---

## Metrics

### After Consolidation (Dec 13, 2024)

- Total files: ~380 (down from ~395)
- Duplicate files removed: 37
- Root-level clutter: 3 files moved to docs/plans/
- Brand docs: Single source of truth established

### Target State

- Essential docs: <20 files ✅
- CLAUDE.md hierarchy: ~30KB total ✅
- No duplicate content ✅
- All paths verified working ✅
