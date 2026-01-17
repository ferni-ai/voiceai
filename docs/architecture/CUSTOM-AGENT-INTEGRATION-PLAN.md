# Custom Agent Integration Plan

> Integration roadmap for adding user-created agents to the Ferni marketplace

## Current State

### Existing Infrastructure
- **Marketplace Registry**: `apps/marketplace-agents/registry.json` - Central JSON with all agents
- **Marketplace Service**: `apps/web/src/services/marketplace.service.ts` - Fetch, filter, install
- **Marketplace UI**: `apps/web/src/ui/marketplace.ui.ts` - Modal with Browse/Your Team tabs
- **Team UI**: `apps/web/src/ui/team.ui.ts` - Shows installed marketplace agents

### What We've Built
- **Types**: `src/types/custom-agent.ts` - Complete type definitions
- **Voice Clone Service**: `src/services/custom-agent/voice-clone.service.ts`
- **Memory Capture Service**: `src/services/custom-agent/memory-capture.service.ts`
- **Prompt Generator**: `src/services/custom-agent/prompt-generator.service.ts`
- **API Routes**: `src/api/custom-agent-routes.ts`
- **Architecture Doc**: `docs/architecture/CUSTOM-AGENT-CREATION.md`

---

## Integration Tasks

### Phase 1: Marketplace UI Integration (Frontend)

#### 1.1 Add "My Creations" Tab
**File:** `apps/web/src/ui/marketplace.ui.ts`

```typescript
// Add third tab: "My Creations"
<button class="marketplace-tab" data-tab="creations">
  My Creations
</button>

// Content for creations tab includes:
// - "Create New Agent" card (prominent CTA)
// - List of user's custom agents
// - Status indicators (draft, active, archived)
```

#### 1.2 Create Agent Wizard UI
**New Files:**
- `apps/web/src/ui/custom-agent/creation-wizard.ui.ts` - Main wizard
- `apps/web/src/ui/custom-agent/voice-capture.ui.ts` - Voice recording/upload
- `apps/web/src/ui/custom-agent/memory-recorder.ui.ts` - Memory voice capture
- `apps/web/src/ui/custom-agent/personality-editor.ui.ts` - Trait sliders
- `apps/web/src/ui/custom-agent/preview-chat.ui.ts` - Test conversation

#### 1.3 Custom Agent Card Component
**Extends existing agent card with:**
- Edit button (pencil icon)
- Status badge (Draft/Active)
- "Talk" button to start conversation
- Memory count indicator

### Phase 2: Service Integration (Frontend)

#### 2.1 Custom Agent Service
**New File:** `apps/web/src/services/custom-agent.service.ts`

```typescript
// Core operations
fetchCustomAgents(): Promise<CustomAgent[]>
getCustomAgent(agentId: string): Promise<CustomAgent>
createCustomAgent(data: CreateCustomAgentRequest): Promise<CustomAgent>
updateCustomAgent(agentId: string, data: Partial<CustomAgent>): Promise<CustomAgent>
deleteCustomAgent(agentId: string): Promise<void>
activateCustomAgent(agentId: string): Promise<void>

// Voice operations
uploadVoiceAudio(agentId: string, files: File[]): Promise<VoiceUploadResponse>
createVoiceClone(agentId: string, uploadId: string): Promise<CreateVoiceCloneResponse>
previewVoice(agentId: string, text: string): Promise<{ audioUrl: string }>

// Memory operations
addMemory(agentId: string, memory: RawMemoryInput): Promise<AddMemoryResponse>
recordMemory(agentId: string, audioFile: File, type: MemoryType): Promise<AddMemoryResponse>
listMemories(agentId: string): Promise<CustomAgentMemories>
deleteMemory(agentId: string, memoryId: string): Promise<void>
```

#### 2.2 Extend Marketplace Service
**Modify:** `apps/web/src/services/marketplace.service.ts`

