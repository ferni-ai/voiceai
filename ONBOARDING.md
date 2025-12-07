# 👋 Developer Onboarding Guide

Welcome to Ferni AI! This guide will get you productive in your first week.

---

## Day 1: Environment Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd voiceai
npm install
```

### 2. Get API Keys

You'll need accounts at:

| Service | URL | What You Need |
|---------|-----|---------------|
| **LiveKit** | [cloud.livekit.io](https://cloud.livekit.io) | URL, API Key, Secret |
| **Google AI** | [aistudio.google.com](https://aistudio.google.com) | API Key |
| **Cartesia** | [play.cartesia.ai](https://play.cartesia.ai) | API Key |

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Minimum `.env`:
```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
GOOGLE_API_KEY=your_google_key
CARTESIA_API_KEY=your_cartesia_key
LOG_LEVEL=debug
```

### 4. Verify Setup

```bash
npm run quality  # Should pass all checks
npm run dev      # Should start 3 servers
```

Open http://localhost:3004 - you should see the Ferni UI.

### ✅ Day 1 Checklist
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] API keys configured
- [ ] `npm run quality` passes
- [ ] `npm run dev` works
- [ ] Can see UI at localhost:3004

---

## Day 2: Understanding the Codebase

### Required Reading (In Order)

1. **`CLAUDE.md`** (10 min) - Quick reference, critical rules
2. **`.cursorrules`** (30 min) - Complete coding standards
3. **`README.md`** (15 min) - Architecture overview

### Project Structure Tour

```bash
# Key directories to explore
ls -la src/agents/        # Voice agent core
ls -la src/personas/      # AI personalities
ls -la src/tools/         # LLM tools
ls -la src/api/           # REST endpoints
ls -la src/services/      # Business logic
ls -la src/intelligence/  # Context builders
```

### Meet the Team (Personas)

Try talking to each persona:

```bash
# Terminal 1 - Different personas
PERSONA_ID=ferni npm run dev        # Life coach
PERSONA_ID=maya-santos npm run dev  # Habits coach
PERSONA_ID=alex-chen npm run dev    # Communications
```

### ✅ Day 2 Checklist
- [ ] Read CLAUDE.md
- [ ] Skim .cursorrules (focus on "Never Do" section)
- [ ] Explored src/ directory structure
- [ ] Talked to at least 2 different personas
- [ ] Found where tools are defined
- [ ] Found where personas are defined

---

## Day 3: Core Concepts Deep Dive

### Context Builder System

The brain of intelligent conversations:

```bash
# Read the context builder guide
cat src/intelligence/context-builders/CLAUDE.md

# See builders in action
ls src/intelligence/context-builders/
```

Key builders to understand:
- `emotional.ts` - Emotion detection
- `memory.ts` - Cross-session memory
- `handoff.ts` - Agent transitions

### Tool System

How agents take actions:

```bash
# Read the tool guide
cat src/tools/CLAUDE.md

# Browse tool domains
ls src/tools/domains/
```

### Persona Bundles

How personalities are defined:

```bash
# Read persona guide
cat src/personas/CLAUDE.md

# Explore a persona bundle
ls src/personas/bundles/ferni/
cat src/personas/bundles/ferni/persona.manifest.json
```

### ✅ Day 3 Checklist
- [ ] Understand what context builders do
- [ ] Know how tools are structured
- [ ] Explored a persona bundle
- [ ] Can explain the voice pipeline at high level

---

## Day 4: Development Workflow

### Dev Panel

The secret weapon for testing:

1. Open http://localhost:3004/?dev
2. Press `Cmd/Ctrl + Shift + D` to toggle dev panel
3. Try:
   - Switching subscription tiers
   - Unlocking team members
   - Triggering celebrations

### Running Tests

```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npx vitest run src/tests/context-builders.test.ts  # Specific file
```

### Making Your First Change

Try a simple change:

1. Open `src/personas/bundles/ferni/content/behaviors/greetings.json`
2. Add a new greeting
3. Restart dev server
4. Verify the greeting appears

### Debugging Tips

```bash
# Verbose logging
LOG_LEVEL=debug npm run dev

# Type checking
npm run typecheck

# Lint issues
npm run lint:fix
```

### ✅ Day 4 Checklist
- [ ] Used the dev panel
- [ ] Ran the test suite
- [ ] Made a small change and verified it
- [ ] Know how to check logs
- [ ] Know how to run type checks

---

## Day 5: Advanced Topics

### Handoff System

How agents transition:

```bash
# Explore handoff code
ls src/tools/handoff/
cat docs/architecture/HANDOFF_ARCHITECTURE.md
```

### API Layer

REST endpoints for frontend:

```bash
ls src/api/
cat docs/guides/api-reference.md
```

### Memory System

How data persists:

```bash
ls src/memory/
cat docs/architecture/PERSISTENCE-ARCHITECTURE.md
```

### ✅ Day 5 Checklist
- [ ] Understand how handoffs work
- [ ] Know where API routes are defined
- [ ] Understand storage options (Firestore, Postgres, in-memory)
- [ ] Ready to pick up a task!

---

## Common Tasks Reference

### Add a New Tool

```bash
# 1. Create tool file
touch src/tools/domains/wellness/my-tool.ts

# 2. Follow pattern in src/tools/CLAUDE.md

# 3. Register tool

# 4. Add tests
touch src/tests/tools/my-tool.test.ts
```

### Add a New API Endpoint

```bash
# 1. Add to src/api/ (follow existing patterns)

# 2. Add route in ui-server.js

# 3. Add to docs/guides/api-reference.md
```

### Modify a Persona

```bash
# 1. Edit manifest
vi src/personas/bundles/{id}/persona.manifest.json

# 2. Or edit content files
vi src/personas/bundles/{id}/content/behaviors/greetings.json

# 3. Restart dev server
```

### Debug a Conversation Issue

1. Check browser console for errors
2. Check terminal logs (LOG_LEVEL=debug)
3. Use dev panel to test specific scenarios
4. Check context builder output in logs

---

## Key People/Resources

### Documentation
- `docs/` - All technical docs
- `docs/guides/` - How-to guides
- `docs/architecture/` - System design
- Inline `CLAUDE.md` files in src directories

### Monitoring
- `/cognitive-dashboard.html` - AI reasoning
- `/metrics-dashboard.html` - Persistence
- `/tools-dashboard.html` - Tool usage

---

## Getting Help

### Before Asking
1. Search the codebase: `grep -r "keyword" src/`
2. Check documentation: `find docs -name "*.md"`
3. Look at tests for usage examples
4. Check inline CLAUDE.md files

### Common Gotchas

| Problem | Solution |
|---------|----------|
| Import not found | Use `.js` extension in imports |
| Type error | Run `npm run typecheck` for details |
| Console.log used | Replace with `createLogger()` |
| Test failing | Check `npm test -- --verbose` |
| UI not updating | Hard refresh (Cmd+Shift+R) |

---

## Week 1 Goals

By end of week 1, you should be able to:

- [ ] Run the development environment
- [ ] Navigate the codebase confidently
- [ ] Understand the voice processing pipeline
- [ ] Make simple changes to tools/personas
- [ ] Run and write tests
- [ ] Use the dev panel effectively
- [ ] Pick up a small task from the backlog

---

## Next Steps

After onboarding:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for PR process
2. Check [BACKLOG.md](BACKLOG.md) for available tasks
3. Explore feature docs in `docs/features/`
4. Try building a small feature end-to-end

Welcome to the team! 🏔️

