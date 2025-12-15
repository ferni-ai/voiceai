# Clean Agent Architecture (LiveKit 1.0)

This directory contains the **new, clean agent implementation** following LiveKit Agents 1.0 patterns.

## Key Principles

### 1. Tools Defined Inline
No more tool registry, domains, or builders. Tools are defined directly in the Agent constructor:

```typescript
class FerniAgent extends voice.Agent {
  constructor() {
    super({
      instructions: systemPrompt,
      tools: {
        playMusic: llm.tool({
          description: 'Play music for the user',
          parameters: z.object({ query: z.string() }),
          execute: async ({ query }) => playMusicImpl(query),
        }),
      },
    });
  }
}
```

### 2. Handoffs Are Just Tools
No special handoff routing. Handoffs are tools that return `llm.handoff()`:

```typescript
handoffToMaya: llm.tool({
  description: 'Transfer to Maya for habits and budgeting',
  execute: async (_, { ctx }) => {
    return llm.handoff({
      agent: new MayaAgent(ctx.session.chatCtx),
      returns: 'Connecting you with Maya',
    });
  },
}),
```

### 3. LLM Decides Tool Usage
No tool routing logic. The LLM reads tool descriptions and decides which to call:
- Good descriptions = reliable tool usage
- No trigger phrases in system prompts needed
- No routing tables to maintain

### 4. System Prompts Are Personality Only
The system prompt should contain:
- ✅ Character identity and backstory
- ✅ Voice/speech patterns
- ✅ Personality traits
- ✅ Team philosophy (who they work with)

NOT:
- ❌ Tool documentation
- ❌ Trigger phrases
- ❌ Tool calling instructions
- ❌ "USE createHabit" type instructions

## File Structure

```
src/agents/personas/
├── index.ts          # Exports all agents
├── ferni-agent.ts    # Main orchestrator
├── maya-agent.ts     # Habits coach
├── alex-agent.ts     # Communication coach
├── peter-agent.ts    # The Quant
├── jordan-agent.ts   # Lifetime planner
├── nayan-agent.ts    # Wisdom guide
└── README.md         # This file
```

## Migration from Old Architecture

### Before (Complex)
```
src/tools/
├── registry/          # Tool registry
├── domains/           # 40+ domain folders
├── builder.ts         # Tool builder
├── handoff/           # Handoff factory
└── routing/           # Tool routing
```

### After (Simple)
```
src/agents/personas/
├── ferni-agent.ts     # Tools inline
├── maya-agent.ts      # Tools inline
└── ...
```

## Usage

```typescript
import { FerniAgent } from './agents/personas';

// Create agent
const agent = new FerniAgent(systemPrompt);

// Start session
const session = new voice.AgentSession({ vad, stt, tts, llm });
await session.start({ room: ctx.room, agent });
```

## References

- [LiveKit Tool Definition](https://docs.livekit.io/agents/build/tools)
- [LiveKit Agents & Handoffs](https://docs.livekit.io/agents/build/agents-handoffs)
- [LiveKit Node.js Migration Guide](https://docs.livekit.io/agents/v0-migration/node)
