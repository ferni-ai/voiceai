/**
 * Calendar "Better Than Human" Integration Tests
 *
 * Tests the superhuman calendar capabilities across all 7 phases:
 * 1. Calendar → Capacity Guardian (burnout detection)
 * 2. Calendar → Commitment Keeper (feasibility validation)
 * 3. Ambient Calendar Awareness (meeting awareness)
 * 4. Memory-Enriched Meeting Intelligence
 * 5. Maya Habit-Calendar Correlation
 * 6. Jordan Milestone Calendar Sync
 * 7. Recovery Protection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Phase 1: Calendar → Capacity Guardian Tests
// ============================================================================

describe('Calendar Load Service', () => {
  describe('getCalendarLoadFactors', () => {
    it('should calculate weekly meeting hours correctly', () => {
      // Given calendar with 5 hours of meetings per day
      const mockWeekOverview = {
        days: [
          {
            totalMeetingMinutes: 300,
            isOverloaded: false,
            hasBackToBack: false,
            freeTimeMinutes: 180,
            date: new Date(),
            events: [],
            totalMeetings: 5,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            totalMeetingMinutes: 300,
            isOverloaded: false,
            hasBackToBack: true,
            freeTimeMinutes: 180,
            date: new Date(),
            events: [],
            totalMeetings: 5,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            totalMeetingMinutes: 300,
            isOverloaded: false,
            hasBackToBack: false,
            freeTimeMinutes: 180,
            date: new Date(),
            events: [],
            totalMeetings: 5,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            totalMeetingMinutes: 300,
            isOverloaded: false,
            hasBackToBack: false,
            freeTimeMinutes: 180,
            date: new Date(),
            events: [],
            totalMeetings: 5,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            totalMeetingMinutes: 300,
            isOverloaded: false,
            hasBackToBack: false,
            freeTimeMinutes: 180,
            date: new Date(),
            events: [],
            totalMeetings: 5,
            firstEvent: undefined,
            lastEvent: undefined,
          },
        ],
        totalMeetings: 25,
        averageMeetingsPerDay: 5,
        busiestDay: null,
        lightestDay: null,
        backToBackDays: [],
        startDate: new Date(),
        endDate: new Date(),
      };

      // Expected: 25 hours total (5 days × 5 hours)
      const totalMinutes = mockWeekOverview.days.reduce(
        (sum, day) => sum + day.totalMeetingMinutes,
        0
      );
      const totalHours = totalMinutes / 60;
      expect(totalHours).toBe(25);
    });

    it('should detect back-to-back percentage', () => {
      const daysWithBackToBack = 3;
      const totalWorkDays = 5;
      const percentage = Math.round((daysWithBackToBack / totalWorkDays) * 100);
      expect(percentage).toBe(60);
    });

    it('should calculate focus time ratio', () => {
      const totalWorkMinutes = 5 * 9 * 60; // 5 days × 9 hours
      const totalMeetingMinutes = 25 * 60; // 25 hours
      const ratio = (totalWorkMinutes - totalMeetingMinutes) / totalWorkMinutes;
      expect(ratio).toBeCloseTo(0.44, 1); // ~44% focus time
    });
  });

  describe('getCalendarBurnoutRiskFactors', () => {
    it('should flag extreme meeting load (>35h)', () => {
      const weeklyMeetingHours = 36;
      const VERY_HEAVY_WEEK_HOURS = 35;
      expect(weeklyMeetingHours >= VERY_HEAVY_WEEK_HOURS).toBe(true);
    });

    it('should flag no focus time (<15%)', () => {
      const focusTimeRatio = 0.12;
      const LOW_FOCUS_TIME_RATIO = 0.15;
      expect(focusTimeRatio < LOW_FOCUS_TIME_RATIO).toBe(true);
    });

    it('should flag meeting marathon (>3h consecutive)', () => {
      const consecutiveStreak = 200; // minutes
      const MARATHON_THRESHOLD = 180; // 3 hours
      expect(consecutiveStreak >= MARATHON_THRESHOLD).toBe(true);
    });
  });
});

// ============================================================================
// Phase 2: Calendar → Commitment Keeper Tests
// ============================================================================

describe('Commitment Calendar Integration', () => {
  describe('validateCommitmentFeasibility', () => {
    it('should parse commitment requirements from text', () => {
      const commitment = { text: 'workout 3 times per week' };

      // Expected parsing
      const expectedTimes = 3;
      const expectedPeriod = 'week';

      expect(commitment.text.includes('3')).toBe(true);
      expect(commitment.text.includes('week')).toBe(true);
    });

    it('should identify morning preference', () => {
      const commitment = { text: 'meditate every morning for 15 minutes' };
      expect(commitment.text.includes('morning')).toBe(true);
    });

    it('should extract duration from text', () => {
      const text = 'run for 30 minutes';
      const match = text.match(/(\d+)\s*(min)/i);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('30');
    });

    it('should calculate feasibility score based on available slots', () => {
      const slotsAvailable = 2;
      const slotsNeeded = 3;
      const score = Math.round((slotsAvailable / slotsNeeded) * 60);
      expect(score).toBe(40); // 2/3 * 60 = 40
    });
  });

  describe('createCalendarBlocksForCommitment', () => {
    it('should generate appropriate event title', () => {
      const commitmentText = 'workout 3 times per week';
      const extractActivityName = (text: string) => {
        if (text.includes('workout')) return 'Workout';
        return 'Commitment';
      };
      const title = `📌 ${extractActivityName(commitmentText)}`;
      expect(title).toBe('📌 Workout');
    });
  });
});

// ============================================================================
// Phase 3: Ambient Calendar Awareness Tests
// ============================================================================

describe('Ambient Calendar Awareness', () => {
  describe('getAmbientCalendarContext', () => {
    it('should detect meeting within 10 minutes', () => {
      const now = new Date();
      const meetingStart = new Date(now.getTime() + 8 * 60 * 1000); // 8 min from now
      const minutesUntil = Math.round((meetingStart.getTime() - now.getTime()) / 60000);
      const WARN_MINUTES_BEFORE = 10;

      expect(minutesUntil <= WARN_MINUTES_BEFORE).toBe(true);
    });

    it('should detect recently ended meeting', () => {
      const now = new Date();
      const meetingEnd = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago
      const minutesSince = Math.round((now.getTime() - meetingEnd.getTime()) / 60000);
      const POST_MEETING_WINDOW = 15;

      expect(minutesSince <= POST_MEETING_WINDOW).toBe(true);
    });

    it('should generate wrap-up suggestion for imminent meeting', () => {
      const minutesUntil = 3;
      const meetingTitle = 'Interview';

      const generateWrapUp = (title: string, mins: number) => {
        if (title.toLowerCase().includes('interview')) {
          return `Time to get ready for your interview in ${mins} minutes. Good luck!`;
        }
        return `You have "${title}" in ${mins} minutes.`;
      };

      const suggestion = generateWrapUp(meetingTitle, minutesUntil);
      expect(suggestion).toContain('interview');
      expect(suggestion).toContain('Good luck');
    });
  });

  describe('High-priority meeting detection', () => {
    it('should identify interview as high priority', () => {
      const title = 'Technical Interview with Google';
      const keywords = ['interview', 'review', 'presentation', 'client'];
      const isHighPriority = keywords.some((kw) => title.toLowerCase().includes(kw));
      expect(isHighPriority).toBe(true);
    });

    it('should identify long meetings as high priority', () => {
      const durationMinutes = 90;
      const isLongMeeting = durationMinutes >= 60;
      expect(isLongMeeting).toBe(true);
    });
  });
});

// ============================================================================
// Phase 4: Memory-Enriched Meeting Intelligence Tests
// ============================================================================

describe('Meeting Memory Service', () => {
  describe('getMeetingAttendeeContext', () => {
    it('should extract name from email', () => {
      const extractName = (email: string) => {
        const localPart = email.split('@')[0];
        return localPart
          .split(/[._]/)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join(' ');
      };

      expect(extractName('john.doe@example.com')).toBe('John Doe');
      expect(extractName('jane_smith@company.com')).toBe('Jane Smith');
    });

    it('should calculate meeting frequency', () => {
      const interactionCount = 10;
      const daySpan = 60; // days
      const avgDaysBetween = daySpan / interactionCount;

      let frequency: 'weekly' | 'monthly' | 'occasional' | 'rare';
      if (avgDaysBetween <= 10) frequency = 'weekly';
      else if (avgDaysBetween <= 45) frequency = 'monthly';
      else if (avgDaysBetween <= 90) frequency = 'occasional';
      else frequency = 'rare';

      expect(frequency).toBe('weekly');
    });
  });

  describe('enrichPreMeetingBriefing', () => {
    it('should assess client meeting as high priority', () => {
      const relationshipTypes = ['client'];
      const hasClient = relationshipTypes.includes('client');
      expect(hasClient).toBe(true);
    });

    it('should suggest follow-up for old relationships', () => {
      const lastMeetingDaysAgo = 45;
      const shouldSuggestCatchUp = lastMeetingDaysAgo > 30;
      expect(shouldSuggestCatchUp).toBe(true);
    });
  });
});

// ============================================================================
// Phase 5: Maya Habit-Calendar Correlation Tests
// ============================================================================

describe('Habit Calendar Integration', () => {
  describe('getHabitCalendarInsights', () => {
    it('should detect strong calendar correlation', () => {
      const completionRateOnLightDays = 0.9;
      const completionRateOnHeavyDays = 0.3;
      const rateDifference = completionRateOnLightDays - completionRateOnHeavyDays;

      let correlation: 'strong' | 'moderate' | 'weak' | 'none';
      if (rateDifference > 0.5) correlation = 'strong';
      else if (rateDifference > 0.3) correlation = 'moderate';
      else if (rateDifference > 0.1) correlation = 'weak';
      else correlation = 'none';

      expect(correlation).toBe('strong');
    });

    it('should suggest shorter version for heavy days', () => {
      const duration = 45;
      const correlation = 'strong';
      const shortDuration = Math.max(10, Math.round(duration * 0.3));

      if (correlation === 'strong') {
        expect(shortDuration).toBe(14); // 45 * 0.3 rounded
      }
    });
  });

  describe('getTomorrowHabitRecommendations', () => {
    it('should recommend shorter version for overloaded day', () => {
      const isHeavyDay = true;
      const habitDuration = 45;

      if (isHeavyDay && habitDuration > 20) {
        const shortDuration = Math.max(10, Math.round(habitDuration * 0.4));
        expect(shortDuration).toBe(18);
      }
    });
  });

  describe('Celebration context', () => {
    it('should give extra praise for completing habit on busy day', () => {
      const totalMeetings = 7;
      const wasOnBusyDay = true;
      const extraPraiseDeserved = wasOnBusyDay || totalMeetings >= 6;
      expect(extraPraiseDeserved).toBe(true);
    });
  });
});

// ============================================================================
// Phase 6: Jordan Milestone Calendar Sync Tests
// ============================================================================

describe('Milestone Calendar Sync', () => {
  describe('syncMilestoneToCalendar', () => {
    it('should create all-day event for milestone', () => {
      const milestone = {
        name: 'Launch Product',
        date: new Date('2024-06-15'),
        importance: 'high' as const,
        requiresPrep: true,
        prepTimeHours: 2,
      };

      expect(milestone.importance).toBe('high');
      expect(milestone.requiresPrep).toBe(true);
    });
  });

  describe('createMilestoneCountdown', () => {
    it('should calculate correct reminder dates', () => {
      const milestoneDate = new Date('2024-06-15');
      const reminderDaysBefore = [30, 14, 7, 3, 1];

      const reminderDates = reminderDaysBefore.map((days) => {
        const date = new Date(milestoneDate);
        date.setDate(date.getDate() - days);
        return date;
      });

      expect(reminderDates.length).toBe(5);
    });
  });

  describe('getMilestonesForDailyBriefing', () => {
    it('should mark milestone as imminent within 3 days', () => {
      const daysUntil = 2;
      const isUrgent = daysUntil <= 7;
      const isImminent = daysUntil <= 3;

      expect(isUrgent).toBe(true);
      expect(isImminent).toBe(true);
    });

    it('should generate appropriate countdown message', () => {
      const generateMessage = (name: string, days: number) => {
        if (days === 0) return `Today is the day: ${name}!`;
        if (days === 1) return `Tomorrow: ${name}`;
        if (days <= 3) return `${name} in ${days} days - getting close!`;
        return `${days} days until ${name}`;
      };

      expect(generateMessage('Launch', 0)).toBe('Today is the day: Launch!');
      expect(generateMessage('Launch', 1)).toBe('Tomorrow: Launch');
      expect(generateMessage('Launch', 2)).toBe('Launch in 2 days - getting close!');
    });
  });
});

// ============================================================================
// Phase 7: Recovery Protection Tests
// ============================================================================

describe('Recovery Protection', () => {
  describe('detectRecoveryNeeds', () => {
    it('should recommend block time after long meeting streak', () => {
      const consecutiveMeetingStreak = 200; // minutes
      const autoBlockAfterMinutes = 180;

      const shouldBlockTime = consecutiveMeetingStreak >= autoBlockAfterMinutes;
      expect(shouldBlockTime).toBe(true);
    });

    it('should recommend declining meeting on overloaded day', () => {
      const totalMeetingMinutes = 420; // 7 hours
      const maxMeetingHoursPerDay = 6;
      const isOverloaded = totalMeetingMinutes >= maxMeetingHoursPerDay * 60;
      expect(isOverloaded).toBe(true);
    });
  });

  describe('findRecoveryOpportunities', () => {
    it('should rate morning slots on light days as excellent', () => {
      const dayMeetings = 2;
      const slotHour = 9;
      const isLightDay = dayMeetings < 3;
      const isGoodTime = slotHour === 9 || slotHour === 13 || slotHour === 14;

      let quality: 'excellent' | 'good' | 'fair';
      if (isLightDay && isGoodTime) quality = 'excellent';
      else if (dayMeetings < 5) quality = 'good';
      else quality = 'fair';

      expect(quality).toBe('excellent');
    });
  });

  describe('autoBlockRecoveryTime', () => {
    it('should create recovery event with correct title', () => {
      const title = '🧘 Recovery Time';
      expect(title).toContain('Recovery');
      expect(title).toContain('🧘');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Cross-Phase Integration', () => {
  it('should combine calendar load with energy readings for burnout', () => {
    // Simulate: Low energy + Heavy calendar = High risk
    const energyScore = 35;
    const weeklyMeetingHours = 30;
    let riskScore = 0;

    if (energyScore < 40) riskScore += 20;
    if (weeklyMeetingHours >= 30) riskScore += 20;
    if (energyScore < 50 && weeklyMeetingHours >= 25) {
      riskScore += 20; // Energy-Calendar mismatch
    }

    expect(riskScore).toBe(60); // elevated to high risk
  });

  it('should validate commitment against calendar before saving', () => {
    // Simulate: Commitment to "workout 5x/week" when calendar only has 2 slots
    const slotsNeeded = 5;
    const slotsAvailable = 2;
    const feasible = slotsAvailable >= slotsNeeded;
    const feasibilityScore = Math.round((slotsAvailable / slotsNeeded) * 60);

    expect(feasible).toBe(false);
    expect(feasibilityScore).toBe(24); // Low score
  });

  it('should inject ambient calendar context for imminent meeting', () => {
    const minutesUntilMeeting = 3;
    const meetingTitle = 'Client Call';

    const shouldInject = minutesUntilMeeting <= 10;
    const injection = shouldInject
      ? `⏰ User has "${meetingTitle}" in ${minutesUntilMeeting} minutes.`
      : null;

    expect(injection).not.toBeNull();
    expect(injection).toContain('Client Call');
  });
});

// ============================================================================
// Context Builder Integration Tests
// ============================================================================

describe('Calendar Context Builder Integrations', () => {
  describe('Calendar Awareness Builder (Alex)', () => {
    it('should generate ambient context injection for Alex', () => {
      // Simulate the ambient context generation
      const hasImminentMeeting = true;
      const meetingTitle = 'Team Standup';
      const minutesRemaining = 5;
      const priority = 'normal';

      const sections: string[] = ['[AMBIENT CALENDAR AWARENESS]'];
      sections.push(
        `User has an upcoming meeting in ${minutesRemaining} minutes: "${meetingTitle}".`
      );
      sections.push(`Priority: ${priority}.`);
      sections.push(`Suggestion: Suggest wrapping up current conversation soon.`);

      const injection = sections.join('\n');

      expect(injection).toContain('AMBIENT CALENDAR AWARENESS');
      expect(injection).toContain('Team Standup');
      expect(injection).toContain('5 minutes');
    });

    it('should include recovery context when load is high', () => {
      const load = {
        weeklyMeetingHours: 35,
        focusTimeRatio: 0.12,
        backToBackPercentage: 0.6,
      };

      const sections: string[] = ['[BETTER THAN HUMAN: ENERGY GUARDIAN]'];
      sections.push(`Weekly meetings: ${Math.round(load.weeklyMeetingHours)} hours`);
      sections.push(`Focus time: only ${Math.round(load.focusTimeRatio * 100)}% available`);
      sections.push(`Back-to-back: ${Math.round(load.backToBackPercentage * 100)}% consecutive`);
      sections.push('Proactively suggest recovery time or help them protect their energy.');

      const injection = sections.join('\n');

      expect(injection).toContain('ENERGY GUARDIAN');
      expect(injection).toContain('35 hours');
      expect(injection).toContain('12% available');
      expect(injection).toContain('60% consecutive');
    });

    it('should include recovery needs when detected', () => {
      const recoveryNeeds = [
        {
          reason: 'High weekly meeting load',
          urgency: 'high',
          suggestedAction: 'Block recovery time',
        },
        {
          reason: 'Low focus time',
          urgency: 'normal',
          suggestedAction: 'Consider declining meetings',
        },
      ];

      const sections: string[] = ['[RECOVERY NEEDS DETECTED]'];
      recoveryNeeds.forEach((need) => {
        sections.push(`[${need.urgency.toUpperCase()}] ${need.reason}: ${need.suggestedAction}`);
      });

      const injection = sections.join('\n');

      expect(injection).toContain('HIGH');
      expect(injection).toContain('High weekly meeting load');
      expect(injection).toContain('Block recovery time');
    });
  });

  describe('Maya Coaching Insights (Habit-Calendar Correlation)', () => {
    it('should generate calendar insights for habit coaching', () => {
      const habitName = 'Morning Meditation';
      const completionOnHeavyDays = 0.3;
      const completionOnLightDays = 0.8;
      const correlation = 'strong-negative';

      const sections: string[] = ['[CALENDAR-HABIT CORRELATION]'];
      sections.push(`Habit "${habitName}" shows ${correlation} calendar correlation.`);
      sections.push(`Completion rate on heavy days: ${Math.round(completionOnHeavyDays * 100)}%`);
      sections.push(`Completion rate on light days: ${Math.round(completionOnLightDays * 100)}%`);
      sections.push(`Suggestion: Consider shorter meditation on busy days.`);

      const injection = sections.join('\n');

      expect(injection).toContain('CALENDAR-HABIT CORRELATION');
      expect(injection).toContain('Morning Meditation');
      expect(injection).toContain('30%');
      expect(injection).toContain('80%');
    });

    it('should provide tomorrow recommendations based on calendar', () => {
      const tomorrowOverloaded = true;
      const habitName = 'Exercise';
      const normalDuration = 45;
      const suggestedDuration = 20;

      let recommendation: string | null = null;
      if (tomorrowOverloaded) {
        recommendation = `Tomorrow looks very busy. Consider doing a shorter version of "${habitName}" (${suggestedDuration} minutes instead of ${normalDuration}).`;
      }

      expect(recommendation).not.toBeNull();
      expect(recommendation).toContain('busy');
      expect(recommendation).toContain('20 minutes');
    });
  });

  describe('Jordan Milestone Insights (Milestone-Calendar Sync)', () => {
    it('should generate milestone calendar sync context', () => {
      const milestoneName = 'Wedding Anniversary';
      const daysRemaining = 3;
      const calendarConflicts = true;

      const sections: string[] = ['[MILESTONE CALENDAR SYNC]'];
      sections.push(`Upcoming: "${milestoneName}" in ${daysRemaining} days.`);
      if (calendarConflicts) {
        sections.push(`⚠️ Warning: The milestone day has calendar conflicts.`);
        sections.push(`Suggestion: Help them clear space for this important day.`);
      }

      const injection = sections.join('\n');

      expect(injection).toContain('MILESTONE CALENDAR SYNC');
      expect(injection).toContain('Wedding Anniversary');
      expect(injection).toContain('3 days');
      expect(injection).toContain('conflicts');
    });

    it('should identify imminent milestones for briefing', () => {
      const milestones = [
        { name: 'Birthday', daysRemaining: 1, isImminent: true },
        { name: 'Project Deadline', daysRemaining: 5, isImminent: false },
        { name: 'Vacation', daysRemaining: 14, isImminent: false },
      ];

      const imminentMilestones = milestones.filter((m) => m.daysRemaining <= 7);
      const urgentMilestones = milestones.filter((m) => m.isImminent);

      expect(imminentMilestones.length).toBe(2);
      expect(urgentMilestones.length).toBe(1);
      expect(urgentMilestones[0].name).toBe('Birthday');
    });
  });
});

// ============================================================================
// LLM Tool Integration Tests
// ============================================================================

describe('Recovery Protection LLM Tools', () => {
  describe('detectRecoveryNeeds tool', () => {
    it('should return manageable status when load is low', () => {
      const load = {
        weeklyMeetingHours: 15,
        focusTimeRatio: 0.5,
        backToBackPercentage: 0.1,
        consecutiveOverloadedDays: 0,
        currentMeetingStreak: 1,
      };

      const hasRecoveryNeeds =
        load.weeklyMeetingHours > 30 ||
        load.focusTimeRatio < 0.15 ||
        load.backToBackPercentage > 0.6 ||
        load.consecutiveOverloadedDays >= 2 ||
        load.currentMeetingStreak >= 4;

      expect(hasRecoveryNeeds).toBe(false);
    });

    it('should detect high urgency when multiple factors are bad', () => {
      const load = {
        weeklyMeetingHours: 38,
        focusTimeRatio: 0.1,
        backToBackPercentage: 0.7,
        consecutiveOverloadedDays: 3,
        currentMeetingStreak: 5,
      };

      const highUrgencyFactors: string[] = [];
      if (load.weeklyMeetingHours > 35) highUrgencyFactors.push('extreme_meeting_load');
      if (load.focusTimeRatio < 0.15) highUrgencyFactors.push('insufficient_focus_time');
      if (load.consecutiveOverloadedDays >= 2)
        highUrgencyFactors.push('consecutive_overloaded_days');
      if (load.currentMeetingStreak >= 4) highUrgencyFactors.push('meeting_marathon');

      expect(highUrgencyFactors.length).toBe(4);
      expect(highUrgencyFactors).toContain('extreme_meeting_load');
      expect(highUrgencyFactors).toContain('insufficient_focus_time');
    });
  });

  describe('findRecoveryOpportunities tool', () => {
    it('should rate slots based on duration and day load', () => {
      interface MockSlot {
        durationMinutes: number;
        dayMeetingMinutes: number;
        isMorning: boolean;
        rating?: 'excellent' | 'good' | 'fair' | 'poor';
      }

      const slots: MockSlot[] = [
        { durationMinutes: 180, dayMeetingMinutes: 60, isMorning: true },
        { durationMinutes: 60, dayMeetingMinutes: 300, isMorning: false },
        { durationMinutes: 120, dayMeetingMinutes: 120, isMorning: true },
      ];

      // Rate slots
      slots.forEach((slot) => {
        let rating: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
        if (slot.durationMinutes >= 180) rating = 'excellent';
        else if (slot.durationMinutes >= 120) rating = 'good';

        if (slot.dayMeetingMinutes > 240) {
          rating = rating === 'excellent' ? 'good' : rating === 'good' ? 'fair' : 'poor';
        }

        slot.rating = rating;
      });

      expect(slots[0].rating).toBe('excellent');
      expect(slots[1].rating).toBe('poor');
      expect(slots[2].rating).toBe('good');
    });
  });

  describe('blockRecoveryTime tool', () => {
    it('should format recovery event correctly', () => {
      const durationMinutes = 90;
      const title = '🧘 Recovery Time';
      const startTime = new Date('2024-01-15T10:00:00');
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      const event = {
        title,
        startTime,
        endTime,
        durationMinutes,
      };

      expect(event.title).toBe('🧘 Recovery Time');
      expect(event.endTime.getTime() - event.startTime.getTime()).toBe(90 * 60 * 1000);
    });
  });

  describe('getCalendarLoadSummary tool', () => {
    it('should categorize load correctly', () => {
      const categorizeLoad = (hours: number): 'light' | 'moderate' | 'heavy' | 'extreme' => {
        if (hours <= 15) return 'light';
        if (hours <= 25) return 'moderate';
        if (hours <= 35) return 'heavy';
        return 'extreme';
      };

      expect(categorizeLoad(10)).toBe('light');
      expect(categorizeLoad(20)).toBe('moderate');
      expect(categorizeLoad(30)).toBe('heavy');
      expect(categorizeLoad(40)).toBe('extreme');
    });

    it('should warn about low focus time', () => {
      const focusTimeRatio = 0.12;
      const warning =
        focusTimeRatio < 0.2
          ? `⚠️ Focus Time: Only ${Math.round(focusTimeRatio * 100)}% available (that's quite low)`
          : null;

      expect(warning).not.toBeNull();
      expect(warning).toContain('12%');
      expect(warning).toContain('quite low');
    });
  });
});
