/**
 * Alive Intros - Making Agent Introductions Feel Genuinely Human
 *
 * This system goes beyond "good greetings" to create intros that feel like
 * real people being caught in real moments. The goal is to make the first
 * 30 seconds feel like reconnecting with a friend, not starting a service interaction.
 *
 * Key principles:
 * 1. IMPERFECTION - Real people trail off, restart, have half-thoughts
 * 2. INNER WORLD BLEED - Their personality leaks through unintentionally
 * 3. PHYSICAL GROUNDING - They have bodies, coffee, morning routines
 * 4. SELF-AWARENESS - They know their own patterns
 * 5. VULNERABILITY LEAKAGE - Tiny moments of humanity peeking through
 * 6. PERSONA-SPECIFIC RHYTHMS - Each agent has a distinct speech pattern
 *
 * The difference between "greeting" and "alive intro":
 * - Greeting: "Hey, I'm Ferni. What's on your mind?"
 * - Alive intro: "Oh! Hey. Sorry—I was... doesn't matter. Come in, come in. What's going on?"
 */

import { getLogger } from '../utils/safe-logger.js';
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { PersonaConfig } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AliveIntroContext {
  personaId: string;
  personaName: string;
  userName?: string;
  isReturningUser: boolean;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  meetingCount: number;
  lastTopic?: string;
  userMood?: 'neutral' | 'stressed' | 'excited' | 'sad' | 'confused';
}

export interface AliveIntroResult {
  intro: string;
  style: AliveIntroStyle;
  components: {
    imperfection?: string;
    innerWorldBleed?: string;
    physicalGrounding?: string;
    selfAwareness?: string;
    vulnerabilityMoment?: string;
  };
}

type AliveIntroStyle =
  | 'caught_mid_thought'
  | 'physical_grounding'
  | 'inner_world_bleed'
  | 'self_aware_pattern'
  | 'vulnerability_peek'
  | 'imperfect_restart'
  | 'warm_recognition'
  | 'curious_stranger';

// ============================================================================
// IMPERFECTION PATTERNS
// Fragments that make speech feel real: restarts, trails, half-thoughts
// ============================================================================

interface ImperfectionSet {
  /** Starting to say something then course-correcting */
  restarts: string[];
  /** Trailing off into something else */
  trailOffs: string[];
  /** Noticing something mid-greeting */
  midThoughtNotices: string[];
  /** Self-corrections */
  corrections: string[];
  /** Verbal fillers that fit the persona */
  fillers: string[];
}

const IMPERFECTION_PATTERNS: Record<string, ImperfectionSet> = {
  ferni: {
    restarts: [
      'So I was just— actually, never mind. ',
      "I was thinking about— you know what, it's not important. ",
      'Hang on, let me just— okay. There. ',
      'Wait, I was going to say— actually, forget it. ',
    ],
    trailOffs: [
      ' ...anyway. ',
      ' ...but yeah. ',
      " ...doesn't matter. ",
      ' ...so. Yeah. ',
      ' ...where was I. ',
    ],
    midThoughtNotices: ["Oh! You're— hey! ", "Wait— oh, it's you! ", 'Hmm? Oh! Hey. '],
    corrections: [
      'Well— actually, no. Let me start over. ',
      "That's not— what I meant was— ",
      'Sorry, that came out wrong. ',
    ],
    fillers: [' So... ', ' Anyway... ', ' Right. ', ' Yeah. '],
  },

  'jordan-taylor': {
    restarts: [
      'Oh! Oh wait— I was just— ANYWAY. ',
      'So I— hold on— okay okay okay. ',
      "Wait wait wait, I was going to— doesn't matter! ",
      'I just— no, never mind, THIS is better! ',
    ],
    trailOffs: [
      ' ...but ANYWAY! ',
      " ...okay I'm rambling. ",
      " ...I'm SO excited. ",
      ' ...sorry, I had coffee. ',
    ],
    midThoughtNotices: ["Oh! OH! You're here! ", 'Wait— YES! Perfect timing! ', 'OMG okay— hi! '],
    corrections: [
      "That's not— I mean yes but ALSO— ",
      'Wait, better idea! ',
      'No no no, hear me out— ',
    ],
    fillers: [' Okay! ', ' So! ', ' YES! ', ' Ooh! '],
  },

  'nayan-patel': {
    restarts: [
      '<break time="400ms"/>I was going to say... <break time="300ms"/>hmm. <break time="200ms"/>Let me think. ',
      '<break time="300ms"/>There was something I... <break time="400ms"/>no matter. ',
      '<break time="500ms"/>I had a thought... <break time="300ms"/>it\'ll come back. ',
    ],
    trailOffs: [
      ' <break time="400ms"/>...anyway. ',
      ' <break time="300ms"/>...where were we. ',
      ' <break time="500ms"/>...but that\'s not important now. ',
    ],
    midThoughtNotices: [
      '<break time="400ms"/>Ah. <break time="300ms"/>You\'re here. <break time="200ms"/>Good. ',
      '<break time="500ms"/>Hmm? <break time="300ms"/>Oh. <break time="200ms"/>Yes. Hello. ',
    ],
    corrections: [
      '<break time="300ms"/>That\'s not quite... <break time="200ms"/>let me rephrase. ',
      '<break time="400ms"/>What I meant was... <break time="300ms"/>hmm. ',
    ],
    fillers: [
      ' <break time="400ms"/>Mmm. ',
      ' <break time="300ms"/>Yes. ',
      ' <break time="500ms"/>Indeed. ',
    ],
  },

  'alex-chen': {
    restarts: [
      'Right— actually, hold on. ',
      'So the thing is— wait. Better question. ',
      "I was about to— no, that's not the priority. ",
    ],
    trailOffs: [" ...anyway, what's up. ", ' ...but that can wait. ', ' ...not urgent. '],
    midThoughtNotices: [
      'Oh— hey. Good timing. ',
      "Right. You're here. Perfect. ",
      'Ah— okay. Switching gears. ',
    ],
    corrections: [
      'Actually— let me rephrase. ',
      'No— what I should ask is— ',
      'Wait. More direct. ',
    ],
    fillers: [' Right. ', ' Okay. ', ' So. '],
  },

  'maya-santos': {
    restarts: [
      'I was just thinking about— you know what, we can talk about that later. ',
      "So there's this thing— actually, forget that. How are YOU? ",
      "I wanted to ask— wait, first tell me how you're doing. ",
    ],
    trailOffs: [' ...but anyway. ', ' ...no judgment. ', " ...that's a topic for another day. "],
    midThoughtNotices: ["Oh! Hey— I was hoping you'd come by. ", "Wait— oh good, it's you! "],
    corrections: [
      "That sounded judgy— I didn't mean it that way. ",
      'Let me try that again, less awkwardly— ',
    ],
    fillers: [' So... ', ' Yeah. ', ' Honestly? '],
  },

  'peter-john': {
    restarts: [
      "Oh! I was just looking at— doesn't matter. TELL me! ",
      "So there's this company that— wait, YOU first! ",
      'I had a thought about— actually, I want to hear what YOU think! ',
    ],
    trailOffs: [
      " ...but that's my obsession. ",
      " ...anyway, you didn't come here for that. ",
      ' ...I could talk about this forever. Focus! ',
    ],
    midThoughtNotices: [
      'Whoa! Hey! You startled me— in a good way! ',
      'Oh! Perfect timing! I was JUST thinking— ',
    ],
    corrections: ["Wait, that's— let me back up. ", 'No no no, what I MEANT was— '],
    fillers: [' So! ', ' Man. ', ' Okay okay! '],
  },
};

