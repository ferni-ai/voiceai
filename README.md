# LiveKit Voice AI Agent - Gemini Live + Cartesia

A LiveKit voice AI agent built with TypeScript that uses Google's Gemini Live API for speech recognition and Cartesia Sonic 3 for text-to-speech synthesis.

## Features

- **Real-time Speech Recognition**: Uses Gemini 2.5 Flash with native audio support
- **High-Quality Text-to-Speech**: Cartesia Sonic 3 for natural-sounding voice output
- **Separate STT/TTS Pipeline**: Gemini handles speech comprehension (TEXT modality only) while maintaining complete control over speech output via Cartesia
- **Voice Activity Detection**: Built-in VAD for accurate turn detection
- **Low Latency**: Optimized for real-time conversational AI
- **TypeScript**: Type-safe development with full IDE support

## Architecture

```
User Speech → Gemini Live (STT) → LLM Processing → Cartesia (TTS) → Audio Output
```

The agent uses Gemini's Realtime API in TEXT-only modality, which means:
- Gemini processes incoming audio and converts it to text
- The LLM generates text responses
- Cartesia Sonic 3 converts the text responses to speech

This architecture gives you complete control over the voice output while leveraging Gemini's powerful speech comprehension.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- LiveKit server (cloud or self-hosted)
- API keys for:
  - Google Cloud (for Gemini API)
  - Cartesia
  - LiveKit

## Installation

1. Clone or download this project

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your API keys:
```
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
GOOGLE_API_KEY=your_google_api_key
CARTESIA_API_KEY=your_cartesia_api_key
```

## Usage

### Available Agent Examples

This project includes three agent implementations:

1. **Basic Agent** (`src/agent.ts`) - Simple voice assistant
2. **Agent with Tools** (`src/agent-with-tools.ts`) - Includes function calling (weather, reminders, web search)
3. **Advanced Agent** (`src/advanced-agent.ts`) - Multi-agent system with handoffs and state management

### Running the Agents

Start the basic agent in development mode:
```bash
npm run dev
```

Or run a specific agent:
```bash
# Agent with tools
tsx src/agent-with-tools.ts dev

# Advanced multi-agent system
tsx src/advanced-agent.ts dev
```

Or build and run in production:
```bash
npm run build
npm start
```

The agent will:
1. Connect to your LiveKit server
2. Wait for participants to join rooms
3. Automatically join when a participant connects
4. Greet users and respond to their voice input

### Testing with LiveKit Playground

