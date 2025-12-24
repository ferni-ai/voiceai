# Semantic Router Training Data for New Domains

> Training examples for routing user queries to new life coaching tools

---

## Overview

This document contains training examples for the semantic router to properly route user queries to the new life coaching domain tools. Each domain includes:

1. **Direct triggers** - Explicit requests for this type of help
2. **Implicit triggers** - Situations where this tool would help
3. **Negative examples** - What NOT to route here
4. **Edge cases** - Ambiguous situations with resolution notes

---

## Domain: Boundaries

### Tool: `setBoundary`

#### Direct Triggers
```json
[
  { "query": "I need to set a boundary", "confidence": 0.95 },
  { "query": "How do I say no to someone", "confidence": 0.95 },
  { "query": "Help me tell them no", "confidence": 0.90 },
  { "query": "I need to establish limits", "confidence": 0.90 },
  { "query": "How do I enforce my boundaries", "confidence": 0.90 },
  { "query": "I need scripts for saying no", "confidence": 0.90 },
  { "query": "How do I set limits with my mom", "confidence": 0.95 },
  { "query": "I need to tell my boss I can't work weekends", "confidence": 0.90 }
]
```

#### Implicit Triggers
```json
[
  { "query": "People keep taking advantage of me", "confidence": 0.85 },
  { "query": "I always say yes when I want to say no", "confidence": 0.90 },
  { "query": "My mom keeps showing up unannounced", "confidence": 0.85 },
  { "query": "They don't respect my time", "confidence": 0.85 },
  { "query": "I feel like a doormat", "confidence": 0.80 },
  { "query": "Everyone expects me to drop everything for them", "confidence": 0.85 },
  { "query": "I can't keep doing everything for everyone", "confidence": 0.85 },
  { "query": "My partner keeps going through my phone", "confidence": 0.80 },
  { "query": "My coworker keeps interrupting me", "confidence": 0.75 }
]
```

#### Negative Examples (Don't Route Here)
```json
[
  { "query": "How do I improve my relationship", "routeTo": "relationships" },
  { "query": "I'm feeling overwhelmed at work", "routeTo": "career" },
  { "query": "I need to have a difficult conversation", "routeTo": "communication" },
  { "query": "How do I ask for a raise", "routeTo": "career" }
]
```

### Tool: `identifyBoundaryNeeds`

#### Direct Triggers
```json
[
  { "query": "Do I need better boundaries", "confidence": 0.90 },
  { "query": "I don't even know what my boundaries are", "confidence": 0.95 },
  { "query": "Help me figure out what boundaries I need", "confidence": 0.95 },
  { "query": "I feel resentful but I don't know why", "confidence": 0.75 },
  { "query": "Where do I need boundaries in my life", "confidence": 0.90 }
]
```

### Tool: `recoverFromPeoplePleasing`

#### Direct Triggers
```json
[
  { "query": "I'm a people pleaser", "confidence": 0.95 },
  { "query": "I can't stop saying yes to everyone", "confidence": 0.90 },
  { "query": "I care too much what people think", "confidence": 0.85 },
  { "query": "I need approval from everyone", "confidence": 0.85 },
  { "query": "How do I stop being a people pleaser", "confidence": 0.95 },
  { "query": "I've been a people pleaser my whole life", "confidence": 0.90 }
]
```

---

## Domain: Social Skills

### Tool: `makeFriendsAsAdult`

#### Direct Triggers
```json
[
  { "query": "How do I make friends as an adult", "confidence": 0.95 },
  { "query": "I don't have any friends", "confidence": 0.85 },
  { "query": "I'm lonely and want to meet people", "confidence": 0.85 },
  { "query": "Making friends is so hard now", "confidence": 0.90 },
  { "query": "I moved to a new city and don't know anyone", "confidence": 0.90 },
  { "query": "How do adults make friends", "confidence": 0.95 },
  { "query": "All my friends are from college and we've drifted apart", "confidence": 0.85 }
]
```

