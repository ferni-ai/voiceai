# Developer Blog Content Standards

> **Mission:** Establish Ferni as the thought leader in real-time conversational AI through research-driven, insight-rich content that drives action.

---

## Core Principles

### 1. Research-Driven, Not Code-Driven

Blog posts are **thought leadership**, not tutorials. Code examples are illustrative, never the focus.

| ❌ Wrong Approach | ✅ Right Approach |
|-------------------|-------------------|
| "Here's how to implement webhooks" | "Here's why webhook security is fundamentally different in voice AI" |
| 500 lines of sample code | 3 research citations and one illustrative snippet |
| Step-by-step tutorial | Strategic insight with evidence |
| "Copy this code" | "Think about this differently" |

**Rule:** If the post could be replaced by documentation, it's not a blog post.

### 2. Evidence Over Assertion

Every claim needs backing. No unsupported statements.

**Types of acceptable evidence:**
- Academic research (cite author, institution, year)
- Internal data (specify sample size, time period)
- Industry benchmarks (cite source)
- First-hand experience (frame as lessons learned)

```markdown
❌ "Fast responses are important for voice AI"

✅ "Researchers at Stanford's Human-Computer Interaction Lab found that 
   participants rated identical responses as 23% less intelligent when 
   delivered after 400ms compared to 150ms (Chen et al., 2019)."
```

### 3. Insight Over Information

Information is commodity. Insight is value.

**Information:** "Voice AI has latency challenges"  
**Insight:** "The 200ms perceptual threshold exists because your brain starts predicting when someone will finish speaking 150ms before they actually stop—so a 500ms AI delay feels like 700ms"

**The test:** Does this give the reader a new way to think about the problem?

### 4. Narrative Over List

Stories are remembered. Lists are forgotten.

Every post should have:
- **A hook** — An unexpected fact, a failure story, a provocative claim
- **A journey** — Build understanding progressively
- **A revelation** — The insight that changes how you see the problem
- **An action** — What to do differently now

```markdown
❌ "5 Tips for Better Voice AI Performance"

✅ "The 200ms Threshold: Why Voice AI Lives or Dies by Latency"
   (Opens with Stanford research, builds through neuroscience,
   reveals why most architectures fail, ends with specific changes)
```

### 5. Contrarian Over Consensus

Safe opinions don't establish thought leadership.

**Consensus:** "Voice AI is growing"  
**Contrarian:** "Text-based AI assistants are a transitional technology. Voice is the final interface."

**Consensus:** "Security is important"  
**Contrarian:** "The security measures that work for text AI actively harm voice AI because they add latency that users perceive as stupidity"

**The test:** Would someone disagree with this? If no one would disagree, it's not worth saying.

### 6. Specific Over General

Specificity creates credibility.

```markdown
❌ "We improved latency significantly"

✅ "We reduced Time to First Relevant Sound from 340ms to 60ms by 
   beginning TTS generation after 40 tokens and deploying inference 
   to 12 edge locations within 50km of users"
```

**Numbers to include when available:**
- Latency in milliseconds
- Sample sizes for experiments
- Percentage improvements with before/after
- Time periods for data collection

---

## Content Categories

Each post falls into one category. Categories signal reader expectations.

| Category | Purpose | Tone | Example Title |
|----------|---------|------|---------------|
| **Research** | Deep dive into a technical topic with evidence | Academic, authoritative | "The 200ms Threshold: Why Voice AI Lives or Dies by Latency" |
| **Vision** | Where the industry is going and why | Bold, forward-looking | "The End of the Chatbot Era: Why Voice AI Needs a Platform Rethink" |
| **Analysis** | Breaking down a technology or trend | Explanatory, strategic | "The Tool Integration Problem: Why MCP Changes Everything" |
| **Security** | Security insights specific to voice/AI | Cautionary, experienced | "The Invisible Attack Surface: Security Lessons from Voice AI at Scale" |
| **Lessons** | What we learned from real failures | Humble, practical | "What We Got Wrong: Five Hard Lessons from Production" |
| **Announcement** | Product updates (use sparingly) | Excited but grounded | Only for major launches |

---

## Structure Template

Every blog post follows this structure:

```markdown
---
title: "[Provocative claim or unexpected framing]"
excerpt: "[One sentence that makes reader want to know more]"
author: "Seth Ford"  # Or specific team member
authorInitials: "SF"
authorColor: "#4a6741"
date: YYYY-MM-DD
category: "Research|Vision|Analysis|Security|Lessons"
image: "filename.png"
readTime: XX  # Minutes, be honest
---

# [Hook — first 2-3 paragraphs]
Open with something unexpected:
- A research finding that challenges assumptions
- A failure story with stakes
- A contrarian claim
- A specific moment that reveals a bigger truth

---

## [Section 1: Establish the Problem]
Why does this matter? What do most people get wrong?

## [Section 2: The Insight]
The new way of thinking about this problem.
Include research, data, evidence.

## [Section 3: Implications]
What this means for the industry, for builders, for the future.

## [Section 4: Action]
What the reader should do differently.

---

## Further Reading (if applicable)
- Academic citations
- Related Ferni posts
- External resources

---

*[Author bio with Twitter link]*
```

