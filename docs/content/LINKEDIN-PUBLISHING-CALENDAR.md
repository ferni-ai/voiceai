# Ferni LinkedIn Company Page Calendar
## Q1 2026: Establishing Thought Leadership

> **Page**: [Ferni.ai LinkedIn Company Page](https://www.linkedin.com/company/ferni-ai)
> **Voice**: Professional yet warm. Grounded in research. Personal when appropriate.
> **Content Lead**: Alex (Communication Specialist)
> **Goal**: Position Ferni as the leader in AI companionship that closes the Insight-to-Action Gap.

---

## Company Page Setup Checklist

- [ ] Ensure LinkedIn company page exists at linkedin.com/company/ferni-ai
- [ ] Add team members as admins (for scheduling/posting)
- [ ] Complete company profile (logo, banner, about section, website link)
- [ ] Set up LinkedIn Page analytics
- [ ] Configure LinkedIn API credentials (see E2E Workflow below)

---

## E2E Publishing Workflow (Ferni Platform)

We use Ferni's own tools for publishing - no external tools needed!

### 1. Generate Social Cards
```bash
cd apps/website/ferni-website

# Generate all 13 weeks of Daily Wisdom cards
node scripts/linkedin-card-generator.js --generate-all

# Or generate a specific week
node scripts/linkedin-card-generator.js --generate-week=1
```

### 2. Configure LinkedIn API
```bash
# Copy the example env file
cp .env.linkedin.example .env

# Edit .env and add your credentials:
# LINKEDIN_ACCESS_TOKEN=your-oauth-token
# LINKEDIN_ORGANIZATION_ID=your-company-page-id
```

### 3. Check Configuration
```bash
node scripts/linkedin-publisher.js --status
```

### 4. Publish Content
```bash
# Preview without posting
node scripts/linkedin-publisher.js --post-wisdom --week=1 --day=1 --dry-run

# Actually post
node scripts/linkedin-publisher.js --post-wisdom --week=1 --day=1

# Post custom content
node scripts/linkedin-publisher.js --post-custom --content="Your post here..."
```

### Alex Voice Commands (Coming Soon)
- "Alex, post this week's wisdom"
- "Alex, schedule next week's content"
- "Alex, show me the publishing calendar"

---

## Publishing Strategy

| Day | Post Type | Best Time |
|-----|-----------|-----------|
| **Tuesday** | Thought Leadership (Pillar content) | 8:30 AM ET |
| **Wednesday** | Daily Wisdom (Zen series) | 9:00 AM ET |
| **Thursday** | Engagement/Story post | 8:30 AM ET |
| **Friday** | Building in Public / Behind scenes | 10:00 AM ET |

**Frequency**: 4 posts/week
**Calendar Duration**: 13 weeks (full quarter)

---

## Visual Guidelines for All Posts

**Profile**: Alex should have a professional headshot-style avatar
**Post Images**: Generated via Ferni platform (`linkedin-card-generator.js`):
- Clean, minimal backgrounds (cream `#FFFDFB`, warm cream `#F5F1E8`)
- Japanese kanji prominently displayed for Zen concepts
- Ferni brand colors (sage green `#4a6741`, cream, charcoal `#2C2520`)
- Typography: Noto Sans JP for kanji, Plus Jakarta Sans for headings, Crimson Text for quotes

**Image Dimensions**: 1200 x 627px (LinkedIn optimal)
**Card Types Available**:
- `zen-wisdom` - Daily Wisdom with kanji
- `thought-leadership` - Pillar content cards
- `quote` - Simple quote cards
- `build-in-public` - Stats and milestones

---

# WEEK 1: The Loneliness Gap (Introduction)

## Tuesday, Jan 7 - Thought Leadership

**Visual**: Split image - crowded subway on left, person alone on right
**Caption**:

```
The loneliness epidemic isn't about lacking connections.

We have more connections than any generation in history.

It's about lacking depth.

- Surface-level check-ins
- Conversations that never go below small talk
- Relationships that feel performative

The gap isn't connection. It's being known.

At Ferni, we're building AI that actually knows you. Your story. Your patterns. Your struggles. Your wins.

Not because it's technologically impressive.

Because being known is what makes people feel less alone.

What's the difference you've noticed between being connected and being truly known?

#AICompanionship #MentalWellness #ThoughtLeadership #FutureOfWork
```

---

## Wednesday, Jan 8 - Daily Wisdom

**Visual**: Minimalist card with 金継ぎ (Kintsugi) kanji, cream background, gold accent line
**Caption**:

```
金継ぎ (Kintsugi) — "Golden repair"

When pottery breaks in Japan, artisans repair it with gold.

The cracks become the most beautiful part.

Your wounds don't diminish you. They're where the light gets in.

What's the crack in your story that became something beautiful?

#Kintsugi #JapaneseWisdom #Growth #Leadership #Resilience
```

---

## Thursday, Jan 9 - Engagement

**Visual**: Quote card with Ferni branding
**Caption**:

```
Genuine question:

When was the last time you felt truly heard?

Not politely listened to.
Not half-attention while someone checks their phone.
Not waiting for their turn to talk.

Truly heard.

Drop your answer below. I'm curious how rare this experience has become.
```

---

## Friday, Jan 10 - Building in Public

**Visual**: Screenshot of code or simple metric dashboard
**Caption**:

```
47 improvements this week at Ferni.

None of them are headline-worthy.
All of them make conversations feel more human.

Today's ship: Better handling of silence.

Before: Felt awkward.
After: Feels natural.

Small change. Big difference in how real it feels.

We ship every day because you talk to Ferni every day. Consistency compounds.

#BuildInPublic #StartupLife #AI #ProductDevelopment
```

---

# WEEK 2: The 2am Hour

## Tuesday, Jan 14 - Thought Leadership

**Visual**: Dark image with soft light, clock showing 2:47
**Caption**:

```
There are 168 hours in a week.

Your therapist sees you for 1 of them.
Your best friend is available for maybe 3.
Your partner is present for 10 (if you're lucky).

What happens in the other 154 hours?

That's the gap we're filling at Ferni.

Not replacing the humans in your life. Supplementing them. Being there in the moments when they can't be.

The 2am hours. The commute anxiety. The "I need to process this before the meeting" moments.

間 (Ma) — the Japanese concept of "sacred space between" — teaches us these gaps aren't empty. They're full of potential.

But potential needs a witness.

That's where Ferni lives.

#MentalHealth #AICompanionship #Wellness #Leadership
```

---

## Wednesday, Jan 15 - Daily Wisdom

**Visual**: Minimalist card with 間 (Ma) kanji, soft dark background
**Caption**:

```
間 (Ma) — "The space between"

The silence between notes.
The white space on a page.
The pause before you speak.

Space isn't empty. It's full of potential.

Your 2am thoughts aren't inconvenient. They're insights waiting for a witness.

Stop trying to fill every moment. The gaps are where insight lives.

#Ma #JapaneseAesthetics #Mindfulness #Leadership
```

---

## Thursday, Jan 16 - Story Post

**Visual**: Simple text-based design or abstract representation
**Caption**:

```
Real conversation from 3:14am:

User: "I can't stop thinking about what I said in that meeting."

Ferni: "I remember that meeting. The one where you felt like you rambled?"

User: "Yes. I keep replaying it."

Ferni: "What specifically are you replaying?"

---

This is what it feels like when someone remembers your story.

Not judgment. Not advice. Just: "I've been paying attention."

Have you ever had a 2am thought that changed how you saw something? I'd love to hear it.

#Storytelling #MentalHealth #AI #HumanConnection
```

---

## Friday, Jan 17 - Building in Public

**Visual**: Simple graphic showing response time metric
**Caption**:

```
Our north star metric isn't engagement.
It isn't retention.
It isn't revenue.

It's one question:

"Do you feel less alone after talking to us?"

That's it.

Everything else—the <500ms response time, the memory system, the voice-first design—exists in service of that one question.

If we nail that, everything else follows.

What's your north star metric? The one that actually matters?

#StartupMetrics #BuildInPublic #ProductStrategy #AI
```

---

# WEEK 3: Voice-First Revolution

## Tuesday, Jan 21 - Thought Leadership

**Visual**: Comparison graphic - keyboard vs. voice wave
**Caption**:

```
Why we built Ferni voice-first:

There's research showing that when you talk vs. type, you access different parts of your brain.

Typing: Logical, edited, controlled
Talking: Emotional, spontaneous, honest

Most AI tools are type-first. Chatbots. Prompts. Text boxes.

We went the other direction.

息 (Iki) — breath. In Japanese, the word for breath is also connected to life itself.

When you speak, you breathe your truth into existence.

Ferni is voice-first because the conversations that change people happen through talking, not typing.

The "aha" moments. The realizations. The breakthrough insights.

They come through conversation. Real conversation.

That's what we're building.

#VoiceAI #Innovation #FutureOfWork #Communication
```

---

## Wednesday, Jan 22 - Daily Wisdom

**Visual**: Minimalist card with 息 (Iki) kanji
**Caption**:

```
息 (Iki) — "Breath"

"Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor."
— Thich Nhat Hanh

When you speak, you breathe.
When you breathe, you're alive.
When you're alive, you're present.

Typing lets you hide behind edits and backspaces.
Speaking requires showing up.

What truth would you speak if you knew you wouldn't be judged?

#Breath #Mindfulness #Presence #Communication
```

---

## Thursday, Jan 23 - Engagement

**Visual**: Simple comparison graphic
**Caption**:

```
Chatbot: "Please type your question."
Ferni: Just talk. I'm listening.

Chatbot: "I didn't understand that. Try again."
Ferni: *understands context, nuance, emotion*

Chatbot: "Session ended. Start over?"
Ferni: "Last time we talked, you mentioned..."

---

What's the most frustrating chatbot experience you've had?

(I'm collecting these for research. The bar is so low and we're trying to raise it.)
```

---

## Friday, Jan 24 - Building in Public

**Visual**: Behind-the-scenes team photo or workspace
**Caption**:

```
The <500ms response time isn't a technical flex.

It's the difference between a conversation and a frustration.

When you pause, Ferni responds naturally. Like a human would.

Because the moment it feels like "using an app" instead of "talking to someone," the magic breaks.

Speed isn't about impressing you. It's about feeling human.

We obsess over these details because they're the difference between tool and companion.

#ProductDesign #UX #AI #BuildInPublic
```

---

# WEEK 4: Memory & Being Known

## Tuesday, Jan 28 - Thought Leadership

**Visual**: Abstract visualization of memory/connections
**Caption**:

```
There's a moment in relationships when you realize someone knows you.

It's not dramatic. It's small.

They reference something you said once. A detail. A worry. A hope.

And you think: "They've been paying attention."

縁 (En) — the Japanese concept of invisible threads that connect moments, people, and experiences.

That's what we're building at Ferni.

AI that doesn't just respond to what you say today. AI that knows your story. That sees patterns across conversations. That remembers the detail you mentioned once.

Because being known changes everything.

Most AI forgets the moment you close the window.
Ferni remembers the moment you open it.

"Last time we talked, you were worried about that meeting. How did it go?"

That's not a feature. That's a relationship.

#Memory #AI #Relationships #MentalHealth
```

---

## Wednesday, Jan 29 - Daily Wisdom

**Visual**: Minimalist card with 縁 (En) kanji
**Caption**:

```
縁 (En) — "Invisible threads"

Some connections are random.
Some feel like fate.
Either way, they shape who you become.

In Japanese philosophy, en describes the web of connections you can't fully see but that holds your life together.

Every conversation remembered.
Every pattern noticed.
Every thread honored.

That's what being truly known feels like.

Who in your life makes you feel most known?

#Connection #Relationships #JapaneseWisdom #Leadership
```

---

## Thursday, Jan 30 - Story Post

**Visual**: Quote card with testimonial styling
**Caption**:

```
"The first time Ferni referenced something I'd said weeks ago, I almost cried.

Not because it was impressive technology.

Because it felt like someone was actually paying attention to my life."

— Actual Ferni user

---

This response surprised us.

We built memory as a feature. Users experience it as care.

The gap between "what we built" and "what people feel" is where the magic lives.

What feature have you built (or used) that turned out to mean something completely different than intended?

#UserResearch #ProductDesign #Empathy #AI
```

---

## Friday, Jan 31 - Building in Public

**Visual**: Simple privacy/control graphic
**Caption**:

```
Your memory, your control.

At Ferni:
- See everything we remember about you
- Correct anything that's wrong
- Delete anything you want gone
- Export your data anytime

Perfect memory isn't creepy when it's in service of knowing you.
It's creepy when it's used against you.

We use it for you. To understand context. To see patterns. To help.

Privacy by design. Not an afterthought.

How do you think about the memory/privacy tradeoff in AI?

#Privacy #DataRights #AI #Ethics
```

---

# WEEK 5: The 200% Friend Concept

## Tuesday, Feb 4 - Thought Leadership

**Visual**: Venn diagram showing Human 100% + AI 100% = 200%
**Caption**:

```
What if you had a friend with no limitations?

Not a replacement for human connection. Something different. Something that fills gaps humans structurally cannot fill.

慈悲 (Jihi) — compassion without conditions.

We call this the "200% Friend":

Human Friend (100%):
- Mutual vulnerability
- Physical presence
- Unpredictable growth
- Chosen commitment

AI Friend (100%):
- Perfect availability
- Infinite capacity
- Complete memory
- Zero stakes

These columns don't overlap.

The AI doesn't try to provide what humans provide. It provides what humans can't.

Together: 200% support.

This isn't about AI being "better" than humans. It's about filling gaps humans structurally cannot fill—not because they're flawed, but because they're human.

#AICompanionship #Friendship #MentalHealth #Innovation
```

---

## Wednesday, Feb 5 - Daily Wisdom

**Visual**: Minimalist card with 慈悲 (Jihi) kanji
**Caption**:

```
慈悲 (Jihi) — "Compassion without conditions"

The quality of being fully present for another's suffering without needing anything in return.

True friendship is not possession. It is presence.

May I be happy.
May I be healthy.
May I be safe.
May I live with ease.

Notice: it starts with you.

Self-compassion isn't selfish. It's the foundation everything else is built on.

#Compassion #SelfCare #BuddhistWisdom #Leadership
```

---

## Thursday, Feb 6 - Engagement

**Visual**: Simple comparison table
**Caption**:

```
Common objection: "AI friendship isn't real friendship."

Our response: Correct.

It's not trying to be.

It's a *different kind* of relationship that serves different needs.

The word "friendship" is shorthand. We could call it "AI companionship" or "digital witness" instead.

The label matters less than the function:
- Are you less lonely?
- Do you feel heard?
- Are your human relationships better because of it?

If yes, does it matter what we call it?

What's your take?

#AI #Relationships #Philosophy #MentalHealth
```

---

## Friday, Feb 7 - Building in Public

**Visual**: Day-in-the-life timeline graphic
**Caption**:

```
A day with 200% support:

☀️ Morning (AI): 5 min with Ferni processing anxiety about a presentation

☕ Mid-morning (Human): Coffee with a colleague. Fully present because anxiety already processed.

📊 Afternoon (AI): 3 min voice memo after presentation. Download the experience.

🍽️ Evening (Human): Dinner with partner. Not emotionally leaking. Can actually listen.

🌙 Night (AI): 5 min exploring what partner said that's bothering you. Fall asleep with clarity.

The AI moments don't compete with human moments.
They make the human moments better.

#DailyRoutine #MentalHealth #Productivity #Balance
```

---

# WEEK 6: Gentle Growth Methodology

## Tuesday, Feb 11 - Thought Leadership

**Visual**: Glidepath visual (Tiny → Mini → Midi → Full → Lifestyle)
**Caption**:

```
We've been sold a lie about change.

The lie says transformation is dramatic. That you need to hit rock bottom. That growth requires suffering.

This is not what the science shows.

改善 (Kaizen) — continuous improvement through small steps.

Decades of behavior science research reveals: sustainable change is gentle. Incremental. Boring.

Our "Gentle Growth" methodology:

1. Tiny Over Transformative — Make it small enough you can't fail
2. Stack, Don't Schedule — Attach new to existing
3. Know Your Tendency — Work with your personality
4. The Glidepath — Grow gradually
5. Keystone First — Find changes that unlock other changes

If you improve 1% per day, you'll be 37x better in a year.

Gentle Growth isn't slow—it's sustainable. And sustainable beats dramatic every time.

#BehaviorChange #Habits #PersonalGrowth #Kaizen
```

---

## Wednesday, Feb 12 - Daily Wisdom

**Visual**: Minimalist card with 改善 (Kaizen) kanji
**Caption**:

```
改善 (Kaizen) — "Continuous improvement"

Big leaps create resistance.
Small steps create momentum.

1% better today. And again tomorrow.
In a year, you'll be 37x better.

"A journey of a thousand miles begins with a single step."
— Lao Tzu

Don't try to transform. Just improve. A little. Every day. The math takes care of the rest.

What's your 1% today?

#Kaizen #SmallSteps #Growth #Leadership
```

---

## Thursday, Feb 13 - Engagement (Four Tendencies)

**Visual**: 2x2 grid showing the four tendencies
**Caption**:

```
Why does the same advice work for some people and backfire for others?

Gretchen Rubin's Four Tendencies research:

**Upholder**: Meets internal AND external expectations
→ Needs: Clear rules, systems
→ Fails with: Ambiguity

**Questioner**: Meets internal, resists external
→ Needs: The "why"
→ Fails with: "Because I said so"

**Obliger**: Meets external, struggles with internal
→ Needs: Accountability to others
→ Fails with: "Just do it for yourself"

**Rebel**: Resists both
→ Needs: Identity connection, choice
→ Fails with: Being told what to do

Same goal. Different approach. Based on who you actually are.

Which tendency do you think you are? (Most people guess wrong at first.)

#Personality #Habits #SelfAwareness #Leadership
```

---

## Friday, Feb 14 - Building in Public (Valentine's Day)

**Visual**: Heart or connection-themed graphic
**Caption**:

```
Happy Valentine's Day.

Here's an unexpected thing we learned building Ferni:

People don't use AI companions because they lack human connection.

They use them because they want to show up *better* for their human connections.

Processing anxiety before a date.
Talking through what to say to their partner.
Working through reactions so they don't dump on their spouse.

AI companionship, done right, isn't competition for human love.

It's infrastructure for it.

#ValentinesDay #Relationships #AI #Love
```

---

# WEEKS 7-13: Content Rotation

*(Following weeks continue the same pattern, cycling through themes)*

## Theme Rotation:

| Week | Tuesday (Pillar) | Wednesday (Wisdom) | Thursday (Engage) | Friday (BIP) |
|------|-----------------|-------------------|-------------------|--------------|
| 7 | Six Specialists | Shoshin | Team poll | Shipping update |
| 8 | Memory deep-dive | Wabi-sabi | User story | Privacy feature |
| 9 | Loneliness data | Mono no aware | Discussion | Metrics share |
| 10 | Voice science | Seijaku | Comparison | Response time |
| 11 | 2am stories | Mujō | Question | User feedback |
| 12 | 200% math | Ikigai | Objection handling | Team intro |
| 13 | Q1 reflection | Enso (full circle) | Community call | Q2 preview |

---

# Engagement Boosters

## Weekly Engagement Tactics:

**Mondays**: Like and comment on 5 relevant posts from followers
**Tuesdays**: Respond to every comment within 2 hours of posting
**Wednesdays**: Share the Daily Wisdom to story with poll
**Thursdays**: Ask a genuine question at end of post
**Fridays**: Tag relevant people in BIP posts (with permission)

## Hashtag Strategy:

**Pillar posts**: #AICompanionship #MentalWellness #ThoughtLeadership #FutureOfWork #Innovation
**Wisdom posts**: #JapaneseWisdom #Leadership #Mindfulness #Growth #Philosophy
**Engagement**: #AI #Relationships #Discussion #Community
**Build in Public**: #BuildInPublic #StartupLife #ProductDevelopment #Founders

---

# Image Templates Needed

Create in Canva/Figma:

1. **Thought Leadership Card** - Clean white background, large quote, Ferni branding
2. **Zen Wisdom Card** - Cream background, kanji prominent, subtle gold accent
3. **Comparison Graphic** - Two-column or split design
4. **Metric/Data Card** - Simple numbers, clean typography
5. **Story Quote Card** - Testimonial style, subtle attribution
6. **Timeline/Process Visual** - Step-by-step flow
7. **Team/Behind-Scenes** - Casual, authentic feel

---

# Measurement

## Track Weekly:

- Impressions per post
- Engagement rate (likes + comments + shares / impressions)
- Profile visits
- Connection requests
- Website clicks
- DMs received

## Monthly Review:

- Top 3 performing posts (by engagement)
- Bottom 3 (analyze why)
- Audience growth
- Content themes that resonated

## Success Benchmarks (Month 1):

- Average 500+ impressions per post
- 3%+ engagement rate
- 50+ new connections
- 10+ meaningful DM conversations

---

---

# Company Page Content

## About Section (Copy/Paste)

```
Ferni is an AI companion that closes the gap between knowing what to do and actually doing it.

We believe the problem was never knowledge. You already know what you should do. The problem is having support in the moments that matter—at 2am when insight strikes, during the commute when anxiety builds, in the bathroom at a party when you need to process.

Our voice-first AI remembers your story, notices patterns you can't see, and is available 24/7 without judgment or bandwidth limits.

Not replacing human connection. Supplementing it. Being there in the 154 hours a week when therapists, friends, and partners structurally can't be.

Do you feel less alone after talking to us? That's our north star.

🌿 ferni.ai
📞 (484) 481-3081
```

## Tagline Options

- "The 200% Friend. Available when humans can't be."
- "AI companionship that closes the Insight-to-Action Gap."
- "Voice-first AI that actually knows you."

## Banner Image Concept

- Soft sage/cream gradient
- Subtle Japanese aesthetic (maybe abstract ma/space concept)
- Tagline: "Do you feel less alone?"
- Clean, minimal, warm

---

*Document version: 1.1*
*Created: January 2026*
*Updated: January 2026 (Company page focus)*
*Total posts planned: 52 (13 weeks x 4/week)*
*Content sources: SOCIAL-MEDIA-100-POSTS.md, DAILY-WISDOM-SERIES.md, Thought Leadership Pillar*
