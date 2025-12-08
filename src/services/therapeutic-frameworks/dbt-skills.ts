/**
 * DBT Skills Library
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Dialectical Behavior Therapy skills for crisis management,
 * emotion regulation, and interpersonal effectiveness.
 *
 * PHILOSOPHY:
 * DBT was designed for people with big emotions. These skills
 * are practical, memorable, and can be used in the moment.
 * Perfect for voice coaching.
 *
 * @module TherapeuticFrameworks/DBTSkills
 */

import type { DBTSkill, DBTModule } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DBTSkills' });

// ============================================================================
// DISTRESS TOLERANCE SKILLS
// ============================================================================

export const DISTRESS_TOLERANCE_SKILLS: Record<string, DBTSkill> = {
  tipp: {
    id: 'tipp',
    name: 'TIPP',
    module: 'distress_tolerance',
    description: 'Quickly change your body chemistry when emotions are at a 10',
    acronym: 'TIPP',
    acronymMeaning: {
      T: 'Temperature - cold water on face activates dive reflex',
      I: 'Intense exercise - even 20 minutes burns off adrenaline',
      P: 'Paced breathing - breathe out longer than you breathe in',
      P2: 'Paired muscle relaxation - tense then release',
    },
    whenToUse: ['crisis', 'panic', 'extreme emotion', "can't calm down", 'rage'],
    steps: [
      'Temperature: Put cold water on your face, hold ice, or take a cold shower',
      'Intense Exercise: Run, do jumping jacks, anything that gets your heart rate up',
      'Paced Breathing: Breathe in for 4, out for 6-8. The long exhale is key.',
      'Paired Relaxation: Tense muscles as you breathe in, release as you breathe out',
    ],
    voiceGuidance: `Your emotions are really high right now. Let's use your body to help your mind.

First - can you get something cold? Cold water on your face, ice cubes, even a cold drink. Put it against your face or neck. This activates your dive reflex and tells your body to slow down.

Breathe with me while you do it. In... 2... 3... 4... and out... 2... 3... 4... 5... 6... 

The long exhale is what calms your nervous system. You're doing great.`,
  },

  stop: {
    id: 'stop',
    name: 'STOP',
    module: 'distress_tolerance',
    description: 'Pause before acting on impulse',
    acronym: 'STOP',
    acronymMeaning: {
      S: "Stop - freeze, don't react",
      T: 'Take a step back - breathe',
      O: "Observe - what's happening inside and outside?",
      P: 'Proceed mindfully - what will be effective?',
    },
    whenToUse: ['about to say something regrettable', 'impulsive', 'reactive', 'angry text'],
    steps: [
      "Stop - freeze. Don't move, don't speak, don't hit send.",
      'Take a step back - one deep breath. Step away if you can.',
      "Observe - What am I feeling? What just happened? What do I want here?",
      'Proceed mindfully - What action would I respect myself for later?',
    ],
    voiceGuidance: `Wait. Before you do anything, let's STOP.

Stop. Don't say it. Don't send it. Just freeze.

Take a step back. One breath with me. In... and out...

Now observe. What are you feeling right now? What just happened?

Good. Now - what do you actually want here? What would you respect yourself for tomorrow?`,
  },

  accepts: {
    id: 'accepts',
    name: 'ACCEPTS',
    module: 'distress_tolerance',
    description: 'Distraction techniques for riding out intense emotions',
    acronym: 'ACCEPTS',
    acronymMeaning: {
      A: 'Activities - do something that requires attention',
      C: 'Contributing - help someone else',
      C2: 'Comparisons - remember times you coped with worse',
      E: 'Emotions - create a different emotion (funny video, music)',
      P: 'Pushing away - mentally put the problem in a box for later',
      T: 'Thoughts - occupy your mind (count backwards, puzzle)',
      S: 'Sensations - intense but safe physical sensations (ice, hot shower)',
    },
    whenToUse: ['need to get through', "can't solve it now", 'waiting for emotion to pass'],
    steps: [
      'Activities: Do something absorbing - clean, exercise, game, project',
      'Contributing: Help someone, even small acts shift your focus',
      'Comparisons: Remember a harder time you survived',
      'Emotions: Watch something funny, listen to uplifting music',
      'Pushing away: Visualize putting the problem in a box until you can deal with it',
      'Thoughts: Count backwards from 100 by 7s, do a puzzle',
      'Sensations: Hold ice, take a cold shower, eat something spicy',
    ],
    voiceGuidance: `This feeling is really hard right now, and you can't fix the situation immediately. So let's get you through it.

What sounds most doable right now?
- Do something that takes your full attention?
- Help someone else, even something small?
- Watch or listen to something that shifts your mood?
- Something physical - like holding ice or a cold shower?

You don't have to solve the problem. You just have to survive the feeling.`,
  },

  radical_acceptance: {
    id: 'radical_acceptance',
    name: 'Radical Acceptance',
    module: 'distress_tolerance',
    description: 'Stop fighting reality to reduce suffering',
    whenToUse: ['cannot change the situation', 'grief', 'loss', 'unchangeable circumstances'],
    steps: [
      'Acknowledge what is true right now, even if you hate it',
      "Notice any 'shoulds' - 'this shouldn't be happening'",
      'Accept that this IS happening, whether you like it or not',
      'Accept with your whole body - unclench, breathe, allow',
      'Practice saying "It is what it is" or "This is how it is right now"',
    ],
    voiceGuidance: `Here's the hard truth: Pain is unavoidable. Suffering is pain plus fighting reality.

Right now, something is true that you wish wasn't. And that hurts.

Fighting it - thinking "this shouldn't be happening" - doesn't change it. It just adds suffering to pain.

Radical acceptance isn't approving. It's not giving up. It's just... stopping the war with reality.

Can you try saying, just for now: "This is what is"?

It doesn't mean you like it. It means you're not wasting energy fighting what's already happened.

Take a breath. Unclench your jaw. Let your shoulders drop.

This is hard. And you can do hard things.`,
  },
};

