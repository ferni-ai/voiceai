# Packages (Monorepo Workspaces)

**Shared packages** used across the Ferni monorepo.

## Structure

| Package | Purpose |
|---------|---------|
| `shared-types/` | TypeScript type definitions shared across services |
| `workers/` | Background worker implementations |

## shared-types

Shared TypeScript interfaces and types:

```bash
cd packages/shared-types
pnpm install
pnpm build
```

**Usage:**
```typescript
import { SomeType } from '@ferni/shared-types';
```

## workers

Background worker implementations for async tasks:

```bash
cd packages/workers
pnpm install
pnpm build
```

Contains worker code for:
- Background processing
- Async job handling

## Adding a New Package

1. Create directory under `packages/`
2. Add `package.json` with proper naming:
   ```json
   {
     "name": "@ferni/package-name",
     "version": "1.0.0"
   }
   ```
3. Add to root `pnpm-workspace.yaml` if not already wildcarded
4. Run `pnpm install` from root

## Workspace Commands

```bash
# Install all packages
pnpm install

# Build specific package
pnpm --filter @ferni/shared-types build

# Run script in all packages
pnpm -r build
```

## Related

- Root `pnpm-workspace.yaml` - Workspace configuration
- `apps/` - Application packages (web, ios-native, etc.)
