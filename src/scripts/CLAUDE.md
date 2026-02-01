# Scripts Module

One-off and scheduled scripts for content generation and maintenance.

## Purpose

Contains scripts that run outside the main application:
- Content pre-generation for cost savings
- Data migrations
- One-time maintenance tasks

## Architecture Layer

**Layer 100 (Application)** - Top-level entry points, not imported by other modules.

## Key Files

| File | Purpose |
|------|---------|
| `generate-landing-content.ts` | Pre-generate AI content for landing page |
| `backfill-memory-highlights.ts` | Backfill memory highlight scores |
| `query-threads.ts` | Query conversation threads for debugging |

## Landing Content Generation

Pre-generates AI content for the landing page and caches it in Firestore. Run daily or before deployments.

### Why Pre-Generate?

- **Cost savings**: ~$0.05 per batch vs $$$ for real-time generation
- **Latency**: Instant page loads with cached content
- **Reliability**: Landing page works even if AI is down

### Usage

```bash
# Generate all content
pnpm landing:generate

# Generate hero variations only
pnpm landing:generate:heroes

# Generate social proof only
pnpm landing:generate:social
```

### What Gets Generated

| Content Type | Description | TTL |
|--------------|-------------|-----|
| Hero Variations | Different headlines/taglines | 24h-7d |
| Social Proof | User testimonial-style messages | 24h-7d |

### Scheduling

Intended for Cloud Scheduler:
- **Frequency**: Daily at 4 AM
- **Duration**: ~1-2 minutes
- **Cost**: ~$0.05 per run

## Running Scripts

All scripts use `npx tsx` for TypeScript execution:

```bash
# Direct execution
npx tsx src/scripts/generate-landing-content.ts

# Via pnpm alias
pnpm landing:generate
```

## Rules for Adding New Scripts

1. **Add shebang** - `#!/usr/bin/env npx tsx`
2. **Use async main** - Wrap in `async function main()` with error handling
3. **Add to package.json** - Create pnpm script alias
4. **Log progress** - Use `console.log` for CLI output, `createLogger()` for structured logs
5. **Exit properly** - `process.exit(0)` on success, `process.exit(1)` on failure
6. **Document usage** - Add header comment explaining purpose and arguments

## Script Template

```typescript
#!/usr/bin/env npx tsx
/**
 * Script Name
 * Purpose and usage documentation
 *
 * Usage:
 *   pnpm script:name [--option]
 */

import 'dotenv/config';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ScriptName' });

async function main() {
  const args = process.argv.slice(2);

  console.log('Starting script...');

  try {
    // Script logic here

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    log.error({ error: String(error) }, 'Script failed');
    console.error('Failed:', error);
    process.exit(1);
  }
}

void main();
```

## Integration Points

- `src/services/landing-intelligence/` - Content generation/caching
- Cloud Scheduler - Production scheduling
- Firestore - Content storage
