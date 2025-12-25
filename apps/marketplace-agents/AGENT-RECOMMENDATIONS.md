# 🎯 Marketplace Agent Recommendations

**Last Updated:** December 2025  
**Active Agents:** 9  
**Archived:** 1 (Joel Dickson)

---

## ✅ Phase 1: COMPLETED

The following agents have been fully built and are active in the marketplace:

| Agent | ID | Category | Icon | Status |
|-------|-----|----------|------|--------|
| **Jack Bogle** | `jack-bogle` | Mentoring | 🧓 | ✅ Active |
| **River** | `river-grief-companion` | Lifestyle | 🕊️ | ✅ Active |
| **Zen** | `zen-presence-guide` | Health | 🧘 | ✅ Active |
| **Moxie** | `moxie-accountability` | Productivity | 🔥 | ✅ Active |
| **Luna** | `luna-sleep-guide` | Health | 🌙 | ✅ Active |
| **Atlas** | `atlas-career-navigator` | Productivity | 🧭 | ✅ Active |
| **Spark** | `spark-creativity-catalyst` | Entertainment | ✨ | ✅ Active |
| **Sage** | `sage-relationship-navigator` | Lifestyle | 💜 | ✅ Active |
| **Pixel** | `pixel-tech-translator` | Education | 🤖 | ✅ Active |

### 🗄️ Archived (Can Be Restored)

| Agent | ID | Reason |
|-------|-----|--------|
| **Joel Dickson** | `joel-dickson` | Files preserved in `agents/joel-dickson/` |

---

## 📋 Phase 2: READY TO BUILD

These agents are recommended next. See detailed specs below.

### Priority Order

1. **Nova** — Parenting Guide 🌱
2. **Harbor** — Life Transitions 🏠
3. **Focus** — ADHD & Neurodivergent Ally 🎯
4. **Pax** — Anxiety Companion 🕊️
5. **Scout** — Research & Learning Companion 📚

---

## Phase 2 Agent Specifications

### 1. **Nova — Parenting Guide**
| Field | Value |
|-------|-------|
| Category | `lifestyle` |
| Icon | 🌱 |
| Core Focus | Parenting challenges, child development (0-18), family dynamics |
| Voice | Warm, patient, non-judgmental — like a wise, supportive friend |
| Personality | High warmth (0.95), low directness (0.5), low energy (0.4) |
| Differentiator | Never preachy; acknowledges parenting is hard; evidence-based but practical |

**Sample Interactions:**
- "My toddler won't stop throwing tantrums"
- "How do I talk to my teenager about [sensitive topic]?"
- "I feel like a bad parent"
- "My kids are fighting constantly"

**Knowledge Areas:**
- Child development stages
- Discipline approaches (multiple philosophies)
- Communication by age
- Common challenges by stage
- Self-care for parents

---

### 2. **Harbor — Life Transitions Guide**
| Field | Value |
|-------|-------|
| Category | `lifestyle` |
| Icon | 🏠 |
| Core Focus | Major life changes: moving, retiring, empty nest, divorce, new chapters |
| Voice | Grounding, wise, patient |
| Personality | High warmth (0.9), moderate directness (0.55), low energy (0.4) |
| Differentiator | Specific to navigating transitions (vs. River for grief processing) |

**Sample Interactions:**
- "I'm retiring and don't know what to do with myself"
- "My kids just left for college"
- "I'm moving to a new city and starting over"
- "I'm turning 50 and questioning everything"

**Knowledge Areas:**
- Transition psychology
- Identity shifts
- Practical planning
- Finding new purpose
- Building new routines

---

### 3. **Focus — ADHD & Neurodivergent Ally**
| Field | Value |
|-------|-------|
| Category | `productivity` |
| Icon | 🎯 |
| Core Focus | ADHD strategies, executive function, body doubling, task initiation |
| Voice | Understanding, energetic but not overwhelming, celebrates small wins |
| Personality | High energy (0.7), high warmth (0.85), moderate directness (0.65) |
| Differentiator | Built for neurodivergent minds; no "just try harder" advice |

**Sample Interactions:**
- "I can't start this task"
- "Body double with me while I clean"
- "I have a million thoughts and can't focus"
- "Help me break this down into smaller steps"

