import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { generateQuizFromContent } from '../services/ai.js';
import { extractFileContent } from '../services/file-text.js';
import { escapeHtml, formatDate, layout, percent } from '../utils/html.js';
import { renderCreate } from './pages.js';

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadBytes }
});

const optionKeys = ['A', 'B', 'C', 'D'];

export const quizzesRouter = express.Router();

quizzesRouter.post('/create', requireUser, handleQuizUpload, async (req, res, next) => {
  let tempPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).send(renderCreate(req, 'Fayl tanlanmadi.'));
    }

    const extractedContent = await extractFileContent(req.file.path, req.file.originalname, req.file.mimetype);
    if (extractedContent.kind === 'text' && extractedContent.text.length < 20) {
      return res.status(400).send(renderCreate(req, 'Fayl ichidan yetarli matn topilmadi.'));
    }

    const fileId = randomUUID();
    const quizId = randomUUID();
    const requestedTitle = String(req.body.title || '').trim();

    await query(
      `INSERT INTO uploaded_files (id, user_id, original_name, mime_type, file_size, extracted_text)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fileId, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, extractedContent.storageText]
    );

    await query(
      `INSERT INTO quizzes (id, user_id, file_id, title, status)
       VALUES ($1, $2, $3, $4, 'processing')`,
      [quizId, req.user.id, fileId, requestedTitle || createTitleFromFile(req.file.originalname)]
    );

    try {
      const generatedQuiz = await generateQuizFromContent({
        content: extractedContent,
        fileName: req.file.originalname
      });

      const finalTitle = requestedTitle || generatedQuiz.title;

      await transaction(async (client) => {
        for (const question of generatedQuiz.questions) {
          await client.query(
            `INSERT INTO quiz_questions
              (id, quiz_id, idx, question, option_a, option_b, option_c, option_d, correct_option, explanation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              randomUUID(),
              quizId,
              question.idx,
              question.question,
              question.optionA,
              question.optionB,
              question.optionC,
              question.optionD,
              question.correctOption,
              question.explanation
            ]
          );
        }

        await client.query(
          `UPDATE quizzes
           SET title = $1, status = 'ready', question_count = $2, error_message = NULL, updated_at = NOW()
           WHERE id = $3 AND user_id = $4`,
          [finalTitle, generatedQuiz.questions.length, quizId, req.user.id]
        );
      });

      return res.redirect(`/quizzes/${quizId}`);
    } catch (error) {
      await query(
        `UPDATE quizzes
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3`,
        [error.message, quizId, req.user.id]
      );
      return res.status(500).send(renderCreate(req, error.message));
    }
  } catch (error) {
    return next(error);
  } finally {
    if (tempPath) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
    }
  }
});

quizzesRouter.get('/quizzes', requireUser, async (req, res, next) => {
  try {
    const quizzes = await query(
      `SELECT q.*,
        COALESCE(MAX(a.score), 0) AS best_score,
        COUNT(a.id)::int AS attempt_count
       FROM quizzes q
       LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = q.user_id
       WHERE q.user_id = $1
       GROUP BY q.id
       ORDER BY q.created_at DESC`,
      [req.user.id]
    );

    res.send(renderQuizList(req, quizzes.rows));
  } catch (error) {
    next(error);
  }
});

quizzesRouter.get('/others', requireUser, async (req, res, next) => {
  try {
    const quizzes = await query(
      `SELECT q.*,
        u.full_name AS owner_name,
        u.email AS owner_email,
        COUNT(a.id)::int AS attempt_count
       FROM quizzes q
       JOIN users u ON u.id = q.user_id
       LEFT JOIN quiz_attempts a ON a.quiz_id = q.id
       WHERE q.status = 'ready'
       GROUP BY q.id, u.full_name, u.email
       ORDER BY q.created_at DESC`,
      []
    );

    res.send(renderOthersList(req, quizzes.rows));
  } catch (error) {
    next(error);
  }
});

quizzesRouter.get('/quizzes/:id', requireUser, async (req, res, next) => {
  try {
    const quiz = await getVisibleQuiz(req.params.id);
    if (!quiz) return res.status(404).send(renderNotFound(req));

    const questions = await getQuizQuestions(quiz.id);
    const attempts = await getAttemptHistory(req.user.id, quiz.id);
    const playableQuestions = quiz.status === 'ready' ? buildPlayableQuestions(questions.rows) : [];
    res.send(renderQuizDetail(req, quiz, playableQuestions, attempts.rows));
  } catch (error) {
    next(error);
  }
});