---

## Voice and Tone

### We Sound Like:
- A senior engineer explaining to a peer (not teaching a beginner)
- Someone who has battle scars and earned wisdom
- Confident but not arrogant
- Specific and precise
- Willing to admit what we got wrong

### We Don't Sound Like:
- Marketing copy ("Revolutionary!", "Game-changing!")
- Documentation ("To install, run...")
- Academic papers (overly formal, passive voice)
- Hot takes (opinions without evidence)

### Sentence Patterns:
```
❌ "Voice AI is revolutionizing the way we interact with technology"
✅ "Voice is the natural human interface. Text was the workaround."

❌ "Our innovative platform leverages cutting-edge technology"  
✅ "We handle 50,000 conversations daily. Here's what we learned."

❌ "Developers can easily integrate our powerful API"
✅ "Connecting an MCP server takes 3 lines of code. Getting it production-ready takes understanding these 5 failure modes."
```

---

## Quality Checklist

Before publishing, verify:

### Evidence
- [ ] Every major claim has supporting evidence
- [ ] Data includes sample sizes and time periods
- [ ] Research citations include author/institution/year
- [ ] "We found" statements specify how we found it

### Insight
- [ ] The reader will think differently after reading this
- [ ] There's at least one "I never thought about it that way" moment
- [ ] The post couldn't be replaced by documentation

### Narrative
- [ ] Opens with a hook (not a summary)
- [ ] Builds progressively (doesn't dump everything upfront)
- [ ] Ends with clear action (not a vague conclusion)

### Specificity  
- [ ] Numbers are specific, not rounded ("23%" not "about 25%")
- [ ] Technical details are precise (milliseconds, token counts)
- [ ] Examples are concrete, not hypothetical

### Differentiation
- [ ] Takes a position someone could disagree with
- [ ] Says something competitors aren't saying
- [ ] Adds to the conversation, doesn't repeat it

### Code (if any)
- [ ] Illustrates a concept, doesn't teach implementation
- [ ] Under 30 lines per snippet
- [ ] Surrounded by explanation of *why*, not just *what*

---

## Anti-Patterns to Avoid

### The Tutorial Trap
**Symptom:** Post is mostly code with explanatory text between snippets  
**Fix:** Write the insight first, add code only if it illuminates the insight

### The Press Release
**Symptom:** "We're excited to announce..." without substance  
**Fix:** What does this mean for the reader? What insight led to this decision?

### The Listicle
**Symptom:** "7 Tips for..." with no connecting narrative  
**Fix:** Find the underlying principle that connects the tips, write about that

### The Hedge
**Symptom:** "Voice AI might potentially help some users in certain situations"  
**Fix:** Take a position. "Voice AI is the final interface. Here's why."

### The Recap
**Symptom:** Summarizing what others have said without adding new perspective  
**Fix:** What do we know that others don't? What have we learned from our unique position?

---

## Competitive Positioning

Our blog competes with:
- Google AI Blog (academic, authoritative)
- Stripe's engineering blog (practical, well-written)
- a]16z (strategic, industry-shaping)
- Paul Graham essays (contrarian, memorable)

**Our unique angle:** We're the only company running production voice AI at scale with a relationship focus. We have insights nobody else has:
- What makes voice AI feel human (not just functional)
- Why latency matters differently in voice than text
- How memory creates relationship over time
- Why personality drift is a real production problem

**Every post should leverage this unique position.**

---

## Publishing Cadence

- **Target:** 2-4 posts per month
- **Quality over quantity:** One great post beats four mediocre ones
- **Timing:** Tuesday or Wednesday, 9am PT (best engagement)
- **Promotion:** Twitter thread summary, LinkedIn post, Discord announcement

---

## Examples of Excellence

**Best opening hooks:**
> "Six months after launching Ferni, we got hacked."

> "In 2019, researchers at Stanford's Human-Computer Interaction Lab made a discovery that should have changed how we build voice AI: humans unconsciously judge AI intelligence by its response time."

> "When Apple launched the App Store in 2008, the smartphone industry had existed for over a decade. But none of them became platforms."

**Best insight revelations:**
> "This is why a 500ms AI response feels like 700ms. Your brain's predictive model is running ahead of reality."

> "The tradeoff isn't quality vs. speed. It's short-term accuracy vs. long-term engagement."

> "The companies that win in voice AI won't have the best language models. They'll have the best latency engineering."

---

*Last updated: January 2026*
