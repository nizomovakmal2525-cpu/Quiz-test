import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export async function attachUser(req, _res, next) {
  const token = req.cookies?.[config.authCookie];
  req.user = null;
  req.isAdmin = false;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);

    if (payload.role === 'admin') {
      req.isAdmin = true;
      req.user = {
        id: 'admin',
        full_name: 'Admin',
        email: 'admin@local'
      };
      return next();
    }

    const result = await query(
      'SELECT id, full_name, email, session_version, created_at FROM users WHERE id = $1',
      [payload.sub]
    );
    if (result.rows[0] && Number(payload.sv || 0) !== Number(result.rows[0].session_version || 0)) {
      req.user = null;
      return next();
    }
    req.user = result.rows[0] || null;
  } catch (_error) {
    req.user = null;
  }

  return next();
}

export function requireUser(req, res, next) {
  if (!req.user || req.isAdmin) {
    return res.redirect('/login');
  }

  return next();
}

export function requireAnyUser(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }

  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.redirect('/admin/login');
  }

  return next();
}

export function signUserCookie(res, user) {
  const userId = typeof user === 'string' ? user : user.id;
  const sessionVersion = typeof user === 'string' ? 1 : Number(user.session_version || 1);
  const token = jwt.sign({ sub: userId, role: 'user', sv: sessionVersion }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(config.authCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function signAdminCookie(res) {
  const token = jwt.sign({ sub: 'admin', role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
  res.cookie(config.authCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 12 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(config.authCookie);
}
