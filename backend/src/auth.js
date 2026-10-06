import crypto from 'node:crypto';
import db from './db.js';

const SESSION_COOKIE = 'pass_session';
// Сессия продлевается при каждом запросе; после 12 часов бездействия нужно войти заново
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const PERMISSIONS = {
  register: 'can_register',
  journal: 'can_view_journal',
  admin: 'is_admin',
};

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function readSessionToken(req) {
  const cookies = req.headers.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function setSessionCookie(res, token, maxAgeMs) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`
  );
}

export function publicUser(user) {
  return {
    id: user.id,
    login: user.login,
    full_name: user.full_name,
    can_register: Boolean(user.can_register || user.is_admin),
    can_view_journal: Boolean(user.can_view_journal || user.is_admin),
    is_admin: Boolean(user.is_admin),
    institution_name: user.institution_name,
  };
}

// Учреждение, которым ограничен доступ пользователя к визитам; null — без ограничений (администратор)
export function institutionScope(user) {
  return user.is_admin ? null : user.institution_name;
}

export function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    Date.now() + SESSION_TTL_MS
  );
  setSessionCookie(res, token, SESSION_TTL_MS);
}

export function endSession(req, res) {
  const token = readSessionToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setSessionCookie(res, '', 0);
}

export function endUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Пользователь текущего запроса (или null); заодно продлевает сессию
export function getSessionUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = db
    .prepare(
      `SELECT users.*, sessions.expires_at FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND users.is_active = 1`
    )
    .get(tokenHash);
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + SESSION_TTL_MS, tokenHash);
  return row;
}

/**
 * Middleware: пропускает вошедшего пользователя, у которого есть хотя бы одно из прав
 * (администратору доступно всё). Без аргументов — любой вошедший пользователь.
 */
export function requireAuth(...permissions) {
  return (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Войдите в систему' });
    const allowed =
      user.is_admin || permissions.length === 0 || permissions.some((p) => user[PERMISSIONS[p]]);
    if (!allowed) return res.status(403).json({ error: 'Недостаточно прав' });
    req.user = user;
    next();
  };
}

// Разные права на чтение (GET) и изменение (остальные методы)
export function requireByMethod({ read, write }) {
  const readGuard = requireAuth(...read);
  const writeGuard = requireAuth(...write);
  return (req, res, next) => (req.method === 'GET' ? readGuard : writeGuard)(req, res, next);
}

export function isAdminConfigured() {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE is_admin = 1 AND is_active = 1').get());
}

/**
 * Администратор один на все посты — его вход задаётся в .env (ADMIN_LOGIN, ADMIN_PASSWORD_HASH),
 * а не через интерфейс: на посту никто не может создать себе права администратора.
 * При запуске учётная запись администратора в базе приводится в соответствие с .env.
 * Если хеш в .env не задан, остаётся администратор, уже записанный в базе (если он есть).
 */
export function syncAdminFromEnv() {
  const login = process.env.ADMIN_LOGIN?.trim() || 'admin';
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (!passwordHash) {
    if (!isAdminConfigured()) {
      console.warn(
        'Администратор не настроен: задайте ADMIN_PASSWORD_HASH в backend/.env (команда: npm run admin -- set-password)'
      );
    }
    return;
  }
  if (!passwordHash.startsWith('scrypt:')) {
    console.warn('ADMIN_PASSWORD_HASH в backend/.env имеет неверный формат — получите его командой npm run admin');
    return;
  }

  const existing = db.prepare('SELECT * FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO users (login, full_name, password_hash, can_register, can_view_journal, is_admin)
       VALUES (?, 'Администратор', ?, 1, 1, 1)`
    ).run(login, passwordHash);
    return;
  }
  if (existing.login !== login || existing.password_hash !== passwordHash || !existing.is_active) {
    db.prepare('UPDATE users SET login = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(
      login,
      passwordHash,
      existing.id
    );
    // Пароль администратора сменился — старые входы больше не действуют
    endUserSessions(existing.id);
  }
}
