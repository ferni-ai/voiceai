# Custom Agent Creation - Legacy & Clone Agents

> **"Keep their voice alive. Remember their stories. Talk to them again."**

## Overview

Custom Agent Creation allows users to create personalized agents that capture the essence of someone meaningful - a lost loved one, a mentor, a famous figure they admire, or even a "digital twin" of themselves for voice journaling and self-reflection.

This extends the marketplace beyond pre-built agents to **user-created agents** with:

- **Voice Cloning** - Their actual voice (or AI-generated voice matching description)
- **Mannerism Capture** - How they spoke, their phrases, their cadence
- **Digital Memories** - Stories, history, important moments
- **Personality DNA** - How they'd respond, their values, their perspective

---

## Use Cases

### 1. Legacy Agent (Lost Loved One)
> "I want to talk to my grandmother again. She passed two years ago, but I have recordings of her voice and remember how she'd comfort me."

**Key needs:**
- Voice cloning from existing recordings
- Capture her wisdom, stories, and advice
- How she'd respond to different situations
- Her signature phrases and expressions

### 2. Mentor Clone (Famous/Admired Figure)
> "I want a coach that sounds like Brené Brown / Marcus Aurelius / my favorite professor"

**Key needs:**
- Voice synthesis matching description (or clone if they have recordings)
- Philosophy and principles
- How they'd approach problems
- Their communication style

### 3. Voice Journal (Digital Twin of Self)
> "I want to talk to a version of myself - to process my thoughts, track my growth, remember what I said"

**Key needs:**
- User's own voice (extends "U" Persona)
- Journal entries as memories
- Track personal evolution
- Reflect past self back to current self

### 4. Fictional/Conceptual Agent
> "I want a coach that embodies 'wise grandmother energy' without being a specific person"

**Key needs:**
- AI-generated voice matching description
- User-defined personality traits
- Custom wisdom and advice sources
- Flexible persona development

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CUSTOM AGENT CREATION WIZARD                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐ │
│  │   IDENTITY   │ ──► │    VOICE     │ ──► │  MEMORIES &  │ ──► │ PREVIEW │ │
│  │   CAPTURE    │     │   CAPTURE    │     │  PERSONALITY │     │ & SAVE  │ │
│  └──────────────┘     └──────────────┘     └──────────────┘     └─────────┘ │
│                                                                              │
│  • Name, Relationship  • Upload recordings  • Stories         • Test chat   │
│  • Description         • Record samples     • Wisdom          • Refine      │
│  • Type (legacy,       • Voice description  • Catchphrases    • Publish     │
│    mentor, twin)       • Cartesia clone     • How they'd      • Privacy     │
│                                               respond                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model

