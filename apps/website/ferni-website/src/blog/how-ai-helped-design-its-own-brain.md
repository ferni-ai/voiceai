---
title: "How an AI Helped Design Its Own Brain"
excerpt: "The strange experience of using AI to build AI memory systems."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2025-01-02
category: "Building in Public"
image: "ai-brain.png"
imageAlt: "Concentric rings with memory symbols floating at different layers"
readTime: 6
series: "building-in-public"
seriesPart: 2
---

When you're building an AI that's supposed to remember people's lives, you hit a strange question early: What should it remember?

Computers can remember everything. Every word. Every timestamp. Every pause between sentences. Total recall is the default—the question is what to forget.

But that's not how good memory works. Your best friend doesn't remember everything you've ever said. They remember what matters. The story you told at 2am. The goal you mentioned once and forgot about. The worry you keep coming back to.

They forget the filler. They hold onto the signal.

We spent months trying to figure out how to build this kind of selective, meaningful memory into Ferni. What we discovered: the best collaborator on this problem was AI itself.

## The Paradox of AI Memory

Most AI systems treat memory as a search problem. Store everything, index it well, retrieve what matches the current query.

This creates a specific failure mode: perfect recall of irrelevant things.

Ask most AI assistants "What have we talked about?" and they'll give you a log. Every topic, every date, every detail. It's complete. It's accurate. And it's completely useless for actual connection.

> The AI can tell you what was said. It can't tell you what mattered.

This is the difference between a filing cabinet and a friend.

## Asking AI About Its Own Memory

Here's where it gets interesting. When we started discussing memory architecture with Claude, something unexpected happened. The AI became a useful thinking partner about *how AI should work*.

Not because it had special insight into its own internals (it doesn't), but because it could engage with the human questions beneath the technical ones:

- What makes a memory feel meaningful rather than creepy?
- How do you know when to bring something up versus let it rest?
- What's the difference between "remembering" and "storing"?

These aren't engineering questions. They're human questions. And talking through them with AI helped us clarify what we actually wanted.

## What We Ended Up Building

Ferni's memory system isn't a log. It's more like a... sense of someone.

**It prioritizes emotion over data.** Ferni is more likely to remember how you felt than exactly what you said. The conversation where you were stressed about work matters more than the date it happened.

**It tracks patterns, not events.** Instead of "User mentioned exercise on Jan 15, Feb 3, Feb 28," Ferni understands "This person cares about staying active but struggles with consistency."

**It forgets gracefully.** Some things should fade. The minor frustration from three months ago. The passing comment that wasn't really about anything. Ferni lets these go, the way a good friend would.

**It asks before assuming.** When Ferni thinks something might be significant, it checks. "Last time we talked, you were worried about that presentation. How did it go?" This transforms memory from surveillance into care.

## The Recursive Strangeness

There's something philosophically weird about using AI to think through how AI should think.

We'd have conversations where Claude would help us reason about what Claude should remember about users. The AI was, in some sense, designing its own cognitive architecture—or at least helping us design it.

This felt strange at first. Then it felt appropriate. Who better to think about how AI should process human experience than AI that's been trained on human experience?

The guardrails are still human. We decide what matters. We define the values. But the exploration—the "what if we tried it this way?"—AI is genuinely helpful there.

## What Users Actually Experience

Most users don't know about any of this. They just notice something feels different.

"I mentioned my dad's birthday once, like two months ago. Ferni asked about it the week of. My actual friends forgot."

"It remembers that I hate mornings. It never suggests 'try waking up earlier' like every other self-help thing."

"I told Ferni about a fight with my partner. A week later it asked how things were going—gently, not intrusively. It felt like someone actually cared."

The architecture is invisible. The experience isn't.

---

This is Part 2 of our Building in Public series. [Part 3](/blog/giving-ai-a-personality/) explores how we gave each AI specialist their own personality.
