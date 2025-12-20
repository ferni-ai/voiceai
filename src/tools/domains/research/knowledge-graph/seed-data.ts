/**
 * Knowledge Graph Seed Data
 *
 * Initial financial concepts to populate Peter's knowledge graph.
 * These are the foundational concepts that Peter starts with.
 *
 * @module tools/domains/research/knowledge-graph/seed-data
 */

import type { KnowledgeNode, KnowledgeEdge } from './types.js';

// ============================================================================
// FOUNDATIONAL CONCEPTS
// ============================================================================

export const SEED_NODES: KnowledgeNode[] = [
  // ========== Core Concepts ==========
  {
    id: 'compound_interest',
    type: 'concept',
    name: 'Compound Interest',
    aliases: ['compounding', 'compound growth', 'interest on interest'],
    content: {
      definition: 'Interest calculated on the initial principal and also on the accumulated interest of previous periods.',
      simpleExplanation: "Your money makes money, and then that money makes more money. It's like a snowball rolling downhill - it gets bigger and faster over time.",
      technicalExplanation: 'A = P(1 + r/n)^(nt) where P = principal, r = annual rate, n = compounding frequency, t = time in years. The exponential nature means early contributions have disproportionate impact.',
      whyItMatters: "Einstein supposedly called it the 8th wonder of the world. It's why starting early matters more than starting big.",
    },
    analogies: [
      {
        id: 'ci_snowball',
        type: 'everyday',
        text: "Imagine a snowball rolling down a hill. At first it's small and slow. But as it picks up snow, it gets bigger and rolls faster, picking up even MORE snow. Your money works the same way.",
        effectiveFor: { experienceLevels: ['beginner'] },
        effectiveness: { timesUsed: 0, successRate: 0.85 },
      },
      {
        id: 'ci_tree',
        type: 'gardening',
        text: "Plant a seed today, and it becomes a tree that drops more seeds, which become more trees. In 30 years, you have a forest from one seed.",
        effectiveFor: { experienceLevels: ['beginner', 'intermediate'] },
        effectiveness: { timesUsed: 0, successRate: 0.80 },
      },
    ],
    misconceptions: [
      {
        belief: 'I should wait until I have more money to start investing',
        reality: 'Time in the market beats timing the market. $100/month starting at 25 beats $500/month starting at 35.',
        whyCommon: "People underestimate exponential growth and overestimate the amount needed to start.",
        frequency: 0.7,
        correction: 'Show the math: $100/month at 25 vs $500/month at 35, both to age 65.',
      },
    ],
    typicalQuestions: [
      'How does compound interest work?',
      'Why should I start investing early?',
      'How much difference does starting early make?',
    ],
    difficulty: 'beginner',
    prerequisites: [],
    stats: { timesExplained: 0, comprehensionRate: 0.8, bestExplanationStyle: 'analogy' },
    category: 'fundamentals',
    tags: ['core', 'growth', 'time-value'],
    lastUpdated: new Date(),
  },

  {
    id: 'dollar_cost_averaging',
    type: 'strategy',
    name: 'Dollar Cost Averaging',
    aliases: ['DCA', 'periodic investing', 'systematic investing'],
    content: {
      definition: 'An investment strategy where you invest a fixed amount at regular intervals regardless of market conditions.',
      simpleExplanation: "Invest the same amount every month, no matter what. When prices are low, you buy more shares. When prices are high, you buy fewer. Over time, you average out.",
      technicalExplanation: "DCA reduces sequence-of-returns risk and removes emotional decision-making. Studies show it slightly underperforms lump-sum investing in rising markets but provides psychological benefits and reduces regret.",
      whyItMatters: "It takes emotion out of investing. You don't have to guess when to buy - you just keep buying consistently.",
    },
    analogies: [
      {
        id: 'dca_groceries',
        type: 'everyday',
        text: "You need to buy gas for your car regularly. Sometimes gas is expensive, sometimes it's cheap. But you still need to drive. Over time, you pay an average price. Same with investing.",
        effectiveFor: { experienceLevels: ['beginner'] },
        effectiveness: { timesUsed: 0, successRate: 0.82 },
      },
    ],
    misconceptions: [
      {
        belief: "I should wait for a market dip to invest",
        reality: "Time in the market beats timing the market. Missing just the 10 best days over 20 years cuts returns nearly in half.",
        whyCommon: "It feels smart to buy low. But no one knows when 'low' is.",
        frequency: 0.8,
        correction: "Show historical data on missing best days.",
      },
    ],
    typicalQuestions: [
      'When should I invest?',
      'Should I wait for the market to drop?',
      'How often should I invest?',
    ],
    difficulty: 'beginner',
    prerequisites: ['compound_interest'],
    stats: { timesExplained: 0, comprehensionRate: 0.85, bestExplanationStyle: 'simple' },
    category: 'strategies',
    tags: ['core', 'psychology', 'automation'],
    lastUpdated: new Date(),
  },

  {
    id: 'index_fund',
    type: 'product',
    name: 'Index Fund',
    aliases: ['index investing', 'passive investing', 'market fund'],
    content: {
      definition: 'A mutual fund or ETF designed to track a market index like the S&P 500, providing broad market exposure at low cost.',
      simpleExplanation: "Instead of picking individual stocks (which rarely works), you buy a little piece of ALL the stocks. When the market goes up, you go up. Simple, cheap, and historically beats most professionals.",
      technicalExplanation: "Index funds track benchmarks like the S&P 500 (500 largest US companies), total market (3,000+ stocks), or international indices. Expense ratios of 0.03-0.10% vs 0.5-1.5% for active funds. 80-90% of active managers underperform over 15+ years after fees.",
      whyItMatters: "Warren Buffett recommends them. Jack Bogle invented them. They're how most millionaires actually build wealth.",
    },
    analogies: [
      {
        id: 'index_buffet',
        type: 'everyday',
        text: "Instead of trying to pick the best dish at a buffet, you take a small portion of everything. You don't need to guess which one will be the best - you get the average of all of them.",
        effectiveFor: { experienceLevels: ['beginner'] },
        effectiveness: { timesUsed: 0, successRate: 0.88 },
      },
    ],
    misconceptions: [
      {
        belief: "I can beat the market by picking the right stocks",
        reality: "Over 15-20 years, 80-90% of professional stock pickers fail to beat a simple index fund, even before their fees.",
        whyCommon: "Survivorship bias - we hear about winners, not the majority who lost.",
        frequency: 0.65,
        correction: "Show SPIVA data on active manager underperformance.",
      },
    ],
    typicalQuestions: [
      'What should I invest in?',
      'Are index funds good?',
      'Should I pick individual stocks?',
    ],
    difficulty: 'beginner',
    prerequisites: [],
    stats: { timesExplained: 0, comprehensionRate: 0.9, bestExplanationStyle: 'analogy' },
    category: 'products',
    tags: ['core', 'passive', 'diversification'],
    lastUpdated: new Date(),
  },

  {
    id: 'emergency_fund',
    type: 'concept',
    name: 'Emergency Fund',
    aliases: ['rainy day fund', 'emergency savings', 'cash cushion'],
    content: {
      definition: '3-6 months of essential expenses kept in a highly liquid, low-risk account to cover unexpected costs or income loss.',
      simpleExplanation: "Before you invest a single dollar, save 3-6 months of expenses in cash. This is your 'sleep at night' money. It prevents you from selling investments at the worst time.",
      technicalExplanation: "High-yield savings (4-5% currently), money market funds, or I-bonds for inflation protection. Size depends on job stability, income sources, and dependents. Some argue 12 months for entrepreneurs or single-income households.",
      whyItMatters: "Without this, any emergency forces you to sell investments at potentially the worst time, or go into debt. It's the foundation everything else sits on.",
    },
    analogies: [
      {
        id: 'ef_foundation',
        type: 'building',
        text: "You wouldn't build a house without a foundation. Your emergency fund IS your financial foundation. Everything else - investing, retirement - sits on top of it.",
        effectiveFor: { experienceLevels: ['beginner', 'intermediate'] },
        effectiveness: { timesUsed: 0, successRate: 0.90 },
      },
    ],
    misconceptions: [
      {
        belief: "I should invest my emergency fund for better returns",
        reality: "The purpose of an emergency fund is security, not growth. Invested emergency funds can lose 30% right when you need them most.",
        whyCommon: "Opportunity cost anxiety - seeing 'wasted' growth potential.",
        frequency: 0.5,
        correction: "Ask: what if you lose your job during a market crash?",
      },
    ],
    typicalQuestions: [
      'How much should I save before investing?',
      'Where should I keep my emergency fund?',
      'Do I need 6 months of expenses?',
    ],
    difficulty: 'beginner',
    prerequisites: [],
    stats: { timesExplained: 0, comprehensionRate: 0.92, bestExplanationStyle: 'simple' },
    category: 'fundamentals',
    tags: ['core', 'safety', 'foundation'],
    lastUpdated: new Date(),
  },

  {
    id: 'asset_allocation',
    type: 'concept',
    name: 'Asset Allocation',
    aliases: ['portfolio allocation', 'investment mix', 'asset mix'],
    content: {
      definition: 'The strategy of dividing investments among different asset classes (stocks, bonds, cash) to balance risk and return.',
      simpleExplanation: "Don't put all your eggs in one basket. How much you put in stocks vs bonds depends on how long until you need the money and how much volatility you can stomach.",
      technicalExplanation: "Modern Portfolio Theory suggests diversification can optimize risk-adjusted returns. Common rule of thumb: (110 - age)% in stocks. Target-date funds automate this 'glide path' from aggressive to conservative as you approach retirement.",
      whyItMatters: "Your allocation determines 90% of your portfolio's behavior. The specific stocks/funds matter less than this big-picture decision.",
    },
    analogies: [
      {
        id: 'aa_sports',
        type: 'sports',
        text: "A football team needs offense AND defense. Young? Play aggressive offense (stocks). Near retirement? Focus on defense (bonds). The balance shifts as your game situation changes.",
        effectiveFor: { experienceLevels: ['beginner', 'intermediate'] },
        effectiveness: { timesUsed: 0, successRate: 0.78 },
      },
    ],
    misconceptions: [
      {
        belief: "I should be 100% in stocks for maximum returns",
        reality: "100% stocks maximizes expected returns but also maximizes volatility and risk of sequence-of-returns failure. Most people can't stomach a 50% drop.",
        whyCommon: "Looking at long-term averages without experiencing real drawdowns.",
        frequency: 0.4,
        correction: "Ask: how would you feel if your portfolio dropped 50%?",
      },
    ],
    typicalQuestions: [
      'How much should I have in stocks vs bonds?',
      'What allocation is right for my age?',
      'Should I change my allocation over time?',
    ],
    difficulty: 'intermediate',
    prerequisites: ['index_fund'],
    stats: { timesExplained: 0, comprehensionRate: 0.75, bestExplanationStyle: 'analogy' },
    category: 'strategies',
    tags: ['core', 'risk', 'diversification'],
    lastUpdated: new Date(),
  },

  // ========== Advanced Concepts ==========
  {
    id: 'tax_loss_harvesting',
    type: 'strategy',
    name: 'Tax Loss Harvesting',
    aliases: ['TLH', 'harvesting losses', 'tax-loss selling'],
    content: {
      definition: 'Selling investments at a loss to offset capital gains taxes, then immediately buying a similar (but not identical) investment to maintain market exposure.',
      simpleExplanation: "Some of your investments went down? Sell them to get a tax deduction, then immediately buy something similar. You stay invested but save on taxes.",
      technicalExplanation: "Losses offset gains dollar-for-dollar. Excess losses up to $3K/year can offset ordinary income. Watch wash sale rule (no repurchase of 'substantially identical' security within 30 days). Most beneficial in high-income years.",
      whyItMatters: "Free money. You can save thousands in taxes while staying fully invested. It's especially valuable in years with high income.",
    },
    analogies: [
      {
        id: 'tlh_coupon',
        type: 'everyday',
        text: "It's like having a coupon that turns a temporary loss into a permanent tax savings. You're not really losing - you're getting a discount on your tax bill.",
        effectiveFor: { experienceLevels: ['intermediate'] },
        effectiveness: { timesUsed: 0, successRate: 0.72 },
      },
    ],
    misconceptions: [
      {
        belief: "Selling at a loss means I lost money",
        reality: "You still own the same amount of market exposure. The 'loss' is just on paper - you're swapping assets, not exiting the market.",
        whyCommon: "Loss aversion makes selling losers psychologically painful.",
        frequency: 0.55,
        correction: "Walk through exact mechanics showing position is maintained.",
      },
    ],
    typicalQuestions: [
      'What is tax loss harvesting?',
      'How do I harvest tax losses?',
      'Is tax loss harvesting worth it?',
    ],
    difficulty: 'advanced',
    prerequisites: ['index_fund', 'asset_allocation'],
    stats: { timesExplained: 0, comprehensionRate: 0.65, bestExplanationStyle: 'simple' },
    category: 'strategies',
    tags: ['taxes', 'optimization', 'advanced'],
    lastUpdated: new Date(),
  },

  {
    id: 'fire',
    type: 'concept',
    name: 'FIRE',
    aliases: ['financial independence', 'early retirement', 'FI'],
    content: {
      definition: 'Financial Independence, Retire Early - achieving enough passive income/wealth to cover expenses indefinitely without traditional employment.',
      simpleExplanation: "Save and invest aggressively (50%+ of income) so you can live off your investments. The 4% rule says you can withdraw 4% of your portfolio yearly forever.",
      technicalExplanation: "FIRE number = Annual expenses × 25 (based on 4% SWR from Trinity Study). Variants: LeanFIRE (<$40K/year), FatFIRE (>$100K/year), CoastFIRE (stop contributing, let compound), BaristaFIRE (part-time work covers expenses). Sequence of returns risk is the main threat.",
      whyItMatters: "Work becomes optional. You can pursue passion projects, spend time with family, or just have the security of not NEEDING a paycheck.",
    },
    analogies: [],
    misconceptions: [
      {
        belief: "FIRE means never working again",
        reality: "Many FIRE'd people still work - they just choose WHAT and WHEN. It's about options, not idleness.",
        whyCommon: "The 'Retire Early' part is misleading.",
        frequency: 0.6,
        correction: "Reframe as 'work becomes optional' not 'stop working'.",
      },
      {
        belief: "The 4% rule is guaranteed",
        reality: "It's based on historical data. Future returns may differ. Many FIRE practitioners use 3.5% or maintain flexibility.",
        whyCommon: "Rules of thumb get oversimplified.",
        frequency: 0.5,
        correction: "Explain the Trinity Study and its limitations.",
      },
    ],
    typicalQuestions: [
      'What is FIRE?',
      'How do I calculate my FIRE number?',
      'What is the 4% rule?',
    ],
    difficulty: 'intermediate',
    prerequisites: ['compound_interest', 'index_fund'],
    stats: { timesExplained: 0, comprehensionRate: 0.78, bestExplanationStyle: 'simple' },
    category: 'strategies',
    tags: ['goals', 'retirement', 'independence'],
    lastUpdated: new Date(),
  },

  // ========== Behavioral Concepts ==========
  {
    id: 'loss_aversion',
    type: 'concept',
    name: 'Loss Aversion',
    aliases: ['fear of loss', 'loss bias'],
    content: {
      definition: 'The psychological tendency for people to prefer avoiding losses over acquiring equivalent gains - losses hurt about 2x more than gains feel good.',
      simpleExplanation: "Losing $100 hurts more than finding $100 feels good. This is why market drops feel so painful - and why people panic sell at the worst time.",
      technicalExplanation: "From Kahneman & Tversky's Prospect Theory. Loss aversion coefficient typically 1.5-2.5x. Explains disposition effect (selling winners too early, holding losers too long), panic selling, and excessive cash holdings.",
      whyItMatters: "Understanding this bias helps you override it. When the market drops 20% and you want to sell everything, remember: your brain is tricking you.",
    },
    analogies: [
      {
        id: 'la_weight',
        type: 'medical',
        text: "Imagine a scale where bad things weigh twice as much as good things. A $100 loss weighs 200 pounds emotionally, while a $100 gain only weighs 100. That's why downturns feel so devastating.",
        effectiveFor: { experienceLevels: ['beginner', 'intermediate'] },
        effectiveness: { timesUsed: 0, successRate: 0.75 },
      },
    ],
    misconceptions: [
      {
        belief: "I should sell when the market drops to prevent further losses",
        reality: "This locks in losses. Every major recovery has come after drops. Selling low and buying high is the opposite of successful investing.",
        whyCommon: "Loss aversion makes any further loss feel unbearable.",
        frequency: 0.7,
        correction: "Show historical recoveries after every major drop.",
      },
    ],
    typicalQuestions: [
      'Why do I want to sell when the market drops?',
      'How do I stay calm during market crashes?',
      'Why does losing money feel so bad?',
    ],
    difficulty: 'intermediate',
    prerequisites: [],
    stats: { timesExplained: 0, comprehensionRate: 0.70, bestExplanationStyle: 'analogy' },
    category: 'psychology',
    tags: ['behavioral', 'bias', 'emotions'],
    lastUpdated: new Date(),
  },

  {
    id: 'recency_bias',
    type: 'concept',
    name: 'Recency Bias',
    aliases: ['recency effect', 'recent trend bias'],
    content: {
      definition: 'The tendency to give too much weight to recent events while ignoring longer-term history.',
      simpleExplanation: "If the market has gone up for 5 years, you think it will keep going up. If it's gone down for 6 months, you think it will keep going down. Neither is based on reality.",
      technicalExplanation: "A form of availability heuristic - recent information is more 'available' to recall. Leads to performance chasing (buying last year's winners), panic selling during corrections, and excessive optimism near peaks.",
      whyItMatters: "This is why people buy high and sell low. They extrapolate recent trends into the future, ignoring mean reversion.",
    },
    analogies: [
      {
        id: 'rb_weather',
        type: 'everyday',
        text: "If it's been sunny for a week, you might forget umbrellas exist. If it's rained for 3 days, you might think sun will never return. Markets work the same way - recent weather feels like forever.",
        effectiveFor: { experienceLevels: ['beginner'] },
        effectiveness: { timesUsed: 0, successRate: 0.82 },
      },
    ],
    misconceptions: [
      {
        belief: "Past performance indicates future results",
        reality: "Last year's best fund is rarely this year's best. Performance chasing is one of the biggest return killers.",
        whyCommon: "Recent winners are heavily marketed and easy to remember.",
        frequency: 0.75,
        correction: "Show data on performance persistence (or lack thereof).",
      },
    ],
    typicalQuestions: [
      'Should I invest in what went up last year?',
      'Will this trend continue?',
      'Is the market going to crash?',
    ],
    difficulty: 'intermediate',
    prerequisites: [],
    stats: { timesExplained: 0, comprehensionRate: 0.72, bestExplanationStyle: 'analogy' },
    category: 'psychology',
    tags: ['behavioral', 'bias', 'trends'],
    lastUpdated: new Date(),
  },
];