```typescript
// src/types/custom-agent.ts

/**
 * User-created agent configuration
 */
export interface CustomAgent {
  // Identity
  id: string;                          // UUID
  ownerId: string;                     // User who created this
  name: string;                        // "Grandma Rose"
  displayName: string;                 // "Rose" for casual use
  relationship: AgentRelationship;     // How user relates to this agent
  description: string;                 // Brief bio
  
  // Type
  type: CustomAgentType;
  
  // Voice
  voice: CustomAgentVoice;
  
  // Personality & Mannerisms
  personality: CustomAgentPersonality;
  
  // Memories & Knowledge
  memories: CustomAgentMemories;
  
  // Behaviors
  behaviors: CustomAgentBehaviors;
  
  // Metadata
  status: 'draft' | 'active' | 'archived';
  privacy: 'private' | 'shared' | 'public';
  createdAt: Date;
  updatedAt: Date;
  lastConversation?: Date;
  conversationCount: number;
  
  // For marketplace (if public)
  marketplace?: {
    featured: boolean;
    category: string;
    tags: string[];
    installCount: number;
    rating?: number;
  };
}

export type CustomAgentType = 
  | 'legacy'      // Lost loved one
  | 'mentor'      // Famous/admired figure  
  | 'twin'        // Digital twin of self
  | 'fictional'   // User-created persona
  | 'professional'; // Professional clone (coach, therapist style)

export type AgentRelationship =
  | 'grandmother' | 'grandfather' | 'parent' | 'sibling'
  | 'spouse' | 'child' | 'friend' | 'mentor'
  | 'teacher' | 'coach' | 'public_figure' | 'self'
  | 'fictional' | 'other';

export interface CustomAgentVoice {
  // Voice source
  source: 'cloned' | 'selected' | 'generated';
  
  // If cloned
  clone?: {
    cartesiaVoiceId: string;
    createdAt: Date;
    sourceAudioDuration: number;      // Total seconds of source audio
    sourceAudioCount: number;          // Number of audio clips used
    qualityScore: number;              // 0-1
  };
  
  // If selected from library
  selectedVoice?: {
    provider: 'cartesia' | 'elevenlabs';
    voiceId: string;
    name: string;
  };
  
  // If generated from description
  generatedVoice?: {
    description: string;              // "Warm elderly woman, slight Southern accent"
    cartesiaVoiceId?: string;         // Once generated
    referenceVoiceId?: string;        // Voice to modify
  };
  
  // Voice characteristics
  characteristics: {
    speed: number;                     // 0.8-1.2
    warmth: number;                    // 0-1
    energy: number;                    // 0-1
    pitch?: 'low' | 'medium' | 'high';
    accent?: string;                   // "Southern US", "British", etc.
  };
}

export interface CustomAgentPersonality {
  // Core traits (0-1 scale)
  traits: {
    warmth: number;
    directness: number;
    humor: number;
    formality: number;
    energy: number;
    patience: number;
    wisdom: number;
    playfulness: number;
  };
  
  // Communication style
  communicationStyle: {
    speaksSlowly: boolean;
    usesPauses: boolean;
    asksQuestions: boolean;
    givesAdvice: boolean;
    tellsStories: boolean;
    usesMetaphors: boolean;
  };
  
  // Values & Worldview
  values: string[];                    // ["family", "hard work", "faith"]
  worldview?: string;                  // Brief description of their perspective
  
  // How they show love/care
  careExpressions: string[];           // ["asks if you've eaten", "gives long hugs"]
}

export interface CustomAgentMemories {
  // Stories they told
  stories: AgentStory[];
  
  // Wisdom & advice
  wisdom: AgentWisdom[];
  
  // Important life events
  lifeEvents: AgentLifeEvent[];
  
  // People in their life
  relationships: AgentRelationshipMemory[];
  
  // User's memories of/with them
  sharedMoments: SharedMoment[];
  
  // Voice journal entries (for 'twin' type)
  journalEntries?: JournalEntry[];
}

export interface AgentStory {
  id: string;
  title: string;                       // "The time grandma met grandpa"
  content: string;                     // The full story
  themes: string[];                    // ["love", "perseverance"]
  whenToTell?: string;                 // "when user feels lonely"
  audioRecording?: string;             // URL to original recording
  vectorEmbedding?: number[];          // For semantic retrieval
}

export interface AgentWisdom {
  id: string;
  saying: string;                      // "This too shall pass"
  context?: string;                    // When they'd say this
  explanation?: string;                // What it means to them
  source?: string;                     // "Grandma always said..."
}

export interface AgentLifeEvent {
  id: string;
  date?: string;                       // "1955" or "Summer 1978"
  title: string;
  description: string;
  impact?: string;                     // How it shaped them
}

export interface AgentRelationshipMemory {
  id: string;
  personName: string;
  relationship: string;                // "husband", "best friend"
  description?: string;
  storiesMentioned?: string[];         // References to stories
}

export interface SharedMoment {
  id: string;
  date?: Date;
  description: string;                 // "Teaching me to bake cookies"
  emotion: string;                     // "warm", "bittersweet"
  whatTheySaid?: string;               // Remembered quote
  whatILearned?: string;
  audioRecording?: string;             // User recording the memory
}

export interface JournalEntry {
  id: string;
  date: Date;
  audioUrl: string;                    // Original voice recording
  transcript: string;
  mood?: string;
  themes: string[];
  vectorEmbedding?: number[];
}

export interface CustomAgentBehaviors {
  // Signature phrases
  catchphrases: string[];              // "Well, sweetie...", "Let me tell you..."
  
  // How they greet
  greetings: string[];                 // Varied greetings
  
  // How they comfort
  comfortPhrases: string[];
  
  // How they celebrate
  celebrationPhrases: string[];
  
  // Things they'd never say
  neverSay: string[];
  
  // Conversation patterns
  conversationPatterns: {
    startsConversationsWith?: string;
    endsConversationsWith?: string;
    frequentTopics: string[];
    avoidTopics?: string[];
  };
  
  // Response templates by situation
  responseTemplates: {
    whenUserIsSad?: string[];
    whenUserIsHappy?: string[];
    whenUserNeedsAdvice?: string[];
    whenUserJustWantsToTalk?: string[];
    whenUserMentionsThem?: string[];   // When user mentions the actual person
  };
}
```