#### Implicit Triggers
```json
[
  { "query": "I'm so isolated", "confidence": 0.80 },
  { "query": "I don't have anyone to hang out with", "confidence": 0.85 },
  { "query": "I wish I had a social life", "confidence": 0.85 },
  { "query": "My only friends are online", "confidence": 0.75 },
  { "query": "I don't know how to connect with people", "confidence": 0.85 },
  { "query": "I moved for work and feel alone", "confidence": 0.85 }
]
```

### Tool: `startConversation`

#### Direct Triggers
```json
[
  { "query": "How do I start a conversation", "confidence": 0.95 },
  { "query": "I never know what to say to people", "confidence": 0.90 },
  { "query": "I'm bad at small talk", "confidence": 0.85 },
  { "query": "How do I approach someone", "confidence": 0.85 },
  { "query": "What do I say to break the ice", "confidence": 0.90 },
  { "query": "I freeze up when I meet new people", "confidence": 0.80 }
]
```

### Tool: `navigateSocialAnxiety`

#### Direct Triggers
```json
[
  { "query": "I have social anxiety", "confidence": 0.95 },
  { "query": "Social situations make me anxious", "confidence": 0.95 },
  { "query": "I'm scared to go to the party", "confidence": 0.85 },
  { "query": "I get nervous around people", "confidence": 0.90 },
  { "query": "I'm dreading this networking event", "confidence": 0.85 },
  { "query": "Being around people is exhausting and scary", "confidence": 0.85 }
]
```

### Tool: `deepenAcquaintance`

#### Direct Triggers
```json
[
  { "query": "How do I go from acquaintance to friend", "confidence": 0.95 },
  { "query": "I have lots of acquaintances but no close friends", "confidence": 0.90 },
  { "query": "How do I deepen a friendship", "confidence": 0.90 },
  { "query": "I want to get closer to this person", "confidence": 0.80 },
  { "query": "How do I turn a coworker into a friend", "confidence": 0.85 }
]
```

---

## Domain: Body Relationship

### Tool: `exploreBodyImage`

#### Direct Triggers
```json
[
  { "query": "I hate my body", "confidence": 0.95 },
  { "query": "I have body image issues", "confidence": 0.95 },
  { "query": "I can't look at myself in the mirror", "confidence": 0.90 },
  { "query": "I feel ugly", "confidence": 0.85 },
  { "query": "I'm disgusted by my body", "confidence": 0.90 },
  { "query": "I would change everything about how I look", "confidence": 0.85 },
  { "query": "I'm so self conscious about my body", "confidence": 0.90 }
]
```

#### Implicit Triggers
```json
[
  { "query": "I can't wear that", "confidence": 0.70 },
  { "query": "I avoid photos", "confidence": 0.75 },
  { "query": "I compare myself to everyone", "confidence": 0.80 },
  { "query": "I can't go to the beach or pool", "confidence": 0.80 },
  { "query": "I check myself constantly", "confidence": 0.75 }
]
```

### Tool: `healDietCulture`

#### Direct Triggers
```json
[
  { "query": "I'm always on a diet", "confidence": 0.85 },
  { "query": "I feel guilty when I eat", "confidence": 0.90 },
  { "query": "I think of food as good and bad", "confidence": 0.90 },
  { "query": "I need to lose weight", "confidence": 0.80 },
  { "query": "I've tried every diet", "confidence": 0.85 },
  { "query": "I hate that I can't stick to a diet", "confidence": 0.85 }
]
```

### Tool: `intuitiveEatingSupport`

#### Direct Triggers
```json
[
  { "query": "What is intuitive eating", "confidence": 0.95 },
  { "query": "I want to eat intuitively", "confidence": 0.95 },
  { "query": "I can't tell when I'm hungry or full", "confidence": 0.90 },
  { "query": "How do I trust my body around food", "confidence": 0.90 },
  { "query": "I want to make peace with food", "confidence": 0.90 }
]
```

