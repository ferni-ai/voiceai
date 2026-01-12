/**
 * Analytics Dashboard
 *
 * Displays usage statistics, charts, and metrics for the developer console.
 * Uses Chart.js for visualizations.
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
let usageChart = null;
let currentPeriod = 'week';

// ============================================================================
// FIREBASE AUTH
// ============================================================================

async function initFirebase() {
  if (firebaseApp) return;

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
  const { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, signOut, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

  firebaseApp = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);

  window.GoogleAuthProvider = GoogleAuthProvider;
  window.GithubAuthProvider = GithubAuthProvider;
  window.signInWithPopup = signInWithPopup;
  window.signOut = signOut;

  onAuthStateChanged(firebaseAuth, handleAuthStateChange);
}

async function handleAuthStateChange(user) {
  if (user) {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API_BASE}/api/v1/developers/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const data = await response.json();
        showDashboard(data);
        loadAnalytics();
      } else {
        showAuthError('Failed to verify authentication. Please try again.');
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      showAuthError('Connection error. Please try again.');
    }
  } else {
    showSignInUI();
  }
}

async function signInWithGoogle() {
  try {
    await initFirebase();
    const provider = new window.GoogleAuthProvider();
    await window.signInWithPopup(firebaseAuth, provider);
  } catch (error) {
    console.error('Google sign-in error:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showAuthError('Failed to sign in with Google. Please try again.');
    }
  }
}

async function signInWithGitHub() {
  try {
    await initFirebase();
    const provider = new window.GithubAuthProvider();
    await window.signInWithPopup(firebaseAuth, provider);
  } catch (error) {
    console.error('GitHub sign-in error:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showAuthError('Failed to sign in with GitHub. Please try again.');
    }
  }
}

async function getIdToken() {
  if (!firebaseAuth?.currentUser) return null;
  return firebaseAuth.currentUser.getIdToken();
}

async function apiCall(endpoint) {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API request failed');
  return data;
}

// ============================================================================
// DOM HELPERS (Safe methods - no innerHTML)
// ============================================================================

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

  children.forEach((child) => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  });

  return el;
}

function createSvgIcon(pathD, size = 48) {
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

// ============================================================================
// UI FUNCTIONS
// ============================================================================

function showSignInUI() {
  const authGate = document.getElementById('auth-gate');
  const dashboard = document.getElementById('dashboard');
  if (authGate) authGate.style.display = 'block';
  if (dashboard) dashboard.style.display = 'none';
}

function showDashboard(data) {
  const authGate = document.getElementById('auth-gate');
  const dashboard = document.getElementById('dashboard');
  if (authGate) authGate.style.display = 'none';
  if (dashboard) dashboard.style.display = 'block';

  const userEmail = document.getElementById('user-email');
  if (userEmail) userEmail.textContent = data.session.email;
}

function showAuthError(message) {
  console.error('Auth error:', message);
}

// ============================================================================
// ANALYTICS LOADING
// ============================================================================

async function loadAnalytics() {
  try {
    // Load all analytics data in parallel
    const [overview, usage, personas, errors] = await Promise.all([
      apiCall(`/api/v1/developers/analytics/overview?period=${currentPeriod}`),
      apiCall(`/api/v1/developers/analytics/usage?period=${currentPeriod}`),
      apiCall(`/api/v1/developers/analytics/personas?period=${currentPeriod}`),
      apiCall(`/api/v1/developers/analytics/errors?period=${currentPeriod}`),
    ]);

    renderOverview(overview.overview);
    renderUsageChart(usage.usage);
    renderPersonaBreakdown(personas.personas);
    renderErrorBreakdown(errors.errors);
  } catch (error) {
    console.error('Failed to load analytics:', error);
    renderEmptyState();
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function renderOverview(overview) {
  // API Calls
  const apiCallsValue = document.getElementById('api-calls-value');
  const apiCallsChange = document.getElementById('api-calls-change');
  if (apiCallsValue) apiCallsValue.textContent = formatNumber(overview.totalApiCalls);
  if (apiCallsChange) {
    apiCallsChange.textContent = `${overview.totalApiCallsChange >= 0 ? '+' : ''}${overview.totalApiCallsChange}%`;
    apiCallsChange.className = `stat-change ${overview.totalApiCallsChange >= 0 ? 'positive' : 'negative'}`;
  }

  // Unique Users
  const usersValue = document.getElementById('users-value');
  const usersChange = document.getElementById('users-change');
  if (usersValue) usersValue.textContent = formatNumber(overview.uniqueUsers);
  if (usersChange) {
    usersChange.textContent = `${overview.uniqueUsersChange >= 0 ? '+' : ''}${overview.uniqueUsersChange}%`;
    usersChange.className = `stat-change ${overview.uniqueUsersChange >= 0 ? 'positive' : 'negative'}`;
  }

  // Active Personas
  const personasValue = document.getElementById('personas-value');
  const personasChange = document.getElementById('personas-change');
  if (personasValue) personasValue.textContent = formatNumber(overview.activePersonas);
  if (personasChange) {
    personasChange.textContent = `${overview.activePersonasChange >= 0 ? '+' : ''}${overview.activePersonasChange}%`;
    personasChange.className = `stat-change ${overview.activePersonasChange >= 0 ? 'positive' : 'negative'}`;
  }

  // Response Time
  const responseTimeValue = document.getElementById('response-time-value');
  const responseTimeChange = document.getElementById('response-time-change');
  if (responseTimeValue) {
    responseTimeValue.textContent = '';
    responseTimeValue.appendChild(document.createTextNode(String(overview.avgResponseTime)));
    const unit = createElement('span', { className: 'stat-unit', textContent: 'ms' });
    responseTimeValue.appendChild(unit);
  }
  if (responseTimeChange) {
    const isGood = overview.avgResponseTimeChange <= 0;
    responseTimeChange.textContent = `${overview.avgResponseTimeChange >= 0 ? '+' : ''}${overview.avgResponseTimeChange}%`;
    responseTimeChange.className = `stat-change ${isGood ? 'positive' : 'negative'}`;
  }

  // Error Rate
  const errorRateValue = document.getElementById('error-rate-value');
  const errorRateChange = document.getElementById('error-rate-change');
  if (errorRateValue) {
    errorRateValue.textContent = '';
    errorRateValue.appendChild(document.createTextNode(String(overview.errorRate)));
    const unit = createElement('span', { className: 'stat-unit', textContent: '%' });
    errorRateValue.appendChild(unit);
  }
  if (errorRateChange) {
    const isGood = overview.errorRateChange <= 0;
    errorRateChange.textContent = `${overview.errorRateChange >= 0 ? '+' : ''}${overview.errorRateChange}%`;
    errorRateChange.className = `stat-change ${isGood ? 'positive' : 'negative'}`;
  }
}

function renderUsageChart(usage) {
  const canvas = document.getElementById('usage-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Destroy existing chart if it exists
  if (usageChart) {
    usageChart.destroy();
  }

  // Handle empty data
  if (!usage || usage.length === 0) {
    renderChartEmptyState(canvas);
    return;
  }

  // Prepare data
  const labels = usage.map((d) => formatDateLabel(d.date));
  const apiCalls = usage.map((d) => d.apiCalls);
  const errors = usage.map((d) => d.errors);

  // Chart colors - use design tokens
  const styles = getComputedStyle(document.documentElement);
  const accentColor = styles.getPropertyValue('--accent-primary').trim() || '#d4a84a';
  const errorColor = styles.getPropertyValue('--error').trim() || '#e07575';

  usageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'API Calls',
          data: apiCalls,
          borderColor: accentColor,
          backgroundColor: accentColor + '20',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Errors',
          data: errors,
          borderColor: errorColor,
          backgroundColor: errorColor + '20',
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

function formatDateLabel(dateStr) {
  const date = new Date(dateStr);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

function renderChartEmptyState(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.textAlign = 'center';
  ctx.font = '16px system-ui';
  ctx.fillText('No data available for this period', canvas.width / 2, canvas.height / 2);
}

function renderPersonaBreakdown(personas) {
  const container = document.getElementById('persona-breakdown');
  if (!container) return;

  container.textContent = '';

  if (!personas || personas.length === 0) {
    const noData = createElement('div', { className: 'no-data' }, [
      createSvgIcon('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z'),
      createElement('p', { textContent: 'No persona usage data yet' }),
    ]);
    container.appendChild(noData);
    return;
  }

  personas.forEach((persona) => {
    const item = createElement('div', { className: 'persona-item' });

    const initial = persona.personaName.charAt(0).toUpperCase();

    // Persona info section
    const personaInfo = createElement('div', { className: 'persona-info' });
    const avatar = createElement('div', { className: 'persona-avatar', textContent: initial });
    const details = createElement('div');
    const name = createElement('div', { className: 'persona-name', textContent: persona.personaName });
    const stats = createElement('div', {
      className: 'persona-stats',
      textContent: `${formatNumber(persona.uniqueUsers)} users | ${formatDuration(persona.avgSessionDuration)} avg session`,
    });
    details.appendChild(name);
    details.appendChild(stats);
    personaInfo.appendChild(avatar);
    personaInfo.appendChild(details);

    // Calls section
    const callsSection = createElement('div', { className: 'persona-calls' });
    const callsValue = createElement('div', { className: 'persona-calls-value', textContent: formatNumber(persona.totalCalls) });
    const callsLabel = createElement('div', { className: 'persona-calls-label', textContent: 'calls' });
    callsSection.appendChild(callsValue);
    callsSection.appendChild(callsLabel);

    item.appendChild(personaInfo);
    item.appendChild(callsSection);
    container.appendChild(item);
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function renderErrorBreakdown(errors) {
  const container = document.getElementById('error-breakdown');
  if (!container) return;

  container.textContent = '';

  if (!errors || errors.length === 0) {
    const noData = createElement('div', { className: 'no-data' }, [
      createSvgIcon('M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3'),
      createElement('p', { textContent: 'No errors in this period' }),
    ]);
    container.appendChild(noData);
    return;
  }

  errors.forEach((error) => {
    const item = createElement('div', { className: 'error-item' });

    // Error info section
    const errorInfo = createElement('div', { className: 'error-info' });
    const code = createElement('div', { className: 'error-code', textContent: error.code });
    const message = createElement('div', { className: 'error-message', textContent: error.message });
    errorInfo.appendChild(code);
    errorInfo.appendChild(message);

    // Count section
    const countSection = createElement('div', { className: 'error-count' });
    const countValue = createElement('div', { className: 'error-count-value', textContent: formatNumber(error.count) });
    const countLabel = createElement('div', { className: 'error-count-label', textContent: 'occurrences' });
    countSection.appendChild(countValue);
    countSection.appendChild(countLabel);

    item.appendChild(errorInfo);
    item.appendChild(countSection);
    container.appendChild(item);
  });
}

function renderEmptyState() {
  // Render empty states for all sections
  const apiCallsValue = document.getElementById('api-calls-value');
  if (apiCallsValue) apiCallsValue.textContent = '0';

  const usersValue = document.getElementById('users-value');
  if (usersValue) usersValue.textContent = '0';

  const personasValue = document.getElementById('personas-value');
  if (personasValue) personasValue.textContent = '0';

  const responseTimeValue = document.getElementById('response-time-value');
  if (responseTimeValue) {
    responseTimeValue.textContent = '';
    responseTimeValue.appendChild(document.createTextNode('0'));
    const unit = createElement('span', { className: 'stat-unit', textContent: 'ms' });
    responseTimeValue.appendChild(unit);
  }

  const errorRateValue = document.getElementById('error-rate-value');
  if (errorRateValue) {
    errorRateValue.textContent = '';
    errorRateValue.appendChild(document.createTextNode('0'));
    const unit = createElement('span', { className: 'stat-unit', textContent: '%' });
    errorRateValue.appendChild(unit);
  }

  const personaContainer = document.getElementById('persona-breakdown');
  if (personaContainer) {
    personaContainer.textContent = '';
    const noData = createElement('div', { className: 'no-data' }, [
      createElement('p', { textContent: 'No data available' }),
    ]);
    personaContainer.appendChild(noData);
  }

  const errorContainer = document.getElementById('error-breakdown');
  if (errorContainer) {
    errorContainer.textContent = '';
    const noData = createElement('div', { className: 'no-data' }, [
      createElement('p', { textContent: 'No errors recorded' }),
    ]);
    errorContainer.appendChild(noData);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handlePeriodChange(event) {
  currentPeriod = event.target.value;
  loadAnalytics();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initAnalytics() {
  await initFirebase();

  // Attach event listeners
  const googleBtn = document.getElementById('google-signin-btn');
  const githubBtn = document.getElementById('github-signin-btn');
  const periodSelector = document.getElementById('period-selector');

  if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);
  if (githubBtn) githubBtn.addEventListener('click', signInWithGitHub);
  if (periodSelector) periodSelector.addEventListener('change', handlePeriodChange);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
  initAnalytics();
}

// Export for use in HTML
window.signInWithGoogle = signInWithGoogle;
window.signInWithGitHub = signInWithGitHub;
