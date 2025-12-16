/**
 * Animated Terminal Component
 * Brand-compliant terminal animation for developer portal
 */

class AnimatedTerminal {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      typingSpeed: 50,
      lineDelay: 800,
      cursorBlinkSpeed: 530,
      ...options,
    };
    this.lines = [];
    this.currentLine = 0;
    this.currentChar = 0;
    this.isTyping = false;
    this.cursor = null;

    this.init();
  }

  init() {
    // Parse lines from data attribute or children
    const linesData = this.element.dataset.lines;
    if (linesData) {
      this.lines = JSON.parse(linesData);
    } else {
      this.parseExistingContent();
    }

    // Clear and prepare terminal
    this.element.innerHTML = '';
    this.createTerminalStructure();

    // Start animation after a delay
    setTimeout(() => this.startAnimation(), 500);
  }

  parseExistingContent() {
    const lineElements = this.element.querySelectorAll('.terminal-line');
    lineElements.forEach((el) => {
      const prompt = el.querySelector('.terminal-prompt')?.textContent || '';
      const command = el.querySelector('.terminal-command')?.textContent || '';
      const output = el.querySelector('.terminal-output')?.innerHTML || '';

      if (command) {
        this.lines.push({ type: 'command', prompt, text: command });
      }
      if (output) {
        this.lines.push({ type: 'output', text: output });
      }
    });
  }

  createTerminalStructure() {
    // Terminal header
    const header = document.createElement('div');
    header.className = 'terminal-header';
    header.innerHTML = `
      <div class="code-dots">
        <span class="code-dot code-dot-red"></span>
        <span class="code-dot code-dot-yellow"></span>
        <span class="code-dot code-dot-green"></span>
      </div>
      <span class="terminal-title">Terminal</span>
    `;

    // Terminal body
    this.body = document.createElement('div');
    this.body.className = 'terminal-body';

    this.element.appendChild(header);
    this.element.appendChild(this.body);
  }

  async startAnimation() {
    this.isTyping = true;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];

      if (line.type === 'command') {
        await this.typeCommand(line);
      } else if (line.type === 'output') {
        await this.showOutput(line);
      }

      // Delay between lines
      if (i < this.lines.length - 1) {
        await this.delay(this.options.lineDelay);
      }
    }

    // Show final cursor
    this.showFinalCursor();
    this.isTyping = false;
  }

  async typeCommand(line) {
    const lineEl = document.createElement('div');
    lineEl.className = 'terminal-line';

    const promptEl = document.createElement('span');
    promptEl.className = 'terminal-prompt';
    promptEl.textContent = line.prompt || '$';

    const commandEl = document.createElement('span');
    commandEl.className = 'terminal-command';

    // Cursor element
    const cursorEl = document.createElement('span');
    cursorEl.className = 'terminal-cursor';

    lineEl.appendChild(promptEl);
    lineEl.appendChild(commandEl);
    lineEl.appendChild(cursorEl);
    this.body.appendChild(lineEl);

    // Type each character
    for (let i = 0; i < line.text.length; i++) {
      commandEl.textContent += line.text[i];
      await this.delay(this.options.typingSpeed + Math.random() * 30);
    }

    // Remove cursor after typing
    cursorEl.remove();
  }

  async showOutput(line) {
    const outputEl = document.createElement('div');
    outputEl.className = 'terminal-output';
    outputEl.innerHTML = line.text;
    outputEl.style.opacity = '0';
    this.body.appendChild(outputEl);

    // Fade in output
    await this.delay(100);
    outputEl.style.transition = 'opacity 0.2s ease';
    outputEl.style.opacity = '1';
  }

  showFinalCursor() {
    const lineEl = document.createElement('div');
    lineEl.className = 'terminal-line';
    lineEl.innerHTML = `
      <span class="terminal-prompt">$</span>
      <span class="terminal-cursor"></span>
    `;
    this.body.appendChild(lineEl);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Auto-initialize terminals
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.terminal[data-animate]').forEach((el) => {
    new AnimatedTerminal(el);
  });
});

// Export for manual use
window.AnimatedTerminal = AnimatedTerminal;