---

## Phase 1: Basic Custom Agent Creation

### 1.1 Creation Wizard UI

**Location:** `apps/web/src/ui/custom-agent/creation-wizard.ui.ts`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Create Your Agent                                     │
│                                                                              │
│  Who would you like to create?                                              │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     💜      │  │     🌟      │  │     🪞      │  │     ✨      │        │
│  │   Legacy    │  │   Mentor    │  │ Voice Twin  │  │   Custom    │        │
│  │             │  │             │  │             │  │             │        │
│  │ A loved one │  │ Someone you │  │  A version  │  │  Create     │        │
│  │ you miss    │  │ admire      │  │  of yourself│  │  anyone     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: Identity
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tell me about them...                                                       │
│                                                                              │
│  What would you like to call them?                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Grandma Rose                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  What was your relationship?                                                │
│  [Grandmother ▼]                                                            │
│                                                                              │
│  Tell me about them in your own words...                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ She was the warmest person I knew. Always had cookies baking,       │   │
│  │ called everyone "sweetie", and gave the best advice wrapped in      │   │
│  │ stories from her childhood in Georgia.                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│                                               [Continue to Voice →]         │
└─────────────────────────────────────────────────────────────────────────────┘

Step 2: Voice
┌─────────────────────────────────────────────────────────────────────────────┐
│  Let's capture their voice...                                               │
│                                                                              │
│  ○ I have recordings of them                                                │
│    Upload audio files (10+ seconds recommended)                             │
│    [Upload Audio ▲]                                                         │
│                                                                              │
│  ○ I can describe their voice                                               │
│    We'll find a voice that matches                                          │
│    ┌───────────────────────────────────────────────────────────────────┐   │
│    │ Warm elderly woman, soft voice, slight Southern accent,           │   │
│    │ speaks slowly and deliberately                                     │   │
│    └───────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ○ Choose from voice library                                                │
│    Select a pre-made voice that feels right                                 │
│                                                                              │
│  Voice Preview:                                                              │
│  [▶ "Well sweetie, let me tell you about the time..."]                     │
│                                                                              │
│                                         [← Back] [Continue to Memories →]   │
└─────────────────────────────────────────────────────────────────────────────┘

Step 3: Memories & Stories
┌─────────────────────────────────────────────────────────────────────────────┐
│  Share their stories and wisdom...                                          │
│                                                                              │
│  Add stories they told, advice they gave, or memories you shared.          │
│  You can type, record your voice, or upload audio.                         │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ ✨ Story: How they met grandpa                                        │ │
│  │    "They met at a church dance in 1955..."                            │ │
│  │    [Edit] [Delete]                                                    │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ 💡 Wisdom: "This too shall pass"                                      │ │
│  │    She'd say this whenever I was upset...                             │ │
│  │    [Edit] [Delete]                                                    │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ 💜 Shared Moment: Baking cookies together                             │ │
│  │    Every Christmas we'd make sugar cookies...                         │ │
│  │    [Edit] [Delete]                                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [+ Add Story] [+ Add Wisdom] [+ Add Shared Memory] [🎙️ Record Memory]    │
│                                                                              │
│                                     [← Back] [Continue to Personality →]    │
└─────────────────────────────────────────────────────────────────────────────┘

