# LiveKit Agents SDK Patch Documentation

## Summary

We patch `@livekit/agents-plugin-google` to enable proper Gemini function calling via `toolChoice` configuration.

## The Problem

The LiveKit Agents SDK for Google Gemini accepts a `toolChoice` parameter in the `RealtimeModel` constructor but:

1. **Bug 1**: `toolChoice` is not stored in `this._options`, so it's lost after construction
2. **Bug 2**: Even if stored, `toolConfig` is never sent to Gemini's API

This means Gemini's function calling modes (`AUTO`, `ANY`, `NONE`) cannot be configured, and the model may not reliably call functions.

## The Fix

We patch `dist/beta/realtime/realtime_api.js` in two places:

### Patch 1: Store toolChoice in constructor

```javascript
// In RealtimeModel constructor, add to this._options:
this._options = {
  // ... existing options ...
  apiVersion: options.apiVersion,
  toolChoice: options.toolChoice,  // PATCHED: Store toolChoice
  geminiTools: options.geminiTools
};
```

### Patch 2: Send toolConfig to Gemini

```javascript
// In buildGenerateContentRequest(), after contextWindowCompression handling:
if (opts.toolChoice !== void 0) {
  const toolChoice = opts.toolChoice;
  if (toolChoice === 'required') {
    config.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY'  // Gemini's "force function call" mode
      }
    };
  } else if (toolChoice === 'none') {
    config.toolConfig = {
      functionCallingConfig: {
        mode: 'NONE'
      }
    };
  } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
    config.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.function.name]
      }
    };
  } else if (toolChoice === 'auto') {
    config.toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO'
      }
    };
  }
}
```

## Gemini Function Calling Modes

| toolChoice value | Gemini mode | Behavior |
|------------------|-------------|----------|
| `'auto'` | `AUTO` | Model decides when to call functions (default) |
| `'required'` | `ANY` | Model MUST call a function |
| `'none'` | `NONE` | Model cannot call functions |
| `{ type: 'function', function: { name: 'X' } }` | `ANY` with `allowedFunctionNames` | Must call specific function |

Reference: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling

## How to Apply the Patch

### Option 1: pnpm patch (Recommended)

```bash
# Create a patch
pnpm patch @livekit/agents-plugin-google

# This opens a temp directory - make the changes there, then:
pnpm patch-commit <temp-directory>
```

### Option 2: Shell script (Current)

```bash
./scripts/apply-livekit-patch.sh
```

This script is run via `postinstall` in package.json.

### Option 3: Manual

Edit `node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js` directly.

## Upstream PR

**TODO**: Submit a PR to LiveKit to fix this properly.

GitHub: https://github.com/livekit/agents-js

### PR Description Draft

```markdown
## Summary

Add `toolChoice` support to the Google Gemini Realtime plugin.

## Problem

The `RealtimeModel` constructor accepts a `toolChoice` parameter but:
1. It's not stored in `this._options`
2. `toolConfig` is never sent to Gemini's API

This prevents users from configuring Gemini's function calling modes (AUTO, ANY, NONE).

## Solution

1. Store `toolChoice` in constructor options
2. Add `toolConfig` to `buildGenerateContentRequest()` that maps:
   - `'auto'` → `functionCallingConfig.mode: 'AUTO'`
   - `'required'` → `functionCallingConfig.mode: 'ANY'`
   - `'none'` → `functionCallingConfig.mode: 'NONE'`
   - `{ type: 'function', function: { name } }` → `mode: 'ANY'` with `allowedFunctionNames`

## References

- Gemini function calling docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
```

## Testing

To verify the patch is working:

```bash
# Check patch is applied
grep -c "PATCHED" node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js
# Should return: 2

# Check toolConfig is at correct level (not nested)
grep -B1 "PATCHED.*toolConfig" node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js
# Should show "}" on the line before (contextWindowCompression closing brace)
```

## Version Compatibility

- Tested with: `@livekit/agents-plugin-google@1.0.27`
- LiveKit Agents: `@livekit/agents@1.0.27`

## Files Modified

- `node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js` (runtime)
- `node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.cjs` (if using CommonJS)