quizzesRouter.post('/quizzes/:id/attempts', requireUser, async (req, res, next) => {
  try {
    const quiz = await getVisibleQuiz(req.params.id);
    if (!quiz || quiz.status !== 'ready') {
      return res.status(404).json({ error: 'Quiz topilmadi.' });
    }

    const questionsResult = await getQuizQuestions(quiz.id);
    const questions = questionsResult.rows;
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const submittedAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const answerByQuestionId = new Map(
      submittedAnswers
        .filter((answer) => questionsById.has(String(answer.questionId || '')))
        .map((answer) => [String(answer.questionId), answer])
    );

    let score = 0;
    const normalizedAnswers = questions.map((question) => {
      const answer = answerByQuestionId.get(question.id) || {};
      const selectedOption = sanitizeOption(answer.selectedOriginalOption);
      const timedOut = Boolean(answer.timedOut) || !selectedOption;
      const isCorrect = !timedOut && selectedOption === question.correct_option;

      if (isCorrect) score += 1;

      return {
        questionId: question.id,
        displayedIdx: toSafeInteger(answer.displayedIdx, null),
        selectedOption: timedOut ? null : selectedOption,
        selectedDisplayOption: timedOut ? null : sanitizeOption(answer.selectedDisplayOption),
        correctDisplayOption: sanitizeOption(answer.correctDisplayOption),
        optionOrder: normalizeOptionOrder(answer.optionOrder),
        timedOut,
        elapsedMs: Math.min(toSafeInteger(answer.elapsedMs, 0), 30000),
        isCorrect
      };
    });

    const attemptId = randomUUID();
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO quiz_attempts (id, user_id, quiz_id, score, total)
         VALUES ($1, $2, $3, $4, $5)`,
        [attemptId, req.user.id, quiz.id, score, questions.length]
      );

      for (const item of normalizedAnswers) {
        await client.query(
          `INSERT INTO quiz_attempt_answers
            (id, attempt_id, question_id, displayed_idx, selected_option, selected_display_option,
             correct_display_option, option_order, timed_out, elapsed_ms, is_correct)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            randomUUID(),
            attemptId,
            item.questionId,
            item.displayedIdx,
            item.selectedOption,
            item.selectedDisplayOption,
            item.correctDisplayOption,
            item.optionOrder,
            item.timedOut,
            item.elapsedMs,
            item.isCorrect
          ]
        );
      }
    });

    const attempts = await getAttemptHistory(req.user.id, quiz.id);

    return res.json({
      attemptId,
      score,
      total: questions.length,
      percent: percent(score, questions.length),
      attempts: attempts.rows.map(serializeAttempt)
    });
  } catch (error) {
    return next(error);
  }
});

function handleQuizUpload(req, res, next) {
  upload.single('quizFile')(req, res, (error) => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Fayl 10 MB dan katta. Kichikroq fayl yuboring.'
      : error.message || 'Fayl yuklashda xatolik yuz berdi.';

    return res.status(400).send(renderCreate(req, message));
  });
}

