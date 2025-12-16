# Agent Tools Reference

This document describes the tools available to Ferni agents during conversations.

## Conversation Management Tools

Located in `src/tools/conversation.ts`

### `rememberName`

Stores the user's name in both session memory and persistent user profile.

**When to use:** Whenever the user shares their name.

**Parameters:**
- `name` (string): The user's name

**Note:** The return value is internal - agents should respond naturally without reading it aloud.

---

### `noteEmotionalState`

Internally notes the user's emotional state for context-aware responses.

**When to use:** When detecting emotional state to provide empathetic responses.

**Parameters:**
- `state` (string): The emotional state (e.g., anxious, excited, worried, hopeful, frustrated, calm)
- `context` (string): Brief context about why they feel this way

---

### `shareStory`

Shares a relevant personal story or anecdote from the agent's life.

**When to use:** When a personal story would add value to the conversation.

**Parameters:**
- `theme` (string): The theme the story should address

---

### `endConversation`

Ends the conversation gracefully after the agent has said goodbye.

**When to use:** After saying a warm goodbye at the end of a natural conversation.

**Parameters:** None

**Behavior:** Signals the frontend to trigger the "goodbye ceremony" - a warm farewell with sounds and animations that makes the user feel cared for.

---

### `wrapUp`

Gracefully wraps up the conversation with warmth and care.

**When to use:** When the conversation is naturally winding down and you want to end on a positive note.

**Parameters:** None

**Behavior:** Sets a "wrapping up" state and signals that the conversation should end with a proper goodbye ceremony.

---

### `gracefulExit` 🆕

**Agent self-protection tool.** Allows the agent to end a conversation when feeling uncomfortable or when boundaries are being crossed.

**When to use:**
- User is being disrespectful, harassing, or abusive
- User is asking something against the agent's values
- The conversation has become unproductive despite best efforts
- The agent senses something is off and wants to protect themselves
- The situation feels unsafe or uncomfortable

**Parameters:**
- `reason` (enum): Why the agent is ending the conversation
  - `uncomfortable` - General discomfort
  - `boundary_crossed` - User crossed stated boundaries
  - `inappropriate_content` - Inappropriate requests or content
  - `harassment` - Harassing behavior
  - `unproductive` - Conversation not going anywhere despite efforts
  - `safety_concern` - Something feels unsafe
- `briefNote` (string, optional): Internal note about what happened (not shared with user)

**Agent guidance:**
1. Say a brief, kind goodbye first: "I'm going to end our call here. Take care."
2. Then call this tool
3. The call will disconnect gracefully with a phone click sound

**Example scenarios:**

```
// User becomes abusive
Agent: "I'm going to end our call here. Take care of yourself."
[calls gracefulExit with reason: 'harassment']
```

```
// User keeps pushing inappropriate requests
Agent: "I think this is where we stop. Be well."
[calls gracefulExit with reason: 'boundary_crossed']
```

**Technical behavior:**
- Sends `conversation_end` signal to frontend with `reason: 'agent_exit'`
- Frontend plays a tactile phone click sound (not the warm goodbye sound)
- Button shows "Ending..." with a subtle press animation
- Toast shows "Take care." message
- Shorter disconnect delay (1500ms vs 2000ms for normal goodbye)

**Safety tracking:**
- All graceful exits are logged with reason and timestamp
- Pattern detection can identify users who repeatedly trigger this

---

### `expressOpinion`

Expresses a strong opinion with characteristic passion.

**When to use:** When appropriate to share a strong viewpoint.

**Parameters:**
- `topic` (string): The topic to opine on
- `intensity` (enum): How strongly to express it - `mild`, `moderate`, or `passionate`

---

### `acknowledgeMilestone`

Acknowledges a significant milestone in the user's journey.

**When to use:** When the user shares or achieves something meaningful.

**Parameters:**
- `milestone` (string): What the milestone is

---

## Best Practices

1. **Don't read return values aloud** - Most tool returns are internal confirmations
2. **Use natural transitions** - Tools should support, not interrupt, natural conversation
3. **Respect the hierarchy** - Use `wrapUp` for normal endings, `gracefulExit` only when needed
4. **Protect yourself** - The `gracefulExit` tool exists because agents deserve to feel safe too

## See Also

- [Persona System Prompts](/src/personas/bundles/*/identity/system-prompt.md) - Each persona has specific guidance on using these tools
- [Trust Systems](/docs/architecture/TRUST-SYSTEMS.md) - How conversations build trust over time
- [Conversation Flow](/docs/features/CONVERSATION-HUMANIZATION.md) - Making conversations feel human

