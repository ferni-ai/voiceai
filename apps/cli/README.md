# @ferni/cli

The unified command-line interface for the Ferni AI platform.

## Usage

```bash
# Via npm script (from project root)
pnpm ferni

# Via global link
npm link
ferni

# Direct execution
npx tsx apps/cli/src/index.ts
```

## Commands

### Development
- `ferni dev` - Development workflow management
- `ferni deploy` - Deploy services to cloud
- `ferni build` - Build applications
- `ferni test` - Run test suites
- `ferni setup` - Configure development environment
- `ferni quality` - Run quality checks
- `ferni pr` - Pull request workflow
- `ferni release` - Release management

### Operations
- `ferni status` - Check deployment status
- `ferni logs` - View Cloud Run logs
- `ferni doctor` - Run system diagnostics
- `ferni db` - Database operations
- `ferni env` - Environment management
- `ferni backup` - Backup management
- `ferni canary` - Canary deployment management

### AI & Agents
- `ferni agents` - Manage AI marketplace agents
- `ferni personas` - Persona management

## Quality Commands

```bash
ferni quality              # All basic checks
ferni quality quick        # Fast (typecheck + lint)
ferni quality deep         # All architecture checks
ferni quality complexity   # Cyclomatic/cognitive complexity
ferni quality dead-code    # Unused exports, orphan files
ferni quality imports      # Import complexity/coupling
ferni quality cohesion     # Module cohesion (god modules)
ferni quality naming       # Naming conventions
```

## Development

```bash
# Run CLI in development
pnpm --filter @ferni/cli dev

# Type check
pnpm --filter @ferni/cli typecheck

# Build (if needed)
pnpm --filter @ferni/cli build
```

## Architecture

```
apps/cli/
├── bin/
│   └── ferni.js       # Entry point for global installation
├── src/
│   └── index.ts       # Main CLI implementation
├── package.json
├── tsconfig.json
└── README.md
```

The CLI uses `tsx` to run TypeScript directly without pre-compilation for faster development iteration.