// ============================================================================
// EDGES (RELATIONSHIPS)
// ============================================================================

export const SEED_EDGES: KnowledgeEdge[] = [
  // Compound interest relationships
  {
    id: 'edge_ci_dca',
    from: 'compound_interest',
    to: 'dollar_cost_averaging',
    relationship: 'leads_to',
    strength: 0.8,
    bidirectional: false,
    description: 'Understanding compounding leads to appreciating DCA',
  },
  {
    id: 'edge_ci_fire',
    from: 'compound_interest',
    to: 'fire',
    relationship: 'prerequisite',
    strength: 0.9,
    bidirectional: false,
    description: 'Compounding is essential to FIRE math',
  },

  // Index fund relationships
  {
    id: 'edge_if_aa',
    from: 'index_fund',
    to: 'asset_allocation',
    relationship: 'prerequisite',
    strength: 0.7,
    bidirectional: false,
  },
  {
    id: 'edge_if_dca',
    from: 'index_fund',
    to: 'dollar_cost_averaging',
    relationship: 'related',
    strength: 0.8,
    bidirectional: true,
    description: 'DCA often uses index funds',
  },
  {
    id: 'edge_if_tlh',
    from: 'index_fund',
    to: 'tax_loss_harvesting',
    relationship: 'prerequisite',
    strength: 0.6,
    bidirectional: false,
  },

  // Emergency fund relationships
  {
    id: 'edge_ef_ci',
    from: 'emergency_fund',
    to: 'compound_interest',
    relationship: 'prerequisite',
    strength: 0.5,
    bidirectional: false,
    description: 'EF comes before investing for compounding',
  },

  // Asset allocation relationships
  {
    id: 'edge_aa_fire',
    from: 'asset_allocation',
    to: 'fire',
    relationship: 'related',
    strength: 0.7,
    bidirectional: true,
  },
  {
    id: 'edge_aa_tlh',
    from: 'asset_allocation',
    to: 'tax_loss_harvesting',
    relationship: 'prerequisite',
    strength: 0.6,
    bidirectional: false,
  },

  // Behavioral relationships
  {
    id: 'edge_la_rb',
    from: 'loss_aversion',
    to: 'recency_bias',
    relationship: 'related',
    strength: 0.7,
    bidirectional: true,
    description: 'Both are behavioral biases that affect investing',
  },
  {
    id: 'edge_dca_la',
    from: 'dollar_cost_averaging',
    to: 'loss_aversion',
    relationship: 'applies_to',
    strength: 0.8,
    bidirectional: false,
    description: 'DCA helps counter loss aversion',
  },
  {
    id: 'edge_if_la',
    from: 'index_fund',
    to: 'loss_aversion',
    relationship: 'applies_to',
    strength: 0.6,
    bidirectional: false,
    description: 'Index funds simplify decisions, reducing emotional bias',
  },
];

// ============================================================================
// SEED FUNCTION
// ============================================================================

import { KnowledgeGraph } from './graph-service.js';

export async function seedKnowledgeGraph(): Promise<{ nodes: number; edges: number }> {
  let nodesAdded = 0;
  let edgesAdded = 0;

  // Add nodes
  for (const node of SEED_NODES) {
    await KnowledgeGraph.saveNode(node);
    nodesAdded++;
  }

  // Add edges
  for (const edge of SEED_EDGES) {
    await KnowledgeGraph.addEdge(edge);
    edgesAdded++;
  }

  return { nodes: nodesAdded, edges: edgesAdded };
}

