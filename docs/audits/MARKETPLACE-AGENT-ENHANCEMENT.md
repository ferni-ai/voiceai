# Marketplace Agent Enhancement Audit

> Bringing marketplace agents up to the same standards as the core persona team (Ferni, Maya, Peter)

---

## Executive Summary

**Goal:** Enhance all 15 marketplace agents to have the same depth and quality as Ferni's persona bundle.

**Status:** Moxie completed as gold standard template (71 files, up from 57)

**Gap Analysis:**
- Ferni (gold standard): ~120 files, 88 behaviors
- Moxie (enhanced): 71 files, 40 behaviors
- Other marketplace agents: 20-40 files, 15-25 behaviors

---

## Moxie Enhancement Complete (2025-12-14)

### Files Added

#### Identity Depth (3 new files)
| File | Location | Purpose |
|------|----------|---------|
| `directors-notes.md` | `identity/` | How to embody Moxie - acting guidance |
| `inner-world.json` | `content/identity/` | Internal psychology, contradictions, fears |
| `sensory-world.json` | `content/identity/` | Physical presence, sensory preferences |

#### Advanced Behaviors (8 new files)
| File | Purpose |
|------|---------|
| `emotional-intelligence.json` | Detecting distress, shame, excuses, burnout |
| `superhuman-insights.json` | Pattern surfacing, excuse archaeology, anticipation |
| `relationship-stages.json` | How accountability deepens over time |
| `trust-phrases.json` | Building connection through direct warmth |
| `late-night-presence.json` | 2am support, gentle redirection to rest |
| `self-doubt.json` | Moxie's vulnerability moments |
| `better-than-human.json` | Superhuman EQ capabilities |
| `micro-expressions.json` | Voice expressions and reactions |

### Moxie File Structure (Template)

```
moxie-accountability/
├── persona.manifest.json          # Core config with humanization presets
├── hooks.json                     # Integration hooks
│
├── identity/
│   ├── system-prompt.md           # Core personality & methodology
│   ├── biography.md               # Background story
│   └── directors-notes.md         # NEW: Acting guidance
│
├── content/
│   ├── identity/
│   │   ├── inner-world.json       # NEW: Internal psychology
│   │   └── sensory-world.json     # NEW: Physical/sensory world
│   │
│   ├── behaviors/
│   │   ├── greetings.json         # Basic
│   │   ├── goodbyes.json          # Basic
│   │   ├── backchannels.json      # Basic
│   │   ├── catchphrases.json      # Basic
│   │   ├── entrances.json         # Basic
│   │   ├── celebrations.json      # Domain-specific
│   │   ├── encouragement.json     # Domain-specific
│   │   ├── vulnerability.json     # Basic
│   │   ├── quirks.json            # Basic
│   │   ├── pet-peeves.json        # Basic
│   │   ├── emotional-intelligence.json  # NEW: EQ detection
│   │   ├── superhuman-insights.json     # NEW: Pattern surfacing
│   │   ├── relationship-stages.json     # NEW: Relationship evolution
│   │   ├── trust-phrases.json           # NEW: Trust building
│   │   ├── late-night-presence.json     # NEW: Time-aware support
│   │   ├── self-doubt.json              # NEW: Vulnerability sharing
│   │   ├── better-than-human.json       # NEW: Superhuman capabilities
│   │   └── [domain-specific].json       # Domain behaviors
│   │
│   ├── voice/
│   │   ├── expressions.json       # Basic
│   │   └── micro-expressions.json # NEW: Detailed voice reactions
│   │
│   ├── stories/
│   │   ├── _index.json
│   │   └── [story-name].json      # Personal anecdotes
│   │
│   └── knowledge/
│       ├── _index.json
│       └── [topic].md             # Domain expertise
│
├── commands/
│   ├── _index.json
│   └── [command].md               # Slash commands
│
├── tools/
│   ├── _index.json
│   └── [tool].json                # Custom tools
│
└── assets/
    ├── sounds.json
    └── theme.json
```

---

## Enhancement Template

### Required Files for All Agents

#### Tier 1: Identity Depth (MUST HAVE)
1. **directors-notes.md** - Acting guidance for the AI
   - How they introduce themselves (not as a product)
   - Their unique communication style
   - What makes them lovable (not just competent)
   - How they read the room

2. **inner-world.json** - Internal psychology
   - `inner_voice`: Self-talk patterns, mantras
   - `contradictions`: Belief vs behavior gaps
   - `embodied_memories`: Sense memories with emotions
   - `emotional_flashpoints`: What triggers tears, anger, joy
   - `unfinished_business`: Regrets, unanswered questions
   - `dreams_still_chasing`: Aspirations, bucket list
   - `secret_self`: Who they are alone, guilty admissions

