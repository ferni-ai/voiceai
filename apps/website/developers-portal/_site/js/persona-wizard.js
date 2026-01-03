/**
 * Persona Creation Wizard
 *
 * Multi-step wizard for creating AI personas.
 * Uses safe DOM manipulation methods to prevent XSS.
 */

// API Base URL
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3002'
  : 'https://john-bogle-ui-768716511401.us-central1.run.app';

// Wizard State
const wizardState = {
  currentStep: 1,
  totalSteps: 6,
  personaId: null,
  manifest: {
    identity: {
      id: '',
      name: '',
      tagline: '',
      description: '',
      aliases: []
    },
    voice: {
      provider: 'cartesia',
      voice_id: '',
      name: ''
    },
    personality: {
      warmth: 0.7,
      humor_level: 0.4,
      directness: 0.6,
      formality: 0.3,
      traits: []
    },
    knowledge: {
      category: '',
      domains: [],
      expertise_tags: [],
      out_of_scope_topics: []
    },
    behaviors: {
      greetings: [],
      backchannels: [],
      thinking_sounds: []
    }
  }
};

// Personality presets
const PERSONALITY_PRESETS = {
  coach: {
    warmth: 0.8,
    humor_level: 0.4,
    directness: 0.5,
    formality: 0.3,
    traits: ['empathetic', 'supportive', 'motivating', 'patient']
  },
  analyst: {
    warmth: 0.4,
    humor_level: 0.2,
    directness: 0.8,
    formality: 0.6,
    traits: ['analytical', 'precise', 'knowledgeable', 'objective']
  },
  mentor: {
    warmth: 0.7,
    humor_level: 0.3,
    directness: 0.6,
    formality: 0.4,
    traits: ['wise', 'patient', 'experienced', 'guiding']
  },
  therapist: {
    warmth: 0.9,
    humor_level: 0.2,
    directness: 0.3,
    formality: 0.4,
    traits: ['empathetic', 'non-judgmental', 'calm', 'reflective']
  }
};

// Initialize wizard
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.getAuthToken === 'function') {
    initWizard();
  } else {
    document.addEventListener('ferniAuthReady', initWizard);
  }
});

async function initWizard() {
  const token = await window.getAuthToken();
  if (token) {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('wizard-section').style.display = 'block';
    setupWizard();

    // Check if editing existing persona
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId) {
      await loadExistingPersona(editId);
    }
  }
}

// Listen for auth state changes
document.addEventListener('ferniAuthStateChanged', async (e) => {
  if (e.detail.authenticated) {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('wizard-section').style.display = 'block';
    setupWizard();
  } else {
    document.getElementById('auth-gate').style.display = 'block';
    document.getElementById('wizard-section').style.display = 'none';
  }
});

