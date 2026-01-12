/**
 * Visual Workflow Editor
 *
 * Provides a canvas-based visual editor for workflow DAGs.
 * Uses safe DOM manipulation methods (no innerHTML).
 *
 * @module developers-portal/workflow-visual-editor
 */

// Helper to read CSS variable with fallback
function getCssVar(name, fallback) {
  if (typeof document !== 'undefined') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }
  return fallback;
}

// Node type configurations - colors from Ferni design tokens
// Colors are resolved at runtime from CSS variables
function getNodeTypeConfig() {
  return {
    start: { label: 'Start', color: getCssVar('--success', '#6bc48f'), icon: 'play' },
    end: { label: 'End', color: getCssVar('--text-muted', '#ddd6cc'), icon: 'stop' },
    mcp_call: { label: 'MCP Call', color: getCssVar('--info', '#7da6cf'), icon: 'server' },
    webhook: { label: 'Webhook', color: getCssVar('--persona-amara', '#7B6BA8'), icon: 'globe' },
    llm_prompt: { label: 'LLM Prompt', color: getCssVar('--warning', '#e0b860'), icon: 'chat' },
    condition: { label: 'Condition', color: getCssVar('--error', '#e07575'), icon: 'branch' },
    parallel: { label: 'Parallel', color: getCssVar('--persona-peter', '#3a6b73'), icon: 'split' },
    join: { label: 'Join', color: getCssVar('--persona-peter', '#3a6b73'), icon: 'merge' },
    wait: { label: 'Wait', color: getCssVar('--accent-primary', '#d4a84a'), icon: 'clock' },
    set_variable: { label: 'Set Variable', color: getCssVar('--persona-sasha', '#E07B53'), icon: 'variable' },
    activity: { label: 'Activity', color: getCssVar('--persona-marcus', '#2D5A4A'), icon: 'activity' },
    sub_workflow: { label: 'Sub-Workflow', color: getCssVar('--persona-eli', '#6B5B95'), icon: 'workflow' },
  };
}

// Cache for resolved config (populated on first access)
let NODE_TYPE_CONFIG = null;
function getNodeConfig() {
  if (!NODE_TYPE_CONFIG) {
    NODE_TYPE_CONFIG = getNodeTypeConfig();
  }
  return NODE_TYPE_CONFIG;
}

// SVG icon paths
const ICON_PATHS = {
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  server: 'M4 6h16M4 12h16M4 18h16M6 6v12M18 6v12',
  globe: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  branch: 'M7 7v10M17 17V7M7 12h10',
  split: 'M4 12h8m0 0l-4-4m4 4l-4 4M12 12h8m-4-4l4 4-4 4',
  merge: 'M4 8l4 4-4 4M20 8l-4 4 4 4M8 12h8',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  variable: 'M4 4h4l4 8-4 8H4l4-8-4-8zm8 0h4l4 8-4 8h-4l4-8-4-8z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  workflow: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4',
};

/**
 * WorkflowCanvas - Visual workflow editor using SVG
 */
