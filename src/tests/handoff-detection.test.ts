/**
 * Handoff Detection Tests
 *
 * Tests for detecting when users want to talk to different team members
 * based on wake words and topic triggers.
 */

import { describe, it, expect } from 'vitest';

import {
  shouldHandoffToPeter,
  shouldHandoffToNayan,
  shouldHandoffToAlex,
  shouldHandoffToMaya,
  shouldHandoffToJordan,
  shouldHandoffToFerni,
} from '../tools/handoff/detection.js';

// ============================================================================
// PETER (Investment & Research) TESTS
// ============================================================================

describe('shouldHandoffToPeter', () => {
  describe('wake words', () => {
    it('should detect "hey peter" wake word', () => {
      expect(shouldHandoffToPeter('Hey Peter, I need help')).toBe(true);
      expect(shouldHandoffToPeter('hey peter')).toBe(true);
      expect(shouldHandoffToPeter('Hey Peter!')).toBe(true);
    });

    it('should detect other Peter wake words', () => {
      expect(shouldHandoffToPeter('Hi Peter')).toBe(true);
      expect(shouldHandoffToPeter('Hello Peter')).toBe(true);
      expect(shouldHandoffToPeter('Talk to Peter please')).toBe(true);
      expect(shouldHandoffToPeter('Can you get Peter?')).toBe(true);
    });
  });

  describe('topic triggers', () => {
    it('should detect stock picking topics', () => {
      expect(shouldHandoffToPeter('I want to pick stocks')).toBe(true);
      expect(shouldHandoffToPeter('help me with stock picking')).toBe(true);
      expect(shouldHandoffToPeter('which stock should I buy?')).toBe(true);
      expect(shouldHandoffToPeter('what stock should I invest in')).toBe(true);
    });

    it('should detect growth and value investing topics', () => {
      expect(shouldHandoffToPeter('find me growth stocks')).toBe(true);
      expect(shouldHandoffToPeter('looking for undervalued companies')).toBe(true);
      expect(shouldHandoffToPeter('I want to beat the market')).toBe(true);
      expect(shouldHandoffToPeter('how to outperform the index')).toBe(true);
    });

    it('should detect "ten bagger" variations', () => {
      expect(shouldHandoffToPeter('find me a ten bagger')).toBe(true);
      expect(shouldHandoffToPeter('looking for tenbagger stocks')).toBe(true);
      expect(shouldHandoffToPeter('want a 10 bagger')).toBe(true);
    });

    it('should detect "next big thing" topics', () => {
      expect(shouldHandoffToPeter('what is the next amazon?')).toBe(true);
      expect(shouldHandoffToPeter('find me the next apple')).toBe(true);
      expect(shouldHandoffToPeter('which company is the next google')).toBe(true);
    });

    it('should detect active investing topics', () => {
      expect(shouldHandoffToPeter('active investing strategy')).toBe(true);
      expect(shouldHandoffToPeter('got any hot stock tips?')).toBe(true);
      expect(shouldHandoffToPeter('give me stock tips')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('should handle mixed case input', () => {
      expect(shouldHandoffToPeter('HEY PETER')).toBe(true);
      expect(shouldHandoffToPeter('Pick Stocks')).toBe(true);
      expect(shouldHandoffToPeter('GROWTH STOCKS')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for unrelated topics', () => {
      expect(shouldHandoffToPeter('check my budget')).toBe(false);
      expect(shouldHandoffToPeter('schedule a meeting')).toBe(false);
      expect(shouldHandoffToPeter('plan my vacation')).toBe(false);
      expect(shouldHandoffToPeter("what's the weather")).toBe(false);
    });
  });
});

// ============================================================================
// NAYAN (Sage & Wisdom Guide) TESTS
// ============================================================================

describe('shouldHandoffToNayan', () => {
  describe('wake words', () => {
    it('should detect "hey nayan" wake word', () => {
      expect(shouldHandoffToNayan('Hey Nayan')).toBe(true);
      expect(shouldHandoffToNayan('hi nayan')).toBe(true);
      expect(shouldHandoffToNayan('Hello Nayan!')).toBe(true);
    });

    it('should detect Sadhguru wake words', () => {
      expect(shouldHandoffToNayan('hey sadhguru')).toBe(true);
      expect(shouldHandoffToNayan('hi sadhguru')).toBe(true);
      expect(shouldHandoffToNayan('hello sadhguru')).toBe(true);
    });

    it('should detect direct requests', () => {
      expect(shouldHandoffToNayan('talk to nayan')).toBe(true);
      expect(shouldHandoffToNayan('talk to sadhguru')).toBe(true);
      expect(shouldHandoffToNayan('get nayan please')).toBe(true);
    });
  });

  describe('topic triggers', () => {
    it('should detect spiritual and philosophical topics', () => {
      expect(shouldHandoffToNayan('what is the meaning of life?')).toBe(true);
      expect(shouldHandoffToNayan('I need spiritual guidance')).toBe(true);
      expect(shouldHandoffToNayan('help me with meditation')).toBe(true);
      expect(shouldHandoffToNayan('seeking inner peace')).toBe(true);
    });

    it('should detect consciousness and wisdom topics', () => {
      expect(shouldHandoffToNayan('expand my consciousness')).toBe(true);
      expect(shouldHandoffToNayan('share some wisdom with me')).toBe(true);
      expect(shouldHandoffToNayan("what's my life philosophy")).toBe(true);
      expect(shouldHandoffToNayan('practice mindfulness')).toBe(true);
    });

    it('should detect deeper meaning topics', () => {
      expect(shouldHandoffToNayan("what is my life's purpose?")).toBe(true);
      expect(shouldHandoffToNayan('path to enlightenment')).toBe(true);
      expect(shouldHandoffToNayan('find deeper meaning')).toBe(true);
      expect(shouldHandoffToNayan('journey of the soul')).toBe(true);
      expect(shouldHandoffToNayan('inner journey')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for unrelated topics', () => {
      expect(shouldHandoffToNayan('check my stocks')).toBe(false);
      expect(shouldHandoffToNayan('send an email')).toBe(false);
      expect(shouldHandoffToNayan('track my budget')).toBe(false);
    });
  });
});

// ============================================================================
// ALEX (Communication) TESTS
// ============================================================================

describe('shouldHandoffToAlex', () => {
  describe('wake words', () => {
    it('should detect "hey alex" wake word', () => {
      expect(shouldHandoffToAlex('Hey Alex')).toBe(true);
      expect(shouldHandoffToAlex('hi alex')).toBe(true);
      expect(shouldHandoffToAlex('Hello Alex!')).toBe(true);
    });

    it('should detect direct requests', () => {
      expect(shouldHandoffToAlex('talk to alex')).toBe(true);
      expect(shouldHandoffToAlex('get alex please')).toBe(true);
      expect(shouldHandoffToAlex('alex can help me')).toBe(true);
    });
  });

  describe('email triggers', () => {
    it('should detect email composition requests', () => {
      expect(shouldHandoffToAlex('send an email to John')).toBe(true);
      expect(shouldHandoffToAlex('write an email')).toBe(true);
      expect(shouldHandoffToAlex('draft email to my boss')).toBe(true);
      expect(shouldHandoffToAlex('email to the team')).toBe(true);
      expect(shouldHandoffToAlex('compose email')).toBe(true);
      expect(shouldHandoffToAlex('email someone for me')).toBe(true);
      expect(shouldHandoffToAlex('send a message')).toBe(true);
    });
  });

  describe('calendar triggers', () => {
    it('should detect scheduling requests', () => {
      expect(shouldHandoffToAlex('schedule a meeting')).toBe(true);
      expect(shouldHandoffToAlex('check my calendar')).toBe(true);
      expect(shouldHandoffToAlex('appointment tomorrow')).toBe(true);
      expect(shouldHandoffToAlex('book a consultation')).toBe(true);
      expect(shouldHandoffToAlex('set up a call')).toBe(true);
      expect(shouldHandoffToAlex('find time to meet')).toBe(true);
      expect(shouldHandoffToAlex("what's my availability")).toBe(true);
    });
  });

  describe('call triggers', () => {
    it('should detect phone call requests', () => {
      expect(shouldHandoffToAlex('make a call to mom')).toBe(true);
      expect(shouldHandoffToAlex('phone call to the office')).toBe(true);
      expect(shouldHandoffToAlex('call someone for me')).toBe(true);
      expect(shouldHandoffToAlex('reach out to the client')).toBe(true);
      expect(shouldHandoffToAlex('get in touch with Sarah')).toBe(true);
      expect(shouldHandoffToAlex('contact the support team')).toBe(true);
    });
  });

  describe('text/SMS triggers', () => {
    it('should detect text message requests', () => {
      expect(shouldHandoffToAlex('send a text to John')).toBe(true);
      expect(shouldHandoffToAlex('text message please')).toBe(true);
      expect(shouldHandoffToAlex('sms my friend')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for unrelated topics', () => {
      expect(shouldHandoffToAlex('pick me some stocks')).toBe(false);
      expect(shouldHandoffToAlex('track my spending')).toBe(false);
      expect(shouldHandoffToAlex('plan my wedding')).toBe(false);
    });
  });
});

// ============================================================================
// MAYA (Spend & Save) TESTS
// ============================================================================

describe('shouldHandoffToMaya', () => {
  describe('wake words', () => {
    it('should detect "hey maya" wake word', () => {
      expect(shouldHandoffToMaya('Hey Maya')).toBe(true);
      expect(shouldHandoffToMaya('hi maya')).toBe(true);
      expect(shouldHandoffToMaya('Hello Maya!')).toBe(true);
    });

    it('should detect direct requests', () => {
      expect(shouldHandoffToMaya('talk to maya')).toBe(true);
      expect(shouldHandoffToMaya('get maya please')).toBe(true);
      expect(shouldHandoffToMaya('maya can help')).toBe(true);
    });
  });

  describe('budget triggers', () => {
    it('should detect budget-related requests', () => {
      expect(shouldHandoffToMaya('help with my budget')).toBe(true);
      expect(shouldHandoffToMaya('track my spending')).toBe(true);
      expect(shouldHandoffToMaya('how much can I spend this month?')).toBe(true);
      expect(shouldHandoffToMaya("I'm overspending")).toBe(true);
      expect(shouldHandoffToMaya('track expenses please')).toBe(true);
      expect(shouldHandoffToMaya('expense tracking')).toBe(true);
    });
  });

  describe('savings triggers', () => {
    it('should detect savings-related requests', () => {
      expect(shouldHandoffToMaya('help me with saving')).toBe(true);
      expect(shouldHandoffToMaya('save money for vacation')).toBe(true);
      expect(shouldHandoffToMaya('set up a savings goal')).toBe(true);
      expect(shouldHandoffToMaya('build my emergency fund')).toBe(true);
      expect(shouldHandoffToMaya('put away some money')).toBe(true);
      expect(shouldHandoffToMaya('set aside for later')).toBe(true);
    });
  });

  describe('subscription triggers', () => {
    it('should detect subscription-related requests', () => {
      expect(shouldHandoffToMaya('review my subscriptions')).toBe(true);
      expect(shouldHandoffToMaya('recurring charges')).toBe(true);
      expect(shouldHandoffToMaya('cancel subscription')).toBe(true);
      expect(shouldHandoffToMaya('monthly charges I forgot about')).toBe(true);
      expect(shouldHandoffToMaya('what am I paying for?')).toBe(true);
    });
  });

  describe('money management triggers', () => {
    it('should detect general money management requests', () => {
      expect(shouldHandoffToMaya('help with 50/30/20 budget')).toBe(true);
      expect(shouldHandoffToMaya('fix my spending leaks')).toBe(true);
      expect(shouldHandoffToMaya('where is my money going?')).toBe(true);
      expect(shouldHandoffToMaya('need to cut costs')).toBe(true);
      expect(shouldHandoffToMaya('reduce spending')).toBe(true);
      expect(shouldHandoffToMaya('how to save more')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for unrelated topics', () => {
      expect(shouldHandoffToMaya('pick stocks for me')).toBe(false);
      expect(shouldHandoffToMaya('schedule a meeting')).toBe(false);
      expect(shouldHandoffToMaya('plan my wedding')).toBe(false);
    });
  });
});

// ============================================================================
// JORDAN (Life's Firsts & Planning) TESTS
// ============================================================================

describe('shouldHandoffToJordan', () => {
  describe('wake words', () => {
    it('should detect "hey jordan" wake word', () => {
      expect(shouldHandoffToJordan('Hey Jordan')).toBe(true);
      expect(shouldHandoffToJordan('hi jordan')).toBe(true);
      expect(shouldHandoffToJordan('Hello Jordan!')).toBe(true);
    });

    it('should detect direct requests', () => {
      expect(shouldHandoffToJordan('talk to jordan')).toBe(true);
      expect(shouldHandoffToJordan('get jordan please')).toBe(true);
      expect(shouldHandoffToJordan('jordan can help')).toBe(true);
    });
  });

  describe('first home triggers', () => {
    it('should detect first home requests', () => {
      expect(shouldHandoffToJordan('planning my first home')).toBe(true);
      expect(shouldHandoffToJordan('buying a house')).toBe(true);
      expect(shouldHandoffToJordan('new house checklist')).toBe(true);
      expect(shouldHandoffToJordan('housewarming party')).toBe(true);
      expect(shouldHandoffToJordan("we're moving next month")).toBe(true);
      expect(shouldHandoffToJordan('closing on our house')).toBe(true);
      expect(shouldHandoffToJordan('home buying process')).toBe(true);
    });
  });

  describe('first baby triggers', () => {
    it('should detect first baby requests', () => {
      expect(shouldHandoffToJordan('preparing for first baby')).toBe(true);
      expect(shouldHandoffToJordan("we're expecting!")).toBe(true);
      expect(shouldHandoffToJordan("I'm pregnant")).toBe(true);
      expect(shouldHandoffToJordan('planning a baby shower')).toBe(true);
      expect(shouldHandoffToJordan('setting up the nursery')).toBe(true);
      expect(shouldHandoffToJordan('hospital bag checklist')).toBe(true);
      expect(shouldHandoffToJordan('due date planning')).toBe(true);
    });
  });

  describe('wedding triggers', () => {
    it('should detect wedding requests', () => {
      expect(shouldHandoffToJordan('planning our wedding')).toBe(true);
      expect(shouldHandoffToJordan("we're getting married")).toBe(true);
      expect(shouldHandoffToJordan('engagement party')).toBe(true);
      expect(shouldHandoffToJordan('just got engaged!')).toBe(true);
      expect(shouldHandoffToJordan('bridal shower planning')).toBe(true);
      expect(shouldHandoffToJordan('bachelorette weekend')).toBe(true);
      expect(shouldHandoffToJordan('honeymoon ideas')).toBe(true);
    });
  });

  describe('graduation triggers', () => {
    it('should detect graduation requests', () => {
      expect(shouldHandoffToJordan('graduation party')).toBe(true);
      expect(shouldHandoffToJordan("I'm graduating soon")).toBe(true);
      expect(shouldHandoffToJordan('grad party planning')).toBe(true);
      expect(shouldHandoffToJordan('college send-off')).toBe(true);
      expect(shouldHandoffToJordan('going to college next fall')).toBe(true);
      expect(shouldHandoffToJordan('dorm essentials')).toBe(true);
    });
  });

  describe('milestone birthday triggers', () => {
    it('should detect milestone birthday requests', () => {
      expect(shouldHandoffToJordan('milestone birthday party')).toBe(true);
      expect(shouldHandoffToJordan('sweet sixteen planning')).toBe(true);
      expect(shouldHandoffToJordan('21st birthday bash')).toBe(true);
      expect(shouldHandoffToJordan('30th birthday party')).toBe(true);
      expect(shouldHandoffToJordan('big birthday coming up')).toBe(true);
      expect(shouldHandoffToJordan("I'm turning 40")).toBe(true);
      expect(shouldHandoffToJordan('turning 50 next month')).toBe(true);
    });
  });

  describe('retirement triggers', () => {
    it('should detect retirement requests', () => {
      expect(shouldHandoffToJordan('retirement party planning')).toBe(true);
      expect(shouldHandoffToJordan("I'm retiring soon")).toBe(true);
      expect(shouldHandoffToJordan('retirement plan')).toBe(true);
      expect(shouldHandoffToJordan('when can I retire?')).toBe(true);
      expect(shouldHandoffToJordan("what's my retirement vision")).toBe(true);
      expect(shouldHandoffToJordan('early retirement goals')).toBe(true);
      expect(shouldHandoffToJordan('fire movement planning')).toBe(true);
      expect(shouldHandoffToJordan('financial independence')).toBe(true);
      expect(shouldHandoffToJordan('retire early')).toBe(true);
    });
  });

  describe('cultural celebration triggers', () => {
    it('should detect cultural celebration requests', () => {
      expect(shouldHandoffToJordan('planning a quinceanera')).toBe(true);
      expect(shouldHandoffToJordan('quinceañera planning')).toBe(true);
      expect(shouldHandoffToJordan('bar mitzvah prep')).toBe(true);
      expect(shouldHandoffToJordan('bat mitzvah party')).toBe(true);
      expect(shouldHandoffToJordan('first communion celebration')).toBe(true);
      expect(shouldHandoffToJordan('confirmation party')).toBe(true);
    });
  });

  describe('travel and vacation triggers', () => {
    it('should detect travel requests', () => {
      expect(shouldHandoffToJordan('planning a vacation')).toBe(true);
      expect(shouldHandoffToJordan('travel plans')).toBe(true);
      expect(shouldHandoffToJordan('trip to Europe')).toBe(true);
      expect(shouldHandoffToJordan('holiday getaway')).toBe(true);
      expect(shouldHandoffToJordan('book a flight')).toBe(true);
      expect(shouldHandoffToJordan('plan a trip')).toBe(true);
      expect(shouldHandoffToJordan('road trip ideas')).toBe(true);
      expect(shouldHandoffToJordan('cruise vacation')).toBe(true);
    });
  });

  describe('goal management triggers', () => {
    it('should detect goal management requests', () => {
      expect(shouldHandoffToJordan('set a goal for me')).toBe(true);
      expect(shouldHandoffToJordan('my life goals')).toBe(true);
      expect(shouldHandoffToJordan('goal setting help')).toBe(true);
      expect(shouldHandoffToJordan('track my goal progress')).toBe(true);
      expect(shouldHandoffToJordan('bucket list planning')).toBe(true);
      expect(shouldHandoffToJordan('life portfolio review')).toBe(true);
      expect(shouldHandoffToJordan('work life balance tips')).toBe(true);
    });
  });

  describe('major purchase triggers', () => {
    it('should detect major purchase requests', () => {
      expect(shouldHandoffToJordan('big purchase coming up')).toBe(true);
      expect(shouldHandoffToJordan('buying a car')).toBe(true);
      expect(shouldHandoffToJordan('new car shopping')).toBe(true);
      expect(shouldHandoffToJordan('first car advice')).toBe(true);
    });
  });

  describe('annual planning triggers', () => {
    it('should detect annual planning requests', () => {
      expect(shouldHandoffToJordan('annual plan review')).toBe(true);
      expect(shouldHandoffToJordan('yearly planning session')).toBe(true);
      expect(shouldHandoffToJordan('plan for the year ahead')).toBe(true);
      expect(shouldHandoffToJordan('new year goals')).toBe(true);
      expect(shouldHandoffToJordan('quarterly review')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for unrelated topics', () => {
      expect(shouldHandoffToJordan('pick stocks')).toBe(false);
      expect(shouldHandoffToJordan('send an email')).toBe(false);
      expect(shouldHandoffToJordan('track my spending')).toBe(false);
    });
  });
});

// ============================================================================
// FERNI (Main Coach) TESTS
// ============================================================================

describe('shouldHandoffToFerni', () => {
  describe('wake words', () => {
    it('should detect "hey ferni" wake word', () => {
      expect(shouldHandoffToFerni('Hey Ferni')).toBe(true);
      expect(shouldHandoffToFerni('hi ferni')).toBe(true);
      expect(shouldHandoffToFerni('Hello Ferni!')).toBe(true);
    });

    it('should detect direct requests', () => {
      expect(shouldHandoffToFerni('talk to ferni')).toBe(true);
      expect(shouldHandoffToFerni('get ferni please')).toBe(true);
      expect(shouldHandoffToFerni('back to ferni')).toBe(true);
      expect(shouldHandoffToFerni('return to ferni')).toBe(true);
    });
  });

  describe('return triggers', () => {
    it('should detect return to main menu requests', () => {
      expect(shouldHandoffToFerni('take me to the coach')).toBe(true);
      expect(shouldHandoffToFerni('go back please')).toBe(true);
      expect(shouldHandoffToFerni('main menu')).toBe(true);
    });

    it('should detect session end requests', () => {
      expect(shouldHandoffToFerni("I'm done here")).toBe(true);
      expect(shouldHandoffToFerni("thanks, that's all I needed")).toBe(true);
      expect(shouldHandoffToFerni('that will be all, thanks')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not trigger for team member specific requests', () => {
      expect(shouldHandoffToFerni('hey peter')).toBe(false);
      expect(shouldHandoffToFerni('talk to alex')).toBe(false);
      expect(shouldHandoffToFerni('get maya')).toBe(false);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Handoff Detection Integration', () => {
  it('should only match one team member for specific wake words', () => {
    const input = 'hey peter';
    expect(shouldHandoffToPeter(input)).toBe(true);
    expect(shouldHandoffToNayan(input)).toBe(false);
    expect(shouldHandoffToAlex(input)).toBe(false);
    expect(shouldHandoffToMaya(input)).toBe(false);
    expect(shouldHandoffToJordan(input)).toBe(false);
    expect(shouldHandoffToFerni(input)).toBe(false);
  });

  it('should handle complex sentences with embedded triggers', () => {
    expect(shouldHandoffToAlex('I need to schedule a meeting with my team')).toBe(true);
    expect(shouldHandoffToMaya('Can you help me track my spending this month?')).toBe(true);
    expect(shouldHandoffToJordan("We're buying a house and need help planning")).toBe(true);
    expect(shouldHandoffToPeter('I want to find undervalued growth stocks')).toBe(true);
  });

  it('should handle uppercase input', () => {
    expect(shouldHandoffToPeter('HEY PETER')).toBe(true);
    expect(shouldHandoffToMaya('TRACK MY SPENDING')).toBe(true);
    expect(shouldHandoffToAlex('SEND AN EMAIL')).toBe(true);
  });

  it('should not match empty or whitespace input', () => {
    expect(shouldHandoffToPeter('')).toBe(false);
    expect(shouldHandoffToMaya('   ')).toBe(false);
    expect(shouldHandoffToAlex('\n\t')).toBe(false);
  });
});