---

## Domain: Anger

### Tool: `understandAnger`

#### Direct Triggers
```json
[
  { "query": "Why do I get so angry", "confidence": 0.95 },
  { "query": "I have anger issues", "confidence": 0.95 },
  { "query": "I'm an angry person", "confidence": 0.90 },
  { "query": "My anger is out of control", "confidence": 0.90 },
  { "query": "I don't understand my anger", "confidence": 0.95 },
  { "query": "Is it okay to be angry", "confidence": 0.85 }
]
```

### Tool: `angerInTheMoment`

#### Direct Triggers
```json
[
  { "query": "I'm so angry right now", "confidence": 0.95 },
  { "query": "I need to calm down", "confidence": 0.85 },
  { "query": "I'm about to explode", "confidence": 0.90 },
  { "query": "Help me not lose it", "confidence": 0.90 },
  { "query": "I'm seeing red", "confidence": 0.90 },
  { "query": "I need to calm down before I say something I regret", "confidence": 0.90 }
]
```

### Tool: `expressAngerHealthily`

#### Direct Triggers
```json
[
  { "query": "How do I express anger without being destructive", "confidence": 0.95 },
  { "query": "I either explode or bottle it up", "confidence": 0.90 },
  { "query": "How do I tell them I'm angry", "confidence": 0.85 },
  { "query": "I want to communicate my anger better", "confidence": 0.90 },
  { "query": "How do I be assertive not aggressive", "confidence": 0.90 }
]
```

### Tool: `repairAfterAnger`

#### Direct Triggers
```json
[
  { "query": "I blew up at them and I feel terrible", "confidence": 0.95 },
  { "query": "I said things I didn't mean when I was angry", "confidence": 0.90 },
  { "query": "How do I apologize after an outburst", "confidence": 0.90 },
  { "query": "I scared them with my anger", "confidence": 0.85 },
  { "query": "I lost my temper and hurt someone", "confidence": 0.85 }
]
```

---

## Domain: Dating

### Tool: `datingReadinessAssessment`

#### Direct Triggers
```json
[
  { "query": "Am I ready to date again", "confidence": 0.95 },
  { "query": "Should I start dating", "confidence": 0.90 },
  { "query": "I don't know if I'm ready for a relationship", "confidence": 0.85 },
  { "query": "How do I know if I've healed enough to date", "confidence": 0.90 },
  { "query": "My friends say I should date but I'm not sure", "confidence": 0.80 }
]
```

### Tool: `navigateOnlineDating`

#### Direct Triggers
```json
[
  { "query": "Online dating is exhausting", "confidence": 0.90 },
  { "query": "I hate the apps", "confidence": 0.85 },
  { "query": "Help me with my dating profile", "confidence": 0.90 },
  { "query": "I'm getting burned out on dating apps", "confidence": 0.90 },
  { "query": "No one matches with me", "confidence": 0.80 },
  { "query": "How do I use dating apps better", "confidence": 0.95 }
]
```

### Tool: `identifyRedFlags`

#### Direct Triggers
```json
[
  { "query": "Is this a red flag", "confidence": 0.95 },
  { "query": "What are the warning signs I should look for", "confidence": 0.90 },
  { "query": "They did something weird and I'm not sure if it's a problem", "confidence": 0.85 },
  { "query": "How do I know if they're bad news", "confidence": 0.85 },
  { "query": "Red flags in dating", "confidence": 0.95 },
  { "query": "They say they love me after one week", "confidence": 0.80 }
]
```

### Tool: `firstDatePrep`

#### Direct Triggers
```json
[
  { "query": "I have a first date and I'm nervous", "confidence": 0.95 },
  { "query": "How do I prepare for a first date", "confidence": 0.95 },
  { "query": "What should I talk about on a first date", "confidence": 0.90 },
  { "query": "First date tips", "confidence": 0.95 },
  { "query": "I have a date tomorrow", "confidence": 0.85 }
]
```

