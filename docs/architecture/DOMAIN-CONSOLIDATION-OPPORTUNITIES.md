# Domain Consolidation Opportunities

> **Created:** December 31, 2024  
> **Status:** Evaluation complete, recommendations documented

## Overview

The tool system has 85+ domain directories. This document evaluates consolidation opportunities while preserving semantic routing effectiveness.

## Already Consolidated ✅

These domains correctly export under a parent domain:

| Directory | Exports As | Status |
|-----------|-----------|--------|
| `coaching-support/` | `self-compassion` | ✅ Documented |
| `visual-memory/` | `memory` | ✅ Part of memory domain |
| `ambient-mode/` | `awareness` | ✅ Part of awareness domain |
| `human-transfer/` | `crisis` | ✅ Crisis transfer tools |
| `smart-home/` | `home` | ✅ Home domain |

## Consolidation Candidates 🔍

### High Priority - Strong Semantic Overlap

| Candidate | Merge Into | Rationale |
|-----------|-----------|-----------|
| `perfectionism/` | `self-compassion` | Perfectionism is a self-compassion topic |
| `digital-wellness/` | `wellness` | Both wellness domains |
| `timeless-perspective/` | `meaning` | Philosophical overlap with meaning/purpose |

### Medium Priority - Related but Distinct

| Candidate | Consider Merging Into | Notes |
|-----------|----------------------|-------|
| `breakup-recovery/` | `relationships` or `grief` | Emotional overlap, but distinct use case |
| `body-relationship/` | `wellness` or `self-compassion` | Could fit either |
| `anger/` | `self-compassion` or `presence` | Emotional regulation tools |
| `boundaries/` | `relationships` | Relationship skill domain |
| `intimacy/` | `relationships` | Relationship sub-domain |

### Low Priority - Keep Separate

| Domain | Reason to Keep Separate |
|--------|------------------------|
| `procrastination/` | Distinct enough from `productivity` |
| `neurodiversity/` | Specialized tools warrant own domain |
| `dating/` | Distinct from general relationships |
| `grief/` | Specialized emotional support |

## Recommended Approach

### 1. Do NOT merge aggressively

Granular domains enable:
- Better semantic routing (specific tool selection)
- Clearer manifest configuration per persona
- Easier maintenance and testing

### 2. Use domain aliasing instead

The registry supports domains exporting under different names. This is the preferred approach over physical merging.

### 3. Size guidelines

| Guideline | Threshold |
|-----------|-----------|
| Too small | < 3 tools (consider merging) |
| Optimal | 5-15 tools |
| Too large | > 30 tools (consider splitting) |

## Domain Statistics (Top 10 by Tool Count)

Based on export analysis:

1. `connection/` - High tool count (relationship connection tools)
2. `crisis/` - High tool count (safety-critical)
3. `family/` - High tool count (family support)
4. `self-compassion/` - High tool count (includes coaching-support)
5. `grief/` - Moderate (specialized)

## Action Items

- [x] Document existing consolidations
- [x] Evaluate merge candidates
- [ ] Add domain size metrics to `pnpm quality:check`
- [ ] Consider `perfectionism/` → `self-compassion` merge
- [ ] Consider `digital-wellness/` → `wellness` merge

---

*This document should be updated when domains are merged or split.*
