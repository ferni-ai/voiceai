/**
 * Habit Intelligence Domain
 *
 * "Better Than Human" habit coaching capabilities that no human coach can consistently provide.
 * These tools leverage perfect memory and pattern recognition across years of habit data.
 *
 * DOMAIN: habits (intelligence sub-module, merged from habit-intelligence)
 * TOOLS:
 *   HabitDNA: trackHabitDNA - Complete genetic profile of every habit attempt
 *   Friction: mapFriction - Track exactly where/when habits fail
 *   Tendencies: assessTendency - Dynamic Four Tendencies profiling
 *   Keystone: detectKeystone - Find habits that cascade into others
 *   Identity: trackIdentityShift - "I am someone who..." evolution
 *   Setback: analyzeSetbackPattern - Pattern-match failures across years
 *   Autopsy: conductHabitAutopsy - Deep post-mortem for dead habits
 *
 * SUPERHUMAN CAPABILITY: These tools leverage perfect memory to provide
 * habit coaching that transcends what any human coach could offer.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services for persistence
import {
  recordHabitDNA,
  getHabitDNA,
  recordFrictionPoint,
  getFrictionPoints,
  recordTendencySignal,
  getTendencyProfile,
  recordKeystoneObservation,
  getKeystoneHabits,
  recordIdentityStatement,
  getIdentityEvolution,
  recordSetbackPattern,
  getSetbackPatterns,
  recordHabitAutopsy,
  getHabitAutopsies,
} from '../../../services/superhuman/habit-intelligence-services.js';

const log = createLogger({ module: 'tools:habit-intelligence' });

// ============================================================================
// HABIT DNA TRACKER - Complete genetic profile of habits
// ============================================================================

const trackHabitDNADef: ToolDefinition = {
  id: 'trackHabitDNA',
  name: 'Track Habit DNA',
  description:
    'Build a complete genetic profile of a habit: what makes it live, what kills it, optimal conditions for survival.',
  domain: 'habits',
  tags: ['habits', 'patterns', 'memory', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackHabitDNA'),
      parameters: z.object({
        habitName: z.string().describe('Name of the habit'),
        event: z
          .enum(['started', 'maintained', 'struggled', 'broke', 'restarted', 'mastered'])
          .describe('What happened with this habit'),
        context: z.string().optional().describe('Context around this event'),
        triggerOrBarrier: z
          .string()
          .optional()
          .describe('What triggered success or caused failure'),
        emotionalState: z.string().optional().describe('How they were feeling'),
        timeOfDay: z.string().optional().describe('When this typically happens'),
        checkHistory: z.boolean().default(false).describe('True to retrieve habit history instead'),
      }),
      execute: async ({
        habitName,
        event,
        context,
        triggerOrBarrier,
        emotionalState,
        timeOfDay,
        checkHistory,
      }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, habitName, event, checkHistory }, 'Tracking habit DNA');

        if (checkHistory) {
          const dna = await getHabitDNA(userId, habitName);

          if (!dna || dna.events.length === 0) {
            return `I don't have any history for "${habitName}" yet. Tell me about it - when did you start? What happened?`;
          }

          let response = `**Habit DNA: ${habitName}**\n\n`;
          response += `📊 **Lifetime Stats:**\n`;
          response += `• Started ${dna.timesStarted}x | Broke ${dna.timesBroke}x | Current streak: ${dna.currentStreak} days\n`;
          response += `• Longest streak ever: ${dna.longestStreak} days\n\n`;

          if (dna.commonTriggers.length > 0) {
            response += `✅ **What Makes It Stick:**\n`;
            response += dna.commonTriggers.map((t) => `• ${t}`).join('\n') + '\n\n';
          }

          if (dna.commonBarriers.length > 0) {
            response += `❌ **What Kills It:**\n`;
            response += dna.commonBarriers.map((b) => `• ${b}`).join('\n') + '\n\n';
          }

          if (dna.optimalConditions) {
            response += `🎯 **Your Optimal Conditions:**\n`;
            response += `• Best time: ${dna.optimalConditions.bestTime || 'unknown'}\n`;
            response += `• Best context: ${dna.optimalConditions.bestContext || 'unknown'}\n`;
            response += `• Best mood: ${dna.optimalConditions.bestMood || 'unknown'}\n\n`;
          }

          response += `**Recent Events:**\n`;
          for (const evt of dna.events.slice(-5)) {
            const date = new Date(evt.date).toLocaleDateString();
            response += `• ${date}: ${evt.event}`;
            if (evt.context) response += ` (${evt.context})`;
            response += '\n';
          }

          return response;
        }

        // Record new event
        await recordHabitDNA(userId, habitName, {
          event,
          context,
          triggerOrBarrier,
          emotionalState,
          timeOfDay,
          date: new Date().toISOString(),
        });

        let response = `**Habit DNA Updated: ${habitName}**\n\n`;
        response += `Recorded: ${event}\n`;

        if (triggerOrBarrier) {
          if (event === 'maintained' || event === 'mastered') {
            response += `Success factor: "${triggerOrBarrier}" - I'll remember this works for you.\n`;
          } else if (event === 'struggled' || event === 'broke') {
            response += `Barrier identified: "${triggerOrBarrier}" - Adding to your friction map.\n`;
          }
        }

        if (emotionalState) {
          response += `Emotional context: ${emotionalState}\n`;
        }

        response += '\n';
        response += `I'm building your complete habit DNA over time. `;
        response += `The more I know, the better I can help you understand YOUR unique patterns.\n\n`;
        response += `Want to see your full habit history for ${habitName}?`;

        return response;
      },
    });
  },
};

// ============================================================================
// FRICTION MAPPER - Track exactly where habits fail
// ============================================================================

const mapFrictionDef: ToolDefinition = {
  id: 'mapFriction',
  name: 'Map Friction',
  description:
    'Track exactly where, when, and why habits encounter friction. Build a map of your willpower failure points.',
  domain: 'habits',
  tags: ['habits', 'friction', 'barriers', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('mapFriction'),
      parameters: z.object({
        habitName: z.string().describe('Which habit encountered friction'),
        frictionType: z
          .enum(['time', 'location', 'energy', 'social', 'emotional', 'environmental', 'other'])
          .describe('Type of friction'),
        description: z.string().describe('What specifically caused the friction'),
        intensity: z
          .enum(['minor', 'moderate', 'major'])
          .optional()
          .describe('How much it derailed you'),
        viewMap: z
          .boolean()
          .default(false)
          .describe('True to view friction map instead of recording'),
      }),
      execute: async ({ habitName, frictionType, description, intensity, viewMap }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, habitName, frictionType, viewMap }, 'Mapping friction');

        if (viewMap) {
          const frictionPoints = await getFrictionPoints(userId, habitName);

          if (frictionPoints.length === 0) {
            return `No friction points recorded for "${habitName}" yet. Tell me when you struggle - I'll help you see patterns.`;
          }

          let response = `**Friction Map: ${habitName}**\n\n`;

          // Group by type
          const byType: Record<string, typeof frictionPoints> = {};
          for (const fp of frictionPoints) {
            if (!byType[fp.frictionType]) byType[fp.frictionType] = [];
            byType[fp.frictionType].push(fp);
          }

          for (const [type, points] of Object.entries(byType)) {
            const majorCount = points.filter((p) => p.intensity === 'major').length;
            response += `**${type.toUpperCase()} friction** (${points.length} occurrences, ${majorCount} major):\n`;
            for (const point of points.slice(-3)) {
              response += `• ${point.description}`;
              if (point.intensity) response += ` [${point.intensity}]`;
              response += '\n';
            }
            response += '\n';
          }

          response += `**Pattern Insight:**\n`;
          const mostCommon = Object.entries(byType).sort((a, b) => b[1].length - a[1].length)[0];
          response += `Your biggest friction category is **${mostCommon[0]}** with ${mostCommon[1].length} incidents.\n`;
          response += `This is where we should focus environment design.\n\n`;

          response += `What if we designed a system that eliminates your top friction point?`;

          return response;
        }

        // Record friction point
        await recordFrictionPoint(userId, habitName, {
          frictionType,
          description,
          intensity: intensity || 'moderate',
          recordedAt: new Date().toISOString(),
        });

        let response = `**Friction Point Recorded**\n\n`;
        response += `Habit: ${habitName}\n`;
        response += `Type: ${frictionType}\n`;
        response += `What happened: ${description}\n`;
        if (intensity) response += `Impact: ${intensity}\n`;

        response += '\n';
        response += `I'm mapping all your friction points. Over time, I'll see patterns `;
        response += `you can't - like "you always struggle with exercise when it's a social friction" `;
        response += `or "morning habits fail when there's environmental friction."\n\n`;

        response += `This is how we design systems that work FOR you, not against you.`;

        return response;
      },
    });
  },
};

// ============================================================================
// FOUR TENDENCIES PROFILER - Dynamic tendency assessment
// ============================================================================

const assessTendencyDef: ToolDefinition = {
  id: 'assessTendency',
  name: 'Assess Tendency',
  description:
    'Dynamically assess and track their Four Tendency (Upholder/Questioner/Obliger/Rebel) from behavior patterns.',
  domain: 'habits',
  tags: ['habits', 'tendencies', 'personality', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('assessTendency'),
      parameters: z.object({
        signal: z
          .enum([
            'followed-own-rule',
            'followed-external-rule',
            'broke-own-rule',
            'broke-external-rule',
            'needed-accountability',
            'resisted-external-pressure',
            'questioned-why',
            'just-did-it',
          ])
          .optional()
          .describe('Behavioral signal observed'),
        context: z.string().optional().describe('Context of the signal'),
        getProfile: z.boolean().default(false).describe('True to get current profile'),
      }),
      execute: async ({ signal, context, getProfile }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, signal, getProfile }, 'Assessing tendency');

        if (getProfile) {
          const profile = await getTendencyProfile(userId);

          let response = `**Your Four Tendencies Profile**\n\n`;

          if (!profile || profile.signals.length < 5) {
            response += `I need more data to confidently assess your tendency.\n`;
            response += `I've observed ${profile?.signals.length || 0} signals so far.\n\n`;
            response += `Keep telling me about your habit experiences and I'll learn your pattern.`;
            return response;
          }

          response += `Based on ${profile.signals.length} behavioral signals:\n\n`;
          response += `**Primary Tendency: ${profile.primaryTendency}**\n`;
          response += `Confidence: ${Math.round(profile.confidence * 100)}%\n\n`;

          const tendencyDescriptions: Record<string, string> = {
            Upholder:
              'You meet both inner AND outer expectations. Rules work for you, whether self-imposed or external.',
            Questioner:
              'You need to understand WHY before committing. External rules only work if they make sense to you.',
            Obliger:
              'You meet outer expectations but struggle with inner ones. You need external accountability to thrive.',
            Rebel:
              'You resist ALL expectations. You need to feel like choices are yours. Identity framing works best.',
          };

          response += `**What This Means:**\n`;
          response += tendencyDescriptions[profile.primaryTendency] + '\n\n';

          const strategies: Record<string, string[]> = {
            Upholder: [
              'Simple rules and schedules work great for you',
              'Watch for tightening rules too much - flexibility is healthy',
              'You may need permission to break your own rules sometimes',
            ],
            Questioner: [
              'Always explain the WHY behind a habit',
              'Research backs you up - use it',
              'Beware analysis paralysis - sometimes you need to just try',
            ],
            Obliger: [
              "External accountability is NOT a crutch - it's your strategy",
              'Find accountability partners, groups, coaches',
              "Inner expectations alone will fail - don't rely on them",
            ],
            Rebel: [
              'Frame everything as identity and choice: "I\'m someone who..."',
              'Never use "should" or "have to"',
              'Connect habits to what makes you feel FREE, not obligated',
            ],
          };

          response += `**Your Optimal Strategies:**\n`;
          for (const strategy of strategies[profile.primaryTendency]) {
            response += `• ${strategy}\n`;
          }

          return response;
        }

        if (!signal) {
          return "Tell me about a recent habit experience and I'll learn your tendency pattern.";
        }

        // Record signal
        await recordTendencySignal(userId, {
          signal,
          context,
          recordedAt: new Date().toISOString(),
        });

        // Map signals to tendency indicators
        const tendencyMap: Record<string, string> = {
          'followed-own-rule': 'Upholder',
          'followed-external-rule': 'Upholder/Obliger',
          'broke-own-rule': 'Obliger/Rebel',
          'broke-external-rule': 'Questioner/Rebel',
          'needed-accountability': 'Obliger',
          'resisted-external-pressure': 'Rebel',
          'questioned-why': 'Questioner',
          'just-did-it': 'Upholder',
        };

        let response = `**Tendency Signal Recorded**\n\n`;
        response += `Signal: ${signal}\n`;
        response += `This suggests: ${tendencyMap[signal]} tendencies\n\n`;

        response += `I'm building your tendency profile over time from actual behavior, `;
        response += `not a one-time quiz. Want to see your current profile?`;

        return response;
      },
    });
  },
};

// ============================================================================
// KEYSTONE DETECTOR - Find cascade habits
// ============================================================================

const detectKeystoneDef: ToolDefinition = {
  id: 'detectKeystone',
  name: 'Detect Keystone',
  description:
    'Identify keystone habits that cascade into other positive behaviors. Find your highest-leverage habits.',
  domain: 'habits',
  tags: ['habits', 'keystone', 'leverage', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('detectKeystone'),
      parameters: z.object({
        observation: z
          .string()
          .optional()
          .describe('Observation about habit correlations (e.g., "when I exercise, I eat better")'),
        primaryHabit: z.string().optional().describe('The habit that might be keystone'),
        affectedHabits: z
          .array(z.string())
          .optional()
          .describe('Habits that improve when primary habit happens'),
        viewKeystones: z.boolean().default(false).describe('True to view identified keystones'),
      }),
      execute: async ({ observation, primaryHabit, affectedHabits, viewKeystones }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, primaryHabit, viewKeystones }, 'Detecting keystone');

        if (viewKeystones) {
          const keystones = await getKeystoneHabits(userId);

          if (keystones.length === 0) {
            return `I haven't identified any keystone habits for you yet. Tell me when you notice one habit affecting others!`;
          }

          let response = `**Your Keystone Habits**\n\n`;
          response += `These are your highest-leverage habits - when they happen, other good things follow:\n\n`;

          for (const ks of keystones) {
            const cascadeCount = ks.affectedHabits.length;
            response += `**🔑 ${ks.primaryHabit}** (affects ${cascadeCount} other habits)\n`;
            response += `   → ${ks.affectedHabits.join(', ')}\n`;
            response += `   Observed ${ks.observations.length}x\n\n`;
          }

          response += `**Strategic Insight:**\n`;
          const topKeystone = keystones.sort(
            (a, b) => b.affectedHabits.length - a.affectedHabits.length
          )[0];
          response += `Your most powerful keystone is **${topKeystone.primaryHabit}**.\n`;
          response += `If you could only do ONE habit, this is the one. Everything else follows.\n\n`;

          response += `Protect this habit above all others.`;

          return response;
        }

        if (!observation && !primaryHabit) {
          return 'Tell me about a time when one habit seemed to make other habits easier.';
        }

        // Record observation
        await recordKeystoneObservation(userId, {
          observation: observation || `${primaryHabit} affects ${affectedHabits?.join(', ')}`,
          primaryHabit: primaryHabit || 'unknown',
          affectedHabits: affectedHabits || [],
          recordedAt: new Date().toISOString(),
        });

        let response = `**Keystone Observation Recorded**\n\n`;

        if (primaryHabit && affectedHabits && affectedHabits.length > 0) {
          response += `Potential keystone: **${primaryHabit}**\n`;
          response += `Cascades to: ${affectedHabits.join(', ')}\n\n`;
        }

        if (observation) {
          response += `You noticed: "${observation}"\n\n`;
        }

        response += `I'm tracking these correlations. When I see consistent patterns, `;
        response += `I'll identify your true keystone habits.\n\n`;

        response += `Keystone habits are magic - they make everything else easier without extra willpower.`;

        return response;
      },
    });
  },
};

// ============================================================================
// IDENTITY SHIFT TRACKER - "I am someone who..." evolution
// ============================================================================

const trackIdentityShiftDef: ToolDefinition = {
  id: 'trackIdentityShift',
  name: 'Track Identity Shift',
  description:
    'Track the evolution of identity statements over time. "I am someone who..." is the deepest form of habit change.',
  domain: 'habits',
  tags: ['habits', 'identity', 'transformation', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackIdentityShift'),
      parameters: z.object({
        statement: z
          .string()
          .optional()
          .describe('Identity statement (e.g., "I am someone who exercises")'),
        domain: z
          .enum([
            'health',
            'productivity',
            'relationships',
            'finances',
            'creativity',
            'learning',
            'other',
          ])
          .optional()
          .describe('Life domain'),
        confidence: z
          .enum(['aspiring', 'emerging', 'established', 'core'])
          .optional()
          .describe('How true it feels'),
        viewEvolution: z.boolean().default(false).describe('True to view identity evolution'),
      }),
      execute: async ({ statement, domain, confidence, viewEvolution }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, statement, viewEvolution }, 'Tracking identity shift');

        if (viewEvolution) {
          const evolution = await getIdentityEvolution(userId);

          if (evolution.length === 0) {
            return `I haven't tracked any identity statements for you yet. Tell me: "I am someone who..."`;
          }

          let response = `**Your Identity Evolution**\n\n`;

          // Group by domain
          const byDomain: Record<string, typeof evolution> = {};
          for (const stmt of evolution) {
            if (!byDomain[stmt.domain]) byDomain[stmt.domain] = [];
            byDomain[stmt.domain].push(stmt);
          }

          for (const [dom, statements] of Object.entries(byDomain)) {
            response += `**${dom.toUpperCase()}:**\n`;
            for (const stmt of statements) {
              const icon =
                stmt.confidence === 'core'
                  ? '💎'
                  : stmt.confidence === 'established'
                    ? '✅'
                    : stmt.confidence === 'emerging'
                      ? '🌱'
                      : '🌟';
              response += `${icon} "${stmt.statement}" (${stmt.confidence})\n`;
            }
            response += '\n';
          }

          const coreStatements = evolution.filter((e) => e.confidence === 'core');
          if (coreStatements.length > 0) {
            response += `**Your Core Identity (who you ARE now):**\n`;
            for (const stmt of coreStatements) {
              response += `• ${stmt.statement}\n`;
            }
            response += '\n';
          }

          response += `Identity change is the deepest form of habit change.\n`;
          response += `You don't have to TRY to exercise when you ARE an exerciser.`;

          return response;
        }

        if (!statement) {
          return 'Complete this sentence: "I am someone who..."';
        }

        // Record statement
        await recordIdentityStatement(userId, {
          statement,
          domain: domain || 'other',
          confidence: confidence || 'aspiring',
          recordedAt: new Date().toISOString(),
        });

        let response = `**Identity Statement Recorded**\n\n`;
        response += `"${statement}"\n`;
        response += `Domain: ${domain || 'other'}\n`;
        response += `Confidence: ${confidence || 'aspiring'}\n\n`;

        const confidenceNotes: Record<string, string> = {
          aspiring: "This is who you want to become. That's the first step!",
          emerging: "You're starting to see yourself this way. Evidence is building.",
          established: "This feels true most of the time. You're becoming this person.",
          core: "This is who you ARE. No effort needed - it's just you.",
        };

        response += confidenceNotes[confidence || 'aspiring'] + '\n\n';

        response += `I'll track how this identity evolves. Every action either reinforces or weakens an identity.\n`;
        response += `Each time you act as "${statement}", it becomes more true.`;

        return response;
      },
    });
  },
};

// ============================================================================
// SETBACK ARCHAEOLOGIST - Pattern-match failures across years
// ============================================================================

const analyzeSetbackPatternDef: ToolDefinition = {
  id: 'analyzeSetbackPattern',
  name: 'Analyze Setback Pattern',
  description:
    "Deep pattern analysis of setbacks across years. Find the common threads in every time you've fallen off.",
  domain: 'habits',
  tags: ['habits', 'setbacks', 'patterns', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('analyzeSetbackPattern'),
      parameters: z.object({
        habitName: z.string().describe('Which habit had a setback'),
        whatHappened: z.string().describe('What caused the setback'),
        whenItHappened: z
          .string()
          .optional()
          .describe('Time context (morning, weekend, stressful period)'),
        emotionalTrigger: z.string().optional().describe('Emotional state before the setback'),
        viewPatterns: z
          .boolean()
          .default(false)
          .describe('True to analyze patterns across all setbacks'),
      }),
      execute: async ({
        habitName,
        whatHappened,
        whenItHappened,
        emotionalTrigger,
        viewPatterns,
      }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, habitName, viewPatterns }, 'Analyzing setback pattern');

        if (viewPatterns) {
          const patterns = await getSetbackPatterns(userId);

          if (patterns.length === 0) {
            return `No setback patterns recorded yet. When you have a setback, tell me - I'll help you see the larger pattern.`;
          }

          let response = `**Setback Archaeology**\n\n`;
          response += `I've analyzed ${patterns.length} setbacks across your habits:\n\n`;

          // Analyze common triggers
          const emotionalTriggers: Record<string, number> = {};
          const timeTriggers: Record<string, number> = {};
          const habitCounts: Record<string, number> = {};

          for (const p of patterns) {
            if (p.emotionalTrigger) {
              emotionalTriggers[p.emotionalTrigger] =
                (emotionalTriggers[p.emotionalTrigger] || 0) + 1;
            }
            if (p.whenItHappened) {
              timeTriggers[p.whenItHappened] = (timeTriggers[p.whenItHappened] || 0) + 1;
            }
            habitCounts[p.habitName] = (habitCounts[p.habitName] || 0) + 1;
          }

          response += `**Emotional Patterns:**\n`;
          for (const [trigger, count] of Object.entries(emotionalTriggers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)) {
            response += `• ${trigger}: ${count} setbacks\n`;
          }
          response += '\n';

          if (Object.keys(timeTriggers).length > 0) {
            response += `**Time Patterns:**\n`;
            for (const [time, count] of Object.entries(timeTriggers)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)) {
              response += `• ${time}: ${count} setbacks\n`;
            }
            response += '\n';
          }

          response += `**Most Vulnerable Habits:**\n`;
          for (const [habit, count] of Object.entries(habitCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)) {
            response += `• ${habit}: ${count} setbacks\n`;
          }
          response += '\n';

          response += `**The Pattern:**\n`;
          const topEmotional = Object.entries(emotionalTriggers).sort((a, b) => b[1] - a[1])[0];
          if (topEmotional) {
            response += `You most often break habits when you're feeling ${topEmotional[0]}.\n`;
            response += `This isn't a character flaw - it's valuable data.\n\n`;
          }

          response += `What if we designed a system specifically for when you're feeling ${topEmotional?.[0] || 'triggered'}?`;

          return response;
        }

        // Record setback
        await recordSetbackPattern(userId, {
          habitName,
          whatHappened,
          whenItHappened,
          emotionalTrigger,
          recordedAt: new Date().toISOString(),
        });

        let response = `**Setback Recorded - No Judgment**\n\n`;
        response += `Habit: ${habitName}\n`;
        response += `What happened: ${whatHappened}\n`;
        if (whenItHappened) response += `When: ${whenItHappened}\n`;
        if (emotionalTrigger) response += `Emotional state: ${emotionalTrigger}\n`;

        response += '\n';
        response += `This isn't failure - this is data.\n`;
        response += `I'm building your setback archaeology. Over time, I'll see patterns you can't:\n`;
        response += `• What ALWAYS precedes a break\n`;
        response += `• Which habits are most vulnerable\n`;
        response += `• What emotional states are triggers\n\n`;

        response += `The goal isn't perfection. It's understanding yourself so deeply that setbacks become predictable - and preventable.`;

        return response;
      },
    });
  },
};

// ============================================================================
// HABIT AUTOPSY - Deep post-mortem for dead habits
// ============================================================================

const conductHabitAutopsyDef: ToolDefinition = {
  id: 'conductHabitAutopsy',
  name: 'Conduct Habit Autopsy',
  description:
    'Deep post-mortem analysis for habits that died. Learn from every failure to prevent future deaths.',
  domain: 'habits',
  tags: ['habits', 'autopsy', 'learning', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('conductHabitAutopsy'),
      parameters: z.object({
        habitName: z.string().describe('The habit that died'),
        howLongItLasted: z.string().optional().describe('How long the habit survived'),
        causeOfDeath: z.string().describe('What killed it'),
        lastRites: z.string().optional().describe('When did you last do it'),
        lessonsLearned: z.string().optional().describe('What you learned'),
        willResurrect: z.boolean().optional().describe('Do you want to try again'),
        viewPastAutopsies: z.boolean().default(false).describe('True to view past autopsies'),
      }),
      execute: async ({
        habitName,
        howLongItLasted,
        causeOfDeath,
        lastRites,
        lessonsLearned,
        willResurrect,
        viewPastAutopsies,
      }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, habitName, viewPastAutopsies }, 'Conducting habit autopsy');

        if (viewPastAutopsies) {
          const autopsies = await getHabitAutopsies(userId);

          if (autopsies.length === 0) {
            return `No habit autopsies on record. When a habit dies, we should do a proper post-mortem.`;
          }

          let response = `**Habit Morgue**\n\n`;
          response += `${autopsies.length} habits have died on your watch:\n\n`;

          // Analyze causes of death
          const causes: Record<string, number> = {};
          for (const a of autopsies) {
            causes[a.causeOfDeath] = (causes[a.causeOfDeath] || 0) + 1;
          }

          response += `**Leading Causes of Death:**\n`;
          for (const [cause, count] of Object.entries(causes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)) {
            response += `• ${cause}: ${count} habits\n`;
          }
          response += '\n';

          response += `**Recent Autopsies:**\n`;
          for (const autopsy of autopsies.slice(-5)) {
            response += `**${autopsy.habitName}**\n`;
            response += `  Survived: ${autopsy.howLongItLasted || 'unknown'}\n`;
            response += `  Killed by: ${autopsy.causeOfDeath}\n`;
            if (autopsy.lessonsLearned) response += `  Lesson: ${autopsy.lessonsLearned}\n`;
            response += '\n';
          }

          response += `**Resurrection Candidates:**\n`;
          const resurrectCandidates = autopsies.filter((a) => a.willResurrect);
          if (resurrectCandidates.length > 0) {
            for (const r of resurrectCandidates) {
              response += `• ${r.habitName}\n`;
            }
          } else {
            response += `None marked for resurrection.\n`;
          }

          return response;
        }

        // Record autopsy
        await recordHabitAutopsy(userId, {
          habitName,
          howLongItLasted,
          causeOfDeath,
          lastRites,
          lessonsLearned,
          willResurrect,
          recordedAt: new Date().toISOString(),
        });

        let response = `**Habit Autopsy Complete**\n\n`;
        response += `🪦 RIP: ${habitName}\n`;
        if (howLongItLasted) response += `Survived: ${howLongItLasted}\n`;
        response += `Cause of death: ${causeOfDeath}\n`;
        if (lastRites) response += `Last performed: ${lastRites}\n`;
        response += '\n';

        if (lessonsLearned) {
          response += `**Lesson Learned:**\n`;
          response += `"${lessonsLearned}"\n\n`;
        }

        if (willResurrect) {
          response += `You've marked this for resurrection. When you're ready, we'll design a stronger version.\n\n`;
        }

        response += `Every dead habit teaches us something. I'll remember this autopsy.\n`;
        response += `Next time we try ${habitName}, we won't make the same mistake.`;

        return response;
      },
    });
  },
};

// ============================================================================
// BACKGROUND HABIT REMINDER - "While You Were Away"
// ============================================================================

const backgroundHabitReminderDef: ToolDefinition = {
  id: 'backgroundHabitReminder',
  name: 'Background Habit Reminder',
  description:
    'Schedule a habit reminder that will be delivered even when the user disconnects. Perfect for: "Remind me about my morning routine tomorrow", "Check on my meditation habit later", "Nudge me about exercise".',
  domain: 'habits',
  tags: ['background', 'async', 'habits', 'while-you-were-away', 'superhuman-habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('backgroundHabitReminder'),
      parameters: z.object({
        habitName: z.string().describe('Name of the habit to remind about'),
        reminderType: z
          .enum(['gentle_nudge', 'streak_warning', 'celebration', 'check_in'])
          .describe('Type of reminder to send'),
        currentStreak: z.number().optional().describe('Current streak count if known'),
        context: z.string().optional().describe('Additional context for the reminder'),
        scheduledTime: z
          .string()
          .optional()
          .describe('When to send (e.g., "tomorrow morning", "in 2 hours")'),
      }),
      execute: async ({ habitName, reminderType, currentStreak, context, scheduledTime }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, habitName, reminderType }, 'Queueing background habit reminder');

        try {
          const { queueHabitReminder } =
            await import('../../../services/background-agents/executors/habit-reminder-executor.js');

          const taskId = await queueHabitReminder({
            userId,
            sessionId: ctx.sessionId,
            habitId: habitName.toLowerCase().replace(/\s+/g, '_'),
            habitName,
            reminderType,
            currentStreak,
            context,
            scheduledTime,
            initiatedBy: 'maya',
          });

          const typeLabel = reminderType.replace(/_/g, ' ');
          return `**Habit Reminder Scheduled** 🌱\n\nI'll send you a ${typeLabel} about "${habitName}"${scheduledTime ? ` ${scheduledTime}` : ' when the time is right'}.\n\n${currentStreak ? `**Current Streak:** ${currentStreak} days\n` : ''}**Task ID:** ${taskId.slice(0, 8)}...\n\nEven if you disconnect, I'll remember to check in on this! 💚`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to queue habit reminder');
          return `I couldn't schedule that reminder right now. But I'm here - let's talk about "${habitName}" now if you'd like!`;
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION & EXPORTS
// ============================================================================

export const habitIntelligenceTools: ToolDefinition[] = [
  trackHabitDNADef,
  mapFrictionDef,
  assessTendencyDef,
  detectKeystoneDef,
  trackIdentityShiftDef,
  analyzeSetbackPatternDef,
  conductHabitAutopsyDef,
  backgroundHabitReminderDef,
];
