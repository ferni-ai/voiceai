import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

// Token data
const PERSONAS = [
  { id: 'ferni', name: 'Ferni', role: 'Life Coach', color: '#4a6741' },
  { id: 'peter', name: 'Peter', role: 'Researcher', color: '#3a6b73' },
  { id: 'alex', name: 'Alex', role: 'Communicator', color: '#5a6b8a' },
  { id: 'maya', name: 'Maya', role: 'Architect', color: '#a67a6a' },
  { id: 'jordan', name: 'Jordan', role: 'Celebrator', color: '#c4856a' },
  { id: 'nayan', name: 'Nayan', role: 'Synthesizer', color: '#b8956a' },
];

const COLOR_TOKENS = [
  { name: 'Text Primary', token: '--color-text-primary', value: '#2C2520' },
  { name: 'Text Secondary', token: '--color-text-secondary', value: '#5C544A' },
  { name: 'Background', token: '--color-background', value: '#FFFCF8' },
  { name: 'Background Elevated', token: '--color-background-elevated', value: '#FFFFFF' },
  { name: 'Success', token: '--color-success', value: '#4a6741' },
  { name: 'Warning', token: '--color-warning', value: '#a08054' },
  { name: 'Error', token: '--color-error', value: '#a05454' },
];

type Tab = 'tokens' | 'personas' | 'lint';

interface LintIssue {
  name: string;
  issue: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [lintResults, setLintResults] = useState<LintIssue[]>([]);
  const [isLinting, setIsLinting] = useState(false);

  // Handle messages from plugin code
  React.useEffect(() => {
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === 'lint-results') {
        setLintResults(msg.issues);
        setIsLinting(false);
      }
    };
  }, []);

  const applyColor = (token: string, color: string) => {
    parent.postMessage({ pluginMessage: { type: 'apply-color', token, color } }, '*');
  };

  const applyPersona = (persona: string) => {
    parent.postMessage({ pluginMessage: { type: 'apply-persona', persona } }, '*');
  };

  const runLint = () => {
    setIsLinting(true);
    parent.postMessage({ pluginMessage: { type: 'lint' } }, '*');
  };

  return (
    <div className="app">
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          Tokens
        </button>
        <button 
          className={`tab ${activeTab === 'personas' ? 'active' : ''}`}
          onClick={() => setActiveTab('personas')}
        >
          Personas
        </button>
        <button 
          className={`tab ${activeTab === 'lint' ? 'active' : ''}`}
          onClick={() => setActiveTab('lint')}
        >
          Lint
        </button>
      </div>

      <div className="content">
        {activeTab === 'tokens' && (
          <div className="tokens-tab">
            <h3>Color Tokens</h3>
            <p className="hint">Click to apply to selection</p>
            <div className="token-list">
              {COLOR_TOKENS.map((token) => (
                <button
                  key={token.token}
                  className="token-item"
                  onClick={() => applyColor(token.token, token.value)}
                >
                  <div 
                    className="color-swatch" 
                    style={{ background: token.value }}
                  />
                  <div className="token-info">
                    <span className="token-name">{token.name}</span>
                    <code className="token-code">{token.token}</code>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'personas' && (
          <div className="personas-tab">
            <h3>Apply Persona Theme</h3>
            <p className="hint">Click to apply persona colors to selection</p>
            <div className="persona-grid">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  className="persona-card"
                  onClick={() => applyPersona(persona.id)}
                >
                  <div 
                    className="persona-avatar"
                    style={{ background: persona.color }}
                  >
                    <svg viewBox="0 0 40 40" width="40" height="40">
                      <circle cx="20" cy="20" r="16" fill={persona.color} />
                      <ellipse cx="14" cy="18" rx="4" ry="3" fill="white" />
                      <ellipse cx="26" cy="18" rx="4" ry="3" fill="white" />
                    </svg>
                  </div>
                  <span className="persona-name">{persona.name}</span>
                  <span className="persona-role">{persona.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'lint' && (
          <div className="lint-tab">
            <h3>Brand Linter</h3>
            <p className="hint">Check selection for brand compliance</p>
            
            <button 
              className="lint-button"
              onClick={runLint}
              disabled={isLinting}
            >
              {isLinting ? 'Checking...' : 'Run Lint'}
            </button>

            {lintResults.length > 0 && (
              <div className="lint-results">
                <h4>{lintResults.length} issue(s) found</h4>
                {lintResults.map((issue, i) => (
                  <div key={i} className={`lint-issue ${issue.severity}`}>
                    <div className="issue-header">
                      <span className="severity-badge">{issue.severity}</span>
                      <span className="node-name">{issue.name}</span>
                    </div>
                    <p className="issue-text">{issue.issue}</p>
                    {issue.suggestion && (
                      <p className="suggestion">Suggestion: {issue.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {lintResults.length === 0 && !isLinting && (
              <p className="no-issues">Select elements and run lint to check</p>
            )}
          </div>
        )}
      </div>

      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .app {
          font-family: Inter, system-ui, sans-serif;
          font-size: 12px;
          color: #2C2520;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .tabs {
          display: flex;
          border-bottom: 1px solid #e0e0e0;
          background: #fafafa;
        }

        .tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: none;
          cursor: pointer;
          font-weight: 500;
          color: #666;
          transition: all 0.15s ease;
        }

        .tab:hover {
          background: #f0f0f0;
        }

        .tab.active {
          color: #4a6741;
          border-bottom: 2px solid #4a6741;
          margin-bottom: -1px;
        }

        .content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        h3 {
          font-size: 14px;
          margin-bottom: 4px;
        }

        .hint {
          color: #666;
          margin-bottom: 16px;
        }

        /* Tokens Tab */
        .token-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .token-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }

        .token-item:hover {
          border-color: #4a6741;
          background: #f9faf9;
        }

        .color-swatch {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          flex-shrink: 0;
        }

        .token-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .token-name {
          font-weight: 500;
        }

        .token-code {
          font-family: monospace;
          font-size: 10px;
          color: #666;
        }

        /* Personas Tab */
        .persona-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .persona-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 8px;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .persona-card:hover {
          border-color: #4a6741;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .persona-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .persona-name {
          font-weight: 600;
        }

        .persona-role {
          font-size: 10px;
          color: #666;
        }

        /* Lint Tab */
        .lint-button {
          width: 100%;
          padding: 12px;
          background: #4a6741;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .lint-button:hover:not(:disabled) {
          background: #3d5a35;
        }

        .lint-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .lint-results {
          margin-top: 16px;
        }

        .lint-results h4 {
          margin-bottom: 12px;
        }

        .lint-issue {
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .lint-issue.warning {
          background: #fff8e6;
          border: 1px solid #ffd666;
        }

        .lint-issue.error {
          background: #fff2f0;
          border: 1px solid #ffa39e;
        }

        .issue-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .severity-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .warning .severity-badge {
          background: #ffd666;
          color: #614700;
        }

        .error .severity-badge {
          background: #ffa39e;
          color: #a8071a;
        }

        .node-name {
          font-weight: 500;
        }

        .issue-text {
          color: #333;
        }

        .suggestion {
          font-size: 11px;
          color: #666;
          margin-top: 4px;
        }

        .no-issues {
          text-align: center;
          color: #666;
          margin-top: 24px;
        }
      `}</style>
    </div>
  );
}

// Mount React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
