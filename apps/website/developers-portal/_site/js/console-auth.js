/**
 * Console Authentication
 *
 * Handles Firebase authentication for the developer console.
 * Supports Google and GitHub OAuth providers.
 */

// Firebase configuration (public - these are client keys)
const firebaseConfig = {
  apiKey: 'AIzaSyBxhBK99mabv8RB6o-yyHKoc6bRT4TKjNI',
  authDomain: 'johnb-2025.firebaseapp.com',
  projectId: 'johnb-2025',
};

// API base URL (relative - Firebase Hosting rewrites /api/** to Cloud Run)
const API_BASE = '';

// State
let firebaseApp = null;
let firebaseAuth = null;
let currentSession = null;

/**
 * Initialize Firebase
 */
async function initFirebase() {
  if (firebaseApp) return;

  // Load Firebase SDK dynamically
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
  const { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, signOut, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

  firebaseApp = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);

  // Store providers for later use
  window.GoogleAuthProvider = GoogleAuthProvider;
  window.GithubAuthProvider = GithubAuthProvider;
  window.signInWithPopup = signInWithPopup;
  window.signOut = signOut;

  // Listen for auth state changes
  onAuthStateChanged(firebaseAuth, handleAuthStateChange);
}

/**
 * Handle auth state changes
 */
async function handleAuthStateChange(user) {
  if (user) {
    // User is signed in - verify with backend
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API_BASE}/api/v1/developers/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const data = await response.json();
        currentSession = data.session;
        showDashboard(data);
      } else {
        console.error('Backend verification failed');
        showAuthError('Failed to verify authentication. Please try again.');
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      showAuthError('Connection error. Please try again.');
    }
  } else {
    // User is signed out
    currentSession = null;
    showSignInUI();
  }
}

/**
 * Sign in with Google
 */
async function signInWithGoogle() {
  try {
    await initFirebase();
    const provider = new window.GoogleAuthProvider();
    await window.signInWithPopup(firebaseAuth, provider);
    // Auth state change will handle the rest
  } catch (error) {
    console.error('Google sign-in error:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showAuthError('Failed to sign in with Google. Please try again.');
    }
  }
}

/**
 * Sign in with GitHub
 */
async function signInWithGitHub() {
  try {
    await initFirebase();
    const provider = new window.GithubAuthProvider();
    await window.signInWithPopup(firebaseAuth, provider);
    // Auth state change will handle the rest
  } catch (error) {
    console.error('GitHub sign-in error:', error.code, error.message);
    if (error.code === 'auth/popup-closed-by-user') {
      // User cancelled - no error message needed
      return;
    }
    if (error.code === 'auth/operation-not-allowed') {
      showAuthError('GitHub sign-in is not enabled. Please use Google sign-in for now.');
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      showAuthError('An account already exists with this email. Try signing in with Google.');
    } else {
      showAuthError('Failed to sign in with GitHub. Please try again.');
    }
  }
}

/**
 * Sign out
 */
async function handleSignOut() {
  try {
    await window.signOut(firebaseAuth);
    // Auth state change will handle the rest
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

/**
 * Get current Firebase ID token (for API calls)
 */
async function getIdToken() {
  if (!firebaseAuth?.currentUser) return null;
  return firebaseAuth.currentUser.getIdToken();
}

/**
 * Make authenticated API call
 */
async function apiCall(endpoint, options = {}) {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// UI FUNCTIONS (using safe DOM methods)
// ============================================================================

/**
 * Create element with properties
 */
function createElement(tag, props = {}, children = []) {
  const el = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'textContent') {
      el.textContent = value;
    } else {
      el.setAttribute(key, value);
    }
  });

  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  });

  return el;
}

/**
 * Show sign-in UI (hide dashboard)
 */
function showSignInUI() {
  const authGate = document.getElementById('auth-gate');
  const dashboard = document.getElementById('dashboard');

  if (authGate) authGate.style.display = 'block';
  if (dashboard) dashboard.style.display = 'none';
}

/**
 * Show dashboard (hide sign-in)
 */
function showDashboard(data) {
  const authGate = document.getElementById('auth-gate');
  const dashboard = document.getElementById('dashboard');

  if (authGate) authGate.style.display = 'none';
  if (dashboard) dashboard.style.display = 'block';

  // Update user info
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');

  if (userName) userName.textContent = data.session.name;
  if (userEmail) userEmail.textContent = data.session.email;

  // Show new account message if applicable
  if (data.isNewAccount && data.newApiKey) {
    showNewAccountMessage(data.newApiKey);
  }

  // Render API keys
  renderApiKeys(data.session.apiKeys);
}