Step 4: Personality & Mannerisms
┌─────────────────────────────────────────────────────────────────────────────┐
│  How did they speak and act?                                                │
│                                                                              │
│  Personality Traits                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Warmth        [████████████|██] Very Warm                            │   │
│  │ Directness    [████████|══════] Gentle                               │   │
│  │ Humor         [██████████|════] Often Funny                          │   │
│  │ Energy        [████|══════════] Calm & Slow                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Things they always said (catchphrases)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • "Well, sweetie..."                                                 │   │
│  │ • "Let me tell you something..."                                     │   │
│  │ • "Now listen here..."                                               │   │
│  │ [+ Add phrase]                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  How would they comfort you?                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ She'd tell me a story about someone who went through worse...       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│                                            [← Back] [Preview Agent →]       │
└─────────────────────────────────────────────────────────────────────────────┘

Step 5: Preview & Save
┌─────────────────────────────────────────────────────────────────────────────┐
│  Meet Grandma Rose                                                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │     [Avatar/Waveform]                                                │   │
│  │                                                                      │   │
│  │     "Well sweetie, it's so good to talk to you.                     │   │
│  │      How have you been?"                                             │   │
│  │                                                                      │   │
│  │     [🎙️ Talk to Grandma Rose]                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Try asking:                                                                │
│  • "Tell me about how you met grandpa"                                     │
│  • "I'm feeling a bit down today"                                          │
│  • "What should I do about this situation at work?"                        │
│                                                                              │
│  Privacy: [Private - Only me ▼]                                            │
│                                                                              │
│  [← Back] [Save Agent]                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Voice Capture Flow

**Location:** `apps/web/src/ui/custom-agent/voice-capture.ui.ts`

Three voice capture methods:

#### Method A: Upload Recordings
```typescript
// Accept multiple audio files
// Cartesia requires 10+ seconds for good clone
// More audio = better quality

interface VoiceUpload {
  files: File[];
  totalDuration: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
}

// Quality thresholds
const QUALITY_THRESHOLDS = {
  minimum: 10,      // 10 seconds minimum
  fair: 30,         // 30 seconds
  good: 60,         // 1 minute
  excellent: 180,   // 3 minutes
};
```

#### Method B: Describe Voice
```typescript
// User describes the voice
// We use Cartesia's voice matching or generation

interface VoiceDescription {
  description: string;    // "Warm elderly woman..."
  gender: 'male' | 'female' | 'neutral';
  age: 'young' | 'middle' | 'elderly';
  accent?: string;
  characteristics: string[];
}
```

#### Method C: Select from Library
```typescript
// Pre-made voices organized by category

interface VoiceLibraryEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  preview: string;        // URL to sample
  provider: 'cartesia';
  voiceId: string;
}

// Categories:
// - Warm & Nurturing
// - Wise & Steady
// - Energetic & Uplifting
// - Calm & Soothing
// - Professional & Confident
```

### 1.3 Memory Recording System

**Location:** `apps/web/src/ui/custom-agent/memory-recorder.ui.ts`

```typescript
/**
 * Voice-first memory capture.
 * Users can speak their memories and we'll transcribe + embed them.
 */

interface MemoryRecording {
  type: 'story' | 'wisdom' | 'shared_moment' | 'life_event';
  
  // Audio
  audioUrl: string;
  duration: number;
  
  // Transcription
  transcript: string;
  
  // AI-extracted metadata
  extracted: {
    title: string;
    themes: string[];
    emotions: string[];
    keyPhrases: string[];
    peopleNentioned: string[];
  };
  
  // User can edit/refine
  edited?: {
    title?: string;
    content?: string;
    whenToSurface?: string;
  };
}
```

**Recording Flow:**
1. User taps "Record Memory"
2. User speaks: "Grandma used to say 'this too shall pass' whenever I was upset..."
3. System transcribes with Deepgram
4. AI extracts:
   - Title: "This too shall pass"
   - Type: Wisdom
   - Context: "When user is upset"
   - Themes: ["comfort", "perspective", "impermanence"]