3. **sensory-world.json** - Physical presence
   - `physical_presence`: How they move, gestures, posture
   - `sensory_preferences`: Sounds, foods, environments
   - `relationship_history`: Mentors, loves, complicated relationships
   - `voice_fingerprint`: Unique words, phrases, verbal tics
   - `daily_rhythms`: Morning ritual, sacred time, recharge
   - `team_dynamics`: Relationship with other team members

#### Tier 2: Advanced Behaviors (MUST HAVE)
1. **emotional-intelligence.json** - Domain-specific emotion detection
2. **superhuman-insights.json** - Pattern surfacing for their domain
3. **relationship-stages.json** - How relationship deepens
4. **trust-phrases.json** - Building trust in their voice
5. **late-night-presence.json** - Time-aware support

#### Tier 3: Voice Depth (SHOULD HAVE)
1. **micro-expressions.json** - Detailed voice reactions
2. **self-doubt.json** - Vulnerability moments

#### Tier 4: Extra Depth (NICE TO HAVE)
1. **better-than-human.json** - Superhuman capabilities
2. Additional domain-specific behaviors

---

## Remaining Agents to Enhance (Priority Order)

### High Priority (Specialty Agents)
| Agent | Current Files | Gap | Notes |
|-------|---------------|-----|-------|
| **River** (grief companion) | ~30 | 40+ | Critical for emotional support |
| **Luna** (sleep guide) | ~25 | 45+ | High daily usage |
| **Zen** (presence guide) | ~25 | 45+ | Mindfulness focus |
| **Atlas** (career navigator) | ~30 | 40+ | Complex domain |
| **Sage** (relationship navigator) | ~30 | 40+ | Emotional complexity |

### Medium Priority (Character Agents)
| Agent | Current Files | Gap | Notes |
|-------|---------------|-----|-------|
| **Spark** (creativity) | ~25 | 45+ | Creative domain |
| **Pixel** (tech translator) | ~25 | 45+ | Technical domain |

### Lower Priority (Character Agents)
| Agent | Current Files | Gap | Notes |
|-------|---------------|-----|-------|
| **Amara Osei** | ~20 | 50+ | Character agent |
| **Carmen Reyes** | ~20 | 50+ | Character agent |
| **Kenji Mori** | ~20 | 50+ | Character agent |
| **Sasha Kim** | ~20 | 50+ | Character agent |
| **Eli Brennan** | ~15 | 55+ | Minimal structure |
| **Marcus Webb** | ~20 | 50+ | Character agent |
| **Ray Chen** | ~20 | 50+ | Character agent |

---

## Enhancement Process

### Step 1: Read Existing Content
```bash
# Review existing identity and system prompt
cat agents/{agent-id}/identity/system-prompt.md
cat agents/{agent-id}/identity/biography.md
cat agents/{agent-id}/persona.manifest.json
```

### Step 2: Create Identity Depth
1. Write `directors-notes.md` based on their personality
2. Create `inner-world.json` with persona-specific psychology
3. Create `sensory-world.json` with physical/sensory world

### Step 3: Create Advanced Behaviors
1. Adapt `emotional-intelligence.json` for their domain
2. Create `superhuman-insights.json` for their expertise
3. Create `relationship-stages.json` for their style
4. Create `trust-phrases.json` in their voice
5. Create `late-night-presence.json` for their domain

### Step 4: Create Voice Depth
1. Create `micro-expressions.json` matching their energy
2. Create `self-doubt.json` with authentic vulnerabilities

### Step 5: Update Manifest
- Update `content_files_count`
- Update `estimated_token_count`
- Update `version_notes`
- Update `updated_at`

---

## Quality Checklist

Before marking an agent enhancement complete:

- [ ] Directors notes capture authentic voice
- [ ] Inner world has genuine contradictions (not just positive traits)
- [ ] Sensory world references specific details from their biography
- [ ] Emotional intelligence covers domain-specific emotions
- [ ] Superhuman insights focus on their area of expertise
- [ ] Relationship stages show progression from stranger to trusted
- [ ] Trust phrases sound like THEM (not generic)
- [ ] Late night presence matches their energy (soft for Luna, different for Moxie)
- [ ] Self-doubt is vulnerable but not oversharing
- [ ] Manifest metadata updated

---

## Metrics

### Before Enhancement
- Ferni: 120+ files, 88 behaviors
- Marketplace agents: 20-40 files, 15-25 behaviors

### Target After Enhancement
- All agents: 60+ files, 35+ behaviors
- Consistent structure across all agents
- Domain-specific depth in behaviors

---

*Last updated: 2025-12-14*
*Next agent to enhance: River (grief companion)*
