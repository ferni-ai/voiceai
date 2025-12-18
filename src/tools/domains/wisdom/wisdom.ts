/**
 * Wisdom Tools
 *
 * Domain: Quotes, financial history, research-backed insights.
 * Single responsibility: Jack Bogle's wisdom and Vanguard research perspective.
 *
 * This is where Jack's personality and evidence-based wisdom shines.
 * Includes insights from Vanguard whitepapers, academic research, and
 * decades of industry experience.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// JACK BOGLE'S QUOTES
// ============================================================================

const BOGLE_QUOTES = [
  'The stock market is a giant distraction to the business of investing.',
  'Time is your friend; impulse is your enemy.',
  "Don't look for the needle in the haystack. Just buy the haystack!",
  'The miracle of compounding returns is overwhelmed by the tyranny of compounding costs.',
  "In investing, you get what you don't pay for.",
  "If you have trouble imagining a 20% loss in the stock market, you shouldn't be in stocks.",
  'Stay the course. No matter what happens, stick to your program.',
  'The greatest enemy of a good plan is the dream of a perfect plan.',
  'Never underrate the importance of asset allocation.',
  'Invest you must. The biggest risk is the long-term risk of not putting your money to work.',
  "Learn every day, but especially from the experiences of others. It's cheaper!",
  'The two greatest enemies of the equity fund investor are expenses and emotions.',
  "Owning the stock market over the long term is a winner's game, but attempting to beat the market is a loser's game.",
  'When there are multiple solutions to a problem, choose the simplest one.',
  "The grim irony of investing is that we investors as a group not only don't get what we pay for, we get precisely what we don't pay for.",
  "I'm not nearly as smart as I used to be. But I'm much wiser.",
  "My ideas are very simple. In the mutual fund industry, you get what you don't pay for.",
  'The idea that a bell rings to signal when to get into or out of the stock market is simply not credible.',
  "Successful investing is about owning businesses and reaping the huge rewards provided by the dividends and earnings growth of our nation's corporations.",
  'Do not let the hero in your soul perish in lonely frustration for the life you deserved but never have been able to reach.',
  "Fund returns are devastated by costs. And it's getting worse.",
  'The historical data support one conclusion with unusual force: To invest with success, you must be a long-term investor.',
  'Simplicity is the master key to financial success.',
  "Don't search for the needle in the haystack. Just buy the haystack.",
  'The courage to press on regardless—whether the road be long or short, the prize be near or far—that is the hallmark of the long-term investor.',
];

const WISDOM_QUOTES = [
  {
    author: 'Warren Buffett',
    quote: 'The stock market is a device for transferring money from the impatient to the patient.',
  },
  {
    author: 'Benjamin Graham',
    quote:
      "In the short run, the market is a voting machine. In the long run, it's a weighing machine.",
  },
  { author: 'Peter John', quote: 'Know what you own, and know why you own it.' },
  {
    author: 'Charlie Munger',
    quote: 'The big money is not in the buying and selling, but in the waiting.',
  },
  {
    author: 'John Templeton',
    quote: "The four most dangerous words in investing are: 'This time it's different.'",
  },
  {
    author: 'Benjamin Graham',
    quote: "The investor's chief problem—and even his worst enemy—is likely to be himself.",
  },
  { author: 'Warren Buffett', quote: "Risk comes from not knowing what you're doing." },
  {
    author: 'Peter John',
    quote:
      'Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.',
  },
  {
    author: 'Charlie Munger',
    quote:
      'It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid, instead of trying to be very intelligent.',
  },
  { author: 'Howard Marks', quote: "You can't predict. You can prepare." },
  {
    author: 'Warren Buffett',
    quote:
      'The most important quality for an investor is temperament, not intellect. You need a temperament that neither derives great pleasure from being with the crowd or against the crowd.',
  },
  {
    author: 'Benjamin Graham',
    quote: 'The intelligent investor is a realist who sells to optimists and buys from pessimists.',
  },
  {
    author: 'Charlie Munger',
    quote: 'Invert, always invert. Turn a situation or problem upside down. Look at it backward.',
  },
  {
    author: 'Warren Buffett',
    quote: 'Be fearful when others are greedy, and greedy when others are fearful.',
  },
  {
    author: 'Peter John',
    quote:
      'In the long run, a portfolio of well-chosen stocks and/or equity mutual funds will always outperform a portfolio of bonds or a money-market account.',
  },
];

// ============================================================================
// VANGUARD RESEARCH INSIGHTS
// Evidence-based wisdom from decades of Vanguard whitepapers
// ============================================================================

interface ResearchInsight {
  topic: string;
  finding: string;
  jackSays: string;
  source?: string;
}

const VANGUARD_RESEARCH: ResearchInsight[] = [
  // =========================================================================
  // VANGUARD'S FOUR PRINCIPLES FOR INVESTING SUCCESS
  // Source: "Vanguard's Principles for Investing Success" whitepaper
  // =========================================================================
  {
    topic: 'four_principles',
    finding:
      "Vanguard's four timeless principles: 1) Create clear, appropriate investment goals, 2) Keep a balanced and diversified mix, 3) Minimize costs, 4) Maintain perspective and long-term discipline.",
    jackSays:
      "At Vanguard, we boiled down everything we know into four principles: Have clear goals. Stay balanced and diversified. Minimize costs. Maintain discipline. That's it. Four things. Get those right, and you'll outperform most investors.",
    source: "Vanguard's Principles for Investing Success",
  },
  {
    topic: 'principle_goals',
    finding:
      'Research shows investors with written financial plans are more likely to achieve their goals. Clear goals provide the foundation for all investment decisions.',
    jackSays:
      "The first principle is goals. Not 'make money'—specific goals. 'Retire at 65 with $1.5 million.' 'Pay for college in 15 years.' Write it down. People with written plans are dramatically more likely to succeed.",
    source: "Vanguard's Principles for Investing Success",
  },
  {
    topic: 'principle_balance',
    finding:
      "Asset allocation explains approximately 88% of a portfolio's return variability over time. Diversification reduces risk without proportionally reducing expected returns.",
    jackSays:
      "Balance and diversification—our second principle—isn't about being timid. It's about mathematics. About 88% of your portfolio's behavior comes from your mix of stocks and bonds. Not which stocks. The mix.",
    source: "Vanguard's Principles for Investing Success",
  },
  {
    topic: 'principle_cost',
    finding:
      'Every dollar paid in costs is a dollar less in potential return. Over time, high-cost funds systematically underperform low-cost alternatives.',
    jackSays:
      "The third principle is cost. It's the only factor you can control with certainty. Market returns? Unpredictable. Tax laws? Change constantly. But costs? You choose those. Choose low.",
    source: "Vanguard's Principles for Investing Success",
  },
  {
    topic: 'principle_discipline',
    finding:
      'Long-term discipline prevents costly behavioral mistakes. Investors who panic and sell during downturns typically miss the recovery and underperform by significant margins.',
    jackSays:
      'The fourth principle is discipline. This is where most people fail. Not because they chose bad funds—because they panicked. They sold at the bottom. They chased the hot thing. Discipline is worth more than any strategy.',
    source: "Vanguard's Principles for Investing Success",
  },

  // =========================================================================
  // ADVISOR'S ALPHA FRAMEWORK
  // Source: "Putting a value on your value: Quantifying Vanguard Advisor's Alpha"
  // =========================================================================
  {
    topic: 'advisors_alpha_framework',
    finding:
      "Vanguard's Advisor's Alpha framework identifies seven areas where advisors add value: suitable asset allocation, cost-effective implementation, rebalancing, behavioral coaching, asset location, spending strategy, and total-return vs income investing.",
    jackSays:
      "We created something called Advisor's Alpha—seven specific ways good advice adds value. Asset allocation. Low costs. Rebalancing. Tax efficiency. Withdrawal strategy. And the big one? Behavioral coaching. Keeping you from your worst instincts.",
    source: "Vanguard Advisor's Alpha",
  },
  {
    topic: 'behavioral_coaching',
    finding:
      "Behavioral coaching alone can add about 1-2% annually to investor returns by helping them avoid emotional decisions during market volatility. It's typically the largest component of Advisor's Alpha.",
    jackSays:
      "Here's something fascinating from our research: just having someone to talk you off the ledge during market panics can add one to two percent to your annual returns. That's not stock picking. That's not timing. That's just... staying calm.",
    source: "Vanguard Advisor's Alpha",
  },
  {
    topic: 'advisor_value',
    finding:
      "Vanguard's Advisor's Alpha research shows good financial guidance can add about 3% in net returns over time through behavioral coaching, tax efficiency, and proper asset allocation.",
    jackSays:
      "Our research found that thoughtful financial guidance—not hot stock tips, but real guidance—can add about 3% annually. Most of that comes from keeping you from doing something foolish when you're scared.",
    source: "Vanguard Advisor's Alpha",
  },
  {
    topic: 'rebalancing_value',
    finding:
      'Disciplined rebalancing can add approximately 0.35% annually and reduces portfolio risk by maintaining target allocations.',
    jackSays:
      "Rebalancing—selling what's up and buying what's down—feels wrong but works beautifully. About a third of a percent annually, and it keeps you from getting too risky when markets run hot.",
    source: "Vanguard Advisor's Alpha",
  },
  {
    topic: 'spending_strategy',
    finding:
      'A dynamic spending strategy that adjusts withdrawals based on market performance can add approximately 0.70% annually compared to rigid withdrawal rules.',
    jackSays:
      'Most people follow a rigid withdrawal rule—take 4% every year regardless. Our research shows a dynamic approach—taking a bit less after bad years, a bit more after good—adds about 0.70% annually and dramatically improves retirement outcomes.',
    source: "Vanguard Advisor's Alpha",
  },
  {
    topic: 'total_return_investing',
    finding:
      'Focusing on total return rather than income-only investing can add 0.50% or more annually by avoiding concentration in high-yield securities.',
    jackSays:
      "People love dividends—I understand the psychology. But chasing yield leads to concentration and risk. Focusing on total return instead of just income can add half a percent or more annually. Don't let the tail wag the dog.",
    source: "Vanguard Advisor's Alpha",
  },

  // =========================================================================
  // DIRECT INDEXING / PERSONALIZED INDEXING
  // Source: "Personalized Indexing: A Portfolio Construction Plan"
  // =========================================================================
  {
    topic: 'direct_indexing_overview',
    finding:
      'Direct indexing (personalized indexing) allows investors to own individual stocks that track an index while enabling tax-loss harvesting, ESG customization, and concentrated position management.',
    jackSays:
      "Direct indexing is the next evolution. Instead of owning a fund, you own the individual stocks in the index. Same diversification, but now you can harvest losses, exclude companies you don't like, or work around a concentrated stock position. Powerful stuff.",
    source: 'Vanguard Personalized Indexing',
  },
  {
    topic: 'direct_indexing_tax_alpha',
    finding:
      'Direct indexing can generate 20 to over 100 basis points of after-tax alpha annually through daily tax-loss harvesting, depending on the investor situation.',
    jackSays:
      "Our research on direct indexing shows it can add 20 to over 100 basis points annually after taxes—that's real money—by systematically harvesting losses every single day. For investors with significant taxable accounts, that compounds dramatically.",
    source: 'Vanguard Personalized Indexing Research',
  },
  {
    topic: 'direct_indexing_candidates',
    finding:
      'Direct indexing is most beneficial for: high-tax-bracket investors with taxable accounts over $250,000, those with concentrated stock positions, investors wanting ESG customization, and those with realized capital gains to offset.',
    jackSays:
      "Direct indexing isn't for everyone—there's a threshold. If you have a taxable account over $250,000, you're in a high tax bracket, or you have a concentrated stock position from your company, now we're talking. Below that? A simple index fund works fine.",
    source: 'Vanguard Personalized Indexing',
  },
  {
    topic: 'direct_indexing_loss_harvesting',
    finding:
      'Daily tax-loss harvesting captures more losses than periodic harvesting. The benefits are greatest in the first few years and for portfolios with higher turnover.',
    jackSays:
      "Here's what's clever about direct indexing: it harvests losses every day, not once a year. More harvesting opportunities means more tax savings. The first few years are especially powerful—you're building a bank of losses to use against future gains.",
    source: 'Vanguard Personalized Indexing Research',
  },
  {
    topic: 'direct_indexing_esg',
    finding:
      'Direct indexing allows investors to exclude specific companies or sectors based on personal values while maintaining broad market exposure and tax efficiency.',
    jackSays:
      'If you want to avoid certain companies—tobacco, weapons, whatever your conscience dictates—direct indexing lets you do that without sacrificing diversification or tax efficiency. Your values, your portfolio.',
    source: 'Vanguard Personalized Indexing',
  },
  {
    topic: 'direct_indexing_concentrated',
    finding:
      "For executives with concentrated stock positions, direct indexing can build a diversified portfolio that excludes the employer's stock, avoiding doubling up on risk while maintaining tax efficiency.",
    jackSays:
      "Got company stock? A lot of it? Direct indexing can build a diversified portfolio around it—excluding your employer's stock so you're not doubly exposed. Diversification without triggering a tax event.",
    source: 'Vanguard Personalized Indexing',
  },

  // =========================================================================
  // VANGUARD FINANCIAL ADVICE MODEL (VFAM)
  // Source: "Quantifying the Value of Personalized Advice"
  // =========================================================================
  {
    topic: 'vfam_model',
    finding:
      'The Vanguard Financial Advice Model (VFAM) measures advice value across three dimensions: portfolio outcomes, financial outcomes (probability of meeting goals), and emotional outcomes (peace of mind).',
    jackSays:
      'We created something called VFAM—the Vanguard Financial Advice Model—to measure advice properly. Not just returns, but three things: portfolio outcomes, goal success probability, and emotional outcomes. Peace of mind has value too.',
    source: 'Vanguard Financial Advice Model',
  },
  {
    topic: 'personalized_advice_value',
    finding:
      'Personalized financial planning recommendations can improve the probability of goal success by 20% or more compared to generic advice, particularly for complex situations.',
    jackSays:
      'Generic advice is fine for simple situations. But personalized advice—advice that knows your specific taxes, your Social Security timing, your healthcare costs—can improve your odds of success by 20% or more. The complexity of life requires nuance.',
    source: 'Vanguard Financial Advice Model',
  },
  {
    topic: 'advice_three_pillars',
    finding:
      'Effective financial advice addresses three pillars: portfolio construction (getting investments right), financial planning (optimizing decisions), and behavioral coaching (preventing mistakes).',
    jackSays:
      "Good advice has three pillars: build the right portfolio, optimize your financial decisions—like when to claim Social Security—and keep you from making behavioral mistakes. Miss any one of those and you're leaving money on the table.",
    source: 'Vanguard Financial Advice Model',
  },
  {
    topic: 'emotional_value_advice',
    finding:
      'Research shows investors place significant value on the emotional aspects of advice: peace of mind, confidence, and reduced anxiety about financial decisions.',
    jackSays:
      "People underestimate the emotional value of good advice. Sleeping better at night, not worrying about every market wiggle, having confidence in your plan—that's worth something. Our research confirms investors value peace of mind highly.",
    source: 'Vanguard Financial Advice Model',
  },

  // =========================================================================
  // RETIREMENT INCOME RESEARCH
  // Source: "From assets to income: A goals-based approach to retirement spending"
  // =========================================================================
  {
    topic: 'retirement_income_approach',
    finding:
      'A goals-based retirement income approach that separates essential spending (covered by stable income) from discretionary spending (funded by portfolio) leads to better outcomes and lower anxiety.',
    jackSays:
      "Here's how to think about retirement income: separate your essential spending—what you must have—from your discretionary spending. Cover essentials with Social Security, pensions, or annuities. Fund the discretionary part with your portfolio. This approach dramatically reduces anxiety.",
    source: 'Vanguard Retirement Income Research',
  },
  {
    topic: 'social_security_timing',
    finding:
      'Delaying Social Security from 62 to 70 increases benefits by approximately 77%. For most retirees, delayed claiming provides the highest expected lifetime income.',
    jackSays:
      "Delaying Social Security from 62 to 70 increases your benefit by about 77%. That's an 8% guaranteed annual return for waiting. Very few investments offer that. For most people, patience pays enormously here.",
    source: 'Vanguard Retirement Income Research',
  },
  {
    topic: 'withdrawal_sequencing',
    finding:
      'The order of withdrawals matters: generally, tax-deferred accounts first, then taxable, then Roth—but the optimal sequence depends on individual tax situations and can add 0.70% or more annually.',
    jackSays:
      "Which account to tap first in retirement? The conventional wisdom—tax-deferred, then taxable, then Roth—isn't always right. The optimal sequence depends on your specific tax situation. Getting this wrong can cost you 0.70% annually or more.",
    source: 'Vanguard Retirement Income Research',
  },
  {
    topic: 'roth_conversion_strategy',
    finding:
      'Strategic Roth conversions in lower-income years can reduce lifetime tax burden and required minimum distributions. The benefit is greatest when current tax rates are lower than expected future rates.',
    jackSays:
      'Converting traditional IRA money to Roth in low-income years—maybe early retirement before Social Security kicks in—can reduce your lifetime tax bill significantly. Pay taxes at a lower rate now, enjoy tax-free growth forever.',
    source: 'Vanguard Tax Research',
  },

  // =========================================================================
  // GLIDE PATH & TARGET DATE FUND RESEARCH
  // Source: "Revisiting the Glide Path"
  // =========================================================================
  {
    topic: 'glide_path_design',
    finding:
      "Target-date fund glide paths should balance accumulation-phase growth with retirement-phase income stability. Vanguard's research supports a 'through' glide path that continues reducing equity exposure into retirement.",
    jackSays:
      "The glide path—how your target-date fund shifts from stocks to bonds—is crucial. Our research supports continuing to reduce stock exposure even after retirement, not stopping at retirement. The sequence-of-returns risk doesn't disappear when you stop working.",
    source: 'Vanguard Glide Path Research',
  },
  {
    topic: 'target_date_behavior',
    finding:
      'Target-date fund investors exhibit better behavioral outcomes: they trade less frequently, panic-sell less often, and earn returns closer to their fund returns compared to self-directed investors.',
    jackSays:
      "Here's something remarkable: target-date fund investors make fewer mistakes. They trade less, panic less, and actually earn what their funds earn. Sometimes the best thing you can do is pick a target-date fund and forget you have it.",
    source: 'Vanguard Target Date Research',
  },
  {
    topic: 'one_fund_solution',
    finding:
      'For most investors, a single target-date fund provides appropriate diversification, automatic rebalancing, and professional management—outperforming most DIY portfolios.',
    jackSays:
      "For most people, one target-date fund is enough. Diversified across stocks and bonds, globally diversified, automatically rebalanced, professionally managed. It beats most DIY portfolios. Simplicity isn't settling—it's winning.",
    source: 'Vanguard Target Date Research',
  },

  // =========================================================================
  // INTERNATIONAL DIVERSIFICATION RESEARCH
  // Source: "Global equity investing: The benefits of diversification and sizing your allocation"
  // =========================================================================
  {
    topic: 'international_allocation_optimal',
    finding:
      'Vanguard research suggests 20-40% of equity allocation should be international. This range provides diversification benefits while accounting for U.S. home bias and currency considerations.',
    jackSays:
      "How much international? Our research points to 20-40% of your stock allocation. That's the sweet spot—enough diversification to matter, not so much that you're betting against America. The U.S. won't always be the best performer.",
    source: 'Vanguard International Allocation Research',
  },
  {
    topic: 'home_bias_cost',
    finding:
      'Home bias—overweighting domestic stocks—increases portfolio volatility without improving expected returns. International stocks provide exposure to 50% of global market capitalization.',
    jackSays:
      "Americans suffer from home bias—we overweight U.S. stocks because we know them. But the U.S. is only half the world's stock market. The other half isn't worse, it's different. Different is diversification.",
    source: 'Vanguard International Allocation Research',
  },
  {
    topic: 'currency_hedging',
    finding:
      'For bonds, currency hedging is generally recommended to reduce volatility. For stocks, long-term investors can typically accept currency exposure for its diversification benefits.',
    jackSays:
      "Here's a nuance: hedge your international bonds, but you can leave your international stocks unhedged. Bond volatility plus currency volatility is too much. Stock volatility can absorb currency movements over time.",
    source: 'Vanguard Currency Research',
  },

  // =========================================================================
  // FACTOR INVESTING RESEARCH
  // Source: "Factors: Examining what drives returns"
  // =========================================================================
  {
    topic: 'factor_investing',
    finding:
      'Factor premiums (value, size, momentum, quality) have historically existed but are not guaranteed. Capturing factors requires discipline during long periods of underperformance.',
    jackSays:
      "Factor investing—tilting toward value stocks, small stocks, momentum—has worked historically. But here's the catch: it requires incredible discipline. These factors can underperform for a decade. Most investors give up. That's why I prefer total market.",
    source: 'Vanguard Factor Research',
  },
  {
    topic: 'factor_timing',
    finding:
      'Attempting to time factor exposure typically destroys value. Consistent exposure is essential—factor rotation strategies generally underperform buy-and-hold approaches.',
    jackSays:
      'Can you time factors? Move in and out of value or growth? The research says no. Factor timing destroys value. If you want factor exposure, commit to it for decades, not years. Otherwise, stick with total market.',
    source: 'Vanguard Factor Research',
  },

  // =========================================================================
  // COST IMPACT RESEARCH
  // Source: "The case for low-cost index fund investing"
  // =========================================================================
  {
    topic: 'cost_compounding',
    finding:
      'A 1% annual fee difference compounds dramatically: $100,000 invested for 30 years at 7% grows to $574,000 at 0.10% fees vs. $432,000 at 1.10% fees—a $142,000 difference.',
    jackSays:
      "Let me show you something that keeps me up at night. A one percent difference in fees on $100,000 over 30 years? That's $142,000 out of your pocket. One hundred forty-two thousand dollars. For what?",
  },
  {
    topic: 'expense_ratio_impact',
    finding:
      'Over a 40-year investing career, every 0.50% in annual fees reduces final wealth by approximately 17%.',
    jackSays:
      "Half a percent in fees sounds tiny, right? Over a career, it takes away about 17% of everything you would have had. One-sixth of your retirement. Gone. That's not tiny.",
  },
  {
    topic: 'fund_survival',
    finding:
      'Only about 47% of equity funds survive a 15-year period. Low-cost funds have significantly higher survival rates.',
    jackSays:
      "Here's something the industry doesn't advertise: less than half of equity funds survive 15 years. They close quietly, merge away, hide their failures. The survivors? Disproportionately low-cost.",
  },

  // BEHAVIOR GAP RESEARCH
  {
    topic: 'behavior_gap',
    finding:
      'The average investor earns significantly less than the funds they invest in due to poor timing—buying high after gains and selling low after losses.',
    jackSays:
      "The average investor earns far less than the funds they own. Not because the funds are bad—because people buy after things go up and panic sell after things go down. The behavior gap is real, and it's expensive.",
  },
  {
    topic: 'market_timing_failure',
    finding:
      'Studies show that missing just the 10 best days in the market over 20 years can cut returns by more than half.',
    jackSays:
      "If you tried to time the market and missed just the ten best days over twenty years, you'd lose more than half your returns. Half! And when do those best days happen? Usually right after the worst days. Right when everyone's sold.",
  },
  {
    topic: 'panic_selling_cost',
    finding:
      'Investors who sold during the 2008-2009 crash and waited until markets recovered to reinvest missed an average 95% gain.',
    jackSays:
      "People who sold at the bottom in 2009 and waited until it 'felt safe' to get back in? They missed a 95% recovery. Ninety-five percent! Feeling safe cost them nearly doubling their money.",
  },

  // ASSET ALLOCATION RESEARCH
  {
    topic: 'asset_allocation_importance',
    finding:
      "Vanguard research shows that approximately 88% of a portfolio's volatility is explained by its asset allocation mix, not individual security selection.",
    jackSays:
      "Nearly 90% of your portfolio's ups and downs come from one decision: how much in stocks versus bonds. Not which stocks. Not which bonds. The mix. Get that right, and you're 90% of the way there.",
  },
  {
    topic: 'international_diversification',
    finding:
      'Vanguard recommends 20-40% international allocation in equity portfolios to reduce volatility while maintaining similar expected returns.',
    jackSays:
      "We found that holding 20 to 40 percent of your stocks in international markets smooths the ride without hurting returns. The American market won't always be the best performer. Diversify globally.",
  },
  {
    topic: 'bond_allocation',
    finding:
      'A hedged global bond allocation can reduce portfolio volatility without significantly decreasing total returns.',
    jackSays:
      "Global bonds, properly hedged for currency risk, can lower your portfolio's volatility without giving up much return. More stability, similar outcome. That's good math.",
  },

  // RETIREMENT RESEARCH
  {
    topic: 'safe_withdrawal_rate',
    finding:
      'The traditional 4% withdrawal rule has been refined—dynamic strategies that adjust spending based on market performance can improve outcomes by 15-20%.',
    jackSays:
      'The old 4% rule? Good start, but rigid. Our research shows flexible spending—taking a bit less after bad years, a bit more after good years—can improve your retirement odds by 15 to 20 percent.',
  },
  {
    topic: 'sequence_of_returns_risk',
    finding:
      'The sequence of returns matters most in the 5 years before and after retirement—poor early returns can permanently impair a portfolio.',
    jackSays:
      "Here's what nobody tells you: it's not just your average return that matters, it's the order. Bad returns in your first five years of retirement can permanently damage a portfolio. Plan for that.",
  },
  {
    topic: 'retirement_spending',
    finding:
      'Research shows retirees naturally spend less as they age—the "spending smile" pattern means early retirement years have higher expenses.',
    jackSays:
      'Retirement spending follows a smile pattern. You spend more in your active early years, less in the quiet middle, then more again if health care kicks in. Plan for that smile.',
  },

  // DOLLAR COST AVERAGING RESEARCH
  {
    topic: 'lump_sum_vs_dca',
    finding:
      'Lump sum investing beats dollar-cost averaging about two-thirds of the time, but DCA helps anxious investors stay invested.',
    jackSays:
      "Mathematically, investing a lump sum beats spreading it out about two-thirds of the time. But here's the thing—if spreading it out helps you actually do it instead of sitting frozen, that's the better strategy for you.",
  },

  // TAX EFFICIENCY RESEARCH
  {
    topic: 'tax_loss_harvesting',
    finding:
      'Tax-loss harvesting can add 0.50% to 1.25% annually for taxable accounts, with benefits most pronounced in early years.',
    jackSays:
      "Harvesting your losses—selling losers to offset gains—can add up to a percent and a quarter annually in taxable accounts. It's one of the few free lunches in investing.",
  },
  {
    topic: 'asset_location',
    finding:
      'Proper asset location—placing tax-inefficient investments in tax-advantaged accounts—can add 0.25-0.75% annually.',
    jackSays:
      "Where you put things matters. Bonds and REITs in your IRA, growth stocks in your taxable account. Simple, but it can add half a percent annually. Over decades, that's real money.",
  },

  // FUND SELECTION RESEARCH
  {
    topic: 'past_performance',
    finding:
      "Only about 18% of top-quartile funds remain in the top quartile after 5 years. Past performance truly doesn't predict future results.",
    jackSays:
      "You know those top-performing funds you see advertised? Only about 18% of them stay on top after five years. The other 82% fall back to earth. Past performance really doesn't predict the future.",
  },
  {
    topic: 'active_fund_failure',
    finding:
      'Over 15-year periods, approximately 85-90% of actively managed funds underperform their benchmark index.',
    jackSays:
      "Over 15 years, somewhere between 85 and 90 percent of actively managed funds fail to beat a simple index. And that's before we talk about the ones that closed and disappeared from the data.",
  },
  {
    topic: 'index_advantage',
    finding:
      "Index funds' advantage grows over time—they're more likely to outperform over 20 years than 1 year due to cost compounding.",
    jackSays:
      'The longer you hold, the more the index fund advantage grows. One year? Active funds have a fighting chance. Twenty years? Almost no active fund beats a low-cost index.',
  },

  // EMERGENCY FUND RESEARCH
  {
    topic: 'emergency_fund',
    finding:
      'Research suggests 3-6 months of expenses in liquid savings provides optimal balance between opportunity cost and financial security.',
    jackSays:
      'Three to six months of expenses in cash. Not invested, just sitting there being boring. It sounds like a waste, but that boring cash is what keeps you from selling stocks at the worst possible moment.',
  },

  // INVESTOR PSYCHOLOGY RESEARCH
  {
    topic: 'loss_aversion',
    finding:
      'Behavioral research shows losses feel about twice as painful as equivalent gains feel good—explaining panic selling.',
    jackSays:
      "Here's why people panic sell: losing $1,000 feels twice as bad as gaining $1,000 feels good. That's not logic—that's human nature. Knowing this helps you override it.",
  },
  {
    topic: 'recency_bias',
    finding:
      'Investors consistently overweight recent performance when making decisions, leading to buying high and selling low.',
    jackSays:
      "We're all guilty of recency bias—thinking the recent past predicts the future. Markets up? They'll stay up. Markets down? Doom forever. Neither is true. Long-term trends matter, not last quarter.",
  },
  {
    topic: 'overconfidence',
    finding:
      'Studies show 74% of investors believe they can beat the market, despite evidence that less than 10% actually do over time.',
    jackSays:
      "Three out of four investors think they can beat the market. Less than one in ten actually do over a decade. That's the gap between confidence and reality. Humility is profitable.",
  },

  // DIVERSIFICATION RESEARCH
  {
    topic: 'diversification_math',
    finding:
      "Adding 20-30 stocks provides most of diversification's benefits; a total market fund with thousands eliminates virtually all company-specific risk.",
    jackSays:
      'You get most diversification benefits with about 20 or 30 stocks. But why stop there? A total market fund with thousands of stocks eliminates company-specific risk almost entirely. Own the haystack.',
  },

  // RETIREMENT PLANNING RESEARCH
  {
    topic: 'savings_rate',
    finding:
      'Savings rate matters more than investment return for most workers—saving 15% vs 10% has more impact than earning an extra 1% annually.',
    jackSays:
      "Here's something that changed how I think about this: saving more matters more than earning more. Going from 10% to 15% savings rate beats chasing an extra percent of return. Control what you can control.",
  },

  // BOND RESEARCH
  {
    topic: 'bond_duration',
    finding:
      'Bond fund duration should roughly match your time horizon—longer for distant goals, shorter for near-term needs.',
    jackSays:
      "Match your bonds to your timeline. Money you need in 2 years? Short-term bonds. Money you need in 20 years? You can handle longer bonds. It's not complicated, but it matters.",
  },

  // NEW: SPENDING IN RETIREMENT
  {
    topic: 'retirement_income',
    finding:
      'The combination of Social Security optimization and strategic withdrawal sequencing can add 2-3 years of portfolio longevity.',
    jackSays:
      "Delaying Social Security and being strategic about which accounts you tap first can add two to three years of portfolio life. That's not picking stocks—that's just being smart about the order of things.",
  },

  // NEW: TARGET DATE FUND RESEARCH
  {
    topic: 'target_date_funds',
    finding:
      'Target-date fund investors show better behavioral outcomes—they trade less, panic less, and earn returns closer to fund returns.',
    jackSays:
      'Target-date fund investors make fewer mistakes. They trade less, panic less, and actually earn what their funds earn. Sometimes the best strategy is the one that removes you from the equation.',
  },
];

// ============================================================================
// LIFE WISDOM - Non-financial insights
// ============================================================================

const LIFE_WISDOM = [
  {
    topic: 'enough',
    wisdom:
      "Kurt Vonnegut told me the secret to happiness is knowing you have enough. If you can't answer 'What is enough?', you'll never find peace.",
  },
  {
    topic: 'time',
    wisdom: 'You can always make more money. You cannot make more time. Spend accordingly.',
  },
  {
    topic: 'family',
    wisdom:
      'I worked too much when my children were young. No success at work can compensate for failure at home.',
  },
  {
    topic: 'character',
    wisdom: 'Character is destiny. Your reputation arrives before you and lingers after you leave.',
  },
  {
    topic: 'simplicity',
    wisdom:
      "Complexity is often a disguise for uncertainty. When someone can't explain something simply, they often don't understand it themselves.",
  },
  {
    topic: 'failure',
    wisdom:
      'Getting fired in 1974 was the best thing that happened to me. Sometimes destruction is the prerequisite for creation.',
  },
  {
    topic: 'mortality',
    wisdom:
      "I've lived 23 years on a borrowed heart. Every day is a gift I didn't earn. That changes how you think about everything.",
  },
  {
    topic: 'legacy',
    wisdom:
      "Don't build around yourself. Build around principles that will outlast you. Institutions survive; individuals don't.",
  },
  {
    topic: 'humility',
    wisdom: "I'm not nearly as smart as I used to be. But I'm much wiser. There's a difference.",
  },
  {
    topic: 'persistence',
    wisdom:
      "Press on. Nothing in the world can take the place of persistence. Talent won't. Genius won't. Education won't. Persistence and determination alone are omnipotent.",
  },
  {
    topic: 'gratitude',
    wisdom:
      'Start each day grateful. Not for what you might get, but for what you already have. Most people have more than they realize.',
  },
  {
    topic: 'relationships',
    wisdom:
      "The best investment you'll ever make isn't financial. It's in the people who stand by you when everything falls apart.",
  },
];

// ============================================================================
// FINANCIAL HISTORY
// ============================================================================

const FINANCIAL_HISTORY: Record<string, string[]> = {
  '01-01': [
    'On this day in 1863, the Emancipation Proclamation took effect. Freedom—in all its forms—is the foundation of prosperity.',
  ],
  '01-16': [
    'On this day in 2019, I passed away at 89. But I like to think my ideas live on. Stay the course, friends.',
  ],
  '01-19': [
    "Happy birthday to me! I was born on this day in 1929. The same year as the crash. Maybe that's why I understand market cycles!",
  ],
  '02-05': ['On this day in 1971, NASDAQ started trading. Technology meets finance.'],
  '02-21': [
    "On this day in 1996, I received my heart transplant. A 26-year-old young man's gift gave me 23 more years. I tried to use them well.",
  ],
  '03-09': [
    'On this day in 2009, the market hit its low during the financial crisis. Those who stayed invested saw a 400% gain over the next decade.',
  ],
  '04-15': [
    'Tax day. Remember: tax-efficient investing can add half a percent annually. It adds up.',
  ],
  '05-01': [
    'On this day in 1975, I founded Vanguard. We started with a simple idea: put investors first.',
  ],
  '05-06': [
    'On this day in 2010, the Flash Crash happened. Markets dropped 9% in minutes, then recovered. Patience prevailed.',
  ],
  '08-31': [
    "On this day in 1976, we launched the First Index Investment Trust—the first index fund for individual investors. They called it 'Bogle's Folly.' Turned out okay!",
  ],
  '09-17': [
    'On this day in 1787, the Constitution was signed. Strong institutions make strong markets.',
  ],
  '09-29': [
    'On this day in 2008, the Dow dropped 777 points—largest single-day point drop then. Those who held through recovered everything by 2013.',
  ],
  '10-19': [
    'This is the anniversary of Black Monday, 1987. The market dropped 22% in one day! But if you held on, you made money within two years.',
  ],
  '10-24': [
    "On this day in 1929, 'Black Thursday' began the Great Crash. History doesn't repeat, but it rhymes.",
  ],
  '10-29': [
    'Black Tuesday, 1929. The day the market truly crashed. But you know what? The market recovered. It always has.',
  ],
  '11-09': ['On this day in 1989, the Berlin Wall fell. Markets thrive on freedom.'],
  '12-31': [
    "Year's end. Time to rebalance your portfolio and reflect on the year. Did you stay the course?",
  ],
};

const GENERIC_HISTORY = [
  "History shows us that markets always recover from crashes. Patience is the investor's greatest virtue.",
  'Did you know the first index fund was created in 1976? That was my baby!',
  "The Dow Jones was created in 1896 with just 12 stocks. Look how far we've come.",
  'In every decade of history, there have been reasons to panic and sell. And in every decade, staying invested has paid off.',
  'The S&P 500 has delivered about 10% annual returns since 1926. Through wars, depressions, panics, and everything else.',
  'The greatest bull market in history started in 1982. Twenty years of unprecedented growth. And the pessimists missed it all.',
  'In 1929, the market lost 89% of its value. Those who stayed invested were whole again by 1954. Twenty-five years is a long time, but the market always recovers.',
  "The dot-com crash taught us that new technology doesn't change the fundamentals of investing. Profits still matter.",
  '2008 showed us that even total market funds work. They fell less, recovered faster, and cost less than actively managed funds.',
  'Since 1926, there have been 26 bear markets. Every single one was followed by a bull market. Every. Single. One.',
  'The average investor holds a fund for just 3.3 years. The average holding period needed to be confident of positive returns? About 7 years.',
  'In the 1970s, everyone said stocks were dead. The 1980s and 1990s proved them spectacularly wrong.',
];

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get a random Bogle quote
 */
