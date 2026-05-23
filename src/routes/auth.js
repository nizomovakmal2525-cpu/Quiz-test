import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { clearAuthCookie, signAdminCookie, signUserCookie } from '../middleware/auth.js';
import { escapeHtml, fieldError, layout } from '../utils/html.js';

export const authRouter = express.Router();

authRouter.get('/register', (req, res) => {
  if (req.user && !req.isAdmin) return res.redirect('/rules');
  res.send(renderRegister({ user: req.user }));
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (fullName.length < 2) {
      return res.status(400).send(renderRegister({ user: req.user, error: 'Ism kamida 2 ta belgidan iborat bo‘lsin.', values: { fullName, email } }));
    }

    if (!email.includes('@')) {
      return res.status(400).send(renderRegister({ user: req.user, error: 'Email manzilni to‘g‘ri kiriting.', values: { fullName, email } }));
    }

    if (password.length < 6) {
      return res.status(400).send(renderRegister({ user: req.user, error: 'Parol kamida 6 ta belgidan iborat bo‘lsin.', values: { fullName, email } }));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    await query(
      'INSERT INTO users (id, full_name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, fullName, email, passwordHash]
    );

    signUserCookie(res, id);
    return res.redirect('/rules');
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).send(renderRegister({
        user: req.user,
        error: 'Bu email bilan foydalanuvchi allaqachon ro‘yxatdan o‘tgan.',
        values: { fullName: req.body.fullName, email: req.body.email }
      }));
    }

    return next(error);
  }
});

authRouter.get('/login', (req, res) => {
  if (req.user && !req.isAdmin) return res.redirect('/quizzes');
  res.send(renderLogin({ user: req.user }));
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).send(renderLogin({ user: req.user, error: 'Email yoki parol noto‘g‘ri.', values: { email } }));
    }

    signUserCookie(res, user.id);
    return res.redirect('/quizzes');
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/admin/login', (req, res) => {
  if (req.isAdmin) return res.redirect('/admin');
  res.send(renderAdminLogin({ user: req.user }));
});

authRouter.post('/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username !== config.admin.username || password !== config.admin.password) {
    return res.status(401).send(renderAdminLogin({ user: req.user, error: 'Admin login yoki parol noto‘g‘ri.' }));
  }

  signAdminCookie(res);
  return res.redirect('/admin');
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.redirect('/login');
});

function renderRegister({ user, error = '', values = {} }) {
  return layout({
    title: 'Register',
    user,
    active: 'register',
    body: `
      <section class="auth-shell">
        <div>
          <p class="eyebrow">Start</p>
          <h1>Quiz test yaratish uchun akkaunt oching.</h1>
          <p class="muted">Yaratilgan testlar, javoblar va natijalar foydalanuvchi profilingizga bog‘lanadi.</p>
        </div>
        <form class="panel auth-card" method="post" action="/register">
          <label>
            <span>Ism familiya</span>
            <input name="fullName" required autocomplete="name" value="${escapeHtml(values.fullName || '')}">
          </label>
          <label>
            <span>Email</span>
            <input type="email" name="email" required autocomplete="email" value="${escapeHtml(values.email || '')}">
          </label>
          <label>
            <span>Parol</span>
            <input type="password" name="password" required autocomplete="new-password" minlength="6">
          </label>
          ${fieldError(error)}
          <button class="button full" type="submit">Register</button>
          <p class="form-foot">Akkauntingiz bormi? <a href="/login">Login</a></p>
        </form>
      </section>
    `
  });
}

function renderLogin({ user, error = '', values = {} }) {
  return layout({
    title: 'Login',
    user,
    active: 'login',
    body: `
      <section class="auth-shell">
        <div>
          <p class="eyebrow">Welcome back</p>
          <h1>Login qiling va quizlaringizni davom ettiring.</h1>
          <p class="muted">Fayldan test yaratish, natijalarni saqlash va avvalgi quizlarni ko‘rish uchun kirish kerak.</p>
        </div>
        <form class="panel auth-card" method="post" action="/login">
          <label>
            <span>Email</span>
            <input type="email" name="email" required autocomplete="email" value="${escapeHtml(values.email || '')}">
          </label>
          <label>
            <span>Parol</span>
            <input type="password" name="password" required autocomplete="current-password">
          </label>
          ${fieldError(error)}
          <button class="button full" type="submit">Login</button>
          <p class="form-foot">Akkaunt yo‘qmi? <a href="/register">Register</a></p>
          <p class="form-foot subtle"><a href="/admin/login">Admin panel</a></p>
        </form>
      </section>
    `
  });
}

function renderAdminLogin({ user, error = '' }) {
  return layout({
    title: 'Admin Login',
    user,
    body: `
      <section class="auth-shell compact">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Boshqaruv paneliga kirish.</h1>
          <p class="muted">Default login: <strong>admin</strong>, parol: <strong>admin123</strong>.</p>
        </div>
        <form class="panel auth-card" method="post" action="/admin/login">
          <label>
            <span>Login</span>
            <input name="username" required autocomplete="username">
          </label>
          <label>
            <span>Parol</span>
            <input type="password" name="password" required autocomplete="current-password">
          </label>
          ${fieldError(error)}
          <button class="button full" type="submit">Admin panelga kirish</button>
        </form>
      </section>
    `
  });
}