async function getOwnedQuiz(id, userId) {
  const result = await query('SELECT * FROM quizzes WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function getVisibleQuiz(id) {
  const result = await query(
    `SELECT q.*, u.full_name AS owner_name, u.email AS owner_email
     FROM quizzes q
     JOIN users u ON u.id = q.user_id
     WHERE q.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function getQuizQuestions(quizId) {
  return query('SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY idx ASC', [quizId]);
}

function getAttemptHistory(userId, quizId) {
  return query(
    `SELECT id, score, total, created_at
     FROM quiz_attempts
     WHERE user_id = $1 AND quiz_id = $2
     ORDER BY created_at DESC
     LIMIT 12`,
    [userId, quizId]
  );
}

function renderQuizList(req, quizzes) {
  const rows = quizzes.length
    ? quizzes.map((quiz) => {
      const ready = quiz.status === 'ready';
      const failed = quiz.status === 'failed';
      const best = Number(quiz.best_score || 0);
      const total = Number(quiz.question_count || 0);

      return `
        <article class="quiz-card">
          <div>
            <span class="status-pill ${ready ? 'ok' : failed ? 'danger' : 'warn'}">${escapeHtml(statusLabel(quiz.status))}</span>
            <h2>${escapeHtml(quiz.title)}</h2>
            <p class="muted">${Number(quiz.question_count || 0)} ta savol | ${Number(quiz.attempt_count || 0)} urinish | ${formatDate(quiz.created_at)}</p>
          </div>
          <div class="quiz-card-side">
            ${total ? `<strong>${best}/${total}</strong><small>eng yaxshi natija</small>` : '<strong>-</strong><small>natija yo‘q</small>'}
            <a class="button small ${ready ? '' : 'secondary'}" href="/quizzes/${quiz.id}">${ready ? 'Testni ochish' : 'Ko‘rish'}</a>
          </div>
        </article>
      `;
    }).join('')
    : `
      <div class="empty-state">
        <h2>Hali quiz yo‘q.</h2>
        <p class="muted">Create Quiz Test bo‘limiga o‘ting va fayl yuklang.</p>
        <a class="button" href="/create">Create Quiz Test</a>
      </div>
    `;

  return layout({
    title: 'Quiz tests',
    user: req.user,
    active: 'quizzes',
    body: `
      <section class="page-head">
        <div>
          <p class="eyebrow">Quiz tests</p>
          <h1>Yaratilgan testlaringiz.</h1>
          <p class="muted">AI yaratgan quizlar va ularning natijalari shu yerda saqlanadi.</p>
        </div>
        <a class="button" href="/create">Yangi quiz</a>
      </section>
      <section class="quiz-list">${rows}</section>
    `
  });
}

function renderOthersList(req, quizzes) {
  const rows = quizzes.length
    ? quizzes.map((quiz) => `
      <article class="quiz-card public-card">
        <div>
          <span class="status-pill ok">Public</span>
          <h2>${escapeHtml(quiz.title)}</h2>
          <p class="muted">
            ${Number(quiz.question_count || 0)} ta savol |
            ${Number(quiz.attempt_count || 0)} umumiy urinish |
            yaratgan: ${escapeHtml(quiz.owner_name || quiz.owner_email || 'User')}
          </p>
        </div>
        <div class="quiz-card-side">
          <small>${formatDate(quiz.created_at)}</small>
          <a class="button small" href="/quizzes/${quiz.id}">Testni ishlash</a>
        </div>
      </article>
    `).join('')
    : `
      <div class="empty-state">
        <h2>Hali public quiz yo‘q.</h2>
        <p class="muted">Kimdir quiz yaratganda shu bo‘limda ko‘rinadi.</p>
      </div>
    `;

  return layout({
    title: 'Others Users Tests',
    user: req.user,
    active: 'others',
    body: `
      <section class="page-head">
        <div>
          <p class="eyebrow">Others Users Tests</p>
          <h1>Boshqa foydalanuvchilar yaratgan testlar.</h1>
          <p class="muted">Bu yerda barcha tayyor quizlar ko‘rinadi. Istalgan birini ochib ishlashingiz mumkin.</p>
        </div>
        <a class="button" href="/create">O‘zim quiz yarataman</a>
      </section>
      <section class="quiz-list">${rows}</section>
    `
  });
}

function renderQuizDetail(req, quiz, questions, attempts) {
  if (quiz.status === 'failed') {
    return layout({
      title: quiz.title,
      user: req.user,
      active: 'quizzes',
      body: `
        <section class="empty-state">
          <span class="status-pill danger">Xatolik</span>
          <h1>${escapeHtml(quiz.title)}</h1>
          <p class="muted">${escapeHtml(quiz.error_message || 'Quiz yaratishda xatolik yuz berdi.')}</p>
          <a class="button" href="/create">Qayta urinish</a>
        </section>
      `
    });
  }

  if (quiz.status !== 'ready') {
    return layout({
      title: quiz.title,
      user: req.user,
      active: 'quizzes',
      body: `
        <section class="empty-state">
          <span class="status-pill warn">Jarayonda</span>
          <h1>${escapeHtml(quiz.title)}</h1>
          <p class="muted">AI hali testni tayyorlayapti. Bir necha soniyadan keyin sahifani yangilang.</p>
        </section>
      `
    });
  }

  const payload = {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      total: questions.length
    },
    questions,
    submitUrl: `/quizzes/${quiz.id}/attempts`,
    secondsPerQuestion: 30,
    countdownSeconds: 5
  };
  const shareUrl = `${req.protocol}://${req.get('host')}/quizzes/${quiz.id}`;
  const ownerName = quiz.owner_name || req.user.full_name || quiz.owner_email || 'User';
  const isOwner = quiz.user_id === req.user.id;

  return layout({
    title: quiz.title,
    user: req.user,
    active: 'quizzes',
    body: `
      <section class="page-head">
        <div>
          <p class="eyebrow">Test</p>
          <h1>${escapeHtml(quiz.title)}</h1>
          <p class="muted">${questions.length} ta savol. Yaratgan: ${escapeHtml(ownerName)}. Har savol uchun 30 sekund, savollar va variantlar har urinishda random.</p>
        </div>
        <div class="head-actions">
          <button class="button" id="share-quiz" type="button" data-share-url="${escapeHtml(shareUrl)}">Ulashish</button>
          <a class="button secondary" href="${isOwner ? '/quizzes' : '/others'}">${isOwner ? 'Quiz tests' : 'Others Users Tests'}</a>
        </div>
      </section>

      <section class="play-layout">
        <div class="quiz-stage" id="quiz-app">
          <section class="telegram-panel start-screen" id="start-screen" aria-live="polite">
            <div class="telegram-message">
              <h2><span aria-hidden="true">🎲</span> Testga tayyormisiz «${escapeHtml(quiz.title)}»</h2>
              <p class="single-line">1</p>
              <ul class="start-facts">
                <li><span aria-hidden="true">🖊️</span> ${questions.length} ta savol</li>
                <li><span aria-hidden="true">⏱️</span> Har savolga 30 sekund</li>
                <li><span aria-hidden="true">📄</span> Javoblar test yakunida saqlanadi</li>
              </ul>
              <p class="start-note"><span aria-hidden="true">🏁</span> Tayyor bo‘lsangiz, pastdagi knopkani bosing.</p>
            </div>
            <button class="telegram-button" id="start-quiz" type="button">Boshlash</button>
          </section>

          <section class="telegram-panel countdown-screen hidden" id="countdown-screen" aria-live="polite">
            <span class="countdown-label">Tayyorlaning</span>
            <strong id="countdown-value">5</strong>
          </section>

          <section class="telegram-panel live-screen hidden" id="question-screen">
            <div class="live-top">
              <strong id="question-progress"></strong>
              <span id="question-timer">30</span>
            </div>
            <div class="timer-track"><span id="timer-fill"></span></div>
            <h2 id="question-text"></h2>
            <div class="telegram-options" id="question-options"></div>
          </section>

          <section class="telegram-panel feedback-screen hidden" id="feedback-screen" aria-live="polite"></section>

          <section class="telegram-panel finish-screen hidden" id="finish-screen" aria-live="polite"></section>
        </div>

        <aside class="attempt-panel">
          <h2>Urinishlar tarixi</h2>
          <div id="attempt-history">
            ${renderAttemptHistory(attempts)}
          </div>
        </aside>
      </section>

      <script id="quiz-data" type="application/json">${safeJson(payload)}</script>
      <script src="/assets/quiz-player.js" defer></script>
    `
  });
}

function renderAttemptHistory(attempts) {
  if (!attempts.length) {
    return '<p class="muted">Bu quiz hali ishlanmagan. Birinchi natija yakunda shu yerga yoziladi.</p>';
  }

  return attempts.map((attempt, index) => `
    <article class="attempt-row ${index === 0 ? 'latest' : ''}">
      <div>
        <strong>${Number(attempt.score)}/${Number(attempt.total)}</strong>
        <span>${percent(attempt.score, attempt.total)}%</span>
      </div>
      <time>${formatDate(attempt.created_at)}</time>
    </article>
  `).join('');
}

function renderNotFound(req) {
  return layout({
    title: 'Topilmadi',
    user: req.user,
    active: 'quizzes',
    body: `
      <section class="empty-state">
        <h1>Quiz topilmadi.</h1>
        <a class="button" href="/quizzes">Quiz tests</a>
      </section>
    `
  });
}

function buildPlayableQuestions(questions) {
  return shuffle(questions).map((question, questionIndex) => {
    const options = shuffle([
      { originalKey: 'A', text: question.option_a },
      { originalKey: 'B', text: question.option_b },
      { originalKey: 'C', text: question.option_c },
      { originalKey: 'D', text: question.option_d }
    ]).map((option, optionIndex) => ({
      displayKey: optionKeys[optionIndex],
      originalKey: option.originalKey,
      text: option.text,
      isCorrect: option.originalKey === question.correct_option
    }));

    const correctOption = options.find((option) => option.isCorrect);

    return {
      id: question.id,
      displayIndex: questionIndex + 1,
      question: question.question,
      explanation: question.explanation || '',
      options,
      correctDisplayKey: correctOption?.displayKey || 'A'
    };
  });
}

function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function serializeAttempt(attempt) {
  return {
    id: attempt.id,
    score: Number(attempt.score || 0),
    total: Number(attempt.total || 0),
    percent: percent(attempt.score, attempt.total),
    createdAt: formatDate(attempt.created_at)
  };
}

function sanitizeOption(value) {
  const option = String(value || '').slice(0, 1).toUpperCase();
  return optionKeys.includes(option) ? option : null;
}

function normalizeOptionOrder(value) {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(',');
}

function toSafeInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function statusLabel(status) {
  if (status === 'ready') return 'Tayyor';
  if (status === 'failed') return 'Xatolik';
  return 'Jarayonda';
}

function createTitleFromFile(fileName) {
  return String(fileName || 'Yangi quiz').replace(/\.[^.]+$/, '').replaceAll('_', ' ');
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
