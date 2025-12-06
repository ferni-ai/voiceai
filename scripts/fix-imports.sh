#!/bin/bash
# Fix missing AgentRole imports

cd /Users/sethford/Documents/voiceai

files=(
  "src/agents/voice-agent.ts"
  "src/cli/agent-manager.ts"
  "src/cli/persona-cli.ts"
  "src/config/environment.ts"
  "src/context/context-manager.ts"
  "src/conversation/active-listening.ts"
  "src/conversation/interruption-handler.ts"
  "src/intelligence/context-builders/energy-awareness.ts"
  "src/intelligence/context-builders/handoff.ts"
  "src/intelligence/context-builders/persona-memory.ts"
  "src/intelligence/context-builders/persona-mood.ts"
  "src/intelligence/context-builders/persona-playful.ts"
  "src/intelligence/context-builders/physical-presence.ts"
  "src/intelligence/context-builders/situational-awareness.ts"
  "src/intelligence/context-builders/spontaneous-vulnerability.ts"
  "src/intelligence/context-builders/team-dynamics.ts"
  "src/intelligence/human-behaviors.ts"
  "src/personas/PersonaRegistry.ts"
  "src/personas/agent-directory.ts"
  "src/personas/agent-registry.ts"
  "src/personas/collaborative-cognition.ts"
  "src/personas/greetings.ts"
  "src/personas/index.ts"
  "src/personas/persona-ids.ts"
  "src/personas/team/package-types.ts"
  "src/personas/team/team-config.ts"
  "src/personas/team/types.ts"
  "src/personas/voice-registry.ts"
  "src/services/daily-rituals.ts"
  "src/services/engagement-conversation-triggers.ts"
  "src/services/engagement-data-sender.ts"
  "src/services/maya-notification-service.ts"
  "src/services/outreach-intelligence.ts"
  "src/services/persona-memories.ts"
  "src/services/proactive-scheduler.ts"
  "src/services/push-notifications.ts"
  "src/services/reminder-scheduler.ts"
  "src/services/ritual-onboarding.ts"
  "src/services/session-manager.ts"
  "src/services/team-engagement.ts"
  "src/services/team-handler-registry/handlers/coordination.ts"
  "src/services/team-handler-registry/handlers/financial.ts"
  "src/services/team-handler-registry/handlers/index.ts"
  "src/services/team-handler-registry/handlers/life-planning.ts"
  "src/services/team-handler-registry/handlers/research.ts"
  "src/services/team-handler-registry/handlers/scheduling.ts"
  "src/services/team-handler-registry/index.ts"
  "src/services/team-handler-registry/loader.ts"
  "src/services/voice-adaptation.ts"
  "src/speech/response-naturalness.ts"
  "src/speech/voice-manager.ts"
  "src/ssml/core.ts"
  "src/tools/communication-tools.ts"
  "src/tools/domains/engagement/index.ts"
  "src/tools/expression.ts"
  "src/tools/factories/life-planning-tools.ts"
  "src/tools/persona-memory-tools.ts"
  "src/tools/proactive-outreach.ts"
  "src/tools/scheduling.ts"
  "src/tools/shared/persona-memory-factory.ts"
  "src/tools/team-integration.ts"
)

for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then
    # Check if file already has AgentRole import
    if ! grep -q "import.*AgentRole.*from" "$file"; then
      # Calculate relative path
      dir=$(dirname "$file" | sed 's|src/||')
      depth=$(echo "$dir" | tr '/' '\n' | grep -v '^$' | wc -l | tr -d ' ')
      
      prefix=""
      for ((i=0; i<depth; i++)); do
        prefix="../$prefix"
      done
      
      if [[ -z "$prefix" ]]; then
        import_path="./id-mapping.js"
      else
        import_path="${prefix}personas/id-mapping.js"
      fi
      
      # For files in src/personas/, adjust path
      if [[ "$file" == "src/personas/"* && "$file" != "src/personas/team/"* && "$file" != "src/personas/registry/"* ]]; then
        import_path="./id-mapping.js"
      elif [[ "$file" == "src/personas/team/"* ]]; then
        import_path="../id-mapping.js"
      elif [[ "$file" == "src/personas/registry/"* ]]; then
        import_path="../id-mapping.js"
      fi
      
      # Add import after last existing import
      if grep -q "^import " "$file"; then
        # Use temporary file
        awk -v import="import { AgentRole } from '$import_path';" '
          /^import / { last_import = NR; line = $0 }
          { lines[NR] = $0 }
          END {
            for (i = 1; i <= NR; i++) {
              print lines[i]
              if (i == last_import) print import
            }
          }
        ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        echo "Fixed: $file (path: $import_path)"
      fi
    else
      echo "Already has import: $file"
    fi
  else
    echo "File not found: $file"
  fi
done

