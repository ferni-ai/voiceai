/**
 * Persona Quiz - "Who can help with YOUR challenge?"
 * ===================================================
 * Interactive quiz to match users with the right Ferni persona
 */

(function() {
  'use strict';

  // Persona data with scoring dimensions
  const PERSONAS = {
    ferni: {
      id: 'ferni',
      name: 'Ferni',
      initials: 'FE',
      role: 'Life Coach',
      color: '#4a6741',
      match: 'You need someone who listens deeply and asks the questions that unlock insight.',
      traits: ['emotional-support', 'clarity', 'presence']
    },
    nayan: {
      id: 'nayan',
      name: 'Nayan',
      initials: 'NP',
      role: 'Sage & Mentor',
      color: '#9a7b5a',
      match: 'You value long-term wisdom and perspective that comes from seeing the bigger picture.',
      traits: ['wisdom', 'perspective', 'patience']
    },
    peter: {
      id: 'peter',
      name: 'Peter',
      initials: 'PL',
      role: 'Research & Discovery',
      color: '#3a6b73',
      match: 'You want data-driven insights that reveal patterns you can\'t see yourself.',
      traits: ['analytical', 'patterns', 'data']
    },
    alex: {
      id: 'alex',
      name: 'Alex',
      initials: 'AX',
      role: 'Communication',
      color: '#5a6b8a',
      match: 'You need help navigating difficult conversations with confidence.',
      traits: ['communication', 'negotiation', 'confidence']
    },
    maya: {
      id: 'maya',
      name: 'Maya',
      initials: 'MY',
      role: 'Habits & Routines',
      color: '#a67a6a',
      match: 'You want to build lasting habits through small, sustainable changes.',
      traits: ['habits', 'consistency', 'systems']
    },
    jordan: {
      id: 'jordan',
      name: 'Jordan',
      initials: 'JD',
      role: 'Planning & Events',
      color: '#c4856a',
      match: 'You need help turning dreams into actionable plans and memorable experiences.',
      traits: ['planning', 'creativity', 'execution']
    }
  };

  // Quiz questions
  const QUESTIONS = [
    {
      question: "When you're facing a challenge, what do you need most?",
      answers: [
        { text: "Someone to really listen and understand", personas: ['ferni', 'nayan'] },
        { text: "Clear data and patterns to make sense of it", personas: ['peter'] },
        { text: "Help with what to say or do next", personas: ['alex', 'jordan'] },
        { text: "Small, practical steps I can start today", personas: ['maya'] }
      ]
    },
    {
      question: "What's keeping you up at 2am?",
      answers: [
        { text: "Big life decisions I can't figure out", personas: ['ferni', 'nayan'] },
        { text: "Worrying if I'm spending time on the right things", personas: ['peter', 'maya'] },
        { text: "A conversation I'm dreading having", personas: ['alex'] },
        { text: "Dreams I haven't turned into reality", personas: ['jordan', 'nayan'] }
      ]
    },
    {
      question: "What would feel like a win right now?",
      answers: [
        { text: "Feeling heard and understood", personas: ['ferni'] },
        { text: "Gaining clarity on my next 10 years", personas: ['nayan'] },
        { text: "Understanding where my time and energy really goes", personas: ['peter'] },
        { text: "Nailing that difficult conversation", personas: ['alex'] },
        { text: "Finally sticking to a routine", personas: ['maya'] },
        { text: "Making that trip or event actually happen", personas: ['jordan'] }
      ]
    },
    {
      question: "How do you prefer to solve problems?",
      answers: [
        { text: "Talk through my feelings first", personas: ['ferni'] },
        { text: "Zoom out and see the bigger picture", personas: ['nayan'] },
        { text: "Look at the numbers and patterns", personas: ['peter'] },
        { text: "Practice and prepare", personas: ['alex'] },
        { text: "Break it into tiny daily actions", personas: ['maya'] },
        { text: "Plan it out step by step", personas: ['jordan'] }
      ]
    }
  ];

  let currentQuestion = 0;
  let scores = {};

  function initQuiz() {
    const quizContainer = document.querySelector('[data-persona-quiz]');
    if (!quizContainer) return;

    // Reset scores
    scores = {};
    Object.keys(PERSONAS).forEach(p => scores[p] = 0);
    currentQuestion = 0;

    renderQuestion(quizContainer);

    console.log('%c🧭 Persona quiz loaded', 'color: #4a6741; font-weight: bold;');
  }

  function renderQuestion(container) {
    const question = QUESTIONS[currentQuestion];
    const progress = ((currentQuestion) / QUESTIONS.length) * 100;

    container.innerHTML = `
      <div class="quiz__progress">
        <div class="quiz__progress-bar" style="width: ${progress}%"></div>
      </div>
      <div class="quiz__content">
        <p class="quiz__step">Question ${currentQuestion + 1} of ${QUESTIONS.length}</p>
        <h3 class="quiz__question">${question.question}</h3>
        <div class="quiz__answers">
          ${question.answers.map((answer, idx) => `
            <button class="quiz__answer" data-answer="${idx}" data-personas="${answer.personas.join(',')}">
              ${answer.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Add click handlers
    container.querySelectorAll('.quiz__answer').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(container, btn));
    });

    // Animate in
    const content = container.querySelector('.quiz__content');
    content.style.opacity = '0';
    content.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
      content.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    });
  }

  function handleAnswer(container, btn) {
    // Visual feedback
    btn.classList.add('quiz__answer--selected');

    // Score the personas
    const personas = btn.dataset.personas.split(',');
    personas.forEach(p => {
      scores[p] = (scores[p] || 0) + 1;
    });

    // Wait for animation then proceed
    setTimeout(() => {
      currentQuestion++;
      if (currentQuestion < QUESTIONS.length) {
        renderQuestion(container);
      } else {
        showResult(container);
      }
    }, 300);
  }

  function showResult(container) {
    // Find winning persona
    const winner = Object.entries(scores)
      .sort(([,a], [,b]) => b - a)[0][0];

    const persona = PERSONAS[winner];

    container.innerHTML = `
      <div class="quiz__result">
        <div class="quiz__result-avatar" style="--persona-color: ${persona.color}">
          <div class="quiz__result-avatar-orb">
            <span>${persona.initials}</span>
          </div>
          <div class="quiz__result-avatar-glow"></div>
        </div>
        <p class="quiz__result-label">Your ideal guide is</p>
        <h3 class="quiz__result-name">${persona.name}</h3>
        <p class="quiz__result-role">${persona.role}</p>
        <p class="quiz__result-match">${persona.match}</p>
        <div class="quiz__result-actions">
          <a href="https://app.ferni.ai?persona=${persona.id}" class="btn btn--primary">
            Meet ${persona.name}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
          <button class="btn btn--ghost" data-quiz-restart>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Retake Quiz
          </button>
        </div>
        <p class="quiz__result-note">
          All six specialists work together. Start with ${persona.name}, and they'll bring in the right help when you need it.
        </p>
      </div>
    `;

    // Animate in
    const result = container.querySelector('.quiz__result');
    result.style.opacity = '0';
    result.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
      result.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      result.style.opacity = '1';
      result.style.transform = 'translateY(0)';
    });

    // Avatar pulse animation
    const avatar = container.querySelector('.quiz__result-avatar');
    avatar.style.animation = 'quizAvatarPulse 2s ease-in-out infinite';

    // Restart handler
    container.querySelector('[data-quiz-restart]')?.addEventListener('click', () => {
      initQuiz();
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuiz);
  } else {
    initQuiz();
  }

})();