function setupWizard() {
  // Navigation buttons
  document.getElementById('prev-btn').addEventListener('click', prevStep);
  document.getElementById('next-btn').addEventListener('click', nextStep);
  document.getElementById('save-draft-btn').addEventListener('click', saveDraft);
  document.getElementById('create-btn').addEventListener('click', createPersona);

  // Auto-generate ID from name
  document.getElementById('persona-name').addEventListener('input', (e) => {
    const name = e.target.value;
    const idField = document.getElementById('persona-id');
    if (!idField.dataset.manual) {
      idField.value = name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 30);
    }
    wizardState.manifest.identity.name = name;
  });

  document.getElementById('persona-id').addEventListener('input', (e) => {
    e.target.dataset.manual = 'true';
    wizardState.manifest.identity.id = e.target.value;
  });

  document.getElementById('persona-tagline').addEventListener('input', (e) => {
    wizardState.manifest.identity.tagline = e.target.value;
  });

  document.getElementById('persona-description').addEventListener('input', (e) => {
    wizardState.manifest.identity.description = e.target.value;
  });

  document.getElementById('persona-aliases').addEventListener('input', (e) => {
    wizardState.manifest.identity.aliases = e.target.value
      .split(',')
      .map(s => s.trim())
      .filter(s => s);
  });

  // Personality sliders
  setupSlider('warmth');
  setupSlider('humor', 'humor_level');
  setupSlider('directness');
  setupSlider('formality');

  // Traits input
  setupTagInput('traits-input', 'traits-tags', wizardState.manifest.personality.traits);

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PERSONALITY_PRESETS[btn.dataset.preset];
      if (preset) {
        applyPersonalityPreset(preset);
      }
    });
  });

  // Knowledge inputs
  document.getElementById('persona-category').addEventListener('change', (e) => {
    wizardState.manifest.knowledge.category = e.target.value;
  });

  setupTagInput('domains-input', 'domains-tags', wizardState.manifest.knowledge.domains);
  setupTagInput('expertise-input', 'expertise-tags', wizardState.manifest.knowledge.expertise_tags);
  setupTagInput('out-of-scope-input', 'out-of-scope-tags', wizardState.manifest.knowledge.out_of_scope_topics);

  // Behaviors inputs
  document.getElementById('greetings-input').addEventListener('input', (e) => {
    wizardState.manifest.behaviors.greetings = e.target.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s);
  });

  document.getElementById('backchannels-input').addEventListener('input', (e) => {
    wizardState.manifest.behaviors.backchannels = e.target.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s);
  });

  document.getElementById('thinking-input').addEventListener('input', (e) => {
    wizardState.manifest.behaviors.thinking_sounds = e.target.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s);
  });

  // Voice filters
  document.querySelectorAll('.filter-btn[data-gender]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-gender]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadVoices();
    });
  });

  document.getElementById('voice-category-filter').addEventListener('change', loadVoices);

  // Load initial voices
  loadVoices();

  updateUI();
}

function setupSlider(name, stateName = name) {
  const slider = document.getElementById(`${name}-slider`);
  const valueEl = document.getElementById(`${name}-value`);

  slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    valueEl.textContent = value.toFixed(1);
    wizardState.manifest.personality[stateName] = value;
  });
}

function setupTagInput(inputId, containerId, stateArray) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (value && !stateArray.includes(value)) {
        stateArray.push(value);
        renderTags(container, stateArray);
      }
      input.value = '';
    }
  });

  // Initial render
  renderTags(container, stateArray);
}

function renderTags(container, stateArray) {
  // Clear safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  stateArray.forEach((tag, index) => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = tag;

    const removeBtn = document.createElement('span');
    removeBtn.className = 'tag-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      stateArray.splice(index, 1);
      renderTags(container, stateArray);
    });

    tagEl.appendChild(removeBtn);
    container.appendChild(tagEl);
  });
}

function applyPersonalityPreset(preset) {
  // Update sliders
  document.getElementById('warmth-slider').value = preset.warmth;
  document.getElementById('warmth-value').textContent = preset.warmth.toFixed(1);
  wizardState.manifest.personality.warmth = preset.warmth;

  document.getElementById('humor-slider').value = preset.humor_level;
  document.getElementById('humor-value').textContent = preset.humor_level.toFixed(1);
  wizardState.manifest.personality.humor_level = preset.humor_level;

  document.getElementById('directness-slider').value = preset.directness;
  document.getElementById('directness-value').textContent = preset.directness.toFixed(1);
  wizardState.manifest.personality.directness = preset.directness;

  document.getElementById('formality-slider').value = preset.formality;
  document.getElementById('formality-value').textContent = preset.formality.toFixed(1);
  wizardState.manifest.personality.formality = preset.formality;

  // Update traits
  wizardState.manifest.personality.traits = [...preset.traits];
  renderTags(document.getElementById('traits-tags'), wizardState.manifest.personality.traits);
}

