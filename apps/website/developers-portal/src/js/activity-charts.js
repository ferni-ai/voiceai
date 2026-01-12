/**
 * Activity Charts - Simple SVG visualizations
 *
 * Provides lightweight charts for activity dashboard.
 * Uses safe DOM manipulation (no innerHTML).
 *
 * @module developers-portal/activity-charts
 */

/**
 * Creates a donut chart showing status distribution
 */
function createDonutChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const width = 200;
  const height = 200;
  const radius = 80;
  const innerRadius = 50;
  const centerX = width / 2;
  const centerY = height / 2;

  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

  // Calculate total
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    // Show empty state
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(centerX));
    text.setAttribute('y', String(centerY));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-muted)');
    text.textContent = 'No data';
    svg.appendChild(text);
    container.appendChild(svg);
    return;
  }

  // Draw segments
  let startAngle = -Math.PI / 2; // Start from top

  data.forEach((segment) => {
    const angle = (segment.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    // Calculate arc path
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const x1Inner = centerX + innerRadius * Math.cos(startAngle);
    const y1Inner = centerY + innerRadius * Math.sin(startAngle);
    const x2Inner = centerX + innerRadius * Math.cos(endAngle);
    const y2Inner = centerY + innerRadius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = [
      'M', x1, y1,
      'A', radius, radius, 0, largeArc, 1, x2, y2,
      'L', x2Inner, y2Inner,
      'A', innerRadius, innerRadius, 0, largeArc, 0, x1Inner, y1Inner,
      'Z'
    ].join(' ');

    path.setAttribute('d', d);
    path.setAttribute('fill', segment.color);
    path.style.transition = 'opacity 0.2s';
    path.style.cursor = 'pointer';

    // Hover effects
    path.addEventListener('mouseenter', () => {
      path.style.opacity = '0.8';
    });
    path.addEventListener('mouseleave', () => {
      path.style.opacity = '1';
    });

    // Tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = segment.label + ': ' + segment.value + ' (' + Math.round(segment.value / total * 100) + '%)';
    path.appendChild(title);

    svg.appendChild(path);
    startAngle = endAngle;
  });

  // Center text
  const centerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  centerText.setAttribute('x', String(centerX));
  centerText.setAttribute('y', String(centerY - 5));
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('fill', 'var(--text-primary)');
  centerText.setAttribute('font-size', '24');
  centerText.setAttribute('font-weight', '600');
  centerText.textContent = String(total);
  svg.appendChild(centerText);

  const centerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  centerLabel.setAttribute('x', String(centerX));
  centerLabel.setAttribute('y', String(centerY + 15));
  centerLabel.setAttribute('text-anchor', 'middle');
  centerLabel.setAttribute('fill', 'var(--text-muted)');
  centerLabel.setAttribute('font-size', '11');
  centerLabel.textContent = 'total';
  svg.appendChild(centerLabel);

  container.appendChild(svg);

  // Add legend
  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.flexDirection = 'column';
  legend.style.gap = '8px';
  legend.style.marginTop = '16px';

  data.forEach((segment) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.fontSize = '12px';

    const dot = document.createElement('div');
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.borderRadius = '50%';
    dot.style.background = segment.color;
    item.appendChild(dot);

    const label = document.createElement('span');
    label.style.color = 'var(--text-secondary)';
    label.textContent = segment.label;
    item.appendChild(label);

    const value = document.createElement('span');
    value.style.marginLeft = 'auto';
    value.style.fontWeight = '500';
    value.textContent = String(segment.value);
    item.appendChild(value);

    legend.appendChild(item);
  });

  container.appendChild(legend);
}

/**
 * Creates a sparkline chart showing activity volume over time
 */
