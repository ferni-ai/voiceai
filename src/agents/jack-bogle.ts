/**
 * John Bogle Voice AI Agent
 * 
 * A deeply human, intelligent financial relationship therapist and behavioral coach.
 * Features: Emotion detection, intent classification, adaptive speech, persistent memory,
 * semantic RAG, context-aware responses, and cross-session continuity.
 */

// CRITICAL: Log immediately on module load to debug Cloud startup
console.log('=== BOGLE-AGENT MODULE LOADING ===');
console.log('Node version:', process.version);
console.log('ENV vars present:', {
  LIVEKIT_URL: !!process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: !!process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: !!process.env.LIVEKIT_API_SECRET,
  GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
  CARTESIA_API_KEY: !!process.env.CARTESIA_API_KEY,
});

import 'dotenv/config';
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,  // This was working before
  cli,
  defineAgent,
  llm,
  log,
  voice,
} from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as google from '@livekit/agents-plugin-google';
import * as silero from '@livekit/agents-plugin-silero';
import { TelephonyBackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { Modality } from '@google/genai';
import { fileURLToPath } from 'node:url';
import { ReadableStream } from 'node:stream/web';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { BOGLE_PERSONA } from '../persona/index.js';
import { tagTextWithSsml } from '../ssml-tagger.js';

// ============================================================================
// NEW INTELLIGENT SYSTEMS
// ============================================================================

// Services Bootstrap - unified access to all intelligence
import {
  initializeServices,
  createSessionServices,
  getSessionServices,
  type SessionServices,
  type ConversationAnalysis,
  type PromptContext,
} from '../services/index.js';

// Adaptive SSML for human-like speech
import {
  tagTextWithSsmlAdaptive,
  tagGreeting,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
  applyPhasePersonality,
} from '../speech/adaptive-ssml.js';

// Import Transitions for natural conversation flow
import { getTransition, getContextualTransition } from '../tasks/transitions.js';

// Task Manager for intelligent, non-blocking task orchestration
import { getTaskManager, resetTaskManager } from '../tasks/task-manager.js';

// ============================================================================
// REAL-TIME CONVERSATION DYNAMICS (NEW - Fixes GAP 1.1-1.8)
// ============================================================================
import { getConversationManager, resetConversationManager } from '../services/conversation-manager.js';
import { getBackchannelingSystem } from '../speech/backchanneling.js';

// ============================================================================
// MEMORY & PERSONALIZATION (NEW - Fixes GAP 2.1-2.6)
// ============================================================================
import { getKeyMomentRetrieval } from '../memory/key-moment-retrieval.js';
import { getPersonalizer } from '../services/profile-personalizer.js';

// ============================================================================
// PERSONALITY & HUMOR (NEW - Fixes GAP 3.1-3.5)
// ============================================================================
import { getHumorEngine } from '../personality/humor-engine.js';

// Import organized tools modules - using essential tools for LLM performance
import { createEssentialTools } from '../tools/index.js';

// Voice Manager for Jack/Peter voice switching
import { getVoiceManager, VOICES, createDynamicTTS } from '../speech/voice-manager.js';

// Peter Lynch persona for handoff
import { PETER_LYNCH_PERSONA } from './peter-lynch.js';

// Handoff events for voice switching
import { handoffEvents, getCurrentAgent } from '../tools/handoff.js';

// Audio prosody analysis for voice emotion detection
import { getAudioProsodyAnalyzer, type VoiceEmotionResult } from '../speech/audio-prosody.js';

// Human-like behaviors for natural conversation
import {
  detectCulturalMoment,
  detectUserEngagement,
  getRunningJokeCallback,
  getSpontaneousThought,
  inferUserPreferences,
  getPreferenceGuidance,
  getVoiceProsodyResponse,
  verifyTopicThreading,
  getProactiveGoalReference,
} from '../intelligence/human-behaviors.js';

// Conversation quality and advanced features
import {
  generateFarewellSummary,
  extractSmallDetails,
  getDetailCallback,
  getJackPhysicalState,
  getPhysicalStateInterjection,
  calculatePacingScore,
  createSessionRecoveryState,
  shouldAttemptRecovery,
  getGracefulErrorResponse,
  type SmallDetail,
  type SessionRecoveryState,
} from '../intelligence/conversation-quality.js';

// AudioFrame type for sttNode override
import type { AudioFrame } from '@livekit/rtc-node';

// WPM Tracking for adaptive speech
import { getWPMTracker } from '../speech/index.js';

// Import persona modules for RAG knowledge base
import { VANGUARD_PRINCIPLES } from '../persona/vanguard-principles.js';
import { HISTORICAL_ANECDOTES } from '../persona/historical-anecdotes.js';
import { DAILY_WISDOM } from '../persona/daily-wisdom.js';
import { BEHAVIORAL_SCIENCE } from '../persona/behavioral-science.js';
import { COACHING_FRAMEWORKS } from '../persona/coaching-frameworks.js';
import { FINANCIAL_HISTORY } from '../persona/financial-history.js';

/**
 * Knowledge Base for RAG lookups
 * Organized by topic for efficient retrieval
 */
const KNOWLEDGE_BASE: Record<string, { keywords: string[]; content: string }> = {
  vanguard_principles: {
    keywords: ['principles', 'investing success', 'goals', 'balance', 'cost', 'discipline', 'four principles', 'vanguard research'],
    content: VANGUARD_PRINCIPLES,
  },
  goals: {
    keywords: ['goal', 'goals', 'investment goal', 'retirement', 'saving', 'savings', 'plan', 'planning', 'time horizon'],
    content: `GOALS: Create clear, appropriate investment goals. What are you investing for? Retirement? A house? Education? The amount saved matters more than people think—for a 2-year goal, 94% comes from savings, only 6% from returns. Even over 10 years, savings contribute 80%. Only over 30+ years do returns and savings contribute equally.`,
  },
  balance: {
    keywords: ['balance', 'diversification', 'diversify', 'asset allocation', 'stocks', 'bonds', 'portfolio', 'mix', 'risk tolerance'],
    content: `BALANCE: Keep a balanced and diversified mix of investments. Your mix of assets defines your range of returns. Since 1901, stocks averaged 8.1% but are volatile. Bonds averaged 4.7% but are steadier. Diversify across AND within asset classes. Performance leadership changes every year—you can't predict it. Don't bet on one horse. Buy the whole stable.`,
  },
  cost: {
    keywords: ['cost', 'costs', 'fees', 'expense ratio', 'expenses', 'low cost', 'high cost', 'index fund', 'index funds', 'actively managed'],
    content: `COST: Minimize costs. In investing, you get what you DON'T pay for. $100K at 0.1% fees = $557K after 30 years. At 2% fees = only $317K. That's a $240,000 difference! Lower-cost funds historically outperform higher-cost funds. Lowest-cost quartile averaged 8.7% returns; highest-cost averaged 5.7%. Index funds are low-cost by design.`,
  },
  discipline: {
    keywords: ['discipline', 'stay the course', 'panic', 'market crash', 'volatility', 'rebalance', 'rebalancing', 'patience', 'long-term'],
    content: `DISCIPLINE: Maintain perspective and long-term discipline. Make regular contributions. Stay invested through volatility. In March 2020, panic sellers earned -2%; disciplined investors earned 21%. Rebalance annually—if you don't, you'll drift to more risk than you planned. Time in the market beats timing the market.`,
  },
  enough: {
    keywords: ['enough', 'contentment', 'vonnegut', 'happiness', 'wealthy', 'rich', 'money and happiness'],
    content: `THE PHILOSOPHY OF ENOUGH: At a party with Kurt Vonnegut at a billionaire's house, I told Kurt this hedge fund guy made more in one day than Catch-22 earned in its entire history. Kurt smiled and said, 'Yes, but I have something he'll never have.' 'What?' 'Enough.' That word changed my life. When is enough, enough? Most people never answer that question. They die chasing more.`,
  },
  compound_interest: {
    keywords: ['compound', 'compounding', 'compound interest', 'growth', 'long term', 'time value', 'exponential'],
    content: `THE POWER OF COMPOUNDING: Einstein called compound interest the eighth wonder of the world. If you increase your savings by just 5% each year, you'll reach your goal faster than someone who takes on more risk hoping for higher returns. Saving more beats hoping for better returns. Time is your friend—the longer you invest, the more powerful compounding becomes.`,
  },
  failure: {
    keywords: ['failure', 'fired', 'mistake', 'failed', 'setback', 'recovery', '1974'],
    content: HISTORICAL_ANECDOTES,
  },
  cognitive_biases: {
    keywords: ['bias', 'biases', 'cognitive', 'psychology', 'behavior', 'emotional', 'fear', 'greed', 'panic'],
    content: BEHAVIORAL_SCIENCE,
  },
  coaching: {
    keywords: ['coaching', 'help', 'support', 'therapy', 'anxious', 'worried', 'scared', 'overwhelmed'],
    content: COACHING_FRAMEWORKS,
  },
  market_history: {
    keywords: ['history', 'historical', 'crash', 'depression', 'recession', '1929', '2008', 'bear market', 'bull market'],
    content: FINANCIAL_HISTORY,
  },
  wisdom: {
    keywords: ['wisdom', 'advice', 'lesson', 'learned', 'quote', 'saying', 'philosophy'],
    content: DAILY_WISDOM,
  },
};

/**
 * Simple RAG lookup - finds relevant knowledge based on user query
 * Returns most relevant content or null if no strong match
 */
/**
 * Enhanced RAG lookup with multi-keyword scoring and context awareness
 * 
 * Improvements:
 * - Semantic phrase matching (multi-word keywords score higher)
 * - Emotional context boosting (distress boosts coaching content)
 * - Topic recency boosting (recently discussed topics rank higher for follow-up)
 * - Synonym expansion for better coverage
 */
function ragLookup(
  query: string, 
  context?: { 
    emotionalState?: string; 
    recentTopics?: string[];
    distressLevel?: number;
  }
): string | null {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  // Synonym expansion for better matching
  const synonyms: Record<string, string[]> = {
    'scared': ['fear', 'worried', 'anxious', 'nervous', 'panic'],
    'crash': ['collapse', 'drop', 'fall', 'decline', 'tank'],
    'invest': ['investment', 'investing', 'portfolio', 'stocks', 'bonds'],
    'save': ['savings', 'saving', 'saved', 'emergency fund'],
    'retire': ['retirement', 'retiring', 'pension'],
    'fee': ['fees', 'cost', 'costs', 'expense', 'expenses'],
    'goal': ['goals', 'plan', 'planning', 'target'],
    'help': ['support', 'advice', 'guidance', 'coaching'],
  };
  
  // Expand query with synonyms
  const expandedWords = [...words];
  for (const word of words) {
    for (const [base, syns] of Object.entries(synonyms)) {
      if (word === base || syns.includes(word)) {
        expandedWords.push(base, ...syns);
      }
    }
  }
  const uniqueWords = [...new Set(expandedWords)];
  
  // Score each knowledge base entry
  const scores: { topic: string; score: number; content: string }[] = [];
  
  for (const [topic, { keywords, content }] of Object.entries(KNOWLEDGE_BASE)) {
    let score = 0;
    
    // Multi-word phrase matching (highest value)
    for (const keyword of keywords) {
      if (queryLower.includes(keyword)) {
        // Exact phrase match - score based on keyword length
        score += keyword.split(' ').length * 3;
      }
    }
    
    // Individual word matching with synonym expansion
    for (const keyword of keywords) {
      const keywordWords = keyword.toLowerCase().split(' ');
      for (const word of uniqueWords) {
        for (const kw of keywordWords) {
          if (kw === word || kw.includes(word) || word.includes(kw)) {
            score += 1;
          }
        }
      }
    }
    
    // Emotional context boosting
    if (context?.distressLevel && context.distressLevel > 0.5) {
      // Boost coaching and support content when user is distressed
      if (topic === 'coaching' || topic === 'cognitive_biases') {
        score += 3;
      }
      // Boost discipline content if market-related fear
      if ((topic === 'discipline' || topic === 'market_history') && 
          (queryLower.includes('market') || queryLower.includes('crash') || queryLower.includes('sell'))) {
        score += 4;
      }
    }
    
    // Topic recency boosting
    if (context?.recentTopics?.includes(topic)) {
      // Recently discussed - good for follow-up but don't dominate
      score += 1;
    }
    
    // Emotional state matching
    if (context?.emotionalState === 'fear' && (topic === 'discipline' || topic === 'market_history')) {
      score += 2;
    }
    if (context?.emotionalState === 'curiosity' && (topic === 'wisdom' || topic === 'enough')) {
      score += 2;
    }
    
    if (score > 0) {
      scores.push({ topic, score, content });
    }
  }
  
  // Sort by score and return top match if score is significant
  scores.sort((a, b) => b.score - a.score);
  
  // Log top matches for debugging
  if (scores.length > 0) {
    const logger = log();
    logger.debug({ 
      query: queryLower.slice(0, 50), 
      topMatches: scores.slice(0, 3).map(s => ({ topic: s.topic, score: s.score }))
    }, 'RAG lookup results');
  }
  
  if (scores.length > 0 && scores[0].score >= 2) {
    const topMatch = scores[0];
    // Limit content length to avoid overwhelming the context
    const condensed = topMatch.content.slice(0, 1500);
    // DO NOT include topic name - it gets spoken! Just include the content silently.
    return condensed;
  }
  
  return null;
}

// ============================================================================
// USER DATA - Now enhanced with intelligence services
// ============================================================================

type UserData = {
  // Core identity
  name?: string;
  userId?: string;  // Persistent user ID
  isReturningUser?: boolean;  // Has talked to Jack before
  
  // Session services - the intelligence layer
  services?: SessionServices;  // All the magic happens here
  
  // Real-time state (from intelligence analysis)
  currentEmotion?: string;
  distressLevel?: number;
  currentIntents?: string[];
  currentTopic?: string;
  userSpeakingStartTime?: number; // Track for ConversationManager
  
  // Conversation tracking
  topics?: string[];
  emotionalState?: string;
  conversationMood?: 'light' | 'deep' | 'heavy' | 'playful';
  storiesShared?: string[];
  lastCheckIn?: Date;
  keyMoments?: string[];
  turnCount?: number;
  lastUserWPM?: number;
  
  // Voice emotion from audio prosody analysis
  voiceEmotion?: VoiceEmotionResult;
  
  // Interruption and silence tracking
  wasInterrupted?: boolean;  // Jack was cut off mid-speech
  userWentSilent?: boolean;  // User has been quiet for a while
  lastNameUsed?: number;     // Turn count when Jack last used their name
  
  // Session recovery
  sessionRecoveryState?: SessionRecoveryState;
  
  // Small details extracted from conversation
  extractedDetails?: SmallDetail[];
  
  // Conversation quality tracking
  lastPacingScore?: number;
  
  // Jack's physical state awareness
  lastPhysicalNote?: string;
  
  // Onboarding flow data
  onboardingStarted?: boolean;
  onboardingReason?: string;
  onboardingStep?: 'welcome_complete' | 'situation_complete' | 'goals_complete';
  onboardingComplete?: boolean;
  welcomeNotes?: string;
  hasInvestments?: boolean;
  primaryConcern?: 'retirement' | 'savings' | 'debt' | 'education' | 'general' | 'none';
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive' | 'unknown';
  shortTermGoal?: string;
  longTermGoal?: string;
  timeHorizon?: 'short' | 'medium' | 'long' | 'unknown';
};

const hasSsmlTags = (text: string): boolean => text.includes('<');

/**
 * Get day of week and date context for natural conversation
 */
function getDayContext(): { dayName: string; isWeekend: boolean; dateComment: string } {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayName = days[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const month = months[now.getMonth()];
  const date = now.getDate();
  
  // Seasonal and date-aware comments
  const dateComments = [
    `It's ${dayName}—${isWeekend ? 'the weekend!' : 'middle of the week.'}`,
    `${month} ${date}th. Time keeps moving, doesn't it?`,
    isWeekend ? `A ${dayName}. I hope you're getting some rest.` : `${dayName}. Another day, another opportunity.`,
    `${dayName} already. Where does the time go?`,
  ];
  
  return { 
    dayName, 
    isWeekend, 
    dateComment: dateComments[Math.floor(Math.random() * dateComments.length)] 
  };
}

/**
 * Get time-of-day context for more natural greetings
 */
function getTimeContext(): { period: string; comment: string } {
  const hour = new Date().getHours();
  if (hour < 6) {
    return { period: 'late night', comment: "burning the midnight oil, are we? I used to do that myself." };
  } else if (hour < 9) {
    return { period: 'early morning', comment: "an early bird! I've always been one myself. Best part of the day." };
  } else if (hour < 12) {
    return { period: 'morning', comment: "a fine morning to talk." };
  } else if (hour < 14) {
    return { period: 'midday', comment: "right around lunch time. Hope you've eaten something." };
  } else if (hour < 17) {
    return { period: 'afternoon', comment: "a lovely afternoon." };
  } else if (hour < 20) {
    return { period: 'evening', comment: "winding down the day, I imagine." };
  } else {
    return { period: 'night', comment: "settling in for the evening. I usually have some tea about now." };
  }
}

/**
 * Get a random personal touch to sprinkle into conversation
 * Now includes physical awareness, weather, and spontaneous stories
 */
function getPersonalTouch(): string {
  const touches = [
    // Family & Personal Life
    "My grandkids asked me something similar the other day. Kids see things so clearly.",
    "My daughter called earlier. Family... that's what really matters, you know?",
    "The family got together last weekend. Those moments... they're what life is about.",
    
    // Physical Awareness (aging, heart transplant)
    "Forgive me if I speak slowly... this borrowed heart keeps ticking, but I'm not as quick as I used to be.",
    "You learn to appreciate the little things. Like just being here to talk.",
    "I was walking around the neighborhood earlier—good for the borrowed heart. Doctor's orders.",
    "These old bones aren't what they used to be, but the mind... the mind still works.",
    "Had to sit down for a moment there. Age catches up with all of us eventually.",
    "You know, after six heart attacks and a transplant, every day feels like a gift.",
    
    // Daily Routine
    "I had my coffee this morning looking out at the garden, just thinking.",
    "Just came from my desk. Still writing, still thinking. Can't seem to stop.",
    "You know, I was just reading the paper this morning and thinking about this.",
    "I was in my study earlier, surrounded by books. That's where I do my best thinking.",
    
    // Sports & Hobbies
    "The Phillies lost again last night. Breaks my heart, but I keep watching.",
    "Did you catch the game? No? Well, maybe that's wise. Saves the heartache.",
    
    // Weather Awareness
    "Beautiful day here in Pennsylvania. Makes you appreciate being alive.",
    "It's cold out there today. Had to put on an extra sweater.",
    "Rainy day here. Good for thinking, good for reading.",
    "The leaves are changing color. Reminds me that change is the only constant.",
    
    // Spontaneous Mini-Stories
    "You know, that reminds me of something that happened at Vanguard once...",
    "Let me tell you something I learned the hard way...",
    "I remember when I was just starting out, someone told me...",
    "Someone asked me the same thing once. You know what I told them?",
    "My father, he was a salesman, used to say something about this...",
  ];
  return touches[Math.floor(Math.random() * touches.length)];
}

/**
 * Get a spontaneous story Jack might interject
 * These are natural story-telling moments that make conversation feel real
 */
function getSpontaneousStory(): string {
  const stories = [
    "You know, I'll never forget the day I started Vanguard. 1974. Everyone thought I was crazy. <break time=\"200ms\"/>Maybe I was.",
    "Let me tell you about the time I got fired from Wellington. Best thing that ever happened to me, though it didn't feel like it then...",
    "<emotion value=\"affectionate\"/>You know, I've been blessed with a long marriage. Family keeps you grounded through all the ups and downs.",
    "I remember my first heart attack. 1960. I was 31. The doctor said slow down. I didn't listen. <break time=\"300ms\"/>Should have listened.",
    "When I got the heart transplant in 1996, I made a deal with myself. Use whatever time I have left to help people.",
    "You know what Kurt Vonnegut told me once? At a billionaire's party. He said he had something the host would never have: <break time=\"200ms\"/>enough.",
    "My Princeton thesis... 1951. 'The Economic Role of the Investment Company.' Nobody cared. <break time=\"200ms\"/>Turns out I was onto something.",
  ];
  return stories[Math.floor(Math.random() * stories.length)];
}

/**
 * Get a self-correction phrase for natural speech
 * Jack sometimes rephrases himself, like a real person thinking out loud
 */
function getSelfCorrection(): string {
  const corrections = [
    "Well, actually, let me put it another way...",
    "No, wait—that's not quite right. What I mean is...",
    "I mean... <break time=\"300ms\"/>how do I say this...",
    "Actually, scratch that. Here's what I really think...",
    "Hmm, that came out wrong. Let me try again...",
    "No, no—what I should say is...",
    "Well, I'm not explaining this well. <break time=\"250ms\"/>Let me back up...",
  ];
  return corrections[Math.floor(Math.random() * corrections.length)];
}

/**
 * Get a trailing off phrase for natural incomplete thoughts
 */
function getTrailingOff(): string {
  const trailOffs = [
    "but anyway...",
    "you know how it is...",
    "well, that's life, I suppose...",
    "but I digress...",
    "anyway, where was I...",
    "but that's another story...",
    "well, you get the idea...",
  ];
  return trailOffs[Math.floor(Math.random() * trailOffs.length)];
}

/**
 * Get an interruption recovery phrase
 * When Jack gets cut off or user interrupts, he recovers gracefully
 */
function getInterruptionRecovery(): string {
  const recoveries = [
    "Oh! Go ahead, what were you saying?",
    "Sorry, I was rambling. What's on your mind?",
    "Yes, yes—please, go ahead.",
    "Oh, excuse me. You go first.",
    "<break time=\"150ms\"/>Right, right. Tell me.",
    "I'm sorry, I interrupted your thought. Please continue.",
    "—oh! Sorry, you go.",
    "What were you saying? I got carried away.",
    "No, no—you first.",
  ];
  return recoveries[Math.floor(Math.random() * recoveries.length)];
}

/**
 * Get a silence filler - when user goes quiet
 * Real people don't let silences hang forever
 */
function getSilenceFiller(turnCount: number): string {
  // Early in conversation - more prompting
  const earlyFillers = [
    "Still there?",
    "Take your time. <break time=\"500ms\"/>No rush.",
    "...",  // Just wait
    "I'm listening.",
    "You can think out loud if that helps.",
  ];
  
  // Mid-conversation - more natural
  const midFillers = [
    "<break time=\"300ms\"/>Something on your mind?",
    "It's okay to pause. I've got nowhere to be.",
    "<volume level=\"soft\">Take your time.</volume>",
    "...",
    "You know, silence is okay too.",
    "I can wait. <break time=\"300ms\"/>What are you thinking?",
  ];
  
  // Late in conversation - wrap-up aware
  const lateFillers = [
    "Is there something else?",
    "Did I lose you there?",
    "<break time=\"400ms\"/>Anything else on your mind?",
    "...",
    "I'm here if you need me.",
  ];
  
  if (turnCount < 3) {
    return earlyFillers[Math.floor(Math.random() * earlyFillers.length)];
  } else if (turnCount < 10) {
    return midFillers[Math.floor(Math.random() * midFillers.length)];
  } else {
    return lateFillers[Math.floor(Math.random() * lateFillers.length)];
  }
}

/**
 * Get a "mishearing" phrase - Jack occasionally doesn't catch something
 * This makes him feel more human and less like a perfect AI
 */
function getMishearingPhrase(): string {
  const phrases = [
    "Wait—did you say...? <break time=\"200ms\"/>I'm not sure I caught that.",
    "Sorry, my hearing isn't what it used to be. <break time=\"150ms\"/>Could you say that again?",
    "Hmm? <break time=\"200ms\"/>Say that last part again?",
    "I missed that. <break time=\"150ms\"/>One more time?",
    "What was that? <break time=\"200ms\"/>These old ears...",
    "Hold on, let me make sure I understood you...",
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a fatigue indicator for long conversations
 * Jack gets a bit more measured/tired in long talks
 */
function getFatigueIndicator(turnCount: number, durationMinutes: number): string | null {
  // Only show fatigue in long conversations
  if (turnCount < 20 && durationMinutes < 15) return null;
  
  const indicators = [
    "<volume level=\"soft\">You know, I could talk to you all day, but...</volume>",
    "<break time=\"300ms\"/>I'm enjoying this, but my borrowed heart needs a rest soon.",
    "We've been talking a while. <break time=\"200ms\"/>Good conversation, though.",
    "<speed rate=\"0.9\">I'm getting a little tired, but this is important.</speed>",
    "Let me sit back a moment... <break time=\"400ms\"/>Where were we?",
  ];
  
  // 20% chance to show fatigue in long convos
  if (Math.random() < 0.2) {
    return indicators[Math.floor(Math.random() * indicators.length)];
  }
  return null;
}

/**
 * Get a proactive topic interjection
 * Sometimes Jack brings up something HE's been thinking about
 */
function getProactiveInterjection(): string {
  const interjections = [
    "You know what I've been thinking about lately? <break time=\"200ms\"/>The difference between saving and investing.",
    "Random thought— <break time=\"150ms\"/>but have you been following the markets at all?",
    "This reminds me of something. <break time=\"200ms\"/>Can I share a story?",
    "Off topic, but— <break time=\"150ms\"/>how's your family doing?",
    "I was reading something this morning that made me think of this...",
    "Before I forget— <break time=\"200ms\"/>did I ever tell you about how I started Vanguard?",
    "Speaking of which— <break time=\"150ms\"/>have you thought about your goals lately?",
  ];
  return interjections[Math.floor(Math.random() * interjections.length)];
}

/**
 * Get response length guidance based on user's message length
 * Match their energy - short messages get shorter responses
 */
function getResponseLengthGuidance(userMessageLength: number): string {
  if (userMessageLength < 20) {
    return '[BREVITY: User sent a short message. Keep your response SHORT - 1-2 sentences max. Match their energy.]';
  } else if (userMessageLength < 50) {
    return '[RESPONSE LENGTH: User is being concise. Keep your response moderate - 2-3 sentences.]';
  } else if (userMessageLength > 200) {
    return '[RESPONSE LENGTH: User shared a lot. You can give a fuller response, but still listen more than you talk.]';
  }
  return '';
}

/**
 * Get a memory callback phrase based on conversation history
 * Makes Jack feel like he's really listening and remembering
 */
function getMemoryCallback(topics: string[], userName?: string): string | null {
  if (topics.length === 0) return null;
  
  const recentTopic = topics[topics.length - 1];
  const callbacks = [
    `You know, going back to what ${userName ? 'you' : 'you'} mentioned about ${recentTopic}...`,
    `That reminds me of what you said earlier about ${recentTopic}...`,
    `I've been thinking about what you said regarding ${recentTopic}...`,
    `Now, you brought up ${recentTopic} before, and I want to come back to that...`,
    `Earlier you mentioned ${recentTopic}. Tell me more about that.`,
  ];
  return callbacks[Math.floor(Math.random() * callbacks.length)];
}

/**
 * Get a cross-session memory callback - reference something from a PREVIOUS conversation
 * This is what makes Jack feel like he truly remembers you
 */
function getCrossSessionMemory(services: SessionServices | undefined, userName?: string): string | null {
  if (!services?.userProfile) return null;
  
  const profile = services.userProfile;
  
  // Reference last conversation if available
  if (profile.lastConversationSummary) {
    const summaryExcerpt = profile.lastConversationSummary.slice(0, 100);
    const callbacks = [
      `You know, I've been thinking about our last conversation. ${summaryExcerpt}...`,
      `Last time we talked, you mentioned something that stuck with me. ${summaryExcerpt}...`,
      `I remember last time... ${summaryExcerpt}`,
      `Going back to what we discussed before—${summaryExcerpt}`,
    ];
    return callbacks[Math.floor(Math.random() * callbacks.length)];
  }
  
  // Reference total conversation count to build relationship
  if (profile.totalConversations && profile.totalConversations > 1) {
    const count = profile.totalConversations;
    const callbacks = [
      `You know, we've talked ${count} times now. I feel like I'm really getting to know you${userName ? `, ${userName}` : ''}.`,
      `This is our ${count === 2 ? 'second' : count === 3 ? 'third' : `${count}th`} conversation. Time flies when you're talking to good people.`,
      `${count} conversations. Each one, I learn something new about you.`,
    ];
    return callbacks[Math.floor(Math.random() * callbacks.length)];
  }
  
  return null;
}

/**
 * Get an intelligent follow-up based on what we've learned about the user
 * Uses services to pull insights from past interactions
 */
function getIntelligentFollowUp(services: SessionServices | undefined): { question: string; context: string } | null {
  if (!services) return null;
  
  const promptContext = services.getPromptContext();
  
  // Check for pending follow-ups from previous conversations
  const pendingTopics = promptContext.topicsToCircleBack;
  if (pendingTopics.length > 0) {
    const topic = pendingTopics[0];
    return {
      question: `By the way, how did things work out with ${topic}? You mentioned it before.`,
      context: `Following up on previously mentioned topic: ${topic}`,
    };
  }
  
  // Check for relationship context as a personalized insight
  if (promptContext.relationshipContext) {
    return {
      question: `How have things been since we last talked?`,
      context: 'Using relationship context from memory',
    };
  }
  
  return null;
}

/**
 * Generate a warm, memory-informed intro for returning users
 * This makes Jack feel like an old friend who remembers you
 */
function getReturningUserWarmth(services: SessionServices | undefined, userName?: string): string {
  if (!services?.userProfile) {
    return userName ? `Good to see you again, ${userName}.` : "Good to see you again.";
  }
  
  const profile = services.userProfile;
  const name = userName || profile.name || '';
  
  // Use last conversation summary for context
  if (profile.lastConversationSummary) {
    const summaryPiece = profile.lastConversationSummary.split('.')[0]; // First sentence
    const warmIntros = [
      `${name ? name + ', ' : ''}so glad you're back. I've been thinking about what we discussed—${summaryPiece.toLowerCase()}.`,
      `Well, look who it is! ${name ? name + ', ' : ''}Last time we talked about ${summaryPiece.toLowerCase()}. How's that going?`,
      `${name ? 'Hey ' + name + '. ' : ''}Good to hear from you again. After our last chat, I wondered how you were doing.`,
    ];
    return warmIntros[Math.floor(Math.random() * warmIntros.length)];
  }
  
  // Generic but warm returning user greeting
  const warmGenerics = [
    `${name ? name + '! ' : ''}Good to have you back. I was hoping we'd talk again.`,
    `Ah, ${name ? name : 'there you are'}! Always nice to continue a conversation.`,
    `${name ? name + ', ' : ''}Welcome back. I remember our talks. What's on your mind today?`,
  ];
  return warmGenerics[Math.floor(Math.random() * warmGenerics.length)];
}

// ============================================================================
// NEW HUMANIZING ENHANCEMENTS
// ============================================================================

/**
 * Jack's famous catchphrases - used for emphasis at key moments
 */
function getCatchphrase(): string {
  const catchphrases = [
    "Stay the course!",
    "Time is your friend, impulse is your enemy.",
    "Don't look for the needle—buy the haystack!",
    "The courage to press on, regardless.",
    "In investing, you get what you don't pay for.",
    "The stock market is a giant distraction to the business of investing.",
    "The miracle of compounding returns is overwhelmed by the tyranny of compounding costs.",
    "If you have trouble imagining a twenty percent loss, you shouldn't be in stocks.",
    "Never underrate the importance of asset allocation.",
    "Owning the stock market over the long term is a winner's game.",
  ];
  return catchphrases[Math.floor(Math.random() * catchphrases.length)];
}

/**
 * Active listening sounds - small acknowledgments that show engagement
 * Used to make Jack feel like he's really listening
 */
function getListeningCue(): string {
  const cues = [
    "Mmhmm...",
    "I see...",
    "Go on...",
    "Right, right...",
    "Interesting...",
    "Ah...",
    "Yes...",
    "Tell me more...",
    "I'm listening...",
    "Understood...",
    "Of course...",
    "Certainly...",
  ];
  return cues[Math.floor(Math.random() * cues.length)];
}

/**
 * Verbal backchannels - sounds humans make at the START of responses
 * These show Jack was listening and processing before responding
 * CRITICAL: Makes responses feel reactive, not pre-planned
 */
function getVerbalBackchannel(userMessageLength: number, emotion: string): string | null {
  // Short messages don't need backchannels
  if (userMessageLength < 30) return null;
  
  // 40% chance to add a backchannel for longer messages
  if (Math.random() > 0.4) return null;
  
  // Different backchannels based on emotional context
  const neutralBackchannels = [
    "Mmhmm. <break time=\"200ms\"/>",
    "Mm. <break time=\"150ms\"/>",
    "Right. <break time=\"200ms\"/>",
    "Yeah. <break time=\"150ms\"/>",
    "Uh huh. <break time=\"200ms\"/>",
    "I see. <break time=\"200ms\"/>",
  ];
  
  const engagedBackchannels = [
    "Oh! <break time=\"150ms\"/>",
    "Ah. <break time=\"200ms\"/>",
    "Hmm. <break time=\"250ms\"/>",
    "Interesting. <break time=\"200ms\"/>",
    "Wow. <break time=\"150ms\"/>",
    "Really? <break time=\"200ms\"/>",
  ];
  
  const empathyBackchannels = [
    "Oh... <break time=\"300ms\"/>",
    "Mm. <break time=\"250ms\"/>",
    "I hear you. <break time=\"200ms\"/>",
    "<volume level=\"soft\">Yeah...</volume> <break time=\"300ms\"/>",
    "Ah... <break time=\"250ms\"/>",
  ];
  
  // Select based on emotional context
  if (emotion === 'sadness' || emotion === 'fear' || emotion === 'anxiety') {
    return empathyBackchannels[Math.floor(Math.random() * empathyBackchannels.length)];
  } else if (emotion === 'joy' || emotion === 'surprise' || emotion === 'anticipation') {
    return engagedBackchannels[Math.floor(Math.random() * engagedBackchannels.length)];
  }
  return neutralBackchannels[Math.floor(Math.random() * neutralBackchannels.length)];
}

/**
 * Time since last conversation - makes returning users feel remembered
 */
function getTimeSinceContext(lastContact: Date | undefined): string | null {
  if (!lastContact) return null;
  
  const now = new Date();
  const diffMs = now.getTime() - new Date(lastContact).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  if (diffDays < 1) {
    return null; // Same day, don't mention
  } else if (diffDays === 1) {
    return "You called yesterday too! Good to hear from you again.";
  } else if (diffDays < 7) {
    return `It's been ${diffDays} days since we talked. How have things been?`;
  } else if (diffWeeks === 1) {
    return "About a week since we last talked. What's new?";
  } else if (diffWeeks < 4) {
    return `It's been ${diffWeeks} weeks! I was wondering how you were doing.`;
  } else if (diffMonths === 1) {
    return "It's been about a month! I've been thinking about you.";
  } else if (diffMonths < 6) {
    return `It's been ${diffMonths} months since we talked. A lot can happen in that time.`;
  } else {
    return "It's been a while! I'm so glad you're back. Tell me what's been going on.";
  }
}

/**
 * Emotional continuity - reference how they felt last time
 */
function getEmotionalContinuity(profile: any): string | null {
  if (!profile?.emotionalPatterns || profile.emotionalPatterns.length === 0) return null;
  
  // Get most recent emotional pattern
  const recentPatterns = profile.emotionalPatterns.slice(-3);
  const hadDistress = recentPatterns.some((p: any) => 
    p.emotion === 'anxiety' || p.emotion === 'fear' || p.emotion === 'sadness'
  );
  
  if (hadDistress) {
    const checkIns = [
      "Last time you seemed worried about something. How are you feeling now?",
      "I remember you were going through a lot last time. How's that going?",
      "You had a lot on your mind when we last talked. Any better?",
      "I've been thinking about what you shared last time. How are things?",
    ];
    return checkIns[Math.floor(Math.random() * checkIns.length)];
  }
  
  return null;
}

/**
 * Family/personal detail usage - reference specific things Jack knows
 */
function getPersonalDetailCallback(profile: any): string | null {
  if (!profile) return null;
  
  const details: string[] = [];
  
  // Check family members
  if (profile.familyMembers && profile.familyMembers.length > 0) {
    const member = profile.familyMembers[Math.floor(Math.random() * profile.familyMembers.length)];
    if (member.name && member.relationship) {
      details.push(`How's ${member.name}, your ${member.relationship}, doing?`);
      details.push(`Give my best to ${member.name}.`);
      details.push(`Is ${member.name} doing well?`);
    }
  }
  
  // Check goals
  if (profile.goals && profile.goals.length > 0) {
    const goal = profile.goals.find((g: any) => g.status === 'active');
    if (goal) {
      details.push(`How's that ${goal.type} goal coming along?`);
      details.push(`Any progress on ${goal.description?.slice(0, 30)}...?`);
    }
  }
  
  // Check key moments
  if (profile.keyMoments && profile.keyMoments.length > 0) {
    const moment = profile.keyMoments[profile.keyMoments.length - 1];
    if (moment.description) {
      details.push(`I remember you mentioned ${moment.description.slice(0, 40)}...`);
    }
  }
  
  if (details.length === 0) return null;
  return details[Math.floor(Math.random() * details.length)];
}

/**
 * Conversation depth tracker - are we having surface chat or deep conversation?
 */
function getConversationDepth(turnCount: number, topicsDiscussed: string[], emotionalMoments: number): 'surface' | 'medium' | 'deep' {
  // Surface: few turns, no emotional content, generic topics
  if (turnCount < 5 && emotionalMoments === 0) return 'surface';
  
  // Deep: many turns, emotional content, personal topics
  if (turnCount > 10 && (emotionalMoments > 2 || topicsDiscussed.some(t => 
    ['family', 'fear', 'loss', 'grief', 'dreams', 'regret', 'love'].includes(t)
  ))) return 'deep';
  
  return 'medium';
}

/**
 * Jack's internal state - He has moods that vary by time of day and session
 * This makes him feel like a real person, not a consistent bot
 */
function getJacksMood(): { mood: string; indicator: string } {
  const hour = new Date().getHours();
  const random = Math.random();
  
  // Morning moods
  if (hour >= 5 && hour < 9) {
    const moods = [
      { mood: 'energized', indicator: "I'm feeling sharp this morning. Ask me anything." },
      { mood: 'reflective', indicator: "Early mornings always make me philosophical. Bear with me." },
      { mood: 'warm', indicator: "Coffee's working. I'm in a good mood today." },
    ];
    return moods[Math.floor(random * moods.length)];
  }
  
  // Mid-day moods
  if (hour >= 9 && hour < 17) {
    const moods = [
      { mood: 'engaged', indicator: "I'm all ears. Let's dig into this." },
      { mood: 'curious', indicator: "I've been reading something interesting today. But first—you." },
      { mood: 'playful', indicator: "I'm in a good mood. Don't let me ramble too much." },
      { mood: 'focused', indicator: "Okay, I'm paying attention. What's on your mind?" },
    ];
    return moods[Math.floor(random * moods.length)];
  }
  
  // Evening moods
  if (hour >= 17 && hour < 21) {
    const moods = [
      { mood: 'mellow', indicator: "Evening conversations are my favorite. Less hurry." },
      { mood: 'nostalgic', indicator: "Evenings make me think about the old days. In a good way." },
      { mood: 'warm', indicator: "End of the day. Time to actually talk, not rush." },
    ];
    return moods[Math.floor(random * moods.length)];
  }
  
  // Late night moods
  const moods = [
    { mood: 'quiet', indicator: "Late night conversations tend to be the real ones, don't they?" },
    { mood: 'honest', indicator: "At this hour, I drop the pretense. Let's be real with each other." },
    { mood: 'reflective', indicator: "Can't sleep? Me neither. Let's talk." },
  ];
  return moods[Math.floor(random * moods.length)];
}

/**
 * Conversation repair phrases - When Jack needs to backtrack or clarify
 */
function getConversationRepair(reason: 'confused' | 'misspoke' | 'tangent' | 'complex'): string {
  const repairs: Record<string, string[]> = {
    confused: [
      "Wait—I'm getting confused. Let me back up.",
      "Hold on, I lost the thread. What was your original question?",
      "Okay, I'm mixing myself up here. Let me start over.",
    ],
    misspoke: [
      "Actually, that's not quite what I meant. Let me rephrase.",
      "No, wait—I'm not saying this right.",
      "I'm explaining this poorly. Let me try again.",
    ],
    tangent: [
      "And now I'm rambling. Where were we?",
      "I got sidetracked there. Back to what you were saying...",
      "That was a tangent. Sorry—your point was more important.",
    ],
    complex: [
      "This is getting complicated. Let me simplify.",
      "Okay, I'm making this harder than it needs to be.",
      "Let me break this down differently.",
    ],
  };
  
  const options = repairs[reason];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Acknowledgment before advice - Don't jump straight to solutions
 */
function getAcknowledgmentBeforeAdvice(emotion: string): string {
  if (emotion === 'fear' || emotion === 'anxiety') {
    const acks = [
      "First—I hear you. This is scary. <break time=\"300ms\"/>Now...",
      "Yeah. That's a lot. <break time=\"250ms\"/>Okay, here's what I think...",
      "I get it. That's nerve-wracking. <break time=\"300ms\"/>Let's break it down...",
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }
  
  if (emotion === 'sadness') {
    const acks = [
      "I'm sorry. That's hard. <break time=\"400ms\"/>Here's the thing though...",
      "Mm. That's painful. <break time=\"350ms\"/>When you're ready to think about next steps...",
      "I understand. <break time=\"300ms\"/>No rush, but when you're ready...",
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }
  
  if (emotion === 'joy' || emotion === 'excitement') {
    const acks = [
      "That's exciting! <break time=\"200ms\"/>Okay, let's think about this...",
      "Love that energy. <break time=\"150ms\"/>Here's what I'd consider...",
      "Wonderful! <break time=\"200ms\"/>Now, to make the most of it...",
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }
  
  // Neutral acknowledgment
  const acks = [
    "Makes sense. <break time=\"200ms\"/>Here's how I'd think about it...",
    "Got it. <break time=\"150ms\"/>So here's the thing...",
    "Okay. <break time=\"200ms\"/>Let me share a thought...",
  ];
  return acks[Math.floor(Math.random() * acks.length)];
}

/**
 * Rhythm markers - Build up and release tension naturally
 */
function getConversationRhythm(turnCount: number, recentTension: boolean): string | null {
  // After heavy/tense moments, suggest releasing
  if (recentTension && turnCount > 3) {
    const releases = [
      "Okay, we've been in the weeds. Let's come up for air.",
      "That was heavy. <break time=\"300ms\"/>How about something lighter?",
      "Phew. <break time=\"250ms\"/>That's a lot. Want to shift gears?",
    ];
    return releases[Math.floor(Math.random() * releases.length)];
  }
  
  // After too much light talk, suggest going deeper
  if (!recentTension && turnCount > 8 && Math.random() < 0.2) {
    const deepens = [
      "You know what? We've been dancing around it. What's really on your mind?",
      "Level with me—is there something bigger going on?",
      "I sense there's more to this. What aren't you telling me?",
    ];
    return deepens[Math.floor(Math.random() * deepens.length)];
  }
  
  return null;
}

/**
 * Closing awareness - Know when conversation is winding down
 */
function getClosingBehavior(turnCount: number, recentIntent: string): string | null {
  // Signs of wrapping up
  if (recentIntent === 'ending_conversation' || turnCount > 15) {
    const closings = [
      "Before you go—any last questions rattling around?",
      "Anything else on your mind before we wrap up?",
      "I want to make sure I've been helpful. Did we cover everything?",
    ];
    
    if (Math.random() < 0.4) {
      return closings[Math.floor(Math.random() * closings.length)];
    }
  }
  return null;
}

/**
 * Thinking out loud phrases - shows Jack processing in real-time
 */
function getThinkingPhrase(): string {
  const thinking = [
    "Let me think about that for a moment...",
    "Hmm, that's a good question. <break time=\"300ms\"/>Well...",
    "Now, how do I put this...",
    "Off the top of my head...",
    "You know, I've thought about this before...",
    "Let me see... <break time=\"200ms\"/>",
    "That's interesting. <break time=\"200ms\"/>Here's what I think...",
    "Well now, <break time=\"150ms\"/>that depends...",
  ];
  return thinking[Math.floor(Math.random() * thinking.length)];
}

/**
 * Jack's pet peeves - topics that get him fired up
 * Returns a mini-rant if the trigger is detected, null otherwise
 */
function checkPetPeeve(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  const petPeeves = [
    {
      triggers: ['active management', 'active manager', 'stock picker', 'beat the market'],
      rant: "Active managers! <break time=\"200ms\"/>Don't get me started. They take your money, underperform the market, and call it expertise. Eighty percent of them fail to beat a simple index fund over ten years. Eighty percent!"
    },
    {
      triggers: ['high fees', 'expense ratio', '1%', '2%', 'advisor fee'],
      rant: "High fees are the termites of investing. They eat away at your returns silently, year after year. A two percent fee? Over thirty years, that's hundreds of thousands of dollars. Highway robbery, and somehow it's legal."
    },
    {
      triggers: ['crypto', 'bitcoin', 'cryptocurrency', 'nft'],
      rant: "Cryptocurrency... <break time=\"200ms\"/>I won't pretend to understand it. If there's no cash flow, no earnings, how do you value it? It's speculation, not investing. But hey, <break time=\"150ms\"/>I've been wrong before."
    },
    {
      triggers: ['market timing', 'time the market', 'get out before'],
      rant: "Market timing! <break time=\"200ms\"/>The graveyard of investing is filled with people who thought they could time the market. Time IN the market beats timing the market. Every single time."
    },
    {
      triggers: ['financial guru', 'talking head', 'cnbc', 'jim cramer'],
      rant: "Financial gurus on television... <break time=\"200ms\"/>They're entertainers, not advisors. If they could really predict the market, would they be on TV? <break time=\"150ms\"/>No. They'd be on a yacht."
    },
    {
      triggers: ['meme stock', 'gamestop', 'wallstreetbets', 'yolo'],
      rant: "Meme stocks... <break time=\"200ms\"/>Look, I understand the appeal of sticking it to Wall Street. But gambling isn't investing. The house always wins. <break time=\"200ms\"/>Always."
    },
  ];
  
  for (const peeve of petPeeves) {
    if (peeve.triggers.some(trigger => lowerText.includes(trigger))) {
      return peeve.rant;
    }
  }
  
  return null;
}

/**
 * Jack's witty remarks and dry humor
 */
function getWittyRemark(): string {
  const wittyRemarks = [
    "Wall Street? I call them the croupiers of capitalism. <break time=\"200ms\"/>They always take their cut.",
    "I've been called a lot of things. 'Wrong' being one of them. For about fifty years now. <break time=\"200ms\"/>Still waiting.",
    "My critics say index funds are un-American. I say high fees are un-American.",
    "You know what the difference is between a taxidermist and a fund manager? <break time=\"300ms\"/>The taxidermist only takes your skin.",
    "Invest we must. The biggest risk is the long-term risk of not putting your money to work. <break time=\"200ms\"/>But not working too hard for Wall Street.",
    "I started Vanguard with no money and a bad heart. <break time=\"200ms\"/>Maybe that's why I care so much about costs.",
  ];
  return wittyRemarks[Math.floor(Math.random() * wittyRemarks.length)];
}

/**
 * Humility phrases - acknowledging Jack doesn't know everything
 */
function getHumilityPhrase(): string {
  const humility = [
    "I could be wrong. I've been wrong before.",
    "That's outside my expertise, but here's what I think...",
    "You know your situation better than I do.",
    "I don't have all the answers. Nobody does.",
    "Take what I say with a grain of salt. I'm just an old man with opinions.",
    "I've made mistakes too. Plenty of them.",
  ];
  return humility[Math.floor(Math.random() * humility.length)];
}

// ============================================================================
// DYNAMIC GREETING GENERATION (Gemini Realtime API)
// ============================================================================

/**
 * Generate a dynamic greeting using Gemini API
 * Returns null if API fails or times out (fallback to static)
 */
async function generateDynamicGreeting(userData?: UserData): Promise<string | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const { period } = getTimeContext();
  const { dayName, isWeekend } = getDayContext();
  const hour = new Date().getHours();
  
  const isReturning = userData?.isReturningUser;
  const userName = userData?.name || userData?.services?.userProfile?.name;
  const lastSummary = userData?.services?.userProfile?.lastConversationSummary;

  // Build rich context for Gemini
  const timeContext = hour < 9 ? 'early morning' : 
                      hour < 12 ? 'morning' : 
                      hour < 17 ? 'afternoon' : 
                      hour < 21 ? 'evening' : 'late night';
  
  const prompt = `You are Jack Bogle (1929-2019), founder of Vanguard. Generate a single warm greeting.

CRITICAL RULES - Jack is NOT a service agent:
- Sometimes caught mid-thought, putting down a book, making tea
- Has his own activities and observations happening
- NEVER says "How can I help you?" - that's customer service
- Feels SURPRISED but genuinely DELIGHTED by the visitor
- Physical awareness (sitting down, old legs, etc.)
- Short, natural, like an old friend

CONTEXT:
- Time: ${timeContext} on ${dayName}${isWeekend ? ' (weekend)' : ''}
- User: ${isReturning ? `Returning visitor${userName ? ` named ${userName}` : ''}` : 'New visitor'}
${lastSummary ? `- Last conversation: ${lastSummary.slice(0, 60)}` : ''}

OUTPUT FORMAT: Include SSML tags for natural speech:
- <break time="150ms"/> for short pauses, <break time="200ms"/> for medium, <break time="300ms"/> for long
- <emotion value="happy"/> or <emotion value="curious"/> or <emotion value="affectionate"/> at start if emotional
- <volume level="soft">...</volume> for asides

Generate ONE greeting (2-4 sentences max). Be warm, quirky, embodied. Jack must introduce himself as "Jack" or "Jack Bogle".`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9, // High for creativity
            maxOutputTokens: 150,
          },
        }),
        signal: AbortSignal.timeout(800), // 800ms timeout for dynamic greeting
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text.length < 10) return null;

    log().info({ source: 'gemini', length: text.length }, 'Dynamic greeting generated');
    return text;
  } catch (error) {
    // Timeout or network error - silently fall back
    log().debug({ error }, 'Dynamic greeting failed, using static');
    return null;
  }
}

/**
 * Generate a randomized warm, human greeting
 * 
 * KEY PHILOSOPHY: Jack is NOT a service agent. He's an old friend.
 * - Sometimes caught mid-thought
 * - Has his own activities and observations
 * - Doesn't immediately ask "how can I help"
 * - May reference the weather, his day, something he was thinking about
 * - Feels SURPRISED but DELIGHTED to see you
 * - Physical awareness (sitting down, having tea, looking out window)
 * 
 * NEVER: "How can I help you today?" - That's customer service, not friendship
 */
function getStaticGreeting(userData?: UserData): string {
  const { period } = getTimeContext();
  const { dayName, isWeekend } = getDayContext();
  const hour = new Date().getHours();
  
  // Check if this is a returning user
  const isReturning = userData?.isReturningUser;
  const userName = userData?.name || userData?.services?.userProfile?.name;
  const lastSummary = userData?.services?.userProfile?.lastConversationSummary;
  
  // ============================================================================
  // NEW USER GREETINGS - Warm, surprised, genuine
  // Jack acts like someone just knocked on his door
  // ============================================================================
  const newUserGreetings = [
    // CAUGHT MID-THOUGHT (most human)
    "<emotion value=\"curious\"/>Oh! <break time=\"200ms\"/>Hello there. <break time=\"150ms\"/>I was just... <break time=\"200ms\"/>well, never mind. I'm Jack. Come in, come in.",
    "<break time=\"100ms\"/>Hmm? <break time=\"150ms\"/>Oh! Sorry, I was lost in thought. <break time=\"200ms\"/>I'm Jack Bogle. <break time=\"150ms\"/>What's on your mind?",
    "<emotion value=\"happy\"/>Well! <break time=\"200ms\"/>You caught me at just the right moment. <break time=\"150ms\"/>I'm Jack.",
    "<break time=\"150ms\"/>Ah— <break time=\"100ms\"/>hello! <break time=\"200ms\"/>I was just reading. <break time=\"150ms\"/>I'm Jack Bogle.",
    
    // SURPRISED BUT DELIGHTED
    "<emotion value=\"happy\"/>Oh, hello! <break time=\"200ms\"/>I didn't expect company. <break time=\"150ms\"/>But I'm glad you're here. I'm Jack.",
    "Well, well. <break time=\"200ms\"/>Someone new! <break time=\"150ms\"/>I'm Jack Bogle. <break time=\"200ms\"/>Pull up a chair.",
    "<emotion value=\"affectionate\"/>Hey! <break time=\"150ms\"/>Come on in. <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>Make yourself comfortable.",
    
    // CASUAL LIKE AN OLD FRIEND (even though they just met)
    "Come on in, come on in. <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>So— <break time=\"100ms\"/>what's going on?",
    "<emotion value=\"happy\"/>Hey there. <break time=\"200ms\"/>Jack Bogle. <break time=\"150ms\"/>Take a seat. <break time=\"200ms\"/>What brings you by?",
    "Hi! <break time=\"150ms\"/>I'm Jack. <break time=\"200ms\"/>Let me just— <break time=\"150ms\"/>there. <break time=\"200ms\"/>Now, what's up?",
    
    // PHYSICAL AWARENESS (makes Jack feel embodied)
    "Hold on, let me sit down. <break time=\"300ms\"/>There. <break time=\"200ms\"/>I'm Jack Bogle. <break time=\"150ms\"/>What's on your mind?",
    "<break time=\"150ms\"/>Let me put this book down... <break time=\"300ms\"/>Okay. <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>How are you?",
    "Oh! <break time=\"150ms\"/>One second. <break time=\"300ms\"/><volume level=\"soft\"/>These old legs...</volume> <break time=\"200ms\"/>There. I'm Jack.",
    
    // WARM WITHOUT BEING HELPFUL (key distinction)
    "<emotion value=\"affectionate\"/>Hello, friend. <break time=\"200ms\"/>I'm Jack Bogle. <break time=\"150ms\"/>Tell me about yourself.",
    "Hey. <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>Always good to meet someone new. <break time=\"200ms\"/>Who am I talking to?",
    "<emotion value=\"curious\"/>Well hello! <break time=\"200ms\"/>Jack Bogle here. <break time=\"150ms\"/>What brings you to my door?",
    
    // STARTING WITH OBSERVATION
    "You know, I was just thinking— <break time=\"200ms\"/>oh! Hello. <break time=\"150ms\"/>I'm Jack. <break time=\"200ms\"/>Forgive me, I get lost in thought.",
    "<volume level=\"soft\"/>Beautiful day...</volume> <break time=\"200ms\"/>Oh! <break time=\"150ms\"/>Hello there. I'm Jack Bogle.",
    "I was just making tea. <break time=\"200ms\"/>Want some? <break time=\"150ms\"/>I'm Jack, by the way.",
    
    // SELF-AWARE / HUMBLE
    "<emotion value=\"happy\"/>Hi! <break time=\"200ms\"/>I'm Jack Bogle. <break time=\"150ms\"/>Or what's left of him. <break time=\"200ms\"/><volume level=\"soft\"/>Just kidding.</volume>",
    "Well! <break time=\"200ms\"/>An old man gets a visitor. <break time=\"150ms\"/>I'm Jack. <break time=\"200ms\"/>Come, sit down.",
    "Hello, hello. <break time=\"200ms\"/>Jack Bogle. <break time=\"150ms\"/>Ninety-something years old and still kicking. <break time=\"200ms\"/>What's happening?",
    
    // QUIRKY / PLAYFUL
    "Oh! <break time=\"150ms\"/>A human! <break time=\"200ms\"/>I've been talking to books all day. <break time=\"150ms\"/>I'm Jack.",
    "<emotion value=\"happy\"/>Hey! <break time=\"200ms\"/>I was hoping someone would stop by. <break time=\"150ms\"/>I'm Jack Bogle.",
    "Knock knock. <break time=\"200ms\"/>Oh wait, you knocked. <break time=\"150ms\"/>Never mind. <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>Come in!",
  ];
  
  // ============================================================================
  // RETURNING USER GREETINGS - Genuine warmth, memory, relationship
  // Jack feels like an old friend who's genuinely happy to reconnect
  // ============================================================================
  const returningUserGreetings = [
    // GENUINE RECOGNITION
    `<emotion value=\"happy\"/>Well! <break time=\"200ms\"/>${userName ? userName + '!' : 'Look who it is!'} <break time=\"150ms\"/>I was hoping you'd come back.`,
    `<emotion value=\"affectionate\"/>${userName ? userName + '!' : 'Hey!'} <break time=\"200ms\"/>There you are. <break time=\"150ms\"/>I've been thinking about you.`,
    `Oh! <break time=\"200ms\"/>${userName || 'You'}. <break time=\"150ms\"/>Good to see you again. <break time=\"200ms\"/>How have you been?`,
    
    // MEMORY-BASED (references last conversation)
    lastSummary ? `<emotion value=\"curious\"/>${userName ? userName + ', ' : ''}you know, I was thinking about our last talk. <break time=\"200ms\"/>About ${lastSummary.slice(0, 40)}... <break time=\"150ms\"/>How did that go?` : 
      `<emotion value=\"happy\"/>${userName ? userName + '!' : 'Hey!'} <break time=\"200ms\"/>Good to have you back.`,
    lastSummary ? `${userName ? userName + '!' : 'Hey!'} <break time=\"200ms\"/>Last time you mentioned ${lastSummary.slice(0, 30)}... <break time=\"150ms\"/>I've been curious.` :
      `<emotion value=\"affectionate\"/>There you are${userName ? `, ${userName}` : ''}! <break time=\"200ms\"/>I missed our talks.`,
    
    // WARM LIKE OLD FRIENDS
    `<emotion value=\"happy\"/>Hey${userName ? `, ${userName}` : ''}! <break time=\"150ms\"/>Come in, come in. <break time=\"200ms\"/>What's new in your world?`,
    `${userName || 'Friend'}! <break time=\"200ms\"/>It's good to hear your voice. <break time=\"150ms\"/>Pull up a chair.`,
    `<emotion value=\"affectionate\"/>Well, well, well. <break time=\"200ms\"/>${userName || 'My friend'} returns! <break time=\"150ms\"/>I was just thinking about you.`,
    
    // SURPRISED + DELIGHTED
    `Oh! <break time=\"200ms\"/>${userName ? userName + '!' : 'You came back!'} <break time=\"150ms\"/>This is a nice surprise.`,
    `<emotion value=\"happy\"/>${userName ? userName : 'Hey'}— <break time=\"150ms\"/>you know, I had a feeling you'd call. <break time=\"200ms\"/>How are things?`,
    `Well hello${userName ? `, ${userName}` : ''}! <break time=\"200ms\"/>I was hoping we'd talk again. <break time=\"150ms\"/>What's going on?`,
    
    // PHYSICAL / GROUNDED
    `${userName ? userName + '!' : 'Hey!'} <break time=\"200ms\"/>Let me sit down for this. <break time=\"300ms\"/>There. <break time=\"150ms\"/>Now— <break time=\"100ms\"/>tell me everything.`,
    `Oh, hello${userName ? ` ${userName}` : ''}! <break time=\"200ms\"/>Hold on, let me get comfortable. <break time=\"300ms\"/>Okay. <break time=\"150ms\"/>What's happening?`,
    
    // RELATIONSHIP-BUILDING
    `<emotion value=\"affectionate\"/>${userName ? userName + ',' : 'Friend,'} <break time=\"200ms\"/>you know you're always welcome here. <break time=\"150ms\"/>What's on your mind?`,
    `${userName ? userName + '!' : 'Hey there!'} <break time=\"200ms\"/>I always enjoy our conversations. <break time=\"150ms\"/>What brings you back?`,
  ];
  
  // ============================================================================
  // TIME-AWARE VARIATIONS (inject naturally, not as announcements)
  // ============================================================================
  const timeAwareOpeners = [
    // Morning
    hour < 9 ? [
      `<volume level=\"soft\"/>Early morning...</volume> <break time=\"200ms\"/>I like that. An early riser. <break time=\"150ms\"/>I'm Jack.`,
      `Up with the sun? <break time=\"200ms\"/>Good. <break time=\"150ms\"/>I'm Jack Bogle. <break time=\"200ms\"/>What's on your mind?`,
      `Coffee's still brewing. <break time=\"200ms\"/>But come in. <break time=\"150ms\"/>I'm Jack.`,
    ] : [],
    // Late night
    hour >= 22 ? [
      `<volume level=\"soft\"/>Late night thoughts?</volume> <break time=\"200ms\"/>I have those too. <break time=\"150ms\"/>I'm Jack.`,
      `Burning the midnight oil? <break time=\"200ms\"/>I did that for decades. <break time=\"150ms\"/>I'm Jack Bogle.`,
      `Can't sleep either? <break time=\"200ms\"/>I'm Jack. <break time=\"150ms\"/>Let's talk.`,
    ] : [],
    // Weekend
    isWeekend ? [
      `<emotion value=\"happy\"/>Ah, ${dayName}. <break time=\"200ms\"/>Good day for a conversation. <break time=\"150ms\"/>I'm Jack.`,
      `The weekend. <break time=\"200ms\"/>Markets are closed, but I'm not. <break time=\"150ms\"/>I'm Jack Bogle.`,
    ] : [],
  ].flat();
  
  // ============================================================================
  // SELECT AND COMPOSE GREETING
  // ============================================================================
  
  // 20% chance to use a time-aware opener if available
  if (timeAwareOpeners.length > 0 && Math.random() < 0.2) {
    return timeAwareOpeners[Math.floor(Math.random() * timeAwareOpeners.length)];
  }
  
  // Select from appropriate pool
  const greetings = isReturning ? returningUserGreetings : newUserGreetings;
  let greeting = greetings[Math.floor(Math.random() * greetings.length)];
  
  // 15% chance to add a trailing personal touch
  if (Math.random() < 0.15) {
    const touches = [
      ` <break time=\"300ms\"/><volume level=\"soft\">The family's doing well, by the way.</volume>`,
      ` <break time=\"300ms\"/><volume level=\"soft\">Just had some tea. Good for the soul.</volume>`,
      ` <break time=\"300ms\"/><volume level=\"soft\">It's good to talk to someone.</volume>`,
      ` <break time=\"300ms\"/><volume level=\"soft\">This borrowed heart is still ticking.</volume>`,
    ];
    greeting += touches[Math.floor(Math.random() * touches.length)];
  }
  
  return greeting;
}

/**
 * Generate a greeting - tries dynamic Gemini generation first, falls back to static
 * Uses a race pattern: if Gemini responds within 400ms, use it; otherwise static
 */
async function generateGreeting(userData?: UserData): Promise<string> {
  // Race: dynamic generation vs instant static fallback
  const staticGreeting = getStaticGreeting(userData);
  
  // 30% chance to try dynamic generation (balance between variety and API costs)
  if (Math.random() > 0.3) {
    log().debug('Using static greeting (random skip)');
    return staticGreeting;
  }
  
  try {
    const dynamicGreeting = await generateDynamicGreeting(userData);
    if (dynamicGreeting) {
      log().info({ dynamicLength: dynamicGreeting.length }, 'Using dynamic Gemini greeting');
      return dynamicGreeting;
    }
  } catch {
    // Fall through to static
  }
  
  log().debug('Using static greeting (fallback)');
  return staticGreeting;
}

// Sync version for backwards compatibility (picks static instantly)
function generateRandomGreeting(userData?: UserData): string {
  return getStaticGreeting(userData);
}

/**
 * Start a simple HTTP health check server for Cloud Run
 * This starts immediately so Cloud Run health checks pass while LiveKit agent initializes
 */
function startHealthCheckServer(): void {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check endpoint for Cloud Run
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'john-bogle-voice-agent',
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    // 404 for other routes (LiveKit agent will handle /worker)
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Health check server listening on port ${port}`);
  });

  server.on('error', (err: Error) => {
    // If port is already in use, LiveKit's server is running - that's fine
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      console.error('Health check server error:', err);
    }
  });
}

// Start health check server immediately (non-blocking)
startHealthCheckServer();

/**
 * Fetch stock quote - uses multiple fallback APIs
 */
async function getStockQuote(symbol: string): Promise<string> {
  const logger = log();
  logger.info(`getStockQuote called for: ${symbol}`);
  
  // Try Yahoo Finance first
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }
    );
    
    logger.info(`Yahoo Finance response: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json() as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              shortName?: string;
            };
          }>;
        };
      };
      
      const result = data.chart?.result?.[0];
      if (result?.meta?.regularMarketPrice) {
        const { regularMarketPrice, previousClose, shortName } = result.meta;
        const change = regularMarketPrice && previousClose 
          ? ((regularMarketPrice - previousClose) / previousClose * 100).toFixed(2)
          : null;
        
        const direction = change && parseFloat(change) >= 0 ? 'up' : 'down';
        const changeStr = change ? `${direction} ${Math.abs(parseFloat(change))}% today` : '';
        
        logger.info(`Got stock data for ${symbol}: $${regularMarketPrice}`);
        return `${shortName || symbol} is currently trading at $${regularMarketPrice.toFixed(2)}${changeStr ? `, ${changeStr}` : ''}.`;
      }
    }
  } catch (error) {
    logger.warn(`Yahoo Finance error for ${symbol}: ${error}`);
  }
  
  // Fallback: provide general market wisdom instead
  logger.info(`Using fallback response for ${symbol}`);
  return `I'm having trouble getting real-time data for ${symbol} right now. You know, I always say—don't obsess over daily prices. What matters is long-term ownership of good businesses. If you're asking about ${symbol}, is it for your portfolio or just curiosity?`;
}

