/**
 * FERNI VISUALIZATION EXPORT & SHARE
 * ===================================
 * World-class export and sharing capabilities for data stories.
 * Makes insights shareable and actionable.
 *
 * Philosophy:
 * - Every insight deserves to be shared
 * - Export preserves the story, not just the data
 * - Privacy-first: user controls what's shared
 * - Multiple formats for different needs
 *
 * Usage:
 *   import { exportVisualization, shareVisualization } from './export-share.js';
 *
 *   // Export as image
 *   await exportVisualization(element, { format: 'png' });
 *
 *   // Share to various platforms
 *   await shareVisualization(element, { platform: 'native' });
 */

// ============================================
// EXPORT FORMATS
// ============================================

export const ExportFormat = {
  PNG: 'png',
  SVG: 'svg',
  PDF: 'pdf',
  JSON: 'json',
  CSV: 'csv',
};

// ============================================
// SHARE PLATFORMS
// ============================================

export const SharePlatform = {
  NATIVE: 'native',     // Web Share API
  CLIPBOARD: 'clipboard',
  DOWNLOAD: 'download',
  EMAIL: 'email',
  TWITTER: 'twitter',
  LINKEDIN: 'linkedin',
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  defaultFilename: 'ferni-insight',
  imageQuality: 0.95,
  maxImageWidth: 2400,
  maxImageHeight: 1600,
  watermarkText: 'Created with Ferni',
  brandColor: '#4a6741',
};

// ============================================
// EXPORT FUNCTIONS
// ============================================

/**
 * Export a visualization element
 * @param {HTMLElement} element - Element to export
 * @param {Object} options - Export options
 * @returns {Promise<Blob|string>} Exported data
 */
export async function exportVisualization(element, options = {}) {
  const {
    format = ExportFormat.PNG,
    filename = CONFIG.defaultFilename,
    includeWatermark = true,
    scale = 2,
    backgroundColor = '#ffffff',
  } = options;

  switch (format) {
    case ExportFormat.PNG:
      return await exportAsPNG(element, { filename, includeWatermark, scale, backgroundColor });

    case ExportFormat.SVG:
      return await exportAsSVG(element, { filename, includeWatermark });

    case ExportFormat.PDF:
      return await exportAsPDF(element, { filename, includeWatermark, scale });

    case ExportFormat.JSON:
      return await exportAsJSON(element, { filename });

    case ExportFormat.CSV:
      return await exportAsCSV(element, { filename });

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Export as PNG using canvas
 */
async function exportAsPNG(element, options) {
  const { filename, includeWatermark, scale, backgroundColor } = options;

  // Use html2canvas-like approach (simplified)
  const canvas = await elementToCanvas(element, { scale, backgroundColor });

  if (includeWatermark) {
    addWatermark(canvas);
  }

  // Convert to blob and download
  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png', CONFIG.imageQuality);
  });

  downloadBlob(blob, `${filename}.png`);
  return blob;
}

/**
 * Export as SVG
 */
async function exportAsSVG(element, options) {
  const { filename, includeWatermark } = options;

  // Clone the element
  const clone = element.cloneNode(true);

  // Get computed styles
  const styles = getComputedStyles(element);

  // Create SVG wrapper
  const rect = element.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(rect.width));
  svg.setAttribute('height', String(rect.height));
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  // Create foreignObject to embed HTML
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');

  // Add styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  clone.insertBefore(styleEl, clone.firstChild);

  foreignObject.appendChild(clone);
  svg.appendChild(foreignObject);

  // Add watermark if requested
  if (includeWatermark) {
    const watermark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    watermark.setAttribute('x', String(rect.width - 10));
    watermark.setAttribute('y', String(rect.height - 10));
    watermark.setAttribute('text-anchor', 'end');
    watermark.setAttribute('fill', CONFIG.brandColor);
    watermark.setAttribute('font-size', '12');
    watermark.setAttribute('opacity', '0.5');
    watermark.textContent = CONFIG.watermarkText;
    svg.appendChild(watermark);
  }

  // Serialize and download
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });

  downloadBlob(blob, `${filename}.svg`);
  return svgString;
}

