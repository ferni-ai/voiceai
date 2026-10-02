/**
 * Health Wisdom Data
 *
 * Static reference data used by the health domain tools (exercise
 * encouragement, sleep hygiene tips, workout suggestions, preventive care).
 */

// ============================================================================
// HEALTH WISDOM DATABASES
// ============================================================================

export const EXERCISE_ENCOURAGEMENT = [
  'Any movement is good movement. You showed up for yourself today.',
  "You're building something that lasts. Every session matters.",
  'This is self-care in action. Your future self thanks you.',
  'Moving your body is one of the best gifts you can give yourself.',
  "Consistency beats intensity. You're doing great.",
];

export const SLEEP_HYGIENE_TIPS = {
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

export const WORKOUT_SUGGESTIONS = {
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

export const PREVENTIVE_CARE_REMINDERS = {
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