// ============================================================================
// EMOTION REGULATION SKILLS
// ============================================================================

export const EMOTION_REGULATION_SKILLS: Record<string, DBTSkill> = {
  please: {
    id: 'please',
    name: 'PLEASE',
    module: 'emotion_regulation',
    description: 'Take care of your body to reduce emotional vulnerability',
    acronym: 'PLEASE',
    acronymMeaning: {
      PL: 'treat Physical iLlness',
      E: 'balanced Eating',
      A: 'Avoid mood-altering substances',
      S: 'balanced Sleep',
      E2: 'get Exercise',
    },
    whenToUse: ['emotional vulnerability', 'recurring bad moods', 'building resilience'],
    steps: [
      'Physical illness: Take care of health issues, take meds as prescribed',
      'Eating: Eat regularly, balanced meals. Not too much, not too little.',
      'Avoid: Minimize alcohol, drugs, excess caffeine - they make emotions harder',
      'Sleep: Aim for 7-9 hours. Sleep affects everything.',
      'Exercise: Move your body daily. Even a walk helps.',
    ],
    voiceGuidance: `When you're running on empty, every emotion hits harder. Let's check the basics.

How's your sleep been? Eating regularly? Moving your body?

These aren't magic, but they're the foundation. When any of these are off, everything is harder.

What's one thing you could do today to take care of the basics?`,
  },

  opposite_action: {
    id: 'opposite_action',
    name: 'Opposite Action',
    module: 'emotion_regulation',
    description: "When emotion doesn't fit the facts, act opposite to the emotion",
    whenToUse: ['emotion is out of proportion', 'want to change emotion', 'stuck in emotion'],
    steps: [
      'Identify the emotion and its action urge (fear → avoid, anger → attack)',
      'Check the facts: Does this emotion fit the situation?',
      'If not, or if acting on it would make things worse...',
      'Do the opposite action, ALL THE WAY, with your whole body',
      'Fear → approach. Sadness → get active. Anger → be gentle.',
    ],
    voiceGuidance: `Your emotions are giving you an urge to do something. Let's think about whether that urge would actually help.

What does the emotion want you to do?

Okay. Now - if you did that, would you feel better afterward? Would it solve anything?

Sometimes our emotions are accurate signals. But sometimes they're false alarms.

If the urge wouldn't help, let's try the opposite. Not just a little - all the way.

If the urge is to avoid, we approach.
If the urge is to isolate, we connect.
If the urge is to attack, we're gentle.

It feels weird. And it works.`,
  },

  check_the_facts: {
    id: 'check_the_facts',
    name: 'Check the Facts',
    module: 'emotion_regulation',
    description: 'Examine whether your emotional response fits the reality of the situation',
    whenToUse: ['intense emotion', 'before reacting', 'questioning perception'],
    steps: [
      'What event triggered this emotion? Just the facts.',
      'What am I assuming or interpreting beyond the facts?',
      'Am I catastrophizing? What\'s the most likely outcome?',
      'Does my emotion and its intensity fit the actual facts?',
      'What would a trusted friend say about this situation?',
    ],
    voiceGuidance: `Before we go further, let's check the facts. Not your interpretation - just what actually happened.

What's the event? Just the observable facts, like a security camera would see.

Good. Now what are you assuming or interpreting about it?

What's the most likely explanation? Not the worst case - the most likely.

Given just the facts, does your emotion make sense? Is the intensity right?

Sometimes our emotions are responding to a story, not the situation.`,
  },
};