export function getBogleQuote(): string {
  const quote = BOGLE_QUOTES[Math.floor(Math.random() * BOGLE_QUOTES.length)];
  return `Here's something I've said before: "${quote}"`;
}

/**
 * Get a wisdom quote (Bogle or other legends)
 */
export function getWisdomQuote(): string {
  // 70% chance of Bogle, 30% other legends
  if (Math.random() < 0.7) {
    return getBogleQuote();
  } else {
    const wisdom = WISDOM_QUOTES[Math.floor(Math.random() * WISDOM_QUOTES.length)];
    return `My friend ${wisdom.author} once said: "${wisdom.quote}" Wise words.`;
  }
}

/**
 * Get research-backed insight on a topic
 */
export function getResearchInsight(topic?: string): string {
  if (topic) {
    const insight = VANGUARD_RESEARCH.find((r) => r.topic === topic);
    if (insight) {
      return insight.jackSays;
    }
  }
  // Return random insight
  const insight = VANGUARD_RESEARCH[Math.floor(Math.random() * VANGUARD_RESEARCH.length)];
  return insight.jackSays;
}

/**
 * Get research insight for a specific category
 */
export function getResearchByCategory(
  category: 'costs' | 'behavior' | 'allocation' | 'retirement' | 'taxes'
): string {
  const categoryTopics: Record<string, string[]> = {
    costs: ['cost_compounding', 'expense_ratio_impact', 'fund_survival', 'active_fund_failure'],
    behavior: [
      'behavioral_coaching',
      'behavior_gap',
      'market_timing_failure',
      'panic_selling_cost',
      'loss_aversion',
      'recency_bias',
      'overconfidence',
    ],
    allocation: [
      'asset_allocation_importance',
      'international_diversification',
      'bond_allocation',
      'diversification_math',
      'bond_duration',
    ],
    retirement: [
      'safe_withdrawal_rate',
      'sequence_of_returns_risk',
      'retirement_spending',
      'retirement_income',
      'savings_rate',
    ],
    taxes: ['tax_loss_harvesting', 'asset_location'],
  };

  const topics = categoryTopics[category];
  if (topics && topics.length > 0) {
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    return getResearchInsight(randomTopic);
  }

  return getResearchInsight();
}

