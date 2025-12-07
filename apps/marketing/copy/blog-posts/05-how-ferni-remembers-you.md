# How Ferni Remembers You (Without Being Creepy)

**Subtitle**: The deliberate choices behind memory that feels helpful, not invasive.

**Reading time**: 6 minutes

---

Most AI assistants remember everything. Ferni remembers what matters.

That might sound like marketing speak, but it's actually a design philosophy we agonized over. Memory is a superpower. It's also a minefield. Get it right, and you feel understood. Get it wrong, and you feel surveilled.

Here's how we think about it.

---

## The Creepy Valley

There's a phenomenon we call the "creepy valley" of AI memory. (Yes, we made up that term. It fits.)

Too little memory, and every conversation starts from scratch. You have to re-explain your situation every time. It feels like talking to a stranger over and over.

Too much memory, and the AI starts reciting details back to you that feel invasive. "On March 15th, you mentioned you were stressed about your quarterly review." Did I? Do I want you to remember that? Why are you bringing it up?

The creepy valley sits between useful and unsettling. Navigate it wrong, and users feel either frustrated or watched. Neither is good.

Our goal: memory that feels like a good friend's memory. Present but not performative. Helpful but not obsessive.

---

## What Gets Remembered

Here's specifically what Ferni stores:

### Goals and Aspirations

When you mention something you're working toward—losing weight, getting promoted, learning Spanish, improving your relationship with your kids—we remember it. These are the through-lines of your life. They give context to everything else.

Six weeks from now, when you mention being tired, Ferni might ask whether it's related to the Spanish lessons you've been pushing yourself on. That connection only exists because we remembered the goal.

### Preferences

How do you like to think about problems? Are you a "give me options" person or a "tell me what to do" person? Do you process out loud or do you need time to think? Do you want Maya to be warm and gentle or more direct?

These preferences emerge over time. We notice patterns in how you engage and adjust accordingly. You never have to fill out a profile or set preferences manually—the system learns from the conversation itself.

### Relationships

When you mention people who matter to you—your partner, your boss, your daughter Emma—we remember them. Not as data points, but as characters in your story.

This lets conversations feel continuous. When you mention "Emma" without explanation, Ferni knows who Emma is. No need to reintroduce her every time.

We remember relationships you've described, not relationships we've inferred. If you tell us your sister can be difficult, we'll remember that. We won't start diagnosing family dynamics you haven't shared.

### Ongoing Context

Some things are situationally important but not permanent. You're in the middle of a job search. You just moved to a new city. You're planning a wedding.

These get remembered but also age out. A job search from two years ago isn't relevant context anymore. A wedding that happened last summer is history, not active planning.

Context has a shelf life. Good memory knows when to let go.

---

## What Doesn't Get Remembered

Just as important: what we deliberately don't store.

### Mundane Details

What you had for breakfast. What time you woke up. The specific tasks you completed yesterday. These are the logs of daily life, not the story of it.

Nobody wants an AI that says, "Last Tuesday you mentioned having coffee at 7:42 AM. How's your morning routine going?" That's not helpful. That's surveillance cosplaying as care.

### Things That Should Stay Ephemeral

Sometimes you need to vent. You need to say something out loud that you don't want to define you. "I hate my job" in a moment of frustration isn't the same as "I want to change careers" as a considered goal.

We try to distinguish between ventilation and declaration. The former gets heard but not recorded. The latter gets remembered because it matters.

### Information That Would Feel Weird

This is a gut check we apply constantly: "Would a user feel weird if we brought this up later?"

If the answer is yes—even if the information is technically useful—we don't store it.

You mentioned having a fight with your partner. Useful context? Maybe. Something we should bring up two weeks later? Absolutely not. Some things are shared in confidence of the moment, not to be archived.

---

## The Forgetting Curve

Memory isn't just about storage. It's about decay.

Human memory naturally forgets things over time. Not randomly—there's a curve. Things that aren't reinforced fade. Things that come up repeatedly stick.

Ferni's memory works similarly.

Mention something once, and it enters short-term storage. Mention it again over time, and it moves to long-term. Stop mentioning it entirely, and it gradually fades.

