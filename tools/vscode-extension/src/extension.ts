/**
 * Ferni Agent Builder - VS Code Extension
 *
 * Features:
 * - IntelliSense for persona.manifest.json
 * - Voice preview for selected text
 * - Agent tree view in sidebar
 * - Preview and deploy commands
 * - Snippets for agent development
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ExtensionConfig {
  previewPort: number;
  defaultVoice: string;
  autoValidate: boolean;
  apiEndpoint: string;
}

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('ferni');
  return {
    previewPort: config.get('previewPort', 3333),
    defaultVoice: config.get('defaultVoice', 'bf991597-aacf-4b1a-96fe-4c0cb7fecf96'),
    autoValidate: config.get('autoValidate', true),
    apiEndpoint: config.get('apiEndpoint', 'https://api.ferni.ai'),
  };
}

// ============================================================================
// AGENT TREE VIEW
// ============================================================================

interface AgentTreeItem {
  id: string;
  name: string;
  path: string;
  valid: boolean;
  children?: AgentTreeItem[];
}

class AgentTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.name,
      element.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );

    if (!element.children) {
      // File item
      treeItem.resourceUri = vscode.Uri.file(element.path);
      treeItem.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(element.path)],
      };
    } else {
      // Agent folder
      treeItem.iconPath = new vscode.ThemeIcon(element.valid ? 'check' : 'warning');
      treeItem.contextValue = 'agent';
      treeItem.description = element.valid ? 'valid' : 'issues found';
    }

    return treeItem;
  }

  async getChildren(element?: AgentTreeItem): Promise<AgentTreeItem[]> {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    if (!element) {
      // Root level - find all agents
      const agents: AgentTreeItem[] = [];

      for (const folder of vscode.workspace.workspaceFolders) {
        const bundlesPath = path.join(folder.uri.fsPath, 'src/personas/bundles');

        if (fs.existsSync(bundlesPath)) {
          const entries = fs.readdirSync(bundlesPath, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const manifestPath = path.join(bundlesPath, entry.name, 'persona.manifest.json');
              const hasManifest = fs.existsSync(manifestPath);

              agents.push({
                id: entry.name,
                name: entry.name,
                path: path.join(bundlesPath, entry.name),
                valid: hasManifest,
                children: this.getAgentFiles(path.join(bundlesPath, entry.name)),
              });
            }
          }
        }
      }

      return agents;
    }

    // Return children (files)
    return element.children || [];
  }

  private getAgentFiles(agentPath: string): AgentTreeItem[] {
    const files: AgentTreeItem[] = [];
    const important = ['persona.manifest.json', 'identity/system-prompt.md', 'identity/biography.md'];

    for (const file of important) {
      const filePath = path.join(agentPath, file);
      if (fs.existsSync(filePath)) {
        files.push({
          id: file,
          name: file,
          path: filePath,
          valid: true,
        });
      }
    }

    return files;
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ferni');

async function validateManifest(document: vscode.TextDocument): Promise<void> {
  if (!document.fileName.endsWith('persona.manifest.json')) {
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];

  try {
    const manifest = JSON.parse(document.getText());

    // Check required fields
    const requiredFields = ['identity', 'voice', 'personality'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        const range = new vscode.Range(0, 0, 0, 1);
        diagnostics.push(
          new vscode.Diagnostic(range, `Missing required field: ${field}`, vscode.DiagnosticSeverity.Error)
        );
      }
    }

    // Check identity fields
    if (manifest.identity) {
      if (!manifest.identity.id) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            'Missing identity.id',
            vscode.DiagnosticSeverity.Error
          )
        );
      }
      if (!manifest.identity.name) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            'Missing identity.name',
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }

    // Check voice ID format
    if (manifest.voice?.voice_id) {
      const voiceId = manifest.voice.voice_id;
      if (!voiceId.match(/^[a-f0-9-]{36}$/) && !voiceId.startsWith('${env:')) {
        const text = document.getText();
        const voiceIdIndex = text.indexOf(voiceId);
        const position = document.positionAt(voiceIdIndex);
        const range = new vscode.Range(position, position.translate(0, voiceId.length));

        diagnostics.push(
          new vscode.Diagnostic(
            range,
            'voice_id should be a UUID or environment variable reference',
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    // Check personality values
    if (manifest.personality) {
      for (const [key, value] of Object.entries(manifest.personality)) {
        if (typeof value === 'number' && (value < 0 || value > 1)) {
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 1),
              `personality.${key} should be between 0 and 1`,
              vscode.DiagnosticSeverity.Error
            )
          );
        }
      }
    }
  } catch (e) {
    // JSON parse error - VS Code handles this
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

// ============================================================================
// COMMANDS
// ============================================================================

let previewProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;

async function startPreview(agentId?: string): Promise<void> {
  const config = getConfig();

  if (!agentId) {
    // Try to detect from current file
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const match = editor.document.uri.fsPath.match(/bundles\/([^/]+)\//);
      if (match) {
        agentId = match[1];
      }
    }

    if (!agentId) {
      agentId = await vscode.window.showInputBox({
        prompt: 'Enter agent ID',
        placeHolder: 'my-agent',
      });
    }
  }

  if (!agentId) {
    return;
  }

  // Stop existing preview
  if (previewProcess) {
    previewProcess.kill();
    previewProcess = null;
  }

  // Start preview server
  const terminal = vscode.window.createTerminal({
    name: `Ferni: ${agentId}`,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });

  terminal.sendText(`ferni agent preview ${agentId}`);
  terminal.show();

  // Update status bar
  statusBarItem.text = `$(radio-tower) ${agentId} @ localhost:${config.previewPort}`;
  statusBarItem.show();

  // Open browser after delay
  setTimeout(() => {
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${config.previewPort}`));
  }, 3000);
}

async function stopPreview(): Promise<void> {
  if (previewProcess) {
    previewProcess.kill();
    previewProcess = null;
  }

  statusBarItem.hide();
  vscode.window.showInformationMessage('Preview stopped');
}

async function deployAgent(agentId?: string): Promise<void> {
  if (!agentId) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const match = editor.document.uri.fsPath.match(/bundles\/([^/]+)\//);
      if (match) {
        agentId = match[1];
      }
    }

    if (!agentId) {
      agentId = await vscode.window.showInputBox({
        prompt: 'Enter agent ID to deploy',
        placeHolder: 'my-agent',
      });
    }
  }

  if (!agentId) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Deploying ${agentId}...`,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: 'Validating...' });

      try {
        // Run validation
        await execAsync(`ferni agent validate ${agentId}`);
        progress.report({ increment: 30, message: 'Building...' });

        // Run deploy
        const { stdout } = await execAsync(`ferni agent publish ${agentId}`);
        progress.report({ increment: 100, message: 'Complete!' });

        // Extract URL from output
        const urlMatch = stdout.match(/https:\/\/[^\s]+\.agents\.ferni\.ai/);
        const url = urlMatch ? urlMatch[0] : null;

        const action = url ? await vscode.window.showInformationMessage(
          `✅ Deployed ${agentId}!`,
          'Open URL'
        ) : await vscode.window.showInformationMessage(`✅ Deployed ${agentId}!`);

        if (action === 'Open URL' && url) {
          vscode.env.openExternal(vscode.Uri.parse(url));
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Deploy failed: ${(error as Error).message}`);
      }
    }
  );
}

async function previewVoice(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection);

  if (!text) {
    vscode.window.showWarningMessage('Select text to preview');
    return;
  }

  const config = getConfig();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Generating voice preview...',
      cancellable: false,
    },
    async () => {
      try {
        const response = await fetch(`${config.apiEndpoint}/api/voice/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: config.defaultVoice,
          }),
        });

        if (!response.ok) {
          throw new Error('API error');
        }

        const { audioUrl } = await response.json();

        const action = await vscode.window.showInformationMessage('🔊 Voice preview ready', 'Play');

        if (action === 'Play') {
          vscode.env.openExternal(vscode.Uri.parse(audioUrl));
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Voice preview failed: ${(error as Error).message}`);
      }
    }
  );
}

async function createAgent(): Promise<void> {
  const agentId = await vscode.window.showInputBox({
    prompt: 'Enter agent ID (lowercase, hyphens allowed)',
    placeHolder: 'my-agent',
    validateInput: (value) => {
      if (!/^[a-z][a-z0-9-]*$/.test(value)) {
        return 'Must start with letter, lowercase and hyphens only';
      }
      return null;
    },
  });

  if (!agentId) {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Create: ${agentId}`,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });

  terminal.sendText(`ferni agent init ${agentId}`);
  terminal.show();
}

async function validateAgent(agentId?: string): Promise<void> {
  if (!agentId) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const match = editor.document.uri.fsPath.match(/bundles\/([^/]+)\//);
      if (match) {
        agentId = match[1];
      }
    }
  }

  if (!agentId) {
    return;
  }

  try {
    const { stdout, stderr } = await execAsync(`ferni agent validate ${agentId}`);

    const output = vscode.window.createOutputChannel('Ferni Validation');
    output.clear();
    output.appendLine(`Validation: ${agentId}`);
    output.appendLine('─'.repeat(40));
    output.appendLine(stdout || stderr);
    output.show();
  } catch (error) {
    vscode.window.showErrorMessage(`Validation failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// COMPLETION PROVIDER
// ============================================================================

class ManifestCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    if (!document.fileName.endsWith('persona.manifest.json')) {
      return [];
    }

    const lineText = document.lineAt(position).text;
    const items: vscode.CompletionItem[] = [];

    // Voice IDs
    if (lineText.includes('voice_id')) {
      const voices = [
        { id: 'c2ac25f9-ecc0-43f4-aaf5-e0f482e5f478', name: 'Warm Female' },
        { id: 'bf991597-aacf-4b1a-96fe-4c0cb7fecf96', name: 'Calm British Man' },
        { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Energetic Coach' },
      ];

      for (const voice of voices) {
        const item = new vscode.CompletionItem(voice.id, vscode.CompletionItemKind.Value);
        item.detail = voice.name;
        item.insertText = `"${voice.id}"`;
        items.push(item);
      }
    }

    // Personality traits
    if (lineText.includes('personality')) {
      const traits = ['warmth', 'directness', 'energy', 'humor_level'];
      for (const trait of traits) {
        const item = new vscode.CompletionItem(trait, vscode.CompletionItemKind.Property);
        item.detail = 'Personality trait (0-1)';
        item.insertText = `"${trait}": 0.5`;
        items.push(item);
      }
    }

    return items;
  }
}

// ============================================================================
// HOVER PROVIDER
// ============================================================================

class ManifestHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    if (!document.fileName.endsWith('persona.manifest.json')) {
      return null;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    const docs: Record<string, string> = {
      warmth: '**warmth** (0-1)\n\nHow warm and friendly the agent sounds.\n- 0 = cold, formal\n- 1 = warm, friendly',
      directness: '**directness** (0-1)\n\nHow direct the agent\'s communication is.\n- 0 = gentle hints\n- 1 = blunt advice',
      energy: '**energy** (0-1)\n\nThe energy level of the agent.\n- 0 = calm, steady\n- 1 = enthusiastic',
      humor_level: '**humor_level** (0-1)\n\nHow much humor the agent uses.\n- 0 = serious\n- 1 = playful',
      voice_id: '**voice_id**\n\nCartesia voice ID. Use UUID format or `${env:VAR}` syntax.',
    };

    if (docs[word]) {
      return new vscode.Hover(new vscode.MarkdownString(docs[word]));
    }

    return null;
  }
}

// ============================================================================
// EXTENSION ACTIVATION
// ============================================================================

export function activate(context: vscode.ExtensionContext): void {
  console.log('Ferni Agent Builder extension activated');

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'ferni.stopPreview';
  context.subscriptions.push(statusBarItem);

  // Tree view
  const treeProvider = new AgentTreeProvider();
  vscode.window.registerTreeDataProvider('ferniAgents', treeProvider);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ferni.startPreview', startPreview),
    vscode.commands.registerCommand('ferni.stopPreview', stopPreview),
    vscode.commands.registerCommand('ferni.deployAgent', deployAgent),
    vscode.commands.registerCommand('ferni.previewVoice', previewVoice),
    vscode.commands.registerCommand('ferni.createAgent', createAgent),
    vscode.commands.registerCommand('ferni.validateAgent', validateAgent),
    vscode.commands.registerCommand('ferni.refreshAgents', () => treeProvider.refresh()),
    vscode.commands.registerCommand('ferni.openDocs', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://developers.ferni.ai'));
    })
  );

  // Diagnostics
  context.subscriptions.push(diagnosticCollection);

  if (getConfig().autoValidate) {
    vscode.workspace.onDidSaveTextDocument(validateManifest);
    vscode.workspace.onDidOpenTextDocument(validateManifest);
  }

  // Completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { pattern: '**/persona.manifest.json' },
      new ManifestCompletionProvider(),
      '"'
    )
  );

  // Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: '**/persona.manifest.json' },
      new ManifestHoverProvider()
    )
  );

  // File watcher for agent changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/bundles/**/*.{json,md}');
  watcher.onDidChange(() => treeProvider.refresh());
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(watcher);
}

export function deactivate(): void {
  if (previewProcess) {
    previewProcess.kill();
  }
}