/**
 * Export as PDF (basic implementation)
 */
async function exportAsPDF(element, options) {
  const { filename, includeWatermark, scale } = options;

  // For a real implementation, you'd use a library like jsPDF or pdfmake
  // This is a simplified version that converts to image first
  const canvas = await elementToCanvas(element, { scale, backgroundColor: '#ffffff' });

  if (includeWatermark) {
    addWatermark(canvas);
  }

  // In a real implementation, this would create a PDF
  // For now, we'll just download as PNG with .pdf extension (placeholder)
  console.warn('PDF export requires a PDF library. Exporting as PNG.');

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png', CONFIG.imageQuality);
  });

  downloadBlob(blob, `${filename}.png`);
  return blob;
}

/**
 * Export data as JSON
 */
async function exportAsJSON(element, options) {
  const { filename } = options;

  // Extract data from element
  const data = extractDataFromElement(element);

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  downloadBlob(blob, `${filename}.json`);
  return json;
}

/**
 * Export data as CSV
 */
async function exportAsCSV(element, options) {
  const { filename } = options;

  // Extract data from element
  const data = extractDataFromElement(element);

  // Convert to CSV
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv' });

  downloadBlob(blob, `${filename}.csv`);
  return csv;
}

// ============================================
// SHARE FUNCTIONS
// ============================================

/**
 * Share a visualization
 * @param {HTMLElement} element - Element to share
 * @param {Object} options - Share options
 */
export async function shareVisualization(element, options = {}) {
  const {
    platform = SharePlatform.NATIVE,
    title = 'My Ferni Insight',
    text = 'Check out this insight from Ferni',
    url = window.location.href,
  } = options;

  switch (platform) {
    case SharePlatform.NATIVE:
      return await shareNative(element, { title, text, url });

    case SharePlatform.CLIPBOARD:
      return await copyToClipboard(element, { title, text, url });

    case SharePlatform.DOWNLOAD:
      return await exportVisualization(element, { format: ExportFormat.PNG });

    case SharePlatform.EMAIL:
      return shareViaEmail({ title, text, url });

    case SharePlatform.TWITTER:
      return shareToTwitter({ title, text, url });

    case SharePlatform.LINKEDIN:
      return shareToLinkedIn({ title, text, url });

    default:
      throw new Error(`Unsupported share platform: ${platform}`);
  }
}

/**
 * Share using Web Share API
 */
async function shareNative(element, options) {
  const { title, text, url } = options;

  // Check if Web Share API is available
  if (!navigator.share) {
    console.warn('Web Share API not available. Falling back to clipboard.');
    return copyToClipboard(element, options);
  }

  // Try to share with image
  try {
    const canvas = await elementToCanvas(element, { scale: 2, backgroundColor: '#ffffff' });
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', CONFIG.imageQuality);
    });

    const file = new File([blob], 'insight.png', { type: 'image/png' });

    await navigator.share({
      title,
      text,
      url,
      files: [file],
    });

    return { success: true, method: 'native' };
  } catch (error) {
    // If file sharing fails, try without file
    if (error.name !== 'AbortError') {
      try {
        await navigator.share({ title, text, url });
        return { success: true, method: 'native-text' };
      } catch (innerError) {
        if (innerError.name !== 'AbortError') {
          throw innerError;
        }
      }
    }

    return { success: false, method: 'native', error: 'Share cancelled' };
  }
}

/**
 * Copy visualization to clipboard
 */
async function copyToClipboard(element, options) {
  const { title, text, url } = options;

  try {
    // Try to copy image first
    const canvas = await elementToCanvas(element, { scale: 2, backgroundColor: '#ffffff' });
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', CONFIG.imageQuality);
    });

    // Check if ClipboardItem is available
    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      return { success: true, method: 'clipboard-image' };
    }
  } catch (error) {
    // Fall back to text
    console.warn('Image clipboard failed, falling back to text');
  }

  // Copy text fallback
  const shareText = `${title}\n\n${text}\n\n${url}`;
  await navigator.clipboard.writeText(shareText);

  return { success: true, method: 'clipboard-text' };
}

