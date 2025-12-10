# Documentation State & Cleanup Plan

> Last Updated: December 9, 2024

## Executive Summary

The Ferni AI codebase has **395 markdown files** across multiple directories. This document analyzes the current state, identifies issues, and proposes a rationalized structure for context engineering.

---

## Current State Overview

### Documentation Volume

| Category | Files | Lines (est.) | Notes |
|----------|-------|--------------|-------|
| **Root docs** | 9 | 2,000 | Core entry points |
| **CLAUDE.md files** | 6 | 700 | AI assistant context |
| **docs/ directory** | 100+ | 15,000+ | Architecture, guides, features |
| **brand/ directory** | 18 | 5,000+ | Design guidelines |
| **marketplace-agents/** | 70+ | 10,000+ | Agent knowledge bases |
| **apps/** | 80+ | 3,000+ | Platform-specific docs |
| **promo/ferni-website/** | 35+ | 2,000+ | Marketing content |
| **Total** | ~395 | ~40,000+ | Significant maintenance burden |

### Documentation Hierarchy

```
voiceai/
├── ROOT DOCS (Entry Points)
│   ├── README.md              # Project introduction
│   ├── CLAUDE.md              # AI coding context
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
│   ├── architecture/          # System design (10 files)
│   │   └── adr/               # Architecture Decision Records
│   ├── guides/                # How-to guides (12 files)
│   ├── features/              # Feature specs (9 files)
│   ├── deployment/            # Deploy guides (6 files)
│   ├── security/              # Security checklists (3 files)
│   └── onboarding/            # Welcome docs (1 file)
│
├── brand/                     # Brand Guidelines (18 files)
│   ├── logos/                 # Logo assets
│   └── *.md                   # Design system docs
│
├── CLAUDE.md Files            # AI Context (6 files)
│   ├── ./CLAUDE.md            # Root (main)
│   ├── frontend-typescript/   # Frontend patterns
│   ├── src/tools/             # Tool development
│   ├── src/personas/          # Persona development
│   ├── src/intelligence/      # Context builders
│   └── src/tools/habit-coaching/ # Module example
│
├── marketplace-agents/        # Agent Marketplace
│   ├── agents/*/              # 8 agent bundles
│   └── docs/phases/           # Development phases
│
└── apps/                      # Platform Apps
    ├── ios/                   # iOS docs
    ├── android/               # Android docs
    ├── electron/              # Desktop docs
    └── marketing/             # Marketing content