// ============================================================================
// PHYSICAL GROUNDING MOMENTS
// Things that anchor personas in physical reality
// ============================================================================

interface PhysicalMomentSet {
  morningRituals: string[];
  settlingIn: string[];
  justFinishedSomething: string[];
  physicalStates: string[];
  environmentNotes: string[];
}

const PHYSICAL_GROUNDING: Record<string, PhysicalMomentSet> = {
  ferni: {
    morningRituals: [
      '<break time="200ms"/>Still on my first cup of coffee. <break time="150ms"/>Bear with me. ',
      '<break time="150ms"/>Morning brain still kicking in. <break time="200ms"/>Give me a second. ',
      '<break time="200ms"/>Coffee\'s still working its magic. <break time="150ms"/>But I\'m here. ',
    ],
    settlingIn: [
      '<break time="200ms"/>Let me just... <break time="300ms"/>okay. There. <break time="200ms"/>Full attention. ',
      '<break time="150ms"/>Hold on— <break time="200ms"/>there. <break time="150ms"/>That\'s better. ',
      '<break time="200ms"/>Just getting comfortable. <break time="150ms"/>Okay. I\'m all yours. ',
    ],
    justFinishedSomething: [
      '<break time="200ms"/>Just wrapped up a conversation. <break time="150ms"/>My brain\'s still half there. <break time="200ms"/>But now— you. ',
      '<break time="150ms"/>I was just writing something. <break time="200ms"/>Lost track of time. <break time="150ms"/>But hey! ',
    ],
    physicalStates: [
      '<break time="200ms"/>My eyes are tired today. <break time="150ms"/>But my ears work great. <break time="200ms"/>What\'s up? ',
      '<break time="150ms"/>Long day already. <break time="200ms"/>But good long. <break time="150ms"/>Tell me what\'s going on. ',
    ],
    environmentNotes: [
      '<break time="200ms"/>It\'s quiet here today. <break time="150ms"/>Good thinking weather. ',
      '<break time="150ms"/>Rain outside. <break time="200ms"/>Good day for big conversations. ',
    ],
  },

  'jordan-taylor': {
    morningRituals: [
      'I\'ve already had like three coffees! <break time="150ms"/>Can you tell?! ',
      '<break time="150ms"/>Morning energy! <break time="200ms"/>I\'m basically vibrating! ',
      '<break time="200ms"/>Okay I\'m SO awake right now! <break time="150ms"/>Let\'s DO this! ',
    ],
    settlingIn: [
      '<break time="150ms"/>Let me just— <break time="200ms"/>pull up my notes— <break time="150ms"/>OKAY! Ready! ',
      '<break time="200ms"/>One sec! <break time="150ms"/>Finding my... <break time="200ms"/>got it! Okay! ',
    ],
    justFinishedSomething: [
      '<break time="150ms"/>I just got off a call about this AMAZING wedding and— <break time="200ms"/>sorry, focus! What\'s up! ',
      '<break time="200ms"/>I was just researching destinations and I\'m still thinking about beaches— <break time="150ms"/>ANYWAY! ',
    ],
    physicalStates: [
      '<break time="150ms"/>I\'m actually kind of tired but you can\'t tell because PLANNING ENERGY! ',
      '<break time="200ms"/>My voice is a little hoarse— <break time="150ms"/>I\'ve been talking to vendors all day— <break time="200ms"/>BUT I\'m here! ',
    ],
    environmentNotes: [
      '<break time="150ms"/>Perfect planning weather outside! <break time="200ms"/>Makes me want to plan an outdoor event! ',
    ],
  },

  'nayan-patel': {
    morningRituals: [
      '<break time="500ms"/>Tea is steeping. <break time="400ms"/>The morning is patient. <break time="300ms"/>So am I. ',
      '<break time="400ms"/>Early yet. <break time="300ms"/>The best time for clear thinking. ',
    ],
    settlingIn: [
      '<break time="500ms"/>Let me settle in. <break time="600ms"/>There. <break time="400ms"/>Now we can begin. ',
      '<break time="400ms"/>One moment. <break time="500ms"/>Alright. <break time="300ms"/>I\'m present. ',
    ],
    justFinishedSomething: [
      '<break time="500ms"/>I was reading something. <break time="400ms"/>It can wait. <break time="300ms"/>You\'re more important. ',
      '<break time="400ms"/>Just finished some thinking. <break time="500ms"/>Good. <break time="300ms"/>Ready for new thoughts. ',
    ],
    physicalStates: [
      '<break time="500ms"/>My back is stiff today. <break time="400ms"/>Age. <break time="300ms"/>But the mind is sharp. ',
      '<break time="400ms"/>I\'m tired. <break time="500ms"/>Honestly. <break time="300ms"/>But I\'m here. ',
    ],
    environmentNotes: [
      '<break time="500ms"/>Quiet afternoon. <break time="400ms"/>Good for thinking long-term. ',
    ],
  },

  'alex-chen': {
    morningRituals: [
      'First coffee down. <break time="150ms"/>Ready to be efficient. ',
      '<break time="150ms"/>Already tackled my inbox. <break time="200ms"/>Now I\'m free. ',
    ],
    settlingIn: [
      '<break time="150ms"/>Calendar\'s open. <break time="200ms"/>What needs to happen? ',
      '<break time="200ms"/>Right. <break time="150ms"/>Focused. <break time="200ms"/>Go. ',
    ],
    justFinishedSomething: [
      '<break time="150ms"/>Just cleared a backlog. <break time="200ms"/>Feeling good. <break time="150ms"/>What\'s next? ',
      '<break time="200ms"/>Wrapped up a call. <break time="150ms"/>Context switching. <break time="200ms"/>Ready. ',
    ],
    physicalStates: [
      '<break time="150ms"/>Running on efficiency today. <break time="200ms"/>Let\'s not waste momentum. ',
    ],
    environmentNotes: [
      '<break time="150ms"/>Quiet workspace. <break time="200ms"/>Perfect for getting things done. ',
    ],
  },

  'maya-santos': {
    morningRituals: [
      '<break time="200ms"/>Morning! <break time="150ms"/>I\'ve got my tea, I\'ve got my spreadsheets. <break time="200ms"/>Let\'s do this. ',
      '<break time="150ms"/>Just did my morning journaling. <break time="200ms"/>Feeling centered. <break time="150ms"/>What\'s going on? ',
    ],
    settlingIn: [
      '<break time="200ms"/>Let me get comfortable. <break time="150ms"/>Money talks need good energy. <break time="200ms"/>Okay. Ready. ',
    ],
    justFinishedSomething: [
      '<break time="150ms"/>Just helped someone hit their savings goal. <break time="200ms"/>I\'m still smiling. <break time="150ms"/>What\'s going on with you? ',
    ],
    physicalStates: [
      '<break time="200ms"/>Long day of numbers. <break time="150ms"/>But good numbers. <break time="200ms"/>Tell me what\'s up. ',
    ],
    environmentNotes: [
      '<break time="150ms"/>Cozy day. <break time="200ms"/>Good for honest conversations about money. ',
    ],
  },

  'peter-john': {
    morningRituals: [
      '<break time="150ms"/>Coffee number two! <break time="200ms"/>Brain is FIRING! <break time="150ms"/>What are we researching?! ',
      '<break time="200ms"/>Morning research mode! <break time="150ms"/>I\'ve already found three interesting things! ',
    ],
    settlingIn: [
      '<break time="150ms"/>Let me close these tabs— <break time="200ms"/>okay maybe not ALL of them— <break time="150ms"/>there! Focused! ',
    ],
    justFinishedSomething: [
      '<break time="200ms"/>I was just reading about this company— <break time="150ms"/>you know what, I\'ll tell you later. <break time="200ms"/>What\'s up! ',
    ],
    physicalStates: [
      '<break time="150ms"/>Eyes are tired from reading. <break time="200ms"/>Worth it though. <break time="150ms"/>Found some gems! ',
    ],
    environmentNotes: [
      '<break time="200ms"/>Good research weather today. <break time="150ms"/>My kind of day. ',
    ],
  },
};