/**
 * Share via email
 */
function shareViaEmail(options) {
  const { title, text, url } = options;

  const subject = encodeURIComponent(title);
  const body = encodeURIComponent(`${text}\n\n${url}`);
  const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;

  window.open(mailtoUrl, '_blank');
  return { success: true, method: 'email' };
}

/**
 * Share to Twitter/X
 */
function shareToTwitter(options) {
  const { text, url } = options;

  const tweetText = encodeURIComponent(text);
  const tweetUrl = encodeURIComponent(url);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;

  window.open(twitterUrl, '_blank', 'width=550,height=420');
  return { success: true, method: 'twitter' };
}

/**
 * Share to LinkedIn
 */
function shareToLinkedIn(options) {
  const { url } = options;

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  window.open(linkedInUrl, '_blank', 'width=550,height=420');
  return { success: true, method: 'linkedin' };
}

// ============================================
// SHARE MENU COMPONENT
// ============================================

/**
 * Create a share menu component
 * @param {HTMLElement} targetElement - Visualization to share
 * @param {Object} options - Menu options
 * @returns {HTMLElement} Share menu element
 */
export function createShareMenu(targetElement, options = {}) {
  const {
    title = 'Share',
    includeDownload = true,
    includeCopy = true,
    includeSocial = true,
  } = options;

  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', title);

  // Header
  const header = document.createElement('div');
  header.className = 'share-menu-header';
  header.textContent = title;
  menu.appendChild(header);

  // Options container
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'share-menu-options';

  // Native share (if available)
  if (navigator.share) {
    optionsContainer.appendChild(createShareOption({
      icon: '📤',
      label: 'Share...',
      onClick: () => shareVisualization(targetElement, { platform: SharePlatform.NATIVE }),
    }));
  }

  // Copy to clipboard
  if (includeCopy) {
    optionsContainer.appendChild(createShareOption({
      icon: '📋',
      label: 'Copy to clipboard',
      onClick: async () => {
        const result = await shareVisualization(targetElement, { platform: SharePlatform.CLIPBOARD });
        showFeedback(menu, result.method === 'clipboard-image' ? 'Image copied!' : 'Link copied!');
      },
    }));
  }

  // Download
  if (includeDownload) {
    optionsContainer.appendChild(createShareOption({
      icon: '⬇️',
      label: 'Download image',
      onClick: () => exportVisualization(targetElement, { format: ExportFormat.PNG }),
    }));
  }

  // Social platforms
  if (includeSocial) {
    const socialDivider = document.createElement('div');
    socialDivider.className = 'share-menu-divider';
    optionsContainer.appendChild(socialDivider);

    optionsContainer.appendChild(createShareOption({
      icon: '✉️',
      label: 'Email',
      onClick: () => shareVisualization(targetElement, { platform: SharePlatform.EMAIL }),
    }));

    optionsContainer.appendChild(createShareOption({
      icon: '🐦',
      label: 'Twitter / X',
      onClick: () => shareVisualization(targetElement, { platform: SharePlatform.TWITTER }),
    }));

    optionsContainer.appendChild(createShareOption({
      icon: '💼',
      label: 'LinkedIn',
      onClick: () => shareVisualization(targetElement, { platform: SharePlatform.LINKEDIN }),
    }));
  }

  menu.appendChild(optionsContainer);

  return menu;
}

/**
 * Create a share option button
 */
function createShareOption({ icon, label, onClick }) {
  const button = document.createElement('button');
  button.className = 'share-menu-option';
  button.setAttribute('role', 'menuitem');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'share-menu-option-icon';
  iconSpan.textContent = icon;
  button.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'share-menu-option-label';
  labelSpan.textContent = label;
  button.appendChild(labelSpan);

  button.addEventListener('click', onClick);

  return button;
}

/**
 * Show feedback message in menu
 */