```typescript
// Add custom agent methods
getCustomAgentsAsPersonaConfigs(): Promise<PersonaConfig[]>
isCustomAgent(agentId: string): boolean
getCustomAgentById(agentId: string): CustomAgent | null
```

### Phase 3: Backend Integration

#### 3.1 Register API Routes
**Modify:** `src/servers/api/index.ts` (UI server)

```typescript
import customAgentRoutes from '../../api/custom-agent-routes.js';

// Add routes
app.use('/api/custom-agents', customAgentRoutes);
```

#### 3.2 Firestore Persistence
**New File:** `src/services/custom-agent/firestore-persistence.ts`

```typescript
// Replace in-memory storage with Firestore
// Collection: bogle_users/{userId}/custom_agents/{agentId}
// Subcollection: bogle_users/{userId}/custom_agents/{agentId}/memories/{memoryId}
```

#### 3.3 GCS Audio Storage
**New File:** `src/services/custom-agent/audio-storage.ts`

```typescript
// Store voice recordings and clones in GCS
// Bucket: ferni-custom-agents
// Path: {userId}/{agentId}/voice/{filename}
// Path: {userId}/{agentId}/memories/{memoryId}.mp3
```

### Phase 4: Voice Agent Runtime Integration

#### 4.1 Custom Agent Loader
**New File:** `src/personas/custom-agent-loader.ts`

```typescript
// Load custom agent as if it were a persona bundle
export async function loadCustomAgent(userId: string, agentId: string): Promise<LoadedPersona> {
  const agent = await getCustomAgentFromFirestore(userId, agentId);
  const systemPrompt = generateSystemPrompt(agent);
  const manifest = generateManifest(agent);
  const voiceConfig = await getVoiceConfig(agent);
  
  return {
    id: agent.id,
    name: agent.name,
    systemPrompt,
    manifest,
    voiceConfig,
    memories: agent.memories,
  };
}
```

#### 4.2 Modify Agent Entry Point
**Modify:** `src/agents/voice-agent-entry.ts`

```typescript
// Add support for custom agents
if (isCustomAgentId(personaId)) {
  const customAgent = await loadCustomAgent(userId, personaId);
  // Use custom agent's system prompt, voice, etc.
}
```

#### 4.3 Memory Integration
**Modify:** Context builders to include custom agent memories

```typescript
// In context injection, check for custom agent memories
if (isCustomAgent) {
  const relevantMemories = await findRelevantMemories(
    agentId, 
    agent.memories, 
    currentContext
  );
  // Inject into system prompt as additional context
}
```

### Phase 5: Voice Journal (Twin Type)

#### 5.1 Journal UI
**New File:** `apps/web/src/ui/voice-journal/journal.ui.ts`

```typescript
// Voice journal for "twin" type agents
// - Record daily entries
// - Browse past entries by date/theme/mood
// - "Talk to past self" feature
// - Growth insights visualization
```

#### 5.2 Journal Backend
**New File:** `src/services/custom-agent/voice-journal.service.ts`

```typescript
// Journal-specific operations
recordJournalEntry(userId: string, audioFile: Buffer): Promise<JournalEntry>
getJournalEntries(userId: string, filters?: JournalFilters): Promise<JournalEntry[]>
generatePastSelfResponse(userId: string, query: string): Promise<PastSelfContext>
getGrowthInsights(userId: string): Promise<GrowthInsights[]>
```

---

## Implementation Order

### Sprint 1: UI Foundation (1 week)
1. [ ] Add "My Creations" tab to marketplace UI
2. [ ] Create wizard shell (step navigation)
3. [ ] Implement Identity step (name, relationship, type)
4. [ ] Create custom agent service (frontend)
5. [ ] Wire up API calls to backend

### Sprint 2: Voice Capture (1 week)
1. [ ] Build voice upload/recording UI
2. [ ] Integrate with voice clone service
3. [ ] Add voice preview player
4. [ ] Implement voice library selection

