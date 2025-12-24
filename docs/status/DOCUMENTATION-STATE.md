# Documentation State & Cleanup Plan

> Last Updated: December 23, 2024

## Executive Summary

The Ferni AI codebase has **~380 markdown files** in `/docs` directory. This document tracks the documentation structure, cleanup progress, and maintenance guidelines.

### December 2024 Consolidation Complete ✅

**Phase 1 (Dec 13):** Brand documentation and assets consolidation
- Brand documentation consolidated to `design-system/brand/` (single source of truth)
- Brand assets separated to `brand/` (logos, icons, favicons only)
- Root-level plans moved to `docs/plans/`
- Duplicate files removed (18 duplicate brand docs, frontend copies)

**Phase 2 (Dec 23):** Documentation cleanup and reorganization
- Moved 7 misplaced docs from `/docs/` root to proper subdirectories
- Archived 4 completed audits to `docs/archive/completed-audits/`
- Archived 3 completed plans to `docs/archive/completed-plans/`
- Archived point-in-time progress report
- Updated all cross-references and counts
- Created [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) as implementation status source

---

## Current State (After Consolidation)

### Documentation Volume (Updated Dec 23, 2024)

| Category | Files | Notes |
|----------|-------|-------|
| **Root docs** | 9 | CLAUDE.md, README.md, ONBOARDING.md, etc. |
| **CLAUDE.md files** | 11 | Root + 10 subdirectory contexts |
| **docs/architecture/** | 60 | System design and ADRs |
| **docs/audits/** | 50 | Active quality audits |
| **docs/plans/** | 40 | Implementation plans |
| **docs/guides/** | 24 | How-to guides |
| **docs/features/** | 19 | Feature specs |
| **docs/research/** | 4 | Research and academic analysis |
| **docs/refactoring/** | 7 | Refactoring guides |
| **docs/status/** | 5 | Implementation status & health |
| **docs/archive/** | 20 | Completed/outdated docs |
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
├── CLAUDE.md Files            # AI Context Hierarchy (11 files)
│   ├── ./CLAUDE.md            # Root (main context)
│   ├── apps/web/CLAUDE.md     # Frontend design standards
│   ├── src/tools/CLAUDE.md    # Tool development
│   ├── src/tools/habit-coaching/CLAUDE.md  # Module example
│   ├── src/personas/CLAUDE.md # Persona development
│   ├── src/speech/CLAUDE.md   # Speech processing
│   ├── src/ssml/CLAUDE.md     # SSML generation
│   ├── src/intelligence/context-builders/CLAUDE.md  # Context builders
│   ├── src/services/CLAUDE.md # Services layer (NEW Dec 20)
│   ├── src/agents/CLAUDE.md   # Voice agent development (NEW Dec 20)
│   └── src/memory/CLAUDE.md   # Memory system (NEW Dec 20)
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

### After Cleanup (Dec 20, 2024)

**New CLAUDE.md files added:**
- `src/services/CLAUDE.md` - Services layer guide
- `src/agents/CLAUDE.md` - Voice agent development guide
- `src/memory/CLAUDE.md` - Memory system guide

**Files archived (duplicates/redundant):**
- `docs/BTH-AUDIT.md` → `docs/archive/` (duplicate of `audits/BETTER-THAN-HUMAN-AUDIT.md`)
- `docs/features/HUMANIZATION.md` → `docs/archive/` (redundant with `HUMANIZATION-ROADMAP.md`)
- `docs/api/API.md` → `docs/archive/` (redundant with `API-DOCUMENTATION.md`)

**Files moved:**
- `docs/features/VOICE-HUMANIZATION-RESEARCH.md` → `docs/research/` (proper location for research)

**Cross-references added:**
- `src/services/outreach/README.md` - Added "Related Documentation" section linking to vision, architecture, plans, audits, webhooks
- `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md` - Added cross-references to related intelligence docs
- `docs/architecture/SUPERHUMAN-INTELLIGENCE.md` - Added cross-references to related intelligence docs
- `docs/architecture/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md` - Added cross-references to related intelligence docs

**Updated counts:**
- CLAUDE.md files: 8 → 11 (added 3 new)
- Duplicate files removed: 3 more
- Created `docs/research/` directory
- Documentation cross-references: 4 files enhanced with navigation links

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
