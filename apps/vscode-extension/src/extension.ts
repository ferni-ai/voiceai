import * as vscode from 'vscode';

// Token data (would be loaded from files in production)
const COLOR_TOKENS: Record<string, string> = {
  '--color-ferni': '#4a6741',
  '--color-peter': '#3a6b73',
  '--color-alex': '#5a6b8a',
  '--color-maya': '#a67a6a',
  '--color-jordan': '#c4856a',
  '--color-nayan': '#b8956a',
  '--color-text-primary': '#2C2520',
  '--color-text-secondary': '#5C544A',
  '--color-text-muted': '#8A847A',
  '--color-background': '#FFFCF8',
  '--color-background-elevated': '#FFFFFF',
  '--color-background-subtle': '#F5F1E8',
  '--color-success': '#4a6741',
  '--color-warning': '#a08054',
  '--color-error': '#a05454',
  '--color-info': '#546080',
  '--color-border': 'rgba(44, 37, 32, 0.1)',
};

const DURATION_TOKENS: Record<string, string> = {
  '--duration-instant': '50ms',
  '--duration-faster': '100ms',
  '--duration-fast': '150ms',
  '--duration-normal': '250ms',
  '--duration-slow': '400ms',
  '--duration-deliberate': '600ms',
  '--duration-dramatic': '800ms',
  '--duration-celebration': '1000ms',
};

const EASING_TOKENS: Record<string, string> = {
  '--ease-standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--ease-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--ease-spring-gentle': 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  '--ease-bounce': 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
  '--ease-gentle': 'cubic-bezier(0.4, 0, 0.6, 1)',
  '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
};

// Combine all tokens
const ALL_TOKENS = { ...COLOR_TOKENS, ...DURATION_TOKENS, ...EASING_TOKENS };

// Color decorator type
const colorDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * Activate extension
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Ferni Design System extension activated');

  // Register completion provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    ['css', 'scss', 'less', 'typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'vue', 'svelte'],
    {
      provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        // Check if we're in a var() context
        if (!linePrefix.includes('var(')) {
          return undefined;
        }

        const completions: vscode.CompletionItem[] = [];

        // Add color tokens
        for (const [token, value] of Object.entries(COLOR_TOKENS)) {
          const item = new vscode.CompletionItem(token, vscode.CompletionItemKind.Color);
          item.detail = value;
          item.documentation = new vscode.MarkdownString(`**Ferni Color Token**\n\n\`${value}\``);
          item.insertText = token;
          // Add color preview in completion
          if (value.startsWith('#')) {
            item.kind = vscode.CompletionItemKind.Color;
          }
          completions.push(item);
        }

        // Add duration tokens
        for (const [token, value] of Object.entries(DURATION_TOKENS)) {
          const item = new vscode.CompletionItem(token, vscode.CompletionItemKind.Value);
          item.detail = value;
          item.documentation = new vscode.MarkdownString(`**Ferni Duration Token**\n\n\`${value}\``);
          item.insertText = token;
          completions.push(item);
        }

        // Add easing tokens
        for (const [token, value] of Object.entries(EASING_TOKENS)) {
          const item = new vscode.CompletionItem(token, vscode.CompletionItemKind.Value);
          item.detail = value;
          item.documentation = new vscode.MarkdownString(`**Ferni Easing Token**\n\n\`${value}\``);
          item.insertText = token;
          completions.push(item);
        }

        return completions;
      },
    },
    '-' // Trigger on hyphen (start of CSS variable)
  );

  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    ['css', 'scss', 'less', 'typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /--[\w-]+/);
        if (!range) {
          return undefined;
        }

        const word = document.getText(range);
        const value = ALL_TOKENS[word];
        
        if (!value) {
          return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**Ferni Token**\n\n`);
        markdown.appendMarkdown(`\`${word}\`\n\n`);
        markdown.appendMarkdown(`**Value:** \`${value}\`\n\n`);
        
        // Add color swatch for color tokens
        if (value.startsWith('#') || value.startsWith('rgba')) {
          markdown.appendMarkdown(`**Preview:** `);
          markdown.supportHtml = true;
          markdown.appendMarkdown(`<span style="background-color:${value};width:16px;height:16px;display:inline-block;border-radius:3px;"></span>`);
        }

        return new vscode.Hover(markdown, range);
      },
    }
  );

  // Register diagnostics for brand validation
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('ferni');
  
  // Validate on save
  const validateOnSave = vscode.workspace.onDidSaveTextDocument((document) => {
    if (!vscode.workspace.getConfiguration('ferniDesignSystem').get('validation.enabled')) {
      return;
    }
    validateDocument(document, diagnosticCollection);
  });

  // Validate on open
  const validateOnOpen = vscode.workspace.onDidOpenTextDocument((document) => {
    if (!vscode.workspace.getConfiguration('ferniDesignSystem').get('validation.enabled')) {
      return;
    }
    validateDocument(document, diagnosticCollection);
  });

  // Register commands
  const showTokensCommand = vscode.commands.registerCommand('ferni.showTokens', () => {
    const panel = vscode.window.createWebviewPanel(
      'ferniTokens',
      'Ferni Design Tokens',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    
    panel.webview.html = getTokensWebviewContent();
  });

  const validateFileCommand = vscode.commands.registerCommand('ferni.validateFile', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      validateDocument(editor.document, diagnosticCollection);
      vscode.window.showInformationMessage('Ferni: Validation complete');
    }
  });

  const openDesignSystemCommand = vscode.commands.registerCommand('ferni.openDesignSystem', () => {
    vscode.env.openExternal(vscode.Uri.parse('https://design.ferni.ai'));
  });

  // Add color decorations
  const updateDecorations = (editor: vscode.TextEditor | undefined) => {
    if (!editor) return;
    if (!vscode.workspace.getConfiguration('ferniDesignSystem').get('colorPreview.enabled')) return;

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];
    const text = document.getText();
    
    // Find all color token usages
    const regex = /var\((--color-[\w-]+)\)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const token = match[1];
      const color = COLOR_TOKENS[token];
      
      if (color && color.startsWith('#')) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        
        decorations.push({
          range: new vscode.Range(startPos, endPos),
          renderOptions: {
            before: {
              contentText: '■',
              color,
              margin: '0 4px 0 0',
            },
          },
        });
      }
    }
    
    editor.setDecorations(colorDecorationType, decorations);
  };

  // Update decorations on editor change
  vscode.window.onDidChangeActiveTextEditor(updateDecorations);
  vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor);
    }
  });

  // Initial decoration
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }

  // Register all disposables
  context.subscriptions.push(
    completionProvider,
    hoverProvider,
    diagnosticCollection,
    validateOnSave,
    validateOnOpen,
    showTokensCommand,
    validateFileCommand,
    openDesignSystemCommand
  );
}

