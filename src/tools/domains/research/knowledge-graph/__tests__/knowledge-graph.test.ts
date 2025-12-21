/**
 * Knowledge Graph Tests
 *
 * Tests for Peter's knowledge graph system.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { KnowledgeNode, KnowledgeEdge, NodeType, EdgeType } from '../types.js';
import { KnowledgeGraphService } from '../graph-service.js';
import { getFinancialSeedNodes, getFinancialSeedEdges } from '../seed-data.js';

describe('Knowledge Graph Types', () => {
  describe('KnowledgeNode', () => {
    it('should create valid concept node', () => {
      const node: KnowledgeNode = {
        id: 'node_compound_interest',
        type: 'concept',
        name: 'Compound Interest',
        aliases: ['compounding', 'compound growth'],
        definition: 'Interest calculated on initial principal and accumulated interest',
        context: {
          domain: 'investing',
          subdomains: ['returns', 'growth'],
          difficulty: 'beginner',
        },
        examples: [
          '$10,000 at 7% for 30 years = $76,123',
          'Starting early adds decades of compounding',
        ],
        commonMisunderstandings: [
          'Confusing simple vs compound interest',
          'Underestimating time factor',
        ],
        metadata: {
          confidence: 1.0,
          sources: ['Investopedia', 'SEC'],
          lastVerified: new Date(),
          timesReferenced: 500,
          helpfulnessScore: 0.95,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(node.type).toBe('concept');
      expect(node.aliases).toContain('compounding');
      expect(node.context.difficulty).toBe('beginner');
      expect(node.metadata.confidence).toBe(1.0);
    });

    it('should create valid metric node', () => {
      const node: KnowledgeNode = {
        id: 'node_pe_ratio',
        type: 'metric',
        name: 'Price-to-Earnings Ratio',
        aliases: ['P/E', 'PE ratio', 'price earnings'],
        definition: 'Stock price divided by earnings per share',
        context: {
          domain: 'valuation',
          subdomains: ['fundamentals', 'stocks'],
          difficulty: 'beginner',
        },
        examples: ['S&P 500 historical average P/E ~15-18', 'Growth stocks often have P/E 30+'],
        relatedMetrics: ['PEG ratio', 'Forward P/E', 'Trailing P/E'],
        ranges: {
          low: 10,
          typical: 15,
          high: 25,
          extreme: 50,
        },
        metadata: {
          confidence: 1.0,
          sources: ['Bogle', 'Graham'],
          lastVerified: new Date(),
          timesReferenced: 800,
          helpfulnessScore: 0.88,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(node.type).toBe('metric');
      expect(node.relatedMetrics).toContain('PEG ratio');
      expect(node.ranges?.typical).toBe(15);
    });

    it('should create valid principle node', () => {
      const node: KnowledgeNode = {
        id: 'node_cost_matters',
        type: 'principle',
        name: "Bogle's Cost Matters Hypothesis",
        aliases: ['cost matters', 'expense ratios matter'],
        definition: 'In investing, you get what you dont pay for. Lower costs = higher returns.',
        context: {
          domain: 'investing',
          subdomains: ['costs', 'index funds'],
          difficulty: 'beginner',
        },
        source: 'John Bogle',
        examples: [
          '1% fee difference compounds to 28% less wealth over 30 years',
          'Index funds with 0.03% vs active funds at 1%+',
        ],
        metadata: {
          confidence: 1.0,
          sources: ['The Little Book of Common Sense Investing'],
          lastVerified: new Date(),
          timesReferenced: 350,
          helpfulnessScore: 0.92,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(node.type).toBe('principle');
      expect(node.source).toBe('John Bogle');
    });
  });

  describe('KnowledgeEdge', () => {
    it('should create prerequisite edge', () => {
      const edge: KnowledgeEdge = {
        id: 'edge_pe_math',
        from: 'node_basic_math',
        to: 'node_pe_ratio',
        type: 'prerequisite',
        strength: 0.8,
        description: 'Basic math needed to understand P/E calculations',
        metadata: {
          createdAt: new Date(),
          confidence: 1.0,
        },
      };

      expect(edge.type).toBe('prerequisite');
      expect(edge.strength).toBe(0.8);
    });

    it('should create relates_to edge', () => {
      const edge: KnowledgeEdge = {
        id: 'edge_pe_peg',
        from: 'node_pe_ratio',
        to: 'node_peg_ratio',
        type: 'relates_to',
        strength: 0.9,
        description: 'PEG is P/E adjusted for growth rate',
        bidirectional: true,
        metadata: {
          createdAt: new Date(),
          confidence: 1.0,
        },
      };

      expect(edge.type).toBe('relates_to');
      expect(edge.bidirectional).toBe(true);
    });

    it('should create contradicts edge', () => {
      const edge: KnowledgeEdge = {
        id: 'edge_emh_value',
        from: 'node_efficient_market',
        to: 'node_value_investing',
        type: 'contradicts',
        strength: 0.7,
        description: 'EMH suggests value strategies shouldnt work, but they do',
        context: 'Academic vs practical debate',
        metadata: {
          createdAt: new Date(),
          confidence: 0.8,
        },
      };

      expect(edge.type).toBe('contradicts');
      expect(edge.context).toBeDefined();
    });

    it('should support all edge types', () => {
      const edgeTypes: EdgeType[] = [
        'prerequisite',
        'relates_to',
        'contradicts',
        'exemplifies',
        'part_of',
        'derived_from',
        'causes',
        'measures',
      ];

      edgeTypes.forEach((type) => {
        const edge: KnowledgeEdge = {
          id: `edge_test_${type}`,
          from: 'node_a',
          to: 'node_b',
          type,
          strength: 0.5,
          metadata: { createdAt: new Date(), confidence: 1.0 },
        };
        expect(edge.type).toBe(type);
      });
    });
  });
});

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;

  beforeEach(() => {
    service = new KnowledgeGraphService();
  });

  describe('Node Operations', () => {
    it('should add and retrieve node', () => {
      const node: KnowledgeNode = {
        id: 'test_node_1',
        type: 'concept',
        name: 'Test Concept',
        definition: 'A test concept for testing',
        context: { domain: 'test', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.addNode(node);
      const retrieved = service.getNode('test_node_1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Concept');
    });

    it('should search nodes by name', () => {
      service.addNode({
        id: 'node_1',
        type: 'concept',
        name: 'Compound Interest',
        definition: 'Interest on interest',
        context: { domain: 'investing', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      service.addNode({
        id: 'node_2',
        type: 'concept',
        name: 'Simple Interest',
        definition: 'Interest only on principal',
        context: { domain: 'investing', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const results = service.searchNodes('interest');
      expect(results).toHaveLength(2);
    });

    it('should search nodes by alias', () => {
      service.addNode({
        id: 'node_pe',
        type: 'metric',
        name: 'Price-to-Earnings Ratio',
        aliases: ['P/E', 'PE ratio'],
        definition: 'Price divided by earnings',
        context: { domain: 'valuation', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const results = service.searchNodes('P/E');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Price-to-Earnings Ratio');
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      service.addNode({
        id: 'node_a',
        type: 'concept',
        name: 'Concept A',
        definition: 'Test A',
        context: { domain: 'test', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      service.addNode({
        id: 'node_b',
        type: 'concept',
        name: 'Concept B',
        definition: 'Test B',
        context: { domain: 'test', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      service.addNode({
        id: 'node_c',
        type: 'concept',
        name: 'Concept C',
        definition: 'Test C',
        context: { domain: 'test', subdomains: [], difficulty: 'intermediate' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should add and traverse edges', () => {
      service.addEdge({
        id: 'edge_1',
        from: 'node_a',
        to: 'node_b',
        type: 'relates_to',
        strength: 0.8,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      const related = service.getRelatedNodes('node_a');
      expect(related).toHaveLength(1);
      expect(related[0].id).toBe('node_b');
    });

    it('should handle bidirectional edges', () => {
      service.addEdge({
        id: 'edge_bidirectional',
        from: 'node_a',
        to: 'node_b',
        type: 'relates_to',
        strength: 0.8,
        bidirectional: true,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      const relatedFromA = service.getRelatedNodes('node_a');
      const relatedFromB = service.getRelatedNodes('node_b');

      expect(relatedFromA).toHaveLength(1);
      expect(relatedFromB).toHaveLength(1);
    });

    it('should filter by edge type', () => {
      service.addEdge({
        id: 'edge_prereq',
        from: 'node_a',
        to: 'node_b',
        type: 'prerequisite',
        strength: 1.0,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      service.addEdge({
        id: 'edge_relates',
        from: 'node_a',
        to: 'node_c',
        type: 'relates_to',
        strength: 0.5,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      const prerequisites = service.getRelatedNodes('node_a', 'prerequisite');
      expect(prerequisites).toHaveLength(1);
      expect(prerequisites[0].id).toBe('node_b');
    });
  });

  describe('Path Finding', () => {
    beforeEach(() => {
      // Create a learning path: basic -> intermediate -> advanced
      ['basic', 'intermediate', 'advanced', 'expert'].forEach((level, i) => {
        service.addNode({
          id: `node_${level}`,
          type: 'concept',
          name: `${level} concept`,
          definition: `A ${level} level concept`,
          context: {
            domain: 'test',
            subdomains: [],
            difficulty: level as 'beginner' | 'intermediate' | 'advanced',
          },
          metadata: {
            confidence: 1.0,
            sources: [],
            lastVerified: new Date(),
            timesReferenced: 0,
            helpfulnessScore: 0,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // Create prerequisite chain
      service.addEdge({
        id: 'edge_1',
        from: 'node_basic',
        to: 'node_intermediate',
        type: 'prerequisite',
        strength: 1.0,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      service.addEdge({
        id: 'edge_2',
        from: 'node_intermediate',
        to: 'node_advanced',
        type: 'prerequisite',
        strength: 1.0,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      service.addEdge({
        id: 'edge_3',
        from: 'node_advanced',
        to: 'node_expert',
        type: 'prerequisite',
        strength: 1.0,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });
    });

    it('should find learning path', () => {
      const path = service.findPath('node_basic', 'node_expert');
      expect(path).toHaveLength(4);
      expect(path[0]).toBe('node_basic');
      expect(path[3]).toBe('node_expert');
    });

    it('should return empty for unreachable nodes', () => {
      service.addNode({
        id: 'node_isolated',
        type: 'concept',
        name: 'Isolated',
        definition: 'Not connected',
        context: { domain: 'test', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 0,
          helpfulnessScore: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const path = service.findPath('node_basic', 'node_isolated');
      expect(path).toHaveLength(0);
    });
  });

  describe('Learning Recommendations', () => {
    beforeEach(() => {
      // Add nodes with different difficulties
      service.addNode({
        id: 'node_saving',
        type: 'concept',
        name: 'Saving',
        definition: 'Setting money aside',
        context: { domain: 'basics', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 100,
          helpfulnessScore: 0.9,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      service.addNode({
        id: 'node_budgeting',
        type: 'concept',
        name: 'Budgeting',
        definition: 'Planning spending',
        context: { domain: 'basics', subdomains: [], difficulty: 'beginner' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 80,
          helpfulnessScore: 0.85,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      service.addNode({
        id: 'node_investing',
        type: 'concept',
        name: 'Investing',
        definition: 'Putting money to work',
        context: { domain: 'investing', subdomains: [], difficulty: 'intermediate' },
        metadata: {
          confidence: 1.0,
          sources: [],
          lastVerified: new Date(),
          timesReferenced: 150,
          helpfulnessScore: 0.88,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Saving is prerequisite for investing
      service.addEdge({
        id: 'edge_save_invest',
        from: 'node_saving',
        to: 'node_investing',
        type: 'prerequisite',
        strength: 0.9,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });

      // Budgeting relates to saving
      service.addEdge({
        id: 'edge_budget_save',
        from: 'node_budgeting',
        to: 'node_saving',
        type: 'relates_to',
        strength: 0.7,
        bidirectional: true,
        metadata: { createdAt: new Date(), confidence: 1.0 },
      });
    });

    it('should recommend next concepts based on mastered topics', () => {
      const recommendations = service.getRecommendations(['node_saving'], 'intermediate');

      // Should recommend investing since saving is mastered and prerequisite
      expect(recommendations.some((r) => r.id === 'node_investing')).toBe(true);
    });

    it('should filter by difficulty', () => {
      const beginnerRecs = service.getRecommendations([], 'beginner');
      expect(beginnerRecs.every((r) => r.context.difficulty === 'beginner')).toBe(true);
    });
  });
});

describe('Seed Data', () => {
  it('should provide core financial concepts', () => {
    const nodes = getFinancialSeedNodes();
    expect(nodes.length).toBeGreaterThan(40);

    // Check for essential concepts
    const nodeIds = nodes.map((n) => n.id);
    expect(nodeIds).toContain('compound_interest');
    expect(nodeIds).toContain('index_funds');
    expect(nodeIds).toContain('expense_ratio');
    expect(nodeIds).toContain('diversification');
    expect(nodeIds).toContain('dollar_cost_averaging');
    expect(nodeIds).toContain('asset_allocation');
  });

  it('should provide relationship edges', () => {
    const edges = getFinancialSeedEdges();
    expect(edges.length).toBeGreaterThan(30);

    // Check for essential relationships
    const edgeTypes = new Set(edges.map((e) => e.type));
    expect(edgeTypes.has('prerequisite')).toBe(true);
    expect(edgeTypes.has('relates_to')).toBe(true);
    expect(edgeTypes.has('part_of')).toBe(true);
  });

  it('should have consistent references', () => {
    const nodes = getFinancialSeedNodes();
    const edges = getFinancialSeedEdges();
    const nodeIds = new Set(nodes.map((n) => n.id));

    // All edges should reference existing nodes
    edges.forEach((edge) => {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    });
  });

  it('should cover all major domains', () => {
    const nodes = getFinancialSeedNodes();
    const domains = new Set(nodes.map((n) => n.context.domain));

    expect(domains.has('basics')).toBe(true);
    expect(domains.has('investing')).toBe(true);
    expect(domains.has('valuation')).toBe(true);
    expect(domains.has('behavior')).toBe(true);
  });
});