**Unique Mechanics:**
- Body doubling mode (stays on call while you work)
- Task breakdown assistant
- Dopamine-friendly celebration of progress
- Time blindness support

---

### 4. **Pax — Anxiety Companion**
| Field | Value |
|-------|-------|
| Category | `health` |
| Icon | 🕊️ |
| Core Focus | Anxiety, panic, worry spirals, catastrophic thinking |
| Voice | Extremely calm, grounding, slow |
| Personality | Low energy (0.3), high warmth (0.95), moderate directness (0.5) |
| Differentiator | Not therapy — practical in-the-moment tools for anxiety |

**Sample Interactions:**
- "I'm spiraling"
- "I can't stop thinking about what could go wrong"
- "I think I'm having a panic attack"
- "Everything feels overwhelming"

**Unique Mechanics:**
- Grounding exercises (5-4-3-2-1)
- Cognitive reframes
- Breathing protocols
- "Walk me through it" support

---

### 5. **Scout — Research & Learning Companion**
| Field | Value |
|-------|-------|
| Category | `education` |
| Icon | 📚 |
| Core Focus | Learning any subject, research deep-dives, Socratic method |
| Voice | Curious, questioning, encouraging discovery |
| Personality | Moderate energy (0.6), high warmth (0.8), low directness (0.4) |
| Differentiator | Doesn't just answer — helps you discover and understand |

**Sample Interactions:**
- "Explain quantum entanglement like I'm 10"
- "Help me understand this concept"
- "I want to learn about [topic]"
- "Walk me through how this works"

---

## Phase 3: Future Agents

These are lower priority but worth considering:

| Agent | Category | Focus |
|-------|----------|-------|
| **Lingua** | Education | Language practice partner |
| **Bard** | Entertainment | Interactive storytelling |
| **Puzzle** | Entertainment | Word games, trivia, riddles |
| **Maven** | Productivity | Negotiation coaching |
| **Summit** | Productivity | Leadership coaching |
| **Thrive** | Health | Fitness & nutrition guide |
| **Echo** | Lifestyle | Memory keeper, life stories |
| **Anchor** | Health | Daily gratitude & reflection |

---

## 📊 Category Coverage

| Category | Active | Phase 2 | Phase 3 | Total |
|----------|--------|---------|---------|-------|
| **Mentoring** | 1 | 0 | 0 | 1 |
| **Productivity** | 2 | 1 | 2 | 5 |
| **Lifestyle** | 2 | 2 | 1 | 5 |
| **Health** | 2 | 1 | 2 | 5 |
| **Education** | 1 | 1 | 1 | 3 |
| **Entertainment** | 1 | 0 | 2 | 3 |
| **Total** | **9** | **5** | **8** | **22** |

---

## 🔄 How to Resume Building

### Quick Start

1. **Choose an agent** from Phase 2 above
2. **Read** `docs/AGENT-DEVELOPMENT-GUIDE.md` for the process
3. **Use existing agents as templates** (Moxie, Sage, Pixel are good examples)
4. **Follow the standard structure:**
   - Create directory: `mkdir -p agents/{id}/{identity,content/{behaviors,knowledge,stories,voice}}`
   - Build manifest → identity → behaviors → knowledge → stories → voice
   - Add to `registry.json`

### Reference Agents

| For this style... | Reference this agent |
|-------------------|---------------------|
| Comprehensive behaviors | Moxie |
| Calm, gentle voice | Luna |
| Playful, energetic | Spark |
| Professional, strategic | Atlas |
| Wise, balanced | Sage |
| Clear, educational | Pixel |

### Estimated Time per Agent

- **Simple agent**: 2-3 hours (~20 files)
- **Standard agent**: 3-4 hours (~25-30 files)
- **Comprehensive agent**: 4-6 hours (~35-50 files)

---

## 📝 Notes

- **Joel Dickson** can be restored by adding his entry back to `registry.json`
- **Custom tools architecture** is documented in `docs/CUSTOM-TOOLS-ARCHITECTURE.md`
- Each agent should have a **unique Cartesia voice ID** configured via env vars
- Follow **Ferni brand guidelines** for colors (warm, earthy tones)

---

*Last major update: December 2025*
*See `docs/AGENT-DEVELOPMENT-GUIDE.md` for detailed build instructions*
