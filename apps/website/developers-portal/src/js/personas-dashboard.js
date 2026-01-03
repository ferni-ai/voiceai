/**
 * Personas Dashboard
 *
 * Handles the personas list view with CRUD operations.
 * Uses safe DOM manipulation methods to prevent XSS.
 */

// API Base URL
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3002'
  : 'https://john-bogle-ui-768716511401.us-central1.run.app';

// Wait for auth to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if auth module is loaded
  if (typeof window.getAuthToken === 'function') {
    initDashboard();
  } else {
    // Wait for auth module to initialize
    document.addEventListener('ferniAuthReady', initDashboard);
  }
});

async function initDashboard() {
  const token = await window.getAuthToken();
  if (token) {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadPersonas();
  }
}

// Listen for auth state changes
document.addEventListener('ferniAuthStateChanged', async (e) => {
  if (e.detail.authenticated) {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadPersonas();
  } else {
    document.getElementById('auth-gate').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }
});

async function loadPersonas() {
  const token = await window.getAuthToken();
  if (!token) return;

  const listEl = document.getElementById('personas-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('personas-count');

  try {
    const response = await fetch(`${API_BASE}/api/v1/developers/personas`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load personas');
    }

    const data = await response.json();
    const personas = data.personas || [];

    countEl.textContent = `${personas.length} persona${personas.length !== 1 ? 's' : ''}`;

    if (personas.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'grid';
    emptyEl.style.display = 'none';

    // Clear existing content safely
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }

    // Build cards using safe DOM methods
    personas.forEach(persona => {
      const card = createPersonaCard(persona);
      listEl.appendChild(card);
    });

  } catch (error) {
    console.error('Error loading personas:', error);
    // Clear and show error safely
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }
    const errorDiv = document.createElement('div');
    errorDiv.className = 'persona-card';
    errorDiv.style.cssText = 'text-align: center; padding: var(--space-8); color: var(--error);';
    errorDiv.textContent = 'Failed to load personas. Please try again.';
    listEl.appendChild(errorDiv);
  }
}

function createPersonaCard(persona) {
  const card = document.createElement('div');
  card.className = 'persona-card';

  // Header with avatar and status
  const header = document.createElement('div');
  header.className = 'persona-card-header';

  const avatar = document.createElement('div');
  avatar.className = 'persona-avatar';
  const initials = (persona.name || '')
    .split(' ')
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  avatar.textContent = initials;

  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge status-${persona.status}`;
  statusBadge.textContent = persona.status.charAt(0).toUpperCase() + persona.status.slice(1);

  header.appendChild(avatar);
  header.appendChild(statusBadge);
  card.appendChild(header);

  // Name
  const nameEl = document.createElement('div');
  nameEl.className = 'persona-card-name';
  nameEl.textContent = persona.name || 'Unnamed';
  card.appendChild(nameEl);

  // Tagline
  const taglineEl = document.createElement('div');
  taglineEl.className = 'persona-card-tagline';
  taglineEl.textContent = persona.tagline || '';
  card.appendChild(taglineEl);

  // Meta
  const metaEl = document.createElement('div');
  metaEl.className = 'persona-card-meta';

  const categorySpan = document.createElement('span');
  categorySpan.textContent = persona.category || 'Uncategorized';
  metaEl.appendChild(categorySpan);

  const separator = document.createElement('span');
  separator.textContent = '•';
  metaEl.appendChild(separator);

  const dateSpan = document.createElement('span');
  const updatedDate = new Date(persona.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  dateSpan.textContent = `Updated ${updatedDate}`;
  metaEl.appendChild(dateSpan);

  card.appendChild(metaEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.className = 'persona-card-actions';

  const canEdit = ['draft', 'rejected'].includes(persona.status);
  const canDelete = persona.status !== 'published';

  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary persona-edit-btn';
    editBtn.style.flex = '1';
    editBtn.dataset.personaId = persona.id;

    const editIcon = createSvgIcon('edit');
    editBtn.appendChild(editIcon);

    const editText = document.createTextNode(' Edit');
    editBtn.appendChild(editText);

    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `/personas/create/?edit=${persona.id}`;
    });

    actionsEl.appendChild(editBtn);
  }

  if (canDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-ghost persona-delete-btn';
    deleteBtn.style.color = 'var(--error)';
    deleteBtn.dataset.personaId = persona.id;
    deleteBtn.dataset.personaName = persona.name;

    const deleteIcon = createSvgIcon('delete');
    deleteBtn.appendChild(deleteIcon);

    deleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm(`Delete "${persona.name}"? This cannot be undone.`)) {
        await deletePersona(persona.id);
      }
    });

    actionsEl.appendChild(deleteBtn);
  }

  card.appendChild(actionsEl);

  return card;
}

function createSvgIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  if (type === 'edit') {
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7');
    svg.appendChild(path1);

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
    svg.appendChild(path2);
  } else if (type === 'delete') {
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '3 6 5 6 21 6');
    svg.appendChild(polyline);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
    svg.appendChild(path);
  }

  return svg;
}

async function deletePersona(personaId) {
  const token = await window.getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE}/api/v1/developers/personas/${personaId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete persona');
    }

    // Reload the list
    loadPersonas();
  } catch (error) {
    console.error('Error deleting persona:', error);
    alert('Failed to delete persona. Please try again.');
  }
}