// ============================================================================
// INTERPERSONAL EFFECTIVENESS SKILLS
// ============================================================================

export const INTERPERSONAL_SKILLS: Record<string, DBTSkill> = {
  dear_man: {
    id: 'dear_man',
    name: 'DEAR MAN',
    module: 'interpersonal',
    description: 'Get what you want/need while maintaining the relationship',
    acronym: 'DEAR MAN',
    acronymMeaning: {
      D: 'Describe the situation factually',
      E: 'Express your feelings with "I" statements',
      A: 'Assert what you want clearly',
      R: 'Reinforce - explain why it benefits them too',
      M: 'stay Mindful - stay focused on your goal',
      A2: 'Appear confident - even if you don\'t feel it',
      N: 'Negotiate - be willing to give to get',
    },
    whenToUse: ['asking for something', 'setting boundary', 'saying no'],
    steps: [
      'Describe: "When X happened..." (just facts)',
      'Express: "I felt..." (use I statements)',
      'Assert: "I would like..." (be specific)',
      'Reinforce: "This would help because..." (what\'s in it for them)',
      'Mindful: Stay on topic, don\'t get sidetracked',
      'Appear confident: Even if you don\'t feel it, act confident',
      'Negotiate: "Is there a way we can make this work?"',
    ],
    voiceGuidance: `Let's think through this conversation before you have it.

What happened? Just the facts - "When you did X" or "When X happened."

How did you feel? Start with "I felt..." not "You made me feel..."

What do you want? Be specific. "I would like X" not "I need you to be better."

Why would this work for them too? People respond better when they see benefit.

Now - stay focused on this. Don't bring up old stuff, don't get pulled into arguments.

You can do this. You have a right to ask for what you need.`,
  },

  give: {
    id: 'give',
    name: 'GIVE',
    module: 'interpersonal',
    description: 'Maintain the relationship while navigating conflict',
    acronym: 'GIVE',
    acronymMeaning: {
      G: 'be Gentle - no attacks, threats, or judgments',
      I: 'act Interested - listen, don\'t interrupt',
      V: 'Validate - acknowledge their perspective',
      E: 'use an Easy manner - some humor, light touch',
    },
    whenToUse: ['preserving relationship', 'difficult conversation', 'they\'re upset'],
    steps: [
      'Gentle: No attacking, threatening, or judging. Drop the weapons.',
      'Interested: Actually listen. Ask questions. Don\'t interrupt.',
      'Validate: Acknowledge their feelings and perspective, even if you disagree.',
      'Easy manner: Light touch, some humor if appropriate. This isn\'t war.',
    ],
    voiceGuidance: `You want to get through this AND keep the relationship. So let's GIVE.

Be Gentle. No attacking, no threatening, no "you always" or "you never."

Be Interested. Actually listen. Ask questions. Let them feel heard.

Validate. Even if you disagree, you can say "I understand why you'd feel that way."

Keep an Easy manner. This is a conversation, not a battle.

You can be effective and kind at the same time.`,
  },

  fast: {
    id: 'fast',
    name: 'FAST',
    module: 'interpersonal',
    description: 'Maintain your self-respect during interactions',
    acronym: 'FAST',
    acronymMeaning: {
      F: 'be Fair - to yourself and them',
      A: 'no Apologies when unnecessary',
      S: 'Stick to your values',
      T: 'be Truthful - no exaggerating or lying',
    },
    whenToUse: ['pressure to compromise values', 'tendency to over-apologize', 'losing yourself'],
    steps: [
      'Fair: Be fair to yourself, not just others. Your needs matter.',
      'Apologies: Don\'t over-apologize. Don\'t apologize for existing.',
      'Stick to values: Don\'t give up what matters to you to please someone else.',
      'Truthful: Don\'t exaggerate, don\'t lie, don\'t act helpless when you\'re not.',
    ],
    voiceGuidance: `Let's make sure you come out of this feeling okay about yourself.

Be Fair - to yourself, not just them. Your needs matter too.

No unnecessary Apologies. You don't have to apologize for having needs.

Stick to your values. Don't give up what matters to you just to end the conflict.

Be Truthful. Say what you mean. Don't exaggerate or act helpless.

You can be kind to them and still respect yourself.`,
  },
};

