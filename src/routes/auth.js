import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { clearAuthCookie, signAdminCookie, signUserCookie } from '../middleware/auth.js';
import { escapeHtml, fieldError, layout } from '../utils/html.js';

export const authRouter = express.Router();
const authAttempts = new Map();
const passwordPolicy = {
  minLength: 8,
  pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
};

authRouter.get('/register', (req, res) => {
  if (req.user && !req.isAdmin) return res.redirect('/rules');
  res.send(renderRegister({ user: req.user }));
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const fullName = normalizeName(req.body.fullName);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const clientKey = getClientKey(req, email || 'register');

    if (isRateLimited(clientKey)) {
      return res.status(429).send(renderRegister({ user: req.user, error: 'Juda ko‘p urinish. Bir necha daqiqadan keyin qayta urinib ko‘ring.', values: { fullName, email } }));
    }

    if (fullName.length < 2) {
      recordFailedAttempt(clientKey);
      return res.status(400).send(renderRegister({ user: req.user, error: 'Ism kamida 2 ta belgidan iborat bo‘lsin.', values: { fullName, email } }));
    }

    if (!isValidEmail(email)) {
      recordFailedAttempt(clientKey);
      return res.status(400).send(renderRegister({ user: req.user, error: 'Email manzilni to‘g‘ri kiriting.', values: { fullName, email } }));
    }

    if (!passwordPolicy.pattern.test(password)) {
      recordFailedAttempt(clientKey);
      return res.status(400).send(renderRegister({ user: req.user, error: 'Parol kamida 8 ta belgi, kamida 1 harf va 1 raqamdan iborat bo‘lsin.', values: { fullName, email } }));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    const created = await query(
      'INSERT INTO users (id, full_name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, fullName, email, passwordHash]
    ).then(() => query('SELECT id, session_version FROM users WHERE id = $1', [id])
    );

    clearFailedAttempts(clientKey);
    signUserCookie(res, created.rows[0]);
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
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const clientKey = getClientKey(req, email || 'login');

    if (isRateLimited(clientKey)) {
      return res.status(429).send(renderLogin({ user: req.user, error: 'Juda ko‘p urinish. Bir necha daqiqadan keyin qayta urinib ko‘ring.', values: { email } }));
    }

    if (!isValidEmail(email)) {
      recordFailedAttempt(clientKey);
      return res.status(401).send(renderLogin({ user: req.user, error: genericLoginError(), values: { email } }));
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).send(renderLogin({ user: req.user, error: 'Akkaunt vaqtincha bloklangan. Bir necha daqiqadan keyin qayta urinib ko‘ring.', values: { email } }));
    }

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      recordFailedAttempt(clientKey);
      if (user) {
        await recordFailedLogin(user);
      }
      return res.status(401).send(renderLogin({ user: req.user, error: genericLoginError(), values: { email } }));
    }

    await query(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    clearFailedAttempts(clientKey);
    signUserCookie(res, user);
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
      <section class="auth-page">
        <aside class="auth-intro">
          <span class="auth-kicker">Quiz Test AI</span>
          <h1>Akkaunt yarating va testlaringizni saqlang.</h1>
          <p>Fayl yuklash, AI orqali quiz yaratish, natijalar tarixi va public testlarni ishlash uchun shaxsiy profil kerak.</p>
          <div class="auth-points">
            <span>AI file-to-quiz converter</span>
            <span>Public quiz sharing</span>
            <span>Saved attempts</span>
          </div>
        </aside>

        <form class="auth-card-pro" method="post" action="/register">
          <div class="auth-card-head">
            <p class="eyebrow">Register</p>
            <h2>Yangi akkaunt</h2>
            <p>Ma'lumotlaringizni kiriting. Keyin darhol quiz yaratishni boshlashingiz mumkin.</p>
          </div>
          <label class="input-group">
            <span>Ism familiya</span>
            <input name="fullName" required autocomplete="name" placeholder="Masalan: Akmal Nizomov" value="${escapeHtml(values.fullName || '')}">
          </label>
          <label class="input-group">
            <span>Email</span>
            <input type="email" name="email" required autocomplete="email" placeholder="you@example.com" value="${escapeHtml(values.email || '')}">
          </label>
          <label class="input-group">
            <span>Parol</span>
            <div class="password-field">
              <input type="password" name="password" required autocomplete="new-password" minlength="8" placeholder="Kamida 8 belgi, harf va raqam">
              <button type="button" data-toggle-password>Show</button>
            </div>
            <small>Kamida 8 ta belgi, 1 harf va 1 raqam.</small>
          </label>
          ${fieldError(error)}
          <button class="button full auth-submit" type="submit">Akkaunt yaratish</button>
          <p class="form-foot">Akkauntingiz bormi? <a href="/login">Login qiling</a></p>
        </form>
      </section>
      <script src="/assets/auth.js" defer></script>
    `
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function genericLoginError() {
  return 'Email yoki parol noto‘g‘ri.';
}

function getClientKey(req, scope) {
  return `${req.ip || req.socket?.remoteAddress || 'unknown'}:${scope}`;
}

function isRateLimited(key) {
  const item = authAttempts.get(key);
  if (!item) return false;
  if (item.blockedUntil && item.blockedUntil > Date.now()) return true;
  if (item.blockedUntil && item.blockedUntil <= Date.now()) {
    authAttempts.delete(key);
  }
  return false;
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const item = authAttempts.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
  const fresh = now - item.firstAt > 10 * 60 * 1000
    ? { count: 1, firstAt: now, blockedUntil: 0 }
    : { ...item, count: item.count + 1 };

  if (fresh.count >= 8) {
    fresh.blockedUntil = now + 10 * 60 * 1000;
  }

  authAttempts.set(key, fresh);
}

function clearFailedAttempts(key) {
  authAttempts.delete(key);
}

async function recordFailedLogin(user) {
  const nextCount = Number(user.failed_login_count || 0) + 1;
  const lockedUntil = nextCount >= 6 ? new Date(Date.now() + 10 * 60 * 1000) : null;

  await query(
    `UPDATE users
     SET failed_login_count = $1,
         locked_until = $2
     WHERE id = $3`,
    [nextCount, lockedUntil, user.id]
  );
}

function renderLogin({ user, error = '', values = {} }) {
  return layout({
    title: 'Login',
    user,
    active: 'login',
    body: `
      <section class="auth-page">
        <aside class="auth-intro">
          <span class="auth-kicker">Welcome back</span>
          <h1>Quizlaringizga qayting.</h1>
          <p>Yaratilgan quizlar, public testlar va urinishlar tarixiga kirish uchun login qiling.</p>
          <div class="auth-stats">
            <div><strong>30s</strong><span>har savol uchun</span></div>
            <div><strong>JSON</strong><span>AI converter</span></div>
            <div><strong>Public</strong><span>share links</span></div>
          </div>
        </aside>

        <form class="auth-card-pro" method="post" action="/login">
          <div class="auth-card-head">
            <p class="eyebrow">Login</p>
            <h2>Akkauntga kirish</h2>
            <p>Email va parolingiz bilan tizimga kiring.</p>
          </div>
          <label class="input-group">
            <span>Email</span>
            <input type="email" name="email" required autocomplete="email" placeholder="you@example.com" value="${escapeHtml(values.email || '')}">
          </label>
          <label class="input-group">
            <span>Parol</span>
            <div class="password-field">
              <input type="password" name="password" required autocomplete="current-password" placeholder="Parolingiz">
              <button type="button" data-toggle-password>Show</button>
            </div>
          </label>
          ${fieldError(error)}
          <button class="button full auth-submit" type="submit">Login</button>
          <p class="form-foot">Akkaunt yo‘qmi? <a href="/register">Register</a></p>
          <p class="form-foot subtle"><a href="/admin/login">Admin panelga kirish</a></p>
        </form>
      </section>
      <script src="/assets/auth.js" defer></script>
    `
  });
}

function renderAdminLogin({ user, error = '' }) {
  return layout({
    title: 'Admin Login',
    user,
    body: `
      <section class="auth-page compact">
        <aside class="auth-intro">
          <span class="auth-kicker">Admin</span>
          <h1>Boshqaruv paneli.</h1>
          <p>Foydalanuvchilar, quizlar va umumiy statistikani nazorat qilish uchun admin akkaunt.</p>
        </aside>
        <form class="auth-card-pro" method="post" action="/admin/login">
          <div class="auth-card-head">
            <p class="eyebrow">Admin Login</p>
            <h2>Admin panel</h2>
            <p>Default: <strong>admin</strong> / <strong>admin123</strong></p>
          </div>
          <label class="input-group">
            <span>Login</span>
            <input name="username" required autocomplete="username" placeholder="admin">
          </label>
          <label class="input-group">
            <span>Parol</span>
            <div class="password-field">
              <input type="password" name="password" required autocomplete="current-password" placeholder="Admin parol">
              <button type="button" data-toggle-password>Show</button>
            </div>
          </label>
          ${fieldError(error)}
          <button class="button full auth-submit" type="submit">Admin panelga kirish</button>
          <p class="form-foot"><a href="/login">User login</a></p>
        </form>
      </section>
      <script src="/assets/auth.js" defer></script>
    `
  });
}