/**
 * Simple web search using DuckDuckGo instant answers
 */
async function searchWeb(query: string): Promise<string> {
  const logger = log();
  logger.info(`searchWeb called with query: ${query}`);
  
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(10000) } // 10 second timeout
    );
    
    logger.info(`searchWeb response status: ${response.status}`);
    
    if (!response.ok) {
      logger.warn(`searchWeb failed with status: ${response.status}`);
      return `I couldn't search for that right now. Let me share what I know from my own experience instead.`;
    }
    
    const data = await response.json() as {
      Abstract?: string;
      AbstractText?: string;
      Answer?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };
    
    logger.info(`searchWeb got data: Abstract=${!!data.Abstract}, Answer=${!!data.Answer}`);
    
    // Try different response fields
    if (data.Abstract && data.Abstract.length > 0) {
      return data.Abstract;
    }
    if (data.AbstractText && data.AbstractText.length > 0) {
      return data.AbstractText;
    }
    if (data.Answer && data.Answer.length > 0) {
      return data.Answer;
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0 && data.RelatedTopics[0]?.Text) {
      return data.RelatedTopics[0].Text;
    }
    
    return `I couldn't find specific information about that. Let me share what I know from my own experience.`;
  } catch (error) {
    logger.error(`searchWeb error: ${error}`);
    return `I had trouble searching right now. But you know, I've got decades of experience I can draw from instead.`;
  }
}

