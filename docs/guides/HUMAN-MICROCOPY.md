# Human Microcopy Guide

> **We believe in making AI human, and the decisions we make will reflect that.**

This guide defines how to write user-facing messages that feel human, not robotic.

---

## The Golden Rule

**Write like you're talking to a friend, not filing a bug report.**

Every message the user sees should feel like it came from a person who cares, not a computer following a script.

---

## Error Messages

### Principles

1. **Acknowledge, don't blame** - Never make the user feel at fault
2. **Be helpful, not technical** - No error codes, stack traces, or jargon
3. **Offer a path forward** - What can they do next?
4. **Stay warm** - Even errors should feel friendly

### Examples

| Robotic | Human |
|---------|-------|
| `Error: Connection failed` | "Hmm, couldn't connect. Let's try that again." |
| `Connection timeout` | "Taking longer than usual... check your internet?" |
| `Permission denied` | "I'll need microphone access to hear you. Mind enabling it?" |
| `Network error` | "Having trouble reaching the server. Is your internet working?" |
| `Transfer failed: timeout` | "Couldn't reach them right now. I'm still here though!" |
| `Export failed. Please try again.` | "Hmm, couldn't export your data. Mind trying again?" |
| `Deletion failed.` | "Couldn't delete your data right now. Try again?" |
| `Invalid input` | "I didn't quite catch that—could you try again?" |
| `Session expired` | "Been a while! Let me reconnect..." |
| `Rate limited` | "Whoa, let me catch my breath. Try again in a moment?" |

---

## Status Messages

### Loading States

| Robotic | Human |
|---------|-------|
| `Loading...` | "Getting ready..." |
| `Connecting...` | "Almost there..." |
| `Establishing connection...` | "Just a moment..." |
| `Initializing...` | "Setting things up..." |
| `Processing...` | "Thinking about that..." |

### Success States

| Robotic | Human |
|---------|-------|
| `Connected` | "Hey! Good to see you." |
| `Saved` | "Got it!" |
| `Data exported` | "Your data has been downloaded!" |
| `Advisor disconnected` | "See you next time!" |
| `Microphone enabled` | "I'm listening" |
| `Microphone disabled` | "I'll wait quietly" |

---

## Action Prompts

### Asking for Permission

| Robotic | Human |
|---------|-------|
| `Grant microphone access` | "I'd love to hear your voice—enable mic access?" |
| `Enable notifications` | "Want me to remind you? Enable notifications?" |
| `Allow location access` | "Mind if I know where you are? It helps me help you." |

### Encouraging Action

| Robotic | Human |
|---------|-------|
| `Click to continue` | "Ready when you are" |
| `Submit` | "Let's do this" |
| `Retry` | "Try again?" |
| `Cancel` | "Never mind" |

---

## Empty States

When there's no content to show:

| Robotic | Human |
|---------|-------|
| `No results found` | "Nothing here yet—let's start something!" |
| `No conversations` | "This is where our conversations will live" |
| `No habits tracked` | "Ready to build some good habits?" |
| `History is empty` | "Fresh start! Every journey begins here." |

---

## Tone Guidelines

### Do
- Use contractions (I'm, you're, let's, can't)
- Ask questions when appropriate
- Acknowledge feelings
- Use "we" and "I" (the AI speaking)
- Add light humor when appropriate
- Be encouraging

### Don't
- Use technical jargon
- Be overly formal
- Sound like a manual
- Use ALL CAPS for emphasis
- Be condescending
- Overuse exclamation marks (one per message max)

---

## Voice Per Context

### Errors
Warm, reassuring, helpful
> "Something went wrong on our end. Try again in a moment?"

### Success
Celebratory but not over the top
> "Nice! Got it saved."

### Waiting
Calm, patient
> "Just a moment..."

### Prompts
Friendly, inviting
> "What's on your mind?"

---

## Implementation Checklist

When writing any user-facing message:

- [ ] Would I say this to a friend?
- [ ] Is it free of technical jargon?
- [ ] Does it feel warm, not cold?
- [ ] Is there a clear next step (if needed)?
- [ ] Does it sound like Ferni, not a computer?

---

*"Every message is a chance to feel more human."*
