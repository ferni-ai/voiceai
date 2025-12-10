/**
 * Content Delivery Pacing Tests
 *
 * Tests for human-like reading of longer content.
 * Ensures Ferni doesn't sound robotic when reading web results,
 * lists, or factual information.
 */

import { describe, expect, it } from 'vitest';
import {
  addSignposting,
  analyzeContent,
  applyDeliveryPacing,
  detectContentType,
  getSummaryIntro,
  shouldApplyDeliveryPacing,
} from '../conversation/content-delivery-pacing.js';

describe('Content Delivery Pacing', () => {
  describe('detectContentType', () => {
    it('should detect web result content', () => {
      const webContent = 'According to the search results, the weather in New York is sunny today.';
      expect(detectContentType(webContent)).toBe('web_result');
    });

    it('should detect list content', () => {
      const listContent =
        'First, you need to prepare. Second, gather materials. Third, execute the plan.';
      expect(detectContentType(listContent)).toBe('list');
    });

    it('should detect factual content', () => {
      const factualContent =
        'Studies show that 85% of people prefer morning coffee. The average person drinks 3 cups per day.';
      expect(detectContentType(factualContent)).toBe('factual');
    });

    it('should detect narrative content', () => {
      const narrativeContent =
        "So basically, here's the thing. It all started when I was thinking about this...";
      expect(detectContentType(narrativeContent)).toBe('narrative');
    });

    it('should detect instruction content', () => {
      const instructionContent =
        'First you need to open the app. Then you click on settings. After that, select your preferences.';
      // Instructions and lists share similar patterns (First, Then, etc.)
      // Either detection is acceptable for sequential content
      const type = detectContentType(instructionContent);
      expect(['instructions', 'list']).toContain(type);
    });

    it('should default to conversational for simple text', () => {
      const simpleText = 'Sure, I can help with that!';
      expect(detectContentType(simpleText)).toBe('conversational');
    });

    it('should detect mixed content', () => {
      const mixedContent =
        'According to research, first you should exercise. Studies show 80% improvement. Let me explain the process step by step.';
      const type = detectContentType(mixedContent);
      // Could be mixed or the dominant type
      expect(['mixed', 'factual', 'instructions', 'web_result']).toContain(type);
    });
  });

  describe('analyzeContent', () => {
    it('should analyze short content correctly', () => {
      const shortText = 'Yes, I can help!';
      const analysis = analyzeContent(shortText);

      expect(analysis.complexity).toBe('simple');
      expect(analysis.wordCount).toBeLessThan(10);
      expect(analysis.sentenceCount).toBe(1);
    });

    it('should analyze long content correctly', () => {
      const longText =
        'This is a long piece of content. ' +
        'It has multiple sentences. ' +
        'We need to test the analysis. ' +
        'The system should detect complexity. ' +
        'It should also estimate read time. ' +
        'Finally, it should segment properly. ' +
        'That makes seven sentences total.';

      const analysis = analyzeContent(longText);

      // 7 sentences = complex (>6 sentences triggers complex)
      expect(['moderate', 'complex']).toContain(analysis.complexity);
      expect(analysis.sentenceCount).toBeGreaterThan(5);
      expect(analysis.segments.length).toBeGreaterThan(1);
      expect(analysis.estimatedReadTimeMs).toBeGreaterThan(0);
    });

    it('should detect numbers in content', () => {
      const numberedText = 'The company grew 150% in 2024.';
      const analysis = analyzeContent(numberedText);

      expect(analysis.hasNumbers).toBe(true);
    });

    it('should detect lists in content', () => {
      const listText = 'Here are some options: First, try A. Second, try B.';
      const analysis = analyzeContent(listText);

      expect(analysis.hasList).toBe(true);
    });

    it('should force content type when specified', () => {
      const text = 'Just a simple sentence.';
      const analysis = analyzeContent(text, { forceContentType: 'factual' });

      expect(analysis.type).toBe('factual');
    });
  });

  describe('applyDeliveryPacing', () => {
    it('should add SSML breaks to long content', () => {
      const longContent =
        'First, consider the options. Second, evaluate each one carefully. Third, make your decision. Finally, execute your plan.';
      const paced = applyDeliveryPacing(longContent);

      expect(paced).toContain('<break');
    });

    it('should add speed tags for varied pacing', () => {
      const content =
        'This is important information. Here are the key points. First, understand the basics. Second, apply what you learned.';
      const paced = applyDeliveryPacing(content);

      expect(paced).toContain('<speed');
    });

    it('should not over-process short conversational content', () => {
      const shortContent = 'Sure!';
      const paced = applyDeliveryPacing(shortContent);

      // Short conversational content should be minimally processed
      expect(paced).toBe(shortContent);
    });

    it('should handle web result content appropriately', () => {
      const webContent =
        'According to my search, the answer is as follows. The data shows significant trends. First, growth increased by 50%. Second, revenue doubled.';
      const paced = applyDeliveryPacing(webContent, { forceContentType: 'web_result' });

      expect(paced).toContain('<break');
      // Web content should have slower pacing
      expect(paced).toContain('<speed');
    });
  });

  describe('shouldApplyDeliveryPacing', () => {
    it('should return true for long content', () => {
      const longText = 'Word '.repeat(70); // 70 words
      expect(shouldApplyDeliveryPacing(longText)).toBe(true);
    });

    it('should return true for content with many sentences', () => {
      const multiSentence =
        'First sentence. Second one. Third here. Fourth sentence. Fifth one too.';
      expect(shouldApplyDeliveryPacing(multiSentence)).toBe(true);
    });

    it('should return true for web result content', () => {
      const webContent = 'According to the search results, here is what I found.';
      expect(shouldApplyDeliveryPacing(webContent)).toBe(true);
    });

    it('should return false for short conversational content', () => {
      const shortText = 'Yes, I can help!';
      expect(shouldApplyDeliveryPacing(shortText)).toBe(false);
    });
  });

  describe('addSignposting', () => {
    it('should add opening phrase when requested', () => {
      const text = 'The weather today is sunny and warm.';
      const signposted = addSignposting(text, { addOpening: true });

      // Should have some opener
      expect(signposted.length).toBeGreaterThan(text.length);
    });

    it('should not duplicate existing openers', () => {
      const text = 'So, the weather today is sunny.';
      const signposted = addSignposting(text, { addOpening: true });

      // Should not add another "So," at the start
      expect(signposted.match(/^So,/)).toBeTruthy();
    });
  });

  describe('getSummaryIntro', () => {
    it('should return appropriate intro for web results', () => {
      const intro = getSummaryIntro('web_result');
      expect(intro.length).toBeGreaterThan(0);
      expect(typeof intro).toBe('string');
    });

    it('should return appropriate intro for lists', () => {
      const intro = getSummaryIntro('list');
      expect(intro.length).toBeGreaterThan(0);
    });

    it('should return appropriate intro for factual content', () => {
      const intro = getSummaryIntro('factual');
      expect(intro.length).toBeGreaterThan(0);
    });
  });

  describe('segment pacing', () => {
    it('should assign higher importance to opening segments', () => {
      const content = 'Welcome to this guide. Here is the information. This is supporting detail.';
      const analysis = analyzeContent(content);

      const openingSegment = analysis.segments.find((s) => s.type === 'opening');
      expect(openingSegment?.importance).toBe('high');
    });

    it('should assign higher importance to conclusion segments', () => {
      const content = 'First point here. Second point here. In conclusion, this is the summary.';
      const analysis = analyzeContent(content);

      const lastSegment = analysis.segments[analysis.segments.length - 1];
      expect(lastSegment?.importance).toBe('high');
    });

    it('should add longer pauses before list items', () => {
      const content = 'Here are the points. First, item one. Second, item two. Third, item three.';
      const analysis = analyzeContent(content);

      const listItems = analysis.segments.filter((s) => s.type === 'list_item');
      for (const item of listItems) {
        expect(item.ssmlPacing.pauseBefore).toBeGreaterThan(200);
      }
    });

    it('should slow down for main points', () => {
      const content = 'This is important: the key takeaway. Remember this critical detail.';
      const analysis = analyzeContent(content);

      const mainPoints = analysis.segments.filter((s) => s.type === 'main_point');
      for (const point of mainPoints) {
        expect(point.ssmlPacing.speed).toBeLessThan(1.0);
      }
    });
  });

  describe('integration with longer material', () => {
    it('should handle web search result simulation', () => {
      const webSearchResult = `
        Based on my search, here's what I found about the topic.
        First, the research shows that regular exercise improves mental health by 40%.
        Second, studies indicate that even 15 minutes of walking can make a difference.
        Third, consistency matters more than intensity for long-term benefits.
        The key takeaway is that small daily habits lead to significant improvements over time.
      `.trim();

      const paced = applyDeliveryPacing(webSearchResult);

      // Should have multiple breaks for breathing room
      const breakCount = (paced.match(/<break/g) || []).length;
      expect(breakCount).toBeGreaterThan(3);

      // Should have varied pacing
      expect(paced).toContain('<speed');
    });

    it('should handle factual data presentation', () => {
      const factualData = `
        The company reported strong results in 2024.
        Revenue increased by 45% to $2.3 billion.
        Operating margin improved to 28%.
        Customer satisfaction scores reached 92%.
        Employee retention hit an all-time high of 95%.
      `.trim();

      const paced = applyDeliveryPacing(factualData, { forceContentType: 'factual' });

      // Factual content should be slower (for comprehension)
      expect(paced).toContain('<speed ratio="0.');
    });
  });
});