/**
 * Show new account message with first API key
 */
function showNewAccountMessage(apiKey) {
  const container = document.getElementById('new-account-message');
  if (!container) return;

  // Clear existing content
  container.textContent = '';

  const messageDiv = createElement('div', {
    style: {
      background: 'var(--success)',
      color: 'white',
      padding: 'var(--space-4)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 'var(--space-6)',
    },
  });

  const title = createElement('strong', { textContent: 'Welcome! ' });
  const intro = document.createTextNode('Your account has been created. Here\'s your first API key:');
  messageDiv.appendChild(title);
  messageDiv.appendChild(intro);

  const keyDisplay = createElement('div', {
    style: {
      fontFamily: 'var(--font-mono)',
      background: 'rgba(0,0,0,0.2)',
      padding: 'var(--space-2)',
      borderRadius: 'var(--radius-md)',
      marginTop: 'var(--space-2)',
      wordBreak: 'break-all',
    },
    textContent: apiKey,
  });
  messageDiv.appendChild(keyDisplay);

  const note = createElement('p', {
    style: { margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sm)' },
    textContent: 'Save this key now - you won\'t be able to see it again!',
  });
  messageDiv.appendChild(note);

  container.appendChild(messageDiv);
  container.style.display = 'block';
}

/**
 * Show auth error
 */
function showAuthError(message) {
  const container = document.getElementById('auth-error');
  if (!container) return;

  container.textContent = message;
  container.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    container.style.display = 'none';
  }, 5000);
}

/**
 * Create SVG icon element
 */
function createSvgIcon(pathD, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);

  return svg;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Render API keys list
 */
function renderApiKeys(keys) {
  const container = document.getElementById('api-keys-list');
  if (!container) return;

  // Clear existing content
  container.textContent = '';

  if (!keys || keys.length === 0) {
    const emptyMsg = createElement('p', {
      style: {
        color: 'var(--text-muted)',
        textAlign: 'center',
        padding: 'var(--space-8)',
      },
      textContent: 'No API keys yet. Create one to get started!',
    });
    container.appendChild(emptyMsg);
    return;
  }

  keys.forEach((key) => {
    const card = createApiKeyCard(key);
    container.appendChild(card);
  });
}

/**
 * Create an API key card element
 */
function createApiKeyCard(key) {
  const card = createElement('div', {
    className: 'api-key-card',
    'data-key-id': key.id,
  });

  // Key info section
  const keyInfo = createElement('div', { className: 'key-info' });

  // Header with type and badge
  const keyHeader = createElement('div', { className: 'key-header' });
  const keyTitle = createElement('h4', {
    textContent: key.type === 'live' ? 'Production Key' : 'Test Key',
  });
  const keyBadge = createElement('span', {
    className: `key-badge ${key.type}`,
    textContent: key.type.toUpperCase(),
  });
  keyHeader.appendChild(keyTitle);
  keyHeader.appendChild(keyBadge);
  keyInfo.appendChild(keyHeader);

  // Key prefix
  const keyPrefix = createElement('div', {
    className: 'key-prefix',
    textContent: `${key.keyPrefix}...`,
  });
  keyInfo.appendChild(keyPrefix);

  // Metadata
  const keyMeta = createElement('div', { className: 'key-meta' });
  const createdSpan = createElement('span', {
    textContent: `Created: ${formatDate(key.createdAt)}`,
  });
  keyMeta.appendChild(createdSpan);
  if (key.lastUsedAt) {
    const usedSpan = createElement('span', {
      textContent: `Last used: ${formatDate(key.lastUsedAt)}`,
    });
    keyMeta.appendChild(usedSpan);
  }
  keyInfo.appendChild(keyMeta);

  card.appendChild(keyInfo);

  // Actions section
  const actions = createElement('div', { className: 'key-actions' });

  // Rotate button
  const rotateBtn = createElement('button', {
    className: 'btn btn-ghost btn-icon',
    title: 'Rotate key',
    onClick: () => rotateKey(key.id),
  });
  rotateBtn.appendChild(createSvgIcon('M20.49 15a9 9 0 1 1-2.12-9.36L23 10'));
  actions.appendChild(rotateBtn);

  // Revoke button
  const revokeBtn = createElement('button', {
    className: 'btn btn-ghost btn-icon btn-danger',
    title: 'Revoke key',
    onClick: () => revokeKey(key.id),
  });
  revokeBtn.appendChild(createSvgIcon('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'));
  actions.appendChild(revokeBtn);

  card.appendChild(actions);

  return card;
}

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Create a new API key
 */