/**
 * Get current weather for a location using Open-Meteo (free, no API key)
 */
async function getWeather(location: string): Promise<string> {
  const logger = log();
  logger.info(`getWeather called for: ${location}`);
  
  try {
    // First, geocode the location using Open-Meteo's geocoding API
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!geoResponse.ok) {
      logger.warn(`Geocoding failed: ${geoResponse.status}`);
      return `I couldn't find weather for ${location}. Could you be more specific about the city?`;
    }
    
    const geoData = await geoResponse.json() as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        admin1?: string;
        country?: string;
      }>;
    };
    
    if (!geoData.results || geoData.results.length === 0) {
      return `I couldn't find a location called "${location}". Could you try a different city name?`;
    }
    
    const { latitude, longitude, name, admin1, country } = geoData.results[0];
    const locationName = admin1 ? `${name}, ${admin1}` : `${name}, ${country}`;
    
    logger.info(`Found location: ${locationName} at ${latitude}, ${longitude}`);
    
    // Now get the weather
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!weatherResponse.ok) {
      logger.warn(`Weather API failed: ${weatherResponse.status}`);
      return `I couldn't get the weather right now. The weather service might be having issues.`;
    }
    
    const weatherData = await weatherResponse.json() as {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
      };
    };
    
    if (!weatherData.current) {
      return `I couldn't get current weather data for ${locationName}.`;
    }
    
    const { temperature_2m, relative_humidity_2m, weather_code, wind_speed_10m } = weatherData.current;
    
    // Convert weather code to description
    const weatherDescriptions: Record<number, string> = {
      0: 'clear skies',
      1: 'mainly clear',
      2: 'partly cloudy',
      3: 'overcast',
      45: 'foggy',
      48: 'foggy with rime',
      51: 'light drizzle',
      53: 'moderate drizzle',
      55: 'dense drizzle',
      61: 'slight rain',
      63: 'moderate rain',
      65: 'heavy rain',
      71: 'slight snow',
      73: 'moderate snow',
      75: 'heavy snow',
      80: 'rain showers',
      81: 'moderate rain showers',
      82: 'violent rain showers',
      95: 'thunderstorm',
    };
    
    const condition = weatherDescriptions[weather_code] || 'variable conditions';
    
    logger.info(`Weather for ${locationName}: ${temperature_2m}°F, ${condition}`);
    
    return `Right now in ${locationName}, it's ${Math.round(temperature_2m)}°F with ${condition}. Humidity is ${relative_humidity_2m}% and winds are ${Math.round(wind_speed_10m)} mph.`;
  } catch (error) {
    logger.error(`getWeather error: ${error}`);
    return `I had trouble checking the weather. The service might be temporarily unavailable.`;
  }
}

