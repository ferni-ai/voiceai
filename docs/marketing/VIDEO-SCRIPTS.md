# Video & GIF Scripts

> **Scripts for demo videos, GIFs, and tutorials.**

---

## GIF Recordings

### GIF 1: The Three Commands (Hero GIF)

**Duration:** 15 seconds  
**Tool:** [asciinema](https://asciinema.org) + [svg-term-cli](https://github.com/marionebl/svg-term-cli)  
**Output:** `assets/gifs/three-commands.gif`

```bash
# Recording script (type slowly, with pauses)

$ ferni agent init career-coach
# [pause 1s, wizard appears]

✓ Created agent: career-coach

$ ferni agent preview career-coach
# [pause 1s]

🎙️ Preview: http://localhost:3333

$ ferni agent publish career-coach
# [pause 1s]

🚀 Live: https://career-coach.agents.ferni.ai
```

**Recording commands:**
```bash
# Install tools
npm install -g asciinema svg-term-cli

# Record
asciinema rec three-commands.cast

# Convert to GIF
svg-term --in three-commands.cast --out three-commands.svg
# Then convert SVG to GIF with any tool
```

---

### GIF 2: Interactive Wizard

**Duration:** 20 seconds  
**Shows:** The init wizard with selections  
**Output:** `assets/gifs/wizard.gif`

```bash
$ ferni agent init my-advisor

┌  🚀 Create AI Agent
│
◆  What type of agent?
│  ● 🎓 Personal Mentor
│
◆  What's your agent's name?
│  Alex Rivera
│
◆  One-line tagline:
│  Career Coach for Engineers
│
◆  Choose a voice:
│  ● 👨 Calm British Man
│
◆  Brand colors:
│  ● Ocean - #2980B9
│
✓  Created: src/personas/bundles/my-advisor/
```

---

### GIF 3: Hot Reload Preview

**Duration:** 12 seconds  
**Shows:** Edit file → see change instantly  
**Output:** `assets/gifs/hot-reload.gif`

```bash
# Split screen: terminal + editor

# Terminal shows:
$ ferni agent preview my-advisor

🎙️ Preview: http://localhost:3333
   Watching for changes...

# Editor shows: editing greetings.json
# Change: "Hey there!" → "Yo! What's up?"

# Terminal shows:
📝 Changed: greetings.json
✓ Reloaded
```

---

### GIF 4: Voice Conversation

**Duration:** 10 seconds  
**Shows:** Actual voice interaction  
**Output:** `assets/gifs/voice-demo.gif`

```
# Screen recording of preview page

[User speaks] "Hey, I need help with my resume"

[Agent responds] "Sure! Tell me about the role you're applying for."

[Waveform animation during speech]
```

---

### GIF 5: One-Click Deploy

**Duration:** 15 seconds  
**Shows:** Publish command with progress  
**Output:** `assets/gifs/deploy.gif`

```bash
$ ferni agent publish my-advisor

┌  🚀 Publish Agent
│
◇  Validating...
│  ✓ All checks passed
│
◇  Generating landing page...
│  ✓ 98KB
│
◇  Deploying to Cloud Run...
│  ████████████████████ 100%
│  ✓ Deployed
│
│  🌐 https://my-advisor.agents.ferni.ai
│
└  Live! 🎉
```

---

## Video Tutorial Script

### "Build a Voice AI Agent in 5 Minutes" (YouTube)

**Duration:** 4:30  
**Style:** Screen recording with voiceover  
**Thumbnail:** Terminal with "5 MIN" badge

---

#### Intro (0:00 - 0:20)

**Visual:** Ferni logo → Terminal  
**Script:**

> "What if you could build a production voice AI agent in five minutes, with three commands? No ML experience, no infrastructure headaches. Let me show you."

---

#### Setup (0:20 - 0:40)

**Visual:** Terminal - npm install  
**Script:**

> "First, install the Ferni CLI. Just npm install -g @ferni/cli."

```bash
npm install -g @ferni/cli
```

> "That's all the setup you need."

---

#### Create Agent (0:40 - 1:40)

**Visual:** Terminal - wizard flow  
**Script:**

> "Now let's create an agent. I'll make a career coach."

```bash
ferni agent init career-coach
```

> "The wizard asks a few questions. What type of agent? I'll pick Personal Mentor."
> 
> [Select mentor]
>
> "Give it a name... Alex Rivera. A tagline... Career Coach for Engineers."
>
> [Fill in fields]
>
> "Pick a voice from the library... I like this calm British voice."
>
> [Select voice]
>
> "Choose brand colors... let's go with Ocean blue."
>
> [Select colors]
>
> "And... done! Look at all these files it created."

---

#### Preview (1:40 - 2:40)

**Visual:** Preview server + browser  
**Script:**

> "Now let's test it locally."

```bash
ferni agent preview career-coach
```

> "This starts a local server with hot reload. Let me open the browser..."
>
> [Open localhost:3333]
>
> "Here's our agent! Let's talk to it."
>
> [Click "Start Conversation"]
>
> "Hey Alex, I'm thinking about switching from engineering to product management."
>
> [Agent responds naturally]
>
> "See how natural that feels? And watch this - I can edit the system prompt..."
>
> [Edit file, show hot reload]
>
> "Changes apply instantly. No restart needed."

---

#### Deploy (2:40 - 3:30)

**Visual:** Terminal - deploy output  
**Script:**

> "Happy with it? Let's ship it."

```bash
ferni agent publish career-coach
```

> "One command. It validates your agent, generates a landing page, builds a container, and deploys to Cloud Run."
>
> [Show progress]
>
> "And... we're live! Let me visit that URL."
>
> [Open production URL]
>
> "This is a real, production voice agent. With SSL, auto-scaling, the works. Share this link with anyone."

---

#### Customize (3:30 - 4:10)

**Visual:** File structure + code  
**Script:**

> "Want to customize? Here's what got created."
>
> [Show file tree]
>
> "The most important file is system-prompt.md. This is your agent's brain. Edit this to change its personality and expertise."
>
> [Show system prompt]
>
> "Add greetings, catchphrases, domain knowledge. It's all just Markdown and JSON."

---

#### Outro (4:10 - 4:30)

**Visual:** Landing page + CTA  
**Script:**

> "Three commands. Five minutes. A production voice AI agent."
>
> "Check out ferni.ai/developers to get started. Link in the description."
>
> "If you build something cool, tag me on Twitter. I'd love to see it."
>
> [End screen with subscribe button]

---

## Short-Form Content

### TikTok/Reels Script (60 seconds)

**Hook (0-3s):**
> "I built a voice AI in 60 seconds. Watch."

**Demo (3-50s):**
```bash
ferni agent init demo-agent
# [fast forward through wizard]
ferni agent preview demo-agent  
# [show voice working]
ferni agent publish demo-agent
# [show live URL]
```

**CTA (50-60s):**
> "Link in bio to try it yourself."

---

### Twitter Video Script (30 seconds)

**Visual:** Terminal only, fast  
**Script (text on screen):**

```
Three commands.
One voice AI agent.
Zero infrastructure.

[Show: ferni agent init]
[Show: ferni agent preview]  
[Show: ferni agent publish]

Try it: ferni.ai/developers
```

---

## Recording Tips

### Terminal Recording
- Use a clean terminal theme (Dracula, One Dark)
- Font size: 18-20px
- Window size: 80x24
- Type speed: deliberate but not slow
- Add pauses after commands complete

### Voice Recording
- Use a quiet room
- Speak conversationally, not scripted
- Edit out "ums" and pauses
- Target -16 LUFS for loudness

### Screen Recording Tools
- **macOS:** OBS, ScreenFlow
- **Terminal:** asciinema, terminalizer
- **Editing:** DaVinci Resolve (free), Final Cut

---

## Asset Checklist

- [ ] `three-commands.gif` (15s)
- [ ] `wizard.gif` (20s)
- [ ] `hot-reload.gif` (12s)
- [ ] `voice-demo.gif` (10s)
- [ ] `deploy.gif` (15s)
- [ ] `youtube-tutorial.mp4` (4:30)
- [ ] `tiktok-demo.mp4` (60s)
- [ ] `twitter-demo.mp4` (30s)
- [ ] `thumbnail.png` (1280x720)
- [ ] `og-image.png` (1200x630)

---

*Record these in order of impact: Hero GIF first, then YouTube tutorial.*