async function createKey(type = 'test') {
  try {
    const data = await apiCall('/api/v1/developers/keys', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });

    // Show the new key (only shown once!)
    showNewKeyModal(data.key);

    // Refresh the keys list
    refreshKeys();
  } catch (error) {
    console.error('Create key error:', error);
    alert(`Failed to create API key: ${error.message}`);
  }
}

/**
 * Rotate an API key
 */
async function rotateKey(keyId) {
  if (!confirm('This will invalidate the current key. Continue?')) {
    return;
  }

  try {
    const data = await apiCall(`/api/v1/developers/keys/${keyId}/rotate`, {
      method: 'POST',
    });

    // Show the new key (only shown once!)
    showNewKeyModal(data.key);

    // Refresh the keys list
    refreshKeys();
  } catch (error) {
    console.error('Rotate key error:', error);
    alert(`Failed to rotate API key: ${error.message}`);
  }
}

/**
 * Revoke an API key
 */
async function revokeKey(keyId) {
  if (!confirm('This will permanently revoke this API key. Continue?')) {
    return;
  }

  try {
    await apiCall(`/api/v1/developers/keys/${keyId}`, {
      method: 'DELETE',
    });

    // Refresh the keys list
    refreshKeys();
  } catch (error) {
    console.error('Revoke key error:', error);
    alert(`Failed to revoke API key: ${error.message}`);
  }
}

/**
 * Refresh API keys list
 */
async function refreshKeys() {
  try {
    const data = await apiCall('/api/v1/developers/keys');
    renderApiKeys(data.keys);
  } catch (error) {
    console.error('Refresh keys error:', error);
  }
}

/**
 * Show modal with new API key
 */
function showNewKeyModal(key) {
  // Create modal overlay
  const overlay = createElement('div', { className: 'modal-overlay' });

  const modal = createElement('div', { className: 'modal' });

  const title = createElement('h3', { textContent: 'New API Key Created' });
  modal.appendChild(title);

  const subtitle = createElement('p', {
    style: { color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' },
    textContent: 'Copy this key now. You won\'t be able to see it again!',
  });
  modal.appendChild(subtitle);

  const keyDisplay = createElement('div', { className: 'new-key-display' });
  const keyCode = createElement('code', {
    id: 'new-key-value',
    textContent: key.apiKey,
  });
  keyDisplay.appendChild(keyCode);

  const copyBtn = createElement('button', {
    className: 'btn btn-ghost btn-icon',
    onClick: copyNewKey,
  });
  copyBtn.appendChild(createSvgIcon('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'));
  keyDisplay.appendChild(copyBtn);
  modal.appendChild(keyDisplay);

  const closeBtn = createElement('button', {
    className: 'btn btn-primary',
    style: { width: '100%', marginTop: 'var(--space-6)' },
    textContent: 'I\'ve saved my key',
    onClick: closeNewKeyModal,
  });
  modal.appendChild(closeBtn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/**
 * Copy new key to clipboard
 */
function copyNewKey() {
  const keyValue = document.getElementById('new-key-value');
  if (keyValue) {
    navigator.clipboard.writeText(keyValue.textContent);
    alert('Copied to clipboard!');
  }
}

/**
 * Close new key modal
 */
function closeNewKeyModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.remove();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the console
 */
async function initConsole() {
  // Initialize Firebase
  await initFirebase();

  // Attach click handlers
  const googleBtn = document.getElementById('google-signin-btn');
  const githubBtn = document.getElementById('github-signin-btn');
  const signOutBtn = document.getElementById('signout-btn');
  const createKeyBtn = document.getElementById('create-key-btn');

  if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);
  if (githubBtn) githubBtn.addEventListener('click', signInWithGitHub);
  if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
  if (createKeyBtn) createKeyBtn.addEventListener('click', () => createKey('test'));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConsole);
} else {
  initConsole();
}

// Export for use in HTML
window.signInWithGoogle = signInWithGoogle;
window.signInWithGitHub = signInWithGitHub;
window.handleSignOut = handleSignOut;
window.createKey = createKey;
window.rotateKey = rotateKey;
window.revokeKey = revokeKey;
window.copyNewKey = copyNewKey;
window.closeNewKeyModal = closeNewKeyModal;