### Tool: `handleRejection`

#### Direct Triggers
```json
[
  { "query": "They ghosted me", "confidence": 0.85 },
  { "query": "I got rejected and it hurts", "confidence": 0.90 },
  { "query": "They said they're not interested", "confidence": 0.85 },
  { "query": "How do I handle dating rejection", "confidence": 0.95 },
  { "query": "I keep getting rejected", "confidence": 0.90 }
]
```

---

## Domain: Neurodiversity

### Tool: `adhdDailyStrategies`

#### Direct Triggers
```json
[
  { "query": "I have ADHD and I'm struggling", "confidence": 0.95 },
  { "query": "ADHD tips", "confidence": 0.95 },
  { "query": "How do I manage my ADHD", "confidence": 0.95 },
  { "query": "My ADHD is making everything hard", "confidence": 0.90 },
  { "query": "I think I have ADHD", "confidence": 0.80 },
  { "query": "Strategies for ADHD", "confidence": 0.95 }
]
```

#### Implicit Triggers
```json
[
  { "query": "I can't focus on anything", "confidence": 0.70 },
  { "query": "I start things but never finish", "confidence": 0.70 },
  { "query": "I have a million tabs open", "confidence": 0.60 },
  { "query": "I can't remember anything", "confidence": 0.60 },
  { "query": "I'm always running late", "confidence": 0.60 }
]
```

### Tool: `executiveFunctionSupport`

#### Direct Triggers
```json
[
  { "query": "I can't get started on anything", "confidence": 0.85 },
  { "query": "I know what to do but can't make myself do it", "confidence": 0.90 },
  { "query": "My executive function is broken", "confidence": 0.95 },
  { "query": "I can't plan or organize", "confidence": 0.80 },
  { "query": "Task paralysis", "confidence": 0.90 }
]
```

### Tool: `autismSocialSupport`

#### Direct Triggers
```json
[
  { "query": "I'm autistic and social stuff is hard", "confidence": 0.95 },
  { "query": "Autism and socializing", "confidence": 0.95 },
  { "query": "I don't understand social cues", "confidence": 0.80 },
  { "query": "Being autistic in neurotypical spaces", "confidence": 0.90 },
  { "query": "I mask too much", "confidence": 0.75 }
]
```

### Tool: `sensorySupport`

#### Direct Triggers
```json
[
  { "query": "I'm overwhelmed by sensory input", "confidence": 0.95 },
  { "query": "Everything is too loud and bright", "confidence": 0.90 },
  { "query": "Sensory overload", "confidence": 0.95 },
  { "query": "Certain textures make me crazy", "confidence": 0.85 },
  { "query": "I need to manage sensory overwhelm", "confidence": 0.95 }
]
```

---

## Domain: Trauma Support

### Tool: `triggerManagement`

#### Direct Triggers
```json
[
  { "query": "I got triggered", "confidence": 0.95 },
  { "query": "Something triggered me", "confidence": 0.95 },
  { "query": "How do I handle triggers", "confidence": 0.95 },
  { "query": "I keep getting triggered", "confidence": 0.90 },
  { "query": "That reminded me of my trauma", "confidence": 0.85 }
]
```

### Tool: `nervousSystemRegulation`

#### Direct Triggers
```json
[
  { "query": "My nervous system is dysregulated", "confidence": 0.95 },
  { "query": "I'm stuck in fight or flight", "confidence": 0.90 },
  { "query": "I can't calm down", "confidence": 0.80 },
  { "query": "I feel activated", "confidence": 0.85 },
  { "query": "How do I regulate my nervous system", "confidence": 0.95 },
  { "query": "I'm hypervigilant all the time", "confidence": 0.85 }
]
```

### Tool: `windowOfTolerance`

