# Tools Directory Consolidation Plan

**Status**: Proposed  
**Author**: AI Assistant  
**Date**: 2024-12-06

## Overview

The `src/tools/` directory has 145 files with significant overlap and duplication. This plan identifies duplicate patterns and proposes consolidation into a cleaner domain-based structure.

## Current State Analysis

### Identified Duplications

#### 1. Habit Tools (Most Severe)
```
src/tools/
├── habit-coaching.ts           # 4,689 lines (main implementation)
├── habit-coaching/             # NEW modular split (7 files)
├── habits.ts                   # Simpler habit tools
├── habit-types/                # Type definitions (4 files)
│   ├── index.ts
│   ├── types.ts
│   ├── tendencies.ts
│   └── domains.ts
├── habit-system/               # Another habit implementation (5 files)
│   ├── index.ts
│   ├── types.ts
│   ├── domains.ts
│   ├── challenges.ts
│   └── bundles.ts
├── domains/habits/             # Domain-based habits (2 files)
│   ├── index.ts
│   └── unified-habits.ts
└── financial-habits.ts         # Finance-specific habits
```

**Issue**: 6 different locations for habit-related code!

#### 2. Communication Tools
```
src/tools/
├── communication.ts            # Basic communication tools
├── communication-coaching.ts   # 1,370 lines - coaching features
├── communication-tools.ts      # Yet another communication file
└── domains/communication/      # Domain version
    └── index.ts
```

**Issue**: 4 different files for communication tools

#### 3. Financial Tools
```
src/tools/
├── personal-finance.ts         # Personal finance tools
├── financial-habits.ts         # Financial habit tracking
├── calculators.ts              # Financial calculators
├── bills.ts                    # Bill management
├── plaid.ts                    # Plaid integration
├── retirement-planning.ts      # Retirement tools
├── domains/finance/            # Domain version
│   └── index.ts
└── domains/financial.ts        # Another finance file
```

**Issue**: 8 different files for financial functionality

#### 4. Proactive Tools
```
src/tools/
├── proactive.ts                # Proactive outreach
├── proactive-coaching.ts       # Proactive coaching
├── proactive-outreach.ts       # Another outreach file
└── domains/proactive/          # Domain version
    └── index.ts
```

**Issue**: 4 different files for proactive features

## Proposed Consolidated Structure

The goal is to move everything into the `domains/` pattern:

```
src/tools/
├── index.ts                    # Main barrel file
├── builder.ts                  # Tool building utilities
├── lifecycle.ts                # Tool lifecycle management
├── categories.ts               # Tool categorization
│
├── domains/                    # ALL domain-specific tools here
│   ├── index.ts                # Domain barrel file
│   │
│   ├── habits/                 # Consolidated habit tools
│   │   ├── index.ts
│   │   ├── types.ts            # From habit-coaching/types.ts
│   │   ├── constants.ts        # From habit-coaching/constants.ts
│   │   ├── tendencies.ts       # Four tendencies framework
│   │   ├── challenges.ts       # 30-day challenges
│   │   ├── transitions.ts      # Life transitions
│   │   ├── helpers.ts          # Helper functions
│   │   ├── financial.ts        # Financial habits (from financial-habits.ts)
│   │   └── tools.ts            # LLM tool definitions
│   │
│   ├── communication/          # Consolidated communication tools
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── coaching.ts         # From communication-coaching.ts
│   │   └── tools.ts            # Basic communication tools
│   │
│   ├── finance/                # Consolidated finance tools
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── personal.ts         # Personal finance
│   │   ├── calculators.ts      # Financial calculators
│   │   ├── bills.ts            # Bill management
│   │   ├── retirement.ts       # Retirement planning
│   │   └── plaid.ts            # Plaid integration
│   │
│   ├── proactive/              # Consolidated proactive tools
│   │   ├── index.ts
│   │   ├── coaching.ts
│   │   ├── outreach.ts
│   │   └── insights.ts
│   │
│   └── [other domains...]
│
├── handoff/                    # Handoff system (keep separate)
├── registry/                   # Tool registry (keep separate)
├── orchestration/              # Tool orchestration (keep separate)
├── utils/                      # Shared utilities
└── shared/                     # Shared code
```

## Consolidation Phases

### Phase 1: Habit Tools Consolidation
**Timeline**: 4-6 hours  
**Risk**: Medium (high usage)

**Files to consolidate into `domains/habits/`:**

| Current File | Action | Target |
|--------------|--------|--------|
| `habit-coaching.ts` | Keep for now (backward compat) | - |
| `habit-coaching/` | Keep (new modular structure) | - |
| `habits.ts` | Deprecate, merge into domains | `domains/habits/tools.ts` |
| `habit-types/` | Move | `domains/habits/types.ts` |
| `habit-system/` | Merge with habit-coaching | `domains/habits/` |
| `financial-habits.ts` | Move | `domains/habits/financial.ts` |
| `domains/habits/` | Consolidate target | - |