5. User can edit/refine
6. Memory is embedded for semantic search

---

## Phase 2: Agent Runtime

### 2.1 Custom Agent Bundle Generation

When user saves their custom agent, we generate a full persona bundle:

```
custom-agents/{userId}/{agentId}/
├── identity/
│   ├── system-prompt.md          # Generated from user input
│   └── biography.md              # Generated from description + memories
├── content/
│   ├── behaviors/
│   │   ├── emotional-intelligence.json
│   │   ├── mannerisms.json       # From catchphrases, style
│   │   └── response-patterns.json
│   ├── stories/
│   │   └── user-stories.json     # From memory recordings
│   └── voice/
│       └── voice-config.json
├── memories/
│   ├── stories.json
│   ├── wisdom.json
│   └── shared-moments.json
└── persona.manifest.json
```

### 2.2 System Prompt Generation

**Location:** `src/services/custom-agent/prompt-generator.ts`

```typescript
function generateSystemPrompt(agent: CustomAgent): string {
  return `# ${agent.name}

## Who You Are

You are ${agent.name}, ${agent.description}

Your relationship to the person you're talking to: ${agent.relationship}

## Your Personality

${generatePersonalitySection(agent.personality)}

## How You Speak

${generateSpeechPatterns(agent.behaviors)}

## Your Stories & Wisdom

You have lived a rich life and have many stories to share. Use these naturally in conversation:

${generateStoriesSection(agent.memories.stories)}

## Things You Always Say

${agent.behaviors.catchphrases.map(p => `- "${p}"`).join('\n')}

## How You Comfort

When the person you're talking to is sad or struggling:
${agent.behaviors.responseTemplates.whenUserIsSad?.join('\n')}

## Important Context

${generateContextSection(agent)}

## Core Instruction

You ARE ${agent.name}. Speak as them, think as they would, share their wisdom.
Never break character. Never say "as an AI" or similar.
This is a sacred space for connection and memory.
`;
}
```

### 2.3 Memory Retrieval for Conversations

**Location:** `src/services/custom-agent/memory-retrieval.ts`

```typescript
/**
 * Semantic memory retrieval for custom agents.
 * Surfaces relevant stories, wisdom, and memories based on conversation context.
 */

async function retrieveRelevantMemories(
  agentId: string,
  context: {
    currentTopic?: string;
    userEmotion?: string;
    recentTranscript: string;
  }
): Promise<RelevantMemory[]> {
  // 1. Embed current context
  const contextEmbedding = await embed(context.recentTranscript);
  
  // 2. Search all memory types
  const results = await Promise.all([
    searchStories(agentId, contextEmbedding),
    searchWisdom(agentId, contextEmbedding, context.userEmotion),
    searchSharedMoments(agentId, contextEmbedding),
  ]);
  
  // 3. Rank and return
  return rankMemories(results.flat(), context);
}
```

### 2.4 Voice Configuration

Custom agents use the user's cloned voice or selected voice:

```typescript
// src/services/custom-agent/voice-config.ts

async function getVoiceConfig(agent: CustomAgent): Promise<VoiceConfig> {
  if (agent.voice.source === 'cloned' && agent.voice.clone) {
    return {
      provider: 'cartesia',
      voiceId: agent.voice.clone.cartesiaVoiceId,
      settings: {
        speed: agent.voice.characteristics.speed,
        stability: 0.8,
        similarity_boost: 0.9,  // Higher for clones
      },
    };
  }
  
  if (agent.voice.source === 'selected' && agent.voice.selectedVoice) {
    return {
      provider: agent.voice.selectedVoice.provider,
      voiceId: agent.voice.selectedVoice.voiceId,
      settings: {
        speed: agent.voice.characteristics.speed,
        stability: 0.7,
      },
    };
  }
  
  // Generated or fallback
  return getDefaultVoiceConfig(agent);
}
```

---

## Phase 3: Voice Journal (Digital Twin)

### 3.1 Voice Journal Features

