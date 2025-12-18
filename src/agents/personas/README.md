# Clean Agent Architecture (LiveKit 1.0)

This directory contains the **clean agent implementation** following LiveKit Agents 1.0 patterns.

## Architecture Overview

Each agent class:

1. **Builds its own tools** from direct domain imports (memory, habits, communication, etc.)
2. **Defines handoffs inline** as tools returning `llm.handoff()`
3. **Has personality-only system prompts** - no tool instructions

```
Agent Class
├── buildMemoryTools()      → 7 shared memory tools from domains/memory
├── buildDomainTools()      → persona-specific tools from domain modules
└── buildHandoffTools()     → inline llm.tool() → llm.handoff()
```

## Agent Capabilities

| Agent           | Memory  | Domain Tools         | Handoffs        |
| --------------- | ------- | -------------------- | --------------- |
| **FerniAgent**  | 7 tools | 12 music tools       | 5 (all team)    |
| **MayaAgent**   | 7 tools | 10 habit/coaching    | 2 (Ferni, Alex) |
| **AlexAgent**   | 7 tools | 12 communication     | 2 (Ferni, Maya) |
| **PeterAgent**  | 7 tools | 14 research/insights | 5 (all team)    |
| **JordanAgent** | 7 tools | 17 goals/events      | 5 (all team)    |
| **NayanAgent**  | 7 tools | 7 wisdom tools       | 5 (all team)    |

## Key Principles

### 1. Domain Imports

Tools are imported from domain modules (not legacy files):

```typescript
// Import from domains (preferred)
import { createResearchTools, createInsightsAnalysisTools } from '../../tools/domains/agent.js';
import { createMarketDataTools } from '../../tools/domains/financial.js';
import { createConversationTools } from '../../tools/domains/conversation/index.js';

function buildResearchTools(): ToolSet {
  const research = createResearchTools();
  return {
    analyzeStock: research.analyzeStock,
    findStockCategory: research.findStockCategory,
    // ...
  };
}
```

### 2. Handoffs Are Just Tools

Handoffs are tools that return `llm.handoff()`:

```typescript
handoffToMaya: llm.tool({
  description: 'Transfer to Maya for habits and budgeting',
  parameters: z.object({}),
  execute: async (_, { ctx }) => {
    const { MayaAgent } = await import('./maya-agent.js');
    return llm.handoff({
      agent: new MayaAgent(ctx.session.chatCtx),
      returns: 'Connecting you with Maya!',
    });
  },
}),
```

### 3. LLM Decides Tool Usage

No tool routing logic. The LLM reads tool descriptions and decides which to call:

- Good descriptions = reliable tool usage
- No trigger phrases in system prompts
- No routing tables to maintain

### 4. System Prompts Are Personality Only

The system prompt should contain:

- ✅ Character identity and backstory
- ✅ Voice/speech patterns
- ✅ Personality traits
- ✅ Team philosophy

NOT:

- ❌ Tool documentation
- ❌ Trigger phrases
- ❌ "USE createHabit" type instructions

## File Structure

```
src/agents/personas/
├── index.ts          # Exports all agents
├── ferni-agent.ts    # Main orchestrator (memory + music + all handoffs)
├── maya-agent.ts     # Habits coach (memory + habits + handoffs)
├── alex-agent.ts     # Communication (memory + communication + handoffs)
├── peter-agent.ts    # Research (memory + research/market + handoffs)
├── jordan-agent.ts   # Life planning (memory + goals/events + handoffs)
├── nayan-agent.ts    # Wisdom guide (memory + wisdom + handoffs)
└── README.md         # This file
```

## Usage

```typescript
import { FerniAgent } from './agents/personas';

// Create agent - tools built internally
const agent = new FerniAgent(systemPrompt, {
  chatCtx: existingContext, // For handoffs
  skipGreeting: false,
});

// Start session
const session = new voice.AgentSession({ vad, stt, tts, llm });
await session.start({ room: ctx.room, agent });
```

## Agent Lifecycle

```typescript
export class FerniAgent extends voice.Agent<SessionData> {
  constructor(systemPrompt, options) {
    // Build tools from domains
    const memoryTools = buildMemoryTools();
    const entertainmentTools = buildEntertainmentTools();
    const handoffTools = buildHandoffTools();

    super({
      instructions: systemPrompt,
      tools: { ...memoryTools, ...entertainmentTools, ...handoffTools },
    });
  }

  async onEnter() {
    // Generate greeting
    this.session.generateReply({ instructions: 'Greet warmly...' });
  }

  async onExit() {
    // Cleanup or log transition
  }
}
```

## References

- [LiveKit Tool Definition](https://docs.livekit.io/agents/build/tools)
- [LiveKit Agents & Handoffs](https://docs.livekit.io/agents/build/agents-handoffs)
- [LiveKit Node.js Migration Guide](https://docs.livekit.io/agents/v0-migration/node)