async function loadVoices() {
  const token = await window.getAuthToken();
  if (!token) return;

  const grid = document.getElementById('voices-grid');
  const activeGenderBtn = document.querySelector('.filter-btn[data-gender].active');
  const gender = activeGenderBtn?.dataset.gender || '';
  const category = document.getElementById('voice-category-filter').value;

  // Build query string
  const params = new URLSearchParams();
  if (gender) params.append('gender', gender);
  if (category) params.append('category', category);

  try {
    const response = await fetch(
      `${API_BASE}/api/v1/developers/voices?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) throw new Error('Failed to load voices');

    const data = await response.json();
    const voices = data.voices || [];

    // Clear grid safely
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    voices.forEach(voice => {
      const card = createVoiceCard(voice);
      grid.appendChild(card);
    });

  } catch (error) {
    console.error('Error loading voices:', error);
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align: center; padding: var(--space-8); color: var(--error);';
    errorDiv.textContent = 'Failed to load voices. Please try again.';
    grid.appendChild(errorDiv);
  }
}

function createVoiceCard(voice) {
  const card = document.createElement('div');
  card.className = 'voice-card';
  if (wizardState.manifest.voice.voice_id === voice.id) {
    card.classList.add('selected');
  }

  // Header
  const header = document.createElement('div');
  header.className = 'voice-card-header';

  const avatar = document.createElement('div');
  avatar.className = 'voice-avatar';
  const genderIcon = voice.gender === 'female' ? '👩' : voice.gender === 'male' ? '👨' : '🧑';
  avatar.textContent = genderIcon;

  const nameEl = document.createElement('span');
  nameEl.className = 'voice-card-name';
  nameEl.textContent = voice.name;

  header.appendChild(avatar);
  header.appendChild(nameEl);
  card.appendChild(header);

  // Description
  const desc = document.createElement('div');
  desc.className = 'voice-card-desc';
  desc.textContent = voice.description;
  card.appendChild(desc);

  // Tags
  const tags = document.createElement('div');
  tags.className = 'voice-card-tags';
  (voice.style || []).forEach(style => {
    const tag = document.createElement('span');
    tag.className = 'voice-tag';
    tag.textContent = style;
    tags.appendChild(tag);
  });
  card.appendChild(tags);

  // Click handler
  card.addEventListener('click', () => {
    // Deselect all
    document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    // Update state
    wizardState.manifest.voice.voice_id = voice.id;
    wizardState.manifest.voice.name = voice.name;

    // Update selected voice info
    const infoEl = document.getElementById('selected-voice-info');
    const nameDisplay = document.getElementById('selected-voice-name');
    infoEl.style.display = 'block';
    nameDisplay.textContent = voice.name;

    // Trigger voice preview
    if (typeof window.previewVoice === 'function') {
      window.previewVoice(voice.id);
    }
  });

  return card;
}

function prevStep() {
  if (wizardState.currentStep > 1) {
    wizardState.currentStep--;
    updateUI();
  }
}

function nextStep() {
  if (validateCurrentStep()) {
    if (wizardState.currentStep < wizardState.totalSteps) {
      wizardState.currentStep++;
      updateUI();

      // Build review on last step
      if (wizardState.currentStep === 6) {
        buildReview();
      }
    }
  }
}

function validateCurrentStep() {
  const step = wizardState.currentStep;
  const errors = [];

  if (step === 1) {
    if (!wizardState.manifest.identity.name || wizardState.manifest.identity.name.length < 2) {
      errors.push('Persona name is required (minimum 2 characters)');
    }
    if (!wizardState.manifest.identity.tagline || wizardState.manifest.identity.tagline.length < 10) {
      errors.push('Tagline is required (minimum 10 characters)');
    }
  }

  if (step === 2) {
    if (wizardState.manifest.personality.traits.length < 2) {
      errors.push('At least 2 personality traits are required');
    }
  }

  if (step === 3) {
    if (!wizardState.manifest.voice.voice_id) {
      errors.push('Please select a voice for your persona');
    }
  }

  if (step === 4) {
    if (!wizardState.manifest.knowledge.category) {
      errors.push('Please select a primary category');
    }
    if (wizardState.manifest.knowledge.domains.length < 1) {
      errors.push('At least 1 knowledge domain is required');
    }
  }

  if (errors.length > 0) {
    alert(errors.join('\n'));
    return false;
  }

  return true;
}

function updateUI() {
  const step = wizardState.currentStep;

  // Update progress
  document.querySelectorAll('.wizard-step').forEach((stepEl, index) => {
    stepEl.classList.remove('active', 'completed');
    if (index + 1 < step) {
      stepEl.classList.add('completed');
    } else if (index + 1 === step) {
      stepEl.classList.add('active');
    }
  });

  // Update panels
  document.querySelectorAll('.wizard-panel').forEach((panel, index) => {
    panel.classList.remove('active');
    if (index + 1 === step) {
      panel.classList.add('active');
    }
  });

  // Update buttons
  document.getElementById('prev-btn').style.display = step > 1 ? 'flex' : 'none';
  document.getElementById('next-btn').style.display = step < wizardState.totalSteps ? 'flex' : 'none';
  document.getElementById('create-btn').style.display = step === wizardState.totalSteps ? 'flex' : 'none';
}

function buildReview() {
  const container = document.getElementById('review-summary');

  // Clear safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const m = wizardState.manifest;

  // Identity section
  const identitySection = createReviewSection('Identity', [
    ['Name', m.identity.name],
    ['ID', m.identity.id],
    ['Tagline', m.identity.tagline],
    ['Description', m.identity.description || '(not set)'],
    ['Aliases', m.identity.aliases.join(', ') || '(none)']
  ]);
  container.appendChild(identitySection);

  // Personality section
  const personalitySection = createReviewSection('Personality', [
    ['Warmth', m.personality.warmth.toFixed(1)],
    ['Humor', m.personality.humor_level.toFixed(1)],
    ['Directness', m.personality.directness.toFixed(1)],
    ['Formality', m.personality.formality.toFixed(1)],
    ['Traits', m.personality.traits.join(', ')]
  ]);
  container.appendChild(personalitySection);

  // Voice section
  const voiceSection = createReviewSection('Voice', [
    ['Voice', m.voice.name || m.voice.voice_id],
    ['Provider', m.voice.provider]
  ]);
  container.appendChild(voiceSection);

  // Knowledge section
  const knowledgeSection = createReviewSection('Knowledge', [
    ['Category', m.knowledge.category],
    ['Domains', m.knowledge.domains.join(', ')],
    ['Expertise', m.knowledge.expertise_tags.join(', ') || '(none)'],
    ['Out of Scope', m.knowledge.out_of_scope_topics.join(', ') || '(none)']
  ]);
  container.appendChild(knowledgeSection);

  // Behaviors section
  const behaviorsSection = createReviewSection('Behaviors', [
    ['Greetings', `${m.behaviors.greetings.length} defined`],
    ['Backchannels', `${m.behaviors.backchannels.length} defined`],
    ['Thinking sounds', `${m.behaviors.thinking_sounds.length} defined`]
  ]);
  container.appendChild(behaviorsSection);
}

function createReviewSection(title, rows) {
  const section = document.createElement('div');
  section.className = 'review-section';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'review-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'review-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    section.appendChild(row);
  });

  return section;
}

async function saveDraft() {
  const token = await window.getAuthToken();
  if (!token) return;

  // Update ID from current form value
  wizardState.manifest.identity.id = document.getElementById('persona-id').value;

  try {
    const method = wizardState.personaId ? 'PUT' : 'POST';
    const url = wizardState.personaId
      ? `${API_BASE}/api/v1/developers/personas/${wizardState.personaId}`
      : `${API_BASE}/api/v1/developers/personas`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ manifest: wizardState.manifest })
    });

    if (!response.ok) throw new Error('Failed to save draft');

    const data = await response.json();
    wizardState.personaId = data.persona.id;

    alert('Draft saved!');
  } catch (error) {
    console.error('Error saving draft:', error);
    alert('Failed to save draft. Please try again.');
  }
}

async function createPersona() {
  // First save as draft
  await saveDraft();

  if (!wizardState.personaId) {
    alert('Failed to create persona. Please try again.');
    return;
  }

  const token = await window.getAuthToken();
  if (!token) return;

  try {
    // Validate
    const validateRes = await fetch(
      `${API_BASE}/api/v1/developers/personas/${wizardState.personaId}/validate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const validateData = await validateRes.json();

    if (!validateData.validation.valid) {
      showValidationResults(validateData.validation);
      return;
    }

    // Show warnings if any
    if (validateData.validation.warnings.length > 0) {
      showValidationResults(validateData.validation);
    }

    // Redirect to personas list
    window.location.href = '/personas/';

  } catch (error) {
    console.error('Error creating persona:', error);
    alert('Failed to create persona. Please try again.');
  }
}

function showValidationResults(validation) {
  const container = document.getElementById('validation-results');
  const errorsEl = document.getElementById('validation-errors');
  const warningsEl = document.getElementById('validation-warnings');

  // Clear safely
  while (errorsEl.firstChild) {
    errorsEl.removeChild(errorsEl.firstChild);
  }
  while (warningsEl.firstChild) {
    warningsEl.removeChild(warningsEl.firstChild);
  }

  if (validation.errors.length > 0) {
    const heading = document.createElement('strong');
    heading.textContent = 'Errors (must fix):';
    errorsEl.appendChild(heading);

    const list = document.createElement('ul');
    validation.errors.forEach(err => {
      const li = document.createElement('li');
      li.textContent = err;
      list.appendChild(li);
    });
    errorsEl.appendChild(list);
    errorsEl.style.display = 'block';
  } else {
    errorsEl.style.display = 'none';
  }

  if (validation.warnings.length > 0) {
    const heading = document.createElement('strong');
    heading.textContent = 'Warnings (recommended):';
    warningsEl.appendChild(heading);

    const list = document.createElement('ul');
    validation.warnings.forEach(warn => {
      const li = document.createElement('li');
      li.textContent = warn;
      list.appendChild(li);
    });
    warningsEl.appendChild(list);
    warningsEl.style.display = 'block';
  } else {
    warningsEl.style.display = 'none';
  }

  container.style.display = 'block';
}

async function loadExistingPersona(personaId) {
  const token = await window.getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(
      `${API_BASE}/api/v1/developers/personas/${personaId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) throw new Error('Failed to load persona');

    const data = await response.json();
    wizardState.personaId = personaId;
    wizardState.manifest = data.persona.manifest;

    // Populate form fields
    populateFormFromState();

  } catch (error) {
    console.error('Error loading persona:', error);
    alert('Failed to load persona. Please try again.');
  }
}

function populateFormFromState() {
  const m = wizardState.manifest;

  // Identity
  document.getElementById('persona-name').value = m.identity.name || '';
  document.getElementById('persona-id').value = m.identity.id || '';
  document.getElementById('persona-id').dataset.manual = 'true';
  document.getElementById('persona-tagline').value = m.identity.tagline || '';
  document.getElementById('persona-description').value = m.identity.description || '';
  document.getElementById('persona-aliases').value = (m.identity.aliases || []).join(', ');

  // Personality
  document.getElementById('warmth-slider').value = m.personality.warmth;
  document.getElementById('warmth-value').textContent = m.personality.warmth.toFixed(1);
  document.getElementById('humor-slider').value = m.personality.humor_level;
  document.getElementById('humor-value').textContent = m.personality.humor_level.toFixed(1);
  document.getElementById('directness-slider').value = m.personality.directness;
  document.getElementById('directness-value').textContent = m.personality.directness.toFixed(1);
  document.getElementById('formality-slider').value = m.personality.formality;
  document.getElementById('formality-value').textContent = m.personality.formality.toFixed(1);
  renderTags(document.getElementById('traits-tags'), m.personality.traits);

  // Knowledge
  document.getElementById('persona-category').value = m.knowledge.category || '';
  renderTags(document.getElementById('domains-tags'), m.knowledge.domains);
  renderTags(document.getElementById('expertise-tags'), m.knowledge.expertise_tags);
  renderTags(document.getElementById('out-of-scope-tags'), m.knowledge.out_of_scope_topics);

  // Behaviors
  document.getElementById('greetings-input').value = (m.behaviors.greetings || []).join('\n');
  document.getElementById('backchannels-input').value = (m.behaviors.backchannels || []).join('\n');
  document.getElementById('thinking-input').value = (m.behaviors.thinking_sounds || []).join('\n');
}