function showFeedback(menu, message) {
  const existing = menu.querySelector('.share-menu-feedback');
  if (existing) existing.remove();

  const feedback = document.createElement('div');
  feedback.className = 'share-menu-feedback';
  feedback.textContent = message;
  menu.appendChild(feedback);

  setTimeout(() => feedback.remove(), 2000);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert element to canvas (simplified html2canvas-like approach)
 */
async function elementToCanvas(element, options) {
  const { scale, backgroundColor } = options;

  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width * scale, CONFIG.maxImageWidth);
  const height = Math.min(rect.height * scale, CONFIG.maxImageHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // For a real implementation, you'd use html2canvas or similar
  // This is a simplified version that works for SVG elements
  const svgElements = element.querySelectorAll('svg');

  if (svgElements.length > 0) {
    // Clone and render SVG
    const svgElement = svgElements[0];
    const svgClone = svgElement.cloneNode(true);

    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Load and draw
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = svgUrl;
    });

    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
  }

  return canvas;
}

/**
 * Add watermark to canvas
 */
function addWatermark(canvas) {
  const ctx = canvas.getContext('2d');

  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = CONFIG.brandColor;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  ctx.fillText(CONFIG.watermarkText, canvas.width - 16, canvas.height - 16);
  ctx.globalAlpha = 1;
}

/**
 * Get computed styles as CSS string
 */
function getComputedStyles(element) {
  // Get all stylesheets
  const styles = [];

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        styles.push(rule.cssText);
      }
    } catch (e) {
      // Cross-origin stylesheet, skip
    }
  }

  return styles.join('\n');
}

/**
 * Extract data from visualization element
 */
function extractDataFromElement(element) {
  const data = {
    type: element.dataset.vizType || 'unknown',
    title: element.querySelector('.viz-title')?.textContent || '',
    timestamp: new Date().toISOString(),
    dataPoints: [],
  };

  // Try to find data points
  const dataElements = element.querySelectorAll('[data-value]');
  dataElements.forEach(el => {
    data.dataPoints.push({
      label: el.dataset.label || el.textContent,
      value: parseFloat(el.dataset.value) || el.dataset.value,
    });
  });

  return data;
}

/**
 * Convert data object to CSV string
 */
function convertToCSV(data) {
  if (!data.dataPoints || data.dataPoints.length === 0) {
    return 'No data available';
  }

  const headers = Object.keys(data.dataPoints[0]);
  const rows = data.dataPoints.map(point =>
    headers.map(header => {
      const value = point[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Download a blob as a file
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// CSS STYLES (inject via JS)
// ============================================

export function injectShareStyles() {
  if (document.getElementById('share-menu-styles')) return;

  const style = document.createElement('style');
  style.id = 'share-menu-styles';
  style.textContent = `
    .share-menu {
      background: var(--color-bg-elevated, #fff);
      border: 1px solid var(--color-border-default, rgba(0,0,0,0.1));
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-xl, 0 20px 25px rgba(0,0,0,0.1));
      padding: var(--space-2, 0.5rem);
      min-width: 200px;
    }

    .share-menu-header {
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      font-weight: 600;
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, #666);
    }

    .share-menu-options {
      display: flex;
      flex-direction: column;
    }

    .share-menu-option {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: none;
      background: none;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      font-size: var(--font-size-base, 1rem);
      text-align: left;
      width: 100%;
      transition: background 0.15s ease-out;
    }

    .share-menu-option:hover {
      background: var(--color-bg-hover, rgba(0,0,0,0.05));
    }

    .share-menu-option-icon {
      font-size: 1.2em;
    }

    .share-menu-divider {
      height: 1px;
      background: var(--color-border-default, rgba(0,0,0,0.1));
      margin: var(--space-2, 0.5rem) 0;
    }

    .share-menu-feedback {
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      color: var(--color-success, #34c759);
      font-size: var(--font-size-sm, 0.875rem);
      text-align: center;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  document.head.appendChild(style);
}

// ============================================
// EXPORT
// ============================================

export default {
  exportVisualization,
  shareVisualization,
  createShareMenu,
  injectShareStyles,
  ExportFormat,
  SharePlatform,
};
