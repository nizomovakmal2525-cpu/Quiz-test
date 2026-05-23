import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { initDatabase, query } from './db.js';
import { attachUser } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { pagesRouter } from './routes/pages.js';
import { quizzesRouter } from './routes/quizzes.js';
import { escapeHtml, layout } from './utils/html.js';

const app = express();
app.set('trust proxy', true);

await fs.mkdir(config.uploadDir, { recursive: true });
await initDatabase();
await reconcileQuizStatuses();

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(config.rootDir, 'public')));
app.use(attachUser);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(pagesRouter);
app.use(authRouter);
app.use(quizzesRouter);
app.use(adminRouter);

app.use((req, res) => {
  res.status(404).send(layout({
    title: '404',
    user: req.user,
    admin: req.isAdmin,
    body: `
      <section class="empty-state">
        <h1>Sahifa topilmadi.</h1>
        <a class="button" href="/rules">Qoidalar</a>
      </section>
    `
  }));
});

app.use((error, req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'Fayl 10 MB dan katta. Kichikroq fayl yuboring.'
    : error.message || 'Server xatosi';

  console.error(error);
  res.status(status).send(layout({
    title: 'Xatolik',
    user: req.user,
    admin: req.isAdmin,
    body: `
      <section class="empty-state">
        <span class="status-pill danger">Xatolik</span>
        <h1>Jarayon yakunlanmadi.</h1>
        <p class="muted">${escapeHtml(message)}</p>
        <a class="button" href="/rules">Qoidalar</a>
      </section>
    `
  }));
});

app.listen(config.port, () => {
  console.log(`Quiz Test AI: http://localhost:${config.port}`);
});

async function reconcileQuizStatuses() {
  await query(`
    UPDATE quizzes q
    SET status = 'ready',
        question_count = computed.question_count,
        error_message = NULL,
        updated_at = NOW()
    FROM (
      SELECT quiz_id, COUNT(*)::int AS question_count
      FROM quiz_questions
      GROUP BY quiz_id
    ) computed
    WHERE q.id = computed.quiz_id
      AND q.status = 'processing'
      AND computed.question_count > 0
  `);

  await query(`
    UPDATE quizzes
    SET status = 'failed',
        error_message = 'AI jarayoni yakunlanmay qolgan. Faylni qayta yuklab ko‘ring.',
        updated_at = NOW()
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '30 minutes'
  `);
}
