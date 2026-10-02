/**
 * Routine builder - UI copy and icons. Extracted from routine-builder.ui.ts.
 */

import { ANALYTICS_ICONS, GROWTH_ICONS, QUIZ_ICONS } from '../icons/shared-icons.js';

export const COPY = {
  titles: {
    new: "Tell me what you'd like",
    edit: 'Make some changes',
    fromTemplate: (name: string) => `Setting up "${name}"`,
  },

  sections: {
    name: 'What should I call this?',
    namePlaceholder: 'e.g., "Morning check-in" or "Wind down"',
    trigger: 'When should I do this?',
    actions: 'What should I do?',
    customize: 'Make it yours',
  },

  triggers: [
    {
      type: 'time',
      label: 'At a certain time',
      icon: ANALYTICS_ICONS.sunrise,
      hint: 'Every day at 7am, weekdays at 9am...',
    },
    {
      type: 'phrase',
      label: 'When you say something',
      icon: ANALYTICS_ICONS.microphone,
      hint: '"Good morning Ferni" or "Start my day"',
    },
    {
      type: 'location',
      label: 'When you arrive or leave',
      icon: ANALYTICS_ICONS.mapPin,
      hint: 'Coming home, leaving work...',
    },
    {
      type: 'calendar',
      label: 'Around calendar events',
      icon: ANALYTICS_ICONS.calendar,
      hint: 'Before meetings, after workouts...',
    },
  ],

  triggerConfig: {
    time: {
      schedule: 'What time?',
      schedulePlaceholder: 'e.g., 7:00 AM',
      timezone: 'Your timezone',
    },
    phrase: {
      phrase: 'What phrase triggers this?',
      phrasePlaceholder: 'e.g., Good morning Ferni',
    },
    location: {
      name: 'What place?',
      namePlaceholder: 'e.g., Home, Office, Gym',
      when: 'Trigger when I...',
      options: { enter: 'Arrive', exit: 'Leave', both: 'Either' },
    },
  },

  actions: [
    {
      type: 'speak_message',
      label: 'Say something',
      icon: ANALYTICS_ICONS.messageCircle,
      hint: "I'll speak this to you",
    },
    {
      type: 'send_notification',
      label: 'Send a notification',
      icon: ANALYTICS_ICONS.bell,
      hint: 'A gentle nudge',
    },
    {
      type: 'add_reminder',
      label: 'Set a reminder',
      icon: ANALYTICS_ICONS.alarm,
      hint: "I'll remind you later",
    },
    {
      type: 'log_habit',
      label: 'Log a habit',
      icon: QUIZ_ICONS.correct,
      hint: 'Track your progress',
    },
    {
      type: 'control_lights',
      label: 'Adjust lights',
      icon: GROWTH_ICONS.insight,
      hint: 'Set the mood',
    },
    {
      type: 'set_thermostat',
      label: 'Set temperature',
      icon: ANALYTICS_ICONS.thermometer,
      hint: 'Get comfortable',
    },
    { type: 'play_music', label: 'Play music', icon: ANALYTICS_ICONS.music, hint: 'Set the vibe' },
  ],

  buttons: {
    cancel: 'Never mind',
    save: 'Start doing this for me',
    saveEdit: 'Save changes',
    addAction: 'Add something else',
  },

  validation: {
    needsName: 'Give it a name first',
  },
};

// ============================================================================
// ICONS
// ============================================================================

export const ICONS = {
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  remove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};