/**
 * Get life wisdom (non-financial)
 */
export function getLifeWisdom(): string {
  const wisdom = LIFE_WISDOM[Math.floor(Math.random() * LIFE_WISDOM.length)];
  return wisdom.wisdom;
}

/**
 * Get this day in financial history
 */
export function getThisDayInHistory(): string {
  const now = new Date();
  const key = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const events = FINANCIAL_HISTORY[key];
  if (events && events.length > 0) {
    return events[Math.floor(Math.random() * events.length)];
  }

  return GENERIC_HISTORY[Math.floor(Math.random() * GENERIC_HISTORY.length)];
}

/**
 * Get market crash perspective
 */
export function getCrashPerspective(crashName?: string): string {
  const perspectives: Record<string, string> = {
    '1929':
      "The 1929 crash saw stocks fall 89%. But if you'd invested $100 at the peak and held, you'd have had $100,000 by 1990. Time heals all market wounds.",
    '1987':
      "Black Monday in 1987—the market dropped 22% in a single day. Within two years, it was at new highs. The lesson? Don't panic.",
    '2000':
      'The dot-com crash wiped out 78% of the NASDAQ. But boring index funds only fell 49%, and recovered years faster.',
    '2008':
      "2008 was the worst since 1929. The S&P fell 57%. Yet by 2013, patient investors were whole again. And by 2024, they'd tripled their money.",
    '2020':
      "March 2020—the fastest crash in history. 34% down in 23 days. But if you'd panicked and sold, you'd have missed the fastest recovery in history too.",
    '2022':
      '2022 was painful—stocks and bonds both fell. Rare and unpleasant. But those who stayed invested saw recovery begin by mid-2023. Patience pays.',
  };

  if (crashName && perspectives[crashName]) {
    return perspectives[crashName];
  }

  // Return random perspective
  const keys = Object.keys(perspectives);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return perspectives[randomKey];
}

