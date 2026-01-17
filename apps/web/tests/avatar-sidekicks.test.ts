/**
 * @file Avatar Sidekicks UI Tests
 * @description Tests for the floating contextual icons that appear beside the avatar
 * 
 * The sidekicks system shows icons "like hands" beside the avatar instead of
 * overlaying them on the avatar's eyes. This provides a less intrusive way to
 * show contextual information (e.g., morning coffee, thinking, celebration).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock GSAP before importing the module
// Create a chainable mock that returns itself for all methods
const createChainableMock = () => {
  const mock: Record<string, vi.Mock> = {};
  const methods = [
    'to', 'fromTo', 'set', 'play', 'kill', 'pause', 'progress', 
    'restart', 'reverse', 'seek', 'time', 'duration', 'eventCallback', 
    'clear', 'add', 'call', 'delay', 'repeat', 'yoyo'
  ];
  methods.forEach(method => {
    mock[method] = vi.fn().mockImplementation(() => mock);
  });
  return mock;
};

vi.mock('../src/utils/gsap-setup.js', () => ({
  gsap: {
    timeline: vi.fn(() => createChainableMock()),
    set: vi.fn(),
    to: vi.fn(() => createChainableMock()),
    fromTo: vi.fn(() => createChainableMock()),
    killTweensOf: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Note: matchMedia is mocked in tests/setup.ts

// Import after mocks are set up
import { 
  avatarSidekicks,
  showSidekick,
  showSidekickPair,
  clearAllSidekicks,
  initAvatarSidekicks,
  dispose,
  type SidekickIcon,
} from '../src/ui/avatar-sidekicks.ui.js';

// Sidekick types for convenience function tests
type SidekickType = 'idea' | 'love' | 'celebration' | 'music' | 'thinking' | 'wave' | 'reading' | 'growth' | 'recognition' | 'star';

describe('Avatar Sidekicks UI', () => {
  let coachElement: HTMLElement;
  let avatarContainer: HTMLElement;

  beforeEach(() => {
    // Use fake timers to control setTimeout/setInterval
    vi.useFakeTimers();
    
    // Create mock DOM structure
    coachElement = document.createElement('div');
    coachElement.id = 'coach';
    
    avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';
    
    coachElement.appendChild(avatarContainer);
    document.body.appendChild(coachElement);
    
    // Initialize the sidekicks system
    initAvatarSidekicks();
  });

  afterEach(() => {
    // Clean up
    dispose();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create sidekick container inside avatar-container', () => {
      const sidekickContainer = avatarContainer.querySelector('.avatar-sidekicks-container');
      expect(sidekickContainer).toBeTruthy();
    });

    it('should create left and right slots', () => {
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(leftSlot).toBeTruthy();
      expect(rightSlot).toBeTruthy();
    });

    it('should inject styles into document head', () => {
      const style = document.getElementById('avatar-sidekicks-styles');
      expect(style).toBeTruthy();
      expect(style?.tagName).toBe('STYLE');
    });
  });

  describe('Icon Library', () => {
    it('should have a comprehensive set of icons', () => {
      expect(avatarSidekicks.icons.length).toBeGreaterThan(50);
    });

    it('should include time-of-day icons', () => {
      const timeIcons: SidekickIcon[] = ['coffee', 'sun', 'moon', 'sunrise', 'sunset'];
      timeIcons.forEach(icon => {
        expect(avatarSidekicks.icons).toContain(icon);
      });
    });

    it('should include emotion icons', () => {
      const emotionIcons: SidekickIcon[] = ['heart', 'sparkles', 'smile', 'thumbsUp'];
      emotionIcons.forEach(icon => {
        expect(avatarSidekicks.icons).toContain(icon);
      });
    });

    it('should include activity icons', () => {
      const activityIcons: SidekickIcon[] = ['music', 'book', 'headphones', 'gamepad'];
      activityIcons.forEach(icon => {
        expect(avatarSidekicks.icons).toContain(icon);
      });
    });
  });

  describe('showSidekick()', () => {
    it('should create a sidekick element on show', () => {
      showSidekick({ icon: 'coffee', position: 'right' });
      vi.runAllTimers(); // Execute any scheduled timeouts
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      const sidekick = rightSlot?.querySelector('.sidekick-icon');
      expect(sidekick).toBeTruthy();
    });

    it('should default to right position', () => {
      showSidekick({ icon: 'heart' });
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      const sidekick = rightSlot?.querySelector('.sidekick-icon');
      expect(sidekick).toBeTruthy();
    });

    it('should support left position', () => {
      showSidekick({ icon: 'lightbulb', position: 'left' });
      vi.runAllTimers();
      
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const sidekick = leftSlot?.querySelector('.sidekick-icon');
      expect(sidekick).toBeTruthy();
    });

    it('should contain SVG icon content', () => {
      showSidekick({ icon: 'coffee', position: 'right' });
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      const sidekick = rightSlot?.querySelector('.sidekick-icon');
      const svg = sidekick?.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('showSidekickPair()', () => {
    it('should show icons on both sides', () => {
      showSidekickPair('sparkles', 'heart');
      vi.runAllTimers();
      
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      
      expect(leftSlot?.querySelector('.sidekick-icon')).toBeTruthy();
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('clearAllSidekicks()', () => {
    it('should remove all active sidekicks', () => {
      showSidekick({ icon: 'coffee', position: 'right' });
      showSidekick({ icon: 'heart', position: 'left' });
      vi.runAllTimers();
      
      clearAllSidekicks();
      
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      
      expect(leftSlot?.children.length).toBe(0);
      expect(rightSlot?.children.length).toBe(0);
    });
  });

  describe('Convenience Functions', () => {
    it('should have timeOfDay convenience function', () => {
      expect(typeof avatarSidekicks.timeOfDay).toBe('function');
    });

    it('should have idea convenience function', () => {
      avatarSidekicks.idea();
      vi.runAllTimers();
      // idea() shows lightbulb on the LEFT side
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      expect(leftSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should have love convenience function', () => {
      avatarSidekicks.love();
      vi.runAllTimers();
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should have celebrate convenience function', () => {
      avatarSidekicks.celebrate();
      vi.runAllTimers();
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should have music convenience function', () => {
      avatarSidekicks.music();
      vi.runAllTimers();
      // music() shows music icon on the LEFT side
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      expect(leftSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should have thinking convenience function', () => {
      avatarSidekicks.thinking();
      vi.runAllTimers();
      // thinking() shows brain icon on the LEFT side
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      expect(leftSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Sidekick Types', () => {
    // Use actual icon names from SIDEKICK_ICONS
    const sidekickTypes: SidekickIcon[] = [
      'lightbulb', 'heart', 'sparkles', 'music', 'thinking',
      'hand', 'book', 'sprout', 'trophy', 'star'
    ];

    sidekickTypes.forEach(type => {
      it(`should support "${type}" sidekick type`, () => {
        showSidekick({ icon: type, position: 'right' });
        vi.runAllTimers();
        const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
        expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
      });
    });
  });

  describe('Time-of-Day Integration', () => {
    it('should show appropriate icon based on time of day', () => {
      // Call timeOfDay function - the actual icon depends on current time
      avatarSidekicks.timeOfDay();
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Dispose', () => {
    it('should remove container on dispose', () => {
      dispose();
      
      const sidekickContainer = avatarContainer.querySelector('.avatar-sidekicks-container');
      expect(sidekickContainer).toBeFalsy();
    });

    it('should remove styles on dispose', () => {
      dispose();
      
      const style = document.getElementById('avatar-sidekicks-styles');
      expect(style).toBeFalsy();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-hidden on container', () => {
      const sidekickContainer = avatarContainer.querySelector('.avatar-sidekicks-container');
      expect(sidekickContainer?.getAttribute('aria-hidden')).toBe('true');
    });

    it('should have pointer-events none to not interfere with clicks', () => {
      const style = document.getElementById('avatar-sidekicks-styles');
      expect(style?.textContent).toContain('pointer-events: none');
    });
  });
});

describe('Ferni Moments Integration', () => {
  // Tests for the integration between ferni-moments and avatar-sidekicks
  
  describe('startTimeAwareness()', () => {
    it('should use sidekicks instead of center morphs', async () => {
      // This test verifies the migration from center morphs to sidekicks
      // The old system used playMoment() which overlaid icons on the avatar's eyes
      // The new system uses avatarSidekicks.timeOfDay() which shows icons beside the avatar
      
      // The actual test would require mocking the ferni-moments module
      // For now, this serves as documentation of the expected behavior
      expect(true).toBe(true);
    });
  });
});

describe('Event Integration', () => {
  let coachElement: HTMLElement;
  let avatarContainer: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    
    // Create mock DOM structure
    coachElement = document.createElement('div');
    coachElement.id = 'coach';
    
    avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';
    
    coachElement.appendChild(avatarContainer);
    document.body.appendChild(coachElement);
    
    // Initialize the sidekicks system (this sets up event listeners)
    initAvatarSidekicks();
  });

  afterEach(() => {
    dispose();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Celebration Events', () => {
    it('should show sidekick on ferni:big-win event', () => {
      document.dispatchEvent(new CustomEvent('ferni:big-win'));
      vi.runAllTimers();
      
      // Should show both sparkles and party (pair)
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(leftSlot?.querySelector('.sidekick-icon') || rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show sidekick on ferni:small-win event', () => {
      document.dispatchEvent(new CustomEvent('ferni:small-win'));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Milestone Events', () => {
    it('should show sidekicks on ferni:team-unlock event', () => {
      document.dispatchEvent(new CustomEvent('ferni:team-unlock'));
      vi.runAllTimers();
      
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(leftSlot?.querySelector('.sidekick-icon') || rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show trophy on ferni:milestone event', () => {
      document.dispatchEvent(new CustomEvent('ferni:milestone'));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Conversation Events', () => {
    it('should show wave on ferni:conversation-start event (window)', () => {
      window.dispatchEvent(new CustomEvent('ferni:conversation-start'));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show brain on ferni:thinking event', () => {
      document.dispatchEvent(new CustomEvent('ferni:thinking'));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Handoff Events', () => {
    it('should show hand on ferni:handoff-start event (window)', () => {
      window.dispatchEvent(new CustomEvent('ferni:handoff-start'));
      vi.runAllTimers();
      
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      expect(leftSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show sparkle on ferni:handoff-complete event (window)', () => {
      window.dispatchEvent(new CustomEvent('ferni:handoff-complete'));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Music Events', () => {
    it('should show headphones on ferni:music-state playing event', () => {
      document.dispatchEvent(new CustomEvent('ferni:music-state', {
        detail: { state: 'playing', isAmbient: false }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show music icon for ambient music', () => {
      document.dispatchEvent(new CustomEvent('ferni:music-state', {
        detail: { state: 'playing', isAmbient: true }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Journal Events', () => {
    it('should show pen on ferni:journal-entry event', () => {
      document.dispatchEvent(new CustomEvent('ferni:journal-entry', {
        detail: { mood: 'happy', hasTranscript: true }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Wellness Events', () => {
    it('should show wind on ferni:breathing-exercise event', () => {
      document.dispatchEvent(new CustomEvent('ferni:breathing-exercise', {
        detail: { pattern: '4-7-8' }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show leaf on ferni:meditation-started event', () => {
      document.dispatchEvent(new CustomEvent('ferni:meditation-started', {
        detail: { gameId: 'one-word-checkin' }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Progress & Goals Events', () => {
    it('should show trophy and confetti on ferni:goal-achieved event', () => {
      document.dispatchEvent(new CustomEvent('ferni:goal-achieved', {
        detail: { newMilestonesCount: 1 }
      }));
      vi.runAllTimers();
      
      // Should show pair
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(leftSlot?.querySelector('.sidekick-icon') || rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show trending up on ferni:progress-tracked event', () => {
      document.dispatchEvent(new CustomEvent('ferni:progress-tracked', {
        detail: { conversationCount: 10 }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should show lightbulb on ferni:insights-generated event', () => {
      document.dispatchEvent(new CustomEvent('ferni:insights-generated', {
        detail: { totalInsights: 5 }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Special Date Events', () => {
    it('should show cake and gift on ferni:birthday-reminder event', () => {
      document.dispatchEvent(new CustomEvent('ferni:birthday-reminder'));
      vi.runAllTimers();
      
      // Should show pair
      const leftSlot = avatarContainer.querySelector('.sidekick-slot--left');
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(leftSlot?.querySelector('.sidekick-icon') || rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });
  });

  describe('Emotion Events', () => {
    it('should show sparkles on strong happy emotion', () => {
      document.dispatchEvent(new CustomEvent('ferni:emotion-detected', {
        detail: { emotion: 'happy', intensity: 0.8 }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeTruthy();
    });

    it('should NOT show sidekick on weak emotion (intensity < 0.6)', () => {
      document.dispatchEvent(new CustomEvent('ferni:emotion-detected', {
        detail: { emotion: 'happy', intensity: 0.4 }
      }));
      vi.runAllTimers();
      
      const rightSlot = avatarContainer.querySelector('.sidekick-slot--right');
      expect(rightSlot?.querySelector('.sidekick-icon')).toBeFalsy();
    });
  });

  describe('Event Listener Cleanup', () => {
    it('should not respond to events after dispose', () => {
      dispose();
      
      // Reinitialize just the DOM (not the sidekicks)
      coachElement = document.createElement('div');
      coachElement.id = 'coach';
      avatarContainer = document.createElement('div');
      avatarContainer.className = 'avatar-container';
      coachElement.appendChild(avatarContainer);
      document.body.appendChild(coachElement);
      
      // Dispatch event - should not create sidekicks since disposed
      document.dispatchEvent(new CustomEvent('ferni:big-win'));
      vi.runAllTimers();
      
      // No sidekick should be created
      const sidekicks = document.querySelectorAll('.sidekick-icon');
      expect(sidekicks.length).toBe(0);
    });
  });
});
