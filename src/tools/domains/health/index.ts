/**
 * Health & Physical Wellness Domain Tools
 *
 * Tools for supporting physical health, exercise, nutrition, sleep, and energy.
 * This domain addresses the foundational importance of physical wellness.
 *
 * IMPORTANT: These tools do NOT provide medical advice. They support
 * healthy behaviors and encourage professional consultation when appropriate.
 *
 * DOMAIN: health
 * TOOLS:
 *   Exercise: logExercise, suggestWorkout, trackFitnessGoal
 *   Nutrition: coachOnNutrition, planMeals, trackHydration
 *   Sleep: analyzeSleepPattern, suggestSleepHygiene, trackSleepGoal
 *   Health Tracking: logSymptom, prepareForDoctorVisit, remindPreventiveCare
 *   Energy: assessEnergyLevel, suggestEnergyBoost
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { isLifeCoachAnalyticsEnabled, trackToolUsage } from '../shared/index.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  persistKeyMoment,
  persistTrackedItem,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';

// ============================================================================
// HEALTH WISDOM DATABASES
// ============================================================================

const EXERCISE_ENCOURAGEMENT = [
  'Any movement is good movement. You showed up for yourself today.',
  "You're building something that lasts. Every session matters.",
  'This is self-care in action. Your future self thanks you.',
  'Moving your body is one of the best gifts you can give yourself.',
  "Consistency beats intensity. You're doing great.",
];

const SLEEP_HYGIENE_TIPS = {
  environment: [
    {
      tip: 'Keep your room cool (65-68°F/18-20°C is optimal)',
      why: 'Body temperature drops during sleep',
    },
    { tip: 'Make your room as dark as possible', why: 'Light disrupts melatonin production' },
    { tip: 'Use white noise if helpful', why: 'Masks disruptive sounds' },
    {
      tip: 'Reserve your bed for sleep and intimacy only',
      why: 'Trains your brain that bed means sleep',
    },
  ],
  routine: [
    { tip: 'Same wake time every day, including weekends', why: 'Regulates your circadian rhythm' },
    {
      tip: 'Wind down routine 30-60 minutes before bed',
      why: 'Signals to your body that sleep is coming',
    },
    {
      tip: 'No screens 1 hour before bed (or use night mode)',
      why: 'Blue light suppresses melatonin',
    },
    { tip: 'Avoid large meals close to bedtime', why: 'Digestion can disrupt sleep' },
  ],
  daytime: [
    { tip: 'Get morning sunlight within 30 minutes of waking', why: 'Sets your circadian clock' },
    { tip: 'Limit caffeine after noon', why: 'Caffeine has a 6-hour half-life' },
    {
      tip: 'Exercise regularly, but not too close to bedtime',
      why: 'Exercise improves sleep but needs time to wind down',
    },
    { tip: 'Limit naps to 20 minutes before 3pm', why: 'Long/late naps reduce sleep pressure' },
  ],
};

const WORKOUT_SUGGESTIONS = {
  low_energy: [
    {
      name: 'Gentle Walk',
      duration: '15-20 min',
      description: 'Just get outside and move at a comfortable pace',
    },
    {
      name: 'Stretching Routine',
      duration: '10-15 min',
      description: 'Full body stretches to release tension',
    },
    {
      name: 'Restorative Yoga',
      duration: '20-30 min',
      description: 'Slow, supported poses for recovery',
    },
  ],
  moderate_energy: [
    {
      name: 'Brisk Walk',
      duration: '30 min',
      description: 'Walking fast enough to raise your heart rate',
    },
    {
      name: 'Beginner Strength',
      duration: '20-30 min',
      description: 'Bodyweight exercises: squats, pushups, lunges',
    },
    {
      name: 'Yoga Flow',
      duration: '30 min',
      description: 'Dynamic yoga connecting breath and movement',
    },
    { name: 'Swimming', duration: '20-30 min', description: 'Low impact, full body workout' },
  ],
  high_energy: [
    {
      name: 'HIIT Workout',
      duration: '20-30 min',
      description: 'Intervals of high effort and rest',
    },
    { name: 'Running', duration: '30-45 min', description: 'Steady state or intervals' },
    {
      name: 'Weight Training',
      duration: '45-60 min',
      description: 'Progressive overload for strength',
    },
    {
      name: 'Cycling',
      duration: '30-45 min',
      description: 'Indoor or outdoor, hills for challenge',
    },
  ],
};

const PREVENTIVE_CARE_REMINDERS = {
  general: [
    {
      screening: 'Annual Physical',
      frequency: 'Yearly',
      notes: 'Basic bloodwork, vital signs, general health',
    },
    {
      screening: 'Dental Checkup',
      frequency: 'Every 6 months',
      notes: 'Cleaning and oral health exam',
    },
    {
      screening: 'Eye Exam',
      frequency: 'Every 1-2 years',
      notes: 'Vision check, glaucoma screening',
    },
    { screening: 'Flu Shot', frequency: 'Yearly (fall)', notes: 'Annual influenza vaccine' },
  ],
  age_30_plus: [
    {
      screening: 'Blood Pressure Check',
      frequency: 'Every 1-2 years',
      notes: 'More often if elevated',
    },
    {
      screening: 'Cholesterol Check',
      frequency: 'Every 4-6 years',
      notes: 'More often if risk factors',
    },
    {
      screening: 'Diabetes Screening',
      frequency: 'Every 3 years',
      notes: 'Fasting glucose or A1C',
    },
  ],
  age_40_plus: [
    { screening: 'Skin Cancer Check', frequency: 'Yearly', notes: 'Full body skin exam' },
  ],
  age_45_plus: [
    {
      screening: 'Colorectal Cancer Screening',
      frequency: 'Per doctor recommendation',
      notes: 'Colonoscopy or alternatives',
    },
  ],
  age_50_plus: [
    {
      screening: 'Bone Density Test',
      frequency: 'Per doctor recommendation',
      notes: 'Especially for women',
    },
  ],
};

// ============================================================================
// EXERCISE TOOLS
// ============================================================================

const logExerciseDef: ToolDefinition = {
  id: 'logExercise',
  name: 'Log Exercise',
  description: 'Record and celebrate physical activity',
  domain: 'health',
  tags: ['health', 'fitness', 'exercise', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('logExercise'),
      parameters: z.object({
        activityType: z
          .enum([
            'cardio',
            'strength',
            'flexibility',
            'sports',
            'walking',
            'dance',
            'swimming',
            'cycling',
            'yoga',
            'other',
          ])
          .describe('Type of physical activity'),
        activityName: z.string().optional().describe('Specific activity name'),
        durationMinutes: z.number().optional().describe('Duration in minutes'),
        intensity: z.enum(['light', 'moderate', 'vigorous']).optional(),
        howTheyFeel: z.string().optional().describe('How they feel after'),
        notes: z.string().optional(),
      }),
      execute: async (
        { activityType, activityName, durationMinutes, intensity, howTheyFeel, notes },
        { ctx: toolCtx }
      ) => {
        // Track analytics if enabled
        const tracker = isLifeCoachAnalyticsEnabled()
          ? trackToolUsage('logExercise', 'health', { agentId: ctx.agentId })
          : null;

        try {
          getLogger().info(
            { agentId: ctx.agentId, activityType, durationMinutes },
            'Logging exercise'
          );

          // Persist exercise log for tracking
          persistTrackedItem(toolCtx as ToolCtxWithUserData, {
            domain: 'health',
            itemType: 'exercise_log',
            item: {
              activityType,
              activityName,
              durationMinutes,
              intensity,
              howTheyFeel,
              notes,
            },
            importance: durationMinutes && durationMinutes > 30 ? 'medium' : 'low',
          });

          const encouragement =
            EXERCISE_ENCOURAGEMENT[Math.floor(Math.random() * EXERCISE_ENCOURAGEMENT.length)];

          let response = `**Exercise Logged!** ✅\n\n`;
          response += `**Activity:** ${activityName || activityType}\n`;
          if (durationMinutes) response += `**Duration:** ${durationMinutes} minutes\n`;
          if (intensity) response += `**Intensity:** ${intensity}\n`;
          if (howTheyFeel) response += `**How you feel:** ${howTheyFeel}\n`;
          if (notes) response += `**Notes:** ${notes}\n`;

          response += `\n---\n\n`;
          response += `${encouragement}\n\n`;

          // Calculate rough calorie estimate for fun (not medical)
          if (durationMinutes && intensity) {
            const calMultiplier = intensity === 'light' ? 4 : intensity === 'moderate' ? 7 : 10;
            const roughCals = Math.round(durationMinutes * calMultiplier);
            response += `_Approximate energy expenditure: ~${roughCals} calories_\n\n`;
          }

          response += `Would you like to set a fitness goal or see your recent activity?`;

          tracker?.success({ activityType, durationMinutes });
          return response;
        } catch (error) {
          tracker?.error(error instanceof Error ? error : String(error));
          throw error;
        }
      },
    });
  },
};

const suggestWorkoutDef: ToolDefinition = {
  id: 'suggestWorkout',
  name: 'Suggest Workout',
  description: 'Recommend a workout based on goals and energy level',
  domain: 'health',
  tags: ['health', 'fitness', 'workout', 'suggestions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestWorkout'),
      parameters: z.object({
        energyLevel: z.enum(['low', 'moderate', 'high']).describe('Current energy level'),
        availableMinutes: z.number().optional().describe('Time available for workout'),
        preference: z.enum(['cardio', 'strength', 'flexibility', 'mix', 'any']).optional(),
        goal: z
          .enum([
            'general-fitness',
            'weight-loss',
            'strength-building',
            'stress-relief',
            'energy-boost',
            'flexibility',
          ])
          .optional(),
        equipment: z.enum(['none', 'minimal', 'gym']).optional(),
      }),
      execute: async ({ energyLevel, availableMinutes, preference, goal, equipment }) => {
        getLogger().info({ agentId: ctx.agentId, energyLevel, goal }, 'Suggesting workout');

        const energyKey =
          energyLevel === 'low'
            ? 'low_energy'
            : energyLevel === 'high'
              ? 'high_energy'
              : 'moderate_energy';

        const suggestions = WORKOUT_SUGGESTIONS[energyKey];

        let response = `**Workout Suggestions for Your Energy Level**\n\n`;

        if (energyLevel === 'low') {
          response += `Your energy is low, and that's okay. Movement doesn't have to be intense to be beneficial. Here are some gentle options:\n\n`;
        } else if (energyLevel === 'high') {
          response += `Great energy! Let's channel that into a solid workout:\n\n`;
        } else {
          response += `Here are some options that match your current energy:\n\n`;
        }

        suggestions.forEach((workout, i) => {
          response += `**${i + 1}. ${workout.name}** (${workout.duration})\n`;
          response += `   ${workout.description}\n\n`;
        });

        if (availableMinutes && availableMinutes < 20) {
          response += `---\n\n`;
          response += `**Short on time?** Even 10 minutes counts:\n`;
          response += `- 10 minute walk\n`;
          response += `- Quick stretching routine\n`;
          response += `- 7-minute bodyweight circuit\n\n`;
          response += `Something is always better than nothing.`;
        }

        if (goal === 'stress-relief') {
          response += `\n\n**For stress relief:** Consider yoga, swimming, or a nature walk. Movement that connects breath and body is especially calming.`;
        }

        response += `\n\nWhat sounds good to you?`;

        return response;
      },
    });
  },
};

const trackFitnessGoalDef: ToolDefinition = {
  id: 'trackFitnessGoal',
  name: 'Track Fitness Goal',
  description: 'Set and track fitness goals',
  domain: 'health',
  tags: ['health', 'fitness', 'goals', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackFitnessGoal'),
      parameters: z.object({
        action: z.enum(['set', 'check', 'update', 'celebrate']).describe('What action to take'),
        goalType: z
          .enum([
            'exercise-frequency',
            'specific-activity',
            'strength',
            'endurance',
            'flexibility',
            'weight',
            'custom',
          ])
          .optional(),
        goalDescription: z.string().optional().describe('Description of the goal'),
        currentProgress: z.string().optional().describe('Current progress'),
      }),
      execute: async ({ action, goalType, goalDescription, currentProgress }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, action, goalType }, 'Tracking fitness goal');

        // Persist goal when set or celebrate
        if (action === 'set' && goalDescription) {
          persistTrackedItem(toolCtx as ToolCtxWithUserData, {
            domain: 'health',
            itemType: 'fitness_goal',
            item: { goalType, goalDescription, action: 'set', status: 'active' },
            importance: 'medium',
          });
        } else if (action === 'celebrate') {
          persistKeyMoment(toolCtx as ToolCtxWithUserData, {
            domain: 'health',
            type: 'milestone',
            summary: `Achieved fitness goal: ${goalDescription || goalType || 'fitness goal'}`,
            emotionalWeight: 'heavy',
            topics: ['health', 'fitness', 'achievement'],
          });
        }

        let response = '';

        if (action === 'set') {
          response = `**Setting a Fitness Goal**\n\n`;
          response += `Great goals are SMART: Specific, Measurable, Achievable, Relevant, Time-bound.\n\n`;
          response += `**Examples by type:**\n\n`;
          response += `- **Frequency:** "Exercise 3 times per week for the next month"\n`;
          response += `- **Strength:** "Do 10 pushups without stopping by end of month"\n`;
          response += `- **Endurance:** "Run a 5K in 8 weeks"\n`;
          response += `- **Flexibility:** "Touch my toes within 6 weeks"\n\n`;

          if (goalDescription) {
            response += `Your goal: "${goalDescription}"\n\n`;
            response += `This is a great goal! Let's make it specific:\n`;
            response += `- What exactly will success look like?\n`;
            response += `- By when do you want to achieve this?\n`;
            response += `- How will you track progress?`;
          } else {
            response += `What fitness goal would you like to set?`;
          }
        } else if (action === 'check') {
          response = `**Checking Your Fitness Progress**\n\n`;
          if (currentProgress) {
            response += `Current progress: ${currentProgress}\n\n`;
          }
          response += `How are you feeling about your progress? Remember:\n`;
          response += `- Progress isn't always linear\n`;
          response += `- Small improvements add up\n`;
          response += `- Showing up consistently matters more than any single workout\n\n`;
          response += `Would you like to update your goal or log recent activity?`;
        } else if (action === 'celebrate') {
          response = `**🎉 Goal Achievement!**\n\n`;
          response += `You did it! This is a moment to really acknowledge.\n\n`;
          response += `Think about what got you here:\n`;
          response += `- The days you showed up even when you didn't feel like it\n`;
          response += `- The small choices that added up\n`;
          response += `- Your commitment to yourself\n\n`;
          response += `What's your next goal? Or do you want to maintain this achievement for a while?`;
        } else {
          response = `Let me help you with your fitness goals. Would you like to set a new goal, check progress on an existing one, or celebrate an achievement?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// NUTRITION TOOLS
// ============================================================================

const coachOnNutritionDef: ToolDefinition = {
  id: 'coachOnNutrition',
  name: 'Coach On Nutrition',
  description: 'Provide general nutrition guidance and mindful eating support',
  domain: 'health',
  tags: ['health', 'nutrition', 'eating', 'coaching'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('coachOnNutrition'),
      parameters: z.object({
        topic: z
          .enum([
            'general-eating',
            'mindful-eating',
            'meal-timing',
            'hydration',
            'energy-foods',
            'sleep-foods',
            'emotional-eating',
          ])
          .describe('Nutrition topic to discuss'),
        specificQuestion: z.string().optional(),
      }),
      execute: async ({ topic, specificQuestion }) => {
        getLogger().info({ agentId: ctx.agentId, topic }, 'Coaching on nutrition');

        let response = '';

        switch (topic) {
          case 'general-eating':
            response = `**Foundations of Healthy Eating**\n\n`;
            response += `Rather than strict rules, consider these principles:\n\n`;
            response += `🥗 **Variety** - Eat a rainbow of foods. Different colors = different nutrients.\n\n`;
            response += `🍽️ **Mostly whole foods** - Foods that look like they came from nature rather than a factory.\n\n`;
            response += `⚖️ **Balance** - Include protein, healthy fats, and complex carbs at meals.\n\n`;
            response += `🧘 **Moderation, not deprivation** - Restrictive diets often backfire. Allow yourself to enjoy food.\n\n`;
            response += `💧 **Stay hydrated** - Often we think we're hungry when we're actually thirsty.\n\n`;
            response += `The best diet is one you can sustain long-term while feeling good.`;
            break;

          case 'mindful-eating':
            response = `**Mindful Eating Practice**\n\n`;
            response += `Mindful eating is about being present with food, not following rules.\n\n`;
            response += `**Before eating:**\n`;
            response += `- Am I actually hungry, or something else (bored, stressed, tired)?\n`;
            response += `- What am I hungry for? What would satisfy me?\n\n`;
            response += `**While eating:**\n`;
            response += `- Slow down. Put your fork down between bites.\n`;
            response += `- Notice the taste, texture, temperature.\n`;
            response += `- Check in halfway: Am I still hungry?\n\n`;
            response += `**After eating:**\n`;
            response += `- How do I feel? Satisfied? Overstuffed? Still hungry?\n`;
            response += `- No judgment, just noticing.\n\n`;
            response += `This isn't about eating "perfectly." It's about reconnecting with your body's signals.`;
            break;

          case 'emotional-eating':
            response = `**Understanding Emotional Eating**\n\n`;
            response += `Emotional eating is incredibly common. It's not a character flaw.\n\n`;
            response += `**The pattern:**\n`;
            response += `Emotion → Food → Temporary comfort → (Often) guilt → More difficult emotion\n\n`;
            response += `**Breaking the cycle:**\n\n`;
            response += `1. **Pause** - When you feel pulled to eat, wait 5-10 minutes\n`;
            response += `2. **Identify** - What am I actually feeling? (HALT: Hungry, Angry, Lonely, Tired?)\n`;
            response += `3. **Explore alternatives** - What else might address this feeling?\n`;
            response += `4. **Choose** - If you still want to eat, do so mindfully without judgment\n\n`;
            response += `**Remember:** Sometimes eating for comfort is okay. The goal is awareness and choice, not perfection.`;
            break;

          case 'hydration':
            response = `**Staying Hydrated**\n\n`;
            response += `**How much?** A general guideline is half your body weight (in pounds) in ounces of water.\n`;
            response += `Example: 160 lbs → ~80 oz water/day\n\n`;
            response += `**Signs you might need more water:**\n`;
            response += `- Dark urine\n`;
            response += `- Feeling tired\n`;
            response += `- Headaches\n`;
            response += `- Difficulty concentrating\n`;
            response += `- Mistaking thirst for hunger\n\n`;
            response += `**Tips:**\n`;
            response += `- Start your day with a glass of water\n`;
            response += `- Keep water visible and accessible\n`;
            response += `- Flavor with fruit if plain water is boring\n`;
            response += `- Check your urine color - pale yellow is ideal`;
            break;

          case 'energy-foods':
            response = `**Foods for Sustained Energy**\n\n`;
            response += `**For lasting energy (complex carbs + protein + healthy fat):**\n`;
            response += `- Oatmeal with nuts and fruit\n`;
            response += `- Eggs with whole grain toast and avocado\n`;
            response += `- Greek yogurt with berries and seeds\n`;
            response += `- Hummus with vegetables and whole grain crackers\n\n`;
            response += `**Quick energy that won't crash:**\n`;
            response += `- Apple with almond butter\n`;
            response += `- Handful of nuts\n`;
            response += `- Banana with peanut butter\n\n`;
            response += `**Avoid for energy:**\n`;
            response += `- Sugary snacks (spike and crash)\n`;
            response += `- Large heavy meals (redirect blood to digestion)\n`;
            response += `- Alcohol (depressant effect)`;
            break;

          case 'sleep-foods':
            response = `**Foods That Support Sleep**\n\n`;
            response += `**Sleep-promoting foods (contain tryptophan, magnesium, or melatonin):**\n`;
            response += `- Tart cherry juice (natural melatonin)\n`;
            response += `- Turkey, chicken\n`;
            response += `- Nuts (especially almonds and walnuts)\n`;
            response += `- Warm milk\n`;
            response += `- Kiwi\n`;
            response += `- Fatty fish (salmon, tuna)\n\n`;
            response += `**Avoid before bed:**\n`;
            response += `- Caffeine (6+ hours before bed)\n`;
            response += `- Alcohol (disrupts sleep cycles)\n`;
            response += `- Large meals (digestion interferes with sleep)\n`;
            response += `- Spicy foods (can cause discomfort)\n`;
            response += `- Too much liquid (bathroom trips)`;
            break;

          default:
            response = `What nutrition topic would you like to explore? I can help with general healthy eating, mindful eating, hydration, foods for energy or sleep, and emotional eating.`;
        }

        if (specificQuestion) {
          response += `\n\n---\n\nYou asked: "${specificQuestion}"\n`;
          response += `For specific dietary needs or health conditions, I'd recommend consulting with a registered dietitian or your doctor. I can share general principles, but personalized nutrition advice should come from a professional.`;
        }

        return response;
      },
    });
  },
};

const trackHydrationDef: ToolDefinition = {
  id: 'trackHydration',
  name: 'Track Hydration',
  description: 'Log and track water intake',
  domain: 'health',
  tags: ['health', 'hydration', 'water', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackHydration'),
      parameters: z.object({
        action: z.enum(['log', 'check', 'remind', 'tips']).describe('What to do'),
        amount: z.number().optional().describe('Amount in ounces'),
      }),
      execute: async ({ action, amount }) => {
        getLogger().info({ agentId: ctx.agentId, action, amount }, 'Tracking hydration');

        let response = '';

        if (action === 'log' && amount) {
          response = `**Hydration Logged!** 💧\n\n`;
          response += `Added: ${amount} oz\n\n`;
          response += `Great job staying hydrated! Water supports:\n`;
          response += `- Energy levels\n`;
          response += `- Cognitive function\n`;
          response += `- Metabolism\n`;
          response += `- Skin health\n\n`;
          response += `Keep it up!`;
        } else if (action === 'remind') {
          response = `**Hydration Reminder** 💧\n\n`;
          response += `Have you had water recently? Take a moment to drink some water right now if you can.\n\n`;
          response += `Signs you might need more water:\n`;
          response += `- Feeling tired or sluggish\n`;
          response += `- Difficulty concentrating\n`;
          response += `- Headache\n`;
          response += `- Dark urine`;
        } else if (action === 'tips') {
          response = `**Hydration Tips** 💧\n\n`;
          response += `**Make it easy:**\n`;
          response += `- Keep a water bottle visible at all times\n`;
          response += `- Drink a glass first thing in the morning\n`;
          response += `- Set phone reminders if needed\n\n`;
          response += `**Make it interesting:**\n`;
          response += `- Add fruit, cucumber, or mint\n`;
          response += `- Try sparkling water\n`;
          response += `- Herbal tea counts too\n\n`;
          response += `**Track progress:**\n`;
          response += `- Use a marked water bottle\n`;
          response += `- Note how you feel when well-hydrated`;
        } else {
          response = `What would you like to do? I can log water intake, give you a reminder, or share tips for staying hydrated.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SLEEP TOOLS
// ============================================================================

const analyzeSleepPatternDef: ToolDefinition = {
  id: 'analyzeSleepPattern',
  name: 'Analyze Sleep Pattern',
  description: 'Review and discuss sleep patterns and quality',
  domain: 'health',
  tags: ['health', 'sleep', 'analysis', 'patterns'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('analyzeSleepPattern'),
      parameters: z.object({
        averageHours: z.number().optional().describe('Average hours of sleep'),
        sleepQuality: z.enum(['poor', 'fair', 'good', 'excellent']).optional(),
        mainConcern: z
          .enum([
            'falling-asleep',
            'staying-asleep',
            'waking-early',
            'not-rested',
            'schedule',
            'general',
          ])
          .optional(),
        bedtime: z.string().optional().describe('Typical bedtime'),
        wakeTime: z.string().optional().describe('Typical wake time'),
      }),
      execute: async ({ averageHours, sleepQuality, mainConcern, bedtime, wakeTime }) => {
        getLogger().info(
          { agentId: ctx.agentId, mainConcern, averageHours },
          'Analyzing sleep pattern'
        );

        let response = `**Sleep Pattern Analysis**\n\n`;

        if (averageHours) {
          response += `**Current sleep:** ~${averageHours} hours/night\n`;
          if (averageHours < 6) {
            response += `This is below the recommended 7-9 hours for adults. Sleep deprivation affects mood, cognition, immune function, and long-term health.\n\n`;
          } else if (averageHours >= 7 && averageHours <= 9) {
            response += `This is within the recommended range! Quality matters as much as quantity though.\n\n`;
          } else if (averageHours > 9) {
            response += `This is above average. If you still feel tired, it might be worth checking sleep quality or talking to a doctor.\n\n`;
          }
        }

        if (sleepQuality) {
          response += `**Perceived quality:** ${sleepQuality}\n\n`;
        }

        if (mainConcern) {
          response += `**Main concern:** `;

          switch (mainConcern) {
            case 'falling-asleep':
              response += `Difficulty falling asleep\n\n`;
              response += `This often relates to:\n`;
              response += `- Wind-down routine (or lack of one)\n`;
              response += `- Screen time before bed\n`;
              response += `- Racing thoughts or anxiety\n`;
              response += `- Caffeine timing\n`;
              response += `- Bedroom environment (light, temperature)\n\n`;
              response += `Would you like specific tips for any of these?`;
              break;

            case 'staying-asleep':
              response += `Waking during the night\n\n`;
              response += `Common causes:\n`;
              response += `- Alcohol (disrupts sleep cycles)\n`;
              response += `- Stress/anxiety\n`;
              response += `- Sleep apnea (worth discussing with doctor)\n`;
              response += `- Environment (noise, light, temperature)\n`;
              response += `- Eating too close to bedtime\n\n`;
              response += `If this is frequent, consider keeping a sleep diary to identify patterns.`;
              break;

            case 'waking-early':
              response += `Waking too early\n\n`;
              response += `Early waking can be related to:\n`;
              response += `- Circadian rhythm changes (especially with age)\n`;
              response += `- Depression (early waking is a common symptom)\n`;
              response += `- Light exposure (dawn light through windows)\n`;
              response += `- Going to bed too early\n\n`;
              response += `If this is persistent, it's worth mentioning to a doctor.`;
              break;

            case 'not-rested':
              response += `Sleeping but not feeling rested\n\n`;
              response += `This is frustrating. Possible factors:\n`;
              response += `- Sleep quality vs quantity (spending time in light sleep vs deep/REM)\n`;
              response += `- Sleep apnea (very common and underdiagnosed)\n`;
              response += `- Stress/anxiety affecting sleep depth\n`;
              response += `- Inconsistent schedule\n\n`;
              response += `Consider a sleep study if this persists.`;
              break;

            case 'schedule':
              response += `Irregular schedule\n\n`;
              response += `Consistent timing is one of the most important sleep factors.\n`;
              response += `Your body's circadian rhythm thrives on routine:\n`;
              response += `- Same wake time every day (even weekends!)\n`;
              response += `- Consistent bedtime within 30 minutes\n`;
              response += `- Regular meal times also help\n\n`;
              response += `It takes 2-4 weeks to shift your schedule. Go gradually.`;
              break;

            default:
              response += `Let's look at your overall sleep health.\n\n`;
              response += `Would you like tips on:\n`;
              response += `- Sleep hygiene (environment, routine)\n`;
              response += `- Falling asleep faster\n`;
              response += `- Staying asleep through the night\n`;
              response += `- Feeling more rested`;
          }
        }

        return response;
      },
    });
  },
};

const suggestSleepHygieneDef: ToolDefinition = {
  id: 'suggestSleepHygiene',
  name: 'Suggest Sleep Hygiene',
  description: 'Recommend sleep improvement strategies',
  domain: 'health',
  tags: ['health', 'sleep', 'hygiene', 'tips'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestSleepHygiene'),
      parameters: z.object({
        focus: z.enum(['environment', 'routine', 'daytime', 'all']).describe('Area to focus on'),
        currentChallenges: z.array(z.string()).optional().describe('Current sleep challenges'),
      }),
      execute: async ({ focus, currentChallenges }) => {
        getLogger().info({ agentId: ctx.agentId, focus }, 'Suggesting sleep hygiene');

        let response = `**Sleep Hygiene Tips**\n\n`;

        const showSection = (section: keyof typeof SLEEP_HYGIENE_TIPS, title: string) => {
          let sectionResponse = `**${title}:**\n\n`;
          SLEEP_HYGIENE_TIPS[section].forEach(({ tip, why }) => {
            sectionResponse += `• ${tip}\n  _Why: ${why}_\n\n`;
          });
          return sectionResponse;
        };

        if (focus === 'environment' || focus === 'all') {
          response += showSection('environment', '🛏️ Environment');
        }
        if (focus === 'routine' || focus === 'all') {
          response += showSection('routine', '🌙 Bedtime Routine');
        }
        if (focus === 'daytime' || focus === 'all') {
          response += showSection('daytime', '☀️ Daytime Habits');
        }

        response += `---\n\n`;
        response += `**Start small:** Pick ONE thing to try this week. Sleep changes take time.\n\n`;
        response += `The most impactful changes are usually:\n`;
        response += `1. Consistent wake time\n`;
        response += `2. Limiting screens before bed\n`;
        response += `3. Cool, dark room\n\n`;
        response += `What would be easiest for you to try first?`;

        return response;
      },
    });
  },
};

// ============================================================================
// HEALTH TRACKING TOOLS
// ============================================================================

const logSymptomDef: ToolDefinition = {
  id: 'logSymptom',
  name: 'Log Symptom',
  description: 'Track symptoms for health awareness',
  domain: 'health',
  tags: ['health', 'symptoms', 'tracking', 'awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('logSymptom'),
      parameters: z.object({
        symptom: z.string().describe('The symptom being logged'),
        severity: z.enum(['mild', 'moderate', 'severe']).optional(),
        location: z.string().optional().describe('Where in the body'),
        duration: z.string().optional().describe('How long'),
        possibleTriggers: z.string().optional().describe('What might have caused it'),
        notes: z.string().optional(),
      }),
      execute: async ({ symptom, severity, location, duration, possibleTriggers, notes }) => {
        getLogger().info({ agentId: ctx.agentId, symptom, severity }, 'Logging symptom');

        let response = `**Symptom Logged**\n\n`;
        response += `**Symptom:** ${symptom}\n`;
        if (severity) response += `**Severity:** ${severity}\n`;
        if (location) response += `**Location:** ${location}\n`;
        if (duration) response += `**Duration:** ${duration}\n`;
        if (possibleTriggers) response += `**Possible triggers:** ${possibleTriggers}\n`;
        if (notes) response += `**Notes:** ${notes}\n`;

        response += `\n---\n\n`;
        response += `Tracking symptoms helps identify patterns over time. This information can be valuable to share with your doctor.\n\n`;

        if (severity === 'severe') {
          response += `⚠️ **Note:** You rated this as severe. If this is new, worsening, or concerning, please consider contacting your healthcare provider.\n\n`;
        }

        response += `Is this symptom new, or have you experienced it before?`;

        return response;
      },
    });
  },
};

const prepareForDoctorVisitDef: ToolDefinition = {
  id: 'prepareForDoctorVisit',
  name: 'Prepare For Doctor Visit',
  description: 'Prepare questions and information for doctor appointments',
  domain: 'health',
  tags: ['health', 'doctor', 'preparation', 'appointments'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('prepareForDoctorVisit'),
      parameters: z.object({
        visitType: z
          .enum(['annual-physical', 'specific-concern', 'follow-up', 'specialist', 'mental-health'])
          .describe('Type of appointment'),
        mainConcern: z.string().optional().describe('Main reason for visit'),
        symptomsToDiscuss: z.array(z.string()).optional(),
      }),
      execute: async ({ visitType, mainConcern, symptomsToDiscuss }) => {
        getLogger().info({ agentId: ctx.agentId, visitType }, 'Preparing for doctor visit');

        let response = `**Doctor Visit Preparation**\n\n`;

        response += `**Before your appointment, gather:**\n`;
        response += `- List of current medications (including supplements)\n`;
        response += `- Recent symptoms or health changes\n`;
        response += `- Family health history updates\n`;
        response += `- Questions you want to ask\n`;
        response += `- Insurance card and ID\n\n`;

        if (mainConcern) {
          response += `**For your main concern (${mainConcern}):**\n`;
          response += `Be ready to describe:\n`;
          response += `- When it started\n`;
          response += `- How often it occurs\n`;
          response += `- What makes it better or worse\n`;
          response += `- How it affects your daily life\n`;
          response += `- What you've already tried\n\n`;
        }

        response += `**Questions to consider asking:**\n\n`;

        switch (visitType) {
          case 'annual-physical':
            response += `- What screenings do I need at my age?\n`;
            response += `- Are my vitals (blood pressure, etc.) in a healthy range?\n`;
            response += `- Should I be concerned about anything in my bloodwork?\n`;
            response += `- What lifestyle changes would you recommend?\n`;
            response += `- When should I schedule my next visit?\n`;
            break;

          case 'specific-concern':
            response += `- What could be causing this?\n`;
            response += `- What tests do you recommend?\n`;
            response += `- What are my treatment options?\n`;
            response += `- What should I watch for or be concerned about?\n`;
            response += `- When should I follow up if it doesn't improve?\n`;
            break;

          case 'mental-health':
            response += `- What treatment options are available?\n`;
            response += `- Should I consider therapy, medication, or both?\n`;
            response += `- What are the side effects of recommended medications?\n`;
            response += `- How long before I might notice improvement?\n`;
            response += `- What should I do if symptoms worsen?\n`;
            break;

          default:
            response += `- What should I know about my results/condition?\n`;
            response += `- What are my options?\n`;
            response += `- What do you recommend and why?\n`;
            response += `- What questions should I be asking that I haven't?`;
        }

        response += `\n\n**Tips for the appointment:**\n`;
        response += `- Bring a notebook or use your phone to take notes\n`;
        response += `- It's okay to ask for clarification or repetition\n`;
        response += `- Bring a support person if you'd like\n`;
        response += `- Be honest about your habits and concerns\n\n`;

        response += `Would you like to talk through your main questions or concerns?`;

        return response;
      },
    });
  },
};

const remindPreventiveCareDef: ToolDefinition = {
  id: 'remindPreventiveCare',
  name: 'Remind Preventive Care',
  description: 'Remind about screenings, checkups, and vaccines',
  domain: 'health',
  tags: ['health', 'preventive', 'screenings', 'reminders'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('remindPreventiveCare'),
      parameters: z.object({
        ageRange: z.enum(['under-30', '30-39', '40-49', '50-plus']).describe('Age range'),
        lastPhysical: z.string().optional().describe('When was last annual physical'),
      }),
      execute: async ({ ageRange, lastPhysical }) => {
        getLogger().info({ agentId: ctx.agentId, ageRange }, 'Reminding preventive care');

        let response = `**Preventive Care Reminders**\n\n`;

        if (lastPhysical) {
          response += `_Last physical: ${lastPhysical}_\n\n`;
        }

        response += `**For everyone:**\n`;
        PREVENTIVE_CARE_REMINDERS.general.forEach(({ screening, frequency, notes }) => {
          response += `• **${screening}** - ${frequency}\n  ${notes}\n`;
        });

        if (ageRange === '30-39' || ageRange === '40-49' || ageRange === '50-plus') {
          response += `\n**Age 30+:**\n`;
          PREVENTIVE_CARE_REMINDERS.age_30_plus.forEach(({ screening, frequency, notes }) => {
            response += `• **${screening}** - ${frequency}\n  ${notes}\n`;
          });
        }

        if (ageRange === '40-49' || ageRange === '50-plus') {
          response += `\n**Age 40+:**\n`;
          PREVENTIVE_CARE_REMINDERS.age_40_plus.forEach(({ screening, frequency, notes }) => {
            response += `• **${screening}** - ${frequency}\n  ${notes}\n`;
          });
        }

        if (ageRange === '50-plus') {
          response += `\n**Age 45+:**\n`;
          PREVENTIVE_CARE_REMINDERS.age_45_plus.forEach(({ screening, frequency, notes }) => {
            response += `• **${screening}** - ${frequency}\n  ${notes}\n`;
          });
          response += `\n**Age 50+:**\n`;
          PREVENTIVE_CARE_REMINDERS.age_50_plus.forEach(({ screening, frequency, notes }) => {
            response += `• **${screening}** - ${frequency}\n  ${notes}\n`;
          });
        }

        response += `\n---\n\n`;
        response += `**Note:** These are general guidelines. Your doctor may recommend different timing based on your personal and family health history.\n\n`;
        response += `Is there a specific screening you'd like to learn more about or schedule?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ENERGY TOOLS
// ============================================================================

const assessEnergyLevelDef: ToolDefinition = {
  id: 'assessEnergyLevel',
  name: 'Assess Energy Level',
  description: 'Track and understand energy patterns',
  domain: 'health',
  tags: ['health', 'energy', 'assessment', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('assessEnergyLevel'),
      parameters: z.object({
        currentLevel: z
          .enum(['depleted', 'low', 'moderate', 'good', 'high'])
          .describe('Current energy level'),
        timeOfDay: z.enum(['morning', 'midday', 'afternoon', 'evening']).optional(),
        possibleFactors: z.array(z.string()).optional().describe('What might be affecting energy'),
      }),
      execute: async ({ currentLevel, timeOfDay, possibleFactors }) => {
        getLogger().info(
          { agentId: ctx.agentId, currentLevel, timeOfDay },
          'Assessing energy level'
        );

        let response = `**Energy Check-In**\n\n`;
        response += `Current level: **${currentLevel}**`;
        if (timeOfDay) response += ` (${timeOfDay})`;
        response += `\n\n`;

        if (currentLevel === 'depleted' || currentLevel === 'low') {
          response += `Low energy is frustrating. Let's think about what might help.\n\n`;
          response += `**Quick energy check - HALT:**\n`;
          response += `- **H**ungry? (Blood sugar dip?)\n`;
          response += `- **A**ngry/Anxious? (Emotions drain energy)\n`;
          response += `- **L**onely? (Social connection affects energy)\n`;
          response += `- **T**ired? (Sleep debt adds up)\n\n`;

          response += `**Common energy drains:**\n`;
          response += `- Poor sleep quality\n`;
          response += `- Dehydration\n`;
          response += `- Sedentary time (paradoxically, movement creates energy)\n`;
          response += `- Blood sugar swings\n`;
          response += `- Stress and mental load\n\n`;

          response += `Would you like suggestions for boosting your energy?`;
        } else if (currentLevel === 'good' || currentLevel === 'high') {
          response += `Great energy right now! Worth noting what's contributing:\n\n`;
          if (possibleFactors && possibleFactors.length > 0) {
            response += `You mentioned: ${possibleFactors.join(', ')}\n\n`;
          }
          response += `**Tracking what works:**\n`;
          response += `- How did you sleep last night?\n`;
          response += `- What have you eaten today?\n`;
          response += `- Did you move your body?\n`;
          response += `- What's your stress level?\n\n`;
          response += `Noticing these patterns helps you recreate good energy days.`;
        } else {
          response += `Moderate energy - you're getting by but not thriving.\n\n`;
          response += `Sometimes small interventions help:\n`;
          response += `- 5-minute walk\n`;
          response += `- Glass of water\n`;
          response += `- Healthy snack\n`;
          response += `- 5 deep breaths\n`;
          response += `- Brief sun exposure\n\n`;
          response += `Would any of these work for you right now?`;
        }

        return response;
      },
    });
  },
};

const suggestEnergyBoostDef: ToolDefinition = {
  id: 'suggestEnergyBoost',
  name: 'Suggest Energy Boost',
  description: 'Suggest ways to improve energy levels',
  domain: 'health',
  tags: ['health', 'energy', 'boost', 'suggestions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestEnergyBoost'),
      parameters: z.object({
        availableTime: z
          .enum(['1-minute', '5-minutes', '15-minutes', '30-plus'])
          .describe('Time available'),
        setting: z.enum(['home', 'work', 'outside', 'anywhere']).optional(),
      }),
      execute: async ({ availableTime, setting }) => {
        getLogger().info(
          { agentId: ctx.agentId, availableTime, setting },
          'Suggesting energy boost'
        );

        let response = `**Energy Boosters** (${availableTime} available)\n\n`;

        switch (availableTime) {
          case '1-minute':
            response += `**Quick energy hits:**\n`;
            response += `- 10 deep breaths (breath of fire or just slow, deep breaths)\n`;
            response += `- Stand up and stretch your arms overhead\n`;
            response += `- Splash cold water on your face\n`;
            response += `- Step outside and take 3 deep breaths\n`;
            response += `- Do 10 jumping jacks\n`;
            break;

          case '5-minutes':
            response += `**5-minute recharge:**\n`;
            response += `- Walk around the block or building\n`;
            response += `- Do a quick stretching routine\n`;
            response += `- Drink a full glass of water\n`;
            response += `- Step outside into natural light\n`;
            response += `- Do a body scan meditation\n`;
            response += `- 20 squats or 10 pushups\n`;
            break;

          case '15-minutes':
            response += `**15-minute energy reset:**\n`;
            response += `- Brisk walk outside\n`;
            response += `- Short yoga or stretching video\n`;
            response += `- Power nap (set alarm! 10-15 min max)\n`;
            response += `- Healthy snack + water + 5-min walk\n`;
            response += `- Brief meditation\n`;
            break;

          case '30-plus':
            response += `**30+ minute energy investment:**\n`;
            response += `- Full workout (even moderate intensity helps)\n`;
            response += `- 30-minute walk, ideally outside\n`;
            response += `- Yoga class or video\n`;
            response += `- Nutritious meal (not too heavy)\n`;
            response += `- Social connection (call a friend, have coffee with someone)\n`;
            break;
        }

        response += `\n**Avoid these energy traps:**\n`;
        response += `- Sugar crash from candy/soda (short spike, worse crash)\n`;
        response += `- More caffeine if already caffeinated (diminishing returns)\n`;
        response += `- Just pushing through (builds sleep debt)\n\n`;

        response += `What appeals to you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const healthTools: ToolDefinition[] = [
  // Exercise
  logExerciseDef,
  suggestWorkoutDef,
  trackFitnessGoalDef,
  // Nutrition
  coachOnNutritionDef,
  trackHydrationDef,
  // Sleep
  analyzeSleepPatternDef,
  suggestSleepHygieneDef,
  // Health Tracking
  logSymptomDef,
  prepareForDoctorVisitDef,
  remindPreventiveCareDef,
  // Energy
  assessEnergyLevelDef,
  suggestEnergyBoostDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'health',
  healthTools
);

export default getToolDefinitions;
