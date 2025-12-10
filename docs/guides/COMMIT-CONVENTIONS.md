# Commit Conventions

> **We believe in making AI human, and the decisions we make will reflect that.**

Our commit messages should reflect what we're building: technology that serves human connection.

---

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | When to Use                              | Example                                                     |
| ---------- | ---------------------------------------- | ----------------------------------------------------------- |
| `feat`     | New feature that serves users            | `feat(voice): add thinking pauses for natural conversation` |
| `fix`      | Bug fix                                  | `fix(memory): remember emotional context across sessions`   |
| `refactor` | Code improvement without behavior change | `refactor(speech): simplify emotion detection pipeline`     |
| `perf`     | Performance improvement                  | `perf(audio): reduce latency for more natural turn-taking`  |
| `style`    | Code formatting, no logic change         | `style(ui): align with design tokens`                       |
| `docs`     | Documentation                            | `docs: add human-ness checklist to PR template`             |
| `test`     | Adding or fixing tests                   | `test(greeting): verify warmth in returning user flow`      |
| `chore`    | Maintenance, deps, config                | `chore(deps): update livekit agents`                        |

### Scopes

Use the area of the codebase being changed:

| Scope     | Area                              |
| --------- | --------------------------------- |
| `voice`   | Voice agent, speech processing    |
| `memory`  | User memory, conversation history |
| `persona` | Persona bundles, personality      |
| `emotion` | Emotion detection, mood tracking  |
| `speech`  | TTS, prosody, SSML                |
| `tools`   | LLM tools                         |
| `ui`      | Frontend interface                |
| `api`     | REST API routes                   |
| `auth`    | Authentication                    |
| `infra`   | Infrastructure, deployment        |

---

## Writing Human-First Descriptions

### Describe the Human Impact

Instead of describing what the code does, describe what the user experiences:

| Technical (Avoid)       | Human (Prefer)                               |
| ----------------------- | -------------------------------------------- |
| `add timeout handler`   | `recover gracefully when connection is slow` |
| `implement retry logic` | `keep trying so conversations don't drop`    |
| `add caching layer`     | `remember context faster between turns`      |
| `fix null pointer`      | `prevent awkward silences from crashes`      |
| `update regex`          | `catch more ways users express emotions`     |
| `add validation`        | `guide users when input isn't clear`         |

### Use Active Voice

| Passive (Avoid)       | Active (Prefer)                         |
| --------------------- | --------------------------------------- |
| `Timeout was added`   | `Add graceful timeout recovery`         |
| `Bug was fixed`       | `Fix memory recall for returning users` |
| `Feature implemented` | `Remember what matters to users`        |

### Be Specific, Not Vague

| Vague (Avoid)  | Specific (Prefer)                                |
| -------------- | ------------------------------------------------ |
| `fix bug`      | `fix greeting not using user's name`             |
| `update stuff` | `warm up error messages for connection failures` |
| `improvements` | `add thinking sounds for more natural pauses`    |

---

## Examples by Type

### Features

```
feat(voice): add "um" and "hmm" thinking sounds for natural pauses
feat(memory): remember user's preferred name across sessions
feat(emotion): detect frustration and respond with extra patience
feat(persona): add story about Ferni's time in Japan
feat(ui): show gentle encouragement during long silences
```

### Fixes

```
fix(memory): recall emotional moments, not just facts
fix(speech): soften tone when user sounds stressed
fix(greeting): use time-appropriate opening (morning vs evening)
fix(handoff): maintain warmth during team member transitions
fix(ui): make error messages feel helpful, not robotic
```

### Refactors

```
refactor(voice): simplify turn-taking for more natural rhythm
refactor(persona): consolidate personality traits for consistency
refactor(emotion): streamline sentiment analysis pipeline
```

### Performance

```
perf(audio): reduce latency for responsive conversation
perf(memory): faster recall for in-context references
perf(tts): pre-warm voice for instant responses
```

---

## Commit Body (Optional)

Use the body to explain **why** the change matters for human experience:

```
feat(voice): add acknowledgment sounds during user speech

When users are speaking, small sounds like "mm-hmm" and "right"
show we're actively listening—just like a real conversation.

Research shows backchanneling increases perceived attentiveness
and makes conversations feel more natural.
```

---

## Footer (Optional)

Reference issues and note breaking changes:

```
feat(memory): redesign context storage for richer recall

BREAKING CHANGE: Memory format changed. Run migration script.
Fixes #234
Relates to #456
```

---

## Quick Reference

Before committing, ask:

1. **Does my message describe human impact?** Not just code changes
2. **Would a non-developer understand the benefit?** At least roughly
3. **Is it specific?** Not vague like "fix bug" or "update"
4. **Does it reflect our mission?** Making AI better than human

---

## Git Hooks

Our pre-commit hook will remind you to consider human impact. It won't block commits, but will prompt reflection.

---

_"Every commit is a vote for the kind of AI we're building."_
