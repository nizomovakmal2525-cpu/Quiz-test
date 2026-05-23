const dataEl = document.getElementById('quiz-data');

if (dataEl) {
  const config = JSON.parse(dataEl.textContent);
  const state = {
    currentIndex: 0,
    score: 0,
    answers: [],
    timerId: null,
    deadline: 0,
    questionStartedAt: 0,
    locked: false
  };

  const els = {
    startScreen: document.getElementById('start-screen'),
    countdownScreen: document.getElementById('countdown-screen'),
    questionScreen: document.getElementById('question-screen'),
    feedbackScreen: document.getElementById('feedback-screen'),
    finishScreen: document.getElementById('finish-screen'),
    startButton: document.getElementById('start-quiz'),
    countdownValue: document.getElementById('countdown-value'),
    questionProgress: document.getElementById('question-progress'),
    questionTimer: document.getElementById('question-timer'),
    timerFill: document.getElementById('timer-fill'),
    questionText: document.getElementById('question-text'),
    questionOptions: document.getElementById('question-options'),
    attemptHistory: document.getElementById('attempt-history')
  };

  els.startButton?.addEventListener('click', startCountdown);

  function startCountdown() {
    state.currentIndex = 0;
    state.score = 0;
    state.answers = [];
    state.locked = false;
    showOnly(els.countdownScreen);

    let count = config.countdownSeconds || 5;
    els.countdownValue.textContent = count;

    const countdownId = window.setInterval(() => {
      count -= 1;

      if (count > 0) {
        els.countdownValue.textContent = count;
        return;
      }

      if (count === 0) {
        els.countdownValue.textContent = 'Ketdik';
        return;
      }

      window.clearInterval(countdownId);
      showQuestion();
    }, 1000);
  }

  function showQuestion() {
    clearQuestionTimer();
    state.locked = false;
    const question = config.questions[state.currentIndex];

    if (!question) {
      finishQuiz();
      return;
    }

    showOnly(els.questionScreen);
    els.questionProgress.textContent = `[${state.currentIndex + 1}/${config.questions.length}]`;
    els.questionText.textContent = question.question;
    els.questionOptions.innerHTML = '';

    question.options.forEach((option) => {
      const button = document.createElement('button');
      button.className = 'telegram-option';
      button.type = 'button';
      button.innerHTML = `
        <span class="option-key">${escapeHtml(option.displayKey)}</span>
        <span>${escapeHtml(option.text)}</span>
      `;
      button.addEventListener('click', () => answerQuestion(option, false));
      els.questionOptions.append(button);
    });

    state.questionStartedAt = Date.now();
    state.deadline = state.questionStartedAt + (config.secondsPerQuestion * 1000);
    tickTimer();
    state.timerId = window.setInterval(tickTimer, 250);
  }

  function tickTimer() {
    const remainingMs = Math.max(0, state.deadline - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const ratio = remainingMs / (config.secondsPerQuestion * 1000);

    els.questionTimer.textContent = remainingSeconds;
    els.timerFill.style.transform = `scaleX(${ratio})`;

    if (remainingMs <= 0 && !state.locked) {
      const question = config.questions[state.currentIndex];
      const correctOption = question.options.find((option) => option.isCorrect);
      answerQuestion(correctOption, true);
    }
  }

  function answerQuestion(option, timedOut) {
    if (state.locked) return;
    state.locked = true;
    clearQuestionTimer();

    const question = config.questions[state.currentIndex];
    const selectedOption = timedOut ? null : option;
    const isCorrect = Boolean(selectedOption?.isCorrect);
    const elapsedMs = Math.min(Date.now() - state.questionStartedAt, config.secondsPerQuestion * 1000);

    if (isCorrect) state.score += 1;

    state.answers.push({
      questionId: question.id,
      displayedIdx: state.currentIndex + 1,
      selectedOriginalOption: selectedOption?.originalKey || null,
      selectedDisplayOption: selectedOption?.displayKey || null,
      correctDisplayOption: question.correctDisplayKey,
      optionOrder: question.options.map((item) => item.originalKey),
      timedOut,
      elapsedMs
    });

    showFeedback(question, selectedOption, isCorrect, timedOut);
  }

  function showFeedback(question, selectedOption, isCorrect, timedOut) {
    showOnly(els.feedbackScreen);

    const correctOption = question.options.find((option) => option.isCorrect);
    const totalVotes = 100;
    const selectedKey = selectedOption?.displayKey;
    const correctKey = correctOption?.displayKey;

    const rows = question.options.map((option) => {
      const selected = selectedKey === option.displayKey;
      const correct = correctKey === option.displayKey;
      const pct = correct ? (selected || timedOut ? 100 : 78) : selected ? 22 : 0;
      const rowClass = correct ? 'correct' : selected ? 'wrong' : '';
      const marker = correct ? '✓' : selected ? '✕' : '';

      return `
        <div class="poll-row ${rowClass}">
          <div class="poll-label">
            <span>${pct}% ${escapeHtml(option.text)}</span>
            ${marker ? `<strong>${marker}</strong>` : ''}
          </div>
          <div class="poll-track"><span style="width:${Math.min(pct, totalVotes)}%"></span></div>
        </div>
      `;
    }).join('');

    els.feedbackScreen.innerHTML = `
      <div class="telegram-message">
        <h2>[${state.currentIndex + 1}/${config.questions.length}] ${escapeHtml(question.question)}</h2>
        <p class="final-results">Final results <span class="mini-avatar"></span></p>
        ${timedOut ? '<p class="timeout-note">Vaqt tugadi. To‘g‘ri javob avtomatik ko‘rsatildi.</p>' : ''}
        <div class="poll-list">${rows}</div>
        ${question.explanation ? `<p class="feedback-note">${escapeHtml(question.explanation)}</p>` : ''}
      </div>
    `;

    window.setTimeout(() => {
      state.currentIndex += 1;
      showQuestion();
    }, 1800);
  }

  async function finishQuiz() {
    clearQuestionTimer();
    showOnly(els.finishScreen);

    const total = config.questions.length;
    const unanswered = state.answers.filter((answer) => answer.timedOut).length;
    const wrong = total - state.score - unanswered;

    els.finishScreen.innerHTML = `
      <div class="telegram-message end-message">
        <h2><span aria-hidden="true">🏁</span> Test «${escapeHtml(config.quiz.title)}» yakunlandi!</h2>
        <p><em>Siz ${total} ta savolni yakunladingiz.</em></p>
        <ul class="result-list">
          <li><span class="result-icon ok">✓</span> To‘g‘ri - ${state.score}</li>
          <li><span class="result-icon bad">✕</span> Noto‘g‘ri - ${wrong}</li>
          <li><span class="result-icon neutral">⏱</span> Vaqti tugagan - ${unanswered}</li>
        </ul>
        <p class="result-place">${Math.round((state.score / total) * 100)}% natija. Bu urinish profilingizga saqlanmoqda.</p>
      </div>
      <button class="telegram-button" id="restart-quiz" type="button">Qayta boshlash</button>
    `;

    document.getElementById('restart-quiz')?.addEventListener('click', () => {
      window.location.reload();
    });

    try {
      const response = await fetch(config.submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: state.answers })
      });

      if (!response.ok) {
        throw new Error('Natijani saqlashda xatolik yuz berdi.');
      }

      const saved = await response.json();
      updateFinishScreen(saved);
      updateAttemptHistory(saved.attempts || []);
    } catch (error) {
      const warning = document.createElement('p');
      warning.className = 'timeout-note';
      warning.textContent = error.message;
      els.finishScreen.querySelector('.telegram-message')?.append(warning);
    }
  }

  function updateFinishScreen(saved) {
    const place = els.finishScreen.querySelector('.result-place');
    if (place) {
      place.textContent = `${saved.percent}% natija. Natija saqlandi: ${saved.score}/${saved.total}.`;
    }
  }

  function updateAttemptHistory(attempts) {
    if (!els.attemptHistory || !attempts.length) return;

    els.attemptHistory.innerHTML = attempts.map((attempt, index) => `
      <article class="attempt-row ${index === 0 ? 'latest' : ''}">
        <div>
          <strong>${attempt.score}/${attempt.total}</strong>
          <span>${attempt.percent}%</span>
        </div>
        <time>${escapeHtml(attempt.createdAt)}</time>
      </article>
    `).join('');
  }

  function showOnly(active) {
    [
      els.startScreen,
      els.countdownScreen,
      els.questionScreen,
      els.feedbackScreen,
      els.finishScreen
    ].forEach((screen) => {
      screen?.classList.toggle('hidden', screen !== active);
    });
  }

  function clearQuestionTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