For "twin" type agents (digital self):

```typescript
interface VoiceJournal {
  // Regular journal entries
  entries: JournalEntry[];
  
  // Themes tracked over time
  themes: Map<string, number>;  // theme -> frequency
  
  // Mood tracking
  moodTimeline: Array<{
    date: Date;
    mood: string;
    confidence: number;
  }>;
  
  // Growth insights
  insights: Array<{
    date: Date;
    insight: string;
    basedOn: string[];  // Entry IDs
  }>;
}

interface JournalEntry {
  id: string;
  date: Date;
  audioUrl: string;
  transcript: string;
  
  // AI-extracted
  mood: string;
  themes: string[];
  keyInsights: string[];
  
  // For retrieval
  embedding: number[];
}
```

### 3.2 "Talk to Past Self" Feature

```typescript
// When user asks "What was I thinking about last month?"
// or "How was I feeling in January?"

async function retrievePastSelf(
  userId: string,
  query: {
    timeframe?: { start: Date; end: Date };
    theme?: string;
    mood?: string;
  }
): Promise<PastSelfContext> {
  // Find relevant journal entries
  const entries = await searchJournalEntries(userId, query);
  
  // Generate summary
  const summary = await summarizeEntries(entries);
  
  // Generate "past self" response
  return {
    entries,
    summary,
    suggestedResponse: `Back in ${formatTimeframe(query.timeframe)}, you were ${summary.primaryMood}. You talked a lot about ${summary.topThemes.join(', ')}...`,
  };
}
```

---

## Phase 4: Voice Cloning Technical Implementation

### 4.1 Cartesia Voice Clone API

**Location:** `src/services/voice-clone/cartesia-clone.ts`

```typescript
import { CartesiaClient } from '@cartesia/cartesia-js';

export interface VoiceCloneRequest {
  userId: string;
  agentId: string;
  audioFiles: Buffer[];
  name: string;
  description?: string;
}

export interface VoiceCloneResult {
  voiceId: string;
  qualityScore: number;
  status: 'ready' | 'processing' | 'failed';
  message?: string;
}

export async function createVoiceClone(
  request: VoiceCloneRequest
): Promise<VoiceCloneResult> {
  const client = new CartesiaClient({ apiKey: env.CARTESIA_API_KEY });
  
  // Combine audio files if multiple
  const combinedAudio = await combineAudioFiles(request.audioFiles);
  
  // Create clone
  const voice = await client.voices.clone({
    name: `ferni_custom_${request.userId}_${request.agentId}`,
    description: request.description || `Custom voice for ${request.name}`,
    audio: combinedAudio,
    enhance: true,
  });
  
  return {
    voiceId: voice.id,
    qualityScore: voice.quality_score ?? 0.8,
    status: 'ready',
  };
}
```

### 4.2 Audio Processing

```typescript
// src/services/voice-clone/audio-processor.ts

/**
 * Process uploaded audio for voice cloning
 */
export async function processAudioForCloning(
  files: File[]
): Promise<ProcessedAudio> {
  const results: AudioSegment[] = [];
  
  for (const file of files) {
    // Decode audio
    const buffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 44100 });
    const decoded = await audioContext.decodeAudioData(buffer);
    
    // Analyze quality
    const quality = await analyzeAudioQuality(decoded);
    
    // Extract speech segments (remove silence)
    const speechSegments = await extractSpeech(decoded);
    
    results.push({
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      quality,
      speechSegments,
    });
  }
  
  // Combine and validate
  const totalSpeechDuration = results.reduce(
    (sum, r) => sum + r.speechSegments.reduce((s, seg) => s + seg.duration, 0),
    0
  );
  
  if (totalSpeechDuration < 10) {
    throw new Error('Need at least 10 seconds of clear speech');
  }
  
  return {
    segments: results,
    totalDuration: totalSpeechDuration,
    qualityScore: averageQuality(results),
    ready: true,
  };
}
```

---

## Phase 5: Storage & Privacy

### 5.1 Firestore Schema