#### Direct Triggers
```json
[
  { "query": "I'm outside my window of tolerance", "confidence": 0.95 },
  { "query": "What is the window of tolerance", "confidence": 0.95 },
  { "query": "I'm either shut down or freaking out", "confidence": 0.85 },
  { "query": "How do I expand my capacity to handle stress", "confidence": 0.80 }
]
```

---

## Domain: Procrastination

### Tool: `procrastinationRootCause`

#### Direct Triggers
```json
[
  { "query": "Why do I procrastinate so much", "confidence": 0.95 },
  { "query": "I'm a chronic procrastinator", "confidence": 0.95 },
  { "query": "I always wait until the last minute", "confidence": 0.90 },
  { "query": "I can't stop procrastinating", "confidence": 0.95 },
  { "query": "What's wrong with me that I can't just do things", "confidence": 0.80 }
]
```

### Tool: `getStarted`

#### Direct Triggers
```json
[
  { "query": "I can't get started", "confidence": 0.90 },
  { "query": "Help me start this task", "confidence": 0.90 },
  { "query": "I've been putting this off", "confidence": 0.85 },
  { "query": "I keep avoiding this thing", "confidence": 0.85 },
  { "query": "Just help me begin", "confidence": 0.90 }
]
```

### Tool: `emotionalProcrastination`

#### Direct Triggers
```json
[
  { "query": "I'm avoiding this because it stresses me out", "confidence": 0.90 },
  { "query": "I procrastinate because of anxiety", "confidence": 0.90 },
  { "query": "The task makes me feel bad so I avoid it", "confidence": 0.90 },
  { "query": "I'm procrastinating because I'm scared", "confidence": 0.85 }
]
```

---

## Domain: Digital Wellness

### Tool: `assessDigitalHealth`

#### Direct Triggers
```json
[
  { "query": "I'm addicted to my phone", "confidence": 0.95 },
  { "query": "I spend too much time online", "confidence": 0.90 },
  { "query": "Am I addicted to social media", "confidence": 0.90 },
  { "query": "How's my digital health", "confidence": 0.95 },
  { "query": "I can't put my phone down", "confidence": 0.90 }
]
```

### Tool: `socialMediaImpact`

#### Direct Triggers
```json
[
  { "query": "Social media makes me feel bad", "confidence": 0.95 },
  { "query": "Instagram makes me depressed", "confidence": 0.90 },
  { "query": "I compare myself to everyone online", "confidence": 0.90 },
  { "query": "I feel worse after scrolling", "confidence": 0.90 },
  { "query": "Social media is toxic for me", "confidence": 0.90 }
]
```

### Tool: `digitalBoundaries`

#### Direct Triggers
```json
[
  { "query": "I need to set limits on screen time", "confidence": 0.95 },
  { "query": "I check my phone constantly", "confidence": 0.85 },
  { "query": "I need digital boundaries", "confidence": 0.95 },
  { "query": "How do I use my phone less", "confidence": 0.90 },
  { "query": "I'm on my phone from morning to night", "confidence": 0.85 }
]
```

---

## Domain: Perfectionism

### Tool: `perfectionismAwareness`

#### Direct Triggers
```json
[
  { "query": "I'm a perfectionist", "confidence": 0.95 },
  { "query": "My perfectionism is hurting me", "confidence": 0.95 },
  { "query": "I can't do anything unless it's perfect", "confidence": 0.90 },
  { "query": "Good enough is never good enough for me", "confidence": 0.90 },
  { "query": "I have unrealistic standards", "confidence": 0.85 }
]
```

### Tool: `imposterSyndromeSupport`

#### Direct Triggers
```json
[
  { "query": "I feel like a fraud", "confidence": 0.95 },
  { "query": "I have imposter syndrome", "confidence": 0.95 },
  { "query": "I don't deserve my success", "confidence": 0.90 },
  { "query": "They're going to find out I don't know what I'm doing", "confidence": 0.90 },
  { "query": "I feel like I'm faking it", "confidence": 0.85 },
  { "query": "I got lucky, I'm not actually good", "confidence": 0.85 }
]
```