```

---

## Issues Identified

### 1. Path Reference Errors

**CLAUDE.md (line 94-97)** references incorrect paths:
```markdown
- **Architecture**: `docs/CLEAN-ARCHITECTURE.md`           # WRONG
- **Tool/Persona patterns**: `docs/AGENT-AGNOSTIC-ARCHITECTURE.md`  # WRONG
- **Monetization & Team Unlocks**: `docs/MONETIZATION-SYSTEM.md`     # WRONG
```

**Correct paths:**
```markdown
- **Architecture**: `docs/architecture/CLEAN-ARCHITECTURE.md`
- **Tool/Persona patterns**: `docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md`
- **Monetization & Team Unlocks**: `docs/architecture/MONETIZATION-SYSTEM.md`
```

### 2. Duplicate/Overlapping Content

| File(s) | Issue | Action |
|---------|-------|--------|
| `docs/TECH-DEBT.md` vs `docs/guides/TECH-DEBT.md` | Duplicate location | Consolidate to one |
| `brand/BETTER-THAN-HUMAN.md` vs `docs/BETTER-THAN-HUMAN-*.md` | Overlap | Brand = spec, docs = implementation |
| `DESIGN-SYSTEM-AUDIT.md` in multiple dirs | Scattered | Consolidate in docs/ |
| Multiple `README.md` in build dirs | Build artifacts | Exclude from tracking |

### 3. Large Files (>500 lines)

| File | Lines | Action |
|------|-------|--------|
| `docs/BETTER-THAN-PHD-ROADMAP.md` | 2,015 | Consider splitting into phases |
| `docs/TRUST-SYSTEMS.md` | 957 | Keep as reference |
| `docs/guides/api-reference.md` | 752 | Keep (reference doc) |
| `docs/guides/FERNI-COMPLETE-GUIDE.md` | 690 | Keep (guide) |

### 4. Inconsistent Organization

- Feature docs split between `docs/` root and `docs/features/`
- Some guides in `docs/` root, others in `docs/guides/`
- Audit files scattered across directories

### 5. Stale Content Candidates

| File | Concern |
|------|---------|
| `promo/ferni-website/_archive/` | Archive directory |
| `apps/*/build/` directories | Build artifacts with docs |
| Marketing blog posts | May need updates |

---

## Rationalized Structure (Proposed)

### Tier 1: Essential (Must Read)

Files that every developer should read:

```
voiceai/
├── README.md                    # What is Ferni?
├── CORE-PRINCIPLES.md           # Why we build this way
├── CLAUDE.md                    # AI coding context
└── ONBOARDING.md                # Getting started
```

### Tier 2: Reference (As Needed)

Technical references consulted during development:

```
docs/
├── README.md                    # Index & navigation
│
├── architecture/                # HOW the system works
│   ├── CLEAN-ARCHITECTURE.md    # Layer structure
│   ├── AGENT-AGNOSTIC-ARCHITECTURE.md
│   ├── COGNITIVE-INTELLIGENCE-ARCHITECTURE.md
│   ├── PERSISTENCE-ARCHITECTURE.md
│   ├── HANDOFF_ARCHITECTURE.md
│   ├── FERNI-EMOTION-SYSTEM.md
│   ├── MONETIZATION-SYSTEM.md
│   └── adr/                     # Decision records
│
├── guides/                      # HOW TO do things
│   ├── creating-personas.md
│   ├── environment-variables.md
│   ├── api-reference.md
│   ├── RUNBOOK.md
│   └── FERNI-COMPLETE-GUIDE.md
│
├── features/                    # WHAT features exist
│   ├── PROACTIVE-OUTREACH-VISION.md
│   ├── MUSIC-GAMES.md
│   ├── SPOTIFY-INTEGRATION.md
│   ├── AB-TESTING.md
│   └── VOICE-PRESENCE-ROADMAP.md
│
├── deployment/                  # HOW TO deploy
│   ├── PRODUCTION-DEPLOYMENT.md
│   ├── QUICK-DEPLOY.md
│   └── SUBSCRIPTION-SETUP.md
│
├── security/                    # Security checklists
│   └── SECURITY-CHECKLIST.md
│
└── audits/                      # Centralized audits (IMPLEMENTED)
    ├── DESIGN-SYSTEM-AUDIT.md
    ├── BETTER-THAN-HUMAN-AUDIT.md
    ├── EMOTION-ANIMATION-AUDIT.md
    ├── GAMES-AUDIT.md
    ├── BEHAVIOR-AUDIT.md
    └── SDLC-AUDIT.md
```

### Tier 3: Domain Knowledge

Specialized documentation by area:

```
brand/                           # BRAND guidelines
├── README.md                    # Index
├── FERNI-BRAND-GUIDELINES.md    # Core brand
├── FERNI-SCREEN-GUIDELINES.md   # Screen design
├── BETTER-THAN-HUMAN.md         # EQ specification
└── ...                          # Other brand docs

src/                             # CLAUDE.md context files
├── tools/CLAUDE.md
├── personas/CLAUDE.md
└── intelligence/context-builders/CLAUDE.md

marketplace-agents/              # AGENT development
├── README.md
├── CONTRIBUTING.md
└── docs/
```

### Tier 4: Supporting (Rarely Accessed)

```
apps/                            # Platform-specific
promo/                           # Marketing content
.github/                         # Templates
```

---

## Context Engineering Strategy

### For AI Assistants (CLAUDE.md Hierarchy)

The CLAUDE.md files should form a coherent context tree:

```
CLAUDE.md (root)
├── Essential patterns, quality gates, architecture layers
├── References to subdirectory CLAUDE.md files
│
├── frontend-typescript/CLAUDE.md
│   ├── Design tokens, component patterns
│   ├── Animation principles
│   └── UI-specific rules
│
├── src/tools/CLAUDE.md
│   ├── Tool registration pattern
│   ├── Schema design
│   └── Testing requirements
│
├── src/personas/CLAUDE.md
│   ├── Persona bundle structure
│   ├── Cognitive profiles
│   └── Behavior patterns
│
├── src/intelligence/context-builders/CLAUDE.md
│   ├── Context builder pattern
│   ├── Priority system
│   └── Token management
│
└── src/tools/habit-coaching/CLAUDE.md
    └── Module organization example
```

### Context Injection Principles

1. **CLAUDE.md = Working Memory**: Keep under 300 lines, essential patterns only
2. **Subdirectory CLAUDE.md = Domain Expertise**: Specific to that code area
3. **docs/ = Long-term Reference**: AI should search, not load wholesale
4. **brand/ = Design Constraints**: Reference for UI/UX decisions

### Information Architecture

| Question | Where to Look |
|----------|---------------|
| "How do I start?" | README.md → ONBOARDING.md |
| "What patterns should I follow?" | CLAUDE.md |
| "How does X system work?" | docs/architecture/*.md |
| "How do I implement Y?" | docs/guides/*.md |
| "What should Z look like?" | brand/*.md |
| "What's the spec for feature W?" | docs/features/*.md |

---

## Cleanup Actions

### Phase 1: Fix Critical Issues (Immediate) - COMPLETED

- [x] Fix path references in CLAUDE.md (line 94-97)
- [x] Create `docs/audits/` directory
- [x] Move scattered audit files to `docs/audits/`
- [x] Remove duplicate TECH-DEBT.md files (removed `docs/guides/TECH-DEBT.md`)

### Phase 2: Consolidate (This Week) - COMPLETED

- [x] Update docs/README.md with complete index
- [x] Ensure all cross-references use correct paths
- [x] Update brand/README.md with full documentation index
- [x] Review stale content - promo/_archive already contains archived content

### Phase 3: Optimize (Ongoing)

- [ ] Split files over 1000 lines where appropriate
- [ ] Add "Last Updated" dates to major docs
- [ ] Create quick-reference cards for common tasks
- [ ] Audit marketplace-agents knowledge files

---

## Maintenance Guidelines

### When to Create New Docs

| Situation | Action |
|-----------|--------|
| New feature | Add to `docs/features/` |
| New system/architecture | Add to `docs/architecture/` |
| How-to guide | Add to `docs/guides/` |
| Design decision | Add ADR to `docs/architecture/adr/` |
| Brand guideline | Add to `brand/` |
| Code pattern | Update relevant CLAUDE.md |

### Documentation Review Cadence

| Docs | Review Frequency |
|------|------------------|
| CLAUDE.md files | Every sprint |
| docs/architecture/ | Quarterly |
| docs/guides/ | Monthly |
| brand/ | Annually |
| TECH-DEBT.md | Weekly |

---

## Metrics

### Current State
- Total files: 395
- Estimated lines: 40,000+
- CLAUDE.md total: ~700 lines
- Average doc size: ~100 lines

### Target State
- Essential docs: <20 files
- CLAUDE.md hierarchy: <2,000 lines total
- No duplicate content
- All paths verified working

---

## Next Steps

1. **Review this plan** - Confirm priorities
2. **Execute Phase 1** - Fix critical path issues
3. **Update docs/README.md** - Create comprehensive index
4. **Audit brand/** - Consolidation opportunities
5. **Establish review cadence** - Prevent future drift