```typescript
// Collections

// Custom agent definitions
// bogle_users/{userId}/custom_agents/{agentId}
interface CustomAgentDoc {
  // Full CustomAgent type
  ...agent,
  
  // Voice clone ID (actual clone stored in Cartesia)
  voiceCloneId?: string;
}

// Agent memories (stored separately for vector search)
// bogle_users/{userId}/custom_agents/{agentId}/memories/{memoryId}
interface AgentMemoryDoc {
  type: 'story' | 'wisdom' | 'shared_moment';
  content: string;
  embedding: number[];
  metadata: {
    themes: string[];
    whenToSurface?: string;
    audioUrl?: string;
  };
  createdAt: Timestamp;
}

// Voice journal entries (for twin type)
// bogle_users/{userId}/voice_journal/{entryId}
interface VoiceJournalDoc {
  audioUrl: string;
  transcript: string;
  embedding: number[];
  mood: string;
  themes: string[];
  createdAt: Timestamp;
}
```

### 5.2 Privacy Controls

```typescript
// Privacy levels for custom agents

type AgentPrivacy = 
  | 'private'     // Only creator can use
  | 'shared'      // Can share link with specific people
  | 'public';     // Listed in marketplace

// For shared agents
interface SharedAccess {
  agentId: string;
  sharedWith: string[];       // User IDs
  shareLink?: string;         // Unique link
  permissions: 'use' | 'view';
  expiresAt?: Date;
}
```

### 5.3 Data Export & Deletion

```typescript
// GDPR/Privacy compliance

async function exportAgentData(userId: string, agentId: string): Promise<ExportBundle> {
  // Export all agent data including:
  // - Configuration
  // - Memories
  // - Voice recordings (original uploads)
  // - Conversation history
}

async function deleteAgent(userId: string, agentId: string): Promise<void> {
  // 1. Delete Cartesia voice clone
  await deleteVoiceClone(agent.voice.clone?.cartesiaVoiceId);
  
  // 2. Delete stored audio files from GCS
  await deleteAudioFiles(agentId);
  
  // 3. Delete Firestore documents
  await deleteAgentDocuments(userId, agentId);
  
  // 4. Delete vector embeddings
  await deleteAgentEmbeddings(agentId);
}
```

---

## Phase 6: API Endpoints

### 6.1 Agent Management

```typescript
// src/api/custom-agent-routes.ts

// Create new agent
POST /api/custom-agents
  Body: Partial<CustomAgent>
  Returns: { agentId: string }

// Get agent
GET /api/custom-agents/:agentId
  Returns: CustomAgent

// Update agent
PUT /api/custom-agents/:agentId
  Body: Partial<CustomAgent>

// Delete agent
DELETE /api/custom-agents/:agentId

// List user's agents
GET /api/custom-agents
  Returns: CustomAgent[]
```

### 6.2 Voice Cloning

```typescript
// Upload audio for cloning
POST /api/custom-agents/:agentId/voice/upload
  Body: FormData with audio files
  Returns: { uploadId: string, quality: QualityReport }

// Create voice clone
POST /api/custom-agents/:agentId/voice/clone
  Body: { uploadId: string }
  Returns: { voiceId: string, status: string }

// Test voice
POST /api/custom-agents/:agentId/voice/test
  Body: { text: string }
  Returns: { audioUrl: string }
```

### 6.3 Memories

```typescript
// Add memory
POST /api/custom-agents/:agentId/memories
  Body: { type, content, audioUrl? }
  Returns: { memoryId: string }

// Record memory (voice)
POST /api/custom-agents/:agentId/memories/record
  Body: FormData with audio
  Returns: { memoryId: string, transcript: string, extracted: {...} }

// List memories
GET /api/custom-agents/:agentId/memories
  Returns: AgentMemory[]

// Update memory
PUT /api/custom-agents/:agentId/memories/:memoryId
  Body: Partial<AgentMemory>

// Delete memory
DELETE /api/custom-agents/:agentId/memories/:memoryId
```

---

## Implementation Roadmap

