# Customizing Your Agent

This guide walks you through making the agent your own.

## Step 1: Agent Identity

Edit `src/personas/bundles/my-agent/persona.manifest.json`:

```json
{
  "identity": {
    "id": "your-agent-id",         // URL-safe, lowercase
    "name": "Your Agent Name",      // Full display name
    "description": "What your agent does in one sentence"
  }
}
```

**Tips:**
- Keep the ID short and memorable
- The description appears on the landing page

---

## Step 2: Personality

Personality is defined with four sliders (0-1):

```json
{
  "personality": {
    "warmth": 0.8,       // Cold ← → Warm
    "directness": 0.6,   // Gentle ← → Blunt  
    "energy": 0.6,       // Calm ← → Energetic
    "humor_level": 0.4   // Serious ← → Playful
  }
}
```

**Example personalities:**

| Agent Type | Warmth | Directness | Energy | Humor |
|------------|--------|------------|--------|-------|
| Supportive Coach | 0.9 | 0.5 | 0.7 | 0.5 |
| Direct Mentor | 0.7 | 0.9 | 0.6 | 0.3 |
| Friendly Tutor | 0.85 | 0.5 | 0.65 | 0.6 |
| Calm Counselor | 0.9 | 0.4 | 0.3 | 0.2 |

---

## Step 3: Voice

Pick a voice that matches your agent's personality:

| Voice | ID | Best For |
|-------|----|----------|
| Warm Female | `c2ac25f9-ecc0-43f4-aaf5-e0f482e5f478` | Friendly, approachable |
| Calm British Man | `bf991597-aacf-4b1a-96fe-4c0cb7fecf96` | Professional, trustworthy |
| Energetic Coach | `41534e16-2966-4c6b-9670-111411def906` | Motivating, upbeat |
| Thoughtful Elder | `3ebcd114-d280-4eed-a238-b9323a6b8e52` | Wise, measured |

Update in manifest:
```json
{
  "voice": {
    "voice_id": "bf991597-aacf-4b1a-96fe-4c0cb7fecf96"
  }
}
```

---

## Step 4: System Prompt

This is your agent's brain. Edit `identity/system-prompt.md`:

```markdown
# Agent Name

> One-line tagline

You are [name], a [role] who helps people with [focus].

## Your Style
- How you communicate
- Your approach to conversations

## What You Do
- Specific capabilities
- Areas of expertise

## What You Don't Do
- Clear boundaries
- Things to avoid
```

**Tips:**
- Be specific about expertise
- Include example responses
- Define clear boundaries

---

## Step 5: Greetings

Edit `content/behaviors/greetings.json`:

```json
{
  "new_user": [
    "Hey! I'm [Name]. What brings you here today?",
    "Hi there! I'm [Name]. What's on your mind?"
  ],
  "returning_user": [
    "Welcome back! What's going on?",
    "Hey again! What can I help with?"
  ]
}
```

**Tips:**
- Keep greetings short (under 20 words)
- Match the agent's personality
- End with an open question

---

## Step 6: Brand Colors

Edit `brand/brand.json`:

```json
{
  "colors": {
    "primary": "#4a6741",      // Main brand color
    "secondary": "#3d5a35",    // Darker shade
    "accent": "#a3c293"        // Highlight color
  },
  "theme": "light"             // "light" or "dark"
}
```

---

## Testing Your Changes

The preview server has hot reload—changes appear instantly:

```bash
npm run preview
# Open http://localhost:3333
```

Edit any file, and the agent updates automatically. No restart needed.

---

## Next Steps

- **Add knowledge:** Put markdown files in `content/knowledge/`
- **Enable tools:** Add to `tools.optional` in manifest
- **Custom voice:** Use Cartesia's voice cloning

📚 [Full documentation](https://developers.ferni.ai)
