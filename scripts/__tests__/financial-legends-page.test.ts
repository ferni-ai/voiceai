/**
 * The Financial Legends landing page lists only the legends still in the
 * product. Tom, the stock-picking legend, was retired on 2026-11-08; the page's
 * head (title, description, social cards) once still named him after his
 * advisor card was gone.
 */
import { describe, expect, it } from 'vitest';
import { generateMultiAdvisorPage } from '../../src/services/page-generator/index.js';
import { FINANCIAL_LEGENDS_PAGE } from '../financial-legends-page.js';

const TOM = /\bTom\b|Brannigan|peter-lynch|stock[- ]pick|three/i;

describe('the Financial Legends landing page', () => {
  it('has only Henry and Nate as advisors', () => {
    expect(FINANCIAL_LEGENDS_PAGE.advisors.map((a) => a.id)).toEqual([
      'john-bogle',
      'joel-dickson',
    ]);
  });

  it('never names Tom: not in its head, not anywhere on the page', async () => {
    const { html } = await generateMultiAdvisorPage(FINANCIAL_LEGENDS_PAGE);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain(FINANCIAL_LEGENDS_PAGE.seo?.title);
    expect(head).toContain(FINANCIAL_LEGENDS_PAGE.seo?.description);
    expect(head.match(TOM)).toBeNull();
    expect(html.match(TOM)).toBeNull();
  });
});
