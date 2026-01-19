# Nx Evaluation

This document evaluates whether to adopt Nx for the Ferni monorepo.

## Summary

**Recommendation: DEFER**

Path filters + composite actions provide 50-70% of Nx benefits with 10% effort. Re-evaluate when package count exceeds 15 or when affected-only testing becomes critical.

## What Nx Provides

### Affected Detection
Run only tests/builds for packages affected by changes:
```bash
nx affected:test --base=main
nx affected:build --base=main
```

### Distributed Caching
Cache build outputs across CI runs and developers:
- Hash-based cache keys
- Remote cache storage
- ~80% faster incremental builds

### Task Orchestration
Parallel and ordered task execution:
```bash
nx run-many --target=build --parallel=4
```

### Dependency Graph
Visual and queryable dependency graph:
```bash
nx graph
```

## Current State vs Nx

| Capability | Current | With Nx |
|------------|---------|---------|
| Affected detection | Path filters (coarse) | Package-level (fine) |
| Caching | pnpm cache only | Full output caching |
| Parallel builds | Manual | Automatic |
| Dependency graph | Implicit | Explicit |

## Cost-Benefit Analysis

### Benefits

1. **Faster CI** - Only test affected packages
   - Estimated savings: 30-50% of test time
   - Value: ~500 min/month

2. **Faster local dev** - Cached builds
   - Estimated savings: 50% of build time
   - Developer time saved: ~10 min/day

3. **Better visibility** - Dependency graph
   - Helps understand package relationships
   - Prevents accidental circular deps

### Costs

1. **Migration effort**
   - Add nx.json, project.json files
   - Update scripts to use nx
   - Estimated: 2-3 days

2. **Learning curve**
   - Team needs to learn Nx concepts
   - Different mental model for tasks

3. **Maintenance**
   - Keep Nx config in sync with packages
   - Update when Nx releases major versions

4. **Complexity**
   - Another tool in the chain
   - Can conflict with pnpm workspace features

## Decision Criteria

### Adopt Nx If:
- [ ] Package count > 15
- [ ] CI time becomes a major bottleneck (> 30 min)
- [ ] Many packages with complex dependencies
- [ ] Team has Nx experience

### Defer Nx If:
- [x] Current optimizations are sufficient
- [x] Package count < 10
- [x] Team bandwidth is limited
- [x] Path filters provide good enough filtering

## Alternative: Turborepo

Another option is Turborepo, which is simpler than Nx:

| Feature | Nx | Turborepo |
|---------|-----|-----------|
| Affected detection | ✅ | ✅ |
| Remote caching | ✅ | ✅ |
| Task orchestration | ✅ | ✅ |
| Plugins/generators | ✅ | ❌ |
| Complexity | Higher | Lower |

## Current Optimizations

These provide most benefits without Nx:

1. **Path filters** - 70% unnecessary runs eliminated
2. **Concurrency control** - No parallel waste
3. **Composite action** - Consistent, fast setup
4. **pnpm caching** - Dependencies cached

## Conclusion

With current optimizations, CI is projected to be under budget (~2,200 min/month vs 3,000 limit). Adding Nx would provide incremental improvements but at significant complexity cost.

**Next review:** When package count reaches 15 or CI time exceeds 20 minutes consistently.
