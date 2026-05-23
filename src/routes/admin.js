import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { escapeHtml, formatDate, layout } from '../utils/html.js';

export const adminRouter = express.Router();

adminRouter.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [stats, users, quizzes] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM quizzes) AS quizzes,
          (SELECT COUNT(*)::int FROM quiz_questions) AS questions,
          (SELECT COUNT(*)::int FROM quiz_attempts) AS attempts
      `),
      query('SELECT id, full_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 12'),
      query(`
        SELECT q.*, u.full_name, u.email
        FROM quizzes q
        JOIN users u ON u.id = q.user_id
        ORDER BY q.created_at DESC
        LIMIT 12
      `)
    ]);

    res.send(renderAdminDashboard(req, stats.rows[0], users.rows, quizzes.rows));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/quizzes/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await query('DELETE FROM quizzes WHERE id = $1', [req.params.id]);
    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/users/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

function renderAdminDashboard(req, stats, users, quizzes) {
  const userRows = users.map((user) => `
    <tr>
      <td>
        <strong>${escapeHtml(user.full_name)}</strong>
        <span>${escapeHtml(user.email)}</span>
      </td>
      <td>${formatDate(user.created_at)}</td>
      <td class="table-actions">
        <form method="post" action="/admin/users/${user.id}/delete" onsubmit="return confirm('Foydalanuvchi va uning barcha quizlari o‘chirilsinmi?')">
          <button class="danger-button" type="submit">O‘chirish</button>
        </form>
      </td>
    </tr>
  `).join('');

  const quizRows = quizzes.map((quiz) => `
    <tr>
      <td>
        <strong>${escapeHtml(quiz.title)}</strong>
        <span>${escapeHtml(quiz.full_name)} | ${escapeHtml(quiz.email)}</span>
      </td>
      <td>${escapeHtml(quiz.status)}</td>
      <td>${Number(quiz.question_count || 0)}</td>
      <td>${formatDate(quiz.created_at)}</td>
      <td class="table-actions">
        <form method="post" action="/admin/quizzes/${quiz.id}/delete" onsubmit="return confirm('Quiz o‘chirilsinmi?')">
          <button class="danger-button" type="submit">O‘chirish</button>
        </form>
      </td>
    </tr>
  `).join('');

  return layout({
    title: 'Admin',
    user: req.user,
    admin: true,
    body: `
      <section class="page-head">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Boshqaruv paneli.</h1>
          <p class="muted">Foydalanuvchilar, quizlar, savollar va urinishlar bo‘yicha umumiy nazorat.</p>
        </div>
        <span class="status-pill ${config.ai.apiKey ? 'ok' : 'warn'}">${config.ai.apiKey ? 'AI sozlangan' : 'AI key yo‘q'}</span>
      </section>

      <section class="stats-grid">
        <article><span>Users</span><strong>${Number(stats.users || 0)}</strong></article>
        <article><span>Quizzes</span><strong>${Number(stats.quizzes || 0)}</strong></article>
        <article><span>Questions</span><strong>${Number(stats.questions || 0)}</strong></article>
        <article><span>Attempts</span><strong>${Number(stats.attempts || 0)}</strong></article>
      </section>

      <section class="admin-grid">
        <div class="panel table-panel">
          <div class="panel-head">
            <h2>Oxirgi foydalanuvchilar</h2>
          </div>
          <table>
            <thead><tr><th>Foydalanuvchi</th><th>Ro‘yxatdan o‘tgan</th><th></th></tr></thead>
            <tbody>${userRows || '<tr><td colspan="3">Foydalanuvchi yo‘q.</td></tr>'}</tbody>
          </table>
        </div>

        <div class="panel table-panel">
          <div class="panel-head">
            <h2>Oxirgi quizlar</h2>
          </div>
          <table>
            <thead><tr><th>Quiz</th><th>Status</th><th>Savol</th><th>Sana</th><th></th></tr></thead>
            <tbody>${quizRows || '<tr><td colspan="5">Quiz yo‘q.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `
  });
}