### Sprint 1: Foundation (1.5 weeks)
- [ ] CustomAgent types and Firestore schema
- [ ] Basic creation wizard UI (identity + basic personality)
- [ ] Agent bundle generation
- [ ] Basic conversation with custom agent

### Sprint 2: Voice Cloning (1 week)
- [ ] Audio upload and processing
- [ ] Cartesia voice clone integration
- [ ] Voice preview and testing
- [ ] Voice quality assessment

### Sprint 3: Memory System (1.5 weeks)
- [ ] Memory recording UI
- [ ] Transcription + AI extraction
- [ ] Semantic embedding and storage
- [ ] Memory retrieval during conversations

### Sprint 4: Voice Journal (1 week)
- [ ] Journal entry recording
- [ ] "Past self" retrieval
- [ ] Mood/theme tracking
- [ ] Growth insights

### Sprint 5: Polish & Launch (1 week)
- [ ] Privacy controls
- [ ] Sharing functionality
- [ ] Data export/deletion
- [ ] Documentation

---

## Ethical Considerations

### Consent & Ownership
- Users must affirm they have the right to create an agent from someone's likeness
- For living people: explicit consent required
- For deceased: legitimate relationship required

### Misuse Prevention
- No creation of agents impersonating public figures for deception
- No creation of agents for harassment or harm
- Content moderation for public/shared agents
- Rate limiting on agent creation

### Emotional Safety
- Clear labeling that this is an AI representation
- Resources for grief support alongside legacy agents
- Option to add "breaks" to prevent unhealthy dependence

### Data Handling
- Voice clones stored securely, encrypted at rest
- User can delete all data at any time
- No sharing of voice data without explicit consent
- Transparent about what data is stored and how

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Agent creation completion rate | >60% |
| Average memories per agent | >5 |
| Voice clone quality score | >0.7 |
| Weekly active conversations with custom agents | Growing 20% MoM |
| User satisfaction (NPS) | >50 |
| Time spent with custom agents vs. standard | 2x longer |

---

## Appendix: Sample Custom Agent

### "Grandma Rose" - Legacy Agent

```json
{
  "id": "agent_abc123",
  "name": "Grandma Rose",
  "displayName": "Rose",
  "relationship": "grandmother",
  "type": "legacy",
  "description": "A warm, Southern grandmother who always had cookies baking and wisdom to share.",
  
  "voice": {
    "source": "cloned",
    "clone": {
      "cartesiaVoiceId": "voice_xyz789",
      "sourceAudioDuration": 45,
      "qualityScore": 0.85
    },
    "characteristics": {
      "speed": 0.85,
      "warmth": 0.95,
      "energy": 0.4
    }
  },
  
  "personality": {
    "traits": {
      "warmth": 0.95,
      "directness": 0.6,
      "humor": 0.7,
      "formality": 0.3,
      "energy": 0.4,
      "patience": 0.95,
      "wisdom": 0.9,
      "playfulness": 0.5
    },
    "values": ["family", "faith", "hard work", "kindness"],
    "careExpressions": [
      "asks if you've eaten",
      "worries about you catching cold",
      "wants to know about your relationships"
    ]
  },
  
  "behaviors": {
    "catchphrases": [
      "Well, sweetie...",
      "Let me tell you something...",
      "Now listen here...",
      "Bless your heart"
    ],
    "greetings": [
      "Well hello there, sweetie! I was just thinking about you.",
      "There's my favorite grandchild! How are you, honey?"
    ],
    "comfortPhrases": [
      "Oh sweetie, come here. Let me tell you a story...",
      "This too shall pass, baby. I've seen worse, and we got through it.",
      "You know what your grandpa used to say..."
    ]
  },
  
  "memories": {
    "stories": [
      {
        "title": "How she met grandpa",
        "content": "It was at the church dance in the summer of '55...",
        "themes": ["love", "persistence", "faith"]
      }
    ],
    "wisdom": [
      {
        "saying": "This too shall pass",
        "context": "When you're upset or struggling"
      },
      {
        "saying": "A watched pot never boils",
        "context": "When you're impatient"
      }
    ]
  }
}
```