class WorkflowCanvas {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error('Container not found: ' + containerId);
    }

    this.nodes = new Map();
    this.edges = [];
    this.selectedNode = null;
    this.dragState = null;
    this.canvasOffset = { x: 0, y: 0 };
    this.scale = 1;

    this.nodeWidth = 180;
    this.nodeHeight = 60;
    this.gridSize = 20;

    this.init();
  }

  init() {
    // Create SVG canvas
    this.svg = this.createSvgElement('svg', {
      width: '100%',
      height: '100%',
      style: 'background: var(--bg-secondary); cursor: grab;',
    });

    // Create definitions for markers (arrows)
    const defs = this.createSvgElement('defs');

    const marker = this.createSvgElement('marker', {
      id: 'arrowhead',
      markerWidth: '10',
      markerHeight: '7',
      refX: '9',
      refY: '3.5',
      orient: 'auto',
    });

    const arrowPath = this.createSvgElement('polygon', {
      points: '0 0, 10 3.5, 0 7',
      fill: 'var(--border-medium)',
    });
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    // Create grid pattern
    const gridPattern = this.createSvgElement('pattern', {
      id: 'grid',
      width: String(this.gridSize),
      height: String(this.gridSize),
      patternUnits: 'userSpaceOnUse',
    });

    const gridLine1 = this.createSvgElement('path', {
      d: 'M ' + this.gridSize + ' 0 L 0 0 0 ' + this.gridSize,
      fill: 'none',
      stroke: 'var(--border-subtle)',
      'stroke-width': '0.5',
    });
    gridPattern.appendChild(gridLine1);
    defs.appendChild(gridPattern);

    // Grid background
    this.gridBg = this.createSvgElement('rect', {
      width: '100%',
      height: '100%',
      fill: 'url(#grid)',
    });
    this.svg.appendChild(this.gridBg);

    // Create layers
    this.edgesLayer = this.createSvgElement('g', { class: 'edges-layer' });
    this.nodesLayer = this.createSvgElement('g', { class: 'nodes-layer' });
    this.svg.appendChild(this.edgesLayer);
    this.svg.appendChild(this.nodesLayer);

    // Append to container
    this.container.appendChild(this.svg);

    // Add event listeners
    this.addEventListeners();
  }

  createSvgElement(tagName, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
    }
    return el;
  }

  addEventListeners() {
    // Canvas panning
    this.svg.addEventListener('mousedown', (e) => {
      if (e.target === this.svg || e.target === this.gridBg) {
        this.svg.style.cursor = 'grabbing';
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
      }
    });

    this.svg.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this.canvasOffset.x += dx;
        this.canvasOffset.y += dy;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.updateTransform();
      } else if (this.dragState) {
        const rect = this.svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.canvasOffset.x) / this.scale;
        const y = (e.clientY - rect.top - this.canvasOffset.y) / this.scale;

        // Snap to grid
        const snappedX = Math.round(x / this.gridSize) * this.gridSize;
        const snappedY = Math.round(y / this.gridSize) * this.gridSize;

        const node = this.nodes.get(this.dragState.nodeId);
        if (node) {
          node.position = {
            x: snappedX - this.dragState.offsetX,
            y: snappedY - this.dragState.offsetY
          };
          this.renderNode(node);
          this.renderEdges();
        }
      }
    });

    this.svg.addEventListener('mouseup', () => {
      this.svg.style.cursor = 'grab';
      this.isPanning = false;
      this.dragState = null;
    });

    this.svg.addEventListener('mouseleave', () => {
      this.isPanning = false;
      this.dragState = null;
    });

    // Zoom with wheel
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.scale = Math.max(0.25, Math.min(2, this.scale * delta));
      this.updateTransform();
    });
  }

  updateTransform() {
    const transform = 'translate(' + this.canvasOffset.x + 'px, ' + this.canvasOffset.y + 'px) scale(' + this.scale + ')';
    this.edgesLayer.style.transform = transform;
    this.nodesLayer.style.transform = transform;
  }

  // Load workflow data
  loadWorkflow(workflow) {
    this.nodes.clear();
    this.edges = [];

    if (!workflow.nodes || workflow.nodes.length === 0) {
      // Create default start node
      this.addNode({
        id: 'start',
        type: 'start',
        name: 'Start',
        position: { x: 300, y: 100 },
        config: {},
      });
      return;
    }

    // Load nodes
    workflow.nodes.forEach((node, index) => {
      const position = node.position || {
        x: 100 + (index % 3) * 220,
        y: 100 + Math.floor(index / 3) * 100,
      };

      this.nodes.set(node.id, {
        ...node,
        position,
      });
    });

    // Load edges
    if (workflow.edges) {
      this.edges = [...workflow.edges];
    }

    this.render();
    this.autoLayout();
  }

  // Auto-layout nodes in a top-to-bottom DAG
  autoLayout() {
    if (this.nodes.size === 0) return;

    // Find entry node
    const entryId = Array.from(this.nodes.keys())[0];
    const visited = new Set();
    const levels = new Map();

    // BFS to assign levels
    const queue = [{ id: entryId, level: 0 }];
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      levels.set(id, level);

      // Find outgoing edges
      this.edges.forEach(edge => {
        if (edge.sourceId === id && !visited.has(edge.targetId)) {
          queue.push({ id: edge.targetId, level: level + 1 });
        }
      });
    }

    // Group by level
    const levelGroups = new Map();
    levels.forEach((level, id) => {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(id);
    });

    // Position nodes
    const startX = 300;
    const startY = 80;
    const levelHeight = 100;
    const nodeSpacing = 220;

    levelGroups.forEach((nodeIds, level) => {
      const totalWidth = nodeIds.length * nodeSpacing;
      const offsetX = startX - totalWidth / 2 + nodeSpacing / 2;

      nodeIds.forEach((id, index) => {
        const node = this.nodes.get(id);
        if (node) {
          node.position = {
            x: offsetX + index * nodeSpacing,
            y: startY + level * levelHeight,
          };
        }
      });
    });

    this.render();
    this.fitToView();
  }

  // Fit canvas to show all nodes
  fitToView() {
    if (this.nodes.size === 0) return;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + this.nodeWidth);
      maxY = Math.max(maxY, node.position.y + this.nodeHeight);
    });

    const padding = 50;
    const rect = this.svg.getBoundingClientRect();
    const scaleX = rect.width / (maxX - minX + padding * 2);
    const scaleY = rect.height / (maxY - minY + padding * 2);

    this.scale = Math.min(1, Math.min(scaleX, scaleY));
    this.canvasOffset = {
      x: -minX * this.scale + padding,
      y: -minY * this.scale + padding,
    };

    this.updateTransform();
  }

  // Add a new node
  addNode(nodeData) {
    const id = nodeData.id || 'node_' + Date.now();
    const node = {
      id,
      type: nodeData.type || 'llm_prompt',
      name: nodeData.name || getNodeConfig()[nodeData.type]?.label || 'Step',
      position: nodeData.position || { x: 300, y: 200 },
      config: nodeData.config || {},
    };

    this.nodes.set(id, node);
    this.renderNode(node);
    return node;
  }

  // Remove a node
  removeNode(nodeId) {
    this.nodes.delete(nodeId);
    this.edges = this.edges.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId);
    this.render();
  }

  // Add an edge
  addEdge(sourceId, targetId, label) {
    const id = 'edge_' + Date.now();
    this.edges.push({ id, sourceId, targetId, label });
    this.renderEdges();
    return id;
  }

  // Remove an edge
  removeEdge(edgeId) {
    this.edges = this.edges.filter(e => e.id !== edgeId);
    this.renderEdges();
  }

  // Render all
  render() {
    // Clear layers
    while (this.nodesLayer.firstChild) {
      this.nodesLayer.removeChild(this.nodesLayer.firstChild);
    }
    while (this.edgesLayer.firstChild) {
      this.edgesLayer.removeChild(this.edgesLayer.firstChild);
    }

    // Render edges first (behind nodes)
    this.renderEdges();

    // Render nodes
    this.nodes.forEach(node => this.renderNode(node));
  }

  // Render a single node
  renderNode(node) {
    // Remove existing
    const existing = document.getElementById('node-' + node.id);
    if (existing) {
      existing.remove();
    }

    const config = getNodeConfig();
    const typeConfig = config[node.type] || config.llm_prompt;
    const { x, y } = node.position;

    // Create group
    const group = this.createSvgElement('g', {
      id: 'node-' + node.id,
      class: 'workflow-node',
      transform: 'translate(' + x + ', ' + y + ')',
      style: 'cursor: move;',
    });

    // Background rect
    const rect = this.createSvgElement('rect', {
      width: String(this.nodeWidth),
      height: String(this.nodeHeight),
      rx: '8',
      ry: '8',
      fill: 'var(--bg-elevated)',
      stroke: this.selectedNode === node.id ? 'var(--accent-primary)' : 'var(--border-medium)',
      'stroke-width': this.selectedNode === node.id ? '2' : '1',
    });
    group.appendChild(rect);

    // Color indicator bar
    const bar = this.createSvgElement('rect', {
      x: '0',
      y: '0',
      width: '4',
      height: String(this.nodeHeight),
      rx: '2',
      ry: '2',
      fill: typeConfig.color,
    });
    group.appendChild(bar);

    // Icon circle
    const iconCircle = this.createSvgElement('circle', {
      cx: '30',
      cy: String(this.nodeHeight / 2),
      r: '16',
      fill: typeConfig.color + '20',
    });
    group.appendChild(iconCircle);

    // Icon
    const icon = this.createSvgElement('path', {
      d: ICON_PATHS[typeConfig.icon] || ICON_PATHS.chat,
      fill: 'none',
      stroke: typeConfig.color,
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      transform: 'translate(18, ' + (this.nodeHeight / 2 - 12) + ') scale(1)',
    });
    group.appendChild(icon);

    // Node name
    const text = this.createSvgElement('text', {
      x: '55',
      y: String(this.nodeHeight / 2 - 5),
      fill: 'var(--text-primary)',
      'font-size': '14',
      'font-weight': '500',
    });
    text.textContent = node.name;
    group.appendChild(text);

    // Type label
    const typeLabel = this.createSvgElement('text', {
      x: '55',
      y: String(this.nodeHeight / 2 + 12),
      fill: 'var(--text-muted)',
      'font-size': '11',
    });
    typeLabel.textContent = typeConfig.label;
    group.appendChild(typeLabel);

    // Connection points
    const inputPoint = this.createSvgElement('circle', {
      cx: String(this.nodeWidth / 2),
      cy: '0',
      r: '6',
      fill: 'var(--bg-elevated)',
      stroke: 'var(--border-medium)',
      'stroke-width': '2',
      class: 'connection-point input',
    });
    group.appendChild(inputPoint);

    const outputPoint = this.createSvgElement('circle', {
      cx: String(this.nodeWidth / 2),
      cy: String(this.nodeHeight),
      r: '6',
      fill: 'var(--bg-elevated)',
      stroke: 'var(--border-medium)',
      'stroke-width': '2',
      class: 'connection-point output',
    });
    group.appendChild(outputPoint);

    // Event handlers
    group.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const rect = this.svg.getBoundingClientRect();
      this.dragState = {
        nodeId: node.id,
        offsetX: (e.clientX - rect.left - this.canvasOffset.x) / this.scale - node.position.x,
        offsetY: (e.clientY - rect.top - this.canvasOffset.y) / this.scale - node.position.y,
      };
    });

    group.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectNode(node.id);
    });

    group.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.onNodeEdit?.(node);
    });

    this.nodesLayer.appendChild(group);
  }

  // Render all edges
  renderEdges() {
    // Clear edges layer
    while (this.edgesLayer.firstChild) {
      this.edgesLayer.removeChild(this.edgesLayer.firstChild);
    }

    this.edges.forEach(edge => {
      const source = this.nodes.get(edge.sourceId);
      const target = this.nodes.get(edge.targetId);

      if (!source || !target) return;

      const x1 = source.position.x + this.nodeWidth / 2;
      const y1 = source.position.y + this.nodeHeight;
      const x2 = target.position.x + this.nodeWidth / 2;
      const y2 = target.position.y;

      // Calculate control points for bezier curve
      const midY = (y1 + y2) / 2;

      const path = this.createSvgElement('path', {
        d: 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2,
        fill: 'none',
        stroke: 'var(--border-medium)',
        'stroke-width': '2',
        'marker-end': 'url(#arrowhead)',
      });

      this.edgesLayer.appendChild(path);

      // Edge label
      if (edge.label) {
        const labelBg = this.createSvgElement('rect', {
          x: String((x1 + x2) / 2 - 30),
          y: String(midY - 10),
          width: '60',
          height: '20',
          rx: '4',
          fill: 'var(--bg-elevated)',
          stroke: 'var(--border-subtle)',
        });
        this.edgesLayer.appendChild(labelBg);

        const label = this.createSvgElement('text', {
          x: String((x1 + x2) / 2),
          y: String(midY + 4),
          fill: 'var(--text-secondary)',
          'font-size': '11',
          'text-anchor': 'middle',
        });
        label.textContent = edge.label;
        this.edgesLayer.appendChild(label);
      }
    });
  }

  // Select a node
  selectNode(nodeId) {
    this.selectedNode = nodeId;
    this.render();
    this.onNodeSelect?.(this.nodes.get(nodeId));
  }

  // Get workflow data
  getWorkflow() {
    const nodes = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      config: node.config,
      position: node.position,
    }));

    return {
      nodes,
      edges: this.edges,
      entryNodeId: nodes.length > 0 ? nodes[0].id : undefined,
      exitNodeIds: nodes.filter(n => n.type === 'end').map(n => n.id),
    };
  }

  // Callbacks
  onNodeSelect = null;
  onNodeEdit = null;
}

// Export for use in workflows page
if (typeof window !== 'undefined') {
  window.WorkflowCanvas = WorkflowCanvas;
  window.getNodeConfig = getNodeConfig;
}

// CommonJS export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkflowCanvas, getNodeConfig };
}