function createSparkline(containerId, data, options) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const opts = Object.assign({
    width: 300,
    height: 60,
    lineColor: 'var(--accent-primary)',
    fillColor: 'var(--accent-subtle)',
    showPoints: false,
  }, options || {});

  const { width, height, lineColor, fillColor, showPoints } = opts;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.style.overflow = 'visible';

  if (!data || data.length === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(width / 2));
    text.setAttribute('y', String(height / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-muted)');
    text.setAttribute('font-size', '12');
    text.textContent = 'No data';
    svg.appendChild(text);
    container.appendChild(svg);
    return;
  }

  // Calculate scales
  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);
  const min = 0;
  const range = max - min;

  const padding = 5;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const xScale = (i) => padding + (i / (data.length - 1)) * chartWidth;
  const yScale = (v) => padding + chartHeight - ((v - min) / range) * chartHeight;

  // Build path
  let pathD = 'M ' + xScale(0) + ' ' + yScale(values[0]);
  for (let i = 1; i < values.length; i++) {
    pathD += ' L ' + xScale(i) + ' ' + yScale(values[i]);
  }

  // Fill area
  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const areaD = pathD + ' L ' + xScale(values.length - 1) + ' ' + (height - padding) + ' L ' + xScale(0) + ' ' + (height - padding) + ' Z';
  areaPath.setAttribute('d', areaD);
  areaPath.setAttribute('fill', fillColor);
  areaPath.setAttribute('opacity', '0.3');
  svg.appendChild(areaPath);

  // Line
  const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  linePath.setAttribute('d', pathD);
  linePath.setAttribute('fill', 'none');
  linePath.setAttribute('stroke', lineColor);
  linePath.setAttribute('stroke-width', '2');
  linePath.setAttribute('stroke-linecap', 'round');
  linePath.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(linePath);

  // Points (optional)
  if (showPoints) {
    data.forEach((d, i) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(xScale(i)));
      circle.setAttribute('cy', String(yScale(d.value)));
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', lineColor);

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = d.label + ': ' + d.value;
      circle.appendChild(title);

      svg.appendChild(circle);
    });
  }

  container.appendChild(svg);
}

/**
 * Creates a horizontal bar chart for type breakdown
 */
function createBarChart(containerId, data, options) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const opts = Object.assign({
    barHeight: 24,
    gap: 8,
    maxBars: 5,
  }, options || {});

  if (!data || data.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '12px';
    empty.style.textAlign = 'center';
    empty.style.padding = '20px';
    empty.textContent = 'No data';
    container.appendChild(empty);
    return;
  }

  // Sort and limit
  const sorted = data.slice().sort((a, b) => b.value - a.value).slice(0, opts.maxBars);
  const max = Math.max(...sorted.map(d => d.value), 1);

  sorted.forEach((item) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '12px';
    row.style.marginBottom = opts.gap + 'px';

    // Label
    const label = document.createElement('div');
    label.style.width = '120px';
    label.style.fontSize = '12px';
    label.style.color = 'var(--text-secondary)';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    label.textContent = item.label;
    label.title = item.label;
    row.appendChild(label);

    // Bar container
    const barContainer = document.createElement('div');
    barContainer.style.flex = '1';
    barContainer.style.height = opts.barHeight + 'px';
    barContainer.style.background = 'var(--bg-secondary)';
    barContainer.style.borderRadius = '4px';
    barContainer.style.overflow = 'hidden';

    // Bar
    const bar = document.createElement('div');
    const percent = (item.value / max) * 100;
    bar.style.width = percent + '%';
    bar.style.height = '100%';
    bar.style.background = item.color || 'var(--accent-primary)';
    bar.style.borderRadius = '4px';
    bar.style.transition = 'width 0.3s ease';
    barContainer.appendChild(bar);

    row.appendChild(barContainer);

    // Value
    const value = document.createElement('div');
    value.style.width = '40px';
    value.style.fontSize = '12px';
    value.style.fontWeight = '500';
    value.style.textAlign = 'right';
    value.textContent = String(item.value);
    row.appendChild(value);

    container.appendChild(row);
  });

  // Show remaining count if truncated
  if (data.length > opts.maxBars) {
    const more = document.createElement('div');
    more.style.fontSize = '11px';
    more.style.color = 'var(--text-muted)';
    more.style.textAlign = 'center';
    more.style.marginTop = '8px';
    more.textContent = '+ ' + (data.length - opts.maxBars) + ' more';
    container.appendChild(more);
  }
}

// Export
if (typeof window !== 'undefined') {
  window.createDonutChart = createDonutChart;
  window.createSparkline = createSparkline;
  window.createBarChart = createBarChart;
}
