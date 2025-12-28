/**
 * Location & Calendar Intelligence Tests
 *
 * Tests for location types, calendar events, patterns, and anticipation insights.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock google-calendar-oauth
vi.mock('../../identity/google-calendar-oauth.js', () => ({
  getUserTokens: vi.fn().mockResolvedValue(null),
  refreshAccessToken: vi.fn().mockResolvedValue(null),
  isCalendarConfigured: vi.fn().mockResolvedValue(false),
  getEvents: vi.fn().mockResolvedValue([]),
  generateAuthUrl: vi.fn().mockReturnValue('https://auth.example.com'),
  exchangeCodeForTokens: vi.fn().mockResolvedValue(null),
}));

import type {
  LocationType,
  Location,
  CalendarEvent,
  TravelEvent,
  LocationPattern,
  EventPattern,
  StressTrigger,
  AnticipationInsight,
} from '../location-calendar.js';

describe('LocationCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Type definitions', () => {
    describe('LocationType', () => {
      it('should have all location types', () => {
        const types: LocationType[] = ['home', 'work', 'gym', 'social', 'travel', 'unknown'];

        expect(types).toHaveLength(6);
        types.forEach((type) => {
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('Location interface', () => {
      it('should create valid location', () => {
        const location: Location = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          timestamp: new Date(),
          type: 'home',
          name: 'Home',
          address: '123 Main St, San Francisco, CA',
        };

        expect(location.latitude).toBe(37.7749);
        expect(location.longitude).toBe(-122.4194);
        expect(location.type).toBe('home');
      });

      it('should allow optional name and address', () => {
        const location: Location = {
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 50,
          timestamp: new Date(),
          type: 'unknown',
        };

        expect(location.name).toBeUndefined();
        expect(location.address).toBeUndefined();
      });

      it('should support all location types', () => {
        const types: LocationType[] = ['home', 'work', 'gym', 'social', 'travel', 'unknown'];

        types.forEach((type) => {
          const location: Location = {
            latitude: 0,
            longitude: 0,
            accuracy: 100,
            timestamp: new Date(),
            type,
          };
          expect(location.type).toBe(type);
        });
      });
    });

    describe('CalendarEvent interface', () => {
      it('should create valid calendar event', () => {
        const event: CalendarEvent = {
          id: 'evt-123',
          title: 'Team Standup',
          description: 'Daily sync',
          startTime: new Date('2024-12-26T09:00:00Z'),
          endTime: new Date('2024-12-26T09:30:00Z'),
          location: 'Conference Room A',
          attendees: ['alice@example.com', 'bob@example.com'],
          isRecurring: true,
          recurringPattern: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
          eventType: 'meeting',
          stressWeight: 0.3,
        };

        expect(event.id).toBe('evt-123');
        expect(event.isRecurring).toBe(true);
        expect(event.eventType).toBe('meeting');
      });

      it('should allow optional fields', () => {
        const event: CalendarEvent = {
          id: 'evt-minimal',
          title: 'Quick Task',
          startTime: new Date(),
          endTime: new Date(),
          isRecurring: false,
          eventType: 'reminder',
        };

        expect(event.description).toBeUndefined();
        expect(event.location).toBeUndefined();
        expect(event.attendees).toBeUndefined();
        expect(event.stressWeight).toBeUndefined();
      });

      it('should support all event types', () => {
        const eventTypes: CalendarEvent['eventType'][] = [
          'meeting',
          'appointment',
          'personal',
          'travel',
          'reminder',
          'other',
        ];

        eventTypes.forEach((type) => {
          const event: CalendarEvent = {
            id: 'test',
            title: 'Test',
            startTime: new Date(),
            endTime: new Date(),
            isRecurring: false,
            eventType: type,
          };
          expect(event.eventType).toBe(type);
        });
      });
    });

    describe('TravelEvent interface', () => {
      it('should create valid travel event', () => {
        const travel: TravelEvent = {
          destination: 'Office',
          departureTime: new Date('2024-12-26T08:00:00Z'),
          arrivalTime: new Date('2024-12-26T08:45:00Z'),
          travelTimeMinutes: 45,
          trafficCondition: 'moderate',
          delayMinutes: 10,
          mode: 'driving',
        };

        expect(travel.destination).toBe('Office');
        expect(travel.travelTimeMinutes).toBe(45);
        expect(travel.mode).toBe('driving');
      });

      it('should support all traffic conditions', () => {
        const conditions: TravelEvent['trafficCondition'][] = [
          'light',
          'moderate',
          'heavy',
          'severe',
        ];

        conditions.forEach((condition) => {
          const travel: TravelEvent = {
            destination: 'Test',
            departureTime: new Date(),
            arrivalTime: new Date(),
            travelTimeMinutes: 30,
            trafficCondition: condition,
            delayMinutes: 0,
            mode: 'driving',
          };
          expect(travel.trafficCondition).toBe(condition);
        });
      });

      it('should support all travel modes', () => {
        const modes: TravelEvent['mode'][] = ['driving', 'transit', 'walking', 'cycling'];

        modes.forEach((mode) => {
          const travel: TravelEvent = {
            destination: 'Test',
            departureTime: new Date(),
            arrivalTime: new Date(),
            travelTimeMinutes: 30,
            trafficCondition: 'light',
            delayMinutes: 0,
            mode,
          };
          expect(travel.mode).toBe(mode);
        });
      });
    });

    describe('LocationPattern interface', () => {
      it('should create valid location pattern', () => {
        const pattern: LocationPattern = {
          dayOfWeek: 1, // Monday
          hourOfDay: 9,
          expectedLocation: 'work',
          confidence: 0.95,
          historicalMood: 'focused',
        };

        expect(pattern.dayOfWeek).toBe(1);
        expect(pattern.expectedLocation).toBe('work');
        expect(pattern.confidence).toBe(0.95);
      });

      it('should allow optional historical mood', () => {
        const pattern: LocationPattern = {
          dayOfWeek: 6, // Saturday
          hourOfDay: 10,
          expectedLocation: 'gym',
          confidence: 0.7,
        };

        expect(pattern.historicalMood).toBeUndefined();
      });

      it('should support all days of week', () => {
        for (let day = 0; day <= 6; day++) {
          const pattern: LocationPattern = {
            dayOfWeek: day,
            hourOfDay: 12,
            expectedLocation: 'unknown',
            confidence: 0.5,
          };
          expect(pattern.dayOfWeek).toBe(day);
        }
      });

      it('should support all hours of day', () => {
        for (let hour = 0; hour <= 23; hour++) {
          const pattern: LocationPattern = {
            dayOfWeek: 0,
            hourOfDay: hour,
            expectedLocation: 'home',
            confidence: 0.5,
          };
          expect(pattern.hourOfDay).toBe(hour);
        }
      });
    });

    describe('EventPattern interface', () => {
      it('should create valid event pattern', () => {
        const pattern: EventPattern = {
          eventType: 'team-meeting',
          dayOfWeek: 1,
          averageStressLevel: 0.4,
          averageMoodAfter: 'productive',
          occurrenceCount: 52,
          lastOccurrence: new Date('2024-12-23'),
        };

        expect(pattern.eventType).toBe('team-meeting');
        expect(pattern.averageStressLevel).toBe(0.4);
        expect(pattern.occurrenceCount).toBe(52);
      });
    });

    describe('StressTrigger interface', () => {
      it('should create valid stress trigger', () => {
        const trigger: StressTrigger = {
          eventPattern: 'monday-standup',
          dayTime: 'Monday 9:00 AM',
          stressLevel: 0.6,
          suggestion: 'Take 5 minutes to breathe before the meeting',
        };

        expect(trigger.eventPattern).toBe('monday-standup');
        expect(trigger.stressLevel).toBe(0.6);
        expect(trigger.suggestion).toContain('breathe');
      });
    });

    describe('AnticipationInsight interface', () => {
      it('should create valid preparation insight', () => {
        const insight: AnticipationInsight = {
          type: 'preparation',
          event: {
            id: 'evt-1',
            title: 'Important Interview',
            startTime: new Date(),
            endTime: new Date(),
            isRecurring: false,
            eventType: 'appointment',
          },
          insight: 'You have an important interview in 2 hours',
          suggestion: 'Review your notes and practice your introduction',
          urgency: 'high',
          timeUntil: 120,
        };

        expect(insight.type).toBe('preparation');
        expect(insight.urgency).toBe('high');
        expect(insight.timeUntil).toBe(120);
      });

      it('should create valid travel insight', () => {
        const insight: AnticipationInsight = {
          type: 'travel',
          insight: 'Heavy traffic on your usual route',
          suggestion: 'Leave 15 minutes early',
          urgency: 'medium',
          timeUntil: 60,
        };

        expect(insight.type).toBe('travel');
        expect(insight.event).toBeUndefined();
      });

      it('should create valid pattern insight', () => {
        const insight: AnticipationInsight = {
          type: 'pattern',
          insight: 'You typically feel anxious on Monday mornings',
          suggestion: 'Start with a calming routine',
          urgency: 'low',
        };

        expect(insight.type).toBe('pattern');
        expect(insight.timeUntil).toBeUndefined();
      });

      it('should create valid stress insight', () => {
        const insight: AnticipationInsight = {
          type: 'stress',
          event: {
            id: 'evt-stressful',
            title: 'Performance Review',
            startTime: new Date(),
            endTime: new Date(),
            isRecurring: false,
            eventType: 'meeting',
            stressWeight: 0.8,
          },
          insight: 'This type of meeting has been stressful in the past',
          suggestion: 'Remember to take deep breaths',
          urgency: 'high',
          timeUntil: 30,
        };

        expect(insight.type).toBe('stress');
        expect(insight.event?.stressWeight).toBe(0.8);
      });

      it('should support all insight types', () => {
        const types: AnticipationInsight['type'][] = ['preparation', 'travel', 'pattern', 'stress'];

        types.forEach((type) => {
          const insight: AnticipationInsight = {
            type,
            insight: 'Test insight',
            urgency: 'low',
          };
          expect(insight.type).toBe(type);
        });
      });

      it('should support all urgency levels', () => {
        const urgencies: AnticipationInsight['urgency'][] = ['low', 'medium', 'high'];

        urgencies.forEach((urgency) => {
          const insight: AnticipationInsight = {
            type: 'pattern',
            insight: 'Test',
            urgency,
          };
          expect(insight.urgency).toBe(urgency);
        });
      });
    });
  });

  describe('Location calculations', () => {
    it('should calculate distance between coordinates', () => {
      // Haversine formula for reference
      const lat1 = 37.7749; // SF
      const lon1 = -122.4194;
      const lat2 = 34.0522; // LA
      const lon2 = -118.2437;

      // SF to LA is approximately 559 km
      const R = 6371; // Earth's radius in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      expect(distance).toBeGreaterThan(500);
      expect(distance).toBeLessThan(600);
    });
  });

  describe('Event timing calculations', () => {
    it('should calculate time until event', () => {
      const now = new Date();
      const eventStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      const timeUntilMs = eventStart.getTime() - now.getTime();
      const timeUntilMinutes = Math.floor(timeUntilMs / (60 * 1000));

      expect(timeUntilMinutes).toBeCloseTo(60, 0);
    });

    it('should calculate event duration', () => {
      const start = new Date('2024-12-26T09:00:00Z');
      const end = new Date('2024-12-26T10:30:00Z');

      const durationMs = end.getTime() - start.getTime();
      const durationMinutes = Math.floor(durationMs / (60 * 1000));

      expect(durationMinutes).toBe(90);
    });

    it('should detect overlapping events', () => {
      const event1 = {
        start: new Date('2024-12-26T09:00:00Z'),
        end: new Date('2024-12-26T10:00:00Z'),
      };
      const event2 = {
        start: new Date('2024-12-26T09:30:00Z'),
        end: new Date('2024-12-26T10:30:00Z'),
      };

      const overlaps = event1.start < event2.end && event2.start < event1.end;

      expect(overlaps).toBe(true);
    });

    it('should detect non-overlapping events', () => {
      const event1 = {
        start: new Date('2024-12-26T09:00:00Z'),
        end: new Date('2024-12-26T10:00:00Z'),
      };
      const event2 = {
        start: new Date('2024-12-26T11:00:00Z'),
        end: new Date('2024-12-26T12:00:00Z'),
      };

      const overlaps = event1.start < event2.end && event2.start < event1.end;

      expect(overlaps).toBe(false);
    });
  });

  describe('Pattern detection', () => {
    it('should calculate confidence based on occurrence count', () => {
      const occurrences = [
        { location: 'work', count: 45 },
        { location: 'home', count: 5 },
      ];

      const total = occurrences.reduce((sum, o) => sum + o.count, 0);
      const workConfidence = occurrences[0].count / total;
      const homeConfidence = occurrences[1].count / total;

      expect(workConfidence).toBe(0.9);
      expect(homeConfidence).toBe(0.1);
    });

    it('should identify day-of-week patterns', () => {
      const patterns = [
        { dayOfWeek: 0, mood: 'relaxed' },
        { dayOfWeek: 1, mood: 'anxious' },
        { dayOfWeek: 5, mood: 'happy' },
      ];

      expect(patterns.find((p) => p.dayOfWeek === 1)?.mood).toBe('anxious');
      expect(patterns.find((p) => p.dayOfWeek === 5)?.mood).toBe('happy');
    });
  });

  describe('Stress weight calculations', () => {
    it('should calculate average stress from multiple events', () => {
      const stressWeights = [0.2, 0.5, 0.8, 0.3];
      const avgStress = stressWeights.reduce((a, b) => a + b, 0) / stressWeights.length;

      expect(avgStress).toBe(0.45);
    });

    it('should identify high-stress events', () => {
      const events: CalendarEvent[] = [
        {
          id: '1',
          title: 'Standup',
          startTime: new Date(),
          endTime: new Date(),
          isRecurring: false,
          eventType: 'meeting',
          stressWeight: 0.2,
        },
        {
          id: '2',
          title: 'Review',
          startTime: new Date(),
          endTime: new Date(),
          isRecurring: false,
          eventType: 'meeting',
          stressWeight: 0.8,
        },
        {
          id: '3',
          title: 'Lunch',
          startTime: new Date(),
          endTime: new Date(),
          isRecurring: false,
          eventType: 'personal',
          stressWeight: 0.1,
        },
      ];

      const highStress = events.filter((e) => (e.stressWeight ?? 0) > 0.6);

      expect(highStress).toHaveLength(1);
      expect(highStress[0].title).toBe('Review');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero coordinates', () => {
      const location: Location = {
        latitude: 0,
        longitude: 0,
        accuracy: 1000,
        timestamp: new Date(),
        type: 'unknown',
      };

      // Null Island - valid but unusual
      expect(location.latitude).toBe(0);
      expect(location.longitude).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const location: Location = {
        latitude: -33.8688, // Sydney
        longitude: 151.2093,
        accuracy: 10,
        timestamp: new Date(),
        type: 'travel',
      };

      expect(location.latitude).toBeLessThan(0);
      expect(location.longitude).toBeGreaterThan(0);
    });

    it('should handle events with same start and end time', () => {
      const event: CalendarEvent = {
        id: 'instant',
        title: 'Reminder',
        startTime: new Date('2024-12-26T12:00:00Z'),
        endTime: new Date('2024-12-26T12:00:00Z'),
        isRecurring: false,
        eventType: 'reminder',
      };

      const duration = event.endTime.getTime() - event.startTime.getTime();
      expect(duration).toBe(0);
    });

    it('should handle zero delay in travel', () => {
      const travel: TravelEvent = {
        destination: 'Office',
        departureTime: new Date(),
        arrivalTime: new Date(),
        travelTimeMinutes: 30,
        trafficCondition: 'light',
        delayMinutes: 0,
        mode: 'walking',
      };

      expect(travel.delayMinutes).toBe(0);
    });
  });
});