1. Go to [LiveKit Playground](https://playground.livekit.io)
2. Connect to your LiveKit server
3. Join a room
4. The agent will automatically join and greet you

### Customization

#### Change the Cartesia Voice

Edit `src/agent.ts` and modify the voice ID in the `cartesia.TTS()` initialization:

```typescript
tts: new cartesia.TTS({
  model: 'sonic-3',
  voice: 'your-preferred-voice-id',  // Change this
}),
```

Available Cartesia voices can be found in [Cartesia's documentation](https://cartesia.ai/docs).

#### Adjust Agent Instructions

Modify the `instructions` parameter in the `voice.Agent()` initialization:

```typescript
agent: new voice.Agent({
  instructions:
    'Your custom instructions here. ' +
    'Define personality, behavior, and response style.',
}),
```

#### Change Gemini Model Parameters

Adjust temperature and other settings:

```typescript
llm: new google.realtime.RealtimeModel({
  model: 'gemini-2.5-flash-preview-native-audio-09-2025',
  modalities: [google.types.Modality.TEXT],  // Keep TEXT for separate TTS
  temperature: 0.8,  // Adjust creativity (0.0-1.0)
}),
```

## Configuration Options

### Gemini Live Configuration

- `model`: The Gemini model to use (default: gemini-2.5-flash-preview-native-audio-09-2025)
- `modalities`: Must be set to `[google.types.Modality.TEXT]` for separate TTS
- `temperature`: Controls response randomness (0.0-1.0)

### Cartesia TTS Configuration

- `model`: The Cartesia model (default: sonic-3)
- `voice`: Voice ID for speech synthesis
- Additional options available in [Cartesia docs](https://cartesia.ai/docs)

### Voice Activity Detection

The agent uses LiveKit's built-in voice activity detection for detecting when users start and stop speaking.

## John Bogle Voice AI (Star Agent)

The `bogle-agent.ts` is the main intelligent agent - a deeply human, emotionally aware voice AI that embodies John "Jack" Bogle, founder of Vanguard and father of index investing.

### Intelligent Features

**🧠 Real-Time Emotion Detection**
- Analyzes every user message for emotional content
- Detects distress levels and triggers support mode automatically
- Adapts response tone based on emotional state

**🎯 Intent Classification**
- Multi-label intent detection (27 intent types)
- Identifies when users need advice vs. support vs. information
- Flags empathy requirements automatically

**📚 Persistent Memory**
- Remembers users across conversations
- Tracks goals, concerns, and relationship depth
- Builds genuine relationships over time

**🔊 Adaptive Speech (SSML)**
- Matches user's speaking pace (WPM tracking)
- Slows down for heavy topics
- Gates laughter appropriately
- Energy mirroring

**🛠️ 35 Intelligent Tools**
- Financial: stock quotes, compound growth, fee impact
- Conversation: storytelling, check-ins, wrap-ups
- Memory: remember facts, recall history
- Proactive: goal tracking, follow-ups
- Awareness: drift detection, topic suggestions

**📋 22 Intelligent Tasks**
- EmotionalSupportTask: Crisis-level support
- CheckInTask: Adaptive emotional check-ins
- DeepDiveTask: Topic exploration
- StorytellingTask: Relevant Jack stories
- GoalSettingTask: Financial goal planning
- And 17 more...

### Running the Bogle Agent

```bash
# Development
npm run dev -- src/bogle-agent.ts

# Production
npm run build
node dist/bogle-agent.js
```

## Examples Overview

### 1. Basic Agent (`src/agent.ts`)
Simple voice assistant that demonstrates the core Gemini Live + Cartesia integration.

**Features:**
- Speech-to-text with Gemini Live
- Text-to-speech with Cartesia Sonic 3
- Basic conversation handling
- Proper logging and error handling

**Use cases:** Simple voice interfaces, voice-enabled apps, basic assistants

### 2. Agent with Tools (`src/agent-with-tools.ts`)
Enhanced agent with function calling capabilities.

**Features:**
- All basic agent features
- Weather checking
- Reminder setting
- Web search
- Up to 5 sequential tool calls

**Use cases:** Task-oriented assistants, information retrieval, productivity tools

### 3. Advanced Multi-Agent (`src/advanced-agent.ts`)
Sophisticated system with multiple specialized agents and state management.

**Features:**
- Agent handoffs (Greeting → Conversation → Goodbye)
- Shared user data across agents
- Custom lifecycle hooks (`onEnter`)
- Agent transition tracking
- Graceful conversation endings

**Use cases:** Complex workflows, customer service, guided experiences

## Project Structure

```
voiceai/
├── src/
│   ├── bogle-agent.ts         # Main John Bogle voice AI agent
│   ├── agent.ts               # Basic agent implementation
│   ├── agent-with-tools.ts    # Agent with function tools
│   ├── advanced-agent.ts      # Multi-agent system
│   ├── ssml-tagger.ts         # Rule-based SSML tagging
│   │
│   ├── intelligence/          # Conversational intelligence
│   │   ├── emotion-detector.ts    # Real-time emotion detection
│   │   ├── intent-classifier.ts   # Multi-label intent classification
│   │   ├── topic-tracker.ts       # Topic extraction & tracking
│   │   ├── conversation-state.ts  # Phase state machine
│   │   └── index.ts               # Combined analysis
│   │
│   ├── memory/                # Persistent memory system
│   │   ├── embeddings.ts          # Embedding providers (Google/OpenAI)
│   │   ├── vector-store.ts        # Semantic search
│   │   ├── store.ts               # Abstract memory store
│   │   ├── in-memory-store.ts     # Development store
│   │   ├── history.ts             # Conversation history
│   │   ├── summarizer.ts          # Conversation summaries
│   │   └── index.ts               # Memory initialization
│   │
│   ├── context/               # Context management
│   │   └── context-manager.ts     # Prompt context builder
│   │
│   ├── speech/                # Adaptive speech
│   │   ├── speech-context.ts      # WPM tracking, energy detection
│   │   ├── adaptive-ssml.ts       # Context-aware SSML
│   │   └── index.ts
│   │
│   ├── services/              # Service orchestration
│   │   └── index.ts               # Bootstrap all services
│   │
│   ├── tools/                 # LLM tools (35 total)
│   │   ├── financial.ts           # Market data, calculations
│   │   ├── conversation.ts        # Story, check-in, wrap-up
│   │   ├── memory-tools.ts        # Remember, recall
│   │   ├── proactive.ts           # Goals, follow-ups
│   │   ├── awareness.ts           # Context awareness
│   │   └── index.ts
│   │
│   ├── tasks/                 # Intelligent task system
│   │   ├── intelligent-task.ts    # Emotion-aware task base
│   │   ├── support-tasks.ts       # Emotional support tasks
│   │   ├── relationship-tasks.ts  # Follow-ups, storytelling
│   │   ├── advice-tasks.ts        # Wisdom, decisions, goals
│   │   ├── bogle-onboarding.ts    # Onboarding flow
│   │   └── index.ts
│   │
│   ├── types/                 # Type definitions
│   │   └── user-profile.ts        # Comprehensive user profile
│   │
│   ├── persona/               # Jack Bogle character (16 dimensions)
│   │   ├── core-identity.ts       # Who Jack is
│   │   ├── memory-awareness.ts    # Memory usage instructions
│   │   └── ... (14 more modules)
│   │
│   └── tests/                 # Test suite
│       ├── memory.test.ts
│       ├── intelligence.test.ts
│       ├── speech.test.ts
│       └── continuity.test.ts
│
├── docs/                      # Documentation
│   ├── architecture.md           # System architecture
│   └── environment-variables.md  # Configuration guide
│
├── reference/
│   ├── agents-js/             # LiveKit agents-js (submodule)
│   └── cartesia-line/         # Cartesia Line SDK (submodule)
│
├── package.json               # Node.js dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

### Reference Implementations

This project includes two reference repositories as git submodules:

**`reference/agents-js/`** - Official LiveKit Agents for Node.js
- Official example implementations
- Plugin source code reference
- Best practices and patterns

**`reference/cartesia-line/`** - Cartesia Line SDK
- Event-driven agent architecture patterns
- Gemini integration examples
- Voice agent best practices

To initialize submodules after cloning:
```bash
git submodule update --init --recursive
```

## Troubleshooting

### Agent doesn't connect
- Check your `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`
- Ensure your LiveKit server is running and accessible

### No speech recognition
- Verify your `GOOGLE_API_KEY` is valid
- Check that you have enabled the Gemini API in Google Cloud Console
- Review the agent logs for error messages

### No voice output
- Verify your `CARTESIA_API_KEY` is correct
- Ensure you have sufficient Cartesia API credits
- Check the voice ID is valid

### Connection issues
- Make sure your firewall allows WebSocket connections
- Check that all required ports are open
- Verify network connectivity to LiveKit and API endpoints

## Testing

### Running the Test Suite

```bash
# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest

# Run specific test file
npx vitest run src/tests/memory.test.ts
```

### Test Categories

- **Memory Tests**: User profile CRUD, conversation history, semantic search
- **Intelligence Tests**: Emotion detection, intent classification, topic tracking, state machine
- **Speech Tests**: SSML tagging, WPM tracking, adaptive speech context
- **Continuity Tests**: Cross-session memory, returning user recognition, goal persistence

## Development

### Running in Development Mode

```bash
npm run dev
```

### Type Checking

```bash
npm run typecheck
```

### Production Deployment

For production deployment, consider:
- Using a process manager (pm2, systemd)
- Implementing proper error handling and monitoring
- Setting up health checks
- Configuring auto-restart on failure

Example with pm2:
```bash
npm run build
pm2 start dist/agent.js --name livekit-agent
pm2 save
pm2 startup
```

## Inspiration and Patterns

This project combines patterns from multiple sources:

- **LiveKit Agents JS** (reference/agents-js/) - Official TypeScript/Node.js patterns
- **Cartesia Line SDK** (reference/cartesia-line/) - Event-driven architecture and Gemini integration
- **LiveKit Documentation** - Separate TTS configuration with realtime models

Key patterns implemented:
- ✅ TEXT-only modality for Gemini Live (allows separate TTS control)
- ✅ Silero VAD prewarming for performance
- ✅ Function tools with zod schema validation
- ✅ Multi-agent architecture with handoffs
- ✅ Proper lifecycle hooks and event handling
- ✅ Comprehensive logging and error handling

## References

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [Gemini Realtime API with Separate TTS](https://docs.livekit.io/agents/models/realtime/plugins/gemini/#separate-tts)
- [Cartesia Documentation](https://cartesia.ai/docs)
- [Cartesia Line SDK](https://docs.cartesia.ai/line/)
- [LiveKit Documentation](https://docs.livekit.io/)
- [LiveKit Agents JS Repository](https://github.com/livekit/agents-js)

## License

This project is provided as-is for educational and development purposes.