/**
 * Validate document for brand compliance
 */
function validateDocument(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection
) {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  
  // Find hardcoded hex colors
  const hexRegex = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;
  let match;
  
  while ((match = hexRegex.exec(text)) !== null) {
    const color = match[0].toLowerCase();
    const isTokenColor = Object.values(COLOR_TOKENS).some(
      (tokenColor) => tokenColor.toLowerCase() === color
    );
    
    // Skip if it's a token definition or in a comment
    const lineText = document.lineAt(document.positionAt(match.index).line).text;
    if (lineText.includes('--color-') || lineText.trim().startsWith('//') || lineText.trim().startsWith('*')) {
      continue;
    }
    
    if (!isTokenColor) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(startPos, endPos),
        `Hardcoded color "${color}" - consider using a Ferni design token`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.code = 'ferni/off-brand-color';
      diagnostic.source = 'Ferni Design System';
      
      diagnostics.push(diagnostic);
    }
  }
  
  diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Get tokens webview content
 */
function getTokensWebviewContent(): string {
  const colorRows = Object.entries(COLOR_TOKENS)
    .map(([token, value]) => `
      <tr>
        <td><code>${token}</code></td>
        <td style="background: ${value}; width: 24px; height: 24px; border-radius: 4px;"></td>
        <td><code>${value}</code></td>
      </tr>
    `)
    .join('');

  const durationRows = Object.entries(DURATION_TOKENS)
    .map(([token, value]) => `
      <tr>
        <td><code>${token}</code></td>
        <td><code>${value}</code></td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: system-ui, sans-serif;
      padding: 20px;
      color: var(--vscode-foreground);
    }
    h2 {
      margin-top: 24px;
      margin-bottom: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>Ferni Design Tokens</h1>
  
  <h2>Colors</h2>
  <table>
    <tr><th>Token</th><th>Preview</th><th>Value</th></tr>
    ${colorRows}
  </table>
  
  <h2>Durations</h2>
  <table>
    <tr><th>Token</th><th>Value</th></tr>
    ${durationRows}
  </table>
</body>
</html>`;
}

/**
 * Deactivate extension
 */
export function deactivate() {
  console.log('Ferni Design System extension deactivated');
}
