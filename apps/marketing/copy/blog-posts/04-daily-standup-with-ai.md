# Our Daily Standup Has an AI in the Room

**Subtitle**: What it's actually like to build software with AI as a pair programming partner.

**Reading time**: 7 minutes

---

Every morning, before I write a line of code, I have a conversation. Not with my co-founder. With Claude.

I describe what I'm trying to build. I talk through the edge cases I'm worried about. I ask questions I'd be embarrassed to ask a human colleague because they seem too basic or too obvious. And then we build together.

This is our daily standup. Here's what it actually looks like.

---

## A Real Day in the Life

8:47 AM. Coffee. I open my editor and see yesterday's work: a half-finished feature for improving how Maya handles habit tracking.

The code works, sort of. But something feels off. The responses are too rigid. Maya sounds like she's reading from a script instead of having a conversation.

Old me would have stared at the code for an hour, tweaking parameters, guessing at what might help. New me starts a conversation:

*"I'm working on Maya's habit tracking responses. The logic works but the output feels scripted. Here's an example conversation that doesn't feel right..."*

I paste the conversation. Claude reads it. Then:

*"I notice Maya is asking the same follow-up questions regardless of what the user says. She asks about 'obstacles' even when the user just expressed excitement. Could we branch the logic based on emotional tone?"*

I hadn't seen that. I was looking at the code structure. Claude was looking at the user experience.

9:15 AM. We're deep in refactoring. Claude suggests an approach I wouldn't have thought of—tracking the emotional arc of the conversation, not just the content. Maya's follow-ups should respond to how someone feels, not just what they say.

9:48 AM. I've implemented the basic structure. Something's still wrong. I paste the code.

*"In line 47, you're checking for emotional tone after the response is already generated. Should that check happen before, so it can influence the response?"*

A typo in my logic flow. Would have taken me 20 minutes to find. Took Claude 10 seconds.

10:15 AM. It's working. Maya feels alive now. The conversations branch naturally. I push the code.

This is a typical morning. Not every day is this smooth. But most days have at least one moment where AI saves me time or catches something I missed.

---

## What We Ask AI to Do

After months of this workflow, we've developed a sense for what AI is good at and what it isn't.

### Good at:

**Catching edge cases.** I'll describe a feature, and Claude will ask "What happens if the user says X?" Half the time, X is something I hadn't considered. This has prevented more bugs than any testing framework.

**Explaining options.** "I could structure this data three different ways. Here are the tradeoffs of each." I still make the decision, but I make it with more information than I would have gathered on my own.

**Rubber ducking at scale.** Sometimes I just need to explain what I'm doing to someone. The act of articulating it reveals the flaws. Claude is endlessly patient with this.

**Catching inconsistencies.** "In file A, you're assuming X. In file B, you're assuming Y. Are both true?" Codebase-level consistency checking that would take me hours takes Claude seconds.

**Generating variations.** "Here are five different ways Maya could respond to this situation, each reflecting a slightly different personality trait." I pick the best one. Faster than writing five myself.

### Not good at (yet):

**Intuiting user needs.** AI can tell me what's technically correct. It can't tell me what users actually want. That still requires watching people use the product, reading between the lines of their feedback, making gut calls.

**Knowing when to stop.** AI will keep optimizing forever if you let it. "We could also add this feature, and this one, and this one..." Someone has to say "enough." That's still us.

**Maintaining a vision.** AI is great at local optimization—making this function better, this response cleaner. It doesn't hold the big picture of what Ferni should feel like. That's the human job.

**Caring about aesthetics.** AI can generate something functional. Whether it's beautiful—whether it *feels* right—requires human judgment. Every time.

---

## Mistakes AI Caught That We Would Have Missed

Let me be specific about the value here.

**The infinite loop that wasn't obvious.** We had a feedback mechanism where Maya would ask a follow-up question based on user response, and that follow-up could trigger another follow-up, and... you see where this is going. In testing, we never hit the loop because our test conversations were too short. Claude read the code and said, "This could recurse indefinitely under conditions X, Y, Z." Added a depth limit. Bug never shipped.

**The privacy leak we didn't see.** In our memory system, we were logging too much for debugging purposes. Claude flagged it: "This log includes user conversation content. Should that be hashed or excluded for production?" It should have been. We fixed it before it mattered.

**The accessibility issue that slipped through.** Our web interface had some contrast ratios that technically passed WCAG guidelines but were uncomfortable for extended use. Claude suggested specific improvements based on readability research. Not something we would have caught until users complained.

**The timezone bug that would have been embarrassing.** Jordan helps with scheduling. We were calculating "tomorrow" without considering the user's timezone. Claude caught it in code review: "If a user in Tokyo schedules something for tomorrow while your server is in UTC, they might get the wrong day." Fixed.

