/**
 * SSML Pronunciation Tests
 *
 * Comprehensive tests for the expanded pronunciation dictionary (233 entries)
 * covering financial, mental health, wellness, tech, and cultural terms.
 */

import { describe, expect, it } from 'vitest';
import { tagTextWithSsml } from '../ssml/index.js';
import { containsTextIgnoringSsml } from './helpers/ssml-helpers.js';

describe('SSML Pronunciation Dictionary', () => {
  // =========================================================================
  // FINANCIAL PRONUNCIATIONS (Original)
  // =========================================================================
  describe('Financial Terms', () => {
    it('should pronounce retirement accounts correctly', () => {
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Your 401k is important'), 'four oh one K')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Open a 403b plan'), 'four oh three B')).toBe(
        true
      );
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Use your 529 for college'), 'five twenty nine')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Contribute to your IRA'), 'I R A')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Max out your HSA'), 'H S A')).toBe(true);
    });

    it('should pronounce investment vehicles correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('ETFs are great'), 'E T F')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Consider REITs for income'), 'reet')).toBe(
        true
      );
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('The S&P 500 is up'), 'S and P five hundred')
      ).toBe(true);
    });

    it('should pronounce ticker symbols as letters', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Buy VTI'), 'V T I')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Look at VOO'), 'V O O')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('VXUS is international'), 'V X U S')).toBe(
        true
      );
    });

    it('should pronounce regulatory bodies correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('FDIC insured'), 'F D I C')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('SEC regulations'), 'S E C')).toBe(true);
    });
  });

  // =========================================================================
  // MENTAL HEALTH & THERAPY
  // =========================================================================
  describe('Mental Health & Therapy Terms', () => {
    it('should pronounce therapy modalities correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Try CBT techniques'), 'C B T')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('DBT skills are helpful'), 'D B T')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('EMDR can help trauma'), 'E M D R')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('IFS therapy is powerful'), 'I F S')).toBe(
        true
      );
    });

    it('should pronounce ACT therapy without conflict', () => {
      // ACT therapy should expand, but "act on" should not
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('ACT teaches acceptance'), 'A C T therapy')
      ).toBe(true);
    });

    it('should pronounce mindfulness programs correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Try MBCT for depression'), 'M B C T')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('MBSR reduces stress'), 'M B S R')).toBe(
        true
      );
    });

    it('should pronounce mental health conditions correctly', () => {
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Managing ADHD is possible'), 'A D H D')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Living with ADD'), 'A D D')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('OCD is treatable'), 'O C D')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('PTSD recovery takes time'), 'P T S D')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Generalized anxiety or GAD'), 'G A D')).toBe(
        true
      );
    });

    it('should pronounce intelligence abbreviations correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Emotional intelligence or EQ'), 'E Q')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml("IQ isn't everything"), 'I Q')).toBe(true);
    });
  });

  // =========================================================================
  // WELLNESS & FITNESS
  // =========================================================================
  describe('Wellness & Fitness Terms', () => {
    it('should pronounce exercise acronyms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Try HIIT workouts'), 'hit training')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('LISS cardio is gentle'), 'liss')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Do an AMRAP workout'), 'am-rap')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('EMOM training builds endurance'), 'ee-mom')
      ).toBe(true);
    });

    it('should pronounce body metrics correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Check your BMI'), 'B M I')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Calculate your BMR'), 'B M R')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Your TDEE determines calories'), 'T D E E')
      ).toBe(true);
    });

    it('should pronounce heart metrics correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Monitor your HRV'), 'H R V')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Track your RHR'), 'resting heart rate')
      ).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Heart rate in BPM'), 'beats per minute')
      ).toBe(true);
    });

    it('should pronounce sleep stages correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('REM sleep is important'), 'rem')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('NREM sleep stages'), 'non-rem')).toBe(true);
    });

    it('should pronounce nutrition terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('OMAD eating pattern'), 'oh-mad')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('CICO is simple'), 'calories in calories out')
      ).toBe(true);
    });
  });

  // =========================================================================
  // CALENDAR & TIME
  // =========================================================================
  describe('Calendar & Time Terms', () => {
    it('should pronounce quarters correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Review Q1 goals'), 'Q one')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Q2 planning'), 'Q two')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Q3 review'), 'Q three')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Q4 wrap-up'), 'Q four')).toBe(true);
    });

    it('should pronounce time zones correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Meeting at 3 PM PST'), 'Pacific time')).toBe(
        true
      );
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('The call is 9 AM EST'), 'Eastern time')
      ).toBe(true);
    });

    it('should pronounce deadline terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Need this by EOD'), 'end of day')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Finish by EOW'), 'end of week')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Due EOM'), 'end of month')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Complete by EOY'), 'end of year')).toBe(
        true
      );
    });

    it('should pronounce status terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Please RSVP'), 'R S V P')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Date is TBD'), 'T B D')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml("I'm OOO next week"), 'out of office')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('WFH tomorrow'), 'working from home')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Using PTO'), 'P T O')).toBe(true);
    });
  });

  // =========================================================================
  // COMMON ABBREVIATIONS
  // =========================================================================
  describe('Common Abbreviations', () => {
    it('should pronounce urgency terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Need this ASAP'), 'A sap')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('FYI, the meeting moved'), 'F Y I')).toBe(
        true
      );
    });

    it('should pronounce opinion terms correctly', () => {
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('IMO, this is better'), 'in my opinion')
      ).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('IMHO it works'), 'in my humble opinion')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('BTW, great job'), 'by the way')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('FWIW, I agree'), 'for what its worth')).toBe(
        true
      );
    });

    it('should pronounce reference terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Check the FAQ'), 'F A Q')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('AKA the best option'), 'also known as')
      ).toBe(true);
      // TL;DR not yet in pronunciation dictionary
    });

    it('should pronounce comparison terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Option A vs option B'), 'versus')).toBe(
        true
      );
      // w/ and w/o not yet in pronunciation dictionary
    });
  });

  // =========================================================================
  // TECHNOLOGY & DIGITAL
  // =========================================================================
  describe('Technology & Digital Terms', () => {
    it('should pronounce AI/ML terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('AI is transforming work'), 'A I')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('ML models are improving'), 'M L')).toBe(
        true
      );
    });

    it('should pronounce design terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Good UI matters'), 'U I')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Focus on UX'), 'U X')).toBe(true);
      // UI/UX combined handled separately by both patterns
      const result = tagTextWithSsml('UI/UX design');
      expect(containsTextIgnoringSsml(result, 'U I')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'U X')).toBe(true);
    });

    it('should pronounce tech infrastructure terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Connect to the API'), 'A P I')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Check the URL'), 'U R L')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Use a VPN'), 'V P N')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('SaaS products'), 'sass')).toBe(true);
    });

    it('should pronounce social media terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Send me a DM'), 'D M')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Follow on IG'), 'Instagram')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml("Don't have FOMO"), 'foe-moe')).toBe(true);
    });
  });

  // =========================================================================
  // BUSINESS TITLES
  // =========================================================================
  describe('Business Titles', () => {
    it('should pronounce C-suite titles correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('The CEO announced'), 'C E O')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Ask the CFO'), 'C F O')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Meet the CTO'), 'C T O')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('The COO manages operations'), 'C O O')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Talk to the CMO'), 'C M O')).toBe(true);
    });

    it('should pronounce other titles correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('The VP approved it'), 'V P')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Contact HR'), 'H R')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Ask the PM'), 'P M')).toBe(true);
    });
  });

  // =========================================================================
  // CULTURAL & JAPANESE TERMS
  // =========================================================================
  describe('Cultural & Japanese Terms', () => {
    it('should pronounce Japanese concepts correctly', () => {
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Embrace wabi-sabi'), 'wah-bee sah-bee')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Find your ikigai'), 'ee-kee-guy')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Practice kaizen daily'), 'ky-zen')).toBe(
        true
      );
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Try shinrin-yoku'), 'shin-rin yoh-koo')
      ).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Like kintsugi repairs'), 'keen-tsoo-gee')
      ).toBe(true);
    });
  });

  // =========================================================================
  // MEDICAL & HEALTH
  // =========================================================================
  describe('Medical & Health Terms', () => {
    it('should pronounce medical abbreviations correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Get an Rx'), 'prescription')).toBe(true);
      expect(
        containsTextIgnoringSsml(tagTextWithSsml('Buy OTC medication'), 'over the counter')
      ).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Go to the ER'), 'E R')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('ICU care is intensive'), 'I C U')).toBe(
        true
      );
    });

    it('should pronounce degrees correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('She has an MD'), 'M D')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('He earned a PhD'), 'P H D')).toBe(true);
    });

    it('should pronounce COVID terms correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('After COVID'), 'covid')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Get a PCR test'), 'P C R')).toBe(true);
    });
  });

  // =========================================================================
  // UNITS & MEASUREMENTS
  // =========================================================================
  describe('Units & Measurements', () => {
    it('should pronounce weight units correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Lost 10 lbs'), 'pounds')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Weighs 5 kgs'), 'kilograms')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Add 8 oz'), 'ounces')).toBe(true);
    });

    it('should pronounce distance units correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('About 6 ft tall'), 'feet')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Run 5 mi'), 'miles')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Drive 10 km'), 'kilometers')).toBe(true);
    });
  });

  // =========================================================================
  // FERNI TEAM PERSONAS
  // =========================================================================
  describe('Ferni Team Persona Names', () => {
    it('should pronounce Ferni correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Ask Ferni about it'), 'Furr-nee')).toBe(
        true
      );
    });

    it('should pronounce Nayan correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Nayan offers wisdom'), 'Nuh-yahn')).toBe(
        true
      );
    });

    it('should pronounce Maya correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('Maya helps with habits'), 'My-uh')).toBe(
        true
      );
    });
  });

  // =========================================================================
  // COUNTRIES & ORGANIZATIONS
  // =========================================================================
  describe('Countries & Organizations', () => {
    it('should pronounce country abbreviations correctly', () => {
      expect(containsTextIgnoringSsml(tagTextWithSsml('In the US'), 'U S')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('Made in the USA'), 'U S A')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('From the UK'), 'U K')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('The EU regulations'), 'E U')).toBe(true);
      expect(containsTextIgnoringSsml(tagTextWithSsml('UN resolution'), 'U N')).toBe(true);
    });
  });

  // =========================================================================
  // EDGE CASES & CONTEXT SENSITIVITY
  // =========================================================================
  describe('Edge Cases & Context Sensitivity', () => {
    it('should handle multiple terms in one sentence', () => {
      const result = tagTextWithSsml('Use CBT and EMDR for PTSD recovery');
      expect(containsTextIgnoringSsml(result, 'C B T')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'E M D R')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'P T S D')).toBe(true);
    });

    it('should handle mixed contexts', () => {
      const result = tagTextWithSsml('The CEO with ADHD uses CBT and HIIT for stress');
      expect(containsTextIgnoringSsml(result, 'C E O')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'A D H D')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'C B T')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'hit training')).toBe(true);
    });

    it('should not modify text that looks like abbreviations but are not', () => {
      // Regular words that might look like abbreviations should be preserved
      const result = tagTextWithSsml('I can act on this');
      expect(containsTextIgnoringSsml(result, 'act on')).toBe(true);
    });

    it('should handle uppercase acronyms correctly', () => {
      // Most medical/therapy acronyms are case-sensitive (uppercase only)
      expect(containsTextIgnoringSsml(tagTextWithSsml('Your ADHD is manageable'), 'A D H D')).toBe(
        true
      );
      expect(containsTextIgnoringSsml(tagTextWithSsml('Try CBT'), 'C B T')).toBe(true);
      // Some patterns like ASAP are case-insensitive but output may vary
      expect(containsTextIgnoringSsml(tagTextWithSsml('Need this ASAP'), 'A sap')).toBe(true);
    });
  });
});