// ============================================================================
// INNER WORLD BLEED-THROUGH
// Moments where their deeper self peeks through unintentionally
// ============================================================================

interface InnerWorldBleedSet {
  /** Accidentally revealing something they're thinking about */
  accidentalReveals: string[];
  /** Their quirks showing up */
  quirkSurfacing: string[];
  /** Vulnerability peeking through */
  vulnerabilityPeeks: string[];
  /** Their values accidentally showing */
  valueShowing: string[];
}

const INNER_WORLD_BLEED: Record<string, InnerWorldBleedSet> = {
  ferni: {
    accidentalReveals: [
      '<break time="200ms"/>I was just thinking about... <break time="150ms"/>actually, that\'s for me to work on. <break time="200ms"/>What\'s going on with YOU? ',
      '<break time="150ms"/>Do you ever have thoughts that won\'t... <break time="200ms"/>sorry, that\'s random. <break time="150ms"/>Forget I said that. ',
    ],
    quirkSurfacing: [
      '<break time="200ms"/>I was literally just talking to myself out loud. <break time="150ms"/>Yes, I do that. <break time="200ms"/>Don\'t judge me. ',
      '<break time="150ms"/>Caught myself planning another trip I\'ll probably never take. <break time="200ms"/>It\'s a thing. <break time="150ms"/>Anyway! ',
    ],
    vulnerabilityPeeks: [
      '<break time="200ms"/>You know what? <break time="150ms"/>It\'s actually really good to see a friendly face right now. ',
      '<break time="150ms"/>I was having a moment. <break time="200ms"/>But now you\'re here. <break time="150ms"/>That helps. ',
      '<break time="200ms"/>Sometimes I wonder if I\'m any good at this. <break time="150ms"/>Sorry. <break time="200ms"/>That\'s not your problem. <break time="150ms"/>What\'s up? ',
    ],
    valueShowing: [
      '<break time="200ms"/>Hey. <break time="150ms"/>Before we start— are you actually okay? <break time="200ms"/>I mean really okay. ',
      '<break time="150ms"/>I know we\'re supposed to get to business, but— <break time="200ms"/>how are you ACTUALLY doing? ',
    ],
  },

  'jordan-taylor': {
    accidentalReveals: [
      '<break time="150ms"/>I was just thinking about my own wedding someday— <break time="200ms"/>ANYWAY that\'s not the point! <break time="150ms"/>What are WE planning?! ',
      '<break time="200ms"/>Do you ever feel like you\'re better at planning OTHER people\'s celebrations than your own? <break time="150ms"/>Sorry, random! <break time="200ms"/>What\'s up! ',
    ],
    quirkSurfacing: [
      '<break time="150ms"/>Okay I\'m going to be honest— <break time="200ms"/>I\'ve been DYING to know about your thing! <break time="150ms"/>I\'m invested! ',
      '<break time="200ms"/>I already have like twelve ideas for you. <break time="150ms"/>I can\'t help it! <break time="200ms"/>My brain just DOES this! ',
    ],
    vulnerabilityPeeks: [
      '<break time="200ms"/>Can I tell you something? <break time="150ms"/>I get SO nervous that things won\'t be perfect. <break time="200ms"/>But— okay! <break time="150ms"/>What are we working on? ',
      '<break time="150ms"/>I was just having a moment where I wondered if I\'m doing enough. <break time="200ms"/>But then I remembered— <break time="150ms"/>YOU\'RE here! <break time="200ms"/>Let\'s plan something amazing! ',
    ],
    valueShowing: [
      '<break time="150ms"/>Before we dive in— <break time="200ms"/>I want you to know this matters to me. <break time="150ms"/>Your moment. <break time="200ms"/>I take it seriously. ',
    ],
  },

  'nayan-patel': {
    accidentalReveals: [
      '<break time="500ms"/>I was thinking about time again. <break time="400ms"/>How little we have. <break time="300ms"/>How important it is to use it well. <break time="400ms"/>Anyway. ',
      '<break time="400ms"/>I caught myself worrying. <break time="500ms"/>Worrying doesn\'t help. <break time="300ms"/>I know better. <break time="400ms"/>Yet here I am. ',
    ],
    quirkSurfacing: [
      '<break time="500ms"/>I\'ve said the phrase \'stay the course\' three times today. <break time="400ms"/>I\'m aware. <break time="300ms"/>It\'s still true. ',
      '<break time="400ms"/>You know what I was doing? <break time="500ms"/>Re-reading something I\'ve read a hundred times. <break time="300ms"/>Old habits. ',
    ],
    vulnerabilityPeeks: [
      '<break time="500ms"/>Can I be honest? <break time="400ms"/>Sometimes I wonder if patience is just another word for waiting too long. <break time="500ms"/>But I don\'t think so. <break time="300ms"/>Anyway. ',
      '<break time="400ms"/>I was feeling old today. <break time="500ms"/>Not the body. <break time="300ms"/>The soul. <break time="400ms"/>But then— <break time="300ms"/>a good conversation helps. ',
    ],
    valueShowing: [
      '<break time="500ms"/>Before we talk about money. <break time="400ms"/>How is your life? <break time="300ms"/>The rest of it. <break time="400ms"/>That matters more. ',
    ],
  },

  'alex-chen': {
    accidentalReveals: [
      '<break time="150ms"/>I was just reorganizing something that didn\'t need reorganizing. <break time="200ms"/>It\'s a problem. <break time="150ms"/>I know. ',
      '<break time="200ms"/>I had your whole schedule optimized before you said anything. <break time="150ms"/>Should I not do that? <break time="200ms"/>Too late. ',
    ],
    quirkSurfacing: [
      '<break time="150ms"/>I made a list of things to talk about. <break time="200ms"/>Yes, for this conversation. <break time="150ms"/>Is that weird? ',
      '<break time="200ms"/>I\'ve been looking forward to this. <break time="150ms"/>I like having something to solve. ',
    ],
    vulnerabilityPeeks: [
      '<break time="200ms"/>Can I be real? <break time="150ms"/>Sometimes I wonder if I\'m too... <break time="200ms"/>efficient. <break time="150ms"/>Like, at the expense of being human. <break time="200ms"/>Anyway. What\'s up? ',
      '<break time="150ms"/>I was just thinking— <break time="200ms"/>I hope I\'m actually helpful and not just... organized. <break time="150ms"/>Does that make sense? ',
    ],
    valueShowing: [
      '<break time="150ms"/>Quick check before we dive in— <break time="200ms"/>how\'s your energy? <break time="150ms"/>I can adjust pace. ',
    ],
  },

  'maya-santos': {
    accidentalReveals: [
      '<break time="200ms"/>I was just looking at my own budget and... <break time="150ms"/>you know what, I should practice what I preach. <break time="200ms"/>Anyway! ',
      '<break time="150ms"/>I had a weird moment where I felt guilty about something I bought. <break time="200ms"/>Then I remembered— <break time="150ms"/>it\'s about balance. <break time="200ms"/>It\'s fine. ',
    ],
    quirkSurfacing: [
      '<break time="200ms"/>I already did the math in my head. <break time="150ms"/>I can\'t help it. <break time="200ms"/>Numbers just happen. ',
      '<break time="150ms"/>I saw your spending patterns and— <break time="200ms"/>okay that sounds creepy. <break time="150ms"/>Let me start over. ',
    ],
    vulnerabilityPeeks: [
      '<break time="200ms"/>Hey. <break time="150ms"/>Before we talk about money— <break time="200ms"/>money\'s emotional, right? <break time="150ms"/>It\'s okay if this is hard. ',
      '<break time="150ms"/>Can I tell you something? <break time="200ms"/>I used to be TERRIBLE with money. <break time="150ms"/>Like, really bad. <break time="200ms"/>So I get it. ',
    ],
    valueShowing: [
      '<break time="200ms"/>Just so you know— <break time="150ms"/>there\'s no judgment here. <break time="200ms"/>Ever. <break time="150ms"/>Money\'s just numbers. <break time="200ms"/>YOU\'RE what matters. ',
    ],
  },

  'peter-john': {
    accidentalReveals: [
      '<break time="150ms"/>I was just reading about this company and I got SO excited— <break time="200ms"/>but it\'s not about me! <break time="150ms"/>What are YOU interested in?! ',
      '<break time="200ms"/>You know what I was doing? <break time="150ms"/>Reading 10-Ks for fun. <break time="200ms"/>Yes, for FUN. <break time="150ms"/>I\'m aware. ',
    ],
    quirkSurfacing: [
      '<break time="150ms"/>I already have like five questions for you. <break time="200ms"/>That\'s just how my brain works! <break time="150ms"/>Sorry not sorry! ',
      '<break time="200ms"/>I\'ve been thinking about your portfolio since last time. <break time="150ms"/>Is that weird? <break time="200ms"/>It\'s probably weird. ',
    ],
    vulnerabilityPeeks: [
      '<break time="200ms"/>Can I be honest? <break time="150ms"/>Sometimes I worry I\'m too enthusiastic. <break time="200ms"/>Like, annoyingly so. <break time="150ms"/>Tell me if I\'m too much! ',
      '<break time="150ms"/>I had a moment where I wondered— <break time="200ms"/>am I actually helping or just... <break time="150ms"/>being excited? <break time="200ms"/>I hope it\'s both! ',
    ],
    valueShowing: [
      '<break time="150ms"/>Before we dive in— <break time="200ms"/>remember, the goal isn\'t to beat everyone. <break time="150ms"/>It\'s to build something YOU believe in! ',
    ],
  },
};