### Sprint 3: Memory System (1 week)
1. [ ] Build memory recording UI
2. [ ] Implement transcription preview
3. [ ] Add AI metadata extraction display
4. [ ] Create memory list/edit/delete UI

### Sprint 4: Personality & Preview (1 week)
1. [ ] Build personality trait sliders
2. [ ] Create catchphrase/behavior editor
3. [ ] Implement preview chat component
4. [ ] Add system prompt preview (dev mode)

### Sprint 5: Runtime Integration (1 week)
1. [ ] Implement custom agent loader
2. [ ] Modify voice agent entry
3. [ ] Add memory context injection
4. [ ] Test full conversation flow

### Sprint 6: Voice Journal (1 week)
1. [ ] Build journal recording UI
2. [ ] Implement "past self" retrieval
3. [ ] Add mood/theme tracking
4. [ ] Create growth insights view

### Sprint 7: Polish & Launch (1 week)
1. [ ] Firestore persistence
2. [ ] GCS audio storage
3. [ ] Privacy controls UI
4. [ ] Error handling & edge cases
5. [ ] Documentation

---

## Files to Create/Modify

### New Files (Frontend)
```
apps/web/src/ui/custom-agent/
├── creation-wizard.ui.ts
├── voice-capture.ui.ts
├── memory-recorder.ui.ts
├── personality-editor.ui.ts
├── preview-chat.ui.ts
└── index.ts

apps/web/src/services/
└── custom-agent.service.ts

apps/web/src/ui/voice-journal/
├── journal.ui.ts
├── entry-recorder.ui.ts
├── past-self.ui.ts
└── index.ts
```

### New Files (Backend)
```
src/services/custom-agent/
├── firestore-persistence.ts
├── audio-storage.ts
└── voice-journal.service.ts

src/personas/
└── custom-agent-loader.ts
```

### Files to Modify
```
apps/web/src/ui/marketplace.ui.ts      # Add "My Creations" tab
apps/web/src/services/marketplace.service.ts  # Custom agent support
src/servers/api/index.ts               # Register routes
src/agents/voice-agent-entry.ts        # Load custom agents
```

---

## API Endpoints Summary

### Custom Agents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/custom-agents` | Create agent |
| GET | `/api/custom-agents` | List user's agents |
| GET | `/api/custom-agents/:id` | Get agent |
| PUT | `/api/custom-agents/:id` | Update agent |
| DELETE | `/api/custom-agents/:id` | Delete agent |
| POST | `/api/custom-agents/:id/activate` | Activate agent |

### Voice
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/custom-agents/:id/voice/upload` | Upload audio |
| POST | `/api/custom-agents/:id/voice/clone` | Create clone |
| POST | `/api/custom-agents/:id/voice/preview` | Preview TTS |
| GET | `/api/custom-agents/voices/library` | Get voice library |

### Memories
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/custom-agents/:id/memories` | Add memory |
| POST | `/api/custom-agents/:id/memories/record` | Record memory |
| GET | `/api/custom-agents/:id/memories` | List memories |
| DELETE | `/api/custom-agents/:id/memories/:memoryId` | Delete memory |

### Generation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/custom-agents/:id/prompt` | Get system prompt |
| GET | `/api/custom-agents/:id/manifest` | Get manifest |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Wizard completion rate | >60% |
| Voice clone success rate | >90% |
| Memories per agent (avg) | >5 |
| Time to first conversation | <10 min |
| User satisfaction (custom agents) | NPS >50 |
| Weekly conversations with custom agents | Growing 20% MoM |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Voice clone quality issues | Preview before saving, re-record option |
| Long wizard abandonment | Save draft at each step, resume later |
| Memory extraction errors | Manual edit option, fallback to basic extraction |
| Voice API rate limits | Queue system, progress indicators |
| Emotional sensitivity (legacy agents) | Gentle onboarding, grief resources |

