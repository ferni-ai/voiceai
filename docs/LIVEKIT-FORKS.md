# LiveKit Forks

> We maintain forks of LiveKit packages for full control over critical voice infrastructure.

## Why Forks?

1. **Stability** - Patches break when upstream updates
2. **Control** - Can make substantial changes without patch complexity
3. **Speed** - Don't have to wait for upstream PRs to merge
4. **Debugging** - Easier to add logging and trace issues

## Fork Repository

| Package | Fork |
|---------|------|
| LiveKit Agents Monorepo | [github.com/sethdford/agents-js](https://github.com/sethdford/agents-js) |

**Branch:** `ferni-v1.0.32` (or your ferni branch; content may be merged from upstream/main)
**Tag:** e.g. `@livekit/agents@1.0.32-ferni.1` or `@livekit/agents@1.0.39-ferni.1` after syncing

The fork includes all plugins. After merging upstream, `agents/package.json` version may be 1.0.39. We reference specific packages via `file:` protocol in package.json.

## Our Changes

### @livekit/agents (v1.0.32-ferni.1)

#### 1. Duration Calculation Fix
**File:** `src/telemetry/traces.ts`

The upstream code hardcodes duration to `0`. We calculate it properly:

```typescript
// BEFORE (upstream)
duration: BigInt(0), // TODO: Calculate actual duration from report

// AFTER (ferni fork)
const durationMs = report.duration ?? (report.timestamp - audioStartTime) ?? 0;
duration: BigInt(durationMs),
```

#### 2. Thread-Safe playTasks Access
**File:** `src/voice/background_audio.ts`

Race condition fix - upstream has a TODO comment about needing a lock:

```typescript
// BEFORE (upstream)
// TODO (Brian): add lock
task.addDoneCallback(() => {
  playHandle._markPlayoutDone();
  this.playTasks.splice(this.playTasks.indexOf(task), 1);
});

// AFTER (ferni fork)
private playTasksLock = new Mutex();

task.addDoneCallback(() => {
  playHandle._markPlayoutDone();
  this.playTasksLock.lock().then((unlock) => {
    const idx = this.playTasks.indexOf(task);
    if (idx !== -1) {
      this.playTasks.splice(idx, 1);
    }
    unlock();
  });
});
```

### @livekit/agents-plugin-google (v1.0.32-ferni.1)

#### 1. generateReply Timeout Increase
**File:** `src/beta/realtime/realtime_api.ts`

Increased from 5s to 15s for cold start scenarios:

```typescript
// BEFORE (upstream)
}, 5e3);

// AFTER (ferni fork)
}, 15e3);  // Increased for cold start / large prompt processing
```

#### 2. Enhanced Error Logging (Optional)
**File:** `src/beta/realtime/realtime_api.ts`

Add visibility into Gemini connection errors:

```typescript
onopen: () => {
  console.error(`[GEMINI-LIVE] ✅ Session OPENED`);
  sessionOpened.set();
},
onerror: (error) => {
  console.error(`[GEMINI-LIVE] ❌ Session error:`, error);
  this.#logger.error("Gemini Live session error:", error);
  // ...
},
```

## Current Setup

The fork is cloned at `../agents-js` (sibling to voiceai).

### package.json Configuration

```json
{
  "dependencies": {
    "@livekit/agents": "file:../agents-js/agents",
    "@livekit/agents-plugin-cartesia": "file:../agents-js/plugins/cartesia",
    "@livekit/agents-plugin-deepgram": "file:../agents-js/plugins/deepgram",
    "@livekit/agents-plugin-google": "file:../agents-js/plugins/google",
    "@livekit/agents-plugin-openai": "file:../agents-js/plugins/openai",
    "@livekit/agents-plugin-silero": "file:../agents-js/plugins/silero"
  },
  "pnpm": {
    "overrides": {
      "@livekit/agents": "file:../agents-js/agents",
      "@livekit/agents-plugin-google": "file:../agents-js/plugins/google"
    }
  }
}
```

### Making Changes

```bash
cd ../agents-js

# Make your changes to src files
# Edit agents/src/... or plugins/google/src/...

# Build
pnpm build

# Commit
git add -A
git commit -m "feat: Your change description"
git push origin ferni-v1.0.31

# Back to voiceai
cd ../voiceai
pnpm install  # Picks up changes
```

## Syncing with Upstream

When LiveKit releases updates:

```bash
cd ../agents-js

# Add upstream remote (once)
git remote add upstream https://github.com/livekit/agents-js.git

# Fetch upstream changes
git fetch upstream

# Merge upstream (e.g. main or a release tag)
git checkout ferni-v1.0.32   # or your ferni branch
git merge upstream/main      # or: git merge @livekit/agents@1.0.39

# Resolve conflicts (our changes vs their changes)
# Re-apply our customizations if needed (see scripts/livekit-fork-changes.md)

# Build and test
pnpm install
pnpm build
pnpm test

# Tag and push
git tag @livekit/agents@1.0.39-ferni.1
git push origin ferni-v1.0.32 --tags
```

Then in voiceai: `pnpm install` to pick up the updated file: dependency.

## Upstream Bug Fixes Worth Pulling

If your fork is behind upstream, pull in these fixes (from [livekit/agents-js releases](https://github.com/livekit/agents-js/releases)):

| Version | PR | Fix |
|--------|----|-----|
| **1.0.39** | [#997](https://github.com/livekit/agents-js/pull/997) | **VAD stream closed during handover** – Fixes race where `endInput()` was called on an already-closed VAD stream during agent handover → unrecoverable `stt_error`. Added `isStreamClosedError()`. **High value for handoffs.** |
| 1.0.39 | [#992](https://github.com/livekit/agents-js/pull/992) | Agent state transition fixes and interim transcript interruption support |
| 1.0.39 | [#1000](https://github.com/livekit/agents-js/pull/1000) | Preserve `thought_signature` across parallel tool calls (Gemini 3+ inference gateway) |
| 1.0.39 | [#993](https://github.com/livekit/agents-js/pull/993) | Update livekit inference model to match latest |
| 1.0.39 | (sharp) | Upgraded sharp 0.34.3 → 0.34.5 (libvips conflict, flaky agent, ObjC warnings on macOS) |

**Check your fork version:** `cat ../agents-js/agents/package.json | grep version`. If it shows `1.0.39` and you’ve merged `upstream/main` recently, you already have these. After any sync, re-apply Ferni customizations from `scripts/livekit-fork-changes.md` if they were overwritten.

## Upstream PR Strategy

These changes should eventually go upstream:

| Change | PR Status | Notes |
|--------|-----------|-------|
| Duration calculation fix | Should PR | Legitimate bug fix |
| Mutex lock for playTasks | Should PR | Brian left a TODO for this |
| generateReply timeout | Maybe PR | Could be configurable option |
| Enhanced logging | No PR | Ferni-specific debugging |

## Testing Fork Changes

Before deploying fork updates:

```bash
# In voiceai repo
pnpm install

# Run agent locally
pnpm dev

# Test:
# 1. Agent connects quickly
# 2. Greeting plays
# 3. User speech is transcribed
# 4. Agent responds
# 5. No timeout errors in logs
```

---

*Last updated: January 2026*