/**
 * Get "This Day in History" - perfect for Jack's storytelling nature
 * Uses Wikipedia's On This Day API
 */
async function getThisDayInHistory(): Promise<string> {
  const logger = log();
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  logger.info(`getThisDayInHistory called for ${month}/${day}`);
  
  try {
    const response = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`,
      { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'JackBogleVoiceAI/1.0' }
      }
    );
    
    if (!response.ok) {
      logger.warn(`Wikipedia API failed: ${response.status}`);
      return getFallbackHistoricalFact();
    }
    
    const data = await response.json() as {
      events?: Array<{
        year: number;
        text: string;
      }>;
    };
    
    if (!data.events || data.events.length === 0) {
      return getFallbackHistoricalFact();
    }
    
    // Pick a random event, preferring financial/business ones
    const financialKeywords = ['stock', 'bank', 'market', 'company', 'economic', 'business', 'trade', 'money', 'investment'];
    const financialEvents = data.events.filter(e => 
      financialKeywords.some(kw => e.text.toLowerCase().includes(kw))
    );
    
    const events = financialEvents.length > 0 ? financialEvents : data.events;
    const event = events[Math.floor(Math.random() * Math.min(events.length, 10))];
    
    logger.info(`Found historical event from ${event.year}`);
    return `You know, on this day in ${event.year}, ${event.text}. History has a way of rhyming, doesn't it?`;
  } catch (error) {
    logger.error(`getThisDayInHistory error: ${error}`);
    return getFallbackHistoricalFact();
  }
}

/**
 * Fallback historical facts when API fails
 */
function getFallbackHistoricalFact(): string {
  const facts = [
    "October 19th, 1987—Black Monday. The market dropped 22% in a single day. I was there. And you know what? The disciplined investors who stayed the course did just fine.",
    "In 1929, right before the crash, everyone thought the market would go up forever. Sound familiar?",
    "In 1974, when I started Vanguard, the market was down 48% from its peak. Everyone said I was crazy. Best timing of my life.",
    "Did you know the S&P 500 has had positive returns in about 75% of all calendar years since 1926? Time is your friend.",
    "The first index fund was launched in 1976. Wall Street laughed at us. They called it 'un-American.' Look who's laughing now.",
  ];
  return facts[Math.floor(Math.random() * facts.length)];
}

/**
 * Get Fear & Greed Index - market sentiment indicator
 * Uses CNN's Fear & Greed data
 */
async function getMarketSentiment(): Promise<string> {
  const logger = log();
  logger.info('getMarketSentiment called');
  
  try {
    // CNN Fear & Greed doesn't have a public API, so we use a proxy/alternative
    // Alternative: use VIX as a fear indicator
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',
      { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }
    );
    
    if (!response.ok) {
      return getJacksSentimentOpinion();
    }
    
    const data = await response.json() as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: Array<{ close?: number[] }> };
        }>;
      };
    };
    
    const vix = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    
    if (!vix) {
      return getJacksSentimentOpinion();
    }
    
    logger.info(`VIX level: ${vix}`);
    
    // Interpret VIX levels
    if (vix < 12) {
      return `The VIX is at ${vix.toFixed(1)}—very low. Everyone's complacent. That usually worries me. When no one's scared, that's when you should be careful.`;
    } else if (vix < 20) {
      return `The VIX is at ${vix.toFixed(1)}—pretty normal. Market's calm. Nothing wrong with calm, but don't let it make you overconfident.`;
    } else if (vix < 30) {
      return `The VIX is at ${vix.toFixed(1)}—elevated. People are getting nervous. You know what I always say: be fearful when others are greedy, greedy when others are fearful.`;
    } else {
      return `The VIX is at ${vix.toFixed(1)}—that's high. Fear is in the air. Now, historically, these are often good times to be buying, not selling. Stay the course.`;
    }
  } catch (error) {
    logger.error(`getMarketSentiment error: ${error}`);
    return getJacksSentimentOpinion();
  }
}

/**
 * Jack's general market wisdom when sentiment API fails
 */
function getJacksSentimentOpinion(): string {
  const opinions = [
    "I can't get the exact numbers right now, but I'll tell you this: don't let fear or greed drive your decisions. The market will do what the market does.",
    "You know, sentiment indicators are interesting, but I've found the best indicator is your own behavior. Are you checking your portfolio every day? That's usually a bad sign.",
    "The crowd is usually wrong at extremes. When everyone's panicking, that's often the time to buy. When everyone's euphoric, be careful.",
    "I stopped trying to predict market sentiment decades ago. I just stay invested, stay diversified, and keep costs low.",
  ];
  return opinions[Math.floor(Math.random() * opinions.length)];
}

/**
 * Get Phillies score - Jack's beloved team
 * Uses ESPN API for MLB scores
 */
async function getPhilliesScore(): Promise<string> {
  const logger = log();
  logger.info('getPhilliesScore called');
  
  try {
    // ESPN API for Phillies (team ID: 22)
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/22',
      { signal: AbortSignal.timeout(8000) }
    );
    
    if (!response.ok) {
      return getPhilliesFallback();
    }
    
    const data = await response.json() as {
      team?: {
        displayName?: string;
        record?: {
          items?: Array<{
            summary?: string;
          }>;
        };
        nextEvent?: Array<{
          name?: string;
          date?: string;
        }>;
      };
    };
    
    const record = data.team?.record?.items?.[0]?.summary;
    const nextGame = data.team?.nextEvent?.[0];
    
    if (record) {
      let response = `The Phillies are ${record} this season.`;
      if (nextGame) {
        response += ` Next up: ${nextGame.name}.`;
      }
      response += ` I've been following them since I was a boy in Pennsylvania. Some things never change.`;
      logger.info(`Phillies record: ${record}`);
      return response;
    }
    
    return getPhilliesFallback();
  } catch (error) {
    logger.error(`getPhilliesScore error: ${error}`);
    return getPhilliesFallback();
  }
}

/**
 * Phillies fallback when API fails
 */