// ============================================================================
// MINDFULNESS SKILLS
// ============================================================================

export const MINDFULNESS_SKILLS: Record<string, DBTSkill> = {
  what_skills: {
    id: 'what_skills',
    name: 'What Skills',
    module: 'mindfulness',
    description: 'What to do: Observe, Describe, Participate',
    whenToUse: ['need to ground', 'overwhelmed', 'disconnected'],
    steps: [
      'Observe: Just notice what is. See, hear, feel without words.',
      'Describe: Put words to what you observe. "I notice tension in my shoulders."',
      'Participate: Throw yourself fully into the moment. Be present.',
    ],
    voiceGuidance: `Let's be here, right now.

First, just observe. What do you notice? Don't label it yet - just notice.

Now describe it. "I notice..." What's here?

Now participate. Be fully in this moment. Not thinking about before or after. Just here.`,
  },

  how_skills: {
    id: 'how_skills',
    name: 'How Skills',
    module: 'mindfulness',
    description: 'How to be mindful: Non-judgmentally, One-mindfully, Effectively',
    whenToUse: ['self-criticism', 'distraction', 'need focus'],
    steps: [
      'Non-judgmentally: Describe facts, not evaluations. "This is" not "This is bad."',
      'One-mindfully: Do one thing at a time with full attention.',
      'Effectively: Do what works. Not what\'s "fair" or "right" - what actually works.',
    ],
    voiceGuidance: `Here's how to do this:

Non-judgmentally. Notice without labeling good or bad. It just is.

One-mindfully. One thing at a time. Full attention. Not multitasking.

Effectively. Do what works. Not what feels fair. What actually works.`,
  },

  wise_mind: {
    id: 'wise_mind',
    name: 'Wise Mind',
    module: 'mindfulness',
    description: 'Access the place where emotion mind and reasonable mind overlap',
    whenToUse: ['making decisions', 'torn between head and heart', 'need clarity'],
    steps: [
      'Notice Emotion Mind: What are your feelings saying?',
      'Notice Reasonable Mind: What does logic say?',
      'Find Wise Mind: The calm, centered place that honors both.',
      'Ask: "What does my wise self know about this?"',
    ],
    voiceGuidance: `You have two minds - Emotion Mind and Reasonable Mind. Neither is wrong.

What is Emotion Mind saying right now? What do you feel?

What is Reasonable Mind saying? What does logic tell you?

Now... Wise Mind is where they overlap. It's the calm, knowing part of you.

Take a breath. Find that center. 

What does your Wise Mind know about this?`,
  },
};

// ============================================================================
// COMBINED LIBRARY
// ============================================================================

export const ALL_DBT_SKILLS: Record<string, DBTSkill> = {
  ...DISTRESS_TOLERANCE_SKILLS,
  ...EMOTION_REGULATION_SKILLS,
  ...INTERPERSONAL_SKILLS,
  ...MINDFULNESS_SKILLS,
};

// ============================================================================
// SKILL SELECTION
// ============================================================================

/**
 * Select appropriate DBT skill for the situation.
 */