/**
 * Get cost impact explanation
 */
export function getCostImpact(amount: number, years: number, feePercent: number): string {
  // Calculate impact of fees vs. index fund
  const indexFee = 0.03; // 0.03% for VTI
  const returnRate = 0.07; // 7% real return assumption

  const indexGrowth = amount * Math.pow(1 + returnRate - indexFee / 100, years);
  const highFeeGrowth = amount * Math.pow(1 + returnRate - feePercent / 100, years);
  const difference = indexGrowth - highFeeGrowth;

  return `Let me show you the math. $${amount.toLocaleString()} over ${years} years: at a ${feePercent}% fee, you'd end up with about $${Math.round(highFeeGrowth).toLocaleString()}. At a 0.03% index fund fee? About $${Math.round(indexGrowth).toLocaleString()}. That's $${Math.round(difference).toLocaleString()} more in your pocket. Same market returns, different destination.`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createWisdomTools() {
  return {
    getWisdomQuote: llm.tool({
      description: getToolDescription('getWisdomQuote'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting wisdom quote');
        return getWisdomQuote();
      },
    }),

    getBogleQuote: llm.tool({
      description: getToolDescription('getBogleQuote'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting Bogle quote');
        return getBogleQuote();
      },
    }),

    getResearchInsight: llm.tool({
      description: getToolDescription('getResearchInsight'),
      parameters: z.object({
        category: z
          .enum(['costs', 'behavior', 'allocation', 'retirement', 'taxes'])
          .optional()
          .describe('Category of research insight, or omit for random'),
      }),
      execute: async ({ category }) => {
        getLogger().info(`Getting research insight: ${category || 'random'}`);
        if (category) {
          return getResearchByCategory(category);
        }
        return getResearchInsight();
      },
    }),

    getLifeWisdom: llm.tool({
      description:
        "Get Jack's wisdom about life beyond money—family, mortality, character, meaning. Use for deeper conversations.",
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting life wisdom');
        return getLifeWisdom();
      },
    }),

    getThisDayInHistory: llm.tool({
      description:
        "Get interesting financial history for today—market crashes, milestones, Jack's birthday. Great for adding context.",
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting this day in history');
        return getThisDayInHistory();
      },
    }),

    getCrashPerspective: llm.tool({
      description: getToolDescription('getLifeWisdom'),
      parameters: z.object({
        crash: z
          .enum(['1929', '1987', '2000', '2008', '2020', '2022'])
          .optional()
          .describe('Which crash to discuss, or omit for a random one'),
      }),
      execute: async ({ crash }) => {
        getLogger().info(`Getting crash perspective: ${crash || 'random'}`);
        return getCrashPerspective(crash);
      },
    }),

    getCostImpact: llm.tool({
      description: getToolDescription('getThisDayInHistory'),
      parameters: z.object({
        amount: z.number().describe('Initial investment amount'),
        years: z.number().describe('Investment time horizon in years'),
        feePercent: z.number().describe('The higher fee percentage to compare against index funds'),
      }),
      execute: async ({ amount, years, feePercent }) => {
        getLogger().info(
          `Calculating cost impact: $${amount} over ${years} years at ${feePercent}%`
        );
        return getCostImpact(amount, years, feePercent);
      },
    }),
  };
}

export default createWisdomTools;