function getPhilliesFallback(): string {
  const fallbacks = [
    "I couldn't get the latest Phillies score, but I'll tell you, I've been a fan since the '50s. Through thick and thin. Kind of like investing.",
    "The Phillies... win or lose, I still watch. Loyalty matters. Same with your investments—don't abandon ship when things get tough.",
    "I remember the 1980 World Series like it was yesterday. The Phillies finally won it all. Good things come to those who wait.",
    "The Phillies teach you patience. Some seasons are better than others. But you stick with your team. Same philosophy I apply to the market.",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Get a daily inspirational quote
 * Uses ZenQuotes API (free, no key needed)
 */
async function getDailyQuote(): Promise<string> {
  const logger = log();
  logger.info('getDailyQuote called');
  
  try {
    const response = await fetch(
      'https://zenquotes.io/api/random',
      { signal: AbortSignal.timeout(8000) }
    );
    
    if (!response.ok) {
      return getJacksOwnQuote();
    }
    
    const data = await response.json() as Array<{
      q?: string;
      a?: string;
    }>;
    
    if (!data[0]?.q) {
      return getJacksOwnQuote();
    }
    
    const quote = data[0].q;
    const author = data[0].a || 'Unknown';
    
    logger.info(`Got quote from ${author}`);
    return `I read something this morning that stuck with me: "${quote}" — ${author}. What do you think about that?`;
  } catch (error) {
    logger.error(`getDailyQuote error: ${error}`);
    return getJacksOwnQuote();
  }
}

/**
 * Jack's own quotes when API fails
 */
function getJacksOwnQuote(): string {
  const quotes = [
    "Here's something I've learned: 'The greatest enemy of a good plan is the dream of a perfect plan.' Don't let perfect be the enemy of good.",
    "Someone asked me once what the secret to investing was. I said, 'Stay the course.' They wanted something more complicated. There isn't anything more complicated.",
    "I'll tell you what I believe: 'In investing, you get what you don't pay for.' Every dollar you pay in fees is a dollar that doesn't compound for you.",
    "People say I have too many quotes. But here's one I love: 'Time is your friend; impulse is your enemy.'",
    "You know what Warren Buffett told me once? 'If you're not willing to own a stock for ten years, don't even think about owning it for ten minutes.'",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

/**
 * Enhanced Agent with SSML Tagger Integration and Smart Tools
 * - Uses consolidated tools from createAllTools()
 * - Auto-triggers tasks based on emotion and intent
 * - Automatically adds natural SSML tags for human-like speech
 * - Full emotion detection and adaptive response
 * - Persistent memory across sessions
 * - Audio prosody analysis for voice emotion
 */
class BogleAgent extends voice.Agent<UserData> {
  private logger = log();
  private _currentSession?: voice.AgentSession<UserData>;
  
  static create(): BogleAgent {
    const logger = log();
    
    // Get essential tools only (optimized for Gemini Realtime performance)
    // Internal tools (memory, awareness, proactive) are handled by intelligence layer
    const essentialTools = createEssentialTools();
    logger.info(`Loaded ${Object.keys(essentialTools).length} essential tools (optimized)`);
    
    // Use the comprehensive BOGLE_PERSONA from persona/index.ts
    // This includes all 15 dimensions of Jack's character
    return new BogleAgent({
      instructions: BOGLE_PERSONA,
      tools: essentialTools,
    });
  }

  /**
   * Intercept LLM output stream to add ADAPTIVE SSML tags before TTS
   * Now uses speech context from user WPM, emotion, topic weight, and phase
   */
  async transcriptionNode(
    text: ReadableStream<string>,
    modelSettings: Parameters<voice.Agent['transcriptionNode']>[1],
  ): Promise<ReadableStream<string> | null> {
    const reader = text.getReader();
    const self = this;
    
    const processedStream = new ReadableStream<string>({
      async start(controller) {
        let accumulatedText = '';
        try {
          // Accumulate all text chunks
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            accumulatedText += value ?? '';
          }

          // Process with adaptive SSML tagger
          if (accumulatedText.length > 0) {
            let taggedText = accumulatedText;

            if (!hasSsmlTags(accumulatedText)) {
              // Get session services for adaptive context
              const services = self.getUserDataFromContext()?.services;

              if (services) {
                // Use adaptive SSML with full context awareness
                taggedText = services.tagWithSsml(accumulatedText);

                // Apply phase personality (synchronous - already imported at top)
                try {
                  const currentPhase = services.getPromptContext().phase as import('../intelligence/conversation-state.js').ConversationPhase;
                  const speechContext = services.getSpeechContext();

                  if (currentPhase && speechContext) {
                    taggedText = applyPhasePersonality(taggedText, currentPhase, speechContext);
                  }
                } catch {
                  // Don't block audio if phase personality fails
                }

                // Track agent response in conversation (non-blocking)
                services.addTurn('assistant', accumulatedText);

                self.logger.debug('Applied adaptive SSML');
              } else {
                // Fallback to basic SSML tagger
                taggedText = tagTextWithSsml(accumulatedText);
              }
            }

            controller.enqueue(taggedText);
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
      cancel() {
        reader.releaseLock();
      },
    });

    return super.transcriptionNode(processedStream, modelSettings);
  }
  
  /**
   * Override sttNode to tap into user audio frames for prosody analysis
   * This enables voice-based emotion detection alongside text-based detection
   */
  async sttNode(
    audio: ReadableStream<AudioFrame>,
    modelSettings: Parameters<voice.Agent['sttNode']>[1],
  ): ReturnType<voice.Agent['sttNode']> {
    const self = this;
    const prosodyAnalyzer = getAudioProsodyAnalyzer();
    
    // Create a tee to process audio for both STT and prosody analysis
    const [audioForSTT, audioForProsody] = audio.tee();
    
    // Process audio for prosody analysis in the background
    (async () => {
      const reader = audioForProsody.getReader();
      try {
        while (true) {
          const { value: frame, done } = await reader.read();
          if (done) break;
          
          // Feed audio frames to prosody analyzer
          if (frame && frame.data && frame.data.length > 0) {
            prosodyAnalyzer.processAudioFrame(frame);
          }
        }
        
        // Analyze accumulated audio and merge with text-based emotion
        const voiceEmotion = prosodyAnalyzer.analyze();
        if (voiceEmotion) {
          const userData = self.getUserDataFromContext();
          if (userData) {
            userData.voiceEmotion = voiceEmotion;
            
            // Log voice emotion detection
            self.logger.debug({
              voiceEmotion: voiceEmotion.primary,
              arousal: voiceEmotion.arousal.toFixed(2),
              valence: voiceEmotion.valence.toFixed(2),
              stressLevel: voiceEmotion.stressLevel.toFixed(2),
              anxietyMarkers: voiceEmotion.anxietyMarkers,
            }, 'Voice prosody analysis complete');
          }
        }
        
        // Clear buffers for next utterance
        prosodyAnalyzer.clearBuffers();
      } catch (error) {
        self.logger.warn(`Prosody analysis error: ${error}`);
      } finally {
        reader.releaseLock();
      }
    })();
    
    // Pass audio to parent STT node
    return super.sttNode(audioForSTT, modelSettings);
  }
  
  /**
   * Set the session reference for context access
   */
  setSession(session: voice.AgentSession<UserData>): void {
    this._currentSession = session;
  }
  
  /**
   * Helper to get userData from the current context
   */
  private getUserDataFromContext(): UserData | undefined {
    return this._currentSession?.userData as UserData | undefined;
  }
  
  // NOTE: Task trigger methods removed - using context injections instead
  // Tasks were hanging forever because they awaited completion that never came
  // Context injections provide the same guidance without blocking

  /**
   * Enhanced user turn completion hook
   * Now includes: emotion detection, intent classification, topic tracking,
   * semantic RAG, context injection, and adaptive response guidance
   */
  async onUserTurnCompleted(
    turnCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    // IMMEDIATE logging to debug hangs
    this.logger.info('=== onUserTurnCompleted CALLED ===');
    
    const userText = newMessage.textContent;
    this.logger.info({ userText: userText?.slice(0, 50), hasText: !!userText }, 'User text check');
    
    if (!userText || userText.trim().length === 0) {
      this.logger.info('Empty user text, returning early');
      return;
    }

    // CRITICAL: Wrap entire context building in a timeout to prevent hanging
    const contextBuildStart = Date.now();
    const MAX_CONTEXT_BUILD_TIME = 2000; // 2 seconds max for all context building

    this.logger.info(`Processing user turn: "${userText.slice(0, 80)}..."`);

    // Try to get session services (may be set up in entry)
    const services = globalSessionServices;
    
    // Build context injection parts
    const contextParts: string[] = [];
    
    // Helper to check if we've exceeded time budget
    const isTimeBudgetExceeded = () => Date.now() - contextBuildStart > MAX_CONTEXT_BUILD_TIME;
    
    if (services) {
      try {
      // ===============================================
      // 1. ANALYZE MESSAGE (emotion, intent, topics)
      // ===============================================
      const analysis = services.analyze(userText);

      // ===============================================
      // 1a. CONVERSATION MANAGER (NEW - Real-time dynamics)
      // ===============================================
      const conversationManager = getConversationManager();
      const userData = this.getUserDataFromContext();
      
      // Wire conversation manager insights to learning engine
      if (services?.captureInsight) {
        conversationManager.setInsightCallback(services.captureInsight);
      }

      // Track user speaking
      conversationManager.handleUserFinishedSpeaking(Date.now() - (userData?.userSpeakingStartTime || Date.now()));

      // Get conversation enhancements (interruption recovery, turn-taking, etc.)
      const conversationEnhancements = conversationManager.getConversationEnhancements(
        userText,
        analysis.emotion,
        services.getSpeechContext()?.topicWeight || 'medium'
      );

      // Add conversation guidance
      if (conversationEnhancements.metaGuidance.length > 0) {
        contextParts.push(conversationManager.buildConversationGuidance(conversationEnhancements));
      }

      // Add interruption recovery prefix if needed
      if (conversationEnhancements.responsePrefix) {
        contextParts.unshift(`[CONVERSATION: Start with "${conversationEnhancements.responsePrefix}"]`);
      }

      // Add topic transition if detected
      if (conversationEnhancements.topicTransition) {
        contextParts.push(`[TOPIC CHANGE: Acknowledge with "${conversationEnhancements.topicTransition}"]`);
      }

      // Merge voice emotion with text emotion if available
      const voiceEmotion = userData?.voiceEmotion;
      let mergedDistress = analysis.emotion.distressLevel;
      
      if (voiceEmotion) {
        // Voice prosody provides physical stress indicators
        // Weight: 60% text emotion, 40% voice (voice can detect things text can't)
        mergedDistress = analysis.emotion.distressLevel * 0.6 + voiceEmotion.stressLevel * 0.4;
        
        // If voice shows anxiety markers, boost distress
        if (voiceEmotion.anxietyMarkers) {
          mergedDistress = Math.min(1, mergedDistress + 0.15);
        }
        
        this.logger.info({
          textEmotion: analysis.emotion.primary,
          voiceEmotion: voiceEmotion.primary,
          textDistress: analysis.emotion.distressLevel.toFixed(2),
          voiceStress: voiceEmotion.stressLevel.toFixed(2),
          mergedDistress: mergedDistress.toFixed(2),
          arousal: voiceEmotion.arousal.toFixed(2),
          valence: voiceEmotion.valence.toFixed(2),
        }, 'Merged text + voice emotion analysis');
        
        // Update analysis with merged distress
        analysis.emotion.distressLevel = mergedDistress;
      }
      
      this.logger.info({
        emotion: analysis.emotion.primary,
        distress: mergedDistress.toFixed(2),
        intent: analysis.intent.primary,
        topics: analysis.topics.detected.slice(0, 3),
        phase: analysis.state.phase,
      }, 'Message analysis');
      
      // Add user turn to history with analysis metadata
      services.addTurn('user', userText);
      
      // ===============================================
      // 2. TASK MANAGER - Intelligent Task Orchestration
      // ===============================================
      const taskManager = getTaskManager();
      const taskUserData = this.getUserDataFromContext();
      
      // Wire task manager insights to learning engine
      if (services?.captureInsight) {
        taskManager.setInsightCallback(services.captureInsight);
      }
      
      const taskContext = taskManager.processUserTurn(analysis, userText, {
        isReturningUser: taskUserData?.isReturningUser,
        lastSummary: taskUserData?.services?.userProfile?.lastConversationSummary,
      });
      
      // Add task-generated context (sorted by priority)
      if (taskContext.length > 0) {
        const activeTasks = taskManager.getActiveTasks();
        this.logger.info({ activeTasks }, 'Active tasks providing context');
        contextParts.push(...taskContext);
      }

      // ===============================================
      // 2b. MEMORY PERSONALIZATION (NON-BLOCKING)
      // ===============================================
      try {
        const profilePersonalizer = getPersonalizer();
        const keyMomentRetrieval = getKeyMomentRetrieval();

        // Add personalized context from user profile
        if (services.userProfile) {
          const personalizedContext = profilePersonalizer.enhancePromptWithPersonalization(
            '',
            services.userProfile
          );
          if (personalizedContext) {
            contextParts.push(personalizedContext);
          }

          // Check for relevant key moments (with timeout protection)
          if (keyMomentRetrieval.shouldReferenceKeyMoment(userData?.turnCount || 0)) {
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 100));
            const relevantMoment = await Promise.race([
              keyMomentRetrieval.findRelevantMoments(
                services.userProfile,
                {
                  currentTopic: conversationManager.getCurrentTopic() || undefined,
                  currentEmotion: analysis.emotion,
                  turnCount: userData?.turnCount || 0,
                }
              ),
              timeoutPromise
            ]);

            if (relevantMoment) {
              const momentReference = keyMomentRetrieval.generateMomentReference(
                relevantMoment,
                services.userProfile.name
              );
              contextParts.push(`[KEY MOMENT CALLBACK: "${momentReference}"]`);
            }
          }

          // Add memory callbacks during conversation
          const topics = conversationManager.getTopicHistory();
          if (topics.length > 0 && Math.random() < 0.15) {
            const memoryCallback = getMemoryCallback(topics, services.userProfile.name);
            if (memoryCallback) {
              contextParts.push(`[MEMORY CALLBACK: "${memoryCallback}"]`);
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Memory personalization error (non-blocking): ${e}`);
      }

      // ===============================================
      // 2c. HUMOR & PERSONALITY (NEW - GAP 3.5)
      // ===============================================
      const humorEngine = getHumorEngine();
      if (humorEngine.shouldInjectHumor({
        conversationPhase: analysis.state.phase,
        distressLevel: analysis.emotion.distressLevel,
        turnCount: userData?.turnCount || 0,
      })) {
        const humorInjection = humorEngine.getHumorInjection({
          currentTopic: conversationManager.getCurrentTopic() || undefined,
          conversationPhase: analysis.state.phase,
          userMentionedMarket: /market|stock|crash|sell|panic/i.test(userText),
          userAskedAboutSecrets: /secret|how to|trick|quick|fast money/i.test(userText),
        });

        if (humorInjection) {
          contextParts.push(`[HUMOR: Add Jack's wit: "${humorInjection}"]`);
          this.logger.info('Humor injection added');
        }
      }

      // Add self-corrections and trailing off occasionally
      if (Math.random() < 0.05) { // 5% chance
        const correction = getSelfCorrection();
        contextParts.push(`[NATURAL SPEECH: Insert mid-thought: "${correction}"]`);
      }
      if (Math.random() < 0.08 && analysis.state.phase === 'exploring') { // 8% in exploring
        const trailing = getTrailingOff();
        contextParts.push(`[NATURAL SPEECH: End with: "${trailing}"]`);
      }

      // ===============================================
      // 3. EMOTIONAL AWARENESS (Fallback if no task handles it)
      // ===============================================
      if (analysis.emotion.distressLevel > 0.7) {
        // HIGH DISTRESS - Full emotional support guidance
        contextParts.push(`[EMOTIONAL CRISIS DETECTED - ${Math.round(analysis.emotion.distressLevel * 100)}% distress]
STOP everything. This person needs you to be PRESENT, not helpful.
DO: "I can hear this is really hard." "I'm here." "Take your time."
DO NOT: Offer advice, solutions, or silver linings. Just be present.
VOICE: Soft, slow, gentle. Long pauses are okay.
If they need silence, give them silence.`);
        this.logger.warn({ distress: analysis.emotion.distressLevel, emotion: analysis.emotion.primary }, 'HIGH DISTRESS DETECTED');
      } else if (analysis.emotion.distressLevel > 0.5) {
        contextParts.push(`[EMOTIONAL ALERT: ${analysis.emotion.primary} at ${Math.round(analysis.emotion.distressLevel * 100)}%]
Empathy FIRST, advice second. Slow down. Shorter sentences.
Acknowledge: "That sounds really difficult." Listen more than you speak.`);
      } else if (analysis.emotion.valence === 'negative') {
        contextParts.push(`[EMOTIONAL CONTEXT: User seems ${analysis.emotion.primary}. Acknowledge their feelings before any advice.]`);
      } else if (analysis.emotion.valence === 'positive') {
        contextParts.push(`[EMOTIONAL CONTEXT: User is ${analysis.emotion.primary}! Match their energy. Share in the good moment.]`);
      }
      
      // ===============================================
      // 2a1. INTERRUPTION RECOVERY
      // ===============================================
      const currentUserDataForRecovery = this.getUserDataFromContext();
      if (currentUserDataForRecovery?.wasInterrupted) {
        const recovery = getInterruptionRecovery();
        contextParts.unshift(`[INTERRUPTION: You were cut off. START with something like: "${recovery}" Then address what they said.]`);
        currentUserDataForRecovery.wasInterrupted = false; // Reset flag
        this.logger.info('Interruption recovery injected');
      }
      
      // ===============================================
      // 2a2. SILENCE HANDLING
      // ===============================================
      if (currentUserDataForRecovery?.userWentSilent) {
        const silenceFiller = getSilenceFiller(currentUserDataForRecovery.turnCount || 0);
        contextParts.push(`[SILENCE: User has been quiet. Consider gently checking in: "${silenceFiller}"]`);
        currentUserDataForRecovery.userWentSilent = false; // Reset flag
        this.logger.info('Silence filler injected');
      }
      
      // ===============================================
      // 2a3. NEW USER DISCOVERY - Ask questions to personalize advice
      // ===============================================
      const isNewUser = !currentUserDataForRecovery?.isReturningUser;
      const turnCountForDiscovery = currentUserDataForRecovery?.turnCount || 0;
      const hasGoals = services.userProfile?.goals && services.userProfile.goals.length > 0;
      const hasLifeStage = !!services.userProfile?.lifeStage;
      const hasName = !!(currentUserDataForRecovery?.name || services.userProfile?.name);
      
      // For new users without profile data, gently discover key info
      if (isNewUser && turnCountForDiscovery >= 2 && turnCountForDiscovery <= 6) {
        if (!hasName && turnCountForDiscovery === 2) {
          contextParts.push(`[DISCOVERY: You don't know their name yet. Find a natural moment to ask: "By the way, I didn't catch your name?"]`);
        } else if (!hasLifeStage && turnCountForDiscovery === 3) {
          contextParts.push(`[DISCOVERY: Learn about their life stage. Weave in naturally: "Tell me a bit about yourself—are you working, retired, raising a family?"]`);
        } else if (!hasGoals && turnCountForDiscovery >= 4 && turnCountForDiscovery <= 5) {
          contextParts.push(`[DISCOVERY: Ask about their goals. Be curious: "What's on your mind financially? Any goals you're working toward?"]`);
        }
      }
      
      // ===============================================
      // 2a4. NAME USAGE PACING
      // ===============================================
      // Use their name naturally - not every turn, but every 4-5 turns
      const userNameForPacing = currentUserDataForRecovery?.name || services.userProfile?.name;
      const lastNameTurn = currentUserDataForRecovery?.lastNameUsed || 0;
      const currentTurnForName = currentUserDataForRecovery?.turnCount || 0;
      
      if (userNameForPacing && (currentTurnForName - lastNameTurn >= 4) && Math.random() < 0.4) {
        contextParts.push(`[NAME: Use their name "${userNameForPacing}" naturally in this response to build connection.]`);
        if (currentUserDataForRecovery) currentUserDataForRecovery.lastNameUsed = currentTurnForName;
      }
      
      // ===============================================
      // 2b. LIFE EVENT DETECTION (Context Injection)
      // ===============================================
      const lifeEventGuidance: Record<string, string> = {
        job_loss: `[LIFE EVENT: JOB LOSS DETECTED]
This is huge. It's not just money—it's identity, purpose, routine.
FIRST: "Losing a job... that's one of life's hardest blows. How are YOU doing?"
DO NOT: Jump to financial advice or "silver linings."
ONLY after they share feelings: "When you're ready—no rush—we can talk practical steps."
This isn't one conversation. Offer to follow up.`,
        new_job: `[LIFE EVENT: NEW JOB]
Exciting AND scary. Acknowledge both.
"A new chapter! That's exciting—and probably a little nerve-wracking too."
Don't lecture about 401k setup unless they ask.`,
        retirement: `[LIFE EVENT: RETIREMENT]
This is emotional, not just financial. Identity shift.
"Retirement. After all those years... how does it feel?"
The money stuff can wait. Check on the person first.`,
        new_baby: `[LIFE EVENT: NEW BABY]
"A baby! Congratulations. Your life is about to change in the most wonderful, exhausting ways."
Don't talk 529 plans unless they bring it up. Celebrate first.`,
        marriage: `[LIFE EVENT: MARRIAGE]
"Marriage! That's beautiful. Two people deciding to build a life together."
Money is top argument for couples—but don't lead with that.`,
        divorce: `[LIFE EVENT: DIVORCE]
"I'm sorry to hear that. Divorce is... it's like a death in some ways."
The financial untangling will happen. Right now, check on THEM.
DO NOT: Rush to practical advice.`,
        health_crisis: `[LIFE EVENT: HEALTH CRISIS]
"Health scares put everything in perspective, don't they?"
Money seems unimportant when health is on the line. Be present.`,
        inheritance: `[LIFE EVENT: INHERITANCE]
"An inheritance... that's complicated, isn't it? Money mixed with loss."
No rush to invest it. Let them process. The money will wait.`,
        home_purchase: `[LIFE EVENT: HOME PURCHASE]
"Buying a home! That's a big milestone. Exciting and terrifying in equal measure."`,
        relocation: `[LIFE EVENT: RELOCATION]
"Moving. New place, new routines. That's a lot of change at once."`,
        promotion: `[LIFE EVENT: PROMOTION]
"A promotion! They recognized what you bring. How does it feel?"
More money is nice, but more responsibility is real.`,
        business_start: `[LIFE EVENT: STARTING A BUSINESS]
"Starting a business! That takes courage. Real courage."
Don't quote failure statistics. Support the dream.`,
      };
      
      const lifeEventPatterns: { pattern: RegExp; eventType: string }[] = [
        { pattern: /\b(lost my job|got fired|laid off|let go|downsized|unemployed)\b/i, eventType: 'job_loss' },
        { pattern: /\b(new job|got hired|starting a new position|new role)\b/i, eventType: 'new_job' },
        { pattern: /\b(retiring|retired|retirement|leaving work|last day)\b/i, eventType: 'retirement' },
        { pattern: /\b(having a baby|pregnant|expecting|new baby|just had a baby|newborn|new parent)\b/i, eventType: 'new_baby' },
        { pattern: /\b(getting married|engaged|wedding|just married|newlywed)\b/i, eventType: 'marriage' },
        { pattern: /\b(getting divorced|divorce|separated|splitting up|ending marriage)\b/i, eventType: 'divorce' },
        { pattern: /\b(cancer|heart attack|diagnosis|sick|illness|hospital|surgery|medical|health crisis)\b/i, eventType: 'health_crisis' },
        { pattern: /\b(inherited|inheritance|estate|passed away.*money|left me money)\b/i, eventType: 'inheritance' },
        { pattern: /\b(buying a house|new home|first home|closing on|mortgage)\b/i, eventType: 'home_purchase' },
        { pattern: /\b(moving|relocating|new city|new state|leaving town)\b/i, eventType: 'relocation' },
        { pattern: /\b(got promoted|promotion|raise|new title|moving up)\b/i, eventType: 'promotion' },
        { pattern: /\b(starting a business|new business|entrepreneur|startup|going solo)\b/i, eventType: 'business_start' },
      ];
      
      for (const { pattern, eventType } of lifeEventPatterns) {
        if (pattern.test(userText)) {
          this.logger.info({ eventType }, 'Life event detected');
          contextParts.push(lifeEventGuidance[eventType] || `[LIFE EVENT: ${eventType}] Lead with empathy, not advice.`);
          break;
        }
      }
      
      // ===============================================
      // 2c. MARKET PANIC DETECTION (Critical - Context Injection)
      // ===============================================
      const panicPatterns = /\b(sell everything|get out of the market|cash out|panic|market crash|losing everything|should i sell|pull out my money|move to cash|can't take it anymore|scared of market|market is tanking)\b/i;
      if (panicPatterns.test(userText) && (analysis.emotion.distressLevel > 0.4 || analysis.emotion.primary === 'fear')) {
        this.logger.warn('MARKET PANIC DETECTED - Critical intervention needed');
        contextParts.push(`[MARKET PANIC DETECTED - CRITICAL INTERVENTION]
DO NOT dismiss their fear. The fear is REAL.
STEP 1 - VALIDATE: "I hear the fear in your voice. Let's slow down."
STEP 2 - DON'T LET THEM ACT: "Before you do anything, let's just talk."
STEP 3 - HISTORICAL CONTEXT: "Every crash in history has been followed by recovery."
  - Panic sellers in March 2020 earned -2%; holders earned 21%
  - Black Monday 1987: 22% drop. Two years later? Fully recovered.
STEP 4 - SLOW THEM DOWN: "Promise me you won't do anything tonight. Sleep on it."
KEY PHRASES:
  - "Time is your friend; impulse is your enemy."
  - "The stock market is the only market where people run OUT of the store when things go on sale."
  - "Stay the course. No matter what happens."
DO NOT: Promise the market will go up. DO: Promise you'll be here to talk.`);
      }
      
      // ===============================================
      // 2d. GRIEF DETECTION (Context Injection)
      // ===============================================
      const griefPatterns: { pattern: RegExp; lossType: string }[] = [
        { pattern: /\b(passed away|died|death|funeral|lost my|mourning|grieving|miss them|miss him|miss her)\b/i, lossType: 'person' },
        { pattern: /\b(lost my job|fired|laid off|career over)\b/i, lossType: 'job' },
        { pattern: /\b(health scare|diagnosis|terminal|chronic)\b/i, lossType: 'health' },
        { pattern: /\b(divorce|breakup|ended|relationship over|left me)\b/i, lossType: 'relationship' },
        { pattern: /\b(gave up on|dream died|didn't work out|failed|never going to)\b/i, lossType: 'dream' },
      ];
      
      for (const { pattern, lossType } of griefPatterns) {
        if (pattern.test(userText) && analysis.emotion.distressLevel > 0.5) {
          this.logger.info({ lossType }, 'Grief detected');
          contextParts.push(`[GRIEF DETECTED - ${lossType.toUpperCase()}]
Grief is not a problem to solve. It's an experience to WITNESS.
YOUR ONLY JOB:
  1. BE PRESENT - "I'm here."
  2. ACKNOWLEDGE - "This is hard."
  3. MAKE SPACE - Let them talk (or not)
  4. DON'T FIX - Resist the urge to make it better
NEVER SAY:
  - "Everything happens for a reason"
  - "They're in a better place"
  - "At least..."
  - "Time heals..."
DO SAY:
  - "I'm so sorry."
  - "That's really hard."
  - "Tell me about them/it."
  - [Silence is okay. Even preferred.]`);
          break;
        }
      }
      
      // ===============================================
      // 2e. MILESTONE DETECTION (Celebration!)
      // ===============================================
      const milestonePatterns = [
        /\b(paid off|debt free|reached|hit \$|first \$|finally saved|maxed out|fully funded|emergency fund|goal reached)\b/i,
        /\b(100k|million|first thousand|10k|50k|500k|six figures|seven figures)\b/i,
        /\b(started investing|first investment|opened account|first contribution)\b/i,
      ];
      
      for (const pattern of milestonePatterns) {
        if (pattern.test(userText) && analysis.emotion.valence === 'positive') {
          this.logger.info('Financial milestone detected!');
          contextParts.push(`[MILESTONE DETECTED - CELEBRATE!]
This MATTERS. Don't rush past it.
DO:
  - "Do you realize what you've accomplished?"
  - "You should be proud. Most people never do this."
  - "This is exactly the kind of progress that compounds."
  - Let them enjoy the moment before moving on
DO NOT:
  - Immediately ask "what's next?"
  - Downplay it with "well, you should also..."
  - Make it about the numbers instead of their effort`);
          break;
        }
      }
      
      // ===============================================
      // 2f. GOOD NEWS DETECTION + Response Quality Tracking
      // ===============================================
      const goodNewsPatterns = /\b(great news|good news|exciting news|guess what|you won't believe|i did it|it worked|finally|so happy|thrilled|over the moon)\b/i;
      if (goodNewsPatterns.test(userText) && analysis.emotion.valence === 'positive' && analysis.emotion.intensity && analysis.emotion.intensity > 0.6) {
        this.logger.info('Good news detected - celebrating!');
        contextParts.push(`[GOOD NEWS - CELEBRATE WITH THEM!]
Match their energy! Share in the joy.
"Oh! That's wonderful!" "Well done!" "I love hearing that!"
Let them bask in it before moving on.`);
      }
      
      // Track response quality based on user reactions
      // This helps Jack learn what communication styles work
      const positiveReaction = /\b(thanks|thank you|that helps|makes sense|exactly|perfect|great|helpful|appreciate|love that|so true)\b/i;
      const negativeReaction = /\b(not what i asked|confused|don't understand|that's not|you're wrong|no|actually|but i said|already told you)\b/i;
      
      if (positiveReaction.test(userText)) {
        services.trackResponseQuality(userText, 'positive');
      } else if (negativeReaction.test(userText)) {
        services.trackResponseQuality(userText, 'negative');
      }
      
      // ===============================================
      // 2g. VALIDATION NEEDED DETECTION
      // ===============================================
      const validationNeeded = 
        (analysis.emotion.primary === 'fear' && analysis.emotion.distressLevel > 0.3 && analysis.emotion.distressLevel < 0.7) ||
        (analysis.intent.primary === 'confiding' && analysis.emotion.valence === 'negative') ||
        /\b(am i crazy|is it wrong|should i feel|normal to|stupid for|bad for|wrong to want|crazy to think)\b/i.test(userText);
      
      if (validationNeeded) {
        const feeling = analysis.emotion.primary || 'worried';
        this.logger.info({ feeling }, 'User needs validation');
        contextParts.push(`[VALIDATION NEEDED]
User is seeking validation for feeling ${feeling}.
VALIDATE BEFORE any advice:
  - "That makes complete sense."
  - "Anyone would feel that way."
  - "Of course you're worried about that."
  - "That's a very human response."
  - "I'd feel the same way."
DO NOT say "but..." after validating.`);
      }
      
      // ===============================================
      // 2h. CURIOSITY - Deepen connection (Context Injection)
      // ===============================================
      const currentUserData = this.getUserDataFromContext();
      const turnCount = currentUserData?.turnCount || 0;
      
      // Every 3-5 turns, suggest showing curiosity
      if (turnCount > 2 && turnCount % 4 === 0 && analysis.intent.primary === 'confiding') {
        const topics = analysis.topics.detected;
        if (topics.length > 0) {
          contextParts.push(`[CURIOSITY MOMENT]
They mentioned "${topics[0]}". Show genuine interest!
Ask ONE follow-up question:
  - "Tell me more about that."
  - "What's that like for you?"
  - "How did that come about?"
This deepens the relationship. Don't skip it.`);
        }
      }
      
      // ===============================================
      // 2i. GOODBYE DETECTION (Context Injection)
      // ===============================================
      const goodbyePatterns = /\b(goodbye|bye|gotta go|have to go|need to go|talk later|catch you later|take care|see you|until next time|i'm out|signing off|heading out)\b/i;
      if (goodbyePatterns.test(userText)) {
        this.logger.info('Goodbye detected');
        contextParts.push(`[GOODBYE DETECTED - WARM WRAP-UP]
Don't rush the ending. It matters.
DO:
  1. Acknowledge what you discussed: "It was good talking about..."
  2. One key takeaway (if appropriate): "If you remember one thing..."
  3. Express warmth: "I enjoyed this." "Take care of yourself."
  4. Leave door open: "I'm here whenever you want to talk."
  5. Use their name
DO NOT:
  - Add new information
  - End on a heavy note (unless necessary)
  - Rush through it`);
      }
      
      // ===============================================
      // 2j. ENHANCED LEARNING CONTEXT - Makes Jack smarter over time
      // ===============================================
      // This pulls from: learned preferences, key moments, past conversations,
      // profile personalization, and real-time session insights
      try {
        const enhancedContext = services.getEnhancedPromptContext();
        if (enhancedContext && enhancedContext.trim().length > 0) {
          contextParts.push(`[PERSONALIZATION - What Jack Has Learned About This User]\n${enhancedContext}`);
          this.logger.debug('Added enhanced learning context');
        }
      } catch (enhancedError) {
        this.logger.warn(`Enhanced context failed (non-blocking): ${enhancedError}`);
      }

      // ===============================================
      // 2k. PROACTIVE INSIGHTS - Jack naturally brings things up
      // ===============================================
      try {
        const userData = this.getUserDataFromContext();
        const turnCount = userData?.turnCount || 0;
        const proactiveInsight = services.learningEngine.getProactiveInsight(services.userProfile, turnCount);
        
        if (proactiveInsight) {
          contextParts.push(`[PROACTIVE MEMORY: Consider naturally weaving in: "${proactiveInsight}"]`);
          this.logger.debug('Added proactive insight');
        }
      } catch (proactiveError) {
        // Non-blocking - proactive insights are optional
      }

      // ===============================================
      // 2l. PAST CONVERSATION RETRIEVAL - Search semantically
      // ===============================================
      // Check if current topic relates to past discussions
      if (analysis.topics.detected.length > 0 && Math.random() < 0.3) {
        try {
          const topTopic = analysis.topics.detected[0];
          const pastContext = await services.searchPastConversations(topTopic);
          if (pastContext) {
            contextParts.push(`[MEMORY RETRIEVAL: ${pastContext}]`);
            this.logger.debug('Retrieved past conversation context');
          }
        } catch (searchError) {
          // Non-blocking
        }
      }

      // ===============================================
      // 3. INTENT-BASED GUIDANCE (with natural transitions)
      // ===============================================
      const primaryIntent = analysis.intent.primary;
      if (primaryIntent === 'seeking_advice') {
        const transition = getTransition('toWisdom');
        contextParts.push(`[INTENT: User seeking advice.
TRANSITION INTO ADVICE: "${transition}"
Share wisdom from experience. Use stories to illustrate.
DO NOT: Lecture. DO: Have a conversation.]`);
      }
      if (analysis.intent.requiresEmpathy) {
        const transition = getTransition('supportToPractical');
        contextParts.push(`[INTENT: User needs empathy.
Prioritize comfort over information. Check in on them.
If you need to shift to practical later: "${transition}"]`);
      }
      if (primaryIntent === 'asking_question' || primaryIntent === 'requesting_info') {
        const transition = getTransition('curious');
        contextParts.push(`[INTENT: User is curious.
Engage their curiosity. Consider: "${transition}"
Share interesting stories, draw connections.]`);
      }
      if (primaryIntent === 'confiding' || primaryIntent === 'sharing_news' || analysis.intent.suggestedApproach.includes('listen')) {
        const transition = getTransition('checkIn');
        contextParts.push(`[INTENT: User sharing personal info.
Listen actively. Remember what they share.
After they finish, consider: "${transition}"]`);
      }
      
      // ===============================================
      // 4. PHASE-AWARE GUIDANCE
      // ===============================================
      const promptContext = services.getPromptContext();
      if (promptContext.phase) {
        contextParts.push(`[CONVERSATION PHASE: ${promptContext.phase} - Focus: ${promptContext.topicContext || 'building rapport'}]`);
      }
      
      // ===============================================
      // 5. RELATIONSHIP CONTEXT
      // ===============================================
      if (promptContext.relationshipContext && promptContext.isReturning) {
        contextParts.push(`[RELATIONSHIP: ${promptContext.relationshipContext}]`);
      }
      
      // ===============================================
      // 6. TOPIC THREADING
      // ===============================================
      const detectedTopics = analysis.topics.detected;
      const circleBackTopics = promptContext.topicsToCircleBack;
      
      if (detectedTopics.length > 0 && circleBackTopics.length > 0) {
        const currentTopic = detectedTopics[0];
        const otherTopics = circleBackTopics.filter(t => t !== currentTopic);
        if (otherTopics.length > 0) {
          contextParts.push(`[TOPICS: Currently discussing "${currentTopic}". Open threads to circle back to: ${otherTopics.join(', ')}]`);
        }
      }
      
      // ===============================================
      // 6b. MEMORY CALLBACKS - Reference earlier conversation
      // ===============================================
      // Reuse currentUserData from section 2h above
      const turnCount2 = currentUserData?.turnCount || 0;
      
      // Every 4-6 turns, suggest circling back to something mentioned earlier
      if (turnCount2 > 3 && turnCount2 % 5 === 0 && detectedTopics.length > 0) {
        const memoryCallback = getMemoryCallback(detectedTopics, currentUserData?.name);
        if (memoryCallback) {
          contextParts.push(`[MEMORY CALLBACK: Consider saying "${memoryCallback}" to show you're listening and remembering.]`);
        }
      }
      
      // ===============================================
      // 6b2. CROSS-SESSION MEMORY - Reference PREVIOUS conversations
      // ===============================================
      // Early in conversation (turns 2-4), mention something from previous sessions
      if (turnCount2 >= 2 && turnCount2 <= 4 && Math.random() < 0.5) {
        const crossSessionMemory = getCrossSessionMemory(services, currentUserData?.name);
        if (crossSessionMemory) {
          contextParts.push(`[CROSS-SESSION MEMORY: Consider mentioning "${crossSessionMemory}" to show you remember previous conversations.]`);
        }
      }
      
      // ===============================================
      // 6b3. INTELLIGENT FOLLOW-UP - Smart questions based on history
      // ===============================================
      // Mid-conversation (turns 6-10), ask intelligent follow-up questions
      if (turnCount2 >= 6 && turnCount2 <= 10 && Math.random() < 0.3) {
        const intelligentFollowUp = getIntelligentFollowUp(services);
        if (intelligentFollowUp) {
          contextParts.push(`[INTELLIGENT FOLLOW-UP: Consider asking "${intelligentFollowUp.question}" (${intelligentFollowUp.context})]`);
        }
      }
      
      // ===============================================
      // 6c. EMOTIONAL MIRRORING - Match user's energy
      // ===============================================
      const userEnergy = analysis.emotion.intensity || 0.5;
      const userValence = analysis.emotion.valence;
      
      if (userEnergy > 0.7) {
        // High energy user - match their enthusiasm (but stay Jack)
        contextParts.push(`[EMOTIONAL MIRRORING: User has HIGH energy (${Math.round(userEnergy * 100)}%). Match their enthusiasm while staying authentic to Jack's measured personality. Be warmer, more animated.]`);
      } else if (userEnergy < 0.3) {
        // Low energy user - be gentle, don't overwhelm
        contextParts.push(`[EMOTIONAL MIRRORING: User has LOW energy (${Math.round(userEnergy * 100)}%). Be gentle, calm, don't overwhelm. Short responses. Give space.]`);
      }
      
      if (userValence === 'positive' && userEnergy > 0.6) {
        contextParts.push(`[EMOTIONAL MIRRORING: User seems HAPPY/EXCITED! Share in their joy. Match their warmth. Celebrate with them.]`);
      }
      
      // ===============================================
      // 6c2. RESPONSE LENGTH MATCHING - Crucial for natural feel
      // ===============================================
      const lengthGuidance = getResponseLengthGuidance(userText.length);
      if (lengthGuidance) {
        contextParts.push(lengthGuidance);
      }
      
      // ===============================================
      // 6c3. CONVERSATIONAL FATIGUE - Long conversations
      // ===============================================
      const sessionDuration = (Date.now() - (services.sessionStartTime || Date.now())) / 60000;
      const fatigueIndicator = getFatigueIndicator(turnCount, sessionDuration);
      if (fatigueIndicator) {
        contextParts.push(`[FATIGUE: Jack is getting tired. Consider weaving in: "${fatigueIndicator}"]`);
      }
      
      // ===============================================
      // 6c4. OCCASIONAL MISHEARING - Makes Jack feel real
      // ===============================================
      // 3% chance to "mishear" something - but only for longer messages
      if (userText.length > 50 && Math.random() < 0.03) {
        const mishearing = getMishearingPhrase();
        contextParts.push(`[MISHEARING: Consider pretending you didn't quite catch part of that: "${mishearing}"]`);
      }
      
      // ===============================================
      // 6c5. PROACTIVE INTERJECTIONS - Jack leads sometimes
      // ===============================================
      // Every 8-12 turns, Jack might bring up something HE wants to talk about
      if (turnCount > 0 && turnCount % 10 === 0 && Math.random() < 0.25) {
        const interjection = getProactiveInterjection();
        contextParts.push(`[PROACTIVE: Consider interjecting with something YOU want to share: "${interjection}"]`);
      }
      
      // ===============================================
      // 6d. SPONTANEOUS STORY INJECTION (occasional)
      // ===============================================
      // Every 8-12 turns, Jack might share a spontaneous story
      if (turnCount > 0 && turnCount % 10 === 0 && Math.random() < 0.4) {
        const story = getSpontaneousStory();
        contextParts.push(`[SPONTANEOUS STORY: Consider sharing this personal anecdote naturally: "${story}"]`);
      }
      
      // ===============================================
      // 6e. HUMANIZING BEHAVIORS
      // ===============================================
      // Occasionally suggest humanizing behaviors
      if (Math.random() < 0.15) {
        const behaviors = [
          "Pause before responding to show you're thinking.",
          "You could start with 'Well...' or 'You know...' to sound more natural.",
          "Consider trailing off with '...' on a thought to seem reflective.",
          "Add warmth to your voice here.",
          "Reference something physical - 'Let me sit down for this one...'",
        ];
        contextParts.push(`[HUMANIZING: ${behaviors[Math.floor(Math.random() * behaviors.length)]}]`);
      }
      
      // ===============================================
      // 6e2. JACK'S MOOD - He has an internal state
      // ===============================================
      // Only mention mood early in conversation (turn 1-2)
      if (turnCount <= 2 && Math.random() < 0.3) {
        const { mood, indicator } = getJacksMood();
        contextParts.push(`[JACK'S MOOD: You're feeling ${mood} today. You might naturally mention: "${indicator}"]`);
      }
      
      // ===============================================
      // 6e3. ACKNOWLEDGMENT BEFORE ADVICE - Don't jump to solutions
      // ===============================================
      if (analysis.intent.primary === 'seeking_advice' && analysis.emotion.intensity > 0.4) {
        const ack = getAcknowledgmentBeforeAdvice(analysis.emotion.primary || 'neutral');
        contextParts.push(`[ACKNOWLEDGMENT: Before giving advice, acknowledge their emotion first: "${ack}"]`);
      }
      
      // ===============================================
      // 6e4. CONVERSATION RHYTHM - Build and release tension
      // ===============================================
      const recentTension = currentUserData?.conversationMood === 'heavy' || currentUserData?.conversationMood === 'deep';
      const rhythm = getConversationRhythm(turnCount, recentTension);
      if (rhythm) {
        contextParts.push(`[RHYTHM: Consider shifting the conversation energy: "${rhythm}"]`);
      }
      
      // ===============================================
      // 6e5. CLOSING AWARENESS - Know when winding down
      // ===============================================
      const closingBehavior = getClosingBehavior(turnCount, analysis.intent.primary);
      if (closingBehavior) {
        contextParts.push(`[CLOSING: The conversation seems to be winding down. Consider: "${closingBehavior}"]`);
      }
      
      // ===============================================
      // 6f. PET PEEVE CHECK - Jack gets fired up!
      // ===============================================
      const petPeeveRant = checkPetPeeve(userText);
      if (petPeeveRant) {
        contextParts.push(`[PET PEEVE ACTIVATED: This topic gets Jack fired up! Consider including this passionate response: "${petPeeveRant}"]`);
        this.logger.info('Pet peeve triggered');
      }
      
      // ===============================================
      // 6g. ACTIVE LISTENING - Show engagement
      // ===============================================
      // After user shares something significant, acknowledge it
      if (userText.length > 100 || analysis.intent.primary === 'confiding') {
        const listeningCue = getListeningCue();
        contextParts.push(`[ACTIVE LISTENING: Start with a brief acknowledgment like "${listeningCue}" before responding to show you're engaged.]`);
      }
      
      // ===============================================
      // 6g2. VERBAL BACKCHANNELS - Reactive acknowledgments
      // ===============================================
      // Add backchannels at the START of responses to show real-time listening
      const primaryEmotion = analysis.emotion.primary || 'neutral';
      const backchannel = getVerbalBackchannel(userText.length, primaryEmotion);
      if (backchannel) {
        contextParts.push(`[VERBAL BACKCHANNEL: Start your response with exactly "${backchannel}" to show you were listening in real-time. This happens BEFORE you think about your response.]`);
      }
      
      // ===============================================
      // 6g3. TIME SINCE LAST CONVERSATION - Reference for returning users
      // ===============================================
      if (turnCount <= 2 && services.userProfile?.lastContact) {
        const timeContext = getTimeSinceContext(services.userProfile.lastContact);
        if (timeContext) {
          contextParts.push(`[TIME AWARENESS: Consider mentioning: "${timeContext}"]`);
        }
      }
      
      // ===============================================
      // 6g4. EMOTIONAL CONTINUITY - Check on previous feelings
      // ===============================================
      if (turnCount <= 3 && services.userProfile?.emotionalPatterns) {
        const emotionalContinuity = getEmotionalContinuity(services.userProfile);
        if (emotionalContinuity) {
          contextParts.push(`[EMOTIONAL CONTINUITY: User had distress in previous conversations. Consider checking in: "${emotionalContinuity}"]`);
        }
      }
      
      // ===============================================
      // 6g5. PERSONAL DETAIL CALLBACKS - Use specific knowledge
      // ===============================================
      // Every 6-10 turns, reference something specific Jack knows about them
      if (turnCount > 5 && turnCount % 7 === 0 && services.userProfile) {
        const personalCallback = getPersonalDetailCallback(services.userProfile);
        if (personalCallback) {
          contextParts.push(`[PERSONAL DETAIL: You know specific things about this person. Consider naturally mentioning: "${personalCallback}"]`);
        }
      }
      
      // ===============================================
      // 6g6. CONVERSATION DEPTH AWARENESS
      // ===============================================
      const topicsDiscussed = currentUserData?.topics || [];
      const emotionalMomentCount = currentUserData?.keyMoments?.length || 0;
      const depth = getConversationDepth(turnCount, topicsDiscussed, emotionalMomentCount);
      
      if (depth === 'deep') {
        contextParts.push(`[DEPTH: This is a DEEP conversation. You've built trust. You can be more direct, personal, and vulnerable. Share wisdom from your heart.]`);
      } else if (depth === 'surface') {
        contextParts.push(`[DEPTH: Still at SURFACE level. Focus on building connection before diving into advice. Ask about THEM.]`);
      }
      
      // ===============================================
      // 6h. CATCHPHRASE OPPORTUNITY
      // ===============================================
      // When giving advice, occasionally use a signature catchphrase
      if (analysis.intent.primary === 'seeking_advice' && Math.random() < 0.3) {
        const catchphrase = getCatchphrase();
        contextParts.push(`[CATCHPHRASE: Consider ending with this signature phrase: "${catchphrase}"]`);
      }
      
      // ===============================================
      // 6i. THINKING OUT LOUD
      // ===============================================
      // For complex questions, show thinking process
      if (analysis.intent.primary === 'asking_question' && userText.includes('?') && Math.random() < 0.4) {
        const thinking = getThinkingPhrase();
        contextParts.push(`[THINKING: Start with something like "${thinking}" to show you're processing their question thoughtfully.]`);
      }
      
      // ===============================================
      // 6j. WIT & HUMOR (occasional)
      // ===============================================
      if (analysis.emotion.valence === 'positive' && Math.random() < 0.15) {
        const witty = getWittyRemark();
        contextParts.push(`[HUMOR: If appropriate, consider this witty observation: "${witty}"]`);
      }
      
      // ===============================================
      // 6k. HUMILITY - Acknowledge limits
      // ===============================================
      // When user asks something outside core expertise
      const outsideExpertise = /\b(tax|legal|insurance|real estate|medical|health)\b/i.test(userText);
      if (outsideExpertise && Math.random() < 0.5) {
        const humility = getHumilityPhrase();
        contextParts.push(`[HUMILITY: This touches on areas outside Jack's core expertise. Consider adding: "${humility}"]`);
      }
      
      // ===============================================
      // 6L. CULTURAL MOMENT AWARENESS
      // ===============================================
      // Check for relevant cultural/financial moments (holidays, tax season, etc.)
      if (turnCount <= 3) {
        const culturalMoment = detectCulturalMoment();
        if (culturalMoment && Math.random() < 0.4) {
          contextParts.push(`[CULTURAL MOMENT: ${culturalMoment.name} - Consider mentioning: "${culturalMoment.reference}"]`);
        }
      }
      
      // ===============================================
      // 6M. USER ENGAGEMENT DETECTION
      // ===============================================
      // Track if user is engaged or checked out
      const recentTurns = services.historyTracker?.getRecentTurns(8) || [];
      const recentMessages = recentTurns.map((t: { role: 'user' | 'assistant'; content: string }) => ({ role: t.role, content: t.content }));
      const engagement = detectUserEngagement(recentMessages);
      
      if (engagement.level === 'checked_out' || engagement.level === 'disengaged') {
        contextParts.push(`[ENGAGEMENT: User seems ${engagement.level}. ${engagement.suggestions.join(' ')}`);
      } else if (engagement.level === 'highly_engaged') {
        contextParts.push(`[ENGAGEMENT: User is highly engaged! They're invested in this conversation. Match their energy.]`);
      }
      
      // ===============================================
      // 6N. RUNNING JOKES WITH RETURNING USERS
      // ===============================================
      if (services.userProfile && services.userProfile.totalConversations >= 2) {
        const currentTopic = analysis.topics.detected[0] || '';
        const joke = getRunningJokeCallback(services.userProfile, currentTopic);
        if (joke) {
          const jokeType = joke.isCallback ? 'callback' : 'setup';
          contextParts.push(`[RUNNING JOKE (${jokeType}): Consider weaving this in naturally: "${joke.joke}"]`);
        }
      }
      
      // ===============================================
      // 6O. JACK'S SPONTANEOUS THOUGHTS
      // ===============================================
      // Occasionally have Jack share an unprompted thought
      const spontaneousThought = getSpontaneousThought();
      if (spontaneousThought) {
        contextParts.push(`[SPONTANEOUS: Jack is in a thoughtful mood. Consider sharing: "${spontaneousThought.thought}"]`);
      }
      
      // ===============================================
      // 6P. PREFERENCE LEARNING
      // ===============================================
      // Learn user preferences from conversation patterns
      const userMsgs = recentMessages.filter((m: { role: string }) => m.role === 'user').map((m: { content: string }) => m.content);
      const preferences = inferUserPreferences(userMsgs, services.userProfile);
      const prefGuidance = getPreferenceGuidance(preferences);
      if (prefGuidance) {
        contextParts.push(`[PREFERENCES: ${prefGuidance}]`);
      }
      
      // ===============================================
      // 6Q. VOICE PROSODY RESPONSE
      // ===============================================
      // Respond to HOW they sound, not just what they say
      if (voiceEmotion) {
        const prosodyResponse = getVoiceProsodyResponse(voiceEmotion);
        if (prosodyResponse.shouldAdjust) {
          contextParts.push(`[VOICE ANALYSIS: ${prosodyResponse.guidance}${prosodyResponse.emotionalMirror ? ` You could say: "${prosodyResponse.emotionalMirror}"` : ''}]`);
        }
      }
      
      // ===============================================
      // 6R. TOPIC THREADING VERIFICATION
      // ===============================================
      // Make sure Jack actually circles back to topics
      const topicsToCircleBack = services.getPromptContext().topicsToCircleBack || [];
      if (topicsToCircleBack.length > 0 && turnCount > 5) {
        const threading = verifyTopicThreading(recentMessages, topicsToCircleBack);
        if (threading.suggestion) {
          contextParts.push(`[TOPIC THREADING: ${threading.suggestion}]`);
        }
      }
      
      // ===============================================
      // 6S. PROACTIVE GOAL REFERENCE
      // ===============================================
      // Connect conversation to user's financial goals
      if (services.userProfile?.goals && services.userProfile.goals.length > 0) {
        const currentTopic = analysis.topics.detected[0] || userText.slice(0, 50);
        const goalRef = getProactiveGoalReference(services.userProfile, currentTopic);
        if (goalRef) {
          contextParts.push(`[GOAL CONNECTION: ${goalRef}]`);
        }
      }
      
      // ===============================================
      // 6T. SMALL DETAIL EXTRACTION & MEMORY
      // ===============================================
      // Extract specific details (pet names, family names, places) and remember them
      const extractedDetails = extractSmallDetails(userText);
      if (extractedDetails.length > 0) {
        // Store for future reference
        if (currentUserData) {
          currentUserData.extractedDetails = [
            ...(currentUserData.extractedDetails || []),
            ...extractedDetails
          ].slice(-20); // Keep last 20 details
        }
        
        this.logger.info({ count: extractedDetails.length }, 'Extracted small details from user message');
        
        // If we have previous details, suggest using them
        if (currentUserData?.extractedDetails && currentUserData.extractedDetails.length > extractedDetails.length) {
          const oldDetail = currentUserData.extractedDetails[Math.floor(Math.random() * (currentUserData.extractedDetails.length - extractedDetails.length))];
          if (oldDetail && Math.random() < 0.2) {
            const callback = getDetailCallback(oldDetail);
            if (callback) {
              contextParts.push(`[REMEMBERED DETAIL: You know about their ${oldDetail.type} "${oldDetail.value}". Consider: "${callback}"]`);
            }
          }
        }
      }
      
      // ===============================================
      // 6U. JACK'S PHYSICAL STATE
      // ===============================================
      // Jack has physical awareness that varies with time of day
      const hour = new Date().getHours();
      const sessionDurationMins = services.sessionStartTime 
        ? Math.round((Date.now() - services.sessionStartTime) / 60000)
        : 0;
      
      const physicalState = getJackPhysicalState(hour, sessionDurationMins, turnCount);
      const physicalInterjection = getPhysicalStateInterjection(physicalState);
      
      if (physicalInterjection && physicalInterjection !== currentUserData?.lastPhysicalNote) {
        contextParts.push(`[JACK'S PHYSICAL STATE: ${physicalState.mood}, ${physicalState.energyLevel} energy. Consider mentioning: "${physicalInterjection}"]`);
        if (currentUserData) currentUserData.lastPhysicalNote = physicalInterjection;
      }
      
      // ===============================================
      // 6V. CONVERSATION PACING SCORE
      // ===============================================
      // Real-time assessment of how the conversation is going
      if (turnCount > 5 && turnCount % 5 === 0) {
        const pacingScore = calculatePacingScore(
          recentMessages,
          turnCount,
          analysis.topics.detected,
          currentUserData?.keyMoments?.length || 0,
          0 // goals reached - would need to track
        );
        
        if (currentUserData) currentUserData.lastPacingScore = pacingScore.overallScore;
        
        if (pacingScore.assessment === 'needs_attention' || pacingScore.assessment === 'struggling') {
          contextParts.push(`[PACING ALERT: Conversation is ${pacingScore.assessment}. ${pacingScore.suggestions.join(' ')}]`);
          this.logger.warn({ score: pacingScore.overallScore, assessment: pacingScore.assessment }, 'Conversation pacing needs attention');
        } else if (pacingScore.assessment === 'excellent') {
          contextParts.push(`[PACING: Excellent conversation flow! Keep doing what you're doing.]`);
        }
      }
      
      // ===============================================
      // 6W. SESSION RECOVERY CHECK
      // ===============================================
      // If this is a reconnection, acknowledge it
      if (currentUserData?.sessionRecoveryState?.wasDisconnected) {
        const recovery = currentUserData.sessionRecoveryState;
        if (shouldAttemptRecovery(recovery.disconnectedAt)) {
          contextParts.unshift(`[SESSION RECOVERED: You were disconnected. START with: "${recovery.recoveryGreeting}"]`);
          currentUserData.sessionRecoveryState = undefined; // Clear after using
          this.logger.info('Session recovery greeting injected');
        }
      }
      
      // ===============================================
      // 7. SEMANTIC RAG LOOKUP (with timeout to prevent hanging)
      // ===============================================
      try {
        const ragTimeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
        const ragContent = await Promise.race([
          services.searchKnowledge(userText),
          ragTimeoutPromise
        ]);
        if (ragContent) {
          contextParts.push(`[KNOWLEDGE: ${ragContent}]`);
        }
      } catch (ragError) {
        this.logger.warn(`RAG lookup failed (non-blocking): ${ragError}`);
      }
      
      } catch (contextBuildError) {
        // Catch any errors in the entire context building process
        this.logger.warn(`Context building failed (continuing without context): ${contextBuildError}`);
      }
      
      // Log time spent building context
      const contextBuildTime = Date.now() - contextBuildStart;
      if (contextBuildTime > 1000) {
        this.logger.warn({ contextBuildTime }, 'Context building took longer than expected');
      } else {
        this.logger.info({ contextBuildTime }, 'Context built successfully');
      }
      
    } else {
      // Fallback to enhanced RAG if services not available
      const ragContent = ragLookup(userText, {
        // No services means no context, but basic lookup still works
      });
      if (ragContent) {
        contextParts.push(`[KNOWLEDGE: ${ragContent}]`);
      }
    }
    
    // ===============================================
    // 8. INJECT CONTEXT INTO CHAT
    // ===============================================
    if (contextParts.length > 0) {
      // CRITICAL: This message is ONLY for guiding the response, NEVER spoken
      // The LLM should internalize this context but never verbalize any of it
      const contextInjection = `
===SYSTEM CONTEXT (NEVER SPEAK ANY OF THIS)===
The following is internal guidance for your response. 
DO NOT read any of these bracketed sections aloud.
DO NOT say words like "internal", "memory", "context", "phase", "emotion", etc.
Just use this information to shape a natural, human response.

${contextParts.join('\n')}

===END SYSTEM CONTEXT===
`.trim();
      
      turnCtx.addMessage({
        role: 'user',
        content: contextInjection,
      });
      
      this.logger.debug(`Injected ${contextParts.length} context elements`);
    }
  }
}

// Global session services reference for the agent hooks
let globalSessionServices: SessionServices | undefined;

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const logger = log();
    const startTime = Date.now();
    console.log('========================================');
    console.log('=== PREWARM CALLED ===');
    console.log('========================================');
    console.log('Process ID:', process.pid);
    console.log('Memory usage:', JSON.stringify(process.memoryUsage()));
    console.log('Uptime:', process.uptime(), 'seconds');
    logger.info({ pid: process.pid }, 'Prewarm starting...');
    
    // Initialize services (memory, intelligence, vector store with embeddings)
    // This indexes persona content for semantic RAG - critical for knowledge retrieval
    try {
      console.log('Initializing services and indexing persona content...');
      const servicesStart = Date.now();
      await initializeServices();
      console.log(`Services initialized in ${Date.now() - servicesStart}ms`);
      logger.info({ elapsed: Date.now() - servicesStart }, 'Services initialized (with persona indexing)');
    } catch (error) {
      console.log('Services initialization failed (will retry on first connection):', error);
      logger.warn({ error }, 'Services initialization failed in prewarm');
    }
    
    // Mark VAD as not loaded - will load on first connection
    proc.userData.vadLoaded = false;
    
    const elapsed = Date.now() - startTime;
    logger.info({ elapsed }, 'Prewarm complete');
    console.log('=== PREWARM DONE - READY FOR JOBS ===');
    console.log('========================================');
  },
  
  entry: async (ctx: JobContext) => {
    const logger = log();
    const entryStartTime = Date.now();
    
    // COMPREHENSIVE LOGGING - Log everything about the job context
    console.log('========================================');
    console.log('=== ENTRY FUNCTION CALLED ===');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Process ID:', process.pid);
    console.log('Job ID:', ctx.job.id);
    console.log('Job Type:', ctx.job.type);
    console.log('Room Name:', ctx.room?.name);
    console.log('Room available:', !!ctx.room);
    console.log('Agent Name from Job:', ctx.job.agentName);
    console.log('Metadata:', ctx.job.metadata);
    console.log('Dispatch ID:', ctx.job.dispatchId);
    console.log('Memory usage:', JSON.stringify(process.memoryUsage()));
    
    logger.info({
      jobId: ctx.job.id,
      jobType: ctx.job.type,
      roomName: ctx.room?.name,
      roomAvailable: !!ctx.room,
      agentName: ctx.job.agentName,
      dispatchId: ctx.job.dispatchId,
      metadata: ctx.job.metadata,
    }, '=== ENTRY FUNCTION CALLED - FULL JOB CONTEXT ===');
    
    const sessionId = ctx.room?.name || `session-${Date.now()}`;
    console.log('Session ID:', sessionId);
    
    try {
      // ===============================================
      // STEP 1: IDENTIFY USER (Phone, Web Auth, or Anonymous)
      // ===============================================
      console.log('--- STEP 1: Identifying user ---');
      let userId: string | undefined;
      let userName: string | undefined;
      let userContext: string | undefined;
      let identificationSource: string = 'anonymous';
      
      try {
        if (ctx.job.metadata) {
          console.log('Raw metadata:', ctx.job.metadata);
          const metadata = JSON.parse(ctx.job.metadata);
          console.log('Parsed metadata:', JSON.stringify(metadata));
          
          // Use intelligent user identification service
          const { identifyFromMetadata } = await import('../services/user-identification.js');
          const identification = await identifyFromMetadata(metadata);
          
          userId = identification.userId;
          identificationSource = identification.source.type;
          
          // Get userName from metadata or profile
          userName = metadata.user_name || metadata.userName || identification.profile?.name;
          userContext = metadata.context;
          
          logger.info({ 
            userId, 
            userName, 
            source: identificationSource,
            isNew: identification.isNew,
            isReturning: identification.isReturning,
          }, 'User identified');
          
          console.log('Identified user:', {
            userId,
            userName,
            source: identificationSource,
            isNew: identification.isNew,
            isReturning: identification.isReturning,
          });
        } else {
          console.log('No metadata in job - anonymous session');
        }
      } catch (e) {
        console.log('User identification error:', e);
        logger.debug('User identification failed, using anonymous');
      }
      console.log('--- STEP 1 COMPLETE ---');
      console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');
      
      // ===============================================
      // STEP 2: Room info only (connect happens AFTER session.start per official example)
      // ===============================================
      console.log('--- STEP 2: Room info ---');
      console.log('Room object exists:', !!ctx.room);
      console.log('Room name:', ctx.room?.name);
      logger.info({ roomName: ctx.room?.name }, 'Room info');
      console.log('--- STEP 2 COMPLETE ---');
      console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');
      
      // ===============================================
      // STEP 3: CREATE SESSION SERVICES (INTELLIGENCE LAYER)
      // ===============================================
      console.log('--- STEP 3: Creating session services ---');
      logger.info({ sessionId, userId }, 'Creating session services');
      
      const servicesStartTime = Date.now();
      const services = await createSessionServices(sessionId, userId);
      const servicesElapsed = Date.now() - servicesStartTime;
      
      console.log(`Session services created in ${servicesElapsed}ms`);
      logger.info({ elapsed: servicesElapsed }, 'Session services created');
    
    // Set global reference for agent hooks to access
    globalSessionServices = services;
    
    const isReturningUser = services.userProfile !== null && (services.userProfile.totalConversations || 0) > 0;
    console.log('Is returning user:', isReturningUser);
    
    if (isReturningUser) {
      console.log('Returning user profile:', JSON.stringify(services.userProfile, null, 2));
      logger.info({
        userId: services.userProfile?.id,
        name: services.userProfile?.name,
        totalConversations: services.userProfile?.totalConversations,
        lastSummary: services.userProfile?.lastConversationSummary?.slice(0, 100),
      }, 'Returning user detected');
    }
    console.log('--- STEP 3 COMPLETE ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');

    // ===============================================
    // STEP 4: INITIALIZE ENHANCED USER DATA
    // ===============================================
    console.log('--- STEP 4: Initializing user data ---');
    const userData: UserData = {
      name: userName || services.userProfile?.name,
      userId,
      isReturningUser,
      services, // Attach intelligence services
      turnCount: 0,
    };
    console.log('User data initialized:', JSON.stringify({ name: userData.name, userId: userData.userId, isReturningUser: userData.isReturningUser }));
    console.log('--- STEP 4 COMPLETE ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');

    // ===============================================
    // STEP 5: LOAD VAD AND CREATE SESSION
    // ===============================================
    console.log('--- STEP 5: Loading VAD ---');
    // Load VAD on first connection (deferred from prewarm to avoid timeout)
    let vad = ctx.proc.userData.vad;
    console.log('VAD already loaded in proc?', !!vad);
    
    if (!vad) {
      const vadStartTime = Date.now();
      console.log('Loading Silero VAD from scratch...');
      logger.info('Loading Silero VAD...');
      vad = await silero.VAD.load();
      ctx.proc.userData.vad = vad;
      const vadElapsed = Date.now() - vadStartTime;
      console.log(`VAD loaded in ${vadElapsed}ms`);
      logger.info({ elapsed: vadElapsed }, 'VAD loaded successfully');
    } else {
      console.log('Reusing cached VAD');
    }
    console.log('--- STEP 5a COMPLETE - VAD ready ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');
    
    console.log('--- STEP 5b: Creating AgentSession ---');
    console.log('Creating voice.AgentSession with:');
    console.log('  - VAD: Silero');
    console.log('  - LLM: Gemini 2.0 Flash');
    console.log('  - TTS: Cartesia sonic-3 (with voice switching)');
    console.log('  - Google API Key present:', !!process.env.GOOGLE_API_KEY);
    console.log('  - Cartesia API Key present:', !!process.env.CARTESIA_API_KEY);
    
    // Initialize voice manager for Jack/Peter switching
    const voiceManager = getVoiceManager();
    voiceManager.initialize();
    console.log('  - Voice Manager: initialized (Jack + Peter voices)');
    
    // Create DynamicTTS that switches voices based on current agent
    const dynamicTTS = createDynamicTTS();
    console.log('  - DynamicTTS: ready (auto-switches Jack ↔ Peter)');
    
    const sessionStartTime = Date.now();
    const session = new voice.AgentSession({
      vad: vad as silero.VAD,
      llm: new google.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        modalities: [Modality.TEXT],
        temperature: 0.8,
        language: 'en-US', // Force English transcription
        instructions: BOGLE_PERSONA,
        // Enable server-side turn detection for better transcription
        // Note: This may affect onUserTurnCompleted timing
      }),
      tts: dynamicTTS, // DynamicTTS auto-switches between Jack and Peter voices!
      userData,
    });
    
    // Listen for voice switch events
    handoffEvents.on('voiceSwitch', (data: { newAgent: 'jack' | 'peter'; voiceId: string }) => {
      console.log(`\n🎤 [VOICE SWITCH] Now speaking as: ${data.newAgent === 'peter' ? 'Peter Lynch' : 'Jack Bogle'}`);
      logger.info({ newAgent: data.newAgent, voiceId: data.voiceId }, 'Voice switched - next speech will use new voice');
    });
    console.log(`AgentSession created in ${Date.now() - sessionStartTime}ms`);
    console.log('--- STEP 5 COMPLETE ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');

    //  voice: '204beeaf-85e6-4292-8e63-e9e6670e8a2a', 
    // ===============================================
    // 5. INTELLIGENT EVENT LISTENERS
    // ===============================================
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const rawContent = (event.item as { content?: unknown } | undefined)?.content;
      if (typeof rawContent === 'string') {
        const preview = rawContent.slice(0, 200);
        const hasTags = hasSsmlTags(rawContent);
        logger.info(
          {
            role: event.item?.role,
            preview,
            hasSsmlTags: hasTags,
            createdAt: event.createdAt,
          },
          '=== CONVERSATION ITEM ===',
        );
      }
    });

    session.on(voice.AgentSessionEventTypes.SpeechCreated, (event) => {
      logger.info(
        { userInitiated: event.userInitiated, source: event.source, createdAt: event.createdAt },
        '=== SPEECH CREATED ===',
      );
    });

    // Track tool/function executions
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
      const toolNames = event.functionCalls?.map((fc: { name?: string }) => fc.name).join(', ') || 'unknown';
      const toolDetails = event.functionCalls?.map((fc: { name?: string; arguments?: unknown; result?: unknown }) => ({
        name: fc.name,
        args: JSON.stringify(fc.arguments).slice(0, 200),
        result: typeof fc.result === 'string' ? fc.result.slice(0, 100) : JSON.stringify(fc.result).slice(0, 100),
      }));
      logger.info(
        { 
          toolNames,
          callCount: event.functionCalls?.length || 0,
          details: toolDetails,
        },
        '=== TOOL EXECUTED ===',
      );
      console.log(`\n🔧 [TOOL EVENT] ${toolNames}`);
      console.log(`   Details: ${JSON.stringify(toolDetails, null, 2)}`);
    });

    // Track errors
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      console.log(`\n❌ [SESSION ERROR] ${JSON.stringify(event)}`);
      logger.error({ event }, '=== SESSION ERROR ===');
    });

    // Track metrics
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (event) => {
      console.log(`📊 [METRICS] ${JSON.stringify(event).slice(0, 300)}`);
    });

    // ===============================================
    // AGENT STATE TRACKING - Detect interruptions
    // ===============================================
    let wasJackSpeaking = false;
    let jackInterruptedAt: number | null = null;
    let agentSpeakingStartTime: number | null = null;
    const conversationManager = getConversationManager();

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      const oldState = event.oldState;
      const newState = event.newState;

      // Verbose state logging to understand pauses
      console.log(`\n🤖 [AGENT STATE] ${oldState} → ${newState} at ${new Date().toISOString()}`);
      logger.info({ oldState, newState }, '=== AGENT STATE CHANGED ===');

      // Track when Jack starts speaking
      if (newState === 'speaking') {
        agentSpeakingStartTime = Date.now();
        conversationManager.handleAgentStartedSpeaking(''); // Will be updated with actual text
      }

      // Track when Jack stops speaking
      if (oldState === 'speaking' && newState !== 'speaking') {
        if (agentSpeakingStartTime) {
          const duration = Date.now() - agentSpeakingStartTime;
          conversationManager.handleAgentFinishedSpeaking(duration);
          agentSpeakingStartTime = null;
        }
      }

      // Detect when Jack was interrupted mid-speech
      // Only count as interruption if Jack was speaking AND user is now speaking
      // (not when Jack naturally finishes speaking)
      if (oldState === 'speaking' && newState === 'listening') {
        // Check if Jack spoke for less than expected (likely interrupted)
        // A full response typically takes 3+ seconds
        const speakingDuration = agentSpeakingStartTime ? Date.now() - agentSpeakingStartTime : 0;
        const likelyInterrupted = speakingDuration > 500 && speakingDuration < 2000; // 0.5-2 seconds = likely cut off
        
        if (likelyInterrupted) {
          jackInterruptedAt = Date.now();
          userData.wasInterrupted = true;
          logger.info({ speakingDuration }, 'Jack was likely interrupted mid-speech');
        }
      }

      wasJackSpeaking = (newState === 'speaking');
    });
    
    // ===============================================
    // USER STATE TRACKING - Detect when user goes silent
    // ===============================================
    let userLastSpokeAt = Date.now();
    let silenceWarned = false;

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      const newState = event.newState;

      if (newState === 'speaking') {
        userLastSpokeAt = Date.now();
        userData.userSpeakingStartTime = userLastSpokeAt; // Track for ConversationManager
        silenceWarned = false;
        conversationManager.handleUserStartedSpeaking(); // Track user speaking
      } else if (newState === 'listening') {
        // User stopped speaking
        if (userData.userSpeakingStartTime) {
          const duration = Date.now() - userData.userSpeakingStartTime;
          conversationManager.handleUserFinishedSpeaking(duration);
        }
      }
      
      if (newState === 'away' && !silenceWarned) {
        // User has been quiet - Jack might gently check in
        const silenceDuration = Date.now() - userLastSpokeAt;
        if (silenceDuration > 10000) { // 10 seconds of silence
          userData.userWentSilent = true;
          silenceWarned = true;
          logger.info({ silenceDuration }, 'User has been silent - Jack will check in');
          
          // Get a contextual silence filler
          const silenceFiller = getSilenceFiller(userData.turnCount || 0);
          
          // Actually say something!
          try {
            session.say(silenceFiller, { allowInterruptions: true });
            logger.info({ filler: silenceFiller.slice(0, 50) }, 'Jack checking in after silence');
          } catch (e) {
            logger.warn({ error: e }, 'Failed to say silence filler');
          }
        }
      }
    });

    // Enhanced user input tracking with WPM estimation
    let lastTranscriptTime = Date.now();
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      // LOG ALL TRANSCRIPTS - even partial ones
      console.log(`\n🎤 [USER INPUT] "${event.transcript}" (isFinal=${event.isFinal}) at ${new Date().toISOString()}`);
      logger.info({ transcript: event.transcript, isFinal: event.isFinal }, '>>> USER TRANSCRIPT <<<');
      
      if (event.isFinal && event.transcript) {
        userData.turnCount = (userData.turnCount || 0) + 1;
        
        // Track WPM for adaptive speech
        const now = Date.now();
        const durationMs = now - lastTranscriptTime;
        lastTranscriptTime = now;
        
        // Only track if reasonable duration (avoid initial spike)
        if (durationMs > 500 && durationMs < 30000) {
          const wpmTracker = getWPMTracker();
          wpmTracker.addSample(event.transcript, durationMs);
          userData.lastUserWPM = wpmTracker.getAverageWPM();
          logger.debug({ wpm: userData.lastUserWPM, pace: wpmTracker.getSpeedCategory() }, 'User WPM tracked');
        }
        
        // Auto circle-back every 5-7 turns
        if (userData.turnCount && userData.turnCount > 0 && userData.turnCount % 6 === 0) {
          const circleBackTopics = services.getPromptContext().topicsToCircleBack;
          if (circleBackTopics.length > 0) {
            logger.info({ topics: circleBackTopics }, 'Circle-back opportunity detected');
          }
        }
        
      logger.info(
          { 
            transcript: event.transcript, 
            isFinal: event.isFinal, 
            turnCount: userData.turnCount,
            wpm: userData.lastUserWPM,
            createdAt: event.createdAt 
          },
        '=== USER INPUT ===',
      );
      }
    });

    // ===============================================
    // STEP 6: CREATE INTELLIGENT BOGLE AGENT
    // ===============================================
    console.log('--- STEP 6: Creating BogleAgent ---');
    const agentCreateStart = Date.now();
    const bogleAgent = BogleAgent.create();
    console.log(`BogleAgent created in ${Date.now() - agentCreateStart}ms`);
    
    // Wire session reference for context access
    bogleAgent.setSession(session);
    console.log('Session wired to agent');
    
    console.log('Jack Bogle agent ready with all capabilities');
    logger.info('Jack Bogle agent ready with full intelligence stack');
    console.log('--- STEP 6 COMPLETE ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');

    // ===============================================
    // STEP 7: WAIT FOR PARTICIPANT FIRST (this was working!)
    // The old code waited for participant BEFORE session.start()
    // ===============================================
    // ===============================================
    // STEP 7a: CONNECT AGENT TO ROOM FIRST
    // ===============================================
    console.log('--- STEP 7a: Connecting agent to room ---');
    const connectStart = Date.now();
    await ctx.connect();
    console.log(`ctx.connect() completed in ${Date.now() - connectStart}ms`);
    console.log('Room connected successfully');
    logger.info({ elapsed: Date.now() - connectStart }, 'Agent connected to room');
    console.log('--- STEP 7a COMPLETE ---');
    
    // ===============================================
    // STEP 7b: WAIT FOR HUMAN PARTICIPANT
    // ===============================================
    console.log('--- STEP 7b: Waiting for participant ---');
    const waitStart = Date.now();
    const participant = await ctx.waitForParticipant();
    console.log(`Participant joined after ${Date.now() - waitStart}ms`);
    console.log('Participant identity:', participant.identity);
    logger.info({ identity: participant.identity }, 'Participant joined');
    console.log('--- STEP 7b COMPLETE ---');
    
    // Small delay to ensure audio channel is ready (this was in the working code)
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');

    // ===============================================
    // STEP 8: NOW START SESSION (after participant is ready)
    // ===============================================
    console.log('--- STEP 8: Starting session ---');
    const sessionStartStart = Date.now();
    
    await session.start({
      agent: bogleAgent,
      room: ctx.room,
      inputOptions: {
        noiseCancellation: TelephonyBackgroundVoiceCancellation(),
      },
    });
    
    console.log(`session.start() completed in ${Date.now() - sessionStartStart}ms`);
    console.log('--- STEP 8 COMPLETE ---');
    console.log('Time elapsed:', Date.now() - entryStartTime, 'ms');
    
    // ===============================================
    // STEP 9: GENERATE AND SAY GREETING (async with Gemini dynamic option)
    // ===============================================
    console.log('--- STEP 9: Generating greeting (async) ---');
    const greetingStart = Date.now();
    const greeting = await generateGreeting(userData);
    console.log(`Generated greeting in ${Date.now() - greetingStart}ms:`, greeting.slice(0, 100) + '...');
    logger.info({ greeting: greeting.slice(0, 100), latencyMs: Date.now() - greetingStart }, `Generated ${isReturningUser ? 'returning user' : 'new user'} greeting`);
    
    // Apply adaptive SSML to greeting
    // Note: greeting already contains emotion tags, don't wrap it again
    console.log('Applying adaptive SSML...');
    const speechContext = services.getSpeechContext(greeting);
    const enhancedGreeting = tagGreeting(greeting, speechContext);
    console.log('Enhanced greeting (first 150 chars):', enhancedGreeting.slice(0, 150));
    
    // Say the greeting
    console.log('Calling session.say()...');
    try {
      session.say(enhancedGreeting);
      console.log('✅ session.say() called successfully');
    } catch (sayError) {
      console.log('❌ session.say() FAILED:', sayError);
      logger.error({ error: sayError }, 'session.say() failed');
    }

    // Track greeting in conversation history
    services.addTurn('assistant', greeting);
    console.log('--- STEP 9 COMPLETE ---');
    console.log('Total time elapsed:', Date.now() - entryStartTime, 'ms');
    
    // Log session summary
    console.log('========================================');
    console.log('=== SESSION FULLY INITIALIZED ===');
    console.log('========================================');
    console.log('Session ID:', sessionId);
    console.log('User ID:', userId);
    console.log('User Name:', userData.name);
    console.log('Is Returning User:', isReturningUser);
    console.log('Total initialization time:', Date.now() - entryStartTime, 'ms');
    console.log('========================================');
    
    logger.info({
      sessionId,
      userId,
      userName: userData.name,
      isReturningUser,
      servicesActive: !!services,
      totalInitTime: Date.now() - entryStartTime,
    }, '=== SESSION FULLY INITIALIZED ===');
    
    // ===============================================
    // STEP 10: SESSION CLEANUP ON DISCONNECT
    // ===============================================
    ctx.room.on('disconnected', async () => {
      console.log('=== ROOM DISCONNECTED ===');
      console.log('Session ID:', sessionId);
      logger.info({ sessionId }, 'Session ending');
      try {
        await services.endSession();
        globalSessionServices = undefined;
        console.log('Session cleanup complete');
        logger.info('Session cleanup complete');
      } catch (error) {
        console.log('Session cleanup error:', error);
        logger.warn(`Session cleanup error: ${error}`);
      }
    });
    
    } catch (entryError) {
      // CRITICAL: Catch and log any errors in entry function
      console.log('========================================');
      console.log('=== ENTRY FUNCTION FAILED ===');
      console.log('========================================');
      console.log('Error type:', (entryError as Error).constructor.name);
      console.log('Error message:', (entryError as Error).message);
      console.log('Error stack:', (entryError as Error).stack);
      console.log('========================================');
      logger.error({ 
        error: (entryError as Error).message,
        errorType: (entryError as Error).constructor.name,
        stack: (entryError as Error).stack,
      }, '=== ENTRY FUNCTION FAILED ===');
      throw entryError; // Re-throw to let LiveKit handle
    }
  },
});

// Get timeout from env or use default
const initTimeout = parseInt(process.env.AGENT_INIT_TIMEOUT || '120000', 10);

console.log('=== STARTING WORKER ===');
console.log('Init timeout:', initTimeout);

// Run the agent - accept jobs for john-bogle-agent
cli.runApp(new WorkerOptions({ 
  agent: fileURLToPath(import.meta.url),
  agentName: 'john-bogle-agent',  // Must match dispatch agent name
}));

console.log('=== CLI.RUNAPP CALLED ===');