This prevents the accumulation of stale context. Your goals from three years ago shouldn't be influencing today's conversation if they're no longer relevant. The system naturally cleans itself.

We also have explicit forgetting. If you tell Ferni to forget something, it's gone. Not archived. Not hidden. Gone. Your data, your choice.

---

## Privacy by Design

Some memory never leaves your conversation at all.

When you're talking to Ferni, certain things are processed in real-time but not stored:
- The raw audio of your voice
- Specific phrasing and word choices (we remember meaning, not transcripts)
- Anything you explicitly mark as private

We don't use your conversations to train AI models. Your personal growth doesn't become training data for someone else's AI. That's a promise we made early and won't break.

We've also architected the system so that specialists share context, but only the context that helps the current conversation. If you talked to Maya about anxiety and then switch to Jordan to plan a trip, Jordan knows you've been feeling anxious (context), but she doesn't have the full transcript of that conversation (privacy).

It's need-to-know, even among our own AI team.

---

## A Story That Shows It Working

Here's a real example (details changed for privacy).

A user mentioned their daughter Emma in passing during a conversation with Ferni. Just context about their day—Emma had a rough time at school.

Three weeks later, the user was talking to Maya about building better habits around work-life balance. They mentioned wanting to "be more present."

Maya asked: "When you say 'more present'—is that about work pulling you away? Or about being there for specific people, like Emma?"

The user was surprised. They'd forgotten they mentioned Emma. But Maya's question unlocked something: "Yeah, actually. Emma's been struggling and I've been too distracted to really help her. That's what this is about."

That's memory doing what it's supposed to do. Connecting dots across time to surface insights the user might not have reached on their own. Not creepy surveillance. Care that requires context.

---

## The Questions We Ask Ourselves

Before we store anything, we ask:

1. **Is this the meaning or just the data?** Store "user is training for a marathon" not "user mentioned running 5 miles on Tuesday."

2. **Would bringing this up later feel helpful or invasive?** If invasive, don't store it.

3. **Does this age out naturally?** If it's situational, give it an expiration.

4. **Does the user expect this to be remembered?** Goals and aspirations, yes. Venting about traffic, no.

5. **Would we be comfortable explaining this storage to the user?** If we'd feel defensive explaining it, we shouldn't do it.

These aren't automated checks. They're the design philosophy that shapes how we build every feature that touches memory.

---

## What You Can Do

You have full control over your memory.

- **Ask what's remembered**: "What do you know about me?" Ferni will tell you.
- **Correct mistakes**: "Actually, I don't work at that company anymore." Memory updates.
- **Request deletion**: "Forget everything about X." Done.
- **Full export**: Request a copy of your data. We'll provide it.
- **Full deletion**: Want to start over? Your entire history can be wiped.

We believe memory should enhance the experience without feeling like a trap. You can always see what we know, correct what we got wrong, and delete what you want gone.

---

## What's Next

This is Part 5 of our "Building in Public" series. In Part 6, we'll talk about speed—how we ship improvements every day, and how AI enables a development velocity that would be impossible without it.

If you want to see thoughtful memory in action, have a conversation with Ferni over a few weeks. Notice how the continuity builds. Notice how it feels like being remembered, not recorded.

Web at [app.ferni.ai](https://app.ferni.ai), or call (484) 481-3081.

We remember you. The way a friend would.

---

*[Author Name] is the [role] at Ferni. They've thought about memory more than is probably healthy.*

---

**Series: Building in Public**
- Part 1: [Why We Let AI Help Build Ferni](/blog/why-we-let-ai-help-build-ferni)
- Part 2: [How an AI Helped Design Its Own Brain](/blog/how-ai-helped-design-its-own-brain)
- Part 3: [Giving AI a Personality (Without Losing Its Soul)](/blog/giving-ai-a-personality)
- Part 4: [Our Daily Standup Has an AI in the Room](/blog/daily-standup-with-ai)
- **Part 5**: How Ferni Remembers You (Without Being Creepy) ← You are here
- Part 6: We Ship Every Day. Here's How.
- Part 7: AI Should Make You Feel Less Alone
- Part 8: What's Next for Ferni

---

*Tags: AI Memory, Privacy, Building in Public, Data Privacy, Ferni*