Each of these would have eventually surfaced. Some would have been minor. Some would have been major. Catching them early—before any user experienced them—is why AI pair programming is valuable.

---

## Mistakes We Caught That AI Suggested

This part is important too. AI is not infallible. We've learned to verify.

**The over-engineered solution.** Claude once suggested a complex caching system for our memory retrieval. It was technically elegant. It was also massive overkill for our current scale. We would have spent a week building something we didn't need yet.

**The tone-deaf response.** We asked Claude to generate example responses for Maya when a user shares something difficult. One of the suggestions was technically empathetic but felt clinical. A human would never say it that way. We caught it, but it was a reminder: AI can approximate warmth, but humans have to verify it.

**The confident hallucination.** Claude once explained a feature of a library we were using with complete confidence. The feature didn't exist. The explanation was plausible enough that I almost didn't check. Now we always check.

**The local maximum.** AI optimized one function beautifully. But the optimization made the function harder to change later when requirements evolved. We had to undo the "improvement" because it optimized for the wrong thing.

The lesson: AI is a powerful collaborator, not an infallible oracle. Verify. Question. Trust but check.

---

## The Uncanny Experience of AI Improving AI

Here's the part that still feels strange:

We use AI to write code that makes AI better at being AI.

Last week, we were refining how Ferni decides when to hand off to a specialist. The logic was too simple—basically, keyword matching. Claude suggested a more nuanced approach based on conversation dynamics, not just content. We implemented it. Ferni got noticeably better at knowing when to involve Maya versus Peter versus Jordan.

Claude helped us make Ferni smarter. Claude and Ferni are different AIs, but still. There's something recursive about it.

It's like an author using an AI writing assistant to write better dialogue for AI characters in their novel. Except the AI characters are real, and the improvements make them more helpful to actual humans.

Is it weird? Definitely. Is it working? Also definitely.

---

## The Balance: Speed vs. Craft

We could ship faster if we let AI do more. We could generate entire features, entire interfaces, entire systems with minimal human intervention.

We don't. Here's why.

Speed without intention is noise. The goal isn't to build software fast. It's to build software that genuinely helps people. That requires craft. Craft requires humans making deliberate choices about what matters.

AI accelerates our ability to execute craft. It doesn't replace the craft itself.

Every day, we make judgment calls that AI can't make:
- This feature would be impressive but wouldn't serve users. Don't build it.
- This response is technically correct but feels cold. Rewrite it.
- This code works but isn't beautiful. Refactor it.
- This path is faster but locks us into a corner. Go slower.

AI helps us move quickly through the things that don't require judgment. That gives us more time for the things that do.

---

## What This Means for Building Software

If you're a developer, you're probably already experimenting with AI assistance. Here's our hard-won advice:

**Use it for thinking, not just coding.** The best conversations we have with Claude aren't about code generation. They're about problem exploration. "What are we missing? What could go wrong? How else could we approach this?"

**Describe the why, not just the what.** "Write a function that does X" produces mediocre results. "We're trying to solve Y problem because Z matters to users, and we think X might help" produces much better results.

**Keep humans on the critical path.** The decisions that define what you're building—who it's for, what it should feel like, what it won't do—should stay with humans. Use AI to execute those decisions faster, not to make them for you.

**Build in verification.** Don't trust. Verify. Even when AI sounds confident. Especially when AI sounds confident.

---

## What's Next

This is Part 4 of our "Building in Public" series. In Part 5, we'll go deep on memory—how Ferni remembers you without being creepy, and the deliberate choices we made about what to keep and what to forget.

If you want to see what all this daily pair programming produces, try Ferni yourself. Web at [app.ferni.ai](https://app.ferni.ai), or call (484) 481-3081.

The code we write with AI, serves you.

---

*[Author Name] is the [role] at Ferni. They talk to AI more than they talk to most humans, and they're only slightly concerned about what that means.*

---

**Series: Building in Public**
- Part 1: [Why We Let AI Help Build Ferni](/blog/why-we-let-ai-help-build-ferni)
- Part 2: [How an AI Helped Design Its Own Brain](/blog/how-ai-helped-design-its-own-brain)
- Part 3: [Giving AI a Personality (Without Losing Its Soul)](/blog/giving-ai-a-personality)
- **Part 4**: Our Daily Standup Has an AI in the Room ← You are here
- Part 5: How Ferni Remembers You (Without Being Creepy)
- Part 6: We Ship Every Day. Here's How.
- Part 7: AI Should Make You Feel Less Alone
- Part 8: What's Next for Ferni

---

*Tags: AI Development, Building in Public, Pair Programming, AI Coding, Ferni*