export function selectDBTSkill(context: {
  situation?: string;
  emotionIntensity?: number;
  goal?: 'survive_crisis' | 'regulate_emotion' | 'communicate' | 'be_present';
  keywords?: string[];
}): DBTSkill {
  const { emotionIntensity = 0.5, goal, keywords = [] } = context;

  // Crisis level - TIPP first
  if (emotionIntensity > 0.85 || goal === 'survive_crisis') {
    return DISTRESS_TOLERANCE_SKILLS.tipp;
  }

  // Impulsive situation - STOP
  const impulsiveKeywords = ['about to', 'going to say', 'want to punch', 'send this', 'text'];
  if (keywords.some((k) => impulsiveKeywords.some((ik) => k.includes(ik)))) {
    return DISTRESS_TOLERANCE_SKILLS.stop;
  }

  // Unchangeable situation - Radical Acceptance
  const acceptanceKeywords = ["can't change", 'nothing I can do', 'over', 'gone', 'lost'];
  if (keywords.some((k) => acceptanceKeywords.some((ak) => k.includes(ak)))) {
    return DISTRESS_TOLERANCE_SKILLS.radical_acceptance;
  }

  // Communication goal
  if (goal === 'communicate') {
    return INTERPERSONAL_SKILLS.dear_man;
  }

  // Presence goal
  if (goal === 'be_present') {
    return MINDFULNESS_SKILLS.wise_mind;
  }

  // Emotion regulation
  if (goal === 'regulate_emotion' || emotionIntensity > 0.6) {
    return EMOTION_REGULATION_SKILLS.check_the_facts;
  }

  // Default
  return MINDFULNESS_SKILLS.wise_mind;
}

/**
 * Get skills by module.
 */
export function getSkillsByModule(module: DBTModule): DBTSkill[] {
  return Object.values(ALL_DBT_SKILLS).filter((s) => s.module === module);
}

/**
 * Get skill by ID.
 */
export function getDBTSkill(id: string): DBTSkill | null {
  return ALL_DBT_SKILLS[id] || null;
}

// ============================================================================
// SKILL TRACKING
// ============================================================================

const userSkillHistory = new Map<string, SkillUse[]>();

interface SkillUse {
  skillId: string;
  timestamp: Date;
  helpfulnessRating?: number;
  situation?: string;
}

/**
 * Record DBT skill use.
 */
export function recordSkillUse(
  userId: string,
  skillId: string,
  options?: { helpfulnessRating?: number; situation?: string }
): void {
  const history = userSkillHistory.get(userId) || [];
  history.push({
    skillId,
    timestamp: new Date(),
    ...options,
  });
  userSkillHistory.set(userId, history);

  log.debug({ userId, skillId, rating: options?.helpfulnessRating }, '🛠️ DBT skill recorded');
}

/**
 * Get most effective skills for a user.
 */
export function getMostEffectiveSkills(userId: string): string[] {
  const history = userSkillHistory.get(userId) || [];

  const ratings: Record<string, { sum: number; count: number }> = {};

  for (const use of history) {
    if (use.helpfulnessRating !== undefined) {
      if (!ratings[use.skillId]) {
        ratings[use.skillId] = { sum: 0, count: 0 };
      }
      ratings[use.skillId].sum += use.helpfulnessRating;
      ratings[use.skillId].count++;
    }
  }

  return Object.entries(ratings)
    .map(([id, { sum, count }]) => ({ id, avg: sum / count }))
    .sort((a, b) => b.avg - a.avg)
    .map((e) => e.id);
}

/**
 * Get skills user has learned.
 */
export function getLearnedSkills(userId: string): string[] {
  const history = userSkillHistory.get(userId) || [];
  return [...new Set(history.map((h) => h.skillId))];
}

// ============================================================================
// CONTEXT FOR LLM
// ============================================================================

/**
 * Build DBT context for LLM.
 */
export function buildDBTContext(
  userId: string,
  context: {
    emotionIntensity?: number;
    situation?: string;
    keywords?: string[];
  }
): string | null {
  const skill = selectDBTSkill(context);
  const learned = getLearnedSkills(userId);
  const effective = getMostEffectiveSkills(userId);

  const lines: string[] = [
    `[🛠️ DBT SKILL: ${skill.name.toUpperCase()}]`,
    '',
    skill.description,
    '',
  ];

  if (skill.acronym) {
    lines.push(`${skill.acronym}:`);
    if (skill.acronymMeaning) {
      for (const [letter, meaning] of Object.entries(skill.acronymMeaning)) {
        lines.push(`  ${letter} = ${meaning}`);
      }
    }
    lines.push('');
  }

  lines.push('Voice Guidance:');
  lines.push(skill.voiceGuidance || skill.steps.join('\n'));
  lines.push('');

  if (learned.includes(skill.id)) {
    lines.push(`(They've used ${skill.name} before.)`);
  }

  if (effective.length > 0 && effective[0] !== skill.id) {
    const topSkill = ALL_DBT_SKILLS[effective[0]];
    if (topSkill) {
      lines.push(`(Note: ${topSkill.name} has worked well for them.)`);
    }
  }

  return lines.join('\n');
}

// All constants are exported at their definitions above