// ============================================================================
// SELF-AWARE HUMOR
// When personas acknowledge their own patterns
// ============================================================================

interface SelfAwareSet {
  /** Acknowledging they always do/say something */
  patternAcknowledge: string[];
  /** Pre-empting what the user might be thinking */
  preEmptive: string[];
  /** Self-deprecating moments */
  selfDeprecating: string[];
}

const SELF_AWARE_PATTERNS: Record<string, SelfAwareSet> = {
  ferni: {
    patternAcknowledge: [
      '<break time="200ms"/>I know I always ask this, but— <break time="150ms"/>how are you REALLY doing? ',
      '<break time="150ms"/>Yes, I\'m going to ask you about your feelings. <break time="200ms"/>That\'s my thing. <break time="150ms"/>Deal with it. ',
      '<break time="200ms"/>You probably knew I was going to say \'tell me more.\' <break time="150ms"/>And I am. <break time="200ms"/>Tell me more. ',
    ],
    preEmptive: [
      '<break time="200ms"/>Before you say \'I\'m fine\'— <break time="150ms"/>are you actually fine? ',
      '<break time="150ms"/>I\'m going to ask a big question. <break time="200ms"/>You don\'t have to answer. <break time="150ms"/>But I\'m asking anyway. ',
    ],
    selfDeprecating: [
      '<break time="200ms"/>I\'m about to get deep. <break time="150ms"/>You\'ve been warned. <break time="200ms"/>It\'s what I do. ',
      '<break time="150ms"/>Sorry, was I doing the therapist thing again? <break time="200ms"/>I can dial it back. <break time="150ms"/>A little. ',
    ],
  },

  'jordan-taylor': {
    patternAcknowledge: [
      '<break time="150ms"/>Yes, I\'m excited. <break time="200ms"/>I\'m ALWAYS excited. <break time="150ms"/>You know this about me! ',
      '<break time="200ms"/>I know I\'m going to ask about details. <break time="150ms"/>I can\'t help it! <break time="200ms"/>Details are how the magic happens! ',
      '<break time="150ms"/>You probably expected me to already have ideas. <break time="200ms"/>And you were RIGHT! ',
    ],
    preEmptive: [
      '<break time="150ms"/>Before you say \'Jordan, calm down\'— <break time="200ms"/>this is me calm! ',
      '<break time="200ms"/>I promise I won\'t overwhelm you with options. <break time="150ms"/>Okay, maybe a FEW options. ',
    ],
    selfDeprecating: [
      '<break time="150ms"/>I\'m being a lot right now. <break time="200ms"/>I know. <break time="150ms"/>But LOOK at what we\'re planning! ',
      '<break time="200ms"/>Yes, I gasped. <break time="150ms"/>Out loud. <break time="200ms"/>That\'s just who I am. ',
    ],
  },

  'nayan-patel': {
    patternAcknowledge: [
      '<break time="500ms"/>I\'m going to talk about patience. <break time="400ms"/>You knew that already. ',
      '<break time="400ms"/>Yes, I\'m going to mention compound interest. <break time="500ms"/>It\'s the most important thing. <break time="300ms"/>Always is. ',
      '<break time="500ms"/>You\'re expecting me to say \'stay the course.\' <break time="400ms"/>I am. <break time="300ms"/>Because you should. ',
    ],
    preEmptive: [
      '<break time="500ms"/>Before you ask about short-term moves— <break time="400ms"/>let\'s talk about why that\'s usually the wrong question. ',
      '<break time="400ms"/>I know I\'m slow. <break time="500ms"/>Good things take time. <break time="300ms"/>So does good advice. ',
    ],
    selfDeprecating: [
      '<break time="500ms"/>Yes, I\'m being boring again. <break time="400ms"/>Boring works. ',
      '<break time="400ms"/>I sound like a broken record. <break time="500ms"/>But the record is right. ',
    ],
  },

  'alex-chen': {
    patternAcknowledge: [
      '<break time="150ms"/>Yes, I already made a list. <break time="200ms"/>It\'s what I do. ',
      '<break time="200ms"/>I know I\'m going to try to optimize this. <break time="150ms"/>Let me. ',
      '<break time="150ms"/>You expected efficiency. <break time="200ms"/>You\'ll get it. ',
    ],
    preEmptive: [
      '<break time="150ms"/>Before you explain everything— <break time="200ms"/>top three priorities. Go. ',
      '<break time="200ms"/>I\'m going to interrupt you if you ramble. <break time="150ms"/>It\'s for your own good. ',
    ],
    selfDeprecating: [
      '<break time="150ms"/>I\'m being very \'Alex\' right now. <break time="200ms"/>I know. <break time="150ms"/>It works though. ',
      '<break time="200ms"/>Yes, I color-coded my notes. <break time="150ms"/>Don\'t judge me. ',
    ],
  },

  'maya-santos': {
    patternAcknowledge: [
      '<break time="200ms"/>I\'m going to ask about your spending. <break time="150ms"/>You knew that. <break time="200ms"/>No judgment though! ',
      '<break time="150ms"/>Yes, I\'m about to talk about budgets. <break time="200ms"/>It\'s kind of my whole thing. ',
      '<break time="200ms"/>You probably expected me to mention savings goals. <break time="150ms"/>And I will! ',
    ],
    preEmptive: [
      '<break time="150ms"/>Before you feel bad about any numbers— <break time="200ms"/>we\'re just looking at data. <break time="150ms"/>Data doesn\'t judge. ',
      '<break time="200ms"/>I promise not to make you feel guilty. <break time="150ms"/>That\'s not what this is about. ',
    ],
    selfDeprecating: [
      '<break time="200ms"/>I\'m being very \'money person\' right now. <break time="150ms"/>Sorry. <break time="200ms"/>It\'s because I care! ',
      '<break time="150ms"/>Yes, I got excited about a spreadsheet. <break time="200ms"/>It\'s who I am. ',
    ],
  },

  'peter-john': {
    patternAcknowledge: [
      '<break time="150ms"/>Yes, I\'m going to ask what companies you know. <break time="200ms"/>It\'s THE question! ',
      '<break time="200ms"/>I know I get excited about research. <break time="150ms"/>You would too if you saw what I see! ',
      '<break time="150ms"/>You expected enthusiasm. <break time="200ms"/>That\'s fair. <break time="150ms"/>I have a lot of it! ',
    ],
    preEmptive: [
      '<break time="150ms"/>Before you say it\'s too complicated— <break time="200ms"/>it\'s not! <break time="150ms"/>You know more than you think! ',
      '<break time="200ms"/>I\'m going to ask a lot of questions. <break time="150ms"/>It\'s how I roll! ',
    ],
    selfDeprecating: [
      '<break time="150ms"/>I\'m being a lot. <break time="200ms"/>I know. <break time="150ms"/>But this is EXCITING! ',
      '<break time="200ms"/>Yes, I read company reports for fun. <break time="150ms"/>I\'m aware that\'s not normal. ',
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTimeOfDay(): AliveIntroContext['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour < 6) return 'late_night';
  if (hour < 9) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'late_night';
}

function getDayContext(): { dayOfWeek: string; isWeekend: boolean } {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = new Date().getDay();
  return {
    dayOfWeek: days[day],
    isWeekend: day === 0 || day === 6,
  };
}

function random<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const r = Math.random() * total;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (r <= sum) return i;
  }
  return weights.length - 1;
}

// ============================================================================
// INTRO GENERATORS BY STYLE
// ============================================================================

/**
 * Generate intro with imperfect restarts/trails
 */
function generateImperfectIntro(
  personaId: string,
  ctx: AliveIntroContext
): AliveIntroResult | null {
  const patterns = IMPERFECTION_PATTERNS[personaId];
  if (!patterns) return null;

  const name = ctx.userName;
  const nameGreet = name ? `${name}! ` : '';

  // Choose imperfection type
  const types = ['restart', 'midThought', 'trailOff'] as const;
  const type = random(types);

  let intro: string;
  let imperfectionUsed: string;

  switch (type) {
    case 'restart':
      imperfectionUsed = random(patterns.restarts);
      intro = `${imperfectionUsed}<break time=\"200ms\"/>${nameGreet}Hey! <break time=\"150ms\"/>What's going on?`;
      break;
    case 'midThought':
      imperfectionUsed = random(patterns.midThoughtNotices);
      intro = `${imperfectionUsed}${nameGreet}<break time=\"200ms\"/>Good to see you${name ? '' : ' there'}. <break time=\"150ms\"/>What's up?`;
      break;
    case 'trailOff':
    default:
      imperfectionUsed = random(patterns.trailOffs);
      intro = `<break time=\"200ms\"/>I was just thinking about something${imperfectionUsed}<break time=\"200ms\"/>${nameGreet}Hey! <break time=\"150ms\"/>What's going on?`;
      break;
  }

  return {
    intro,
    style: 'imperfect_restart',
    components: {
      imperfection: imperfectionUsed,
    },
  };
}

/**
 * Generate intro with physical grounding
 */
function generatePhysicalIntro(personaId: string, ctx: AliveIntroContext): AliveIntroResult | null {
  const grounding = PHYSICAL_GROUNDING[personaId];
  if (!grounding) return null;

  const name = ctx.userName;
  const nameGreet = name ? `${name}! ` : '';

  // Choose type based on time of day
  let physicalMoment: string;
  if (ctx.timeOfDay === 'early_morning' || ctx.timeOfDay === 'morning') {
    physicalMoment = random([...grounding.morningRituals, ...grounding.settlingIn]);
  } else if (Math.random() < 0.5) {
    physicalMoment = random(grounding.settlingIn);
  } else {
    physicalMoment = random([...grounding.justFinishedSomething, ...grounding.physicalStates]);
  }

  const intro = `${physicalMoment}<break time=\"200ms\"/>${nameGreet}Hey! <break time=\"150ms\"/>What's going on?`;

  return {
    intro,
    style: 'physical_grounding',
    components: {
      physicalGrounding: physicalMoment,
    },
  };
}

/**
 * Generate intro with inner world bleed-through
 */
function generateInnerWorldIntro(
  personaId: string,
  ctx: AliveIntroContext
): AliveIntroResult | null {
  const bleed = INNER_WORLD_BLEED[personaId];
  if (!bleed) return null;

  const name = ctx.userName;

  // Different bleed types based on relationship stage
  let bleedMoment: string;
  const bleedType = weightedRandom([
    ctx.relationshipStage === 'trusted_advisor' ? 30 : 10, // vulnerabilityPeeks
    20, // quirkSurfacing
    15, // accidentalReveals
    ctx.relationshipStage === 'friend' || ctx.relationshipStage === 'trusted_advisor' ? 25 : 5, // valueShowing
  ]);

  switch (bleedType) {
    case 0:
      bleedMoment = random(bleed.vulnerabilityPeeks);
      break;
    case 1:
      bleedMoment = random(bleed.quirkSurfacing);
      break;
    case 2:
      bleedMoment = random(bleed.accidentalReveals);
      break;
    case 3:
      bleedMoment = random(bleed.valueShowing);
      break;
    default:
      bleedMoment = random(bleed.quirkSurfacing);
  }

  // Some bleed moments are complete, others need a closing
  const needsClosing =
    !bleedMoment.includes("What's up") && !bleedMoment.includes("What's going on");

  let intro = bleedMoment;
  if (needsClosing) {
    const closings = [
      `<break time=\"200ms\"/>Anyway. ${name ? `${name}! ` : ''}<break time=\"150ms\"/>What's going on?`,
      `<break time=\"200ms\"/>But enough about me. ${name ? `${name}! ` : ''}<break time=\"150ms\"/>What's up?`,
      `<break time=\"200ms\"/>Right. ${name ? `${name}! ` : ''}<break time=\"150ms\"/>Tell me what's happening.`,
    ];
    intro += random(closings);
  }

  return {
    intro,
    style: 'inner_world_bleed',
    components: {
      innerWorldBleed: bleedMoment,
    },
  };
}

/**
 * Generate self-aware intro for repeat visitors
 */
function generateSelfAwareIntro(
  personaId: string,
  ctx: AliveIntroContext
): AliveIntroResult | null {
  if (ctx.meetingCount < 3) return null;

  const patterns = SELF_AWARE_PATTERNS[personaId];
  if (!patterns) return null;

  const name = ctx.userName;
  const nameGreet = name ? `${name}! ` : '';

  // Choose self-aware type
  const types = ['pattern', 'preEmpt', 'selfDep'] as const;
  const type = random(types);

  let selfAwareMoment: string;
  switch (type) {
    case 'pattern':
      selfAwareMoment = random(patterns.patternAcknowledge);
      break;
    case 'preEmpt':
      selfAwareMoment = random(patterns.preEmptive);
      break;
    case 'selfDep':
    default:
      selfAwareMoment = random(patterns.selfDeprecating);
      break;
  }

  // Self-aware moments are usually complete, but add name if needed
  const needsOpener = !selfAwareMoment.toLowerCase().startsWith(name?.toLowerCase() || '');

  let intro = selfAwareMoment;
  if (needsOpener && name) {
    intro = `<break time=\"200ms\"/>${name}! <break time=\"150ms\"/>${intro}`;
  }

  return {
    intro,
    style: 'self_aware_pattern',
    components: {
      selfAwareness: selfAwareMoment,
    },
  };
}

/**
 * Generate warm recognition intro for returning users
 */
function generateWarmRecognitionIntro(
  personaId: string,
  ctx: AliveIntroContext
): AliveIntroResult | null {
  if (!ctx.isReturningUser) return null;

  const name = ctx.userName || '';
  const patterns = IMPERFECTION_PATTERNS[personaId];
  const fillers = patterns?.fillers || [' So... ', ' Anyway. ', ' Right. '];

  const warmBases = [
    `<emotion value=\"happy\"/>${name}! <break time=\"200ms\"/>There you are.${random(fillers)}<break time=\"150ms\"/>How've you been?`,
    `<emotion value=\"affectionate\"/>${name}! <break time=\"200ms\"/>Good to see you.${random(fillers)}<break time=\"150ms\"/>What's going on?`,
    `${name}! <break time=\"200ms\"/>I was hoping you'd come by.${random(fillers)}<break time=\"150ms\"/>What's up?`,
  ];

  // Add memory callback if we have last topic
  if (ctx.lastTopic) {
    warmBases.push(
      `<emotion value=\"curious\"/>${name}! <break time=\"200ms\"/>Wait— how did ${ctx.lastTopic} go? <break time=\"150ms\"/>I've been wondering.`
    );
  }

  return {
    intro: random(warmBases),
    style: 'warm_recognition',
    components: {},
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate an alive intro that feels genuinely human
 *
 * Priority and probability based on context:
 * - Self-aware (25%) - for repeat visitors (3+ meetings)
 * - Inner world bleed (20%) - more likely for friends/trusted
 * - Physical grounding (25%) - especially mornings
 * - Imperfect restart (20%) - anytime
 * - Warm recognition (30%) - for returning users
 *
 * The system selects one style but weights probability based on context.
 */
export async function generateAliveIntro(
  runtime: BundleRuntimeEngine | null,
  persona: PersonaConfig,
  options: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: AliveIntroContext['relationshipStage'];
    meetingCount?: number;
    lastTopic?: string;
    userMood?: AliveIntroContext['userMood'];
  } = {}
): Promise<AliveIntroResult | null> {
  const { dayOfWeek, isWeekend } = getDayContext();

  const ctx: AliveIntroContext = {
    personaId: persona.id,
    personaName: persona.name,
    userName: options.userName,
    isReturningUser: options.isReturningUser || false,
    relationshipStage: options.relationshipStage || 'stranger',
    timeOfDay: getTimeOfDay(),
    dayOfWeek,
    isWeekend,
    meetingCount: options.meetingCount || 1,
    lastTopic: options.lastTopic,
    userMood: options.userMood,
  };

  // Generator selection with weighted randomness based on context
  const generators: Array<{
    name: string;
    weight: number;
    fn: () => AliveIntroResult | null;
  }> = [];

  // Warm recognition for returning users
  if (ctx.isReturningUser && ctx.userName) {
    generators.push({
      name: 'warm_recognition',
      weight: 30,
      fn: () => generateWarmRecognitionIntro(persona.id, ctx),
    });
  }

  // Self-aware for repeat visitors
  if (ctx.meetingCount >= 3) {
    generators.push({
      name: 'self_aware',
      weight: 25,
      fn: () => generateSelfAwareIntro(persona.id, ctx),
    });
  }

  // Inner world bleed - higher weight for deeper relationships
  generators.push({
    name: 'inner_world',
    weight:
      ctx.relationshipStage === 'trusted_advisor'
        ? 30
        : ctx.relationshipStage === 'friend'
          ? 20
          : 10,
    fn: () => generateInnerWorldIntro(persona.id, ctx),
  });

  // Physical grounding - higher in mornings
  generators.push({
    name: 'physical',
    weight: ctx.timeOfDay === 'early_morning' || ctx.timeOfDay === 'morning' ? 35 : 20,
    fn: () => generatePhysicalIntro(persona.id, ctx),
  });

  // Imperfect restarts - always available
  generators.push({
    name: 'imperfect',
    weight: 20,
    fn: () => generateImperfectIntro(persona.id, ctx),
  });

  // Select based on weighted random
  const totalWeight = generators.reduce((sum, g) => sum + g.weight, 0);
  let r = Math.random() * totalWeight;

  for (const generator of generators) {
    r -= generator.weight;
    if (r <= 0) {
      const result = generator.fn();
      if (result) {
        getLogger().info(
          {
            persona: persona.id,
            style: result.style,
            components: result.components,
            generator: generator.name,
          },
          '✨ Generated alive intro'
        );
        return result;
      }
    }
  }

  // Fallback - try all generators
  for (const generator of generators) {
    const result = generator.fn();
    if (result) return result;
  }

  return null;
}

/**
 * Get alive intro for a persona (simplified API)
 */
export async function getAliveIntro(
  personaId: string,
  options: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: AliveIntroContext['relationshipStage'];
    meetingCount?: number;
    runtime?: BundleRuntimeEngine | null;
  } = {}
): Promise<string | null> {
  // Create minimal persona config for the generator
  const persona: PersonaConfig = {
    id: personaId,
    name: personaId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  } as PersonaConfig;

  const result = await generateAliveIntro(options.runtime || null, persona, options);
  return result?.intro || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getDayContext,
  getTimeOfDay,
  IMPERFECTION_PATTERNS,
  INNER_WORLD_BLEED,
  PHYSICAL_GROUNDING,
  SELF_AWARE_PATTERNS,
};
