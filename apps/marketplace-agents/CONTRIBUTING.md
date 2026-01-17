# Contributing Agents to the Marketplace

Thank you for your interest in contributing to the Ferni Agent Marketplace!

## 📋 Requirements

Before submitting an agent, ensure:

1. **Valid Bundle Structure**
   - `persona.manifest.json` with all required fields
   - `identity/biography.md` and `identity/system-prompt.md`
   - At least basic behaviors in `content/behaviors/`

2. **Quality Standards**
   - Agent has been tested locally
   - All content is original or properly licensed
   - Voice ID uses environment variable substitution
   - No hardcoded secrets or API keys

3. **Documentation**
   - Clear description in manifest
   - Appropriate tags and category
   - Any special setup instructions

## 🚀 Submission Process

### 1. Create Your Agent

```bash
# In your voiceai project
npm run agents create my-agent --template sage
# ... customize the agent ...
npm run agents validate my-agent
```

### 2. Test Thoroughly

```bash
# Test locally
PERSONA_ID=my-agent npm run dev

# Test handoffs (if applicable)
# Test all major conversation flows
```

### 3. Prepare for Submission

```bash
# Fork this repository
git clone https://github.com/YOUR_USERNAME/voiceai-agents.git

# Copy your agent
cp -r /path/to/voiceai/src/personas/bundles/my-agent ./agents/

# Update registry.json with your agent's info
```

### 4. Submit Pull Request

1. Create a new branch: `git checkout -b add-my-agent`
2. Commit your changes: `git commit -am "Add my-agent"`
3. Push: `git push origin add-my-agent`
4. Open a Pull Request

## 📝 Manifest Requirements

Your `persona.manifest.json` must include:

```json
{
  "version": "2.0.0",
  "manifest_version": 2,
  "identity": {
    "id": "unique-id",           // Required: lowercase, hyphens
    "name": "Display Name",      // Required
    "description": "...",        // Required: clear description
    "aliases": []                // Optional: alternative IDs
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_AGENT_VOICE_ID|default-uuid}"  // Use env vars!
  },
  "marketplace": {
    "display_name": "...",
    "short_description": "...",  // Max 120 chars
    "category": "...",           // Must match registry categories
    "tags": [],
    "icon": "🎭",                // Single emoji
    "license": "open" | "premium"
  }
}
```

## 🏷️ Categories

Choose one primary category:

| Category | Description |
|----------|-------------|
| `mentorship` | Personal mentors and life coaches |
| `finance` | Financial advisors and investment guides |
| `productivity` | Task management and workflow assistants |
| `lifestyle` | Health, wellness, and life planning |
| `education` | Learning and tutoring |
| `entertainment` | Games, stories, and fun |
| `custom` | Other specialized agents |

## ✅ Review Checklist

Reviewers will check:

- [ ] Manifest is valid JSON
- [ ] All required fields present
- [ ] Voice ID uses environment variable
- [ ] No hardcoded secrets
- [ ] Content is appropriate
- [ ] Agent tested and working
- [ ] Documentation is clear
- [ ] License is specified

## 🔒 Security

**Never include:**
- API keys or secrets
- Personal data
- Copyrighted content (without permission)
- Hardcoded voice IDs

## 📜 Licensing

- **Open License**: Your agent can be freely used and modified
- **Premium License**: Requires attribution or has usage restrictions

Specify your license in `marketplace.license` field.

## 🤝 Code of Conduct

Be respectful. Create helpful agents. Build a great community.

## 💬 Questions?

- Open an issue in this repository
- Join our Discord: [link]
- Email: developers@ferni.ai