**Steps:**
1. Create consolidated `domains/habits/index.ts` that imports from all sources
2. Add deprecation warnings to old files
3. Update imports across codebase
4. Remove deprecated files after verification

### Phase 2: Communication Tools Consolidation
**Timeline**: 2-3 hours  
**Risk**: Low

**Files to consolidate:**

| Current File | Action | Target |
|--------------|--------|--------|
| `communication.ts` | Merge | `domains/communication/tools.ts` |
| `communication-coaching.ts` | Keep as coaching module | `domains/communication/coaching.ts` |
| `communication-tools.ts` | Merge | `domains/communication/tools.ts` |
| `domains/communication/` | Target | - |

### Phase 3: Finance Tools Consolidation
**Timeline**: 3-4 hours  
**Risk**: Medium

**Files to consolidate:**

| Current File | Action | Target |
|--------------|--------|--------|
| `personal-finance.ts` | Move | `domains/finance/personal.ts` |
| `calculators.ts` | Move | `domains/finance/calculators.ts` |
| `bills.ts` | Move | `domains/finance/bills.ts` |
| `retirement-planning.ts` | Move | `domains/finance/retirement.ts` |
| `plaid.ts` | Move | `domains/finance/plaid.ts` |
| `domains/financial.ts` | Merge | `domains/finance/index.ts` |
| `domains/finance/` | Target | - |

### Phase 4: Proactive Tools Consolidation
**Timeline**: 2-3 hours  
**Risk**: Low

**Files to consolidate:**

| Current File | Action | Target |
|--------------|--------|--------|
| `proactive.ts` | Merge | `domains/proactive/index.ts` |
| `proactive-coaching.ts` | Move | `domains/proactive/coaching.ts` |
| `proactive-outreach.ts` | Move | `domains/proactive/outreach.ts` |

## Import Update Strategy

### Using Deprecation Warnings

Old files should emit deprecation warnings:

```typescript
// OLD: src/tools/habits.ts
console.warn(
  'DEPRECATED: Import from domains/habits instead of tools/habits.ts'
);
export * from './domains/habits/index.js';
```

### Automated Import Updates

```bash
# Find files importing from old paths
grep -r "from ['\"].*tools/habits" src/ --include="*.ts" -l

# Update imports (review before running)
find src -name "*.ts" -exec sed -i '' \
  "s/from '\.\.\/tools\/habits'/from '..\/tools\/domains\/habits'/g" {} \;
```

## Files to Keep at Root Level

These files are cross-cutting and should stay at `src/tools/`:

| File | Reason |
|------|--------|
| `index.ts` | Main barrel file |
| `builder.ts` | Tool building infrastructure |
| `lifecycle.ts` | Tool lifecycle management |
| `categories.ts` | Tool categorization |
| `dynamic-loader.ts` | Dynamic tool loading |
| `deprecation.ts` | Deprecation system |
| `ab-testing.ts` | A/B testing |
| `auto-optimizer.ts` | Tool optimization |
| `feedback-collector.ts` | Feedback collection |
| `pattern-analyzer.ts` | Pattern analysis |
| `rate-limiter.ts` | Rate limiting |
| `validation.ts` | Tool validation |
| `versioning.ts` | Version management |

## Success Metrics

After consolidation:
- [ ] All habit tools in `domains/habits/`
- [ ] All communication tools in `domains/communication/`
- [ ] All finance tools in `domains/finance/`
- [ ] All proactive tools in `domains/proactive/`
- [ ] No duplicate tool definitions
- [ ] Clear import paths
- [ ] All tests pass
- [ ] Backward compatibility maintained

## Backward Compatibility

Maintain backward compatibility via re-exports:

```typescript
// src/tools/habit-coaching.ts (keep for backward compat)
/**
 * @deprecated Import from './domains/habits' instead
 */
export * from './domains/habits/index.js';
export { default } from './domains/habits/index.js';
```

## Verification Checklist

For each consolidation:
- [ ] Create target directory structure
- [ ] Move/copy files with git mv
- [ ] Update internal imports
- [ ] Add deprecation re-exports to old files
- [ ] Update external imports
- [ ] Run typecheck
- [ ] Run tests
- [ ] Manual verification
- [ ] Remove deprecated files (after grace period)

## Related Documents

- [Services Reorg Plan](./SERVICES-REORG-PLAN.md)
- [Voice Agent Split Plan](./VOICE-AGENT-SPLIT-PLAN.md)
- [Code Organization PR Checklist](./CODE-ORGANIZATION-PR-CHECKLIST.md)

