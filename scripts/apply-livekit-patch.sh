#!/bin/bash
# Apply LiveKit Agents Plugin Google patch for toolChoice support
# This patch is required for Gemini function calling to work correctly
#
# IMPORTANT: The toolConfig code must be OUTSIDE the contextWindowCompression if-block!

PATCH_TARGET="node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js"

if [ ! -f "$PATCH_TARGET" ]; then
  echo "❌ Target file not found: $PATCH_TARGET"
  exit 1
fi

# Check if already correctly patched (toolConfig block should exist outside contextWindowCompression)
if grep -q "PATCHED.*toolConfig" "$PATCH_TARGET"; then
  # Verify it's correctly placed (not inside contextWindowCompression)
  # The closing brace should be on its own line before the PATCHED comment
  if grep -B1 "PATCHED.*toolConfig" "$PATCH_TARGET" | grep -q "^    }$"; then
    echo "✅ Patch already correctly applied"
    exit 0
  else
    echo "⚠️ Patch exists but may be incorrectly placed, re-applying..."
  fi
fi

echo "🔧 Applying LiveKit toolChoice patch..."

# Use Python for reliable patching
python3 << 'PYTHON_SCRIPT'
import sys

filepath = 'node_modules/@livekit/agents-plugin-google/dist/beta/realtime/realtime_api.js'

with open(filepath, 'r') as f:
    content = f.read()

# First, check if toolChoice is already in the constructor options storage
if 'toolChoice: options.toolChoice' not in content:
    # Add toolChoice to constructor
    content = content.replace(
        'apiVersion: options.apiVersion,\n      geminiTools: options.geminiTools',
        'apiVersion: options.apiVersion,\n      toolChoice: options.toolChoice,  // PATCHED: Store toolChoice\n      geminiTools: options.geminiTools'
    )
    print("Added toolChoice to constructor options")

# Check if toolConfig patch exists
if 'PATCHED.*toolConfig' not in content and 'config.toolConfig' not in content:
    # Find the correct insertion point - after contextWindowCompression closing brace, before return config
    target = '''    if (opts.contextWindowCompression !== void 0) {
      config.contextWindowCompression = opts.contextWindowCompression;
    }
    return config;'''
    
    replacement = '''    if (opts.contextWindowCompression !== void 0) {
      config.contextWindowCompression = opts.contextWindowCompression;
    }
    // PATCHED: Add toolConfig support for function calling mode
    if (opts.toolChoice !== void 0) {
      const toolChoice = opts.toolChoice;
      if (toolChoice === 'required') {
        config.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY'
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
    return config;'''
    
    if target in content:
        content = content.replace(target, replacement)
        print("Added toolConfig patch at correct location")
    else:
        print("WARNING: Could not find insertion point for toolConfig patch")
        sys.exit(1)

with open(filepath, 'w') as f:
    f.write(content)

print("✅ Patch applied successfully")
PYTHON_SCRIPT

if [ $? -eq 0 ]; then
  echo "✅ LiveKit patch complete"
else
  echo "❌ Patch failed"
  exit 1
fi