### Tool: `goodEnoughPractice`

#### Direct Triggers
```json
[
  { "query": "How do I accept good enough", "confidence": 0.95 },
  { "query": "I need to lower my standards", "confidence": 0.85 },
  { "query": "Done is better than perfect", "confidence": 0.80 },
  { "query": "How do I stop perfectionism", "confidence": 0.90 },
  { "query": "I can't let go of things being perfect", "confidence": 0.90 }
]
```

---

## Edge Cases & Disambiguation

### Boundaries vs. Communication

```json
[
  {
    "query": "How do I tell my mom I can't come to dinner",
    "analysis": "If ongoing pattern of demands → boundaries. If one-time difficult message → communication.",
    "routing": "Ask clarifying question first"
  },
  {
    "query": "I need to have a hard conversation",
    "analysis": "Could be boundary-setting OR general difficult conversation",
    "routing": "Route to communication by default, let it chain to boundaries if needed"
  }
]
```

### Anger vs. Crisis

```json
[
  {
    "query": "I'm so angry I could hurt someone",
    "analysis": "Check for actual violence risk",
    "routing": "angerInTheMoment, but with crisis safety check"
  },
  {
    "query": "I want to punch them",
    "analysis": "Likely figurative but assess",
    "routing": "angerInTheMoment with safety validation"
  }
]
```

### Social Skills vs. Social Anxiety

```json
[
  {
    "query": "I don't know how to talk to people",
    "analysis": "Skills deficit vs. anxiety preventing use of skills",
    "routing": "Start with skills, pivot to anxiety if that emerges"
  },
  {
    "query": "Parties are hard for me",
    "analysis": "Could be introversion, anxiety, or skills",
    "routing": "Ask what makes it hard"
  }
]
```

### Dating vs. Relationships

```json
[
  {
    "query": "My relationship is struggling",
    "analysis": "Existing relationship → relationships domain",
    "routing": "relationships, not dating"
  },
  {
    "query": "We just started dating and I'm not sure",
    "analysis": "New/forming → dating domain",
    "routing": "dating (paceNewRelationship)"
  }
]
```

### Body Image vs. Eating Disorder

```json
[
  {
    "query": "I can't eat in front of people",
    "analysis": "Social anxiety OR disordered eating",
    "routing": "Explore gently, refer if ED indicators present"
  },
  {
    "query": "I've been restricting my food",
    "analysis": "Potential ED red flag",
    "routing": "Crisis path - gentle referral to ED resources"
  }
]
```

---

## Confidence Calibration Guide

| Confidence | Meaning | Action |
|------------|---------|--------|
| 0.95+ | Near certain match | Route directly |
| 0.85-0.94 | Strong match | Route with validation |
| 0.70-0.84 | Probable match | Route, ready to pivot |
| 0.50-0.69 | Uncertain | Ask clarifying question |
| <0.50 | Unlikely match | Consider other domains |

---

## Multi-Domain Queries

Some queries span multiple domains. Routing strategy:

```json
[
  {
    "query": "I'm anxious about dating because of my body image",
    "domains": ["dating", "body-relationship"],
    "primary": "body-relationship",
    "reason": "Address root issue (body image) before situational (dating)"
  },
  {
    "query": "I procrastinate because I'm a perfectionist",
    "domains": ["procrastination", "perfectionism"],
    "primary": "perfectionism",
    "reason": "Perfectionism is the driver, procrastination is the symptom"
  },
  {
    "query": "My ADHD makes social situations hard",
    "domains": ["neurodiversity", "social-skills"],
    "primary": "neurodiversity",
    "reason": "ADHD-specific strategies more appropriate than generic social skills"
  }
]
```

---

*Last updated: [Date]*
*Review frequency: Monthly*
*Owner: Semantic Routing Team*

